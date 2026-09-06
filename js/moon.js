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
    normAngle: normAngle
  };
})();
