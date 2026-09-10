// 端到端测试（无头 Chromium）
//   第1章：iPad 竖屏 / 横屏、逐批点亮、走满一圈的闪烁波、镜头往返、持久化、夜色切换、触摸事件
//   第2章：[太阳][→] 入口（底部正中，细线手绘感箭头）、淡出淡入、椭圆轨道（宽 85%、纵横比 0.45、粗虚线；后方变小 / 前方变大）、
//         均匀角速度的拖动（手指方位角 = 轨道角）、<mask> 亮面朝太阳、三步提词引导（±10° / 缺口 ≥ 25%）、
//         停住才开始的 1 秒细弧线（拖动中不计时、拖出清空）、顶部正中「目标月相 + 8 颗发光进度点」部件、
//         今晚的真实月相、星星波、[←][小月亮] 返回、重进直接从「一个月」开始、回第1章
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
async function waitFor(page, fn, timeout = 8000, arg) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) { if (await page.evaluate(fn, arg)) return true; await sleep(100); }
  return false;
}
// 椭圆轨道上轨道角 phi 的屏幕坐标（太阳所在处）
async function sunPoint(page, phi) {
  return page.evaluate(a => {
    const s = window.__scene, p = s.orbitPoint(a);
    const pt = new DOMPoint(p.x, p.y).matrixTransform(s.svg.getScreenCTM());
    return { x: pt.x, y: pt.y };
  }, phi);
}
// 均匀角速度的拖动：太阳要到轨道角 phi，手指该在哪——方位角 = phi − offset（按下时的偏移），落在轨道上
async function fingerPoint(page, phi, offset) {
  return page.evaluate(([p, off]) => {
    const s = window.__scene, q = s.orbitRay(p - off);
    const pt = new DOMPoint(q.x, q.y).matrixTransform(s.svg.getScreenCTM());
    return { x: pt.x, y: pt.y };
  }, [phi, offset]);
}
// 按在太阳上时的偏移 = 太阳的轨道角 − 太阳所在点相对中心的方位角（和 chapter2.js 的 onDown 一致）
async function grabOffset(page, phi) {
  return page.evaluate(p => {
    const s = window.__scene, o = s.orbit, q = s.orbitPoint(p);
    const a = p - Math.atan2(q.y - o.cy, q.x - o.cx);
    return Math.atan2(Math.sin(a), Math.cos(a));
  }, phi);
}
// 沿轨道把太阳从 from 拖到 to（走短弧）；release=false 时手指不松开。返回这次按下的偏移（继续拖时给 fingerPoint 用）
async function dragSun(page, from, to, steps = 12, release = true) {
  const p0 = await sunPoint(page, from);
  const off = await grabOffset(page, from);
  await page.mouse.move(p0.x, p0.y);
  await page.mouse.down();
  let d = to - from; d = Math.atan2(Math.sin(d), Math.cos(d));
  for (let i = 1; i <= steps; i++) {
    const p = await fingerPoint(page, from + d * i / steps, off);
    await page.mouse.move(p.x, p.y);
  }
  if (release) await page.mouse.up();
  return off;
}
const STILL_MS = 420;   // 手指停下后，「基本停住」的判定生效要等一个速度时间窗（speedWindowMs 250 + 30）；留点余量
const navShown = page => page.evaluate(() => document.getElementById('chapter-nav').classList.contains('show'));
const navKind = page => page.evaluate(() => document.getElementById('chapter-nav').getAttribute('data-kind'));
const promptText = page => page.evaluate(() => document.getElementById('prompt').textContent);
const deg = r => r * 180 / Math.PI;
const litDots = page => page.evaluate(() => document.querySelectorAll('#goal .goal-guide .goal-dot.lit').length);
const litRing = page => page.evaluate(() => document.querySelectorAll('#goal .goal-month .goal-dot.lit').length);
const arcT = page => page.evaluate(() => { const a = document.querySelector('#stage .dwell-arc'); return 1 - parseFloat(a.getAttribute('stroke-dashoffset')) / parseFloat(a.getAttribute('stroke-dasharray')); });
const sunInfo = page => page.evaluate(() => {
  const g = document.querySelector('#stage .sun');
  const m = /translate\(([-\d.]+) ([-\d.]+)\) scale\(([-\d.]+)\)/.exec(g.getAttribute('transform'));
  return { x: +m[1], y: +m[2], scale: +m[3], layer: g.parentNode.getAttribute('class'), depth: g.getAttribute('data-depth') };
});
const toRgb = hex => 'rgb(' + [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)).join(', ') + ')';

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
  // 第2章 月亮不发光（玩家自己的眼睛：没有地面、小人、镜头往返；椭圆轨道；三步提词引导 → 一个月 → 今晚）
  // =====================================================================================
  console.log('\n--- chapter 2 ---');
  await page.setViewportSize({ width: 834, height: 1194 });
  await sleep(600);
  check((await state(page)).mode === 'play' && await navShown(page) && await navKind(page) === 'sun', 'back on iPad portrait: chapter 1 playable, sun entry shown');
  check(await page.evaluate(() => !!document.querySelector('#chapter-nav .nav-arrow[data-dir="right"]') && !!document.querySelector('#chapter-nav .nav-sun')), 'chapter 1 entry is [sun][→]');
  // 入口位置：底部正中，箭头在太阳右侧
  const navBox = await page.evaluate(() => {
    const n = document.getElementById('chapter-nav'), r = n.getBoundingClientRect();
    const sun = n.querySelector('.nav-sun').closest('svg').getBoundingClientRect(), arrow = n.querySelector('.nav-arrow').getBoundingClientRect();
    return { cx: +(r.left + r.width / 2).toFixed(1), bottomGap: +(innerHeight - r.bottom).toFixed(1), vw: innerWidth, sunRight: +sun.right.toFixed(1), arrowLeft: +arrow.left.toFixed(1) };
  });
  check(Math.abs(navBox.cx - navBox.vw / 2) < 4 && navBox.bottomGap > 0 && navBox.bottomGap < 60 && navBox.arrowLeft >= navBox.sunRight - 1, 'entry sits at the bottom centre with → to the right of the sun: ' + JSON.stringify(navBox));
  // 箭头样式：细线、圆头、略带手绘感（曲线）、低不透明度、呼吸动画
  const arrowStyle = await page.evaluate(() => {
    const a = document.querySelector('#chapter-nav .nav-arrow'), p = a.querySelector('.nav-arrow-stroke'), cs = getComputedStyle(p);
    return { w: parseFloat(cs.strokeWidth), cap: cs.strokeLinecap, join: cs.strokeLinejoin, anim: getComputedStyle(a).animationName,
             alpha: parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--s-arrow-alpha')), curved: /C /.test(p.getAttribute('d')) };
  });
  check(arrowStyle.w <= 2 && arrowStyle.cap === 'round' && arrowStyle.join === 'round' && arrowStyle.anim === 'breathe-scale' && arrowStyle.alpha <= 0.5 && arrowStyle.curved, 'arrows are thin, round-capped, hand-drawn curves, low opacity, breathing: ' + JSON.stringify(arrowStyle));
  for (const key of ['sun', 'orbit', 'prompt', 'progress', 'progressDim']) {
    check(await page.evaluate(k => !!getComputedStyle(document.documentElement).getPropertyValue(window.THEME.cssVar(k)).trim(), key), 'theme exposes ' + key + ' as a CSS variable');
    for (const name of ['ink', 'indigo', 'violet']) {
      check(await page.evaluate(([n, k]) => /^#[0-9a-f]{6}$/i.test(window.THEME.PRESETS[n][k]), [name, key]), 'preset ' + name + ' has ' + key + ' color');
    }
  }
  check(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--s-orbit-width-ratio').trim() === String(window.THEME.STYLE.orbitWidthRatio) && window.THEME.STYLE.orbitAspect === 0.45), 'theme.js STYLE (sizes) exposed as --s-* variables');
  check(await page.evaluate(() => document.getElementById('hud').hidden), 'HUD (prompt / goal widget / strip) hidden in chapter 1');

  // 点 [太阳][→] → 第1章镜头落到小人身上 → 淡出 → 第2章淡入（第2章没有小人，没有开场镜头）
  await page.click('#chapter-nav');
  await sleep(150);
  check((await state(page)).mode === 'leave' && !(await navShown(page)), 'tapping the entry: chapter 1 leaves (camera heads to the kid), entry hides');
  check(await waitFor(page, () => document.body.classList.contains('fade'), 5000), 'stage fades out between chapters');
  check(await waitFor(page, () => window.__chapter === window.Chapter2, 5000), 'scene swapped to chapter 2');
  check(await waitFor(page, () => !document.body.classList.contains('fade'), 3000), 'stage fades back in');
  let s2 = await state2(page);
  const P2 = await page.evaluate(() => ({ still: window.PARAMS.guide.stillDegPerSec, tol: window.PARAMS.guide.toleranceDeg, window: window.PARAMS.guide.speedWindowMs, moonR: window.THEME.STYLE.goalMoonR }));
  check(P2.tol === 10 && P2.still > 0, 'tolerance is ±10°, stillness threshold ' + P2.still + '°/s over ' + P2.window + ' ms');
  check(s2.mode === 'play', 'chapter 2 starts directly in play (no kid intro), mode=' + s2.mode);
  check(await page.evaluate(() => document.getElementById('stage').getAttribute('data-chapter') === '2' && !!document.querySelector('#stage .sun-disc') && !document.querySelector('#stage .ring-guide')), 'chapter 2 scene: sun present, phase ring gone');
  check(await page.evaluate(() => !document.querySelector('#stage .layer-ground') && !document.querySelector('#stage .kid') && !document.querySelector('#stage .window')), 'no ground, no house, no kid in chapter 2');
  check(await page.evaluate(() => document.querySelectorAll('#stage .orbit-guide').length === 2 && !!document.querySelector('#stage .layer-sun-back .orbit-back') && !!document.querySelector('#stage .layer-sun-front .orbit-front')), 'elliptical orbit drawn as a back half (behind the moon) and a front half (in front)');
  const orb = await page.evaluate(() => window.__scene.orbit);
  check(Math.abs(orb.rx * 2 / 1668 - 0.85) < 0.005 && Math.abs(orb.ry / orb.rx - 0.45) < 0.005 && orb.ry > (await page.evaluate(() => window.__scene.moon.r)), 'orbit is ~85% of the screen width with aspect 0.45: ' + JSON.stringify(orb));
  const orbStyle = await page.evaluate(() => { const f = document.querySelector('#stage .orbit-front'), b = document.querySelector('#stage .orbit-back'); return { w: parseFloat(getComputedStyle(f).strokeWidth), front: parseFloat(getComputedStyle(f).opacity), back: parseFloat(getComputedStyle(b).opacity), dash: f.getAttribute('stroke-dasharray'), stroke: getComputedStyle(f).stroke }; });
  const indigoP = await page.evaluate(() => window.THEME.PRESETS.indigo);
  check(orbStyle.w >= 5 && orbStyle.front >= 0.8 && orbStyle.back >= 0.4 && orbStyle.back < orbStyle.front && orbStyle.stroke === toRgb(indigoP.orbit), 'orbit dashes are thick and high-contrast: ' + JSON.stringify(orbStyle));
  check(await page.evaluate(() => document.querySelector('#stage .layer-moon [mask]') && document.querySelector('#stage mask#mask-moon-lit path') && !document.querySelector('#stage [clip-path]')), 'big moon lit side is driven by an SVG <mask> (no clipPath, no prebuilt phase images)');
  check(await page.evaluate(() => JSON.parse(localStorage.getItem('moon.progress')).current === 2), 'current chapter persisted = 2');
  check(!(await navShown(page)), 'no return key before chapter 2 is completed');
  check(await page.evaluate(() => !document.getElementById('hud').hidden), 'HUD shown in chapter 2');
  check(await waitFor(page, () => document.getElementById('prompt').textContent === '你能找到满月吗？', 2000), 'step 1 prompt (fades in): ' + await promptText(page));
  check(await page.evaluate(() => parseFloat(getComputedStyle(document.getElementById('prompt')).fontSize) >= 26), 'prompt font is large: ' + await page.evaluate(() => getComputedStyle(document.getElementById('prompt')).fontSize));
  check(await page.evaluate(() => document.querySelectorAll('#goal .goal-guide .goal-dot').length === 3 && !document.querySelector('#goal .goal-guide').hasAttribute('hidden') && document.querySelector('#goal .goal-month').hasAttribute('hidden')) && await litDots(page) === 0, 'guide: three progress dots in the top widget, none lit; month ring hidden');
  const goalPos = await page.evaluate(() => { const r = document.getElementById('goal').getBoundingClientRect(); return { cx: +(r.left + r.width / 2).toFixed(1), top: +r.top.toFixed(1), vw: innerWidth }; });
  check(Math.abs(goalPos.cx - goalPos.vw / 2) < 3 && goalPos.top < 60, 'goal widget sits at the top centre: ' + JSON.stringify(goalPos));
  check(await page.evaluate(() => getComputedStyle(document.querySelector('#goal .goal-guide .goal-dot .dot-core')).fill) === toRgb(indigoP.progressDim), 'unlit progress dot is the dim color');
  check(await page.evaluate(() => document.querySelectorAll('#phase-strip .strip-moon').length === 8), 'phase strip has 8 small moons');
  check(await page.evaluate(() => document.getElementById('stage').classList.contains('hint')), 'sun glow breathes before the first drag');
  check(Math.abs(s2.phi) < 1e-6 && s2.step === 0 && Math.abs(s2.fraction - 0.5) < 1e-6, 'sun starts at the right (first quarter), step 0');
  check(await page.evaluate(() => Array.from(document.querySelectorAll('#phase-strip .strip-moon')).findIndex(g => g.classList.contains('current')) === 2), 'strip highlights first quarter (index 2)');
  let si = await sunInfo(page);
  check(Math.abs(si.scale - 0.95) < 0.01 && si.layer.includes('layer-sun-back') === false && si.depth === 'front', 'sun at the side: mid scale, on the front layer');
  await page.screenshot({ path: OUT + '/12-ch2-start.png' });

  // 均匀角速度：按在太阳上（正右方，偏移 0），手指绕中心转到方位角 45° → 太阳的轨道角也是 45°（旧映射会给 66°）
  const moonC = await page.evaluate(() => window.__scene.moon);
  {
    const p0 = await sunPoint(page, 0);
    await page.mouse.move(p0.x, p0.y); await page.mouse.down();
    const q = await fingerPoint(page, Math.PI / 4, 0); await page.mouse.move(q.x, q.y); await sleep(40);
    s2 = await state2(page);
    check(Math.abs(s2.phi - Math.PI / 4) < 0.02, 'finger azimuth 45° → sun orbit angle 45° (uniform angular speed), got ' + deg(s2.phi).toFixed(1) + '°');
    const si45 = await sunInfo(page), want45 = await page.evaluate(() => window.__scene.orbitPoint(Math.PI / 4));
    check(Math.abs(si45.x - want45.x) < 0.5 && Math.abs(si45.y - want45.y) < 0.5, 'sun is projected onto the ellipse at that angle');
    const q2 = await fingerPoint(page, Math.PI / 2, 0); await page.mouse.move(q2.x, q2.y); await sleep(40);
    s2 = await state2(page);
    check(Math.abs(s2.phi - Math.PI / 2) < 0.02, 'another 45° of finger → another 45° of sun (no speed-up at the ends): ' + deg(s2.phi).toFixed(1) + '°');
    const far = await page.evaluate(() => { const s = window.__scene, o = s.orbit, a = Math.PI * 0.75; const pt = new DOMPoint(o.cx + 0.6 * o.rx * Math.cos(a), o.cy + 0.6 * o.rx * Math.sin(a)).matrixTransform(s.svg.getScreenCTM()); return { x: pt.x, y: pt.y }; });
    await page.mouse.move(far.x, far.y); await sleep(40);
    s2 = await state2(page);
    check(Math.abs(s2.phi - Math.PI * 0.75) < 0.02, 'distance of the finger from the centre does not matter, only its azimuth: ' + deg(s2.phi).toFixed(1) + '°');
    await page.mouse.up();
    await sleep(STILL_MS);
    check((await state2(page)).step === 0 && !(await state2(page)).dwelling, 'sweeping through the full-moon zone without stopping did not count');
  }

  // 亮面朝太阳 + 前后深度：顶 → 新月、太阳变小在月亮上方（后层）；底 → 满月、太阳变大盖在月亮前面；左上 → 蛾眉月朝左上
  const litInfo = () => page.evaluate(() => {
    const p = document.querySelector('#stage mask#mask-moon-lit path');
    const g = document.querySelector('#stage .layer-moon [mask]');
    const sp = document.getElementById('g-sphere');
    return { d: p.getAttribute('d'), tr: p.getAttribute('transform') || '', hidden: getComputedStyle(g).visibility === 'hidden',
             glow: parseFloat(document.querySelector('#stage .moon-glow').style.opacity), sphereCx: +sp.getAttribute('cx'), sphereCy: +sp.getAttribute('cy') };
  });
  s2 = await state2(page);
  await dragSun(page, s2.phi, -Math.PI / 2, 10);           // 拖到椭圆最上端 = 正后方
  await sleep(150);
  s2 = await state2(page); let li = await litInfo(); si = await sunInfo(page);
  check(Math.abs(s2.phi + Math.PI / 2) < 0.02 && li.hidden && Math.abs(li.glow - 0.35) < 0.02, 'sun at the top (behind the moon): new moon, lit side hidden, glow at minimum');
  check(Math.abs(si.scale - 0.6) < 0.01 && si.layer.includes('layer-sun-back') && si.depth === 'back', 'behind the moon: sun scaled to 0.6 and on the back layer');
  check(si.y < moonC.cy - moonC.r, 'small sun sits above the moon (orbit is wide enough that it no longer overlaps)');
  check(!(await page.evaluate(() => document.getElementById('stage').classList.contains('hint'))), 'hint removed after first drag');
  check(await page.evaluate(() => Array.from(document.querySelectorAll('#phase-strip .strip-moon')).findIndex(g => g.classList.contains('current')) === 0), 'strip highlights new moon (index 0)');
  await sleep(STILL_MS + 1100);
  check(await litDots(page) === 0 && (await state2(page)).step === 0, 'hiding the moon during step 1 does not count (wrong step)');
  await page.screenshot({ path: OUT + '/13-ch2-new-moon-behind.png' });
  await dragSun(page, -Math.PI / 2, -Math.PI * 3 / 4, 6); // 左上
  await sleep(150);
  li = await litInfo(); s2 = await state2(page);
  check(!li.hidden && /A 144\.96,205 0 0 0/.test(li.d) && /rotate\(-1[45]\d/.test(li.tr), 'sun upper-left: thin crescent, terminator rotated to face the sun on screen (' + li.tr + ')');
  check(Math.abs(s2.fraction - 0.146) < 0.01, 'crescent fraction from depth: ' + s2.fraction.toFixed(3));
  await page.screenshot({ path: OUT + '/14-ch2-crescent.png' });

  // 第一步：+15° 在 ±10° 之外——不算；+7° 在里面——手指刚停时太阳还有速度不计时，停住一个时间窗后才开始 1 秒倒计时
  await dragSun(page, s2.phi, Math.PI / 2 + 15 * Math.PI / 180, 14);
  await sleep(STILL_MS + 400);
  s2 = await state2(page);
  check(s2.step === 0 && !s2.dwelling && (await arcT(page)) < 0.01, '15° off the front is outside ±10°: no dwell, arc empty');
  await dragSun(page, s2.phi, Math.PI / 2 + 7 * Math.PI / 180, 8, false);   // 误差内，手指按着
  s2 = await state2(page);
  check(s2.step === 0 && !s2.dwelling && s2.speed > P2.still, 'right after the finger stops: in the zone but not yet still (speed ' + s2.speed.toFixed(0) + '°/s) → no countdown yet');
  await sleep(STILL_MS);
  s2 = await state2(page); li = await litInfo(); si = await sunInfo(page);
  check(s2.step === 0 && s2.dwelling && s2.speed <= P2.still, 'after a still window (speed ' + s2.speed.toFixed(1) + '°/s): 1 s countdown running');
  check(!li.hidden && s2.fraction > 0.95, 'near full moon (fraction ' + s2.fraction.toFixed(3) + ')');
  check(si.scale > 1.25 && si.layer.includes('layer-sun-front') && si.depth === 'front' && si.y > moonC.cy, 'in front of the moon: sun scaled to ~1.3, on the front layer, below the moon centre (scale ' + si.scale + ')');
  const a1 = await arcT(page);
  await sleep(300);
  const a2 = await arcT(page);
  check(a1 > 0 && a2 > a1 && a2 < 1, 'dwell arc fills up over time: ' + a1.toFixed(2) + ' → ' + a2.toFixed(2));
  await page.screenshot({ path: OUT + '/15-ch2-dwell-arc.png' });
  check(await waitFor(page, () => window.Chapter2.state().step === 1, 2000), 'after 1 s (finger still down): step 1 complete');
  await page.mouse.up();
  check(await litDots(page) === 1, 'first progress dot lit');
  await sleep(700);
  check(await page.evaluate(() => { const d = document.querySelector('#goal .goal-guide .goal-dot.lit'); return getComputedStyle(d.querySelector('.dot-core')).fill === getComputedStyle(document.documentElement).getPropertyValue('--c-progress').trim().replace(/^#(..)(..)(..)$/, (m, r, g, b) => 'rgb(' + [r, g, b].map(h => parseInt(h, 16)).join(', ') + ')') && parseFloat(getComputedStyle(d.querySelector('.dot-glow')).opacity) > 0.9; }), 'lit dot is bright with a visible glow (no star shapes)');
  check(await page.evaluate(() => document.querySelectorAll('#goal path').length === document.querySelectorAll('#goal .goal-moon path').length), 'progress uses circles only, no star paths');
  check(await page.evaluate(() => document.querySelector('#stage .moon-glow').classList.contains('surge')), 'moon glow surges on completion');
  const lit1 = await litCount(page);
  check(lit1 > 0 && lit1 < N, 'some stars lit after step 1: ' + lit1);
  check(await waitFor(page, () => document.getElementById('prompt').textContent === '满月是从哪一边开始变缺的？' && !document.getElementById('prompt').classList.contains('out'), 3000), 'step 2 prompt appears: ' + await promptText(page));
  check(await waitFor(page, () => window.Chapter2.state().armed, 2000), 'step 2 armed');
  check(await page.evaluate(() => document.querySelectorAll('#stage .dwell-arc').length === 1 && document.querySelector('#stage .dwell-arc').style.opacity === '0'), 'arc cleared after completion');
  await page.screenshot({ path: OUT + '/16-ch2-step2.png' });

  // 第二步：缺口不够（20%）不算；停住后弧线开始填；拖出区域弧线清空；缺口 ≥ 25% 停 1 秒算
  s2 = await state2(page);
  await dragSun(page, s2.phi, Math.asin(0.6), 8);        // fraction 0.8 → 缺 20%
  await sleep(STILL_MS + 600);
  s2 = await state2(page);
  check(s2.step === 1 && !s2.dwelling && Math.abs(s2.fraction - 0.8) < 0.02, 'gap of 20% is not enough (fraction ' + s2.fraction.toFixed(2) + '), no dwell');
  let off = await dragSun(page, s2.phi, Math.asin(0.3), 6, false); // fraction 0.65 → 缺 35%，手指按着
  await sleep(STILL_MS + 350);
  s2 = await state2(page);
  check(s2.dwelling && (await arcT(page)) > 0.15, 'gap of 35%: once still, dwell running, arc filling (' + (await arcT(page)).toFixed(2) + ')');
  {                                                     // 拖回去：弧线清空
    const p = await fingerPoint(page, Math.asin(0.8), off); await page.mouse.move(p.x, p.y); await sleep(200);
    s2 = await state2(page);
    check(!s2.dwelling && (await arcT(page)) < 0.01 && s2.step === 1, 'dragging back out of the region clears the arc and cancels the dwell');
    const q = await fingerPoint(page, Math.PI - Math.asin(0.3), off); await page.mouse.move(q.x, q.y);   // 另一边（左）也行
  }
  check(await waitFor(page, () => window.Chapter2.state().step === 2, 3000), 'holding on the other side (left, waning) with the finger down counts: step 2 complete');
  await page.mouse.up();
  check(await litDots(page) === 2, 'second progress dot lit');
  check(await waitFor(page, () => document.getElementById('prompt').textContent === '能把月亮藏起来吗？' && window.Chapter2.state().armed, 3000), 'step 3 prompt appears: ' + await promptText(page));
  await page.screenshot({ path: OUT + '/17-ch2-step3.png' });

  // 第三步：40° 外不算；在区域里来回晃 1.4 秒（拖动中）不计时、弧线不动；停下才开始计时 → 进入「一个月」
  s2 = await state2(page);
  await dragSun(page, s2.phi, -Math.PI / 2 + 40 * Math.PI / 180, 10);
  await sleep(STILL_MS + 1100);
  s2 = await state2(page);
  check(s2.step === 2 && !s2.dwelling, 'holding 40° off the back does not count');
  {
    off = await dragSun(page, s2.phi, -Math.PI / 2, 8, false);
    const pts = [await fingerPoint(page, -Math.PI / 2 - 8 * Math.PI / 180, off), await fingerPoint(page, -Math.PI / 2 + 8 * Math.PI / 180, off)];
    const t0 = Date.now(); let i = 0, maxArc = 0, sawDwell = false, maxGap = 0, last = Date.now();
    while (Date.now() - t0 < 1400) {                   // 每次只来回一次 + 一次读状态，间隔远小于速度时间窗（250 ms）
      const p = pts[i++ % 2]; await page.mouse.move(p.x, p.y);
      const nowT = Date.now(); maxGap = Math.max(maxGap, nowT - last); last = nowT;
      await sleep(50);
      const st = await page.evaluate(() => { const a = document.querySelector('#stage .dwell-arc'); return { dw: window.Chapter2.state().dwelling, arc: 1 - parseFloat(a.getAttribute('stroke-dashoffset')) / parseFloat(a.getAttribute('stroke-dasharray')) }; });
      maxArc = Math.max(maxArc, st.arc); if (st.dw) sawDwell = true;
    }
    s2 = await state2(page);
    if (maxGap < P2.window - 20) check(s2.step === 2 && !sawDwell && maxArc < 0.01 && Math.abs(s2.phi + Math.PI / 2) < 10 * Math.PI / 180, 'moving back and forth inside the ±10° zone for 1.4 s: no countdown, arc stays empty (max gap between moves ' + maxGap + ' ms)');
    else check(s2.step === 2, 'wiggle test: harness paused ' + maxGap + ' ms between moves (longer than the still window), only checking that nothing completed');
    const tStop = Date.now();
    check(await waitFor(page, () => window.Chapter2.state().dwelling, 1200), 'stopping the finger (still down) starts the countdown after ' + (Date.now() - tStop) + ' ms');
    check(await waitFor(page, () => window.Chapter2.state().round === 'month', 4000), 'third step done → month round (no win yet)');
    await page.mouse.up();
  }
  s2 = await state2(page);
  check(s2.mode === 'play' && s2.progress.completed === false && s2.progress.guided === true, 'not completed yet; guided flag saved: ' + JSON.stringify(s2.progress));
  check(await page.evaluate(() => document.querySelector('#goal .goal-guide').hasAttribute('hidden') && !document.querySelector('#goal .goal-month').hasAttribute('hidden') && document.querySelectorAll('#goal .goal-month .goal-dot').length === 8 && document.querySelectorAll('#goal .goal-month .goal-dot.lit').length === 0 && !document.querySelector('#goal .goal-moon').hasAttribute('hidden')), 'guide dots replaced by the goal widget: target moon in the centre, 8 unlit glow dots around it');
  check(await page.evaluate(() => getComputedStyle(document.querySelector('#goal .goal-guide')).display === 'none' && getComputedStyle(document.querySelector('#goal .goal-month')).display !== 'none'), 'guide dots really not displayed, month widget displayed');
  const goalGeo = await page.evaluate(() => {
    const g = document.getElementById('goal').getBoundingClientRect(), m = document.querySelector('#goal .goal-moon .m-dark').getBoundingClientRect();
    const mc = { x: m.left + m.width / 2, y: m.top + m.height / 2 };
    const radii = Array.from(document.querySelectorAll('#goal .goal-month .goal-dot .dot-core')).map(d => { const r = d.getBoundingClientRect(); return Math.hypot(r.left + r.width / 2 - mc.x, r.top + r.height / 2 - mc.y); });
    return { widgetCx: +(g.left + g.width / 2).toFixed(1), widgetTop: +g.top.toFixed(1), vw: innerWidth, moonDx: +(mc.x - (g.left + g.width / 2)).toFixed(1), moonDy: +(mc.y - (g.top + g.height / 2)).toFixed(1), rMin: +Math.min(...radii).toFixed(1), rMax: +Math.max(...radii).toFixed(1) };
  });
  check(Math.abs(goalGeo.widgetCx - goalGeo.vw / 2) < 3 && goalGeo.widgetTop < 60 && Math.abs(goalGeo.moonDx) < 1.5 && Math.abs(goalGeo.moonDy) < 1.5 && goalGeo.rMax - goalGeo.rMin < 1 && goalGeo.rMin > 35, 'widget at the top centre, target moon centred, 8 dots on a ring around it: ' + JSON.stringify(goalGeo));
  check(await litCount(page) === 0, 'sky dimmed again at the start of the month');
  check(await waitFor(page, () => document.getElementById('prompt').textContent === '下一个是这样的月亮' && window.Chapter2.state().armed, 3000), 'month prompt: ' + await promptText(page));
  await page.screenshot({ path: OUT + '/18-ch2-month-start.png' });

  // 八个目标依次：新月 → 蛾眉月 → 上弦月 → 盈凸月 → 满月 → 亏凸月 → 下弦月 → 残月；目标月相 = 中央月亮在目标位置的样子
  const targetLit = () => page.evaluate(() => { const p = document.querySelector('#goal .goal-moon .m-lit'); return { d: p.getAttribute('d') || '', tr: p.getAttribute('transform') || '', hidden: p.style.visibility === 'hidden' }; });
  const fullRe = new RegExp('A ' + P2.moonR + ',' + P2.moonR + ' 0 0 1 [\\d.]+,[\\d.]+ A ' + P2.moonR + ',' + P2.moonR + ' 0 0 1');
  for (let k = 0; k < 8; k++) {
    check(await waitFor(page, n => window.Chapter2.state().step === n && window.Chapter2.state().armed, 3000, k), `target ${k} armed (prompt / target moon swapped)`);
    s2 = await state2(page);
    const want = await page.evaluate(c => window.MoonMath.orbitAngleForCycle(c), k / 8);
    check(s2.round === 'month' && s2.step === k && Math.abs(s2.target - want) < 1e-6, `target ${k} (${['新月','蛾眉月','上弦月','盈凸月','满月','亏凸月','下弦月','残月'][k]}) at orbit angle ${deg(want).toFixed(0)}°`);
    const tl = await targetLit();
    if (k === 0) check(tl.hidden, 'target moon shows a new moon (dark)');
    if (k === 4) check(!tl.hidden && fullRe.test(tl.d), 'target moon shows a full moon');
    if (k === 3) check(!tl.hidden && /rotate\(2\d/.test(tl.tr), 'target gibbous is rotated like the big moon would be (' + tl.tr + ')');
    if (k === 1) {                                     // 误差外不算（±10°）
      await dragSun(page, s2.phi, want + 14 * Math.PI / 180, 8); await sleep(STILL_MS + 1100);
      s2 = await state2(page);
      check(s2.step === 1 && !s2.dwelling, 'holding 14° off the crescent target does not count (±10°)');
    }
    if (k === 0) {                                     // 引导刚把太阳留在正后方附近：第一个目标（新月）不用拖，停 1 秒就算
      check(s2.dwelling || s2.step === 1, 'sun already at the new moon after the guide: dwell runs by itself');
    } else if (k === 2) {                              // 手指按着、极慢地漂移（约 10°/s，低于阈值）：算「停住」，倒计时照常进行
      off = await dragSun(page, (await state2(page)).phi, want - 6 * Math.PI / 180, 10, false);
      const tD = Date.now();
      for (let j = 1; j <= 12; j++) { const p = await fingerPoint(page, want + (-6 + j) * Math.PI / 180, off); await page.mouse.move(p.x, p.y); await sleep(100); }
      check(await waitFor(page, () => window.Chapter2.state().step === 3, 1500), 'slow drift below the stillness threshold still counts as holding (completed ' + (Date.now() - tD) + ' ms after the drift began)');
      await page.mouse.up();
    } else {
      await dragSun(page, (await state2(page)).phi, want + (k % 2 ? 6 : -6) * Math.PI / 180, 10);
    }
    check(await waitFor(page, n => window.Chapter2.state().step === n, 3000, k + 1), `target ${k} reached after 1 s`);
    check(await litRing(page) === k + 1, `${k + 1} dot(s) lit`);
    if (k === 3) { await sleep(700); await page.screenshot({ path: OUT + '/19-ch2-month-4.png' }); }
    await sleep(1000);
  }
  const litM = await litCount(page);
  check(litM === N && (await state2(page)).lit === 8, 'each phase lit one batch of stars: all lit after 8 targets');

  // 最后一题：今晚的月亮 —— 目标按设备日期算真实月相
  check(await waitFor(page, () => window.Chapter2.state().round === 'tonight' && window.Chapter2.state().armed, 4000), 'after 8 dots: tonight round');
  s2 = await state2(page);
  check(await promptText(page) === '今晚的月亮，是什么样的？', 'tonight prompt: ' + await promptText(page));
  const tonight = await page.evaluate(() => window.MoonMath.phaseForDate(new Date()));
  check(Math.abs(s2.tonightCycle - tonight) < 0.001 && Math.abs(s2.target - (await page.evaluate(c => window.MoonMath.orbitAngleForCycle(c), tonight))) < 1e-3, 'tonight target = real phase from the device date: cycle ' + tonight.toFixed(3));
  const known = await page.evaluate(() => [window.MoonMath.phaseForDate(new Date('2024-01-11T11:57Z')), window.MoonMath.phaseForDate(new Date('2024-01-25T17:54Z')), window.MoonMath.phaseForDate(new Date('2025-01-29T12:36Z'))]);
  check(Math.min(known[0], 1 - known[0]) < 0.034 && Math.abs(known[1] - 0.5) < 0.034 && Math.min(known[2], 1 - known[2]) < 0.034, 'phaseForDate within a day of known new/full moons: ' + known.map(x => x.toFixed(3)).join(' / '));
  check(await litRing(page) === 8 && await page.evaluate(() => !document.querySelector('#goal .goal-moon').hasAttribute('hidden')), '8 dots lit, target moon still shown in the centre');
  await page.screenshot({ path: OUT + '/20-ch2-tonight.png' });
  await dragSun(page, s2.phi, s2.target + 8 * Math.PI / 180, 12);
  check(await waitMode2(page, 'win', 4000), 'tonight reached → win');
  s2 = await state2(page);
  check(await litCount(page) === N && s2.lit === 8, 'all stars lit on the win');
  check(await page.evaluate(() => document.querySelectorAll('#stage .star.wave').length) === N, 'star wave on every star (same as chapter 1)');
  check(await page.evaluate(() => document.querySelectorAll('#stage .sparkle.lit').length) > 0, 'sparkles appear on the first chapter 2 win');
  check(s2.progress.completed === true && s2.progress.rounds === 1, 'chapter 2 progress saved: ' + JSON.stringify(s2.progress));
  check(!(await navShown(page)), 'return key not yet shown during the wave');
  await sleep(400);
  await page.screenshot({ path: OUT + '/21-ch2-win-wave.png' });
  check(await waitMode2(page, 'done', 4000), 'after the wave: done (no camera move)');
  const vb2 = await page.evaluate(() => document.getElementById('stage').getAttribute('viewBox'));
  check(vb2 === '0 0 1668 2388', 'camera never moved in chapter 2: viewBox ' + vb2);
  check(await navShown(page) && await navKind(page) === 'moon', 'return key [←][moon] appears after the win');
  check(await page.evaluate(() => { const n = document.getElementById('chapter-nav'); return n.firstChild.classList.contains('nav-arrow') && n.firstChild.getAttribute('data-dir') === 'left' && !!n.querySelector('.nav-moon-lit'); }), '← sits to the left of the small moon');
  check(await page.evaluate(() => { const a = document.querySelector('#chapter-nav .nav-arrow'), p = a.querySelector('.nav-arrow-stroke'); return getComputedStyle(a).animationName === 'breathe-scale' && parseFloat(getComputedStyle(p).strokeWidth) <= 2 && /C /.test(p.getAttribute('d')); }), '← is the same thin hand-drawn breathing arrow');
  check(await waitFor(page, () => document.getElementById('prompt').classList.contains('out') && document.querySelector('#goal .goal-moon').hasAttribute('hidden'), 2000), 'prompt and target hidden after the win (8 lit dots stay)');
  await sleep(600);
  await page.screenshot({ path: OUT + '/22-ch2-done.png' });
  // 过关后太阳仍可自由拖
  await dragSun(page, (await state2(page)).phi, Math.PI, 8); await sleep(150);
  s2 = await state2(page);
  check(s2.mode === 'done' && Math.abs(Math.abs(s2.phi) - Math.PI) < 0.05, 'sun still draggable after the win (free play)');

  // 夜色切换时太阳色 / 轨道色 / 提词色 / 进度点色跟着换
  await page.click('.theme-dot[data-theme="ink"]'); await sleep(900);
  const inkP = await page.evaluate(() => window.THEME.PRESETS.ink);
  const cols = await page.evaluate(() => ({
    sun: getComputedStyle(document.querySelector('#stage .sun-disc')).fill,
    orbit: getComputedStyle(document.querySelector('#stage .orbit-front')).stroke,
    prompt: getComputedStyle(document.getElementById('prompt')).color,
    dot: getComputedStyle(document.querySelector('#goal .goal-month .goal-dot.lit .dot-core')).fill,
    dim: getComputedStyle(document.documentElement).getPropertyValue('--c-progress-dim').trim(),   // 过关后所有进度点都亮着，看变量本身
    arc: getComputedStyle(document.querySelector('#stage .dwell-arc')).stroke
  }));
  check(cols.sun === toRgb(inkP.sun) && cols.orbit === toRgb(inkP.orbit) && cols.prompt === toRgb(inkP.prompt) && cols.dot === toRgb(inkP.progress) && cols.dim === inkP.progressDim && cols.arc === toRgb(inkP.progress), 'theme colors applied: ' + JSON.stringify(cols));
  await page.screenshot({ path: OUT + '/23-ch2-theme-ink.png' });
  await page.click('.theme-dot[data-theme="indigo"]'); await sleep(300);

  // 重新加载：直接回到第2章（记住了当前章节），引导不再出现，直接从「一个月」开始；四角星在
  await page.reload(); await sleep(400);
  check(await page.evaluate(() => window.__chapter === window.Chapter2 && window.Chapter2.state().mode === 'play' && window.Chapter2.state().round === 'month' && window.Chapter2.state().step === 0), 'reload lands in chapter 2 (remembered), straight into the month round (guide only once)');
  check(await page.evaluate(() => document.querySelector('#goal .goal-guide').hasAttribute('hidden') && !document.querySelector('#goal .goal-month').hasAttribute('hidden') && !document.querySelector('#goal .goal-moon').hasAttribute('hidden')), 'goal widget (target + ring) shown, guide dots hidden on re-entry');
  check(await page.evaluate(() => document.querySelectorAll('#stage .sparkle.lit').length) > 0, 'chapter 2 sparkles persist after reload');
  check(await waitFor(page, () => document.getElementById('prompt').textContent === '下一个是这样的月亮', 2000) && await litRing(page) === 0, 'month prompt, no dots lit');
  check(!(await navShown(page)), 'return key waits for this round\'s win');
  await page.screenshot({ path: OUT + '/24-ch2-reentry.png' });

  // 触摸（CDP）拖太阳到第一个目标 → 松手停住 1 秒算
  {
    const cdp = await ctx.newCDPSession(page);
    const st = await state2(page);
    const p0 = await sunPoint(page, st.phi);
    const off0 = await grabOffset(page, st.phi);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: p0.x, y: p0.y }] });
    let dd = st.target - st.phi; dd = Math.atan2(Math.sin(dd), Math.cos(dd));
    for (let i = 1; i <= 12; i++) {
      const q = await fingerPoint(page, st.phi + dd * i / 12, off0);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: q.x, y: q.y }] });
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    check(await waitFor(page, () => window.Chapter2.state().step === 1, 2500), 'touch drag (CDP) onto the first month target counts after 1 s');
  }

  // 横屏重建：状态保留（目标序号、进度点、星）
  await page.setViewportSize({ width: 1194, height: 834 });
  await sleep(900);
  s2 = await state2(page);
  check(s2.mode === 'play' && s2.round === 'month' && s2.step === 1 && await litRing(page) === 1 && await litCount(page) > 0 && await page.evaluate(() => !!document.querySelector('#stage .sun-disc')), 'landscape rebuild keeps chapter 2 state (month step, dot, lit stars, sun)');
  check(await waitFor(page, () => document.getElementById('prompt').textContent === '下一个是这样的月亮', 2000) && await page.evaluate(() => !document.querySelector('#goal .goal-moon').hasAttribute('hidden')), 'prompt and target restored after rebuild');
  await page.screenshot({ path: OUT + '/21-ch2-landscape.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await sleep(700);
  await page.screenshot({ path: OUT + '/22-ch2-iphone.png' });
  await page.setViewportSize({ width: 834, height: 1194 });
  await sleep(700);

  // 完成本轮（剩下 7 个目标 + 今晚）→ [←][小月亮] → 回第1章（淡出 / 淡入，第1章从小人开场）
  for (let k = 1; k < 8; k++) {
    check(await waitFor(page, n => window.Chapter2.state().step === n && window.Chapter2.state().armed, 3000, k), 'month target ' + k + ' armed');
    s2 = await state2(page);
    await dragSun(page, s2.phi, s2.target, 8);
    check(await waitFor(page, n => window.Chapter2.state().step === n, 3000, k + 1), 'month target ' + k + ' reached');
  }
  check(await waitFor(page, () => window.Chapter2.state().round === 'tonight' && window.Chapter2.state().armed, 4000), 'tonight again');
  s2 = await state2(page);
  await dragSun(page, s2.phi, s2.target, 10);
  check(await waitMode2(page, 'done', 6000), 'second round completed');
  check((await state2(page)).progress.rounds === 2, 'rounds = 2');
  check(await navShown(page) && await navKind(page) === 'moon', 'return key shown');
  await page.click('#chapter-nav');
  check(await waitFor(page, () => window.__chapter === window.Chapter1, 5000), '[←] back to chapter 1');
  check(await page.evaluate(() => document.getElementById('hud').hidden), 'HUD hidden again in chapter 1');
  check(await waitMode(page, 'play', 8000), 'chapter 1 intro plays again and ends in play');
  s = await state(page);
  check(await page.evaluate(() => !!document.querySelector('#stage .ring-guide') && !document.querySelector('#stage .sun-disc') && !!document.querySelector('#stage .kid')), 'phase ring and kid are back, sun gone');
  check(Math.abs(s.net) < 1e-6 && Math.abs(s.phase) < 1e-6 && await litCount(page) === 0, 'chapter 1 restarts fresh (traveler home, stars dim)');
  check(await navShown(page) && await navKind(page) === 'sun', '[sun][→] shown again in chapter 1');
  check(await page.evaluate(() => JSON.parse(localStorage.getItem('moon.progress')).current === 1), 'current chapter persisted = 1');
  await page.screenshot({ path: OUT + '/23-back-to-ch1.png' });

  console.log('console/page errors:', errors.length ? errors : 'none');
  check(errors.length === 0, 'no console errors');
  await browser.close();
  console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
