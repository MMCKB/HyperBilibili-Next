"""Hyperbili 资产改色预览生成：
- banner: settings_version.png 365x121 → 去版本号 + 按主题重上色
- icon:   logoDEV.png 192x192 → 白色小电视保留 + 渐变重映射为主题双色
输出到 /workspace/preview_recolor/
"""
import colorsys
from PIL import Image

OUT = "/workspace/preview_recolor/"

COMBOS = [
    ("1_bilibili",  "#FF7DA8", "#38C8F0"),
    ("2_neon",      "#A78BFA", "#FF9ECD"),
    ("3_sunset",    "#FF9E4D", "#6FB9FF"),
    ("4_teal",      "#3EC8F5", "#43E5A0"),
    ("5_electric",  "#5B9DFF", "#FFD75E"),
    ("6_sakura",    "#FF9EC4", "#B9A7FF"),
    ("7_aurora",    "#34E39B", "#7C5CFF"),
    ("8_vapor",     "#8A7CFF", "#FF8A54"),
    ("9_ocean",     "#2E6BFF", "#25D5E8"),
    ("10_matrix",   "#1FFFA0", "#12A5FF"),
]

def hx(s):
    return (int(s[1:3], 16), int(s[3:5], 16), int(s[5:7], 16))

def lum(p):
    return (p[0] * 2 + p[1] * 3 + p[2]) // 6

def clamp(v, a, b):
    return a if v < a else (b if v > b else v)

def shift_hue(px, target_hue_deg):
    """把像素色相替换为目标色相，保持 S/V（近中性像素几乎不变）"""
    r, g, b = px[0] / 255.0, px[1] / 255.0, px[2] / 255.0
    h, s, v = colorsys.rgb_to_hsv(r, g, b)
    if s < 0.06:
        return (px[0], px[1], px[2])
    r2, g2, b2 = colorsys.hsv_to_rgb(target_hue_deg / 360.0, s, v)
    return (round(r2 * 255), round(g2 * 255), round(b2 * 255))

# ================= banner =================
src = Image.open("/workspace/src/common/settings_version.png").convert("RGBA")
W, H = src.size
SP = src.load()

TITLE_BAND = (35, 74, 70, 320)   # y0 y1 x0 x1

# 版本号区域：文字实际在 y77-93 / x110-246（含抗锯齿），
# 上下锚点行 y75 / y95 在 x<260 范围内均为干净背景 → 整带垂直插值替换
VER_BAND = (77, 93, 100, 252)
VER_TOP, VER_BOT = 75, 95

def erase_band(img_px, band, thr):
    """行内插值擦除亮像素"""
    y0, y1, x0, x1 = band
    for y in range(y0, y1 + 1):
        dirty = {}
        for x in range(x0, x1 + 1):
            p = img_px[x, y]
            if p[3] > 40 and lum(p) > thr:
                dirty[x] = True
        if not dirty:
            continue
        for x in dirty:
            # 左右最近干净锚点
            xl = x - 1
            while xl >= 0 and (xl in dirty or img_px[xl, y][3] <= 40 and lum(img_px[xl, y]) > thr):
                if xl in dirty:
                    xl -= 1
                else:
                    break
            while xl >= 0 and xl in dirty:
                xl -= 1
            xr = x + 1
            while xr < W and (xr in dirty or img_px[xr, y][3] <= 40 and lum(img_px[xr, y]) > thr):
                if xr in dirty:
                    xr += 1
                else:
                    break
            while xr < W and xr in dirty:
                xr += 1
            pl = img_px[max(xl, 0), y] if xl >= 0 else None
            pr = img_px[min(xr, W - 1), y] if xr < W else None
            if pl is None and pr is None:
                continue
            if pl is None:
                pl = pr
            if pr is None:
                pr = pl
            t = (x - xl) / (xr - xl) if xr > xl else 0
            img_px[x, y] = (
                round(pl[0] + (pr[0] - pl[0]) * t),
                round(pl[1] + (pr[1] - pl[1]) * t),
                round(pl[2] + (pr[2] - pl[2]) * t),
                255,
            )

for name, c1, c2 in COMBOS:
    primary, secondary = hx(c1), hx(c2)
    ph = colorsys.rgb_to_hsv(primary[0]/255, primary[1]/255, primary[2]/255)[0] * 360

    im = src.copy()
    px = im.load()
    # 1a. 擦除标题带（随后重组上新色）
    erase_band(px, TITLE_BAND, 85)
    # 1b. 版本号带：上下干净行垂直插值整体替换（无残影）
    vy0, vy1, vx0, vx1 = VER_BAND
    for x in range(vx0, vx1 + 1):
        pt, pb = px[x, VER_TOP], px[x, VER_BOT]
        for y in range(vy0, vy1 + 1):
            t = (y - VER_TOP) / (VER_BOT - VER_TOP)
            px[x, y] = (
                round(pt[0] + (pb[0] - pt[0]) * t),
                round(pt[1] + (pb[1] - pt[1]) * t),
                round(pt[2] + (pb[2] - pt[2]) * t),
                255,
            )
    # 2. 全图色相偏移到主色（背景+辉光）
    for y in range(H):
        for x in range(W):
            p = px[x, y]
            if p[3] > 0:
                px[x, y] = shift_hue(p, ph) + (p[3],)
    # 3. 重组标题文字（用原图像素提取，重新上色）
    ty0, ty1, tx0, tx1 = TITLE_BAND
    for y in range(ty0, ty1 + 1):
        for x in range(tx0, tx1 + 1):
            op = SP[x, y]
            if op[3] <= 40:
                continue
            L = lum(op)
            a = clamp((L - 85) / 70, 0, 1)
            if a <= 0:
                continue
            if x > 285:
                continue  # 箭头保持原样
            col = primary if (op[0] - op[2] > 40) else secondary
            bp = px[x, y]
            px[x, y] = (
                round(bp[0] * (1 - a) + col[0] * a),
                round(bp[1] * (1 - a) + col[1] * a),
                round(bp[2] * (1 - a) + col[2] * a),
                255,
            )
    im.save(OUT + "banner_" + name + ".png")
    print("banner_" + name, "ok")

# ================= icon =================
ico = Image.open("/workspace/src/common/logoDEV.png").convert("RGBA")
IW, IH = ico.size
IP = ico.load()

# 采样渐变两端参考色（避开白色像素：饱和度过低的跳过）
def sample_avg(x0, y0, x1, y1):
    rs = gs = bs = n = 0
    for y in range(y0, y1):
        for x in range(x0, x1):
            p = IP[x, y]
            if p[3] <= 40:
                continue
            h, s, v = colorsys.rgb_to_hsv(p[0]/255, p[1]/255, p[2]/255)
            if s < 0.25:
                continue
            rs += p[0]; gs += p[1]; bs += p[2]; n += 1
    if n == 0:
        return None
    return (rs/n, gs/n, bs/n)

corners = {
    "tl": sample_avg(20, 20, 45, 45),
    "tr": sample_avg(147, 20, 172, 45),
    "bl": sample_avg(20, 147, 45, 172),
    "br": sample_avg(147, 147, 172, 172),
}
print("icon corners:", {k: tuple(round(c) for c in v) if v else None for k, v in corners.items()})

# 确定粉端/蓝端
def warmness(c):
    return c[0] - c[2] if c else 0

warmest = max(corners, key=lambda k: warmness(corners[k]))
coolest = min(corners, key=lambda k: warmness(corners[k]))
PINK_REF = corners[warmest]
BLUE_REF = corners[coolest]
print("pink ref:", tuple(round(c) for c in PINK_REF), "at", warmest)
print("blue ref:", tuple(round(c) for c in BLUE_REF), "at", coolest)

# 预计算每像素的 t（颜色空间投影）与白度 w
vec = (BLUE_REF[0]-PINK_REF[0], BLUE_REF[1]-PINK_REF[1], BLUE_REF[2]-PINK_REF[2])
vlen2 = vec[0]**2 + vec[1]**2 + vec[2]**2
TMAP = {}
WMAP = {}
for y in range(IH):
    for x in range(IW):
        p = IP[x, y]
        if p[3] <= 40:
            continue
        h, s, v = colorsys.rgb_to_hsv(p[0]/255, p[1]/255, p[2]/255)
        t = ((p[0]-PINK_REF[0])*vec[0] + (p[1]-PINK_REF[1])*vec[1] + (p[2]-PINK_REF[2])*vec[2]) / vlen2
        TMAP[(x, y)] = clamp(t, 0, 1)
        WMAP[(x, y)] = clamp((0.32 - s) / 0.20, 0, 1)

for name, c1, c2 in COMBOS:
    primary, secondary = hx(c1), hx(c2)
    im = ico.copy()
    px = im.load()
    for (x, y), t in TMAP.items():
        w = WMAP[(x, y)]
        if w >= 1:
            continue
        nb = (
            primary[0] + (secondary[0]-primary[0]) * t,
            primary[1] + (secondary[1]-primary[1]) * t,
            primary[2] + (secondary[2]-primary[2]) * t,
        )
        op = IP[x, y]
        px[x, y] = (
            round(op[0]*w + nb[0]*(1-w)),
            round(op[1]*w + nb[1]*(1-w)),
            round(op[2]*w + nb[2]*(1-w)),
            op[3],
        )
    im.save(OUT + "icon_" + name + ".png")
    print("icon_" + name, "ok")

import os
for f in sorted(os.listdir(OUT)):
    print(f, os.path.getsize(OUT + f), "bytes")

# ================= 汇总预览图 =================
from PIL import ImageDraw, ImageFont

PAD, GAP, LABEL_H = 24, 18, 26
bw, bh = 365, 121
iw, ih = 192, 192
BG = (24, 26, 32)
try:
    font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 15)
except Exception:
    font = ImageFont.load_default()

names = [n for n, _, _ in COMBOS]
# 布局：每个主题一行 = 1 个 banner + 1 个 icon
row_h = max(bh, ih) + LABEL_H + GAP
sheet = Image.new("RGB", (PAD * 2 + bw + GAP + iw, PAD + len(names) * row_h + PAD), BG)
d = ImageDraw.Draw(sheet)
for i, n in enumerate(names):
    y0 = PAD + i * row_h
    d.text((PAD, y0), f"{i+1}. {n}", fill=(200, 205, 215), font=font)
    yimg = y0 + LABEL_H
    b = Image.open(OUT + "banner_" + n + ".png")
    if b.mode == "RGBA":
        bgc = Image.new("RGB", b.size, BG)
        bgc.paste(b, (0, 0), b)
        b = bgc
    sheet.paste(b, (PAD, yimg))
    ic = Image.open(OUT + "icon_" + n + ".png")
    if ic.mode == "RGBA":
        bgc = Image.new("RGB", ic.size, BG)
        bgc.paste(ic, (0, 0), ic)
        ic = bgc
    sheet.paste(ic, (PAD + bw + GAP, yimg))
    print("sheet row", n, "ok")
sheet.save(OUT + "preview_sheet.png")
print("preview_sheet.png", sheet.size)
