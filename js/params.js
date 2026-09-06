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
    count: 46,            // 参考画布上的星点数（按画布面积缩放）；分成 8 批，经过第 i 个相位节点点亮第 i 批
    sparkles: 6,          // 四角星数：第一次通关时出现，之后一直留着（通关印记）
    dim: 0.2,             // 未点亮时星星的亮度系数（1 = 概念稿亮度）
    litBoost: 1.25,       // 点亮后的亮度系数（超过 1 的部分自动截到全亮）
    litScale: 1.2,        // 点亮后星星放大的倍数
    lightMs: 600,         // 每颗星从暗到亮的缓动时长（点亮时先闪到峰值，再落到常亮）
    igniteSettleMs: 300,  // 闪到峰值后落回常亮的时长
    igniteScale: 1.8,     // 点亮瞬间放大的倍数
    batchStaggerMs: 90,   // 同一批星星逐颗点亮的间隔
    peakScale: 2.2,       // 闪烁波峰值时星星放大的倍数（峰值颜色见 theme.js 的 starPeak）
    waveSpreadMs: 850,    // 闪烁波从最近的星扩散到最远那颗星的时间
    waveFlashMs: 700,     // 每颗星闪一下的时长（扩散 + 闪 ≈ 1.5 秒）
    resetMs: 1600,        // 镜头拉回时星空回暗的时长（下一圈可以再点亮一次）
    seed: 42              // 星空随机种子（同一屏幕比例下星空固定不变）
  },

  camera: {
    introHoldMs: 900,     // 开场停在小人身上多久
    introZoomMs: 2600,    // 开场从小人拉远到宇宙视角的时长
    winDelayMs: 1500,     // 走满一圈后，等闪烁波过去多久镜头再落到小人身上
    winZoomMs: 2400,      // 镜头落到小人的时长
    holdMs: 2000,         // 停在小人身上多久后缓缓拉回（点一下屏幕可以提前）
    returnZoomMs: 2400,   // 从小人缓缓拉回原构图的时长
    kidFrameRatio: 0.32   // 小人镜头的宽度 = 画布宽 × 此比例
  },

  kid: {
    lookUpMs: 700         // 小人抬头的时长
  },

  win: {
    lapEpsilon: 0.02      // 判定「回到起点」的容差（弧度）
  }
};
