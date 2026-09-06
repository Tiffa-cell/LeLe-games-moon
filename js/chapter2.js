/* chapter2.js — 第2章 月亮不发光
 *
 * 目标：月亮亮的那一面永远朝着太阳。
 * 画面：中央月球（球体感），一颗可拖动的太阳在外圈轨道上；屏幕左上角一枚「目标相位」小月亮。
 * 交互：拖太阳绕月亮走（可以走一整圈），中央月亮的明暗界线实时跟随太阳方向——亮面永远朝太阳
 *       （几何在 moon.js 的 litFromSun；形状由 scene.js 的 <mask> 实时算出，不用预制相位图）。
 * 过关：把太阳拖到让中央月亮和目标一样形状的位置，停住 holdMs（1 秒）算对；目标外圈的虚线在这一秒里慢慢亮起来。
 *       连对 goal（3）次过关。允许 ±toleranceDeg（20°）的误差；松手时在误差内会轻轻吸到正确位置。
 * 反馈：每答对一次，目标轻轻一跳、月晕亮一下，天空点亮太阳那一侧的几批星；
 *       第三次对了：闪烁波由月亮向外扩散、小人抬头 → 镜头落到小人身上，停 2 秒 → 缓缓拉回，星空回暗，新的一轮开始。
 * 往返：开场镜头停在小人身上再拉远；结尾回到小人视角。左下方的小月亮图标（app.js 管）可以回第1章。
 *
 * 模式：intro → play → win → hold → return → play …；leave（换章节）
 */
window.Chapter2 = (function () {
  'use strict';
  var M = window.MoonMath, P = window.PARAMS, Anim = window.Anim, Progress = window.Progress;
  var TAU = M.TAU;

  var scene = null, svg = null, bound = false;
  var mode = 'boot';
  var theta = P.sun.startAngle;   // 太阳的屏幕角
  var target = null;              // 目标：太阳应到的屏幕角（弧度）；null = 此刻没有目标（切换中 / 演出中）
  var targetIndex = -1;           // 目标在 choices 等分里的序号
  var streak = 0;                 // 本轮已连对次数
  var dwell = null;               // 「停住 1 秒」计时
  var drag = null;                // { id, offset }
  var running = [];
  var snapHandle = null;
  var camera = null;
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
    snapHandle = null;
    dwell = null;
  }
  function step() { return TAU / P.target.choices; }
  function choiceAngle(i) { return M.normAngle(i * step()); }                     // 0 = 正右方（弦月），顺时针编号
  function nearestChoice(a) { return ((Math.round(a / step()) % P.target.choices) + P.target.choices) % P.target.choices; }
  function within(a, b) { return Math.abs(M.normAngle(a - b)) <= P.target.toleranceDeg * Math.PI / 180; }

  // ---- 渲染
  function render() { scene.setSun(theta); }
  function setCamera(fr) { camera = fr; scene.setFrame(fr); }
  function lerpFrame(a, b, t) {
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, w: a.w + (b.w - a.w) * t, h: a.h + (b.h - a.h) * t };
  }
  function tweenCamera(to, ms, ease, done) {
    var from = camera;
    return track(Anim.tween({
      ms: ms, ease: ease,
      onUpdate: function (t) { setCamera(lerpFrame(from, to, t)); },
      onDone: done
    }));
  }

  // ---- 目标
  function pickTarget() {                 // 随机选一个：不选太阳此刻所在的方位（不然不用动），也不和上一个重复
    var n = P.target.choices, avoid = nearestChoice(theta), pool = [];
    for (var i = 0; i < n; i++) if (i !== avoid && i !== targetIndex) pool.push(i);
    return pool[Math.floor(Math.random() * pool.length)];
  }
  function showTarget(i) {
    targetIndex = i;
    target = choiceAngle(i);
    scene.setTarget(target);
    checkDwell();
  }
  function nextTarget() {                 // 换目标：先淡出，换形状，再淡入
    target = null;
    stopDwell();
    scene.setTargetHidden(true);
    track(Anim.delay(P.target.swapMs, function () {
      showTarget(pickTarget());
      scene.setTargetHidden(false);
    }));
  }

  // ---- 「停住 1 秒」：太阳在误差范围内就开始计时，离开就作废；到点算对
  function checkDwell() {
    if (mode !== 'play' || target === null) { stopDwell(); return; }
    var near = within(theta, target);
    if (near && !dwell) {
      scene.setTargetNear(true);
      dwell = track(Anim.delay(P.target.holdMs, success));
    } else if (!near && dwell) {
      stopDwell();
    }
  }
  function stopDwell() {
    if (dwell) { dwell.cancel(); dwell = null; }
    if (scene) scene.setTargetNear(false);
  }
  function success() {
    dwell = null;
    if (mode !== 'play' || target === null) return;
    var t = target;
    target = null;
    streak += 1;
    scene.setTargetNear(false);
    scene.pulseTarget();
    scene.surge();
    if (!drag) snapTo(t);                  // 没在拖：轻轻吸到正好的位置
    // 天空点亮太阳那一侧的几批星（第 i 批在第1章第 i 个相位节点那一侧）
    var i = Math.round(M.phaseFromAngle(t) * 8);
    [i - 1, i, i + 1].forEach(function (b) {
      b = ((b % 8) + 8) % 8;
      if (!litBatches[b]) { litBatches[b] = true; scene.lightBatch(b, true); }
    });
    if (streak >= P.target.goal) { track(Anim.delay(P.target.winPauseMs, win)); return; }
    track(Anim.delay(P.target.swapDelayMs, nextTarget));
  }

  // ---- 拖拽
  function angleAt(pt) { return Math.atan2(pt.y - scene.sun.cy, pt.x - scene.sun.cx); }
  function distAt(pt) { return Math.hypot(pt.x - scene.sun.cx, pt.y - scene.sun.cy); }

  function onDown(e) {
    if (mode === 'intro') { skipIntro(); return; }
    if (mode === 'hold') { returnToPlay(); return; }
    if (mode !== 'play' || drag) return;
    var pt = scene.toSvgPoint(e.clientX, e.clientY);
    if (!pt) return;
    var sx = scene.sun.cx + scene.sun.r * Math.cos(theta);
    var sy = scene.sun.cy + scene.sun.r * Math.sin(theta);
    var onSun = Math.hypot(pt.x - sx, pt.y - sy) <= P.sun.grabRadius;
    var onOrbit = Math.abs(distAt(pt) - scene.sun.r) <= P.sun.grabBand;
    if (!onSun && !onOrbit) return;
    if (snapHandle) { snapHandle.cancel(); snapHandle = null; }
    drag = { id: e.pointerId, offset: M.normAngle(theta - angleAt(pt)) };
    try { svg.setPointerCapture(e.pointerId); } catch (err) { /* 不支持就算了 */ }
    if (!hinted) { hinted = true; svg.classList.remove('hint'); }
    e.preventDefault();
  }
  function onMove(e) {
    if (!drag || e.pointerId !== drag.id) return;
    e.preventDefault();
    if (mode !== 'play') return;
    var pt = scene.toSvgPoint(e.clientX, e.clientY);
    if (!pt || distAt(pt) < P.sun.centerDeadZone) return;
    theta = M.normAngle(angleAt(pt) + drag.offset);
    render();
    checkDwell();
  }
  function onUp(e) {
    if (!drag || e.pointerId !== drag.id) return;
    drag = null;
    if (mode === 'play' && target !== null && within(theta, target)) snapTo(target);   // 松手在误差内：吸到正好的位置
  }
  function snapTo(angle) {
    var from = theta, delta = M.normAngle(angle - from);
    if (Math.abs(delta) < 1e-6) return;
    if (snapHandle) snapHandle.cancel();
    snapHandle = track(Anim.tween({
      ms: P.sun.snapMs, ease: Anim.ease.out,
      onUpdate: function (t) { theta = M.normAngle(from + delta * t); render(); checkDwell(); },
      onDone: function () { snapHandle = null; }
    }));
  }

  // ---- 过关演出（与第1章同一套：闪烁波 + 小人抬头 + 镜头落到小人身上）
  function win() {
    setMode('win');
    cancelAll();
    drag = null;
    target = null;
    progress.chapter2.completed = true;
    progress.chapter2.rounds += 1;
    save();
    hinted = true;
    svg.classList.remove('hint');
    for (var i = 0; i < 8; i++) {
      if (!litBatches[i]) { litBatches[i] = true; scene.lightBatch(i, false); }
    }
    scene.setSparklesLit(true, true);
    scene.wave();
    track(Anim.tween({ ms: P.kid.lookUpMs, ease: Anim.ease.inOut, onUpdate: function (t) { scene.setKidLook(t); } }));
    var C = P.camera;
    track(Anim.delay(C.winDelayMs, function () {
      tweenCamera(scene.kidFrame(), C.winZoomMs, Anim.ease.inOut, function () {
        setMode('hold');
        track(Anim.delay(C.holdMs, returnToPlay));
      });
    }));
  }
  function returnToPlay() {
    if (mode !== 'hold') return;
    setMode('return');
    cancelAll();
    litBatches = {};
    streak = 0;
    scene.dimStars();
    nextTarget();                          // 新的一轮：镜头拉回的路上换上新目标
    track(Anim.tween({ ms: P.kid.lookUpMs, ease: Anim.ease.inOut, onUpdate: function (t) { scene.setKidLook(1 - t); } }));
    tweenCamera(scene.fullFrame(), P.camera.returnZoomMs, Anim.ease.inOut, function () { setMode('play'); checkDwell(); });
  }

  // ---- 开场：停在小人身上 → 拉远，看见太阳和月亮
  function runIntro() {
    setMode('intro');
    setCamera(scene.kidFrame());
    scene.setKidLook(0);
    track(Anim.delay(P.camera.introHoldMs, function () {
      tweenCamera(scene.fullFrame(), P.camera.introZoomMs, Anim.ease.inOut, function () { setMode('play'); checkDwell(); });
    }));
  }
  function skipIntro() {
    cancelAll();
    setMode('return');
    tweenCamera(scene.fullFrame(), 450, Anim.ease.out, function () { setMode('play'); checkDwell(); });
  }

  // ---- 换章节：镜头先落到小人身上（星空回暗），到了再交给 app.js 换场景
  function leave(done) {
    cancelAll();
    drag = null;
    setMode('leave');
    scene.setTargetNear(false);
    scene.dimStars();
    scene.setSparklesLit(false, true);
    tweenCamera(scene.kidFrame(), P.camera.switchZoomMs, Anim.ease.inOut, done);
  }

  // ---- 挂到（新的）场景上；first = 首次进入本章，其余为窗口尺寸变化后重建
  function attach(newScene, first) {
    cancelAll();
    drag = null;
    scene = newScene;
    svg = scene.svg;
    if (!bound) {
      bound = true;
      svg.addEventListener('pointerdown', onDown);
      svg.addEventListener('pointermove', onMove);
      svg.addEventListener('pointerup', onUp);
      svg.addEventListener('pointercancel', onUp);
    }
    scene.setSparklesLit(progress.chapter2.completed, first);
    svg.classList.toggle('hint', !hinted);
    if (first) {
      theta = P.sun.startAngle; streak = 0; litBatches = {}; targetIndex = -1;
      render();
      showTarget(pickTarget());
      runIntro();
      return;
    }
    // 重建：直接进入当前模式的终点状态
    scene.setLitBatches(litBatches, false);
    render();
    if (mode === 'hold') {
      setCamera(scene.kidFrame());
      scene.setKidLook(1);
      if (targetIndex >= 0) scene.setTarget(choiceAngle(targetIndex));
      track(Anim.delay(P.camera.holdMs, returnToPlay));
    } else {
      if (mode === 'win' || mode === 'return') {
        litBatches = {}; streak = 0; scene.setLitBatches(litBatches, false); scene.dimStars();
        targetIndex = -1; target = null;
      }
      setMode('play');
      scene.setKidLook(0);
      setCamera(scene.fullFrame());
      if (target === null) showTarget(pickTarget()); else showTarget(targetIndex);
    }
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
    mode = 'boot';
    target = null;
  }

  var api = {
    attach: attach,
    detach: detach,
    leave: leave,
    onMode: null,
    // 供调试 / 测试读取
    state: function () {
      return { mode: mode, theta: theta, target: target, targetIndex: targetIndex, streak: streak,
               dwelling: !!dwell, lit: Object.keys(litBatches).length, progress: progress.chapter2 };
    }
  };
  return api;
})();
