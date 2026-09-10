/* chapter2.js — 第2章 月亮不发光
 *
 * 目标：月亮亮的那一面永远朝着太阳。
 * 视角：玩家自己的眼睛——画面只有夜空、中央大月亮、太阳和它的椭圆轨道；没有地面、房子、小人，镜头不动。
 * 交互：拖着太阳沿椭圆轨道走（在轨道任何位置按住拖也行，可以绕一整圈）。
 *       拖动是均匀角速度：以椭圆中心为原点，手指相对中心的方位角（atan2）就是太阳的轨道角，再投影到椭圆上——
 *       手指转多少度太阳就转多少度，不在椭圆两端加速（太阳不一定正好在手指下面，但跟手）。
 *       轨道是从稍高处俯视的一个水平圆环：太阳走到上半段 = 在月亮后方（变小），走到下半段 = 在月亮前方（变大）。
 *       中央月亮的亮面实时朝着太阳（几何在 moon.js 的 litFromOrbit；形状由 scene.js 的 <mask> 实时算出，不用预制相位图）。
 * 判定（各回合通用）：太阳进入目标区域（±10°），并且手指基本停住（最近一小段时间里太阳的摆动低于阈值）之后，才开始 1 秒倒计时——
 *       月亮外围的细弧线在 1 秒里填满即算达成；拖动中不计时；拖出区域弧线清空。
 *
 * 回合：
 *   guide  三步引导（只在首次进入本章时出现），每步屏幕下方一句提词，顶部三个进度点：
 *          ① 你能找到满月吗？——太阳到正前方  ② 满月是从哪一边开始变缺的？——月亮缺掉 ≥ 25%  ③ 能把月亮藏起来吗？——太阳到正后方
 *   month  「一个月」：顶部正中一个部件——目标月相在中央，8 颗进度点环绕；提词只一句「下一个是这样的月亮」；
 *          目标依次 新月 → 蛾眉月 → 上弦月 → 盈凸月 → 满月 → 亏凸月 → 下弦月 → 残月，达成一个点亮一颗（暗色小圆 → 带光晕的亮点）。
 *   tonight 8 颗全亮后的最后一题「今晚的月亮，是什么样的？」：目标按设备日期算真实月相（MoonMath.phaseForDate）。
 *   达成后才过关：星星波（沿用第1章）→ 出现「←」返回键（app.js 管）。之后太阳仍可自由拖着玩。
 *   过关后重进本章直接从「一个月」开始。屏幕下方边缘一直有一条 8 相位小月相带，当前相位高亮。
 *
 * 模式：play（可玩）→ win（闪烁波）→ done（过关后自由玩）；leave（换章节）。round：guide / month / tonight。
 */
window.Chapter2 = (function () {
  'use strict';
  var M = window.MoonMath, P = window.PARAMS, Anim = window.Anim, Progress = window.Progress, S = window.THEME.STYLE;
  var FRONT = Math.PI / 2, BACK = -Math.PI / 2;      // 轨道角：正前方（满月）/ 正后方（新月）
  var NS = 'http://www.w3.org/2000/svg';

  // 三步引导：text 是提词；test(phi) 判断太阳此刻是否在目标区域
  var STEPS = [
    { text: '你能找到满月吗？',        test: function (phi) { return within(phi, FRONT); } },
    { text: '满月是从哪一边开始变缺的？', test: function (phi) { return 1 - lit(phi).fraction >= P.guide.gapMin - 1e-6; } },
    { text: '能把月亮藏起来吗？',       test: function (phi) { return within(phi, BACK); } }
  ];
  // 「一个月」的八个目标（第1章意义上的相位 k/8）：新月、蛾眉月、上弦月、盈凸月、满月、亏凸月、下弦月、残月
  var MONTH = ['新月', '蛾眉月', '上弦月', '盈凸月', '满月', '亏凸月', '下弦月', '残月'];

  var scene = null, svg = null, bound = false;
  var mode = 'boot';
  var round = 'guide';            // guide / month / tonight
  var phi = P.sun.startAngle;     // 太阳的轨道角
  var step = 0;                   // guide：当前在第几步（0..2）；month：已达成几个目标（0..8）
  var target = null;              // month / tonight：目标的轨道角
  var tonightCycle = null;        // tonight：今晚的真实月相（第1章意义上的相位）
  var armed = false;              // 当前目标是否已就绪（换提词 / 换目标的间隙里不计时）
  var dwell = null;               // 「停住 1 秒」的补间（同时驱动细弧线）
  var drag = null;                // { id, offset }
  var samples = [];               // 拖动中最近一小段时间的 { t, phi }：估太阳的角速度
  var stillTimer = null;          // 手指停下来之后，等一个时间窗再判一次「基本停住」
  var running = [];
  var hinted = false;
  var litBatches = {};            // 本轮已点亮的星星批次

  var progress = Progress.data;
  if (!progress.chapter2) progress.chapter2 = { completed: false, rounds: 0 };

  function save() { Progress.save(); }
  function setMode(m) { mode = m; if (api.onMode) api.onMode(m); }
  function track(h) { running.push(h); return h; }
  function cancelAll() {
    running.forEach(function (h) { h.cancel(); });
    running = [];
    dwell = null;
    if (stillTimer) { stillTimer.cancel(); stillTimer = null; }
  }
  function now() { return (window.performance && performance.now) ? performance.now() : Date.now(); }
  function lit(a) { return M.litFromOrbit(a, scene.orbit.rx, scene.orbit.ry); }
  function within(a, b) { return Math.abs(M.normAngle(a - b)) <= P.guide.toleranceDeg * Math.PI / 180; }
  function el(name, attrs, parent) {
    var node = document.createElementNS(NS, name);
    for (var k in attrs) node.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(node);
    return node;
  }
  function setHidden(node, hidden) {              // SVG 元素没有 .hidden 属性，统一用 hidden 特性（CSS 里 #hud [hidden] 管显隐）
    if (hidden) node.setAttribute('hidden', ''); else node.removeAttribute('hidden');
  }
  function glowDot(parent, x, y) {                // 进度点：暗色小圆；点亮后变亮、放大、带光晕（CSS 管过渡）
    var g = el('g', { 'class': 'goal-dot', transform: 'translate(' + x.toFixed(1) + ' ' + y.toFixed(1) + ')' }, parent);
    el('circle', { r: S.dotGlowR, fill: 'url(#g-dot-glow)', 'class': 'dot-glow' }, g);
    el('circle', { r: S.dotR, 'class': 'dot-core' }, g);
    return g;
  }

  // ---- HUD（HTML）：顶部正中的「目标 + 进度点」部件、下方一句提词、底边 8 相位小月相带
  var hud = {
    root: null, prompt: null, goal: null, gGuide: null, gMonth: null, guideDots: [], ringDots: [],
    moonG: null, moonLit: null, moonRim: null, strip: [], built: false, text: '', fade: null, moonFade: null,
    build: function () {
      if (hud.built) return;
      hud.built = true;
      hud.root = document.getElementById('hud');
      hud.prompt = document.getElementById('prompt');
      // 顶部部件：一个方形 SVG，中央是目标月相，外面一圈 8 颗进度点；引导回合时是排成一行的 3 颗点
      var size = (S.goalRingR + S.dotGlowR) * 2 + 8, c = size / 2;
      hud.goal = document.getElementById('goal');
      hud.goal.setAttribute('viewBox', '0 0 ' + size + ' ' + size);
      hud.goal.style.width = size + 'px';
      hud.goal.style.height = size + 'px';
      hud.goal.style.setProperty('--swap-ms', P.month.swapMs + 'ms');
      var defs = el('defs', {}, hud.goal);
      var grad = el('radialGradient', { id: 'g-dot-glow' }, defs);
      el('stop', { offset: 0.25, 'class': 'dot-glow-stop', 'stop-opacity': S.dotGlowAlpha }, grad);
      el('stop', { offset: 1, 'class': 'dot-glow-stop', 'stop-opacity': 0 }, grad);
      hud.gGuide = el('g', { 'class': 'goal-guide' }, hud.goal);
      for (var i = 0; i < STEPS.length; i++) hud.guideDots.push(glowDot(hud.gGuide, c + (i - (STEPS.length - 1) / 2) * S.guideDotGap, c));
      hud.gMonth = el('g', { 'class': 'goal-month' }, hud.goal);
      for (var k = 0; k < 8; k++) {               // 第 k 颗在 -90° + k·45°：顶端是新月那颗，顺时针
        var a = -Math.PI / 2 + k * Math.PI / 4;
        hud.ringDots.push(glowDot(hud.gMonth, c + S.goalRingR * Math.cos(a), c + S.goalRingR * Math.sin(a)));
      }
      hud.moonG = el('g', { 'class': 'goal-moon', transform: 'translate(' + c + ' ' + c + ')' }, hud.gMonth);
      el('circle', { r: S.goalMoonR, 'class': 'm-dark' }, hud.moonG);
      hud.moonLit = el('path', { 'class': 'm-lit' }, hud.moonG);
      hud.moonRim = el('circle', { r: S.goalMoonR - 1, 'class': 'm-rim goal-rim' }, hud.moonG);
      // 底边小月相带
      var ST = P.guide.strip, cell = ST.cell, r = ST.radius;
      var stripSvg = document.getElementById('phase-strip');
      stripSvg.setAttribute('viewBox', '0 0 ' + (cell * 8) + ' ' + cell);
      for (k = 0; k < 8; k++) {                     // 第1章意义上的八个相位：新月 → 上弦 → 满月 → 下弦 → …
        var slot = el('g', { transform: 'translate(' + (cell * k + cell / 2) + ' ' + (cell / 2) + ')' }, stripSvg);   // 外层管位置，内层管高亮缩放
        var g = el('g', { 'class': 'strip-moon' }, slot);
        el('circle', { r: r, 'class': 'm-dark' }, g);
        var dp = M.litPath(0, 0, r, k / 8);
        if (dp) el('path', { d: dp, 'class': 'm-lit' }, g);
        else el('circle', { r: r - 1, 'class': 'm-rim strip-rim' }, g);
        hud.strip.push(g);
      }
    },
    show: function (on) { hud.root.hidden = !on; hud.root.classList.toggle('show', !!on); },
    showDots: function (on) { setHidden(hud.gGuide, !on); },                                  // 引导回合的 3 颗点
    setDots: function (n) { hud.guideDots.forEach(function (d, i) { d.classList.toggle('lit', i < n); }); },
    showRing: function (on) { setHidden(hud.gMonth, !on); },                                  // 「一个月」的目标 + 8 颗点
    setRing: function (n) { hud.ringDots.forEach(function (d, i) { d.classList.toggle('lit', i < n); }); },
    showTarget: function (on) { setHidden(hud.moonG, !on); if (!on) hud.moonG.classList.remove('out'); },
    setTarget: function (angle, instant) {        // 目标月相 = 太阳在轨道角 angle 时中央月亮的样子；换目标先淡出再淡入
      var L = lit(angle), TR = S.goalMoonR;
      var apply = function () {
        var d = M.litPath(0, 0, TR, L.phase);
        if (d) { hud.moonLit.setAttribute('d', d); hud.moonLit.setAttribute('transform', 'rotate(' + L.rotateDeg.toFixed(1) + ')'); hud.moonLit.style.visibility = ''; }
        else hud.moonLit.style.visibility = 'hidden';
        hud.moonRim.style.opacity = P.moon.rimAlpha * Math.max(0, Math.min(1, 1 - L.fraction / 0.12));
      };
      if (hud.moonFade) { hud.moonFade.cancel(); hud.moonFade = null; }
      if (instant || hud.moonG.hasAttribute('hidden')) { apply(); hud.moonG.classList.remove('out'); return; }
      hud.moonG.classList.add('out');
      hud.moonFade = Anim.delay(P.month.swapMs, function () { hud.moonFade = null; apply(); hud.moonG.classList.remove('out'); });
    },
    setStrip: function (cycle) {                    // 当前相位高亮
      var idx = Math.round(cycle * 8) % 8;
      hud.strip.forEach(function (g, i) { g.classList.toggle('current', i === idx); });
    },
    setPrompt: function (text, instant) {           // 换提词：先淡出，换字，再淡入；一次只显示一句
      if (hud.fade) { hud.fade.cancel(); hud.fade = null; }
      if (text === hud.text && !instant) return;
      hud.text = text;
      if (instant) { hud.prompt.textContent = text; hud.prompt.classList.toggle('out', !text); return; }
      hud.prompt.classList.add('out');
      hud.fade = Anim.delay(P.guide.promptFadeMs, function () {
        hud.fade = null;
        hud.prompt.textContent = text;
        if (text) hud.prompt.classList.remove('out');
      });
    }
  };

  // ---- 渲染
  function render() {
    scene.setSun(phi);
    hud.setStrip(lit(phi).cycle);
  }

  // ---- 太阳的角速度：最近 speedWindowMs 里太阳角度的摆动范围（最大 − 最小）÷ 时间（度/秒）。
  //      用范围而不是首尾位移：来回晃也算在动（首尾位移可能正好抵消），而手指微小的抖动不会累加。手指不在屏幕上 = 太阳静止 = 0
  function sample() {
    var t = now();
    samples.push({ t: t, phi: phi });
    var keep = t - P.guide.speedWindowMs * 2;
    while (samples.length > 2 && samples[1].t < keep) samples.shift();   // 只留时间窗内的样本（多留一个更早的当起点）
  }
  function speed() {
    if (!drag || !samples.length) return 0;
    var W = P.guide.speedWindowMs, from = now() - W, lo = 0, hi = 0;
    for (var i = samples.length - 1; i >= 0; i--) {
      var d = M.normAngle(samples[i].phi - phi);
      if (d < lo) lo = d;
      if (d > hi) hi = d;
      if (samples[i].t <= from) break;              // 窗口起点之前的最后一个位置也算（那之后才动进窗口），再往前不看
    }
    return (hi - lo) * 180 / Math.PI / (W / 1000);
  }
  function still() { return speed() <= P.guide.stillDegPerSec; }

  // ---- 判定：当前目标区域 / 停住之后才开始 1 秒倒计时（细弧线）
  function inTarget() {
    if (mode !== 'play' || !armed) return false;
    if (round === 'guide') return step < STEPS.length && STEPS[step].test(phi);
    return target !== null && within(phi, target);
  }
  function checkDwell() {
    var near = inTarget();
    if (near && still()) {
      if (!dwell) {
        dwell = track(Anim.tween({
          ms: P.guide.holdMs, ease: Anim.ease.linear,
          onUpdate: function (t) { scene.setArc(t); },
          onDone: function () { dwell = null; complete(); }
        }));
      }
      return;
    }
    if (dwell) stopDwell();                         // 拖动中不计时 / 拖出区域：弧线清空
    if (near) scheduleStillCheck();                 // 还在区域里但手还在动：停下来之后再判一次
  }
  function scheduleStillCheck() {
    if (stillTimer) stillTimer.cancel();
    stillTimer = Anim.delay(P.guide.speedWindowMs + 30, function () { stillTimer = null; checkDwell(); });
  }
  function stopDwell() {
    if (dwell) { dwell.cancel(); running = running.filter(function (h) { return h !== dwell; }); dwell = null; }
    if (scene) scene.setArc(0);
  }
  function arm(instant) {                           // 目标就绪：换好提词（和目标月相）之后才开始计时
    armed = false;
    if (instant) { armed = true; checkDwell(); return; }
    track(Anim.delay(P.guide.promptFadeMs * 2, function () { armed = true; checkDwell(); }));
  }
  function lightAround(cycle) {                     // 点亮太阳那一侧的几批星（第 i 批在第1章第 i 个相位节点那一侧）
    var i = Math.round(cycle * 8);
    [i - 1, i, i + 1].forEach(function (b) {
      b = ((b % 8) + 8) % 8;
      if (!litBatches[b]) { litBatches[b] = true; scene.lightBatch(b, true); }
    });
  }

  // ---- 三个回合
  function startGuide(instant) {
    round = 'guide'; step = 0; target = null;
    hud.showDots(true); hud.setDots(0); hud.showRing(false); hud.showTarget(false);
    hud.setPrompt(STEPS[0].text, instant);
    arm(instant);
  }
  function guideStep(instant) {                     // 进入第 step 步
    hud.setPrompt(STEPS[step].text, instant);
    arm(instant);
  }
  function startMonth(instant) {
    round = 'month'; step = 0;
    hud.showDots(false); hud.showRing(true); hud.setRing(0); hud.showTarget(true);
    hud.setPrompt(P.month.prompt, instant);
    monthTarget(instant);
  }
  function monthTarget(instant) {                   // 第 step 个目标：新月 → 蛾眉月 → … → 残月
    target = M.orbitAngleForCycle(step / 8);
    hud.setTarget(target, instant);
    arm(instant);
  }
  function startTonight(instant) {
    round = 'tonight';
    tonightCycle = M.phaseForDate(new Date());
    target = M.orbitAngleForCycle(tonightCycle);
    hud.showDots(false); hud.showRing(true); hud.setRing(8); hud.showTarget(true);
    hud.setTarget(target, instant);
    hud.setPrompt(P.month.tonightPrompt, instant);
    arm(instant);
  }
  function complete() {                             // 当前目标达成：反馈，再进入下一个目标 / 下一回合
    if (mode !== 'play') return;
    armed = false;
    scene.setArc(1);
    scene.surge();
    var D = P.guide.stepDelayMs;
    if (round === 'guide') {
      step += 1;
      hud.setDots(step);
      lightAround(lit(phi).cycle);
      if (step >= STEPS.length) {                   // 引导完成：记住「已引导过」，下次直接从「一个月」开始；夜空回暗，一个月从头点亮
        progress.chapter2.guided = true; save();
        track(Anim.delay(D, function () { scene.setArc(0); litBatches = {}; scene.dimStars(); startMonth(false); }));
      } else {
        track(Anim.delay(D, function () { scene.setArc(0); guideStep(false); }));
      }
    } else if (round === 'month') {
      var k = step;
      step += 1;
      hud.setRing(step);
      if (!litBatches[k]) { litBatches[k] = true; scene.lightBatch(k, true); }   // 第 k 个相位那一侧的星
      if (step >= 8) track(Anim.delay(D, function () { scene.setArc(0); startTonight(false); }));
      else track(Anim.delay(D, function () { scene.setArc(0); monthTarget(false); }));
    } else {                                        // tonight：达成才过关
      track(Anim.delay(D, win));
    }
  }

  // ---- 拖拽：均匀角速度——手指相对椭圆中心的方位角就是轨道角（加上按下时的偏移），再投影到椭圆上
  function polarAt(pt) { return Math.atan2(pt.y - scene.orbit.cy, pt.x - scene.orbit.cx); }
  function distAt(pt) { return Math.hypot(pt.x - scene.orbit.cx, pt.y - scene.orbit.cy); }

  function onDown(e) {
    if ((mode !== 'play' && mode !== 'done') || drag) return;
    var pt = scene.toSvgPoint(e.clientX, e.clientY);
    if (!pt) return;
    var sp = scene.orbitPoint(phi), sc = scene.sunScale(lit(phi).depth);
    var onSun = Math.hypot(pt.x - sp.x, pt.y - sp.y) <= P.sun.grabRadius * sc;
    var alpha = polarAt(pt);
    var onOrbit = Math.abs(distAt(pt) - scene.orbitRay(alpha).r) <= P.orbit.grabBand;   // 沿手指的方位角量到轨道的距离
    if (!onSun && !onOrbit) return;
    drag = { id: e.pointerId, offset: M.normAngle(phi - alpha) };
    samples = [{ t: now(), phi: phi }];
    try { svg.setPointerCapture(e.pointerId); } catch (err) { /* 不支持就算了 */ }
    if (!hinted) { hinted = true; svg.classList.remove('hint'); }
    e.preventDefault();
  }
  function onMove(e) {
    if (!drag || e.pointerId !== drag.id) return;
    e.preventDefault();
    if (mode !== 'play' && mode !== 'done') return;
    var pt = scene.toSvgPoint(e.clientX, e.clientY);
    if (!pt || distAt(pt) < P.orbit.centerDeadZone) return;
    phi = M.normAngle(polarAt(pt) + drag.offset);
    sample();
    render();
    checkDwell();
  }
  function onUp(e) {
    if (!drag || e.pointerId !== drag.id) return;
    drag = null;
    samples = [];                                   // 手指离开：太阳静止
    if (mode === 'play') checkDwell();
  }

  // ---- 过关：星星波（沿用第1章），然后出现返回键（app.js 在 done 模式下露出「←」）
  function win() {
    setMode('win');
    cancelAll();
    drag = null;
    target = null;
    progress.chapter2.completed = true;
    progress.chapter2.guided = true;
    progress.chapter2.rounds += 1;
    save();
    hinted = true;
    svg.classList.remove('hint');
    scene.setArc(0);
    hud.setPrompt('', false);
    hud.showTarget(false);
    for (var i = 0; i < 8; i++) {
      if (!litBatches[i]) { litBatches[i] = true; scene.lightBatch(i, false); }
    }
    scene.setSparklesLit(true, true);
    scene.wave();
    track(Anim.delay(P.guide.winWaveMs, function () { setMode('done'); }));
  }

  // ---- 换章节：提词淡出，交给 app.js 换场景（第2章没有小人，镜头不动）
  function leave(done) {
    cancelAll();
    drag = null;
    setMode('leave');
    scene.setArc(0);
    hud.setPrompt('', false);
    scene.dimStars();
    scene.setSparklesLit(false, true);
    track(Anim.delay(P.guide.promptFadeMs, done));
  }

  // ---- 挂到（新的）场景上；first = 首次进入本章，其余为窗口尺寸变化后重建
  function attach(newScene, first) {
    cancelAll();
    drag = null;
    samples = [];
    scene = newScene;
    svg = scene.svg;
    hud.build();
    hud.show(true);
    if (!bound) {
      bound = true;
      svg.addEventListener('pointerdown', onDown);
      svg.addEventListener('pointermove', onMove);
      svg.addEventListener('pointerup', onUp);
      svg.addEventListener('pointercancel', onUp);
    }
    scene.setSparklesLit(progress.chapter2.completed, first);
    svg.classList.toggle('hint', !hinted);
    if (first) {                                    // 首次：三步引导；引导过（或过过关）：直接从「一个月」开始
      phi = P.sun.startAngle; litBatches = {};
      render();
      setMode('play');
      if (progress.chapter2.guided) startMonth(false); else startGuide(false);
      return;
    }
    // 重建：直接进入当前模式 / 回合的终点状态
    scene.setLitBatches(litBatches, false);
    render();
    if (mode === 'win') { for (var i = 0; i < 8; i++) litBatches[i] = true; scene.setLitBatches(litBatches, false); setMode('done'); }
    if (mode === 'done') { hud.showDots(false); hud.showRing(true); hud.setRing(8); hud.showTarget(false); hud.setPrompt('', true); setMode('done'); return; }
    setMode('play');
    if (round === 'guide') { hud.showDots(true); hud.setDots(step); hud.showRing(false); hud.showTarget(false); guideStep(true); }
    else if (round === 'month') { hud.showDots(false); hud.showRing(true); hud.setRing(step); hud.showTarget(true); hud.setPrompt(P.month.prompt, true); monthTarget(true); }
    else startTonight(true);
  }
  function detach() {
    cancelAll();
    drag = null;
    samples = [];
    if (bound && svg) {
      svg.removeEventListener('pointerdown', onDown);
      svg.removeEventListener('pointermove', onMove);
      svg.removeEventListener('pointerup', onUp);
      svg.removeEventListener('pointercancel', onUp);
    }
    bound = false;
    if (hud.built) { hud.show(false); hud.setPrompt('', true); hud.showTarget(false); }
    mode = 'boot';
  }

  var api = {
    attach: attach,
    detach: detach,
    leave: leave,
    onMode: null,
    STEPS: STEPS,
    MONTH: MONTH,
    // 供调试 / 测试读取
    state: function () {
      var L = lit(phi);
      return { mode: mode, round: round, phi: phi, depth: L.depth, fraction: L.fraction, cycle: L.cycle, step: step,
               target: target, tonightCycle: tonightCycle, armed: armed, dwelling: !!dwell, speed: speed(), prompt: hud.text,
               lit: Object.keys(litBatches).length, progress: progress.chapter2 };
    }
  };
  return api;
})();
