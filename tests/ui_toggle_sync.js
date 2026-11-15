/**
 * ui_toggle_sync.js —— 「点启用后侧栏计数要立刻变」+「蓝色只表示正在看这一行」
 *
 * 用户实测反馈(v1.5.79, 截图):
 *   ① 「左边这个明显有延迟 我启用了还是0 除非重新扫描」
 *      刻律德菈 那一行显示 0/10, 点卡片启用后左边仍是旧数字。
 *   ② 「这是之前的时候一个没开也是蓝色的是啥意思啊 这个蓝色的判定标准是什么？」
 *      v1.5.79 把「有多套」标成 --info(蓝), 于是一个都没启用也是蓝的 —— 造成新歧义。
 *
 * 本测试锁住:
 *   · doToggle 之后 S.chars 的 enabled/count 当帧就该更新(不用等轮询/重扫)
 *   · renderChars 会从 entries 现场重算, 不吃 S.chars 的旧快照
 *   · 「多套」没有特殊颜色; 蓝色只属于 .navi.on(正在看这一行)
 *   · 真冲突仍然用黄
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = process.cwd();
const UI = fs.readFileSync(path.join(ROOT, 'ui.html'), 'utf8');

const PASS = [], FAIL = [];
function ck(name, cond, extra) {
  (cond ? PASS : FAIL).push(name);
  console.log((cond ? '  ok   ' : '  FAIL ') + name + (extra !== undefined ? ' | ' + extra : ''));
}

// ---------- A. 静态: 颜色语义 ----------
const noMultiColor = !/\.navi\.multi\s+\.cnt\s*\{[^}]*color\s*:/.test(UI);
const hasConfWarn = /\.navi\.hasconf\s+\.cnt\s*\{[^}]*color\s*:\s*var\(--warn\)/.test(UI);
const onBlue = /\.navi\.on\s+\.cnt\s*\{[^}]*color\s*:\s*var\(--accent2\)/.test(UI);

ck('「多套」不再有任何专门颜色', noMultiColor, noMultiColor ? '无 .navi.multi .cnt 着色' : '仍在着色');
ck('蓝色只给「正在看这一行」(.navi.on)', onBlue);
ck('真冲突仍用警示黄', hasConfWarn);

// ---------- B. 静态: renderChars 会现场重算 ----------
ck('renderChars 从 entries 重算计数',
   /function renderChars\(\)\{[\s\S]{0,1400}?S\.entries/.test(UI),
   '找到 entries 重算');
ck('doToggle 会同步 touched 角色', /touched\.add\(e\.char\)/.test(UI));
ck('doToggle 会更新 S.chars', /S\.chars\.forEach/.test(UI));

// ---------- C. 运行时: 点启用后计数当帧变化 ----------
const mkE = (id, char, on) => ({id, name:id, char, chars:[char], category:'1aMOD',
  enabled:on, size:1e6, size_h:'1.0 MB', files:3, has_ini:true, hashes:['a'],
  partial:false, conflict:0, pinned:false, usage:1, thumb:null, variants:0,
  cycles:[], components:[], mtime:1, is_dir:true});

// 照用户截图造数据: 刻律德菈 10 个 mod 全禁用(0/10), 另有卡芙卡 9 套只开 1
const entries = [];
for (let i = 1; i <= 10; i++) entries.push(mkE('kelv-' + i, '刻律德菈', false));
for (let i = 1; i <= 9; i++) entries.push(mkE('kafka-' + i, '卡芙卡', i === 1));

const STATE = {
  ok: true, version: '1.5.80', theme: 'dark', lang: 'zh',
  stats: { total: 19, enabled: 1, disabled: 18, pinned: 0, chars: 2, multi_chars: 2, conflicts: 0 },
  categories: [],
  chars: [
    { name: '刻律德菈', count: 10, enabled: 0, pinned: false, multi: true, hasconf: false },
    { name: '卡芙卡', count: 9, enabled: 1, pinned: false, multi: true, hasconf: false },
  ],
  entries: entries,
  conflicts: [],
  presets: {}, libraries: [],
  mods_dir: 'X:/m', mods_dir_exists: true, configured: true, xxmi_root: 'X:/XXMI',
  scan_seconds: 0.1, hotkey: 'F9', hotkey_ok: true, thumb_pending: 0,
  game_running: false, launcher_running: false, detect: { done: true, step: '' },
  photo_on: true, photo_hotkey: 'Ctrl+Shift+C', photo_mouse_btn: 1, photo_seconds: 3,
  photo_dir: 'X:/p', photo_dir_custom: false, photo_dir_default: 'X:/p',
  photo_burst: { burst_id: 0, frames: [], tiers: [], pending: false },
  photo_press_seq: 0, photo_press_pending: false, photo_scroll_buffer: false,
  games: [], games_visible: [], enabled_games: [],
  active_game: 'zzmi', views: {}, game_label: 'X',
};

const dom = new JSDOM(UI.replace('__BOOT__', JSON.stringify({ token: 't', version: '1.5.80' })), {
  runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://127.0.0.1:9/',
  beforeParse(w) {
    w.requestAnimationFrame = cb => setTimeout(() => cb(Date.now()), 16);
    w.fetch = (u, opt) => {
      const url = String(u);
      let p = { ok: true };
      if (url.includes('/api/state')) p = STATE;
      else if (url.includes('/api/toggle')) {
        // 模拟后端: 真的把 enabled 落到 state 上再回传(这样连点几次不会互相覆盖)。
        // 但**故意不更新 chars 的计数** —— 就是要验证侧栏不依赖后端那份快照。
        let body = {};
        try { body = JSON.parse((opt && opt.body) || '{}'); } catch (e) {}
        const ids = body.ids || [];
        const want = !!body.enabled;
        (STATE.entries || []).forEach(x => {
          if (ids.includes(x.id)) { x.enabled = want; x.dir_disabled = !want; }
        });
        p = { ok: true, msg: 'ok', state: JSON.parse(JSON.stringify(STATE)) };
      }
      else if (url.includes('/api/thumb_progress')) p = { ok: true, pending: 0 };
      else if (url.includes('/api/photo_ping')) p = { ok: true, burst_id: 0,
        meta: { burst_id: 0, frames: [], tiers: [], pending: false }, press_seq: 0 };
      else if (url.includes('/api/update_check')) p = { ok: true, update_available: false };
      return Promise.resolve({ ok: true, json: () => Promise.resolve(p),
        text: () => Promise.resolve(JSON.stringify(p)) });
    };
  },
});

const w = dom.window, d = w.document;
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  await sleep(1300);

  const rowText = name => {
    const rows = [...d.querySelectorAll('#chars .navi.sub')];
    const el = rows.find(r => (r.querySelector('.nm') || {}).textContent === name);
    return el ? (el.querySelector('.cnt') || {}).textContent.trim() : null;
  };

  ck('初始: 刻律德菈 显示 0/10', rowText('刻律德菈') === '×10 0/10', rowText('刻律德菈'));
  ck('初始: 卡芙卡 显示 1/9', rowText('卡芙卡') === '×9 1/9', rowText('卡芙卡'));

  // ---- 点其中一个刻律德菈卡片启用 ----
  await w.doToggle(['kelv-1'], true);
  await sleep(120);

  const after = rowText('刻律德菈');
  ck('点启用后: 侧栏立刻变成 1/10（不用重扫）', after === '×10 1/10', after);

  // 再把剩下的全开了
  await w.doToggle(['kelv-2','kelv-3','kelv-4','kelv-5','kelv-6','kelv-7','kelv-8','kelv-9','kelv-10'], true);
  await sleep(120);
  const full = rowText('刻律德菈');
  ck('全开后: 侧栏变成 10/10', full === '×10 10/10', full);

  // 关掉一个
  await w.doToggle(['kelv-1'], false);
  await sleep(120);
  const back = rowText('刻律德菈');
  ck('关掉一个后: 侧栏变成 9/10', back === '×10 9/10', back);

  // ---- 颜色 class ----
  const rows = [...d.querySelectorAll('#chars .navi.sub')];
  const kelv = rows.find(r => (r.querySelector('.nm') || {}).textContent === '刻律德菈');
  ck('多套角色不再挂 multi 的着色(仍可能挂 multi class, 但无专门 color)',
     noMultiColor, '由 CSS 断言保证');
  ck('非激活行的 class 里没有 on', !kelv.classList.contains('on'),
     [...kelv.classList].join(' '));

  // 点这一行使其激活 -> 才有 on(蓝)
  kelv.click();
  await sleep(150);
  const kelv2 = [...d.querySelectorAll('#chars .navi.sub')]
    .find(r => (r.querySelector('.nm') || {}).textContent === '刻律德菈');
  ck('点中该行后 class 含 on（蓝色＝正在看这行）', kelv2.classList.contains('on'),
     [...kelv2.classList].join(' '));

  console.log('\nPASS ' + PASS.length + ' / FAIL ' + FAIL.length);
  if (FAIL.length) { console.log('失败项:'); FAIL.forEach(x => console.log('  - ' + x)); }
  process.exit(FAIL.length ? 1 : 0);
})();
