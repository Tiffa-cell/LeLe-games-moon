/* chapter1.js — 第1章 圆缺循环（现象）
 *
 * 目标：月亮不是变大变小，是循环变化，一圈一圈。
 * 交互：拖着相位环上那颗发光的小月亮沿环滑动（在环的任何位置按住拖也行），
 *       中央大月亮的相位实时跟随；松手时轻轻吸附到最近的相位。
 * 反馈：每经过一个相位节点，天空点亮一批星（走满一圈正好全亮）；
 *       走满一圈的瞬间，闪烁波由月亮向外扩散、小人抬头 → 镜头落到小人身上，停 2 秒 → 缓缓拉回原构图，
 *       拉回时星空回暗，可以直接再拖一圈。四角星在第一次通关时出现，之后一直留着。
 * 往返：开场镜头停在小人身上，再拉远到「宇宙视角」（整个循环）；结尾回到小人视角。
 * 章节入口：过关后镜头拉回时，画面下方出现一个太阳图标（app.js 管），点它进第2章。
 *
 * 模式：intro（开场）→ play（可玩）→ win（过关演出）→ hold（停在小人身上）→ return（拉远）→ play …
 *       leave（换章节：镜头落到小人身上，然后 app.js 换场景）
 */
window.Chapter1 = (function () {
  'use strict';
  var M = window.MoonMath, P = window.PARAMS, Anim = window.Anim, Progress = window.Progress;
  var TAU = M.TAU, HOME = M.HOME_ANGLE;

  var scene = null, svg = null, bound = false;
  var mode = 'boot';
  var theta = HOME;            // 小月亮在环上的屏幕角
  var net = 0;                 // 本圈累计走过的弧度（正 = 顺相位方向）
  var drag = null;             // { id, offset }
  var running = [];            // 进行中的动画句柄
  var snapHandle = null;
  var camera = null;           // 当前 viewBox
  var hinted = false;          // 本次会话里已经拖过了（光晕不再呼吸）
  var litBatches = {};         // 本圈已点亮的星星批次（节点序号 → true）

  var progress = Progress.data;
  if (!progress.chapter1) progress.chapter1 = { completed: false, laps: 0 };

  function save() { Progress.save(); }
  function setMode(m) { mode = m; if (api.onMode) api.onMode(m); }
  function track(h) { running.push(h); return h; }
  function cancelAll() {
    running.forEach(function (h) { h.cancel(); });
    running = [];
    snapHandle = null;
  }
  function frac(x) { return x - Math.floor(x); }

  // ---- 渲染
  function render() {
    scene.setTraveler(theta);
    scene.setPhase(M.phaseFromAngle(theta));
    scene.setTrail(net);
  }
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

  // ---- 推进：delta 为弧度，正 = 顺相位方向（屏幕上逆时针）
  function advance(delta) {
    if (mode !== 'play' || !delta) return;
    var oldP = M.phaseFromAngle(theta);
    theta = M.normAngle(theta - delta);
    net += delta;
    // 经过某个相位小月亮：它轻轻一跳，天空点亮一批星
    var dp = delta / TAU, adp = Math.abs(dp) + 1e-9;
    for (var i = 0; i < 8; i++) {
      var gap = dp > 0 ? frac(i / 8 - oldP) : frac(oldP - i / 8);
      if (gap > 1e-9 && gap <= adp) {
        scene.pulseMarker(i);
        if (!litBatches[i]) { litBatches[i] = true; scene.lightBatch(i, true); }
      }
    }
    render();
    if (Math.abs(net) >= TAU - P.win.lapEpsilon) win();
  }

  // ---- 拖拽
  function angleAt(pt) { return Math.atan2(pt.y - scene.ring.cy, pt.x - scene.ring.cx); }
  function distAt(pt) { return Math.hypot(pt.x - scene.ring.cx, pt.y - scene.ring.cy); }

  function onDown(e) {
    if (mode === 'intro') { skipIntro(); return; }
    if (mode === 'hold') { returnToPlay(); return; }
    if (mode !== 'play' || drag) return;
    var pt = scene.toSvgPoint(e.clientX, e.clientY);
    if (!pt) return;
    var tx = scene.ring.cx + scene.ring.r * Math.cos(theta);
    var ty = scene.ring.cy + scene.ring.r * Math.sin(theta);
    var onTraveler = Math.hypot(pt.x - tx, pt.y - ty) <= P.ring.travelerRadius + P.ring.haloExtra + 24;
    var onRing = Math.abs(distAt(pt) - scene.ring.r) <= P.ring.grabBand;
    if (!onTraveler && !onRing) return;
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
    if (!pt || distAt(pt) < P.ring.centerDeadZone) return;
    var target = M.normAngle(angleAt(pt) + drag.offset);
    advance(-M.normAngle(target - theta));
  }
  function onUp(e) {
    if (!drag || e.pointerId !== drag.id) return;
    drag = null;
    if (mode === 'play' && P.ring.snap) snap();
  }

  // 松手：吸附到最近的相位（经由 advance，轨迹与过关判定保持一致）
  function snap() {
    var p = M.phaseFromAngle(theta);
    var dp = Math.round(p * 8) / 8 - p;
    if (dp > 0.5) dp -= 1;
    if (dp < -0.5) dp += 1;
    var total = dp * TAU;
    if (Math.abs(total) < 1e-9) return;
    if (Math.abs(total) < 0.01) { advance(total); return; }   // 只差一丁点：直接落到节点上（让「经过节点」的判定生效）
    var done = 0;
    snapHandle = track(Anim.tween({
      ms: P.ring.snapMs, ease: Anim.ease.out,
      onUpdate: function (t) { var v = total * t; advance(v - done); done = v; },
      onDone: function () { snapHandle = null; }
    }));
  }

  // ---- 过关演出
  function win() {
    setMode('win');
    cancelAll();
    drag = null;
    progress.chapter1.completed = true;
    progress.chapter1.laps += 1;
    save();
    theta = HOME;
    net = net < 0 ? -TAU : TAU;            // 轨迹合成完整的一圈
    render();
    hinted = true;
    svg.classList.remove('hint');

    // 走满一圈的瞬间：剩下的星全部点亮（闪烁波会盖过点亮动画，所以直接亮），闪烁波由月亮向外扩散，四角星亮起，小人抬头
    for (var i = 0; i < 8; i++) {
      if (!litBatches[i]) { litBatches[i] = true; scene.lightBatch(i, false); }
    }
    scene.setSparklesLit(true, true);
    scene.wave();
    track(Anim.tween({ ms: P.kid.lookUpMs, ease: Anim.ease.inOut, onUpdate: function (t) { scene.setKidLook(t); } }));

    // 闪烁波过后：镜头落到小人身上，停一会儿，再缓缓拉回
    var C = P.camera;
    track(Anim.delay(C.winDelayMs, function () {
      tweenCamera(scene.kidFrame(), C.winZoomMs, Anim.ease.inOut, function () {
        net = 0; render();                 // 镜头在小人身上时，悄悄把轨迹清掉、回到起点
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
    scene.dimStars();                      // 新的一圈从暗夜开始，星星可以再次一批批点亮
    track(Anim.tween({ ms: P.kid.lookUpMs, ease: Anim.ease.inOut, onUpdate: function (t) { scene.setKidLook(1 - t); } }));
    tweenCamera(scene.fullFrame(), P.camera.returnZoomMs, Anim.ease.inOut, function () { setMode('play'); });
  }

  // ---- 开场：停在小人身上 → 拉远到宇宙视角
  function runIntro() {
    setMode('intro');
    setCamera(scene.kidFrame());
    scene.setKidLook(0);
    track(Anim.delay(P.camera.introHoldMs, function () {
      tweenCamera(scene.fullFrame(), P.camera.introZoomMs, Anim.ease.inOut, function () { setMode('play'); });
    }));
  }
  function skipIntro() {
    cancelAll();
    setMode('return');
    tweenCamera(scene.fullFrame(), 450, Anim.ease.out, function () { setMode('play'); });
  }

  // ---- 换章节：镜头先落到小人身上（星空同时回暗），到了再交给 app.js 换场景
  function leave(done) {
    cancelAll();
    drag = null;
    setMode('leave');
    theta = HOME; net = 0; litBatches = {};       // 下次回来是新的一圈
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
    scene.setLitBatches(litBatches, false);
    scene.setSparklesLit(progress.chapter1.completed, first);   // 首次进入：四角星（通关印记）淡入
    svg.classList.toggle('hint', !hinted);
    if (first) { render(); runIntro(); return; }
    // 重建：直接进入当前模式的终点状态
    if (mode === 'hold') {
      net = 0; render();
      setCamera(scene.kidFrame());
      scene.setKidLook(1);
      track(Anim.delay(P.camera.holdMs, returnToPlay));
    } else {
      if (mode === 'win') { theta = HOME; net = 0; }
      if (mode === 'win' || mode === 'return') { litBatches = {}; scene.setLitBatches(litBatches, false); scene.dimStars(); }
      setMode('play');
      render();
      scene.setKidLook(0);
      setCamera(scene.fullFrame());
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
  }

  var api = {
    attach: attach,
    detach: detach,
    leave: leave,
    onMode: null,          // app.js 挂上：模式变化时回调（管章节入口图标的显隐）
    // 供调试 / 测试读取
    state: function () { return { mode: mode, theta: theta, net: net, phase: M.phaseFromAngle(theta), lit: Object.keys(litBatches).length, progress: progress.chapter1 }; }
  };
  return api;
})();
