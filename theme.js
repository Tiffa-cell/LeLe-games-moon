/* theme.js — 月相 · 全部颜色的唯一来源
 *
 * SPEC 技术铁律 3：程序任何地方不许写死颜色，一律从这里取。
 * 三套夜色提取自 M0 三张概念稿（assets/m0/generate_concept.py 里的 VARIANTS）：
 *   indigo 黛蓝 ← moon-cycle-a-indigo   （M0 定稿，默认）
 *   violet 暗紫 ← moon-cycle-b-lavender
 *   ink    墨青 ← moon-cycle-c-teal
 *
 * 每个颜色键会写成一个 CSS 变量：skyTop → --c-sky-top，moonDark → --c-moon-dark …
 * css/style.css 与所有 SVG 元素都只引用这些变量，所以切换夜色不需要重绘。
 *
 * 用法：
 *   THEME.apply('violet')   切换夜色（写入 CSS 变量并记住选择）
 *   THEME.current           当前夜色名
 *   THEME.get('moon')       取当前夜色里的某个颜色
 *   THEME.PRESETS           三套预设
 */
(function (global) {
  'use strict';

  var PRESETS = {
    indigo: {                 // 黛蓝：经典深蓝夜空，最接近纪念碑谷夜章（M0 定稿）
      label: '黛蓝',
      skyTop: '#141b33',      // 天空上端色
      skyBottom: '#35406b',   // 天空下端色
      moon: '#f4ecd8',        // 月亮色（亮面）
      moonCrater: '#e3d7bd',  // 月面浅坑
      moonDark: '#2b3459',    // 月亮暗面
      glow: '#f4ecd8',        // 月晕色
      star: '#cdd6ec',        // 星星
      starPeak: '#f4f7ff',    // 星星闪烁波的峰值色（走满一圈时，配合放大与不透明度 1，明显比平时亮）
      ring: '#8d98c4',        // 相位环虚线色
      hillFar: '#2a335c',     // 远山
      hillMid: '#222a4e',     // 中山
      hillNear: '#1a2140',    // 近山
      silhouette: '#12172e',  // 剪影色（小屋、树、小人）
      window: '#ffc978',      // 暖窗色
      text: '#dfe4f2'         // 文字色（图标、辅助文字）
    },
    violet: {                 // 暗紫：柔和梦幻，偏睡前故事氛围
      label: '暗紫',
      skyTop: '#241f3f',
      skyBottom: '#4d3f6b',
      moon: '#f6e8cf',
      moonCrater: '#e6d3b2',
      moonDark: '#3a3260',
      glow: '#f6e8cf',
      star: '#e0d7ee',
      starPeak: '#fbf4ff',
      ring: '#a294c6',
      hillFar: '#3c3161',
      hillMid: '#322852',
      hillNear: '#271e42',
      silhouette: '#1a1430',
      window: '#ffcf8a',
      text: '#ebe3f4'
    },
    ink: {                    // 墨青：冷静的蓝绿，自然博物馆气质
      label: '墨青',
      skyTop: '#0f2228',
      skyBottom: '#2c4a50',
      moon: '#f0eeda',
      moonCrater: '#dcd6b8',
      moonDark: '#24404a',
      glow: '#f0eeda',
      star: '#cfe0dd',
      starPeak: '#effffa',
      ring: '#7fa1a3',
      hillFar: '#23424a',
      hillMid: '#1b353d',
      hillNear: '#142a31',
      silhouette: '#0c1e24',
      window: '#ffc36e',
      text: '#dbe8e5'
    }
  };

  var ORDER = ['ink', 'indigo', 'violet'];
  var DEFAULT = 'indigo';
  var STORAGE_KEY = 'moon.theme';

  function cssVar(key) {          // skyTop → --c-sky-top
    return '--c-' + key.replace(/[A-Z]/g, function (m) { return '-' + m.toLowerCase(); });
  }

  function apply(name) {
    if (!PRESETS[name]) name = DEFAULT;
    var preset = PRESETS[name];
    var root = document.documentElement;
    for (var key in preset) {
      if (key !== 'label') root.style.setProperty(cssVar(key), preset[key]);
    }
    root.setAttribute('data-theme', name);
    THEME.current = name;

    // Safari 状态栏 / 浏览器外框跟随天空色
    var meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.setAttribute('name', 'theme-color');
      document.head.appendChild(meta);
    }
    meta.setAttribute('content', preset.skyTop);

    try { localStorage.setItem(STORAGE_KEY, name); } catch (e) { /* 无痕模式等，忽略 */ }
    document.dispatchEvent(new CustomEvent('themechange', { detail: { name: name, preset: preset } }));
    return preset;
  }

  function saved() {
    try { return localStorage.getItem(STORAGE_KEY); } catch (e) { return null; }
  }

  var THEME = {
    PRESETS: PRESETS,
    ORDER: ORDER,
    DEFAULT: DEFAULT,
    current: null,
    apply: apply,
    cssVar: cssVar,
    get: function (key) { return PRESETS[THEME.current || DEFAULT][key]; }
  };
  global.THEME = THEME;

  // 在 <head> 里同步执行：首帧之前颜色就已就位，不会闪白
  apply(saved() || DEFAULT);
})(window);
