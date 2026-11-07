const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = process.cwd();
const UI = fs.readFileSync(path.join(ROOT, 'ui.html'), 'utf8');
const BOOT = { token: 'tok', version: '1.5.76' };
const switched = [];
const langPosts = [];   // 记录 /api/config 收到的 lang   // 记录 /api/switch_game 收到的 game
const mkE = (id, char, cat, on) => ({id, name:id, char, chars:[char], category:cat,
  enabled:on, size:1e6, size_h:'1.0 MB', files:3, has_ini:true, hashes:['a'],
  partial:false, conflict:0, pinned:false, usage:1, thumb:null, variants:0,
  cycles:[], components:[], mtime:1, is_dir:true});

function baseState(over) {
  return Object.assign({
    ok: true, version: '1.5.76', theme: 'dark',
    stats: { total: 3, enabled: 2, disabled: 1, pinned: 0, chars: 1 },
    categories: [], chars: [], entries: [mkE('c1','CharA','CatA',true), mkE('c2','CharA','CatA',false)], presets: [], libraries: [],
    mods_dir: 'X:/m', mods_dir_exists: true, configured: true,
    scan_seconds: 0.1, hotkey: 'F9', hotkey_ok: true, thumb_pending: 0,
    game_running: false, launcher_running: false, detect: { done: true, step: '' },
    photo_on: true, photo_hotkey: 'Ctrl+Shift+C', photo_mouse_btn: 1, photo_seconds: 3,
    photo_dir: 'X:/p', photo_dir_custom: false, photo_dir_default: 'X:/p',
    photo_burst: { burst_id: 0, frames: [], tiers: [], pending: false },
    photo_press_seq: 0, photo_press_pending: false,
    photo_scroll_buffer: false,
    games: [
      { id:'zzmi', importer:'ZZMI', label:'绝区零', label_en:'Zenless Zone Zero',
        mods_dir:'X:/ZZMI/Mods', exists:true, checked:true, visible:true, active:true },
      { id:'srmi', importer:'SRMI', label:'星穹铁道', label_en:'Honkai: Star Rail',
        mods_dir:'X:/SRMI/Mods', exists:true, checked:true, visible:true, active:false },
      { id:'wwmi', importer:'WWMI', label:'鸣潮', label_en:'Wuthering Waves',
        mods_dir:'X:/WWMI/Mods', exists:false, checked:false, visible:false, active:false },
    ],
    games_visible: [
      { id:'zzmi', importer:'ZZMI', label:'绝区零', label_en:'Zenless Zone Zero',
        mods_dir:'X:/ZZMI/Mods', exists:true, checked:true, visible:true, active:true },
      { id:'srmi', importer:'SRMI', label:'星穹铁道', label_en:'Honkai: Star Rail',
        mods_dir:'X:/SRMI/Mods', exists:true, checked:true, visible:true, active:false },
    ],
    enabled_games: [],
    active_game: 'zzmi', views: {}, game_label: '绝区零',
  }, over || {});
}

const dom = new JSDOM(UI.replace('__BOOT__', JSON.stringify(BOOT)), {
  runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://127.0.0.1:1/',
  beforeParse(w) {
    w.fetch = (u, opt) => {
      const url = String(u);
      let payload = { ok: true };
      if (url.includes('/api/config')) {
        try {
          const b = JSON.parse((opt && opt.body) || '{}');
          if (b.lang) langPosts.push(b.lang);
        } catch (e) {}
        payload = { ok: true, msg: 'ok', state: baseState({ lang: (langPosts[langPosts.length-1] || 'zh') }) };
      }
      else if (url.includes('/api/switch_game')) {
        let gid = 'zzmi';
        try { gid = JSON.parse((opt && opt.body) || '{}').game || 'zzmi'; } catch (e) {}
        switched.push(gid);
        payload = { ok: true, msg: 'ok', state: baseState({ active_game: gid }) };
      }
      else if (url.includes('/api/state')) payload = baseState();
      else if (url.includes('/api/thumb_progress')) payload = { ok: true, pending: 0 };
      else if (url.includes('/api/photo_ping')) payload = { ok: true, burst_id: 0, meta: { burst_id: 0, frames: [], tiers: [], pending: false }, press_seq: 0 };
      else if (url.includes('/api/update_check')) payload = { ok: true, update_available: false };
      return Promise.resolve({ ok: true, json: () => Promise.resolve(payload), text: () => Promise.resolve(JSON.stringify(payload)) });
    };
  },
});

const w = dom.window, d = w.document;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const PASS = [], FAIL = [];
function ck(name, cond, extra) {
  (cond ? PASS : FAIL).push(name);
  console.log((cond ? '  ok   ' : '  FAIL ') + name + (extra !== undefined ? ' | ' + extra : ''));
}

(async () => {
  await sleep(600);

  const sel = d.querySelector('#gpick');
  ck('下拉框存在', !!sel);
  ck('下拉有 2 个选项', sel && sel.options.length === 2, sel ? Array.from(sel.options).map(o=>o.text) : null);
  ck('选项1 是绝区零', sel && sel.options[0].text === '绝区零', sel && sel.options[0].text);
  ck('选项2 是星穹铁道', sel && sel.options[1].text === '星穹铁道', sel && sel.options[1].text);
  ck('鸣潮不在下拉里(已隐藏)', sel && !Array.from(sel.options).some(o => o.text.includes('鸣潮')));

  const brand = d.querySelector('.brand b');
  ck('品牌名默认中文', brand && brand.textContent === 'Mod 管家', brand && brand.textContent);
  const launch = d.querySelector('#btnLaunch');
  ck('启动按钮默认中文', launch && launch.textContent.includes('启动游戏'), launch && launch.textContent.trim());

  // 切到英文
  await w.setLang('en');
  await sleep(300);
  ck('切英文后 品牌名', brand && brand.textContent === 'Mod Manager', brand && brand.textContent);
  ck('切英文后 启动按钮', launch && launch.textContent.includes('Launch Game'), launch && launch.textContent.trim());
  const sel2 = d.querySelector('#gpick');
  ck('切英文后 下拉选项变英文', sel2 && sel2.options[0].text === 'Zenless Zone Zero',
     sel2 ? Array.from(sel2.options).map(o=>o.text) : null);
  ck('切英文后 第二个也变英文', sel2 && sel2.options[1].text === 'Honkai: Star Rail',
     sel2 && sel2.options[1].text);
  // v1.5.78: 语言改存后端配置（localStorage 换端口会丢）
  ck('语言已发给后端(/api/config lang=en)', langPosts.includes('en'), JSON.stringify(langPosts));
  ck('document.title 变英文', d.title === 'Mod Manager', d.title);

  // 切回中文
  await w.setLang('zh');
  await sleep(300);
  ck('切回中文 品牌名', brand && brand.textContent === 'Mod 管家', brand && brand.textContent);
  ck('切回中文 下拉选项', sel2 && sel2.options[0].text === '绝区零', sel2 && sel2.options[0].text);
  ck('切回中文也发给后端', langPosts.includes('zh'), JSON.stringify(langPosts));


  // ---- v1.5.77: 用户实测反馈的两个问题 ----
  // ① 切英文后设置页/卡片里还残留中文（renderSetup 重建 DOM 覆盖了 i18n 改动）
  // ② 选星穹铁道切不过去（2 秒轮询重建 <select> 把选择重置了）
  console.log('\n--- v1.5.77 回归 ---');
  await w.setLang('en');
  await sleep(500);

  // ① 所有 data-i18n 元素必须全部翻译（不留中文）
  let stillCn = [];
  d.querySelectorAll('[data-i18n]').forEach(el => {
    if (/[\u4e00-\u9fff]/.test(el.textContent || '')) stillCn.push(el.getAttribute('data-i18n'));
  });
  ck('① 切英文后 data-i18n 元素无中文残留', stillCn.length === 0, JSON.stringify(stillCn));

  // 卡片按钮（截图里最显眼的四个）
  const dBtn = d.querySelector('.cardfoot [data-act="detail"]');
  ck('① 卡片「详情」→ Details', dBtn && dBtn.textContent.trim() === 'Details', dBtn && dBtn.textContent.trim());
  const rBtn = d.querySelector('.cardfoot [data-act="rename"]');
  ck('① 卡片「重命名」→ Rename', rBtn && rBtn.textContent.includes('Rename'), rBtn && rBtn.textContent.trim());
  const sBtn = d.querySelector('.cardfoot [data-act="solo"]');
  ck('① 卡片「只留这套」→ Keep only this', sBtn && sBtn.textContent.includes('Keep only'), sBtn && sBtn.textContent.trim());
  const xBtn = d.querySelector('.cardfoot [data-act="del"]');
  ck('① 卡片「删除」→ Delete', xBtn && xBtn.textContent.includes('Delete'), xBtn && xBtn.textContent.trim());

  // ② 切游戏: 选星铁必须真的发出请求
  const selS = d.querySelector('#gpick');
  const before = switched.slice();
  selS.value = 'srmi';
  if (selS.onchange) selS.onchange({target: selS});
  await sleep(400);
  ck('② 选星穹铁道发出了切换请求', switched.length > before.length,
     JSON.stringify(switched));
  ck('② 请求里 game=srmi', switched.includes('srmi'), JSON.stringify(switched));

  // ③ 轮询重绘不能把选择重置（模拟 renderAll 反复跑）
  await w.setLang('zh');
  await sleep(300);
  const selZ = d.querySelector('#gpick');
  const sig1 = selZ.dataset.sig;
  selZ.value = 'srmi';
  w.renderAll();   // 模拟 2 秒轮询触发的重绘
  await sleep(100);
  const selZ2 = d.querySelector('#gpick');
  ck('③ 轮询重绘后不被重置成旧值',
     selZ2 && (selZ2.value === 'srmi' || selZ2.disabled),
     'value=' + (selZ2 && selZ2.value));


  // ---- v1.5.78: 启动时若后端配置是英文, 首屏就该是英文(不用手动切) ----
  console.log('\n--- v1.5.78 首屏即英文 ---');
  // 重新造一个 JSDOM, 让它一开始 st.lang = 'en'
  const dom2 = new JSDOM(UI.replace('__BOOT__', JSON.stringify(BOOT)), {
    runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://127.0.0.1:2/',
    beforeParse(w) {
      w.fetch = (u, opt) => {
        const url = String(u);
        let payload = { ok: true };
        if (url.includes('/api/config')) payload = { ok: true, msg: 'ok', state: baseState({ lang: 'en' }) };
        else if (url.includes('/api/switch_game')) payload = { ok: true, msg: 'ok', state: baseState({ active_game: 'zzmi' }) };
        else if (url.includes('/api/state')) payload = baseState({ lang: 'en' });   // ← 启动就是英文
        else if (url.includes('/api/thumb_progress')) payload = { ok: true, pending: 0 };
        else if (url.includes('/api/photo_ping')) payload = { ok: true, burst_id: 0, meta: { burst_id: 0, frames: [], tiers: [], pending: false }, press_seq: 0 };
        else if (url.includes('/api/update_check')) payload = { ok: true, update_available: false };
        return Promise.resolve({ ok: true, json: () => Promise.resolve(payload), text: () => Promise.resolve(JSON.stringify(payload)) });
      };
    },
  });
  const w2 = dom2.window, d2 = w2.document;
  await sleep(1200);
  ck('首屏 document.title 是英文', d2.title === 'Mod Manager', d2.title);
  const brand2 = d2.querySelector('.brand b');
  ck('首屏 品牌名是英文', brand2 && brand2.textContent === 'Mod Manager', brand2 && brand2.textContent);
  const launch2 = d2.querySelector('#btnLaunch');
  ck('首屏 启动按钮是英文(静态节点也翻了)',
     launch2 && launch2.textContent.includes('Launch Game'), launch2 && launch2.textContent.trim());
  const ov2 = d2.querySelector('[data-i18n="side.overview"]');
  ck('首屏 侧栏「总览」是英文', ov2 && ov2.textContent === 'Overview', ov2 && ov2.textContent);
  let still2 = [];
  d2.querySelectorAll('[data-i18n]').forEach(el => {
    if (/[\u4e00-\u9fff]/.test(el.textContent || '')) still2.push(el.getAttribute('data-i18n'));
  });
  ck('首屏 所有 data-i18n 节点无中文', still2.length === 0, JSON.stringify(still2));

  console.log('\nPASS ' + PASS.length + ' / FAIL ' + FAIL.length);
  if (FAIL.length) { console.log('失败项:'); FAIL.forEach(x=>console.log('  - '+x)); }
  process.exit(FAIL.length ? 1 : 0);
})();
