// 第1章 端到端测试（无头 Chromium）：iPad 竖屏 / 横屏、逐批点亮、走满一圈的闪烁波、镜头往返、持久化、夜色切换、触摸事件
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
  check(await waitMode(page, 'return', 4000), 'auto-return starts after the hold (' + (Date.now() - tHold) + 'ms)');
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

  console.log('console/page errors:', errors.length ? errors : 'none');
  check(errors.length === 0, 'no console errors');
  await browser.close();
  console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
