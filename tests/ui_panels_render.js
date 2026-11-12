/**
 * ui_panels_render.js —— 防「弹窗永远卡在加载中」的回归测试
 *
 * 起因(v1.5.76 实测 bug): `openLib()` 里写了 `tops.map(t => ...)`, 形参 `t`
 * 遮蔽了全局翻译函数 `t()`, 一调用就抛 "t is not a function", 整个函数在
 * 赋值 `innerHTML` 之前中断 —— 用户看到的只有那句「统计仓库中…」的转圈,
 * 永远不消失。
 *
 * 这类 bug 的特点是:
 *   - node --check 完全查不出(语法合法)
 *   - 打开别的面板都正常, 只有这一个坏
 *   - 控制台不报错(异常在 async 里被吞)
 *
 * 所以这里对每个「先打加载中、再请求、再 fill innerHTML」的面板逐个实测:
 * 调它的打开函数 → 断言 ①没抛异常 ②内容真的换了 ③不再含加载中的文案。
 *
 * 用法: node tests/ui_panels_render.js
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = process.cwd();
const UI = fs.readFileSync(path.join(ROOT, 'ui.html'), 'utf8');
const BOOT = { token: 't', version: '1.5.76' };

const PASS = [], FAIL = [];
function ck(name, cond, extra) {
  (cond ? PASS : FAIL).push(name);
  console.log((cond ? '  ok   ' : '  FAIL ') + name + (extra !== undefined ? ' | ' + extra : ''));
}

const mkE = (id, char, cat, on) => ({id, name:id, char, chars:[char], category:cat,
  enabled:on, size:1e6, size_h:'1.0 MB', files:3, has_ini:true, hashes:['a'],
  partial:false, conflict:0, pinned:false, usage:1, thumb:null, variants:0,
  cycles:[], components:[], mtime:1, is_dir:true});

const STATE = {
  ok: true, version: '1.5.76', theme: 'dark', lang: 'zh',
  stats: { total: 3, enabled: 2, disabled: 1, pinned: 0, chars: 1, multi_chars: 1 },
  categories: [], chars: [{name:'CharA', count:2, multi:true, pinned:false}],
  entries: [mkE('c1','CharA','CatA',true), mkE('c2','CharA','CatA',false)],
  presets: [], libraries: [],
  mods_dir: 'X:/m', mods_dir_exists: true, configured: true, xxmi_root: 'X:/XXMI',
  scan_seconds: 0.1, hotkey: 'F9', hotkey_ok: true, thumb_pending: 0,
  game_running: false, launcher_running: false, detect: { done: true, step: '' },
  photo_on: true, photo_hotkey: 'Ctrl+Shift+C', photo_mouse_btn: 1, photo_seconds: 3,
  photo_dir: 'X:/p', photo_dir_custom: false, photo_dir_default: 'X:/p',
  photo_burst: { burst_id: 0, frames: [], tiers: [], pending: false },
  photo_press_seq: 0, photo_press_pending: false, photo_scroll_buffer: false,
  games: [], games_visible: [], enabled_games: [],
  active_game: 'zzmi', views: {}, game_label: 'X',
  conflicts: [{a_name:'A', b_name:'B', a_char:'Ca', b_char:'Cb', n:2, same_char:false, b:'c2'}],
};

// 仓库接口: 关键 —— mods_top 里必须有条目, 才能走到那个会崩的 map
const LIBRARY = {
  ok: true,
  libraries: [{ name:'1a分类整合', path:'F:\\MOD\\ZZMI\\1a分类整合',
    items:[{name:'1a秘密', size:68088603329, size_h:'63.4 GB', files:16404, disabled:false}],
    count:1, abs:true, ref:'abs:F:\\MOD\\ZZMI\\1a分类整合', exists:true }],
  mods_top: [{name:'1aMOD', disabled:false}, {name:'1a功能', disabled:true}],
  root: 'F:\\MOD', mods_dir: 'F:\\MOD\\ZZMI\\Mods',
};

// 注意: cycles 在**顶层** d.cycles, 不在 d.entry 里 —— openDetail 读的是 d.cycles
const DETAIL = { ok: true, subs: [], similar: [],
  cycles: [{var:'v1', label:'L', label_cn:'', keys:['Ctrl+K'], values:['0','1'],
            current:0, switchable:true}],
  entry: Object.assign(mkE('c1','CharA','CatA',true), {
    path:'X:/m/c1', size_h:'1.0 MB', files:3, ini:1, sub_dirs:[], groups:[], components:[],
    hashes:['a0a'], backup_inis:[], thumbs:['p.png'], char_auto:'CharA', char_manual:'',
    usage:1700000000, mtime:1700000000, last_used:1700000000 }) };

const dom = new JSDOM(UI.replace('__BOOT__', JSON.stringify(BOOT)), {
  runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://127.0.0.1:9/',
  beforeParse(w) {
    w.requestAnimationFrame = cb => setTimeout(() => cb(Date.now()), 16);
    w.fetch = (u) => {
      const url = String(u);
      let p = { ok: true };
      if (url.includes('/api/library')) p = LIBRARY;
      else if (url.includes('/api/state')) p = STATE;
      else if (url.includes('/api/detail')) p = DETAIL;
      else if (url.includes('/api/config')) p = { ok:true, msg:'ok', state: STATE };
      else if (url.includes('/api/thumb_progress')) p = { ok:true, pending:0 };
      else if (url.includes('/api/photo_ping')) p = { ok:true, burst_id:0,
        meta:{burst_id:0,frames:[],tiers:[],pending:false}, press_seq:0 };
      else if (url.includes('/api/lib_list')) p = { ok:true, mods_dir:'X:/m', libs:[], abs_libs:[], customs:[], top:[] };
      else if (url.includes('/api/cache_info')) p = { ok:true,
        scan_cache:{bytes:1024,files:1}, thumbs:{bytes:1024,files:1}, journal:{bytes:10},
        orphan_thumbs: 0 };
      return Promise.resolve({ ok:true, json:()=>Promise.resolve(p),
        text:()=>Promise.resolve(JSON.stringify(p)) });
    };
  },
});
const w = dom.window, d = w.document;
const sleep = ms => new Promise(r => setTimeout(r, ms));

/** 加载中的标志文案（任何一个出现 = 说明渲染没跑完） */
const LOADING = ['统计仓库中', '读取中', '加载中', '正在爬取', '正在请求', '正在取文件清单',
                 'lib.loadingStat', 'lib.loading'];

function stuck(sel) {
  const el = d.querySelector(sel);
  if (!el) return 'NO_ELEMENT';
  const html = el.innerHTML || '';
  const hit = LOADING.find(x => html.includes(x));
  return hit ? ('卡在「' + hit + '」') : null;
}

(async () => {
  await sleep(1000);

  // ---------- 1. 仓库面板（就是这次出 bug 的地方）----------
  let err = '';
  try { await w.openLib(); } catch (e) { err = e.message || String(e); }
  await sleep(500);
  ck('仓库面板 openLib 不抛异常', !err, err || '无异常');
  const libStuck = stuck('#libBody');
  ck('仓库面板不再卡在加载中', libStuck === null, libStuck || '已渲染');
  const libHtml = (d.querySelector('#libBody') || {}).innerHTML || '';
  ck('仓库面板渲染出了顶层分类', libHtml.includes('1aMOD'), libHtml.length + ' 字');
  ck('仓库面板渲染出了仓库条目', libHtml.includes('1a分类整合'));
  ck('仓库面板渲染出了操作按钮', libHtml.includes('移出到仓库'));

  // ---------- 2. 详情弹窗 ----------
  err = '';
  try { await w.openDetail('c1', true); } catch (e) { err = e.message || String(e); }
  await sleep(500);
  ck('详情弹窗不抛异常', !err, err || '无异常');
  const dtStuck = stuck('#dtBody');
  ck('详情弹窗不再卡在加载中', dtStuck === null, dtStuck || '已渲染');
  const dtHtml = (d.querySelector('#dtBody') || {}).innerHTML || '';
  ck('详情弹窗渲染出循环变体', dtHtml.includes('Ctrl') && dtHtml.includes('变体'), dtHtml.length + ' 字');

  // ---------- 3. 设置面板 ----------
  err = '';
  try { w.openSetup(); } catch (e) { err = e.message || String(e); }
  await sleep(400);
  ck('设置面板不抛异常', !err, err || '无异常');
  const setHtml = (d.querySelector('#setBody') || {}).innerHTML || '';
  ck('设置面板渲染出内容', setHtml.length > 200, setHtml.length + ' 字');

  // ---------- 4. 冲突弹窗 ----------
  err = '';
  try { w.showConflicts(); } catch (e) { err = e.message || String(e); }
  await sleep(300);
  ck('冲突弹窗不抛异常', !err, err || '无异常');
  const cfHtml = (d.querySelector('#setBody') || {}).innerHTML || '';
  ck('冲突弹窗渲染出内容', cfHtml.length > 50, cfHtml.length + ' 字');

  // ---------- 5. 全局：t() 绝不能被传成非字符串 ----------
  const tRes = w.eval('(function(){ try { return t({name:"x"}); } catch(e){ return "THROW:"+e.message; } })()');
  ck('t() 收到对象时不抛异常（有防呆）', typeof tRes === 'string' && !String(tRes).startsWith('THROW'), tRes);

  // ---------- 6. 全局：没有遗留的「t 形参 + t() 调用」写法 ----------
  const shadow = [];
  const re = /\.(map|forEach|filter|some|every|find|sort)\(\s*\(\s*t\s*[,)]/g;
  let m;
  const lines = UI.split('\n');
  lines.forEach((l, i) => {
    if (re.test(l)) shadow.push((i + 1) + ': ' + l.trim().slice(0, 90));
    re.lastIndex = 0;
  });
  ck('没有「形参叫 t」的回调', shadow.length === 0, shadow.join(' | ') || '无');

  console.log('\nPASS ' + PASS.length + ' / FAIL ' + FAIL.length);
  if (FAIL.length) { console.log('失败项:'); FAIL.forEach(x => console.log('  - ' + x)); }
  process.exit(FAIL.length ? 1 : 0);
})();
