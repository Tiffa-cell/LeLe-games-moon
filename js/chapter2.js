/* chapter2.js — 第2章 月亮不发光
 *
 * 目标：月亮亮的那一面永远朝着太阳。
 * 视角：玩家自己的眼睛——画面只有夜空、中央大月亮、太阳和它的椭圆轨道；没有地面、房子、小人，镜头不动。
 * 交互：拖着太阳沿椭圆轨道走（在轨道任何位置按住拖也行，可以绕一整圈）。
 *       轨道是从稍高处俯视的一个水平圆环：太阳走到上半段 = 在月亮后方（变小、被月亮挡住），
 *       走到下半段 = 在月亮前方（变大、盖在月亮前面）。中央月亮的亮面实时朝着太阳
 *       （几何在 moon.js 的 litFromOrbit；形状由 scene.js 的 <mask> 实时算出，不用预制相位图）。
 * 引导：三步，每步屏幕下方一句中文提词（给念的人的，孩子不用识字），一次只显示一句：
 *       ① 你能找到满月吗？——太阳到正前方（±20°）
 *       ② 满月是从哪一边开始变缺的？——从满月往任意一边拖，直到月亮缺掉 ≥ 25%
 *       ③ 能把月亮藏起来吗？——太阳到正后方（±20°，新月）
 *       太阳进入目标区域就开始计时，月亮外围的细弧线在 1 秒里填满即算完成；中途拖出去弧线清空。
 *       屏幕上方三个小圆点显示进度，完成一步亮一个；屏幕下方边缘一条 8 相位小月相带，当前相位高亮。
 * 过关：三个点全亮 → 星星波（沿用第1章）→ 出现「←」返回键（app.js 管）。之后太阳仍可自由拖着玩。
 *
 * 模式：play（可玩、引导中）→ win（闪烁波）→ done（过关后自由玩）；leave（换章节）
 */
window.Chapter2 = (function () {
  'use strict';
  var M = window.MoonMath, P = window.PARAMS, Anim = window.Anim, Progress = window.Progress;
  var FRONT = Math.PI / 2, BACK = -Math.PI / 2;      // 轨道角：正前方（满月）/ 正后方（新月）

  // 三步引导：text 是提词；test(lit) 判断太阳此刻是否在目标区域（lit 见 MoonMath.litFromOrbit）
  var STEPS = [
    { text: '你能找到满月吗？',        test: function (phi) { return within(phi, FRONT); } },
    { text: '满月是从哪一边开始变缺的？', test: function (phi) { return 1 - lit(phi).fraction >= P.guide.gapMin - 1e-6; } },
    { text: '能把月亮藏起来吗？',       test: function (phi) { return within(phi, BACK); } }
  ];

  var scene = null, svg = null, bound = false;
  var mode = 'boot';
  var phi = P.sun.startAngle;     // 太阳的轨道角
  var step = 0;                   // 当前在第几步（0..2）；≥ 3 = 全部完成
  var stepArmed = false;          // 当前这一步是否已就绪（换提词的间隙里不计时）
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

  // ---- HUD（HTML）：上方三个进度点、下方一句提词、底边 8 相位小月相带
  var hud = {
    root: null, dots: [], prompt: null, strip: [], built: false, text: '', fade: null,
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
      var NS = 'http://www.w3.org/2000/svg';
      var S = P.guide.strip, cell = S.cell, r = S.radius;
      var stripSvg = document.getElementById('phase-strip');
      stripSvg.setAttribute('viewBox', '0 0 ' + (cell * 8) + ' ' + cell);
      for (var k = 0; k < 8; k++) {                 // 第1章意义上的八个相位：新月 → 上弦 → 满月 → 下弦 → …
        var slot = document.createElementNS(NS, 'g');   // 外层管位置（transform 属性），内层管高亮缩放（CSS transform）
        slot.setAttribute('transform', 'translate(' + (cell * k + cell / 2) + ' ' + (cell / 2) + ')');
        var g = document.createElementNS(NS, 'g');
        g.setAttribute('class', 'strip-moon');
        slot.appendChild(g);
        var dark = document.createElementNS(NS, 'circle');
        dark.setAttribute('r', r); dark.setAttribute('class', 'm-dark');
        g.appendChild(dark);
        var d = M.litPath(0, 0, r, k / 8);
        if (d) {
          var litEl = document.createElementNS(NS, 'path');
          litEl.setAttribute('d', d); litEl.setAttribute('class', 'm-lit');
          g.appendChild(litEl);
        } else {
          var rim = document.createElementNS(NS, 'circle');
          rim.setAttribute('r', r - 1); rim.setAttribute('class', 'm-rim strip-rim');
          g.appendChild(rim);
        }
        stripSvg.appendChild(slot);
        hud.strip.push(g);
      }
    },
    show: function (on) { hud.root.hidden = !on; hud.root.classList.toggle('show', !!on); },
    setDots: function (n) { hud.dots.forEach(function (d, i) { d.classList.toggle('lit', i < n); }); },
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

  // ---- 引导：当前步的目标区域 / 停住 1 秒（细弧线）
  function inTarget() { return mode === 'play' && stepArmed && step < STEPS.length && STEPS[step].test(phi); }
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
  function armStep(instant) {                       // 进入第 step 步：换提词；提词换好后才开始计时
    stepArmed = false;
    if (step >= STEPS.length) { hud.setPrompt('', instant); return; }
    hud.setPrompt(STEPS[step].text, instant);
    if (instant) { stepArmed = true; checkDwell(); return; }
    track(Anim.delay(P.guide.promptFadeMs * 2, function () { stepArmed = true; checkDwell(); }));
  }
  function complete() {                             // 这一步完成：点亮一个进度点、月晕亮一下、点亮太阳那一侧的几批星
    if (mode !== 'play') return;
    stepArmed = false;
    scene.setArc(1);
    step += 1;
    hud.setDots(step);
    scene.surge();
    var i = Math.round(lit(phi).cycle * 8);
    [i - 1, i, i + 1].forEach(function (b) {
      b = ((b % 8) + 8) % 8;
      if (!litBatches[b]) { litBatches[b] = true; scene.lightBatch(b, true); }
    });
    if (step >= STEPS.length) { track(Anim.delay(P.guide.stepDelayMs, win)); return; }
    track(Anim.delay(P.guide.stepDelayMs, function () { scene.setArc(0); armStep(false); }));
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
    progress.chapter2.completed = true;
    progress.chapter2.rounds += 1;
    save();
    hinted = true;
    svg.classList.remove('hint');
    scene.setArc(0);
    hud.setPrompt('', false);
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
    if (first) {                                    // 每次进入都从第一步开始（引导本身就是玩法）
      phi = P.sun.startAngle; step = 0; litBatches = {};
      hud.setDots(0);
      render();
      setMode('play');
      armStep(false);
      return;
    }
    // 重建：直接进入当前模式的终点状态
    scene.setLitBatches(litBatches, false);
    render();
    if (mode === 'win') { for (var i = 0; i < 8; i++) litBatches[i] = true; scene.setLitBatches(litBatches, false); setMode('done'); }
    if (mode === 'done' || step >= STEPS.length) { hud.setDots(STEPS.length); hud.setPrompt('', true); setMode('done'); return; }
    setMode('play');
    hud.setDots(step);
    armStep(true);
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
    if (hud.built) { hud.show(false); hud.setPrompt('', true); }
    mode = 'boot';
  }

  var api = {
    attach: attach,
    detach: detach,
    leave: leave,
    onMode: null,
    STEPS: STEPS,
    // 供调试 / 测试读取
    state: function () {
      var L = lit(phi);
      return { mode: mode, phi: phi, depth: L.depth, fraction: L.fraction, cycle: L.cycle, step: step, armed: stepArmed,
               dwelling: !!dwell, prompt: hud.text, lit: Object.keys(litBatches).length, progress: progress.chapter2 };
    }
  };
  return api;
})();
