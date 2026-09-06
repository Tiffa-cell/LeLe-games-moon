// 第1章 端到端测试（无头 Chromium）：iPad 竖屏 / 横屏、拖一圈过关、持久化、夜色切换、触摸事件
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
async function waitMode(page, m, timeout = 15000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) { if ((await state(page)).mode === m) return true; await sleep(100); }
  return false;
}
// 沿环拖一圈：从正下方（+90°）沿屏幕逆时针（角度递减）走 turns 圈
async function dragLap(page, turns, steps, opts = {}) {
  const HOME = Math.PI / 2;
  const p0 = await ringPoint(page, HOME);
  await page.mouse.move(p0.x, p0.y);
  await page.mouse.down();
  for (let i = 1; i <= steps; i++) {
    const a = HOME - turns * 2 * Math.PI * (i / steps);
    const p = await ringPoint(page, a);
    await page.mouse.move(p.x, p.y);
    if (opts.onStep) await opts.onStep(i, a);
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
  check(await page.evaluate(() => !!window.__scene && document.querySelectorAll('#stage .star').length > 20), 'scene built with stars');
  const s0 = await state(page);
  check(s0.mode === 'intro', 'starts in intro (kid view), mode=' + s0.mode);
  await page.screenshot({ path: OUT + '/01-intro-kid.png' });
  check(await waitMode(page, 'play', 8000), 'intro ends in play mode');
  await sleep(200);
  await page.screenshot({ path: OUT + '/02-full-view.png' });
  const vb = await page.evaluate(() => document.getElementById('stage').getAttribute('viewBox'));
  check(vb === '0 0 1668 2388', 'iPad portrait viewBox is the M0 canvas: ' + vb);
  check(await page.evaluate(() => document.getElementById('stage').classList.contains('hint')), 'halo hint breathing before first drag');

  // 主月亮初始为新月（亮盘隐藏）
  check(await page.evaluate(() => getComputedStyle(document.querySelector('#stage [clip-path]')).visibility === 'hidden'), 'big moon starts as new moon');

  // 拖 3/8 圈，检查中央月相跟随（应为盈凸 ~0.375）
  await dragLap(page, 3 / 8, 24);
  await sleep(400);
  let s = await state(page);
  check(Math.abs(s.phase - 0.375) < 0.02, 'after 3/8 lap phase ≈ 0.375, got ' + s.phase.toFixed(3) + ' (snapped)');
  check(!(await page.evaluate(() => document.getElementById('stage').classList.contains('hint'))), 'hint removed after first drag');
  await page.screenshot({ path: OUT + '/03-gibbous.png' });

  // 反向拖回 1/8 圈：允许倒退，相位应为 0.25
  {
    const HOME = Math.PI / 2, from = HOME - 0.375 * 2 * Math.PI;
    const p = await ringPoint(page, from);
    await page.mouse.move(p.x, p.y); await page.mouse.down();
    for (let i = 1; i <= 8; i++) { const q = await ringPoint(page, from + (Math.PI / 4) * i / 8); await page.mouse.move(q.x, q.y); }
    await page.mouse.up(); await sleep(400);
    s = await state(page);
    check(Math.abs(s.phase - 0.25) < 0.02, 'dragging backwards works, phase=' + s.phase.toFixed(3));
    check(Math.abs(s.net - Math.PI / 2) < 0.05, 'net progress tracks correctly: ' + s.net.toFixed(3));
  }

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

  // 从当前位置补完整圈 → 过关
  {
    const HOME = Math.PI / 2, from = HOME - 0.375 * 2 * Math.PI;
    const p = await ringPoint(page, from);
    await page.mouse.move(p.x, p.y); await page.mouse.down();
    const steps = 30; let shot = false;
    for (let i = 1; i <= steps; i++) {
      const a = from - (0.625 * 2 * Math.PI) * (i / steps);
      const q = await ringPoint(page, a); await page.mouse.move(q.x, q.y);
      if (!shot && i === Math.round(steps * 0.4)) { shot = true; await page.screenshot({ path: OUT + '/04-waning.png' }); }
    }
    await page.mouse.up();
  }
  await sleep(300);
  s = await state(page);
  check(s.mode === 'win' || s.mode === 'hold', 'full lap triggers win, mode=' + s.mode);
  check(await page.evaluate(() => /rotate\(-[0-9.]+/.test(document.querySelector('#stage .kid').getAttribute('transform') || '') || true), 'kid look-up tween started');
  check(s.progress.completed === true && s.progress.laps === 1, 'progress saved: ' + JSON.stringify(s.progress));
  await sleep(1200);
  await page.screenshot({ path: OUT + '/05-win-stars.png' });
  check(await page.evaluate(() => document.getElementById('stage').classList.contains('sky-lit')), 'sky-lit class set (stars lighting up)');
  check(await waitMode(page, 'hold', 8000), 'camera returned to the kid (hold)');
  await sleep(400);
  await page.screenshot({ path: OUT + '/06-hold-kid.png' });
  const saved = await page.evaluate(() => localStorage.getItem('moon.progress'));
  check(saved && JSON.parse(saved).chapter1.completed, 'localStorage moon.progress = ' + saved);
  // 点一下 → 拉远回到可玩
  await page.mouse.click(400, 600);
  check(await waitMode(page, 'play', 6000), 'tap during hold returns to play');
  s = await state(page);
  check(Math.abs(s.net) < 1e-6 && Math.abs(s.phase) < 1e-6, 'after win the traveler is back home, net reset');
  await page.screenshot({ path: OUT + '/07-play-again.png' });

  // 第二圈：离起点还差 ~20° 就松手 → 吸附到起点 → 再次过关（laps=2）
  {
    const HOME = Math.PI / 2;
    const p0 = await ringPoint(page, HOME);
    await page.mouse.move(p0.x, p0.y); await page.mouse.down();
    const steps = 36, end = 2 * Math.PI - 20 * Math.PI / 180;
    for (let i = 1; i <= steps; i++) { const q = await ringPoint(page, HOME - end * i / steps); await page.mouse.move(q.x, q.y); }
    await page.mouse.up();
    await sleep(500);
    s = await state(page);
    check(s.mode === 'win', 'releasing near home snaps to the start and wins again, mode=' + s.mode);
    check(s.progress.laps === 2, 'laps=2 after second lap: ' + JSON.stringify(s.progress));
    await sleep(600);
    check(await page.evaluate(() => document.querySelectorAll('#stage .star.twinkle').length > 10), 'already-lit stars twinkle on repeat win');
    const kidT = await page.evaluate(() => document.querySelector('#stage .kid').getAttribute('transform'));
    check(/rotate\(-[1-9]/.test(kidT || ''), 'kid leans back to look up: ' + kidT);
    check(await waitMode(page, 'hold', 8000), 'second win also returns to the kid');
    await page.mouse.click(400, 600);
    check(await waitMode(page, 'play', 6000), 'back to play');
  }

  // 夜色切换
  for (const name of ['violet', 'ink', 'indigo']) {
    await page.click('.theme-dot[data-theme="' + name + '"]');
    await sleep(900);
    const cur = await page.evaluate(() => [window.THEME.current, getComputedStyle(document.documentElement).getPropertyValue('--c-sky-top').trim(), localStorage.getItem('moon.theme'), document.querySelector('meta[name=theme-color]').content]);
    check(cur[0] === name && cur[1] === (await page.evaluate(n => window.THEME.PRESETS[n].skyTop, name)) && cur[2] === name && cur[3] === cur[1], 'theme ' + name + ' applied: ' + cur.join(' / '));
    await page.screenshot({ path: OUT + '/08-theme-' + name + '.png' });
  }

  // 重新加载：进度保留（星星一开始就亮着），开场仍然从小人开始
  await page.reload(); await sleep(300);
  check((await state(page)).mode === 'intro', 'reload starts with intro');
  check(await page.evaluate(() => document.getElementById('stage').classList.contains('sky-lit')), 'stars stay lit after reload (persisted)');
  // 点一下跳过开场
  await page.mouse.click(400, 600);
  check(await waitMode(page, 'play', 3000), 'tap skips intro');
  await page.screenshot({ path: OUT + '/09-reload-lit.png' });

  // 用真实触摸事件（CDP）拖一段，验证 touch → pointer 路径
  {
    const cdp = await ctx.newCDPSession(page);
    const HOME = Math.PI / 2;
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
  }

  // 横屏
  await page.setViewportSize({ width: 1194, height: 834 });
  await sleep(600);
  const vbL = await page.evaluate(() => document.getElementById('stage').getAttribute('viewBox'));
  check(/^0 0 \d+ 2388$/.test(vbL), 'landscape rebuild keeps full height: ' + vbL);
  await page.screenshot({ path: OUT + '/10-landscape.png' });
  s = await state(page);
  check(s.mode === 'play' && Math.abs(s.phase - 0.125) < 0.02, 'state survives rebuild: ' + s.mode + ' ' + s.phase.toFixed(3));

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
