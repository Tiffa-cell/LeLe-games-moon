/* scene.js — 分层绘制（SVG）：天空 → 星 → 月晕 → 相位环 → 主月亮 → 地面剪影
 *
 * 坐标系沿用 M0 概念稿（参考画布 1668 × 2388），按实际屏幕比例扩展画布：
 *   比参考更窄长（iPad 竖屏、iPhone）：宽固定 1668，高按比例加长；
 *   比参考更宽（iPad 横屏）：高固定 2388，宽按比例加宽，两侧补山丘。
 * 主月亮按比例居上，地面锚定在画布底部，所以任何屏幕都不裁切构图。
 *
 * 本文件不出现任何颜色值：所有填色都通过 class → CSS 变量（theme.js）引用。
 */
window.Scene = (function () {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg';
  var M = window.MoonMath;

  function el(name, attrs, parent) {
    var node = document.createElementNS(NS, name);
    if (attrs) {
      for (var k in attrs) {
        if (attrs[k] !== undefined && attrs[k] !== null) node.setAttribute(k, attrs[k]);
      }
    }
    if (parent) parent.appendChild(node);
    return node;
  }
  function f(n) { return Math.round(n * 10) / 10; }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  // 可复现的随机数（mulberry32）
  function rng(seed) {
    return function () {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      var t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  // 四角星
  function sparklePath(x, y, s) {
    x = f(x); y = f(y); s = f(s);
    return 'M ' + x + ',' + (y - s) + ' Q ' + x + ',' + y + ' ' + (x + s) + ',' + y +
           ' Q ' + x + ',' + y + ' ' + x + ',' + (y + s) +
           ' Q ' + x + ',' + y + ' ' + (x - s) + ',' + y +
           ' Q ' + x + ',' + y + ' ' + x + ',' + (y - s) + ' Z';
  }

  function create(svg, viewW, viewH) {
    var P = window.PARAMS;
    var ref = P.ref;
    var refAspect = ref.width / ref.height;
    var aspect = (viewW > 0 && viewH > 0) ? viewW / viewH : refAspect;
    var VW, VH;
    if (aspect <= refAspect) { VW = ref.width; VH = Math.round(VW / aspect); }
    else { VH = ref.height; VW = Math.round(VH * aspect); }

    // ---- 布局（画布单位）
    var cx = VW / 2;
    var moonR = P.moon.radius, ringR = P.ring.radius;
    var ringOuter = ringR + P.ring.travelerRadius + P.ring.haloExtra;
    var groundTop = VH - 408;                       // 远山最高点（M0：2388 - 1980）
    var cy = clamp(VH * P.moon.yRatio, ringOuter + 40, groundTop - ringOuter - 40);
    var by = VH - 336;                              // 小屋地基
    var pb = VH - 294;                              // 小人脚下
    var hx = cx - 334, tx = hx - 128, px = cx + 416;

    // 非颜色参数 → CSS 变量
    var rs = document.documentElement.style;
    rs.setProperty('--star-dim', P.stars.dim);
    rs.setProperty('--star-light-ms', P.stars.lightMs + 'ms');
    rs.setProperty('--crater-alpha', P.moon.craterAlpha);
    rs.setProperty('--ring-alpha', P.ring.alpha);
    rs.setProperty('--trail-alpha', P.ring.trailAlpha);

    while (svg.firstChild) svg.removeChild(svg.firstChild);
    svg.setAttribute('viewBox', '0 0 ' + VW + ' ' + VH);

    // ---- defs：渐变与剪裁
    var defs = el('defs', null, svg);
    var gSky = el('linearGradient', { id: 'g-sky', gradientUnits: 'userSpaceOnUse', x1: 0, y1: 0, x2: 0, y2: VH }, defs);
    el('stop', { offset: 0, 'class': 'sky-top' }, gSky);
    el('stop', { offset: 1, 'class': 'sky-bottom' }, gSky);
    var gGlow = el('radialGradient', { id: 'g-glow' }, defs);
    el('stop', { offset: 0.45, 'class': 'glow-stop', 'stop-opacity': P.moon.glowAlpha }, gGlow);
    el('stop', { offset: 1, 'class': 'glow-stop', 'stop-opacity': 0 }, gGlow);
    var gHalo = el('radialGradient', { id: 'g-halo' }, defs);
    el('stop', { offset: 0.5, 'class': 'glow-stop', 'stop-opacity': P.ring.haloAlpha }, gHalo);
    el('stop', { offset: 1, 'class': 'glow-stop', 'stop-opacity': 0 }, gHalo);
    var clip = el('clipPath', { id: 'clip-moon-lit' }, defs);
    var clipPath = el('path', { d: 'M 0 0' }, clip);

    // ---- 1 天空（向四周多画一些，镜头移动时不露底）
    var lSky = el('g', { 'class': 'layer layer-sky' }, svg);
    el('rect', { x: -VW, y: -VH, width: VW * 3, height: VH * 3, fill: 'url(#g-sky)' }, lSky);

    // ---- 2 星：稀疏星点 + 少量四角星，避开相位环与地面
    var lStars = el('g', { 'class': 'layer layer-stars' }, svg);
    var R = rng(P.stars.seed);
    var area = (VW * VH) / (ref.width * ref.height);
    var stars = [], sparkles = [], guard = 0, x, y, op;
    var nStars = clamp(Math.round(P.stars.count * area), 24, 160);
    while (stars.length < nStars && guard++ < 8000) {
      x = 40 + R() * (VW - 80); y = 50 + R() * (VH - 540);
      if (Math.hypot(x - cx, y - cy) < ringR + 120) continue;
      var r = 2.2 + R() * 2.4; op = 0.28 + R() * 0.57;
      var s = el('circle', { cx: f(x), cy: f(y), r: f(r), 'class': 'star' }, lStars);
      s.style.setProperty('--op', op.toFixed(2));
      stars.push({ el: s, x: x, y: y });
    }
    var nSpark = clamp(Math.round(P.stars.sparkles * area), 3, 20); guard = 0;
    while (sparkles.length < nSpark && guard++ < 8000) {
      x = 80 + R() * (VW - 160); y = 80 + R() * (VH - 670);
      if (Math.hypot(x - cx, y - cy) < ringR + 160) continue;
      var sz = 9 + R() * 6; op = 0.5 + R() * 0.4;
      var sp = el('path', { d: sparklePath(x, y, sz), 'class': 'sparkle' }, lStars);
      sp.style.setProperty('--op', op.toFixed(2));
      sparkles.push(sp);
    }
    // 点亮顺序：离小人近的先亮，像从他身边一路亮到天边
    var starOrder = stars.slice().sort(function (a, b) {
      return Math.hypot(a.x - px, a.y - pb) - Math.hypot(b.x - px, b.y - pb);
    }).map(function (s) { return s.el; });

    // ---- 3 月晕
    var lGlow = el('g', { 'class': 'layer layer-glow' }, svg);
    var glow = el('circle', { cx: cx, cy: cy, r: moonR + P.moon.glowExtra, fill: 'url(#g-glow)', 'class': 'moon-glow' }, lGlow);

    // ---- 4 相位环：虚线轨道、已走过的弧、八枚小月亮、可拖动的那颗
    var lRing = el('g', { 'class': 'layer layer-ring' }, svg);
    el('circle', { cx: cx, cy: cy, r: ringR, 'class': 'ring-guide', 'stroke-width': P.ring.width, 'stroke-dasharray': P.ring.dash }, lRing);
    var trail = el('path', { 'class': 'ring-trail', 'stroke-width': P.ring.width + 1 }, lRing);

    function smallMoon(parent, r, p) {
      el('circle', { r: r, 'class': 'm-dark' }, parent);
      var lit = el('path', { 'class': 'm-lit' }, parent);
      var rim = el('circle', { r: r - 1.5, 'class': 'm-rim' }, parent);
      var api = {
        set: function (p) {
          var d = M.litPath(0, 0, r, p);
          if (d) { lit.setAttribute('d', d); lit.style.visibility = ''; }
          else lit.style.visibility = 'hidden';
          rim.style.opacity = P.moon.rimAlpha * clamp(1 - M.litFraction(p) / 0.12, 0, 1);
        }
      };
      api.set(p);
      return api;
    }

    var markerInners = [];
    for (var i = 0; i < 8; i++) {
      var th = M.angleFromPhase(i / 8);
      var g = el('g', { 'class': 'marker', transform: 'translate(' + f(cx + ringR * Math.cos(th)) + ' ' + f(cy + ringR * Math.sin(th)) + ')' }, lRing);
      var inner = el('g', { 'class': 'marker-inner' }, g);
      smallMoon(inner, P.ring.markerRadius, i / 8);
      markerInners.push(inner);
    }
    var gTrav = el('g', { 'class': 'traveler' }, lRing);
    el('circle', { r: P.ring.travelerRadius + P.ring.haloExtra, fill: 'url(#g-halo)', 'class': 'traveler-halo' }, gTrav);
    var trav = smallMoon(gTrav, P.ring.travelerRadius, 0);

    // ---- 5 主月亮：暗盘 + 新月细亮边 + （按相位剪裁的）亮盘与浅坑
    var lMoon = el('g', { 'class': 'layer layer-moon' }, svg);
    el('circle', { cx: cx, cy: cy, r: moonR, 'class': 'moon-dark' }, lMoon);
    var rim = el('circle', { cx: cx, cy: cy, r: moonR - 1.5, 'class': 'moon-rim' }, lMoon);
    var gLit = el('g', { 'clip-path': 'url(#clip-moon-lit)' }, lMoon);
    el('circle', { cx: cx, cy: cy, r: moonR, 'class': 'moon-lit' }, gLit);
    P.moon.craters.forEach(function (c) {
      el('circle', { cx: cx + c[0], cy: cy + c[1], r: c[2], 'class': 'moon-crater' }, gLit);
    });

    // ---- 6 地面：圆弧山丘、小屋（暖窗）、小树、仰望的小人
    var lGround = el('g', { 'class': 'layer layer-ground' }, svg);
    el('rect', { x: -VW, y: VH - 80, width: VW * 3, height: VH, 'class': 'hill-near' }, lGround);   // 地平面兜底
    if (VW > ref.width + 200) {                       // 横屏：向两侧续几座山
      var k = 0, hxL = cx - 1250, hxR = cx + 1300;
      while (hxL + 560 > -100 && k < 6) { el('circle', { cx: f(hxL), cy: VH + 200, r: 560, 'class': k % 2 ? 'hill-mid' : 'hill-far' }, lGround); hxL -= 900; k++; }
      k = 0;
      while (hxR - 540 < VW + 100 && k < 6) { el('circle', { cx: f(hxR), cy: VH + 180, r: 540, 'class': k % 2 ? 'hill-mid' : 'hill-far' }, lGround); hxR += 900; k++; }
    }
    el('circle', { cx: cx + 66, cy: VH + 112, r: 520, 'class': 'hill-far' }, lGround);
    el('circle', { cx: cx - 354, cy: VH + 232, r: 580, 'class': 'hill-mid' }, lGround);
    el('circle', { cx: cx + 416, cy: VH + 292, r: 600, 'class': 'hill-near' }, lGround);
    // 小屋：方身 + 尖顶 + 烟囱 + 一扇暖窗
    el('rect', { x: hx - 48, y: by - 80, width: 96, height: 80, 'class': 'sil' }, lGround);
    el('polygon', { points: (hx - 62) + ',' + (by - 80) + ' ' + (hx + 62) + ',' + (by - 80) + ' ' + hx + ',' + (by - 142), 'class': 'sil' }, lGround);
    el('rect', { x: hx + 22, y: by - 150, width: 14, height: 34, 'class': 'sil' }, lGround);
    el('circle', { cx: hx - 4, cy: by - 44, r: 30, 'class': 'window-glow' }, lGround);
    el('rect', { x: hx - 14, y: by - 58, width: 20, height: 26, rx: 9, 'class': 'window' }, lGround);
    // 小树：细干 + 水滴形树冠
    el('rect', { x: tx - 3, y: by - 52, width: 6, height: 54, 'class': 'sil' }, lGround);
    el('path', { d: 'M ' + tx + ',' + (by - 128) + ' Q ' + (tx + 30) + ',' + (by - 82) + ' ' + tx + ',' + (by - 44) +
                    ' Q ' + (tx - 30) + ',' + (by - 82) + ' ' + tx + ',' + (by - 128) + ' Z', 'class': 'sil' }, lGround);
    // 小人：右侧山丘顶，玩家的化身
    var gKid = el('g', { 'class': 'kid' }, lGround);
    var kidBody = el('path', { 'class': 'sil' }, gKid);
    var kidHead = el('circle', { r: 13, 'class': 'sil' }, gKid);

    // 动画结束后清掉一次性 class（只绑一次）
    if (!svg.__sceneBound) {
      svg.__sceneBound = true;
      svg.addEventListener('animationend', function (e) {
        var t = e.target;
        if (t && t.classList) { t.classList.remove('pulse'); t.classList.remove('twinkle'); }
      });
    }

    // ---- API
    function setKidLook(u) {              // u: 0 平视 → 1 抬头望月（头往月亮那边抬，整个人微微后仰）
      var top = 50 + 4 * u;
      kidBody.setAttribute('d', 'M ' + (px - 15) + ',' + pb + ' Q ' + (px - 15) + ',' + f(pb - 46 - 3 * u) + ' ' + px + ',' + f(pb - top) +
                                ' Q ' + (px + 15) + ',' + f(pb - 46 - 3 * u) + ' ' + (px + 15) + ',' + pb + ' Z');
      kidHead.setAttribute('cx', f(px + 4 - 9 * u));
      kidHead.setAttribute('cy', f(pb - 61 - 10 * u));
      gKid.setAttribute('transform', 'rotate(' + f(-7 * u) + ' ' + px + ' ' + pb + ')');
    }
    setKidLook(0);

    function setPhase(p) {
      var d = M.litPath(cx, cy, moonR, p);
      if (d) { clipPath.setAttribute('d', d); gLit.style.visibility = ''; }
      else gLit.style.visibility = 'hidden';
      var lit = M.litFraction(p);
      rim.style.opacity = P.moon.rimAlpha * clamp(1 - lit / 0.12, 0, 1);
      glow.style.opacity = P.moon.glowMinRatio + (1 - P.moon.glowMinRatio) * lit;
    }

    function setTraveler(theta) {
      gTrav.setAttribute('transform', 'translate(' + f(cx + ringR * Math.cos(theta)) + ' ' + f(cy + ringR * Math.sin(theta)) + ')');
      trav.set(M.phaseFromAngle(theta));
    }

    function setTrail(net) {              // net：本圈累计弧度，正 = 顺相位方向（屏幕上逆时针）
      var n = Math.abs(net);
      if (n < 0.01) { trail.removeAttribute('d'); return; }
      var a0 = M.HOME_ANGLE, a1 = a0 - net;
      var x0 = f(cx + ringR * Math.cos(a0)), y0 = f(cy + ringR * Math.sin(a0));
      var x1 = f(cx + ringR * Math.cos(a1)), y1 = f(cy + ringR * Math.sin(a1));
      var sweep = net > 0 ? 0 : 1;
      if (n >= M.TAU - 1e-3) {
        var xm = f(cx + ringR * Math.cos(a0 + Math.PI)), ym = f(cy + ringR * Math.sin(a0 + Math.PI));
        trail.setAttribute('d', 'M ' + x0 + ',' + y0 + ' A ' + ringR + ',' + ringR + ' 0 0 ' + sweep + ' ' + xm + ',' + ym +
                                ' A ' + ringR + ',' + ringR + ' 0 0 ' + sweep + ' ' + x0 + ',' + y0);
        return;
      }
      trail.setAttribute('d', 'M ' + x0 + ',' + y0 + ' A ' + ringR + ',' + ringR + ' 0 ' + (n > Math.PI ? 1 : 0) + ' ' + sweep + ' ' + x1 + ',' + y1);
    }

    function pulseMarker(i) {
      var g = markerInners[i];
      if (!g) return;
      g.classList.remove('pulse');
      void g.getBoundingClientRect();
      g.classList.add('pulse');
    }

    function setStarsLit(lit, animate) {
      if (!animate) svg.classList.add('no-anim');
      starOrder.forEach(function (s, i) { s.style.transitionDelay = animate ? (i * P.stars.staggerMs) + 'ms' : '0ms'; });
      sparkles.forEach(function (s, j) { s.style.transitionDelay = animate ? (starOrder.length * P.stars.staggerMs + j * 160) + 'ms' : '0ms'; });
      svg.classList.toggle('sky-lit', !!lit);
      if (!animate) {
        void svg.getBoundingClientRect();
        requestAnimationFrame(function () { svg.classList.remove('no-anim'); });
      }
    }

    function twinkleStars() {             // 已经亮着的星空：逐颗轻轻闪一下
      starOrder.forEach(function (s, i) {
        s.style.setProperty('--delay', (i * P.stars.staggerMs) + 'ms');
        s.classList.remove('twinkle');
        void s.getBoundingClientRect();
        s.classList.add('twinkle');
      });
    }

    function fullFrame() { return { x: 0, y: 0, w: VW, h: VH }; }
    function kidFrame() {                 // 小人视角：他在画面下方，头顶是一片天
      var w = VW * P.camera.kidFrameRatio, h = w / aspect;
      var x = px - w / 2, y = Math.min(pb - h * 0.72, VH - h + 20);
      return { x: x, y: y, w: w, h: h };
    }
    function setFrame(fr) {
      svg.setAttribute('viewBox', f(fr.x) + ' ' + f(fr.y) + ' ' + f(fr.w) + ' ' + f(fr.h));
    }
    function toSvgPoint(clientX, clientY) {
      var ctm = svg.getScreenCTM();
      if (!ctm) return null;
      var pt = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
      return { x: pt.x, y: pt.y };
    }

    setPhase(0);
    setTraveler(M.HOME_ANGLE);

    return {
      svg: svg, VW: VW, VH: VH, aspect: aspect,
      moon: { cx: cx, cy: cy, r: moonR },
      ring: { cx: cx, cy: cy, r: ringR },
      kid: { x: px, baseY: pb },
      starCount: stars.length,
      setPhase: setPhase, setTraveler: setTraveler, setTrail: setTrail, pulseMarker: pulseMarker,
      setStarsLit: setStarsLit, twinkleStars: twinkleStars, setKidLook: setKidLook,
      fullFrame: fullFrame, kidFrame: kidFrame, setFrame: setFrame, toSvgPoint: toSvgPoint
    };
  }

  return { create: create };
})();
