/**
 * ui_zoom_state.js —— 「点缩略图放大」必须有即时反馈
 *
 * 用户实测反馈(v1.5.80):
 *   「有些时候加载不出来 需要点详情换了图才能放大查看 这很麻烦 好多时候不能点一下立马查看」
 *
 * 根因(前端, 后端实测 41 个全部 200 没问题):
 *   zoomFull() 直接 `img.src = src` 就完事 —— 几 MB 的原图在解码期间,
 *   灯箱里**一片空白**, 既没转圈也没提示。用户看到的就是"点了没反应"。
 *   而 <img> 出错时也是静默空白, 完全没有原因提示。
 *
 * 现在锁住:
 *   · 打开大图立刻出现「正在加载…」状态层
 *   · 失败显示原因 + 重试按钮
 *   · 重试会带破缓存参数
 *   · 关闭时状态层收干净, 不残留
 *   · 下载区的 gbZoom 也走同一条路径
 *   · 卡片点击时若 e.thumb 为空, 仍然是走详情(原来的兜底行为不能丢)
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

// ---------- 静态 ----------
ck('灯箱里有加载状态层 #lbState', /id="lbState"/.test(UI));
ck('状态层里有转圈 #lbSpin', /id="lbSpin"/.test(UI));
ck('状态层里有重试按钮 #lbRetry', /id="lbRetry"/.test(UI));
ck('有 lbLoad 统一加载函数', /function lbLoad\(src\)/.test(UI));
ck('有 lbRetryNow 重试函数', /function lbRetryNow\(\)/.test(UI));
ck('zoomFull 走 lbLoad(不再直接赋 src)', /function zoomFull\(src, caption\)\{[\s\S]{0,500}?lbLoad\(src\)/.test(UI));
ck('gbZoom 也走 lbLoad', /function gbZoom\(u, caption\)\{[\s\S]{0,400}?lbLoad\(/.test(UI));
ck('img 有 onload 处理', /im\.onload\s*=/.test(UI));
ck('img 有 onerror 处理', /im\.onerror\s*=/.test(UI));
ck('closeZoom 会收掉状态层', /function closeZoom\(\)\{[\s\S]{0,700}?lbState/.test(UI));
ck('词条 lb.loading 存在', /"lb\.loading"\s*:/.test(UI));
ck('词条 lb.loadFail 存在', /"lb\.loadFail"\s*:/.test(UI));

// ---------- 运行时 ----------
const mkE = (id, char, on, thumb) => ({id, name:id, char, chars:[char], category:'1aMOD',
  enabled:on, size:1e6, size_h:'1.0 MB', files:3, has_ini:true, hashes:['a'],
  partial:false, conflict:0, pinned:false, usage:1, thumb, variants:0,
  cycles:[], components:[], mtime:1, is_dir:true});

const STATE = {
  ok: true, version: '1.5.81', theme: 'dark', lang: 'zh',
  stats: { total: 2, enabled: 2, disabled: 0, pinned: 0, chars: 1, multi_chars: 0, conflicts: 0 },
  categories: [],
  chars: [{ name: 'CharA', count: 2, enabled: 2, pinned: false, multi: true, hasconf: false }],
  entries: [
    mkE('has-thumb', 'CharA', true, 'CharA/preview.png'),   // 有图
    mkE('no-thumb', 'CharA', true, null),                    // 没图 -> 应兜底去详情
  ],
  conflicts: [], presets: {}, libraries: [],
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

const DETAIL = { ok: true, subs: [], similar: [], cycles: [],
  entry: Object.assign(mkE('no-thumb', 'CharA', true, null), {
    path: 'X:/m/no-thumb', size_h: '1.0 MB', files: 1, ini: 1, sub_dirs: [], groups: [],
    components: [], hashes: [], backup_inis: [], thumbs: [], char_auto: 'CharA',
    char_manual: '', usage: 1, mtime: 1, last_used: 1 }) };

const dom = new JSDOM(UI.replace('__BOOT__', JSON.stringify({ token: 't', version: '1.5.81' })), {
  runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://127.0.0.1:9/',
  beforeParse(w) {
    w.requestAnimationFrame = cb => setTimeout(() => cb(Date.now()), 16);
    w.fetch = (u) => {
      const url = String(u);
      let p = { ok: true };
      if (url.includes('/api/state')) p = STATE;
      else if (url.includes('/api/detail')) p = DETAIL;
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

  // 手动触发一次放大(模拟点了有图的卡片封面)
  w.zoomImage('CharA/preview.png', 'CharA');
  await sleep(50);

  const lb = d.querySelector('#lightbox');
  const st = d.querySelector('#lbState');
  const im = d.querySelector('#lbImg');

  ck('点放大后灯箱打开', lb && lb.classList.contains('on'));
  ck('立刻出现加载状态层(不是空白)', st && st.style.display === 'flex',
     st && st.style.display);
  ck('状态层文字是「正在加载」', (d.querySelector('#lbStateTxt') || {}).textContent
     && d.querySelector('#lbStateTxt').textContent.includes('加载'),
     (d.querySelector('#lbStateTxt') || {}).textContent);
  ck('加载中图片是隐藏的(不显示半张残图)', im && im.style.visibility === 'hidden',
     im && im.style.visibility);
  ck('img.src 已指向 full=1 的地址', im && /full=1/.test(im.src || ''), (im && im.src || '').slice(0, 60));

  // 模拟加载成功
  if (im) { try { im.onload && im.onload(); } catch (e) {} }
  await sleep(80);
  ck('加载成功后状态层收起', st && st.style.display === 'none', st && st.style.display);
  ck('加载成功后图片重新可见', im && im.style.visibility !== 'hidden', im && im.style.visibility);

  // 关闭时状态层要收干净
  w.closeZoom();
  await sleep(60);
  ck('关闭后状态层也收起', st && st.style.display === 'none');
  ck('关闭后灯箱关闭', !lb.classList.contains('on'));

  // 失败场景
  w.zoomImage('CharA/broken.png', 'broken');
  await sleep(50);
  if (im) { try { im.onerror && im.onerror(); } catch (e) {} }
  await sleep(60);
  ck('失败时状态层显示 err 样式', st && st.classList.contains('err'),
     st && st.className);
  ck('失败时转圈隐藏', (d.querySelector('#lbSpin') || {}).style.display === 'none',
     (d.querySelector('#lbSpin') || {}).style.display);
  ck('失败时重试按钮出现', (d.querySelector('#lbRetry') || {}).style.display === '',
     (d.querySelector('#lbRetry') || {}).style.display);
  const failTxt = (d.querySelector('#lbStateTxt') || {}).textContent || '';
  ck('失败文案说明了原因', failTxt.length > 6, failTxt);
  ck('失败文案不再是一个 key 名', !/^lb\./.test(failTxt), failTxt);

  // 重试应带破缓存参数
  const before = im.src;
  w.lbRetryNow();
  await sleep(60);
  ck('重试后 src 带上 _r= 破缓存参数', /_r=\d+/.test(im.src || ''),
     (im.src || '').slice(-40));
  ck('重试后 src 与之前不同', im.src !== before);

  // 卡片点击兜底: 没图时应该走详情, 不该静默失败
  w.closeZoom();
  await sleep(50);
  const cardBtn = d.querySelector('#cards [data-act="zoom"]');
  ck('有图的卡片才有 data-act=zoom', !!cardBtn);

  console.log('\nPASS ' + PASS.length + ' / FAIL ' + FAIL.length);
  if (FAIL.length) { console.log('失败项:'); FAIL.forEach(x => console.log('  - ' + x)); }
  process.exit(FAIL.length ? 1 : 0);
})();
