/* app.js — 启动：建场景、挂章节、章节入口、夜色切换、尺寸变化重建
 *
 * 章节入口（不做菜单、不做文字）：
 *   第1章过关后、镜头拉回时，画面下方出现一个太阳图标 + 右侧一个「→」（呼吸缩放），点它进第2章；
 *   第2章过关后，左上角出现一个「←」（呼吸缩放）+ 小月亮，点它回第1章。
 * 换章节：第1章有小人，离开时镜头先落到他身上；第2章是玩家自己的眼睛，没有镜头动作。
 *   两章之间用整幅画面的淡出 / 淡入衔接。
 */
(function () {
  'use strict';
  var svg = document.getElementById('stage');
  var nav = document.getElementById('chapter-nav');
  var Progress = window.Progress;
  var NS = 'http://www.w3.org/2000/svg';
  var chapters = { 1: window.Chapter1, 2: window.Chapter2 };
  var LABELS = {
    1: '月相 · 第1章 圆缺循环：拖着小月亮绕一圈',
    2: '月相 · 第2章 月亮不发光：拖着太阳沿轨道走，月亮亮的那一面永远朝着太阳'
  };
  var NAV_LABELS = { 1: '进入第2章：月亮不发光', 2: '回到第1章：圆缺循环' };
  var FADE_MS = 520;
  var switching = false;

  if (!Progress.data.chapter1) Progress.data.chapter1 = { completed: false, laps: 0 };
  if (!Progress.data.chapter2) Progress.data.chapter2 = { completed: false, rounds: 0 };
  // 上次停在第2章就直接回到第2章（前提是第1章确实过过关）
  var current = (Progress.data.current === 2 && Progress.data.chapter1.completed) ? 2 : 1;

  function chapter() { return chapters[current]; }

  function build(first) {
    var box = svg.getBoundingClientRect();     // SVG 元素的 clientWidth 在 Safari / Firefox 里可能是 0
    var w = box.width || window.innerWidth;
    var h = box.height || window.innerHeight;
    var scene = window.Scene.create(svg, w, h, { chapter: current });
    svg.setAttribute('aria-label', LABELS[current]);
    document.body.setAttribute('data-chapter', current);
    chapter().attach(scene, first);
    window.__scene = scene;             // 调试用
    window.__chapter = chapter();
  }

  // ---- 章节入口图标
  function svgEl(name, attrs, parent) {
    var node = document.createElementNS(NS, name);
    for (var k in attrs) node.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(node);
    return node;
  }
  function navIcon(kind) {
    var s = svgEl('svg', { viewBox: '0 0 40 40', 'aria-hidden': 'true', 'class': 'nav-icon' });
    if (kind === 'sun') {                        // 太阳：圆盘 + 八道短光线
      svgEl('circle', { cx: 20, cy: 20, r: 8, 'class': 'nav-sun' }, s);
      for (var i = 0; i < 8; i++) {
        var a = i * Math.PI / 4, c = Math.cos(a), sn = Math.sin(a);
        svgEl('line', { x1: (20 + 12.5 * c).toFixed(1), y1: (20 + 12.5 * sn).toFixed(1),
                        x2: (20 + 17 * c).toFixed(1), y2: (20 + 17 * sn).toFixed(1), 'class': 'nav-sun-ray' }, s);
      }
    } else {                                     // 小月亮：一弯蛾眉月 + 淡淡的整圆轮廓
      svgEl('circle', { cx: 20, cy: 20, r: 11, 'class': 'nav-moon-outline' }, s);
      svgEl('path', { d: window.MoonMath.litPath(20, 20, 11, 0.2), 'class': 'nav-moon-lit' }, s);
    }
    return s;
  }
  function navArrow(dir) {                       // 「→」/「←」：一横 + 一个箭头，呼吸缩放（CSS）
    var s = svgEl('svg', { viewBox: '0 0 40 40', 'aria-hidden': 'true', 'class': 'nav-arrow', 'data-dir': dir });
    var d = dir === 'right' ? 'M 8,20 H 31 M 22,11 L 31,20 L 22,29' : 'M 32,20 H 9 M 18,11 L 9,20 L 18,29';
    svgEl('path', { d: d, 'class': 'nav-arrow-stroke' }, s);
    return s;
  }
  function setNavIcon() {
    var kind = current === 1 ? 'sun' : 'moon';
    while (nav.firstChild) nav.removeChild(nav.firstChild);
    if (kind === 'sun') { nav.appendChild(navIcon('sun')); nav.appendChild(navArrow('right')); }   // [太阳][→]
    else { nav.appendChild(navArrow('left')); nav.appendChild(navIcon('moon')); }                  // [←][小月亮]
    nav.setAttribute('data-kind', kind);
    nav.setAttribute('aria-label', NAV_LABELS[current]);
  }
  function navReady(mode) {                      // 第1章：过过关、可玩 / 镜头拉回时；第2章：过关后（done）
    if (current === 1) return (mode === 'play' || mode === 'return') && Progress.data.chapter1.completed;
    return mode === 'done' && Progress.data.chapter2.completed;
  }
  function updateNav(mode) {
    nav.classList.toggle('show', !switching && navReady(mode));
  }
  function fadeStage(out, done) {                // 整幅画面（舞台 + 提词等）淡出 / 淡入
    document.body.classList.toggle('fade', out);
    if (done) setTimeout(done, FADE_MS);
  }
  function switchTo(n) {
    if (switching || n === current || !chapters[n]) return;
    switching = true;
    updateNav('leave');
    chapter().leave(function () {
      fadeStage(true, function () {
        chapter().detach();
        current = n;
        Progress.data.current = n;
        Progress.save();
        setNavIcon();
        switching = false;
        build(true);
        fadeStage(false);
      });
    });
  }
  nav.addEventListener('click', function () { switchTo(current === 1 ? 2 : 1); });
  Object.keys(chapters).forEach(function (k) {
    chapters[k].onMode = function (m) { if (chapters[k] === chapter()) updateNav(m); };
  });
  setNavIcon();

  // ---- 夜色切换：右上角三个小圆点，颜色取自 theme.js 的预设
  function buildThemeDots() {
    var nav = document.getElementById('themes');
    var THEME = window.THEME;
    THEME.ORDER.forEach(function (name) {
      var p = THEME.PRESETS[name];
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'theme-dot';
      b.setAttribute('data-theme', name);
      b.setAttribute('aria-label', p.label);
      b.title = p.label;
      b.style.setProperty('--dot', p.skyBottom);
      b.style.setProperty('--dot-ring', p.moon);
      b.addEventListener('click', function () { THEME.apply(name); });
      nav.appendChild(b);
    });
    function sync() {
      var dots = nav.querySelectorAll('.theme-dot');
      for (var i = 0; i < dots.length; i++) {
        dots[i].classList.toggle('active', dots[i].getAttribute('data-theme') === THEME.current);
      }
    }
    document.addEventListener('themechange', sync);
    sync();
  }

  buildThemeDots();
  build(true);

  var timer = null;
  function onResize() {
    clearTimeout(timer);
    timer = setTimeout(function () { if (!switching) build(false); }, 200);
  }
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', onResize);

  // iOS Safari：禁止捏合缩放接管画面
  document.addEventListener('gesturestart', function (e) { e.preventDefault(); });
  document.addEventListener('dblclick', function (e) { e.preventDefault(); });

  window.__switchTo = switchTo;          // 调试用
})();
