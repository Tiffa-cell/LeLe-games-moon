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
 * 除颜色之外，这里还放一组与夜色无关、三套共用的「尺寸 / 样式」参数 STYLE（M2.3 起新增或调整过的尺寸都进这里）：
 * 太阳轨道的大小与虚线、顶部「目标 + 进度点」部件的尺寸、进度点的大小与光晕、导航箭头的线宽与不透明度。
 * 每个键写成 CSS 变量 --s-*（orbitStroke → --s-orbit-stroke），JS 里用 THEME.STYLE 读。
 * 其余与画面节奏 / 交互手感有关的参数仍在 js/params.js。
 *
 * 用法：
 *   THEME.apply('violet')   切换夜色（写入 CSS 变量并记住选择）
 *   THEME.current           当前夜色名
 *   THEME.get('moon')       取当前夜色里的某个颜色
 *   THEME.PRESETS           三套预设
 *   THEME.STYLE             尺寸 / 样式参数
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
      sun: '#f7c74f',         // 太阳色（第2章：可拖动的太阳及其光晕、章节入口的太阳图标）
      orbit: '#b7c2ee',       // 轨道色（第2章：太阳的椭圆轨道；M2.3 提亮，配合更粗的虚线，轨道要明显可见）
      prompt: '#eef1fb',      // 提词字色（第2章：屏幕下方给念的人的一句话）
      progress: '#f7e7b8',    // 进度点色（第2章：顶部部件里点亮的进度点及其光晕、月亮外围的倒计时弧线）
      progressDim: '#4c568a', // 未点亮的进度点（暗色小圆）
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
      sun: '#f9cd66',
      orbit: '#c9bde9',
      prompt: '#f5eefb',
      progress: '#f9e6c2',
      progressDim: '#5b4f88',
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
      sun: '#f2bf4a',
      orbit: '#a9cbca',
      prompt: '#ebf5f2',
      progress: '#f3e3b4',
      progressDim: '#3f6168',
      text: '#dbe8e5'
    }
  };

  // 尺寸 / 样式（与夜色无关，三套共用）。长度单位：轨道用画布单位（参考画布宽 1668），顶部部件与箭头用 CSS px / 视口单位。
  var STYLE = {
    orbitWidthRatio: 0.85,    // 太阳椭圆轨道的宽度 = 屏幕（参考画布）宽度 × 此比例
    orbitAspect: 0.45,        // 椭圆的纵横比 ry / rx
    orbitStroke: 6,           // 轨道虚线的线宽（画布单位；圆头，所以 '1 18' 画出来是一串圆点）
    orbitDash: '1 18',        // 虚线样式（点、间隔）
    orbitAlpha: 0.85,         // 轨道前半段（月亮前面）的不透明度
    orbitBackAlpha: 0.5,      // 后半段（月亮后面）的不透明度：更淡一点，有远近
    goalMoonR: 24,            // 顶部正中「目标 + 进度点」部件：中央目标月相的半径（CSS px）
    goalRingR: 46,            // 环绕目标的 8 颗进度点所在圆的半径（CSS px）
    guideDotGap: 30,          // 三步引导时三个进度点的间距（CSS px）
    dotR: 4.5,                // 进度点未点亮时的半径（CSS px，暗色小圆）
    dotLitScale: 1.25,        // 点亮后放大的倍数
    dotGlowR: 15,             // 点亮后光晕的半径（CSS px）
    dotGlowAlpha: 0.6,        // 光晕最亮处的不透明度
    arrowStroke: 1.7,         // 导航箭头「←」「→」的线宽（40 × 40 视口里）
    arrowAlpha: 0.45,         // 箭头平时的不透明度（呼吸动画的谷）
    arrowPeakAlpha: 0.85,     // 呼吸到最亮时的不透明度（峰）
    arrowBreatheScale: 1.15   // 呼吸时放大的倍数
  };

  var ORDER = ['ink', 'indigo', 'violet'];
  var DEFAULT = 'indigo';
  var STORAGE_KEY = 'moon.theme';

  function kebab(key) { return key.replace(/[A-Z]/g, function (m) { return '-' + m.toLowerCase(); }); }
  function cssVar(key) { return '--c-' + kebab(key); }          // skyTop → --c-sky-top
  function styleVar(key) { return '--s-' + kebab(key); }        // orbitStroke → --s-orbit-stroke

  function apply(name) {
    if (!PRESETS[name]) name = DEFAULT;
    var preset = PRESETS[name];
    var root = document.documentElement;
    for (var key in preset) {
      if (key !== 'label') root.style.setProperty(cssVar(key), preset[key]);
    }
    for (var sk in STYLE) root.style.setProperty(styleVar(sk), STYLE[sk]);
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
    STYLE: STYLE,
    ORDER: ORDER,
    DEFAULT: DEFAULT,
    current: null,
    apply: apply,
    cssVar: cssVar,
    styleVar: styleVar,
    get: function (key) { return PRESETS[THEME.current || DEFAULT][key]; }
  };
  global.THEME = THEME;

  // 在 <head> 里同步执行：首帧之前颜色就已就位，不会闪白
  apply(saved() || DEFAULT);
})(window);
