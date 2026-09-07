/* scene.js — 分层绘制（SVG）
 *   第1章：天空 → 星 → 月晕 → 相位环 → 主月亮 → 地面剪影（小屋、树、小人）
 *   第2章：天空 → 星 → 月晕 → 轨道后半段 + 后方的太阳 → 主月亮 → 细弧线 → 轨道前半段 + 前方的太阳
 *
 * 坐标系沿用 M0 概念稿（参考画布 1668 × 2388），按实际屏幕比例扩展画布：
 *   比参考更窄长（iPad 竖屏、iPhone）：宽固定 1668，高按比例加长；
 *   比参考更宽（iPad 横屏）：高固定 2388，宽按比例加宽，两侧补山丘。
 * 主月亮按比例居上，地面锚定在画布底部，所以任何屏幕都不裁切构图。
 *
 * 两章共用天空、星、月晕、主月亮；区别：
 *   第1章：相位环（八枚小月亮 + 可拖动的那颗），主月亮亮面按相位剪裁（clipPath）；有地面和小人，有镜头往返。
 *   第2章：玩家自己的眼睛——没有地面、房子、小人，镜头不动。带俯角的椭圆轨道，太阳沿椭圆拖动：
 *          在上半段（月亮后方）变小、被月亮挡住；在下半段（月亮前方）变大、盖在月亮前面。
 *          主月亮亮面用 <mask> 实时算出、亮面永远朝太阳。月亮外围一圈细弧线用来显示「停住 1 秒」的进度。
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

  // opts.chapter：1（默认）相位环 + 地面；2 椭圆轨道上的太阳（玩家自己的眼睛）
  function create(svg, viewW, viewH, opts) {
    var P = window.PARAMS;
    var chapter = (opts && opts.chapter) || 1;
    var ref = P.ref;
    var refAspect = ref.width / ref.height;
    var aspect = (viewW > 0 && viewH > 0) ? viewW / viewH : refAspect;
    var VW, VH;
    if (aspect <= refAspect) { VW = ref.width; VH = Math.round(VW / aspect); }
    else { VH = ref.height; VW = Math.round(VH * aspect); }

    // ---- 布局（画布单位）
    var cx = VW / 2;
    var moonR = P.moon.radius;
    var orbitR = P.ring.radius;                     // 第1章：相位环半径
    var orbitOuter = orbitR + P.ring.travelerRadius + P.ring.haloExtra;
    var groundTop = VH - 408;                       // 远山最高点（M0：2388 - 1980）
    var cy = clamp(VH * P.moon.yRatio, orbitOuter + 40, groundTop - orbitOuter - 40);
    var ORX = P.orbit.rx, ORY = P.orbit.ry;         // 第2章：椭圆轨道
    if (chapter === 2) {
      var sunOuter = (P.sun.radius + P.sun.glowExtra) * P.sun.frontScale;
      cy = clamp(VH * P.orbit.moonYRatio, ORY + sunOuter + 120, VH - ORY - sunOuter - 520);
    }
    var by = VH - 336;                              // 小屋地基
    var pb = VH - 294;                              // 小人脚下
    var hx = cx - 334, tx = hx - 128, px = cx + 416;

    // 非颜色参数 → CSS 变量
    var rs = document.documentElement.style;
    rs.setProperty('--star-dim', P.stars.dim);
    rs.setProperty('--star-lit-boost', P.stars.litBoost);
    rs.setProperty('--star-lit-scale', P.stars.litScale);
    rs.setProperty('--star-light-ms', P.stars.lightMs + 'ms');
    rs.setProperty('--star-reset-ms', P.stars.resetMs + 'ms');
    rs.setProperty('--ignite-ms', (P.stars.lightMs + P.stars.igniteSettleMs) + 'ms');
    rs.setProperty('--ignite-scale', P.stars.igniteScale);
    rs.setProperty('--star-peak-scale', P.stars.peakScale);
    rs.setProperty('--wave-flash-ms', P.stars.waveFlashMs + 'ms');
    rs.setProperty('--glow-min', P.moon.glowMinRatio);
    rs.setProperty('--crater-alpha', P.moon.craterAlpha);
    rs.setProperty('--ring-alpha', P.ring.alpha);
    rs.setProperty('--trail-alpha', P.ring.trailAlpha);
    rs.setProperty('--orbit-alpha', P.orbit.alpha);
    rs.setProperty('--orbit-back-alpha', P.orbit.backAlpha);
    rs.setProperty('--prompt-fade-ms', P.guide.promptFadeMs + 'ms');

    while (svg.firstChild) svg.removeChild(svg.firstChild);
    svg.setAttribute('viewBox', '0 0 ' + VW + ' ' + VH);
    svg.setAttribute('data-chapter', chapter);

    // ---- defs：渐变与剪裁 / 遮罩
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
    var gSunGlow = el('radialGradient', { id: 'g-sun-glow' }, defs);
    el('stop', { offset: 0.3, 'class': 'sun-stop', 'stop-opacity': P.sun.glowAlpha }, gSunGlow);
    el('stop', { offset: 1, 'class': 'sun-stop', 'stop-opacity': 0 }, gSunGlow);
    // 第2章主月亮的球体感：亮面渐变的中心朝太阳偏移（setSun 里实时更新），朝太阳一侧最亮
    var gSphere = el('radialGradient', { id: 'g-sphere', gradientUnits: 'userSpaceOnUse', cx: cx, cy: cy, r: f(moonR * P.sun.shadeRadius) }, defs);
    el('stop', { offset: 0, 'class': 'moon-lit-stop' }, gSphere);
    el('stop', { offset: 1, 'class': 'moon-shade-stop' }, gSphere);

    // ---- 1 天空（向四周多画一些，镜头移动时不露底）
    var lSky = el('g', { 'class': 'layer layer-sky' }, svg);
    el('rect', { x: -VW, y: -VH, width: VW * 3, height: VH * 3, fill: 'url(#g-sky)' }, lSky);

    // ---- 2 星：稀疏星点 + 少量四角星，避开相位环 / 太阳轨道与地面
    var lStars = el('g', { 'class': 'layer layer-stars' }, svg);
    var R = rng(P.stars.seed);
    var area = (VW * VH) / (ref.width * ref.height);
    var stars = [], sparkles = [], guard = 0, x, y, op;
    var nStars = clamp(Math.round(P.stars.count * area), 24, 160);
    function nearOrbit(x, y, margin) {             // 星星避开相位环（第1章）/ 椭圆轨道与太阳（第2章）
      if (chapter === 1) return Math.hypot(x - cx, y - cy) < orbitR + margin;
      return Math.hypot((x - cx) / (ORX + margin), (y - cy) / (ORY + margin)) < 1;
    }
    while (stars.length < nStars && guard++ < 8000) {
      x = 40 + R() * (VW - 80); y = 50 + R() * (VH - 540);
      if (nearOrbit(x, y, 120)) continue;
      var r = 2.2 + R() * 2.4; op = 0.28 + R() * 0.57;
      var s = el('circle', { cx: f(x), cy: f(y), r: f(r), 'class': 'star' }, lStars);
      s.style.setProperty('--op', op.toFixed(2));
      stars.push({ el: s, x: x, y: y });
    }
    var nSpark = clamp(Math.round(P.stars.sparkles * area), 3, 20); guard = 0;
    while (sparkles.length < nSpark && guard++ < 8000) {
      x = 80 + R() * (VW - 160); y = 80 + R() * (VH - 670);
      if (nearOrbit(x, y, 160)) continue;
      var sz = 9 + R() * 6; op = 0.5 + R() * 0.4;
      var sp = el('path', { d: sparklePath(x, y, sz), 'class': 'sparkle' }, lStars);
      sp.style.setProperty('--op', op.toFixed(2));
      sparkles.push({ el: sp, x: x, y: y });
    }
    var allStars = stars.concat(sparkles);
    // 闪烁波：离月亮越远的星越晚闪，于是看起来由月亮向外扩散（最近的那颗立刻闪，最远的在 waveSpreadMs 后）
    var minD = Infinity, maxD = 0;
    allStars.forEach(function (s) { s.d = Math.hypot(s.x - cx, s.y - cy); minD = Math.min(minD, s.d); maxD = Math.max(maxD, s.d); });
    allStars.forEach(function (s) {
      var t = maxD > minD ? (s.d - minD) / (maxD - minD) : 0;
      s.el.style.setProperty('--wave-delay', Math.round(t * P.stars.waveSpreadMs) + 'ms');
    });
    // 八批星星：按绕月亮的方位角平分成 8 份，第 i 批大致在第 i 个相位节点那一侧。
    // 第1章：小月亮经过节点 i 就点亮第 i 批 —— 星空跟着手指绕一圈亮起来，走满一圈正好全亮；
    // 第2章：每答对一次，点亮太阳那一侧的几批。
    function angleKey(s) { return (M.phaseFromAngle(Math.atan2(s.y - cy, s.x - cx)) + 1 / 16) % 1; }
    var byAngle = stars.slice().sort(function (a, b) { return angleKey(a) - angleKey(b); });
    var batches = [];
    for (var b = 0; b < 8; b++) {
      batches.push(byAngle.slice(Math.floor(b * byAngle.length / 8), Math.floor((b + 1) * byAngle.length / 8))
                          .map(function (s) { return s.el; }));
    }

    // ---- 3 月晕
    var lGlow = el('g', { 'class': 'layer layer-glow' }, svg);
    var glow = el('circle', { cx: cx, cy: cy, r: moonR + P.moon.glowExtra, fill: 'url(#g-glow)', 'class': 'moon-glow' }, lGlow);

    // 小月亮（环上的八枚、可拖动的那颗、第2章的目标）：暗盘 + 亮面 + 新月细亮边
    function smallMoon(parent, r) {
      el('circle', { r: r, 'class': 'm-dark' }, parent);
      var lit = el('path', { 'class': 'm-lit' }, parent);
      var rim = el('circle', { r: r - 1.5, 'class': 'm-rim' }, parent);
      function show(d, rotateDeg, fraction) {
        if (d) {
          lit.setAttribute('d', d);
          lit.setAttribute('transform', 'rotate(' + f(rotateDeg) + ')');
          lit.style.visibility = '';
        } else lit.style.visibility = 'hidden';
        rim.style.opacity = P.moon.rimAlpha * clamp(1 - fraction / 0.12, 0, 1);
      }
      return {
        set: function (p) { show(M.litPath(0, 0, r, p), 0, M.litFraction(p)); },                 // 按相位（第1章）
        setSun: function (theta) {                                                                // 亮面朝太阳（第2章）
          var L = M.litFromSun(theta);
          show(M.litPath(0, 0, r, L.phase), L.rotateDeg, L.fraction);
        }
      };
    }

    // ---- 4 第1章：相位环——虚线轨道、已走过的弧、八枚小月亮、可拖动的那颗
    var trail, markerInners = [], gTrav, trav;
    if (chapter === 1) {
      var lRing = el('g', { 'class': 'layer layer-ring' }, svg);
      el('circle', { cx: cx, cy: cy, r: orbitR, 'class': 'ring-guide', 'stroke-width': P.ring.width, 'stroke-dasharray': P.ring.dash }, lRing);
      trail = el('path', { 'class': 'ring-trail', 'stroke-width': P.ring.width + 1 }, lRing);
      for (var i = 0; i < 8; i++) {
        var th = M.angleFromPhase(i / 8);
        var g = el('g', { 'class': 'marker', transform: 'translate(' + f(cx + orbitR * Math.cos(th)) + ' ' + f(cy + orbitR * Math.sin(th)) + ')' }, lRing);
        var inner = el('g', { 'class': 'marker-inner' }, g);
        smallMoon(inner, P.ring.markerRadius).set(i / 8);
        markerInners.push(inner);
      }
      gTrav = el('g', { 'class': 'traveler' }, lRing);
      el('circle', { r: P.ring.travelerRadius + P.ring.haloExtra, fill: 'url(#g-halo)', 'class': 'traveler-halo' }, gTrav);
      trav = smallMoon(gTrav, P.ring.travelerRadius);
      trav.set(0);
    }

    // ---- 4 第2章：椭圆轨道的后半段（月亮后面）与太阳。太阳在后方时挂在这一层，被主月亮挡住；
    //      到前方时挪到第 5b 层（主月亮之上）。轨道线本身不穿过月亮（ry > 月亮半径），只有太阳会前后穿越。
    var gSun, lSunBack, lSunFront, dwellArc, arcLen = 0;
    function orbitHalf(upper) {                      // 椭圆的上半段（后）/ 下半段（前），从左端到右端
      var L = f(cx - ORX) + ',' + f(cy), Rt = f(cx + ORX) + ',' + f(cy);
      return 'M ' + L + ' A ' + ORX + ',' + ORY + ' 0 0 ' + (upper ? 1 : 0) + ' ' + Rt;
    }
    if (chapter === 2) {
      lSunBack = el('g', { 'class': 'layer layer-sun-back' }, svg);
      el('path', { d: orbitHalf(true), 'class': 'orbit-guide orbit-back', 'stroke-width': P.orbit.width, 'stroke-dasharray': P.orbit.dash }, lSunBack);
      gSun = el('g', { 'class': 'sun' }, lSunBack);
      el('circle', { r: P.sun.radius + P.sun.glowExtra, fill: 'url(#g-sun-glow)', 'class': 'sun-glow' }, gSun);
      el('circle', { r: P.sun.radius, 'class': 'sun-disc' }, gSun);
    }

    // ---- 5 主月亮：暗盘 + 新月细亮边 + 亮盘与浅坑
    //   第1章：亮盘按相位剪裁（clipPath，明暗界线竖直）
    //   第2章：亮盘用 <mask> 取形——形状是「亮面在右」的相位形，再绕月心转到太阳方向；不用任何预制相位图
    var lMoon = el('g', { 'class': 'layer layer-moon' }, svg);
    el('circle', { cx: cx, cy: cy, r: moonR, 'class': 'moon-dark' }, lMoon);
    var rim = el('circle', { cx: cx, cy: cy, r: moonR - 1.5, 'class': 'moon-rim' }, lMoon);
    var gLit, litShape;
    if (chapter === 1) {
      var clip = el('clipPath', { id: 'clip-moon-lit' }, defs);
      litShape = el('path', { d: 'M 0 0' }, clip);
      gLit = el('g', { 'clip-path': 'url(#clip-moon-lit)' }, lMoon);
      el('circle', { cx: cx, cy: cy, r: moonR, 'class': 'moon-lit' }, gLit);
    } else {
      var mask = el('mask', { id: 'mask-moon-lit', maskUnits: 'userSpaceOnUse', 'mask-type': 'alpha',
                              x: cx - moonR * 2, y: cy - moonR * 2, width: moonR * 4, height: moonR * 4 }, defs);
      mask.style.maskType = 'alpha';
      litShape = el('path', { d: 'M 0 0', 'class': 'mask-shape' }, mask);
      gLit = el('g', { mask: 'url(#mask-moon-lit)' }, lMoon);
      el('circle', { cx: cx, cy: cy, r: moonR, 'class': 'moon-sphere' }, gLit);
    }
    P.moon.craters.forEach(function (c) {
      el('circle', { cx: cx + c[0], cy: cy + c[1], r: c[2], 'class': 'moon-crater' }, gLit);
    });

    // ---- 5a 第2章：月亮外围的细弧线——太阳停在目标区域时，1 秒里从顶端顺时针填满
    if (chapter === 2) {
      var lArc = el('g', { 'class': 'layer layer-arc' }, svg);
      var arcR = moonR + P.guide.arcGap;
      arcLen = M.TAU * arcR;
      dwellArc = el('circle', { cx: cx, cy: cy, r: arcR, 'class': 'dwell-arc', 'stroke-width': P.guide.arcWidth,
                                'stroke-dasharray': f(arcLen), 'stroke-dashoffset': f(arcLen),
                                transform: 'rotate(-90 ' + f(cx) + ' ' + f(cy) + ')' }, lArc);
    }

    // ---- 5b 第2章：椭圆轨道的前半段（月亮前面）；太阳在前方时挂在这里，盖在月亮前面
    if (chapter === 2) {
      lSunFront = el('g', { 'class': 'layer layer-sun-front' }, svg);
      el('path', { d: orbitHalf(false), 'class': 'orbit-guide orbit-front', 'stroke-width': P.orbit.width, 'stroke-dasharray': P.orbit.dash }, lSunFront);
    }

    // ---- 6 第1章：地面——圆弧山丘、小屋（暖窗）、小树、仰望的小人（第2章是玩家自己的眼睛，没有地面）
    var lGround = null, gKid = null, kidBody = null, kidHead = null;
    if (chapter === 1) {
    lGround = el('g', { 'class': 'layer layer-ground' }, svg);
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
    gKid = el('g', { 'class': 'kid' }, lGround);
    kidBody = el('path', { 'class': 'sil' }, gKid);
    kidHead = el('circle', { r: 13, 'class': 'sil' }, gKid);
    }

    // 动画结束后清掉一次性 class（只绑一次）
    if (!svg.__sceneBound) {
      svg.__sceneBound = true;
      svg.addEventListener('animationend', function (e) {
        var t = e.target;
        if (t && t.classList) { t.classList.remove('pulse'); t.classList.remove('ignite'); t.classList.remove('wave'); t.classList.remove('surge'); }
      });
    }

    // ---- API
    function setKidLook(u) {              // u: 0 平视 → 1 抬头望月（头往月亮那边抬，整个人微微后仰）
      if (!gKid) return;
      var top = 50 + 4 * u;
      kidBody.setAttribute('d', 'M ' + (px - 15) + ',' + pb + ' Q ' + (px - 15) + ',' + f(pb - 46 - 3 * u) + ' ' + px + ',' + f(pb - top) +
                                ' Q ' + (px + 15) + ',' + f(pb - 46 - 3 * u) + ' ' + (px + 15) + ',' + pb + ' Z');
      kidHead.setAttribute('cx', f(px + 4 - 9 * u));
      kidHead.setAttribute('cy', f(pb - 61 - 10 * u));
      gKid.setAttribute('transform', 'rotate(' + f(-7 * u) + ' ' + px + ' ' + pb + ')');
    }
    setKidLook(0);

    function setLitShape(d, rotateDeg, fraction) {   // 主月亮亮面：形状 + 旋转；细亮边与月晕跟着亮面占比走
      if (d) {
        litShape.setAttribute('d', d);
        if (rotateDeg) litShape.setAttribute('transform', 'rotate(' + f(rotateDeg) + ' ' + f(cx) + ' ' + f(cy) + ')');
        else litShape.removeAttribute('transform');
        gLit.style.visibility = '';
      } else gLit.style.visibility = 'hidden';
      rim.style.opacity = P.moon.rimAlpha * clamp(1 - fraction / 0.12, 0, 1);
      glow.style.opacity = P.moon.glowMinRatio + (1 - P.moon.glowMinRatio) * fraction;
    }
    function setPhase(p) {                // 第1章：按相位
      setLitShape(M.litPath(cx, cy, moonR, p), 0, M.litFraction(p));
    }

    // 第1章
    function setTraveler(theta) {
      gTrav.setAttribute('transform', 'translate(' + f(cx + orbitR * Math.cos(theta)) + ' ' + f(cy + orbitR * Math.sin(theta)) + ')');
      trav.set(M.phaseFromAngle(theta));
    }
    function setTrail(net) {              // net：本圈累计弧度，正 = 顺相位方向（屏幕上逆时针）
      var n = Math.abs(net);
      if (n < 0.01) { trail.removeAttribute('d'); return; }
      var a0 = M.HOME_ANGLE, a1 = a0 - net;
      var x0 = f(cx + orbitR * Math.cos(a0)), y0 = f(cy + orbitR * Math.sin(a0));
      var x1 = f(cx + orbitR * Math.cos(a1)), y1 = f(cy + orbitR * Math.sin(a1));
      var sweep = net > 0 ? 0 : 1;
      if (n >= M.TAU - 1e-3) {
        var xm = f(cx + orbitR * Math.cos(a0 + Math.PI)), ym = f(cy + orbitR * Math.sin(a0 + Math.PI));
        trail.setAttribute('d', 'M ' + x0 + ',' + y0 + ' A ' + orbitR + ',' + orbitR + ' 0 0 ' + sweep + ' ' + xm + ',' + ym +
                                ' A ' + orbitR + ',' + orbitR + ' 0 0 ' + sweep + ' ' + x0 + ',' + y0);
        return;
      }
      trail.setAttribute('d', 'M ' + x0 + ',' + y0 + ' A ' + orbitR + ',' + orbitR + ' 0 ' + (n > Math.PI ? 1 : 0) + ' ' + sweep + ' ' + x1 + ',' + y1);
    }
    function pulseMarker(i) { pop(markerInners[i]); }

    // 第2章
    function orbitPoint(phi) {            // 轨道角 phi → 椭圆上的画布坐标
      return { x: cx + ORX * Math.cos(phi), y: cy + ORY * Math.sin(phi) };
    }
    function sunScale(depth) {            // 前后深度 → 太阳缩放：正后方 backScale，正前方 frontScale，中间连续
      return P.sun.backScale + (P.sun.frontScale - P.sun.backScale) * (depth + 1) / 2;
    }
    var sunInFront = null;
    function setSun(phi) {                // 太阳到轨道角 phi：移位 + 按深度缩放 + 前后换层；主月亮亮面朝太阳，球体渐变的中心也朝太阳偏
      var L = M.litFromOrbit(phi, ORX, ORY);
      var pt = orbitPoint(phi), sc = sunScale(L.depth);
      setLitShape(M.litPath(cx, cy, moonR, L.phase), L.rotateDeg, L.fraction);
      gSphere.setAttribute('cx', f(cx + moonR * P.sun.shadeOffset * Math.cos(L.screenAngle)));
      gSphere.setAttribute('cy', f(cy + moonR * P.sun.shadeOffset * Math.sin(L.screenAngle)));
      gSun.setAttribute('transform', 'translate(' + f(pt.x) + ' ' + f(pt.y) + ') scale(' + sc.toFixed(3) + ')');
      var front = L.depth >= 0;
      if (front !== sunInFront) {         // 穿过左右两端：前 ↔ 后换层（后方被月亮挡住，前方盖在月亮前面）
        sunInFront = front;
        (front ? lSunFront : lSunBack).appendChild(gSun);
        gSun.setAttribute('data-depth', front ? 'front' : 'back');
      }
      return { x: pt.x, y: pt.y, scale: sc, lit: L };
    }
    function setArc(t) {                  // 细弧线填满的比例 0 → 1（0 时隐藏）
      t = clamp(t, 0, 1);
      dwellArc.setAttribute('stroke-dashoffset', f(arcLen * (1 - t)));
      dwellArc.style.opacity = t > 0 ? 1 : 0;
    }

    function pop(g) {                     // 轻轻一跳
      if (!g) return;
      g.classList.remove('pulse');
      void g.getBoundingClientRect();
      g.classList.add('pulse');
    }
    function instantly(fn) {              // 不带过渡地改状态（重建场景时恢复）
      svg.classList.add('no-anim');
      fn();
      void svg.getBoundingClientRect();
      requestAnimationFrame(function () { svg.classList.remove('no-anim'); });
    }
    function lightBatch(i, animate) {     // 点亮第 i 批星星（animate：逐颗带闪一下的点亮动画）
      (batches[((i % 8) + 8) % 8] || []).forEach(function (s, k) {
        s.style.transitionDelay = '0ms';
        if (animate) {
          s.style.setProperty('--ignite-delay', (k * P.stars.batchStaggerMs) + 'ms');
          s.classList.remove('ignite');
          void s.getBoundingClientRect();
          s.classList.add('ignite');
        }
        s.classList.add('lit');
      });
    }
    function setLitBatches(map, animate) {
      var apply = function () { for (var i = 0; i < 8; i++) if (map[i]) lightBatch(i, animate); };
      if (animate) apply(); else instantly(apply);
    }
    function dimStars() {                 // 新的一轮从暗夜开始：星空慢慢暗下来
      svg.classList.add('sky-reset');
      stars.forEach(function (s, k) { s.el.style.transitionDelay = ((k % 12) * 40) + 'ms'; s.el.classList.remove('lit'); s.el.classList.remove('ignite'); });
      setTimeout(function () { svg.classList.remove('sky-reset'); }, P.stars.resetMs + 600);
    }
    function setSparklesLit(lit, animate) {
      var apply = function () { sparkles.forEach(function (s) { s.el.classList.toggle('lit', !!lit); }); };
      if (animate) apply(); else instantly(apply);
    }
    function surge() {                    // 月晕亮一下
      glow.classList.remove('surge');
      void glow.getBoundingClientRect();
      glow.classList.add('surge');
    }
    function wave() {                     // 过关：由月亮向外扩散的闪烁波，月晕也跟着亮一下
      allStars.forEach(function (s) {
        s.el.classList.remove('wave');
        void s.el.getBoundingClientRect();
        s.el.classList.add('wave');
      });
      surge();
    }

    function fullFrame() { return { x: 0, y: 0, w: VW, h: VH }; }
    function kidFrame() {                 // 小人视角：他在画面下方，头顶是一片天（第2章没有小人：退回整幅画面）
      if (!gKid) return fullFrame();
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

    if (chapter === 1) { setPhase(0); setTraveler(M.HOME_ANGLE); }
    else { setSun(P.sun.startAngle); setArc(0); }

    var api = {
      svg: svg, VW: VW, VH: VH, aspect: aspect, chapter: chapter,
      moon: { cx: cx, cy: cy, r: moonR },
      kid: chapter === 1 ? { x: px, baseY: pb } : null,
      starCount: stars.length,
      batchSizes: batches.map(function (b) { return b.length; }),
      lightBatch: lightBatch, setLitBatches: setLitBatches, dimStars: dimStars,
      setSparklesLit: setSparklesLit, wave: wave, surge: surge, setKidLook: setKidLook,
      fullFrame: fullFrame, kidFrame: kidFrame, setFrame: setFrame, toSvgPoint: toSvgPoint
    };
    if (chapter === 1) {
      api.ring = { cx: cx, cy: cy, r: orbitR };
      api.setPhase = setPhase; api.setTraveler = setTraveler; api.setTrail = setTrail; api.pulseMarker = pulseMarker;
    } else {
      api.orbit = { cx: cx, cy: cy, rx: ORX, ry: ORY };
      api.orbitPoint = orbitPoint; api.sunScale = sunScale;
      api.setSun = setSun; api.setArc = setArc;
    }
    return api;
  }

  return { create: create };
})();
