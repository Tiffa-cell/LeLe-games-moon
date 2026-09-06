/* util.js — 小工具：补间动画、延时、localStorage 读写 */
window.Anim = (function () {
  'use strict';
  var ease = {
    linear: function (t) { return t; },
    inOut: function (t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; },
    out: function (t) { return 1 - Math.pow(1 - t, 3); }
  };

  // tween({ ms, ease, onUpdate(t), onDone }) → { cancel() }
  function tween(o) {
    var start = null, cancelled = false, raf = 0;
    var fn = o.ease || ease.linear;
    function frame(now) {
      if (cancelled) return;
      if (start === null) start = now;
      var t = o.ms > 0 ? Math.min(1, (now - start) / o.ms) : 1;
      o.onUpdate(fn(t));
      if (t < 1) raf = requestAnimationFrame(frame);
      else if (o.onDone) o.onDone();
    }
    raf = requestAnimationFrame(frame);
    return { cancel: function () { cancelled = true; cancelAnimationFrame(raf); } };
  }

  function delay(ms, fn) {
    var id = setTimeout(fn, ms);
    return { cancel: function () { clearTimeout(id); } };
  }

  return { ease: ease, tween: tween, delay: delay };
})();

window.Store = {
  get: function (key, fallback) {
    try {
      var v = localStorage.getItem(key);
      return v ? JSON.parse(v) : fallback;
    } catch (e) { return fallback; }
  },
  set: function (key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* 忽略 */ }
  }
};

// 章节进度（localStorage 里的 moon.progress）：各章各占一个键（chapter1 / chapter2 …），current = 当前所在章节
window.Progress = (function () {
  'use strict';
  var KEY = 'moon.progress';
  var data = window.Store.get(KEY, {}) || {};
  return {
    data: data,
    save: function () { window.Store.set(KEY, data); }
  };
})();
