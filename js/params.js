/* params.js — 可调参数（颜色除外；颜色一律在 theme.js）
 *
 * 坐标单位是「画布单位」：以 M0 概念稿的画布为参考（宽 1668 × 高 2388）。
 * 屏幕比例不同时，画布会按比例加长或加宽（见 scene.js），构图数值不必改。
 */
window.PARAMS = {
  ref: { width: 1668, height: 2388 },   // 参考画布（M0）

  moon: {
    radius: 205,          // 主月亮半径
    yRatio: 0.356,        // 主月亮中心离画布顶部的比例（M0：850 / 2388）
    glowExtra: 190,       // 月晕半径 = 月亮半径 + glowExtra
    glowAlpha: 0.22,      // 月晕最亮时（满月）的不透明度
    glowMinRatio: 0.35,   // 新月时月晕保留的相对亮度
    rimAlpha: 0.28,       // 新月：暗盘上那圈细亮边的不透明度
    craters: [[-62, -42, 36], [52, 34, 23], [-12, 74, 16], [72, -72, 14]],  // [dx, dy, r]
    craterAlpha: 0.55
  },

  ring: {
    radius: 470,          // 相位环半径
    markerRadius: 46,     // 八枚固定小月亮的半径
    travelerRadius: 50,   // 可拖动的那颗小月亮的半径
    haloExtra: 46,        // 它的光晕外扩多少
    haloAlpha: 0.32,      // 光晕最亮处不透明度
    width: 3,             // 环的线宽
    dash: '1 26',         // 环的虚线样式（点、间隔）
    alpha: 0.28,          // 环的不透明度
    trailAlpha: 0.55,     // 本圈已走过弧线的不透明度
    grabBand: 130,        // 手指离环多远以内算「抓住了环」
    centerDeadZone: 90,   // 手指离环心太近时忽略（角度会抖）
    snap: true,           // 松手时吸附到最近的相位
    snapMs: 240
  },

  stars: {
    count: 46,            // 参考画布上的星点数（按画布面积缩放）
    sparkles: 6,          // 四角星数（过关后才出现）
    dim: 0.3,             // 未过关时星星的亮度系数（1 = 全亮）
    lightMs: 600,         // 每颗星点亮的时长
    staggerMs: 55,        // 逐颗点亮的间隔
    seed: 42              // 星空随机种子（同一屏幕比例下星空固定不变）
  },

  camera: {
    introHoldMs: 900,     // 开场停在小人身上多久
    introZoomMs: 2600,    // 开场从小人拉远到宇宙视角的时长
    winDelayMs: 1400,     // 过关：星星开始点亮后，镜头等多久再回到小人
    winZoomMs: 2600,      // 镜头回到小人的时长
    holdMs: 3500,         // 停在小人身上多久后自动拉远（点一下屏幕也可以）
    returnZoomMs: 1800,   // 从小人拉回宇宙视角的时长
    kidFrameRatio: 0.32   // 小人镜头的宽度 = 画布宽 × 此比例
  },

  kid: {
    lookUpMs: 700         // 小人抬头的时长
  },

  win: {
    lapEpsilon: 0.02      // 判定「回到起点」的容差（弧度）
  }
};
