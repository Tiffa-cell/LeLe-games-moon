#!/usr/bin/env python3
"""M0 美术验证 · 第一章「月亮的圆缺循环」静态概念稿生成器.

程序化生成 SVG(几何造型、参数可调),再由 Chromium 无头渲染为 PNG。
画布为 iPad 竖版 1668x2388(11" @2x)。

用法:
    python3 generate_concept.py            # 生成 svg/ 与 png/ 下的全部配色变体
"""

import math
import os
import random
import shutil
import subprocess

W, H = 1668, 2388

HERE = os.path.dirname(os.path.abspath(__file__))
SVG_DIR = os.path.join(HERE, "svg")
PNG_DIR = os.path.join(HERE, "png")

CHROMIUM = "/opt/pw-browsers/chromium"

# ---------------------------------------------------------------- 配色变体
VARIANTS = {
    "a-indigo": {  # 靛夜:最接近经典纪念碑谷夜章的深蓝
        "sky_top": "#141b33", "sky_bottom": "#35406b",
        "star": "#cdd6ec",
        "moon_lit": "#f4ecd8", "moon_crater": "#e3d7bd",
        "moon_dark": "#2b3459",
        "ring_guide": "#8d98c4",
        "hill_far": "#2a335c", "hill_mid": "#222a4e", "hill_near": "#1a2140",
        "silhouette": "#12172e",
        "window": "#ffc978",
    },
    "b-lavender": {  # 暮紫:更柔和梦幻,偏睡前氛围
        "sky_top": "#241f3f", "sky_bottom": "#4d3f6b",
        "star": "#e0d7ee",
        "moon_lit": "#f6e8cf", "moon_crater": "#e6d3b2",
        "moon_dark": "#3a3260",
        "ring_guide": "#a294c6",
        "hill_far": "#3c3161", "hill_mid": "#322852", "hill_near": "#271e42",
        "silhouette": "#1a1430",
        "window": "#ffcf8a",
    },
    "c-teal": {  # 松屿青:冷静的蓝绿,更"自然博物"的气质
        "sky_top": "#0f2228", "sky_bottom": "#2c4a50",
        "star": "#cfe0dd",
        "moon_lit": "#f0eeda", "moon_crater": "#dcd6b8",
        "moon_dark": "#24404a",
        "ring_guide": "#7fa1a3",
        "hill_far": "#23424a", "hill_mid": "#1b353d", "hill_near": "#142a31",
        "silhouette": "#0c1e24",
        "window": "#ffc36e",
    },
}

# ---------------------------------------------------------------- 布局参数
MOON_CX, MOON_CY, MOON_R = W / 2, 850, 205   # 主月亮:居中偏上
RING_R, PHASE_R = 470, 46                    # 相位环半径 / 小月亮半径


def moon_phase_svg(cx, cy, r, p, lit, dark):
    """画一枚相位为 p 的小月亮(p: 0=新月, 0.25=上弦, 0.5=满月, 0.75=下弦)。"""
    parts = [f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="{r}" fill="{dark}"/>']
    if p <= 0.001 or p >= 0.999:  # 新月:暗盘 + 细微亮边
        parts.append(
            f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="{r - 1.5}" fill="none" '
            f'stroke="{lit}" stroke-width="3" opacity="0.28"/>')
        return "\n".join(parts)
    if abs(p - 0.5) <= 0.001:  # 满月
        parts.append(f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="{r}" fill="{lit}"/>')
        return "\n".join(parts)

    k = math.cos(2 * math.pi * p)  # 明暗界线椭圆的半宽系数
    rx = abs(k) * r
    top, bottom = f"{cx:.1f},{cy - r:.1f}", f"{cx:.1f},{cy + r:.1f}"
    if p < 0.5:  # 盈月:亮面在右
        edge = f"M {top} A {r},{r} 0 0 1 {bottom}"          # 右半圆,上→下
        sweep = 0 if k > 0 else 1                            # 界线凸向右/左
    else:        # 亏月:亮面在左
        edge = f"M {top} A {r},{r} 0 0 0 {bottom}"          # 左半圆,上→下
        sweep = 0 if k < 0 else 1
    if rx < 0.5:
        terminator = f"L {top}"
    else:
        terminator = f"A {rx:.2f},{r} 0 0 {sweep} {top}"
    parts.append(f'<path d="{edge} {terminator} Z" fill="{lit}"/>')
    return "\n".join(parts)


def stars_svg(c, rng):
    """稀疏的星点:避开月亮相位环与地面。"""
    out = []
    dots = 0
    while dots < 46:
        x, y = rng.uniform(40, W - 40), rng.uniform(50, 1900)
        if math.hypot(x - MOON_CX, y - MOON_CY) < RING_R + 120:
            continue
        r = rng.uniform(2.2, 4.6)
        op = rng.uniform(0.28, 0.85)
        out.append(f'<circle cx="{x:.0f}" cy="{y:.0f}" r="{r:.1f}" '
                   f'fill="{c["star"]}" opacity="{op:.2f}"/>')
        dots += 1
    sparkles = 0
    while sparkles < 6:  # 少量四角星,增加一点童趣
        x, y = rng.uniform(80, W - 80), rng.uniform(80, 1800)
        if math.hypot(x - MOON_CX, y - MOON_CY) < RING_R + 160:
            continue
        s = rng.uniform(9, 15)
        op = rng.uniform(0.5, 0.9)
        out.append(
            f'<path d="M {x:.0f},{y - s:.0f} Q {x:.0f},{y:.0f} {x + s:.0f},{y:.0f} '
            f'Q {x:.0f},{y:.0f} {x:.0f},{y + s:.0f} '
            f'Q {x:.0f},{y:.0f} {x - s:.0f},{y:.0f} '
            f'Q {x:.0f},{y:.0f} {x:.0f},{y - s:.0f} Z" '
            f'fill="{c["star"]}" opacity="{op:.2f}"/>')
        sparkles += 1
    return "\n".join(out)


def ground_svg(c):
    """地面:三层圆弧小山 + 小屋(暖窗)+ 一棵小树 + 仰望的小小剪影。"""
    out = []
    # 远山 / 中山 / 近山(用大圆做出柔和的弧形山丘)
    out.append(f'<circle cx="900" cy="2500" r="520" fill="{c["hill_far"]}"/>')
    out.append(f'<circle cx="480" cy="2620" r="580" fill="{c["hill_mid"]}"/>')
    out.append(f'<circle cx="1250" cy="2680" r="600" fill="{c["hill_near"]}"/>')

    # 小屋(左侧山丘顶):方身 + 尖顶 + 烟囱 + 一扇暖窗
    hx, by = 500, 2052
    sil = c["silhouette"]
    out.append(f'<rect x="{hx - 48}" y="{by - 80}" width="96" height="80" fill="{sil}"/>')
    out.append(f'<polygon points="{hx - 62},{by - 80} {hx + 62},{by - 80} {hx},{by - 142}" fill="{sil}"/>')
    out.append(f'<rect x="{hx + 22}" y="{by - 150}" width="14" height="34" fill="{sil}"/>')
    out.append(f'<circle cx="{hx - 4}" cy="{by - 44}" r="30" fill="{c["window"]}" opacity="0.16"/>')
    out.append(f'<rect x="{hx - 14}" y="{by - 58}" width="20" height="26" rx="9" fill="{c["window"]}"/>')

    # 小树(屋旁):细干 + 水滴形树冠
    tx = hx - 128
    out.append(f'<rect x="{tx - 3}" y="{by - 52}" width="6" height="54" fill="{sil}"/>')
    out.append(f'<path d="M {tx},{by - 128} Q {tx + 30},{by - 82} {tx},{by - 44} '
               f'Q {tx - 30},{by - 82} {tx},{by - 128} Z" fill="{sil}"/>')

    # 小小的孩子剪影(右侧山丘顶,仰头看月亮)
    px, pb = 1250, 2094
    out.append(f'<path d="M {px - 15},{pb} Q {px - 15},{pb - 46} {px},{pb - 50} '
               f'Q {px + 15},{pb - 46} {px + 15},{pb} Z" fill="{sil}"/>')
    out.append(f'<circle cx="{px + 4}" cy="{pb - 61}" r="13" fill="{sil}"/>')
    return "\n".join(out)


def build_svg(c, seed=42):
    rng = random.Random(seed)
    # 相位环:底部为新月,沿右侧上行渐盈,顶部满月,左侧下行渐亏
    ring = [f'<circle cx="{MOON_CX}" cy="{MOON_CY}" r="{RING_R}" fill="none" '
            f'stroke="{c["ring_guide"]}" stroke-width="3" opacity="0.28" '
            f'stroke-dasharray="1 26" stroke-linecap="round"/>']
    for i in range(8):
        theta = math.radians(90 - i * 45)  # 屏幕角:90°=正下方,逆时针
        x = MOON_CX + RING_R * math.cos(theta)
        y = MOON_CY + RING_R * math.sin(theta)
        ring.append(moon_phase_svg(x, y, PHASE_R, i / 8, c["moon_lit"], c["moon_dark"]))

    craters = "\n".join(
        f'<circle cx="{MOON_CX + dx}" cy="{MOON_CY + dy}" r="{r}" '
        f'fill="{c["moon_crater"]}" opacity="0.55"/>'
        for dx, dy, r in [(-62, -42, 36), (52, 34, 23), (-12, 74, 16), (72, -72, 14)])

    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">
<defs>
  <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="{c["sky_top"]}"/>
    <stop offset="1" stop-color="{c["sky_bottom"]}"/>
  </linearGradient>
  <radialGradient id="glow">
    <stop offset="0.45" stop-color="{c["moon_lit"]}" stop-opacity="0.22"/>
    <stop offset="1" stop-color="{c["moon_lit"]}" stop-opacity="0"/>
  </radialGradient>
</defs>
<rect width="{W}" height="{H}" fill="url(#sky)"/>
{stars_svg(c, rng)}
<circle cx="{MOON_CX}" cy="{MOON_CY}" r="{MOON_R + 190}" fill="url(#glow)"/>
{"".join(x + chr(10) for x in ring)}
<circle cx="{MOON_CX}" cy="{MOON_CY}" r="{MOON_R}" fill="{c["moon_lit"]}"/>
{craters}
{ground_svg(c)}
</svg>'''


def render_png(svg_path, png_path):
    html_path = svg_path + ".html"
    with open(svg_path) as f:
        svg = f.read()
    with open(html_path, "w") as f:
        f.write(f'<!doctype html><meta charset="utf-8">'
                f'<body style="margin:0;overflow:hidden">{svg}</body>')
    subprocess.run(
        [CHROMIUM, "--headless", "--no-sandbox", "--disable-gpu",
         "--hide-scrollbars", "--force-device-scale-factor=1",
         f"--window-size={W},{H}", f"--screenshot={png_path}",
         "file://" + html_path],
        check=True, capture_output=True)
    os.remove(html_path)


def main():
    os.makedirs(SVG_DIR, exist_ok=True)
    os.makedirs(PNG_DIR, exist_ok=True)
    for name, colors in VARIANTS.items():
        svg_path = os.path.join(SVG_DIR, f"moon-cycle-{name}.svg")
        png_path = os.path.join(PNG_DIR, f"moon-cycle-{name}.png")
        with open(svg_path, "w") as f:
            f.write(build_svg(colors))
        if shutil.which(CHROMIUM) or os.path.exists(CHROMIUM):
            render_png(svg_path, png_path)
            print(f"ok  {png_path}")
        else:
            print(f"svg only (chromium not found)  {svg_path}")


if __name__ == "__main__":
    main()
