# 月相

给一个四岁孩子做的月相科普互动应用。一次只讲一个主题，安静、极简、无文字。
规格见 [SPEC.md](SPEC.md)，路线见 [ROADMAP.md](ROADMAP.md)。

当前进度：**M1 底座 + 第1章「圆缺循环」**（M0 美术定稿：黛蓝，见 `assets/m0/`）。

## 在 iPad Safari 上打开

整个应用就是一个文件夹：零依赖、零构建。iPad 上的 Safari 不能直接打开本地 HTML 文件，
所以要么发布到网上（方式 A），要么从同一个 Wi-Fi 里的电脑上临时提供（方式 B）。

**A. GitHub Pages（推荐，加到主屏最省事）**

1. 仓库页面 → Settings → Pages → Build and deployment → Source 选 `Deploy from a branch`，
   Branch 选 `main`、文件夹选 `/ (root)`，Save。
2. 等一两分钟，在 iPad Safari 打开 `https://tiffa-cell.github.io/LeLe-games-moon/`。
3. 点分享按钮 → **添加到主屏幕**。以后从主屏图标打开就是全屏，没有地址栏，状态栏跟天空同色。

**B. 局域网临时打开（不发布也能在 iPad 上试）**

在 Mac 上进入仓库文件夹，运行：

```
python3 -m http.server 8000
```

iPad 和 Mac 连同一个 Wi-Fi，在 iPad Safari 打开 `http://<Mac 的 IP>:8000/`
（Mac 的 IP 在 系统设置 → Wi-Fi → 详细信息 里能看到）。这种方式也能添加到主屏，但 Mac 关掉后打不开。

**C. 电脑上直接看**

双击 `index.html` 就能在任何现代浏览器里打开（`file://` 也可以）。
想看 iPad 效果，用浏览器的「响应式设计模式」选 iPad 竖屏。

## 第1章怎么玩

- 开场镜头停在山丘上的小人身上，然后慢慢拉远，看见整个月相环（点一下屏幕可以跳过）。
- 环上有一颗**发着光的小月亮**：拖着它沿环走（在环的任何位置按住拖也可以）。
  中央的大月亮实时跟着变；松手时会轻轻吸附到最近的相位。
- **每经过一个相位小月亮**：它轻轻一跳，天空里那一侧的几颗星「点着」（先闪一下再常亮）。
  星星按绕月亮的方位分成 8 批，跟着手指绕一圈亮起来，走满一圈正好全亮。
- **走完一整圈、回到起点的空心圆**：全屏星星做一次由月亮向外扩散的闪烁波（约 1.5 秒，
  峰值比平时亮得多），小人抬头；然后镜头落到小人身上，停约 2 秒，再缓缓拉回原构图。
  拉回时星空慢慢回暗，可以直接再拖一圈，不用刷新。
- 四角星是通关印记：第一次走满一圈时出现，之后一直留着。
- 右上角三个圆点切换夜色：墨青 / 黛蓝（默认）/ 暗紫。选择会记住。
- 进度（是否通关、圈数）和夜色存在浏览器的 localStorage 里。想重置就清除这个网站的数据，没有账户。

## 文件结构

```
index.html         入口（零依赖，双击即开）
theme.js           全部颜色的唯一来源：三套夜色预设（ink / indigo / violet）
css/style.css      布局与动效（颜色只引用 CSS 变量，不写色值）
js/params.js       可调参数（构图、动画节奏、交互手感）
js/moon.js         月相几何（纯函数）
js/scene.js        分层绘制：天空 → 星 → 月晕 → 相位环 → 主月亮 → 地面剪影
js/chapter1.js     第1章：拖拽、过关演出、镜头往返、进度保存
js/app.js          启动、夜色切换、屏幕尺寸变化时重建
js/util.js         补间动画、localStorage
assets/m0/         M0 三张概念稿（定稿：黛蓝 moon-cycle-a-indigo）与生成脚本
assets/icon.svg    主屏图标源文件（icon-180.png 由它渲染）
tools/e2e.js       无头 Chromium 端到端测试（开发用，应用本身不依赖它）
tools/make-icon.js 重新渲染主屏图标
```

## 可调参数（M1 新增）

### `theme.js` — 颜色（三套夜色各一份，程序其他地方一律不写色值）

| 键 | 含义 | 黛蓝（默认） |
|---|---|---|
| `skyTop` / `skyBottom` | 天空上端色 / 下端色 | `#141b33` / `#35406b` |
| `moon` / `moonCrater` / `moonDark` | 月亮亮面 / 浅坑 / 暗面 | `#f4ecd8` / `#e3d7bd` / `#2b3459` |
| `glow` | 月晕色 | `#f4ecd8` |
| `star` | 星星 | `#cdd6ec` |
| `starPeak` | 星星闪烁波的峰值色（配合放大与不透明度 1，明显比平时亮） | `#f4f7ff` |
| `ring` | 相位环虚线色 | `#8d98c4` |
| `hillFar` / `hillMid` / `hillNear` | 远 / 中 / 近三层山丘 | `#2a335c` / `#222a4e` / `#1a2140` |
| `silhouette` | 剪影色（小屋、树、小人） | `#12172e` |
| `window` | 暖窗色 | `#ffc978` |
| `text` | 文字 / 图标色 | `#dfe4f2` |

另外：`DEFAULT` 默认夜色（`indigo`），`ORDER` 右上角圆点的顺序。
三套色板均从 `assets/m0/generate_concept.py` 的 `VARIANTS` 提取：
`indigo` ← a-indigo（靛夜）、`violet` ← b-lavender（暮紫）、`ink` ← c-teal（松屿青）。

### `js/params.js` — 其余参数（单位是画布单位，参考画布 1668 × 2388）

| 组 | 参数 | 含义 | 默认 |
|---|---|---|---|
| `moon` | `radius` | 主月亮半径 | 205 |
| | `yRatio` | 主月亮中心离顶部的比例 | 0.356 |
| | `glowExtra` / `glowAlpha` / `glowMinRatio` | 月晕外扩 / 满月时不透明度 / 新月时保留比例 | 190 / 0.22 / 0.35 |
| | `rimAlpha` | 新月暗盘细亮边的不透明度 | 0.28 |
| | `craters` / `craterAlpha` | 月面浅坑 `[dx, dy, r]` / 不透明度 | 4 个 / 0.55 |
| `ring` | `radius` | 相位环半径 | 470 |
| | `markerRadius` / `travelerRadius` | 八枚小月亮 / 可拖动那颗的半径 | 46 / 50 |
| | `haloExtra` / `haloAlpha` | 可拖动小月亮的光晕外扩 / 亮度 | 46 / 0.32 |
| | `width` / `dash` / `alpha` | 环的线宽 / 虚线样式 / 不透明度 | 3 / `1 26` / 0.28 |
| | `trailAlpha` | 本圈已走过弧线的不透明度 | 0.55 |
| | `grabBand` | 手指离环多远以内算抓住了环 | 130 |
| | `centerDeadZone` | 离环心太近时忽略手指 | 90 |
| | `snap` / `snapMs` | 松手吸附到最近相位 / 时长 | true / 240 |
| `stars` | `count` / `sparkles` | 星点数（分 8 批，按画布面积缩放）/ 四角星数 | 46 / 6 |
| | `dim` | 未点亮时的亮度系数 | 0.2 |
| | `litBoost` / `litScale` | 点亮后的亮度系数 / 放大倍数 | 1.25 / 1.2 |
| | `lightMs` / `igniteSettleMs` / `igniteScale` | 点亮：闪到峰值的时长 / 落回常亮的时长 / 峰值放大倍数 | 600 / 300 / 1.8 |
| | `batchStaggerMs` | 同一批星逐颗点亮的间隔 | 90 |
| | `peakScale` | 闪烁波峰值放大倍数（峰值色见 theme.js `starPeak`） | 2.2 |
| | `waveSpreadMs` / `waveFlashMs` | 闪烁波扩散到最远星的时间 / 每颗星闪一下的时长 | 850 / 700 |
| | `resetMs` | 镜头拉回时星空回暗的时长 | 1600 |
| | `seed` | 星空随机种子 | 42 |
| `camera` | `introHoldMs` / `introZoomMs` | 开场停在小人身上 / 拉远时长 | 900 / 2600 |
| | `winDelayMs` / `winZoomMs` | 走满一圈后等闪烁波多久 / 镜头落到小人的时长 | 1500 / 2400 |
| | `holdMs` / `returnZoomMs` | 停在小人身上多久 / 缓缓拉回原构图的时长 | 2000 / 2400 |
| | `kidFrameRatio` | 小人镜头宽度占画布宽的比例 | 0.32 |
| `kid` | `lookUpMs` | 小人抬头时长 | 700 |
| `win` | `lapEpsilon` | 判定回到起点的容差（弧度） | 0.02 |

## 开发说明

- **颜色铁律**：除 `theme.js` 外任何地方不写色值。自查：
  `grep -rnE '#[0-9a-fA-F]{3,8}\b|rgba?\(' index.html css js` 应该没有输出。
- **画布**：沿用 M0 的 1668 × 2388 坐标系。屏幕更窄长（iPhone）就加长画布、更宽（iPad 横屏）就加宽并补山丘，
  构图不裁切；月亮按比例居上，地面锚定底边。
- **分层**：SVG 里天空、星、月晕、相位环、主月亮、地面各一个 `<g class="layer …">`。
- **测试**（需要 Playwright，仅开发用）：

  ```
  NODE_PATH=$(npm root -g) node tools/e2e.js              # file:// 打开
  NODE_PATH=$(npm root -g) node tools/e2e.js http://localhost:8000/
  ```

  会在 `tools/shots/` 留下各个阶段的截图（iPad 竖屏 / 横屏 / iPhone、经过节点点亮、走满一圈的闪烁波、三套夜色）。
- **主屏图标**：改了 `assets/icon.svg` 之后运行 `node tools/make-icon.js` 重新渲染 PNG。
