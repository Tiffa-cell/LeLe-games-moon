// 端到端测试（无头 Chromium）
//   第1章：iPad 竖屏 / 横屏、逐批点亮、走满一圈的闪烁波、镜头往返、持久化、夜色切换、触摸事件
//   第2章：章节入口图标、拖太阳、<mask> 亮面朝太阳、目标相位 ±20° 停 1 秒、连对三次过关、回第1章
// 用法：NODE_PATH=$(npm root -g) node tools/e2e.js [url] [截图目录]
//   url 默认用 file:// 直接打开仓库里的 index.html；也可以传 http://localhost:8000/ 之类
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '..');
const URL = process.argv[2] || 'file://' + path.join(ROOT, 'index.html');
const OUT = process.argv[3] || path.join(__dirname, 'shots');
fs.mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let failures = 0;
function check(cond, msg) { console.log((cond ? 'PASS ' : 'FAIL ') + msg); if (!cond) failures++; }
const HOME = Math.PI / 2;

async function ringPoint(page, angleRad) {
  // 把环上某个角的画布坐标换成屏幕坐标（走 getScreenCTM，和 app 内部一致）
  return page.evaluate(a => {
    const s = window.__scene, svg = s.svg;
    const x = s.ring.cx + s.ring.r * Math.cos(a), y = s.ring.cy + s.ring.r * Math.sin(a);
    const pt = new DOMPoint(x, y).matrixTransform(svg.getScreenCTM());
    return { x: pt.x, y: pt.y };
  }, angleRad);
}
async function state(page) { return page.evaluate(() => window.Chapter1.state()); }
async function litCount(page) { return page.evaluate(() => document.querySelectorAll('#stage .star.lit').length); }
async function starCount(page) { return page.evaluate(() => document.querySelectorAll('#stage .star').length); }
async function batchSizes(page) { return page.evaluate(() => window.__scene.batchSizes); }
async function waitMode(page, m, timeout = 15000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) { if ((await state(page)).mode === m) return true; await sleep(100); }
  return false;
}
// 从角 from 沿环拖 turns 圈（正 = 顺相位方向，屏幕上逆时针）
async function dragArc(page, from, turns, steps, onStep) {
  const p0 = await ringPoint(page, from);
  await page.mouse.move(p0.x, p0.y);
  await page.mouse.down();
  for (let i = 1; i <= steps; i++) {
    const p = await ringPoint(page, from - turns * 2 * Math.PI * (i / steps));
    await page.mouse.move(p.x, p.y);
    if (onStep) await onStep(i);
  }
  await page.mouse.up();
}

// ---- 第2章辅助
async function state2(page) { return page.evaluate(() => window.Chapter2.state()); }
async function waitMode2(page, m, timeout = 15000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) { if ((await state2(page)).mode === m) return true; await sleep(100); }
  return false;
}
async function waitFor(page, fn, timeout = 8000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) { if (await page.evaluate(fn)) return true; await sleep(100); }
  return false;
}
async function sunPoint(page, angleRad) {
  return page.evaluate(a => {
    const s = window.__scene, svg = s.svg;
    const x = s.sun.cx + s.sun.r * Math.cos(a), y = s.sun.cy + s.sun.r * Math.sin(a);
    const pt = new DOMPoint(x, y).matrixTransform(svg.getScreenCTM());
    return { x: pt.x, y: pt.y };
  }, angleRad);
}
// 沿轨道把太阳从 from 拖到 to（走短弧）；release=false 时手指不松开
async function dragSun(page, from, to, steps = 12, release = true) {
  const p0 = await sunPoint(page, from);
  await page.mouse.move(p0.x, p0.y);
  await page.mouse.down();
  let d = to - from; d = Math.atan2(Math.sin(d), Math.cos(d));
  for (let i = 1; i <= steps; i++) {
    const p = await sunPoint(page, from + d * i / steps);
    await page.mouse.move(p.x, p.y);
  }
  if (release) await page.mouse.up();
}
const navShown = page => page.evaluate(() => document.getElementById('chapter-nav').classList.contains('show'));
const navKind = page => page.evaluate(() => document.getElementById('chapter-nav').getAttribute('data-kind'));
const deg = r => r * 180 / Math.PI;

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 834, height: 1194 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text()); });

  console.log('URL', URL);
  await page.goto(URL);
  await sleep(300);
  const N = await starCount(page);
  const sizes = await batchSizes(page);
  check(N > 20 && sizes.length === 8 && sizes.reduce((a, b) => a + b, 0) === N, `scene built: ${N} stars in 8 batches [${sizes}]`);
  check(await page.evaluate(() => !!getComputedStyle(document.documentElement).getPropertyValue('--c-star-peak').trim()), 'theme exposes --c-star-peak');
  const s0 = await state(page);
  check(s0.mode === 'intro', 'starts in intro (kid view), mode=' + s0.mode);
  await page.screenshot({ path: OUT + '/01-intro-kid.png' });
  check(await waitMode(page, 'play', 8000), 'intro ends in play mode');
  await sleep(200);
  await page.screenshot({ path: OUT + '/02-full-view.png' });
  const vb = await page.evaluate(() => document.getElementById('stage').getAttribute('viewBox'));
  check(vb === '0 0 1668 2388', 'iPad portrait viewBox is the M0 canvas: ' + vb);
  check(await page.evaluate(() => document.getElementById('stage').classList.contains('hint')), 'halo hint breathing before first drag');
  check(await litCount(page) === 0, 'all stars dim at the start of a lap');
  check(await page.evaluate(() => getComputedStyle(document.querySelector('#stage [clip-path]')).visibility === 'hidden'), 'big moon starts as new moon');
  check(!(await navShown(page)) && await navKind(page) === 'sun', 'chapter entry (sun icon) hidden before chapter 1 is completed');

  // 拖 1/8 圈：经过节点 1 → 第 1 批星逐颗点亮（先闪到峰值再落到常亮）
  await dragArc(page, HOME, 1 / 8, 8);
  let ignitePeak = 0; const tIg = Date.now();
  while (Date.now() - tIg < 1500) {
    const r = await page.evaluate(() => Math.max(0, ...Array.from(document.querySelectorAll('#stage .star.ignite')).map(e => parseFloat(getComputedStyle(e).opacity))));
    ignitePeak = Math.max(ignitePeak, r);
    if (Date.now() - tIg > 380 && Date.now() - tIg < 460) await page.screenshot({ path: OUT + '/03a-ignite.png' });
    await sleep(50);
  }
  check(ignitePeak > 0.98, 'newly lit stars flash to peak opacity: ' + ignitePeak.toFixed(3));
  check(await litCount(page) === sizes[1], 'node 1 lit batch 1: ' + sizes[1] + ' stars');
  // 再拖到 3/8 圈：经过节点 2、3 → 共三批；中央月相 ≈ 0.375
  await dragArc(page, HOME - Math.PI / 4, 2 / 8, 16);
  await sleep(500);
  let s = await state(page);
  check(Math.abs(s.phase - 0.375) < 0.02, 'after 3/8 lap phase ≈ 0.375, got ' + s.phase.toFixed(3) + ' (snapped)');
  const expect3 = sizes[1] + sizes[2] + sizes[3];
  check(await litCount(page) === expect3 && s.lit === 3, `passing nodes 1-3 lit exactly batches 1-3: ${await litCount(page)} stars (${sizes[1]}+${sizes[2]}+${sizes[3]})`);
  check(!(await page.evaluate(() => document.getElementById('stage').classList.contains('hint'))), 'hint removed after first drag');
  await sleep(800);
  await page.screenshot({ path: OUT + '/03-gibbous.png' });

  // 倒着拖 1/8 圈（经过节点 2 往回）：允许倒退，已亮的星不灭
  await dragArc(page, HOME - 0.375 * 2 * Math.PI, -1 / 8, 8);
  await sleep(400);
  s = await state(page);
  check(Math.abs(s.phase - 0.25) < 0.02, 'dragging backwards works, phase=' + s.phase.toFixed(3));
  check(Math.abs(s.net - Math.PI / 2) < 0.05, 'net progress tracks correctly: ' + s.net.toFixed(3));
  check(await litCount(page) === expect3, 'lit stars stay lit when going back');

  // 在环上任意处（不在小月亮上）按住拖，也应带动
  {
    const p = await ringPoint(page, -Math.PI / 2); // 顶部（满月标记处），小月亮此时在右侧
    await page.mouse.move(p.x, p.y); await page.mouse.down();
    const q = await ringPoint(page, -Math.PI / 2 - Math.PI / 4);
    await page.mouse.move(q.x, q.y); await page.mouse.up(); await sleep(400);
    s = await state(page);
    check(Math.abs(s.phase - 0.375) < 0.02, 'grabbing the ring anywhere rotates the traveler, phase=' + s.phase.toFixed(3));
  }

  // 点击环外区域不应有影响
  await page.mouse.click(100, 1100); await sleep(100);
  s = await state(page);
  check(s.mode === 'play' && Math.abs(s.phase - 0.375) < 0.02, 'tapping empty ground does nothing');

  // 补完整圈 → 过关：全部点亮 + 闪烁波 + 四角星 + 小人抬头
  await dragArc(page, HOME - 0.375 * 2 * Math.PI, 0.625, 30, async i => {
    if (i === 12) await page.screenshot({ path: OUT + '/04-waning.png' });
  });
  await sleep(120);
  s = await state(page);
  check(s.mode === 'win', 'full lap triggers win, mode=' + s.mode);
  check(await litCount(page) === N && s.lit === 8, 'all stars lit at the end of the lap');
  check(await page.evaluate(() => document.querySelectorAll('#stage .star.wave').length) === N, 'wave class on every star');
  check(await page.evaluate(() => document.querySelector('#stage .moon-glow').classList.contains('surge')), 'moon glow surges with the wave');
  check(await page.evaluate(() => document.querySelectorAll('#stage .sparkle.lit').length) > 0, 'sparkles appear on first win');
  const delays = await page.evaluate(() => Array.from(document.querySelectorAll('#stage .star')).map(e => {
    const s = window.__scene; return { d: Math.hypot(+e.getAttribute('cx') - s.moon.cx, +e.getAttribute('cy') - s.moon.cy), delay: parseFloat(e.style.getPropertyValue('--wave-delay')) };
  }).sort((a, b) => a.d - b.d));
  check(delays[0].delay < delays[delays.length - 1].delay && delays.every((x, i) => i === 0 || x.delay >= delays[i - 1].delay), 'wave spreads outward from the moon (delay grows with distance)');
  check(s.progress.completed === true && s.progress.laps === 1, 'progress saved: ' + JSON.stringify(s.progress));
  // 闪烁波期间每 60ms 采样一次：峰值不透明度应到 1，且峰值色不是平时的星色
  let peakOpacity = 0, peakFill = '', peakScale = 0, shot = false;
  const tWave = Date.now();
  while (Date.now() - tWave < 1700) {
    // 只看正处在峰值色（不是平时星色）的星：它的不透明度与放大倍数
    const r = await page.evaluate(() => {
      const normal = getComputedStyle(document.documentElement).getPropertyValue('--c-star').trim();
      const toRgb = hex => 'rgb(' + [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)).join(', ') + ')';
      let best = { op: 0, fill: '', scale: 0 };
      document.querySelectorAll('#stage .star.wave').forEach(e => {
        const cs = getComputedStyle(e); const op = parseFloat(cs.opacity);
        const m = /matrix\(([-\d.]+)/.exec(cs.transform); const sc = m ? parseFloat(m[1]) : 1;
        if (cs.fill !== toRgb(normal) && sc > best.scale) best = { op, fill: cs.fill, scale: sc };
      });
      return best;
    });
    if (r.scale > peakScale) { peakOpacity = r.op; peakFill = r.fill; peakScale = r.scale; }
    if (!shot && Date.now() - tWave > 380) { shot = true; await page.screenshot({ path: OUT + '/05-win-wave.png' }); }
    await sleep(60);
  }
  check(peakOpacity > 0.98 && peakScale > 1.8, `wave peak: opacity ${peakOpacity.toFixed(3)}, scale ${peakScale.toFixed(2)}, fill ${peakFill}`);
  const kidT = await page.evaluate(() => document.querySelector('#stage .kid').getAttribute('transform'));
  check(/rotate\(-[0-9.]+/.test(kidT || ''), 'kid leans back to look up: ' + kidT);
  check(await waitMode(page, 'hold', 8000), 'camera returned to the kid (hold)');
  await sleep(400);
  await page.screenshot({ path: OUT + '/06-hold-kid.png' });
  const saved = await page.evaluate(() => localStorage.getItem('moon.progress'));
  check(saved && JSON.parse(saved).chapter1.completed, 'localStorage moon.progress = ' + saved);
  // 不点屏幕：停 ~2 秒后自动缓缓拉回，回到可玩，星空回暗
  const tHold = Date.now();
  check(!(await navShown(page)), 'sun icon stays hidden while the camera is on the kid');
  check(await waitMode(page, 'return', 4000), 'auto-return starts after the hold (' + (Date.now() - tHold) + 'ms)');
  check(await navShown(page), 'sun icon (chapter 2 entry) appears as the camera pulls back after the first win');
  check(await waitMode(page, 'play', 6000), 'back to play without tapping or reloading');
  await sleep(2300);
  check(await litCount(page) === 0, 'stars dimmed again for the next lap');
  check(await page.evaluate(() => document.querySelectorAll('#stage .sparkle.lit').length) > 0, 'sparkles stay (completion mark)');
  s = await state(page);
  check(Math.abs(s.net) < 1e-6 && Math.abs(s.phase) < 1e-6, 'traveler back home, net reset');
  await page.screenshot({ path: OUT + '/07-play-again.png' });

  // 第二圈：离起点还差 ~20° 就松手 → 吸附到起点 → 再次过关（laps=2）；这次点一下提前拉回
  await dragArc(page, HOME, 1 - 20 / 360, 36);
  await sleep(500);
  s = await state(page);
  check(s.mode === 'win', 'releasing near home snaps to the start and wins again, mode=' + s.mode);
  check(s.progress.laps === 2 && await litCount(page) === N, 'laps=2 and all stars lit again on the second lap');
  check(await waitMode(page, 'hold', 8000), 'second win also returns to the kid');
  await page.mouse.click(400, 600);
  check(await waitMode(page, 'play', 6000), 'tap during hold returns to play early');

  // 夜色切换
  for (const name of ['violet', 'ink', 'indigo']) {
    await page.click('.theme-dot[data-theme="' + name + '"]');
    await sleep(900);
    const cur = await page.evaluate(() => [window.THEME.current, getComputedStyle(document.documentElement).getPropertyValue('--c-sky-top').trim(), localStorage.getItem('moon.theme'), document.querySelector('meta[name=theme-color]').content, getComputedStyle(document.documentElement).getPropertyValue('--c-star-peak').trim()]);
    const preset = await page.evaluate(n => window.THEME.PRESETS[n], name);
    check(cur[0] === name && cur[1] === preset.skyTop && cur[2] === name && cur[3] === cur[1] && cur[4] === preset.starPeak, 'theme ' + name + ' applied: ' + cur.join(' / '));
    await page.screenshot({ path: OUT + '/08-theme-' + name + '.png' });
  }

  // 重新加载：四角星还在（通关印记），星点回暗，开场仍从小人开始
  await page.reload(); await sleep(300);
  check((await state(page)).mode === 'intro', 'reload starts with intro');
  check(await page.evaluate(() => document.querySelectorAll('#stage .sparkle.lit').length) > 0, 'sparkles persist after reload');
  check(await litCount(page) === 0, 'star dots start dim after reload');
  await page.mouse.click(400, 600);
  check(await waitMode(page, 'play', 3000), 'tap skips intro');
  await page.screenshot({ path: OUT + '/09-reload.png' });

  // 用真实触摸事件（CDP）拖 1/8 圈：经过节点 1 → 第 1 批亮
  {
    const cdp = await ctx.newCDPSession(page);
    const p0 = await ringPoint(page, HOME);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: p0.x, y: p0.y }] });
    for (let i = 1; i <= 10; i++) {
      const q = await ringPoint(page, HOME - (Math.PI / 4) * i / 10);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: q.x, y: q.y }] });
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await sleep(400);
    s = await state(page);
    check(Math.abs(s.phase - 0.125) < 0.02, 'touch drag (CDP) moves the traveler, phase=' + s.phase.toFixed(3));
    check(await litCount(page) === sizes[1], 'touch drag past node 1 lit batch 1 (' + sizes[1] + ' stars)');
  }

  // 横屏：重建后状态保留（已亮批次按新布局恢复）
  await page.setViewportSize({ width: 1194, height: 834 });
  await sleep(600);
  const vbL = await page.evaluate(() => document.getElementById('stage').getAttribute('viewBox'));
  check(/^0 0 \d+ 2388$/.test(vbL), 'landscape rebuild keeps full height: ' + vbL);
  await page.screenshot({ path: OUT + '/10-landscape.png' });
  s = await state(page);
  const sizesL = await batchSizes(page);
  check(s.mode === 'play' && Math.abs(s.phase - 0.125) < 0.02 && await litCount(page) === sizesL[1], 'state survives rebuild: ' + s.mode + ' ' + s.phase.toFixed(3) + ', batch 1 restored');

  // iPhone 竖屏（很窄长）
  await page.setViewportSize({ width: 390, height: 844 });
  await sleep(600);
  await page.screenshot({ path: OUT + '/11-iphone.png' });

  // =====================================================================================
  // 第2章 月亮不发光
  // =====================================================================================
  console.log('\n--- chapter 2 ---');
  await page.setViewportSize({ width: 834, height: 1194 });
  await sleep(600);
  check((await state(page)).mode === 'play' && await navShown(page) && await navKind(page) === 'sun', 'back on iPad portrait: chapter 1 playable, sun icon shown');
  check(await page.evaluate(() => !!getComputedStyle(document.documentElement).getPropertyValue('--c-sun').trim()), 'theme exposes --c-sun');
  for (const name of ['ink', 'indigo', 'violet']) {
    check(await page.evaluate(n => /^#[0-9a-f]{6}$/i.test(window.THEME.PRESETS[n].sun), name), 'preset ' + name + ' has a sun color');
  }

  // 点太阳图标 → 第1章镜头落到小人身上 → 换成第2章 → 从小人身上拉远
  await page.click('#chapter-nav');
  await sleep(150);
  check((await state(page)).mode === 'leave' && !(await navShown(page)), 'tapping the sun icon: chapter 1 leaves (camera heads to the kid), icon hides');
  check(await waitFor(page, () => window.__chapter === window.Chapter2, 5000), 'scene swapped to chapter 2 while on the kid');
  let s2 = await state2(page);
  check(s2.mode === 'intro', 'chapter 2 starts with the kid intro, mode=' + s2.mode);
  check(await page.evaluate(() => document.getElementById('stage').getAttribute('data-chapter') === '2' && !!document.querySelector('#stage .sun-disc') && !document.querySelector('#stage .ring-guide')), 'chapter 2 scene: sun present, phase ring gone');
  check(await page.evaluate(() => document.querySelector('#stage .layer-moon [mask]') && document.querySelector('#stage mask#mask-moon-lit path') && !document.querySelector('#stage [clip-path]')), 'big moon lit side is driven by an SVG <mask> (no clipPath, no prebuilt phase images)');
  check(await page.evaluate(() => getComputedStyle(document.querySelector('#stage mask#mask-moon-lit')).maskType === 'alpha'), 'mask uses alpha (fill color irrelevant)');
  check(await page.evaluate(() => JSON.parse(localStorage.getItem('moon.progress')).current === 2), 'current chapter persisted = 2');
  await page.screenshot({ path: OUT + '/12-ch2-intro-kid.png' });
  check(await waitMode2(page, 'play', 8000), 'chapter 2 intro ends in play');
  await sleep(300);
  check(await navShown(page) && await navKind(page) === 'moon', 'in chapter 2 the entry icon is a small moon (back to chapter 1)');
  check(await page.evaluate(() => document.getElementById('stage').classList.contains('hint')), 'sun glow breathes before the first drag');
  s2 = await state2(page);
  check(Math.abs(s2.theta) < 1e-6 && s2.target !== null && s2.streak === 0, 'sun starts at the right (first quarter), a target is set, streak 0');
  check(s2.targetIndex !== 0, 'first target is not where the sun already is');
  await page.screenshot({ path: OUT + '/13-ch2-full-view.png' });

  // 亮面朝太阳：太阳在右 → 明暗界线竖直、右半亮；顶 → 新月（亮面隐藏）；底 → 满月；左上 → 蛾眉月朝左上
  const litInfo = () => page.evaluate(() => {
    const p = document.querySelector('#stage mask#mask-moon-lit path');
    const g = document.querySelector('#stage .layer-moon [mask]');
    const sp = document.getElementById('g-sphere');
    return { d: p.getAttribute('d'), tr: p.getAttribute('transform') || '', hidden: getComputedStyle(g).visibility === 'hidden',
             glow: parseFloat(document.querySelector('#stage .moon-glow').style.opacity), sphereCx: +sp.getAttribute('cx'), sphereCy: +sp.getAttribute('cy') };
  });
  let li = await litInfo();
  const mcx = await page.evaluate(() => window.__scene.moon.cx);
  check(!li.hidden && /L /.test(li.d) && li.tr === '' && li.sphereCx > mcx, 'sun at right: straight terminator (quarter), lit side toward the sun, sphere shading offset toward the sun');
  await dragSun(page, 0, -Math.PI / 2, 10);           // 拖到顶
  await sleep(150);
  s2 = await state2(page); li = await litInfo();
  check(Math.abs(s2.theta + Math.PI / 2) < 0.02 && li.hidden && Math.abs(li.glow - 0.35) < 0.02, 'sun at top (behind the moon): new moon, lit side hidden, glow at minimum');
  check(!(await page.evaluate(() => document.getElementById('stage').classList.contains('hint'))), 'hint removed after first drag');
  await dragSun(page, -Math.PI / 2, -Math.PI * 3 / 4, 6); // 左上
  await sleep(150);
  li = await litInfo(); s2 = await state2(page);
  check(!li.hidden && /A 144\.96,205 0 0 0/.test(li.d) && /rotate\(-135/.test(li.tr), 'sun upper-left: thin crescent, terminator rotated to face the sun (' + li.tr + ')');
  await page.screenshot({ path: OUT + '/14-ch2-crescent.png' });
  await dragSun(page, s2.theta, Math.PI / 2, 14);      // 绕到底（走一整圈的一半）
  await sleep(150);
  li = await litInfo(); s2 = await state2(page);
  check(Math.abs(s2.theta - Math.PI / 2) < 0.02 && !li.hidden && /A 205,205 0 0 1 [\d.]+,[\d.]+ A 205,205 0 0 1/.test(li.d) && Math.abs(li.glow - 1) < 0.02, 'sun at bottom (our side): full moon, glow at maximum');
  await page.screenshot({ path: OUT + '/15-ch2-full-moon.png' });
  await dragSun(page, Math.PI / 2, Math.PI / 4, 6);    // 右下：凸月
  await sleep(150);
  li = await litInfo();
  check(/A 144\.96,205 0 0 1/.test(li.d) && /rotate\(45/.test(li.tr), 'sun lower-right: gibbous bulging toward the sun');
  // 绕一整圈没有限制
  await dragSun(page, Math.PI / 4, Math.PI / 4 + Math.PI, 12, false);
  const midTheta = (await state2(page)).theta;
  await dragSun(page, Math.PI / 4 + Math.PI, Math.PI / 4 + 2 * Math.PI, 12);
  await sleep(150);
  s2 = await state2(page);
  check(Math.abs(midTheta - (Math.PI / 4 - Math.PI)) < 0.05 && Math.abs(s2.theta - Math.PI / 4) < 0.05, 'the sun can go all the way around the moon');
  check(s2.streak === 0, 'sweeping past targets without stopping does not count');

  // 目标匹配：拖到目标 +15°（误差内）松手 → 吸到目标 → 停 1 秒 → 算对；星星点亮太阳那一侧
  async function solve(offsetDeg, holdRelease = true) {
    const st = await state2(page);
    const tgt = st.target;
    await dragSun(page, st.theta, tgt + offsetDeg * Math.PI / 180, 16, holdRelease);
    return { tgt, before: st };
  }
  let r = await solve(15);
  await sleep(350);
  s2 = await state2(page);
  check(s2.dwelling && Math.abs(s2.theta - r.tgt) < 0.01, 'released 15° off: sun snaps onto the target and the 1 s dwell is running');
  check(await page.evaluate(() => document.querySelector('#stage .target').classList.contains('near')), 'target frame brightens while dwelling');
  await page.screenshot({ path: OUT + '/16-ch2-dwell.png' });
  check(await waitFor(page, () => window.Chapter2.state().streak === 1, 2000), 'after 1 s: first match counted (streak 1)');
  await sleep(120);
  check(await page.evaluate(() => document.querySelector('#stage .target-inner').classList.contains('pulse') || document.querySelector('#stage .target-inner').classList.contains('swap')), 'target pulses on success');
  check(await page.evaluate(() => document.querySelector('#stage .moon-glow').classList.contains('surge')), 'moon glow surges on success');
  const lit1 = await litCount(page);
  check(lit1 > 0 && lit1 < N, 'some stars (the sun\'s side of the sky) lit after the first match: ' + lit1);
  check(await waitFor(page, () => { const s = window.Chapter2.state(); return s.target !== null; }, 3000), 'a new target appears');
  s2 = await state2(page);
  check(s2.targetIndex !== r.before.targetIndex, 'new target differs from the previous one');

  // 停不满 1 秒就离开：不算
  r = await solve(0, false);                              // 手指按着不放
  await sleep(500);
  const far = r.tgt + 40 * Math.PI / 180;
  const pf = await sunPoint(page, far); await page.mouse.move(pf.x, pf.y); await page.mouse.up();
  await sleep(900);
  s2 = await state2(page);
  check(s2.streak === 1 && !s2.dwelling, 'leaving before 1 s resets the dwell (still streak 1)');
  // 误差外（+30°）停住：不算
  await dragSun(page, s2.theta, r.tgt + 30 * Math.PI / 180, 8);
  await sleep(1400);
  s2 = await state2(page);
  check(s2.streak === 1 && Math.abs(s2.theta - (r.tgt + 30 * Math.PI / 180)) < 0.02, 'holding 30° off does not count and does not snap');
  // 误差内（−18°）、手指一直按着不松：也算
  await dragSun(page, s2.theta, r.tgt - 18 * Math.PI / 180, 8, false);
  check(await waitFor(page, () => window.Chapter2.state().streak === 2, 2500), 'holding still within tolerance without releasing counts (streak 2)');
  await page.mouse.up();
  const lit2 = await litCount(page);
  check(lit2 > lit1, 'more of the sky lit after the second match: ' + lit2);
  check(await waitFor(page, () => window.Chapter2.state().target !== null, 3000), 'third target appears');

  // 第三次 → 过关：闪烁波 + 四角星 + 小人抬头 + 镜头落到小人身上 → 停 → 拉回 → 新一轮
  r = await solve(5);
  check(await waitMode2(page, 'win', 3000), 'third match triggers the win');
  s2 = await state2(page);
  check(await litCount(page) === N && s2.lit === 8, 'all stars lit on the win');
  check(await page.evaluate(() => document.querySelectorAll('#stage .star.wave').length) === N, 'star wave on every star (same as chapter 1)');
  check(await page.evaluate(() => document.querySelectorAll('#stage .sparkle.lit').length) > 0, 'sparkles appear on the first chapter 2 win');
  check(s2.progress.completed === true && s2.progress.rounds === 1, 'chapter 2 progress saved: ' + JSON.stringify(s2.progress));
  await sleep(400);
  await page.screenshot({ path: OUT + '/17-ch2-win-wave.png' });
  const kidT2 = await page.evaluate(() => document.querySelector('#stage .kid').getAttribute('transform'));
  check(/rotate\(-[0-9.]+/.test(kidT2 || ''), 'kid looks up: ' + kidT2);
  check(await waitMode2(page, 'hold', 8000), 'camera returns to the kid (hold)');
  check(!(await navShown(page)), 'entry icon hidden while on the kid');
  await sleep(300);
  await page.screenshot({ path: OUT + '/18-ch2-hold-kid.png' });
  check(await waitMode2(page, 'return', 4000), 'auto-return after the hold');
  check(await waitMode2(page, 'play', 6000), 'back to play for a new round');
  await sleep(2300);
  s2 = await state2(page);
  check(s2.streak === 0 && s2.target !== null && await litCount(page) === 0, 'new round: streak reset, new target, stars dimmed again');
  check(await navShown(page) && await navKind(page) === 'moon', 'moon icon back after the round');
  await page.screenshot({ path: OUT + '/19-ch2-round-2.png' });

  // 夜色切换时太阳色跟着换
  await page.click('.theme-dot[data-theme="ink"]'); await sleep(900);
  const sunFill = await page.evaluate(() => getComputedStyle(document.querySelector('#stage .sun-disc')).fill);
  const inkSun = await page.evaluate(() => window.THEME.PRESETS.ink.sun);
  const toRgb = hex => 'rgb(' + [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)).join(', ') + ')';
  check(sunFill === toRgb(inkSun), 'sun takes the theme sun color: ' + sunFill);
  await page.screenshot({ path: OUT + '/20-ch2-theme-ink.png' });
  await page.click('.theme-dot[data-theme="indigo"]'); await sleep(300);

  // 重新加载：直接回到第2章（记住了当前章节），四角星在
  await page.reload(); await sleep(300);
  check(await page.evaluate(() => window.__chapter === window.Chapter2 && window.Chapter2.state().mode === 'intro'), 'reload lands in chapter 2 (remembered) with the kid intro');
  check(await page.evaluate(() => document.querySelectorAll('#stage .sparkle.lit').length) > 0, 'chapter 2 sparkles persist after reload');
  await page.mouse.click(400, 600);
  check(await waitMode2(page, 'play', 3000), 'tap skips the chapter 2 intro');

  // 触摸（CDP）拖太阳到目标 → 算对
  {
    const cdp = await ctx.newCDPSession(page);
    const st = await state2(page);
    const p0 = await sunPoint(page, st.theta);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: p0.x, y: p0.y }] });
    let d = st.target - st.theta; d = Math.atan2(Math.sin(d), Math.cos(d));
    for (let i = 1; i <= 12; i++) {
      const q = await sunPoint(page, st.theta + d * i / 12);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: q.x, y: q.y }] });
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    check(await waitFor(page, () => window.Chapter2.state().streak === 1, 2500), 'touch drag (CDP) onto the target counts after 1 s');
  }

  // 横屏重建：状态保留
  await page.setViewportSize({ width: 1194, height: 834 });
  await sleep(700);
  s2 = await state2(page);
  check(s2.mode === 'play' && s2.streak === 1 && await litCount(page) > 0 && await page.evaluate(() => !!document.querySelector('#stage .sun-disc')), 'landscape rebuild keeps chapter 2 state (streak, lit stars, sun)');
  await page.screenshot({ path: OUT + '/21-ch2-landscape.png' });
  // iPhone：目标小月亮避开顶部
  await page.setViewportSize({ width: 390, height: 844 });
  await sleep(700);
  const tgtPos = await page.evaluate(() => window.__scene.target);
  check(tgtPos.y >= 230 && tgtPos.x === 200, 'target moon sits top-left: ' + JSON.stringify(tgtPos));
  await page.screenshot({ path: OUT + '/22-ch2-iphone.png' });
  await page.setViewportSize({ width: 834, height: 1194 });
  await sleep(700);

  // 小月亮图标 → 回第1章
  await page.click('#chapter-nav');
  check(await waitFor(page, () => window.__chapter === window.Chapter1, 5000), 'moon icon: back to chapter 1');
  check(await waitMode(page, 'play', 8000), 'chapter 1 intro plays again and ends in play');
  s = await state(page);
  check(await page.evaluate(() => !!document.querySelector('#stage .ring-guide') && !document.querySelector('#stage .sun-disc')), 'phase ring is back, sun gone');
  check(Math.abs(s.net) < 1e-6 && Math.abs(s.phase) < 1e-6 && await litCount(page) === 0, 'chapter 1 restarts fresh (traveler home, stars dim)');
  check(await navShown(page) && await navKind(page) === 'sun', 'sun icon shown again in chapter 1');
  check(await page.evaluate(() => JSON.parse(localStorage.getItem('moon.progress')).current === 1), 'current chapter persisted = 1');
  await page.screenshot({ path: OUT + '/23-back-to-ch1.png' });

  console.log('console/page errors:', errors.length ? errors : 'none');
  check(errors.length === 0, 'no console errors');
  await browser.close();
  console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
