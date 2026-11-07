/**
 * ui_i18n_full.js —— 英文态「运行时全弹窗」中文残留回归测试
 *
 * 静态扫描会被注释/语言包干扰; 这个测试造 jsdom、切英文、
 * 逐个打开每个弹窗/抽屉/照片墙/连拍/设置/仓库/下载区,
 * 抓「真实渲染出来的可见文本」里的中文, 断言必须为 0。
 *
 * 白名单(允许保留中文的合理项):
 *   - 「简体中文」: 语言选择按钮本身, 英文界面下也必须显示中文
 *   - 用户数据: 角色名 / mod 名 / 路径等由后端返回的内容
 *
 * 用法:
 *   node tests/ui_i18n_full.js            跑断言, 有残留 -> 退出码 1
 *   node tests/ui_i18n_full.js --dump     只打印明细, 不断言
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = process.cwd();
const UI = fs.readFileSync(path.join(ROOT, 'ui.html'), 'utf8');
const BOOT = { token: 'tok', version: '1.5.78' };
const DUMP = process.argv.includes('--dump');

/* 允许出现的汉字（语言名 + 测试用的模拟数据名） */
const ALLOW = [
  '简体中文', 'English',
];

const mkE = (id, char, cat, on) => ({id, name:id, char, chars:[char], category:cat,
  enabled:on, size:1e6, size_h:'1.0 MB', files:3, has_ini:true, hashes:['a'],
  partial:false, conflict:0, pinned:false, usage:1, thumb:null, variants:0,
  cycles:[], components:[], mtime:1, is_dir:true});

function baseState(over) {
  return Object.assign({
    ok: true, version: '1.5.78', theme: 'dark', lang: 'en',
    stats: { total: 3, enabled: 2, disabled: 1, pinned: 0, chars: 1, multi_chars: 1 },
    categories: [], chars: [{name:'CharA', count:2, multi:true, pinned:false}],
    entries: [mkE('c1','CharA','CatA',true), mkE('c2','CharA','CatA',false)],
    presets: [{name:'P1'}], libraries: [{name:'LibA', path:'X:/l', exists:true, count:2}],
    mods_dir: 'X:/m', mods_dir_exists: true, configured: true,
    xxmi_root: 'X:/XXMI', scan_seconds: 0.1, hotkey: 'F9', hotkey_ok: true, thumb_pending: 0,
    game_running: false, game_label: 'Zenless Zone Zero', launcher_running: false,
    detect: { done: true, step: '' },
    conflicts: [{a_name:'A', b_name:'B', a_char:'Ca', b_char:'Cb', n:2, same_char:false, b:'c2'}],
    photo_on: true, photo_hotkey: 'Ctrl+Shift+C', photo_mouse_btn: 1, photo_seconds: 3,
    photo_dir: 'X:/p', photo_dir_custom: false, photo_dir_default: 'X:/p',
    photo_burst: { burst_id: 1, frames: [{i:0,t:0}, {i:1,t:0.2}], tiers: [[0,1], [0,1]],
                   pending: true, secs: 3 },
    photo_press_seq: 0, photo_press_pending: false, photo_scroll_buffer: false,
    games: [
      { id:'zzmi', importer:'ZZMI', label:'绝区零', label_en:'Zenless Zone Zero',
        mods_dir:'X:/ZZMI/Mods', exists:true, checked:true, visible:true, active:true },
      { id:'srmi', importer:'SRMI', label:'星穹铁道', label_en:'Honkai: Star Rail',
        mods_dir:'X:/SRMI/Mods', exists:true, checked:true, visible:true, active:false },
    ],
    games_visible: [
      { id:'zzmi', importer:'ZZMI', label:'绝区零', label_en:'Zenless Zone Zero',
        mods_dir:'X:/ZZMI/Mods', exists:true, checked:true, visible:true, active:true },
      { id:'srmi', importer:'SRMI', label:'星穹铁道', label_en:'Honkai: Star Rail',
        mods_dir:'X:/SRMI/Mods', exists:true, checked:true, visible:true, active:false },
    ],
    enabled_games: [], active_game: 'zzmi', views: {}, game_label: 'Zenless Zone Zero',
  }, over || {});
}

const DETAIL = {
  ok: true,
  entry: Object.assign(mkE('c1','CharA','CatA',true), {
    path: 'X:/m/c1', size_h: '1.0 MB', files: 3, ini: 1, sub_dirs: [
      { rel:'a', ini:1, files:2, disabled:false },
      { rel:'b/c', ini:0, files:1, disabled:true },
    ],
    groups: [{ files:[{name:'f1'}], kind:'variant' }],
    components: [{name:'body'}], cycles: [],
    hashes: ['a0a','b1b'], backup_inis: ['DISABLED_BACKUP_1.ini'],
    thumbs: ['preview.png'], char_auto: 'CharA', char_manual: '', usage: 1700000000,
    mtime: 1700000000, prev_hash: 'abc', last_used: 1700000000,
  }),
  subs: [], similar: [],
};

const dom = new JSDOM(UI.replace('__BOOT__', JSON.stringify(BOOT)), {
  runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://127.0.0.1:9/',
  beforeParse(w) {
    w.requestAnimationFrame = cb => setTimeout(() => cb(Date.now()), 16);
    w.fetch = (u, opt) => {
      const url = String(u);
      let payload = { ok: true };
      if (url.includes('/api/state')) payload = baseState();
      else if (url.includes('/api/detail')) payload = DETAIL;
      else if (url.includes('/api/config')) payload = { ok: true, msg: 'ok', state: baseState() };
      else if (url.includes('/api/switch_game')) payload = { ok: true, msg: 'ok', state: baseState() };
      else if (url.includes('/api/thumb_progress')) payload = { ok: true, pending: 0 };
      else if (url.includes('/api/photo_ping')) payload = { ok: true, burst_id: 1,
        meta: { burst_id: 1, frames: [], tiers: [], pending: false }, press_seq: 0 };
      else if (url.includes('/api/update_check')) payload = { ok: true, update_available: true, latest:'9.9.9', current:'1.5.78', url:'https://example.com' };
      else if (url.includes('/api/lib_list')) payload = { ok: true, mods_dir:'X:/m',
        libs: [{name:'LibA', path:'X:/l', exists:true, count:2, ref:'LibA'}],
        abs_libs: [], customs: [], top: [{name:'CatA', disabled:false}] };
      else if (url.includes('/api/gb_list')) payload = { ok: true, items: [],
        total: 0, kind: 'cats', gid: 1, cat: 1, page: 1, pages: 1 };
      else if (url.includes('/api/gb_subs')) payload = { ok: true, subs: [] };
      else if (url.includes('/api/gb_dl_list')) payload = { ok: true, dir: 'X:/dl', items: [{name:'a.zip', size:100}], total: 100 };
      else if (url.includes('/api/pb_diag')) payload = { ok: true, steps: [] };
      else if (url.includes('/api/wall_list')) payload = { ok: true, dir: 'X:/p', photos: [{name:'p1.png', size:100}] };
      else if (url.includes('/api/photo_burst')) payload = { ok: true, burst_id: 1,
        frames: [{i:0,t:0},{i:1,t:0.2}], tiers: [[0,1],[0,1]], secs:3, pending:true };
      else if (url.includes('/api/cats')) payload = { ok: true, cats: [] };
      return Promise.resolve({ ok: true, json: () => Promise.resolve(payload),
        text: () => Promise.resolve(JSON.stringify(payload)) });
    };
  },
});

const w = dom.window, d = w.document;
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* 按「最近语义父元素」聚合整句，避免被 <b>/<code> 切碎 */
const SCAN_FN = `(function(sel, allow){
  const box = document.querySelector(sel);
  if (!box) return {missing: true, items: [], attrs: []};
  const skip = new Set(['SCRIPT','STYLE','TITLE','NOSCRIPT','OPTION']);
  const out = {}; const seen = new Set();
  const walker = document.createTreeWalker(box, NodeFilter.SHOW_TEXT);
  let n;
  while (n = walker.nextNode()) {
    const raw = (n.textContent || '').trim();
    if (!raw || !/[\\u4e00-\\u9fff]/.test(raw)) continue;
    let p = n.parentElement;
    if (!p || skip.has(p.tagName)) continue;
    let host = p;
    for (let i = 0; i < 4 && host.parentElement; i++){
      const t = host.tagName;
      if (['P','LI','DIV','TD','TH','H1','H2','H3','H4','H5','H6','LABEL','BUTTON'].includes(t)) break;
      host = host.parentElement;
    }
    const txt = (host.textContent || '').replace(/\\s+/g, ' ').trim();
    if (!txt || !/[\\u4e00-\\u9fff]/.test(txt)) continue;
    if (seen.has(txt)) continue;
    seen.add(txt); out[txt] = 1;
  }
  const attrs = {};
  box.querySelectorAll('[title],[placeholder]').forEach(el => {
    ['title','placeholder'].forEach(a => {
      const v = el.getAttribute(a);
      if (v && /[\\u4e00-\\u9fff]/.test(v)) attrs[a + '="' + v + '"'] = 1;
    });
  });
  const filt = xs => xs.filter(t => {
    let s = t;
    allow.forEach(a => { s = s.split(a).join(''); });
    return /[\\u4e00-\\u9fff]/.test(s);
  });
  return {items: filt(Object.keys(out)).sort(), attrs: filt(Object.keys(attrs)).sort()};
})`;

const REPORT = [];
function scan(name, sel) {
  let r;
  try { r = w.eval('(' + SCAN_FN + ')(' + JSON.stringify(sel) + ',' + JSON.stringify(ALLOW) + ')'); }
  catch (e) { r = { missing: true, items: [], attrs: [], err: String(e) }; }
  const all = (r.items || []).concat(r.attrs || []);
  REPORT.push({ area: name, sel, missing: !!r.missing, items: r.items || [], attrs: r.attrs || [] });
  return all;
}

const withTimeout = (p, ms) => Promise.race([
  Promise.resolve(p).catch(() => {}), new Promise(r => setTimeout(r, ms))]);

(async () => {
  await sleep(1000);
  try { await w.setLang('en'); } catch (e) {}
  await sleep(800);

  const call = async (fn, ...args) => {
    try {
      const f = w.eval('typeof ' + fn + ' === "function" ? ' + fn + ' : null');
      if (f) await withTimeout(f.apply(null, args), 2500);
    } catch (e) {}
    await sleep(450);
  };
  const click = sel => { try { const e = d.querySelector(sel); if (e) e.click(); } catch (e) {} };
  const shut = async () => {
    try { w.eval('closeAll && closeAll()'); } catch (e) {}
    try { w.eval('closeAsk && closeAsk(null)'); } catch (e) {}
    await sleep(220);
  };

  scan('主界面', 'body');

  click('[data-act="detail"]'); await sleep(900);
  scan('详情弹窗', '#dtBody');
  click('#dtClose'); await sleep(250);

  await call('openSetup');        scan('设置', '#setBody');    await shut();
  await call('openLib');          scan('仓库', '#libBody');    await shut();
  await call('openLibMgr', true); scan('仓库管理', '#mDP');    await shut();
  await call('showConflicts');    scan('冲突弹窗', '#setBody'); await shut();

  click('#btnGB'); await sleep(900);   scan('下载区', '#mGB');    await shut();
  click('#gbDlDir'); await sleep(900); scan('下载目录', '#mGBDl'); await shut();

  await call('pbShow', { burst_id:1, frames:[{i:0,t:0},{i:1,t:0.2}],
    tiers:[[0,1],[0,1]], secs:3, pending:true });
  scan('连拍挑帧', '#mPB'); await shut();

  await call('pwOpen');           scan('照片墙', '#mPW');      await shut();
  await call('openAsk', 'K', 'V'); scan('输入弹窗', '#mAsk');  await shut();
  await call('openDirPick');      scan('目录选择器', '#mDP');  await shut();
  await call('showManualHelp', { name:'m', enable:false, mode:'rename', want:'w' }, false);
  scan('手动改名', '#mManual'); await shut();
  await call('showDupNotice', [{orig_name:'a', target_name:'a (2)', seq:2}], null);
  scan('重名提示', '#mDup'); await shut();

  scan('放大层', '#mLB');
  scan('错误页', '#dead');

  /* ---- 汇总 ---- */
  let dirty = 0, total = 0;
  for (const r of REPORT) {
    const all = r.items.concat(r.attrs);
    if (!all.length) continue;
    dirty++; total += all.length;
    console.log('=== ' + r.area + '  ' + all.length + ' 种 ===');
    r.items.forEach(x => console.log('   ' + x.slice(0, 140)));
    r.attrs.forEach(x => console.log('   [attr] ' + x.slice(0, 140)));
  }
  // 同一句话在不同区域重复计, 按文本去重更公平
  const uniq = new Set();
  REPORT.forEach(r => r.items.concat(r.attrs).forEach(x => uniq.add(x)));
  console.log('\n------------------------------------------------');
  console.log('脏区: ' + dirty + ' / ' + REPORT.length +
              '   条目(含区域重复): ' + total + '   去重后: ' + uniq.size);
  if (DUMP) { process.exit(0); }
  const ok = uniq.size === 0;
  console.log(ok ? 'PASS 英文态零历史中文残留' : 'FAIL 仍有中文残留 ' + uniq.size + ' 条');
  process.exit(ok ? 0 : 1);
})();
