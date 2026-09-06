/* app.js — 启动：建场景、挂章节、夜色切换、尺寸变化重建 */
(function () {
  'use strict';
  var svg = document.getElementById('stage');
  var chapter = window.Chapter1;

  function build(first) {
    var box = svg.getBoundingClientRect();     // SVG 元素的 clientWidth 在 Safari / Firefox 里可能是 0
    var w = box.width || window.innerWidth;
    var h = box.height || window.innerHeight;
    var scene = window.Scene.create(svg, w, h);
    chapter.attach(scene, first);
    window.__scene = scene;             // 调试用
  }

  // 夜色切换：右上角三个小圆点，颜色取自 theme.js 的预设
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
    timer = setTimeout(function () { build(false); }, 200);
  }
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', onResize);

  // iOS Safari：禁止捏合缩放接管画面
  document.addEventListener('gesturestart', function (e) { e.preventDefault(); });
  document.addEventListener('dblclick', function (e) { e.preventDefault(); });
})();
