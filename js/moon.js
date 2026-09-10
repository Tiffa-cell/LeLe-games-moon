/* moon.js — 月相几何（纯函数，不依赖 DOM，与 M0 generate_concept.py 的 moon_phase_svg 同一套逻辑）
 *
 * 相位 p ∈ [0, 1)：0 新月，0.25 上弦，0.5 满月，0.75 下弦。北半球视角：盈月亮面在右，亏月在左。
 * 屏幕角 theta：atan2(dy, dx)，y 轴向下。正下方 = +90° 是新月位（起点），
 * 沿右侧上行渐盈、顶部满月、左侧下行渐亏（与 M0 相位环一致）。
 */
window.MoonMath = (function () {
  'use strict';
  var TAU = Math.PI * 2;
  var HOME_ANGLE = Math.PI / 2;

  function f(n) { return Math.round(n * 100) / 100; }

  // 亮面的 SVG 路径；新月返回空字符串（什么都不亮）
  function litPath(cx, cy, r, p) {
    p = p - Math.floor(p);
    if (p < 0.001 || p > 0.999) return '';
    var top = f(cx) + ',' + f(cy - r), bottom = f(cx) + ',' + f(cy + r);
    if (Math.abs(p - 0.5) < 0.001) {
      return 'M ' + top + ' A ' + r + ',' + r + ' 0 0 1 ' + bottom +
             ' A ' + r + ',' + r + ' 0 0 1 ' + top + ' Z';
    }
    var k = Math.cos(TAU * p);        // 明暗界线（椭圆）的半宽系数
    var rx = Math.abs(k) * r, edge, sweep;
    if (p < 0.5) {                    // 盈月：亮面在右
      edge = 'M ' + top + ' A ' + r + ',' + r + ' 0 0 1 ' + bottom;   // 右半圆，上→下
      sweep = k > 0 ? 0 : 1;          // 界线凸向右 / 左
    } else {                          // 亏月：亮面在左
      edge = 'M ' + top + ' A ' + r + ',' + r + ' 0 0 0 ' + bottom;   // 左半圆，上→下
      sweep = k < 0 ? 0 : 1;
    }
    var terminator = rx < 0.5 ? 'L ' + top : 'A ' + f(rx) + ',' + r + ' 0 0 ' + sweep + ' ' + top;
    return edge + ' ' + terminator + ' Z';
  }

  // 亮面占比：新月 0，满月 1
  function litFraction(p) { return (1 - Math.cos(TAU * p)) / 2; }

  function phaseFromAngle(theta) {
    var p = (HOME_ANGLE - theta) / TAU;
    return p - Math.floor(p);
  }
  function angleFromPhase(p) { return HOME_ANGLE - p * TAU; }

  // 第2章：太阳在屏幕角 theta（atan2，y 轴向下）时，「亮面永远朝太阳」的月相。
  // 把太阳的轨道读成一个侧视截面：太阳在下方（靠近地面上的小人这一侧）= 满月，
  // 在上方（月亮背后）= 新月，左右 = 弦月；中间连续过渡（蛾眉月、凸月）。
  // 返回：phase — 亮面在右的等效相位 ∈ [0, .5]（配合 litPath 使用）；
  //       rotateDeg — 再绕月心转多少度让亮面朝向太阳；fraction — 亮面占比。
  function litFromSun(theta) {
    var k = Math.max(-1, Math.min(1, -Math.sin(theta)));   // 明暗界线半宽系数 = cos(2π·phase)
    return {
      phase: Math.acos(k) / TAU,
      rotateDeg: theta * 180 / Math.PI,
      fraction: (1 - k) / 2
    };
  }

  // 第2章（椭圆轨道版）：太阳在轨道角 phi 时的月相。轨道是从稍高处俯视的一个水平圆环，
  // 画成横向长、纵向扁的椭圆（半径 rx、ry）：phi = -π/2 是椭圆最上端 = 太阳在月亮正后方（新月），
  // phi = +π/2 是最下端 = 太阳在正前方（满月），左右两端 = 弦月；中间连续过渡。
  //   depth       — 前后深度 ∈ [-1, 1]：-1 正后方，+1 正前方（决定亮面占比与太阳大小）
  //   screenAngle — 太阳在屏幕上相对月心的方向（椭圆压扁后与 phi 不同）：亮面朝这个方向
  //   phase       — 亮面在右的等效相位 ∈ [0, .5]（配合 litPath）；rotateDeg — 再转到 screenAngle
  //   fraction    — 亮面占比；cycle — 第1章意义上的相位 ∈ [0, 1)（0 新月 → .25 上弦 → .5 满月 → .75 下弦）
  function litFromOrbit(phi, rx, ry) {
    var depth = Math.max(-1, Math.min(1, Math.sin(phi)));
    var k = -depth;                                          // 明暗界线半宽系数 = cos(2π·phase)
    var screen = Math.atan2(ry * Math.sin(phi), rx * Math.cos(phi));
    var cycle = (phi + Math.PI / 2) / TAU;
    return {
      depth: depth,
      screenAngle: screen,
      phase: Math.acos(k) / TAU,
      rotateDeg: screen * 180 / Math.PI,
      fraction: (1 - k) / 2,
      cycle: cycle - Math.floor(cycle)
    };
  }

  // 真实月相（简单朔望月算法，误差一天以内）：从 2000-01-06 18:14 UTC 那次新月起算，
  // 按平均朔望月 29.530588853 天取模。返回第1章意义上的相位 ∈ [0, 1)：0 新月，0.5 满月。
  var SYNODIC_DAYS = 29.530588853;
  var REF_NEW_MOON_MS = Date.UTC(2000, 0, 6, 18, 14);
  function phaseForDate(date) {
    var days = ((date || new Date()).getTime() - REF_NEW_MOON_MS) / 86400000;
    var p = (days / SYNODIC_DAYS) % 1;
    return p < 0 ? p + 1 : p;
  }
  // 第2章：某个相位（第1章意义上的 cycle）对应的太阳轨道角（litFromOrbit 的反函数）
  function orbitAngleForCycle(p) { return normAngle(p * TAU - Math.PI / 2); }

  // 归一到 (-π, π]
  function normAngle(a) {
    a = a % TAU;
    if (a <= -Math.PI) a += TAU;
    if (a > Math.PI) a -= TAU;
    return a;
  }

  return {
    TAU: TAU,
    HOME_ANGLE: HOME_ANGLE,
    litPath: litPath,
    litFraction: litFraction,
    phaseFromAngle: phaseFromAngle,
    angleFromPhase: angleFromPhase,
    litFromSun: litFromSun,
    litFromOrbit: litFromOrbit,
    phaseForDate: phaseForDate,
    orbitAngleForCycle: orbitAngleForCycle,
    normAngle: normAngle
  };
})();
