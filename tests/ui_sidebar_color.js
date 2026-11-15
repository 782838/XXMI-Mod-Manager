/**
 * ui_sidebar_color.js —— 侧栏角色行的颜色语义回归
 *
 * 用户实测反馈（v1.5.78）:
 *   「软件内这种只启用一个为什么会报黄」
 * 截图里 刻律德菈 ×12 12/12、功能 ×2 2/2、卡芙卡 ×9 1/9、大丽花 ×3 1/3 ... 全是黄字。
 *
 * 根因: `.navi.multi .cnt{color:var(--warn)}` —— 用**警示黄**去标「这个角色有多套 mod」。
 * 但「多套」是正常状态(同角色准备多套时装本来就要能选), 跟「启用几个」毫无关系,
 * 用户看到一排黄字自然会以为出问题了。
 *
 * 现在的语义:
 *   · multi(有多套)      -> --info 中性蓝, 只表示"有多个可选"
 *   · hasconf(多套同时启用, 会互相覆盖) -> --warn 警示黄, 这才是真该提醒的
 *
 * 本测试断言这两条不再被改回去。
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

// ---------- 1. 静态: 样式语义 ----------
// v1.5.80 修正: 「多套」**不给任何颜色**(用户反馈「一个没开也是蓝色的是啥意思」)。
// 蓝色(--accent2)只属于 .navi.on ——「你正在看这一行」。
// 唯一的颜色警示是 hasconf(多套同时启用, hash 会互相覆盖)。
const noMultiColor = !/\.navi\.multi\s+\.cnt\s*\{[^}]*color\s*:/.test(UI);
const cssConf = /\.navi\.hasconf\s+\.cnt\s*\{[^}]*color\s*:\s*var\(--warn\)/.test(UI);
const cssOn = /\.navi\.on\s+\.cnt\s*\{[^}]*color\s*:\s*var\(--accent2\)/.test(UI);

ck('「多套」不再有任何专门颜色', noMultiColor, noMultiColor ? '无专门着色' : '仍在着色');
ck('蓝色只给「正在看这一行」(.navi.on)', cssOn);
ck('hasconf 用警示黄', cssConf, cssConf ? 'var(--warn)' : '未匹配');

// --info 必须在三套主题里都有值, 否则颜色会 fallback 成继承色
const infoDefs = (UI.match(/--info\s*:\s*[^;]+;/g) || []).length;
ck('--info 在三套主题里都有定义', infoDefs >= 3, infoDefs + ' 处');

// ---------- 2. 渲染: class 真的会挂上去 ----------
const mkE = (id, char, on) => ({id, name:id, char, chars:[char], category:'CatA',
  enabled:on, size:1e6, size_h:'1.0 MB', files:3, has_ini:true, hashes:['a'],
  partial:false, conflict:0, pinned:false, usage:1, thumb:null, variants:0,
  cycles:[], components:[], mtime:1, is_dir:true});

const STATE = {
  ok: true, version: '1.5.78', theme: 'dark', lang: 'zh',
  // SoloChar: 只有 1 套, 且已启用 -> 不该有 multi, 更不该黄
  // MultiChar: 3 套, 只启用 1 套, 无冲突 -> multi 有, hasconf 无
  // ConfChar: 2 套都启用, 有冲突 -> hasconf 有(该黄)
  stats: { total: 6, enabled: 4, disabled: 2, pinned: 0, chars: 3, multi_chars: 2 },
  categories: [],
  chars: [
    { name: 'SoloChar', count: 1, enabled: 1, pinned: false, multi: false, hasconf: false },
    { name: 'MultiChar', count: 3, enabled: 1, pinned: false, multi: true, hasconf: false },
    { name: 'ConfChar', count: 2, enabled: 2, pinned: false, multi: true, hasconf: true },
  ],
  entries: [
    mkE('c1', 'SoloChar', true),
    mkE('c2', 'MultiChar', true),
    mkE('c3', 'MultiChar', false),
    mkE('c4', 'MultiChar', false),
    mkE('c5', 'ConfChar', true),
    mkE('c6', 'ConfChar', true),
  ],
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
  // ConfChar 的两套都启用 -> 真冲突。列表要给出, 侧栏才会挂 hasconf(黄)
  conflicts: [{ a_name:'c5', b_name:'c6', a_char:'ConfChar', b_char:'ConfChar',
                n: 3, same_char: true, b: 'c6' }],
};

const dom = new JSDOM(UI.replace('__BOOT__', JSON.stringify({ token: 't', version: '1.5.78' })), {
  runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://127.0.0.1:9/',
  beforeParse(w) {
    w.requestAnimationFrame = cb => setTimeout(() => cb(Date.now()), 16);
    w.fetch = (u) => {
      const url = String(u);
      let p = { ok: true };
      if (url.includes('/api/state')) p = STATE;
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
  await sleep(1200);
  try { w.renderChars && w.renderChars(); } catch (e) {}
  await sleep(300);

  const rows = {};
  d.querySelectorAll('#chars .navi.sub').forEach(el => {
    const nm = el.querySelector('.nm');
    if (nm) rows[nm.textContent.trim()] = el;
  });

  ck('侧栏渲染出 3 个角色行', Object.keys(rows).length === 3, Object.keys(rows).join(','));

  const solo = rows['SoloChar'], multi = rows['MultiChar'], conf = rows['ConfChar'];
  ck('SoloChar 行存在', !!solo);
  ck('MultiChar 行存在', !!multi);
  ck('ConfChar 行存在', !!conf);

  if (solo) {
    ck('只有 1 套的角色没有 multi 类', !solo.classList.contains('multi'));
    ck('只有 1 套的角色没有 hasconf 类', !solo.classList.contains('hasconf'));
    const cnt = solo.querySelector('.cnt');
    ck('只有 1 套的角色不显示 ×N', cnt && !(cnt.textContent || '').includes('×'),
       cnt && cnt.textContent.trim());
  }

  if (multi) {
    ck('多套角色有 multi 类', multi.classList.contains('multi'));
    ck('多套但无冲突 -> 没有 hasconf(不该黄)', !multi.classList.contains('hasconf'));
    const cnt = multi.querySelector('.cnt');
    ck('多套角色显示 ×3', cnt && (cnt.textContent || '').includes('×3'),
       cnt && cnt.textContent.trim());
    ck('计数仍是 1/3(只启用一个)', cnt && (cnt.textContent || '').includes('1/3'),
       cnt && cnt.textContent.trim());
    const ttl = multi.getAttribute('title') || '';
    ck('多套无冲突时 title 说的是"有几套"', ttl.includes('3') && !ttl.includes('覆盖'), ttl);
  }

  if (conf) {
    ck('有冲突的角色有 hasconf 类', conf.classList.contains('hasconf'));
    const ttl = conf.getAttribute('title') || '';
    ck('有冲突时 title 提示会互相覆盖', ttl.includes('覆盖'), ttl);
  }

  console.log('\nPASS ' + PASS.length + ' / FAIL ' + FAIL.length);
  if (FAIL.length) { console.log('失败项:'); FAIL.forEach(x => console.log('  - ' + x)); }
  process.exit(FAIL.length ? 1 : 0);
})();
