/* chapter2.js — 第2章 月亮不发光
 *
 * 目标：月亮亮的那一面永远朝着太阳。
 * 视角：玩家自己的眼睛——画面只有夜空、中央大月亮、太阳和它的椭圆轨道；没有地面、房子、小人，镜头不动。
 * 交互：拖着太阳沿椭圆轨道走（在轨道任何位置按住拖也行，可以绕一整圈）。
 *       轨道是从稍高处俯视的一个水平圆环：太阳走到上半段 = 在月亮后方（变小、被月亮挡住），
 *       走到下半段 = 在月亮前方（变大、盖在月亮前面）。中央月亮的亮面实时朝着太阳
 *       （几何在 moon.js 的 litFromOrbit；形状由 scene.js 的 <mask> 实时算出，不用预制相位图）。
 * 判定（各回合通用）：太阳进入目标区域（±20°）就开始计时，月亮外围的细弧线在 1 秒里填满即算达成；中途拖出去弧线清空。
 *
 * 回合：
 *   guide  三步引导（只在首次进入本章时出现），每步屏幕下方一句提词，上方三个进度点：
 *          ① 你能找到满月吗？——太阳到正前方  ② 满月是从哪一边开始变缺的？——月亮缺掉 ≥ 25%  ③ 能把月亮藏起来吗？——太阳到正后方
 *   month  「一个月」：上方换成一圈 8 颗空心小星，左上角画目标月相，提词只一句「下一个是这样的月亮」；
 *          目标依次 新月 → 蛾眉月 → 上弦月 → 盈凸月 → 满月 → 亏凸月 → 下弦月 → 残月，达成一个点亮一颗星。
 *   tonight 8 颗全亮后的最后一题「今晚的月亮，是什么样的？」：目标按设备日期算真实月相（MoonMath.phaseForDate）。
 *   达成后才过关：星星波（沿用第1章）→ 出现「←」返回键（app.js 管）。之后太阳仍可自由拖着玩。
 *   过关后重进本章直接从「一个月」开始。屏幕下方边缘一直有一条 8 相位小月相带，当前相位高亮。
 *
 * 模式：play（可玩）→ win（闪烁波）→ done（过关后自由玩）；leave（换章节）。round：guide / month / tonight。
 */
window.Chapter2 = (function () {
  'use strict';
  var M = window.MoonMath, P = window.PARAMS, Anim = window.Anim, Progress = window.Progress;
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
  }
  function lit(a) { return M.litFromOrbit(a, P.orbit.rx, P.orbit.ry); }
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
  function starPath(cx, cy, R) {                  // 五角星
    var d = '', r = R * 0.45;
    for (var i = 0; i < 10; i++) {
      var a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r : R;
      d += (i ? ' L ' : 'M ') + (cx + rr * Math.cos(a)).toFixed(2) + ',' + (cy + rr * Math.sin(a)).toFixed(2);
    }
    return d + ' Z';
  }

  // ---- HUD（HTML）：上方三个进度点 / 一圈 8 颗小星、左上角目标月相、下方一句提词、底边 8 相位小月相带
  var hud = {
    root: null, dots: [], ring: null, ringStars: [], targetSvg: null, targetLit: null, targetRim: null,
    prompt: null, strip: [], built: false, text: '', fade: null, targetFade: null,
    build: function () {
      if (hud.built) return;
      hud.built = true;
      hud.root = document.getElementById('hud');
      hud.prompt = document.getElementById('prompt');
      var dots = document.getElementById('progress');
      for (var i = 0; i < STEPS.length; i++) {
        var d = document.createElement('i');
        d.className = 'dot';
        dots.appendChild(d);
        hud.dots.push(d);
      }
      // 一圈 8 颗空心小星：第 k 颗在 -90° + k·45°（顶端是新月那颗，顺时针）
      var RG = P.month.ring, size = (RG.radius + RG.star) * 2 + 4, c = size / 2;
      hud.ring = document.getElementById('month-ring');
      hud.ring.setAttribute('viewBox', '0 0 ' + size + ' ' + size);
      for (var k = 0; k < 8; k++) {
        var a = -Math.PI / 2 + k * Math.PI / 4;
        hud.ringStars.push(el('path', { d: starPath(c + RG.radius * Math.cos(a), c + RG.radius * Math.sin(a), RG.star), 'class': 'ring-star' }, hud.ring));
      }
      // 左上角目标月相：暗盘 + 亮面（形状和中央月亮在目标位置时一模一样）+ 新月细亮边 + 淡淡的虚线框
      var TR = P.month.target.radius, ts = TR * 2 + 20, tc = ts / 2;
      hud.targetSvg = document.getElementById('target');
      hud.targetSvg.setAttribute('viewBox', '0 0 ' + ts + ' ' + ts);
      el('circle', { cx: tc, cy: tc, r: TR + 8, 'class': 'target-frame' }, hud.targetSvg);
      var tg = el('g', { transform: 'translate(' + tc + ' ' + tc + ')' }, hud.targetSvg);
      el('circle', { r: TR, 'class': 'm-dark' }, tg);
      hud.targetLit = el('path', { 'class': 'm-lit' }, tg);
      hud.targetRim = el('circle', { r: TR - 1, 'class': 'm-rim target-rim' }, tg);
      // 底边小月相带
      var S = P.guide.strip, cell = S.cell, r = S.radius;
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
    setDots: function (n) { hud.dots.forEach(function (d, i) { d.classList.toggle('lit', i < n); }); },
    showDots: function (on) { setHidden(document.getElementById('progress'), !on); },
    showRing: function (on) { setHidden(hud.ring, !on); },
    setRing: function (n) { hud.ringStars.forEach(function (s, i) { s.classList.toggle('lit', i < n); }); },
    showTarget: function (on) { setHidden(hud.targetSvg, !on); if (!on) hud.targetSvg.classList.remove('out'); },
    setTarget: function (angle, instant) {        // 目标月相 = 太阳在轨道角 angle 时中央月亮的样子；换目标先淡出再淡入
      var L = lit(angle), TR = P.month.target.radius;
      var apply = function () {
        var d = M.litPath(0, 0, TR, L.phase);
        if (d) { hud.targetLit.setAttribute('d', d); hud.targetLit.setAttribute('transform', 'rotate(' + L.rotateDeg.toFixed(1) + ')'); hud.targetLit.style.visibility = ''; }
        else hud.targetLit.style.visibility = 'hidden';
        hud.targetRim.style.opacity = P.moon.rimAlpha * Math.max(0, Math.min(1, 1 - L.fraction / 0.12));
      };
      if (hud.targetFade) { hud.targetFade.cancel(); hud.targetFade = null; }
      if (instant || hud.targetSvg.hasAttribute('hidden')) { apply(); hud.targetSvg.classList.remove('out'); return; }
      hud.targetSvg.classList.add('out');
      hud.targetFade = Anim.delay(P.month.swapMs, function () { hud.targetFade = null; apply(); hud.targetSvg.classList.remove('out'); });
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

  // ---- 判定：当前目标区域 / 停住 1 秒（细弧线）
  function inTarget() {
    if (mode !== 'play' || !armed) return false;
    if (round === 'guide') return step < STEPS.length && STEPS[step].test(phi);
    return target !== null && within(phi, target);
  }
  function checkDwell() {
    var near = inTarget();
    if (near && !dwell) {
      dwell = track(Anim.tween({
        ms: P.guide.holdMs, ease: Anim.ease.linear,
        onUpdate: function (t) { scene.setArc(t); },
        onDone: function () { dwell = null; complete(); }
      }));
    } else if (!near && dwell) {
      stopDwell();
    }
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

  // ---- 拖拽：手指位置 → 轨道角（按椭圆归一化）
  function phiAt(pt) { return Math.atan2((pt.y - scene.orbit.cy) / scene.orbit.ry, (pt.x - scene.orbit.cx) / scene.orbit.rx); }
  function rhoAt(pt) { return Math.hypot((pt.x - scene.orbit.cx) / scene.orbit.rx, (pt.y - scene.orbit.cy) / scene.orbit.ry); }

  function onDown(e) {
    if ((mode !== 'play' && mode !== 'done') || drag) return;
    var pt = scene.toSvgPoint(e.clientX, e.clientY);
    if (!pt) return;
    var sp = scene.orbitPoint(phi), sc = scene.sunScale(lit(phi).depth);
    var onSun = Math.hypot(pt.x - sp.x, pt.y - sp.y) <= P.sun.grabRadius * sc;
    var op = scene.orbitPoint(phiAt(pt));
    var onOrbit = Math.hypot(pt.x - op.x, pt.y - op.y) <= P.orbit.grabBand;
    if (!onSun && !onOrbit) return;
    drag = { id: e.pointerId, offset: M.normAngle(phi - phiAt(pt)) };
    try { svg.setPointerCapture(e.pointerId); } catch (err) { /* 不支持就算了 */ }
    if (!hinted) { hinted = true; svg.classList.remove('hint'); }
    e.preventDefault();
  }
  function onMove(e) {
    if (!drag || e.pointerId !== drag.id) return;
    e.preventDefault();
    if (mode !== 'play' && mode !== 'done') return;
    var pt = scene.toSvgPoint(e.clientX, e.clientY);
    if (!pt || rhoAt(pt) < P.orbit.deadZone) return;
    phi = M.normAngle(phiAt(pt) + drag.offset);
    render();
    checkDwell();
  }
  function onUp(e) {
    if (!drag || e.pointerId !== drag.id) return;
    drag = null;
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
               target: target, tonightCycle: tonightCycle, armed: armed, dwelling: !!dwell, prompt: hud.text,
               lit: Object.keys(litBatches).length, progress: progress.chapter2 };
    }
  };
  return api;
})();
