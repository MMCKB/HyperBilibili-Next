"""统一图标设计语言预览（不动 src/，仅预览）：
- LINE 纯线性：统一 5px 描边（55px 基准），圆头圆角，全部轮廓化
- FILL 纯面性：实心形状 + 镂空细节，无描边混用
- 12 个设置图标按统一 31px 内容网格重画
- 配套：平面化应用图标（线性小电视 + DEV）、平面 banner（渐变卡 + 白字）
"""
import math
import os
import colorsys
from PIL import Image, ImageDraw, ImageFont

SS = 4            # 超采样
BASE = 55
S = BASE * SS     # 220
OUT = "/workspace/preview_recolor/unified/"
os.makedirs(OUT + "line", exist_ok=True)
os.makedirs(OUT + "fill", exist_ok=True)

WHITE = (255, 255, 255, 255)
CUT = (0, 0, 0, 0)
W5 = 5 * SS       # 统一描边宽度

try:
    FONT = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 15)
    FONT_S = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 11)
    FONT_T = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 30)
    FONT_D = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 36)
except Exception:
    FONT = FONT_S = FONT_T = FONT_D = ImageFont.load_default()

def hx(s):
    return (int(s[1:3], 16), int(s[3:5], 16), int(s[5:7], 16))

def clamp(v, a, b):
    return a if v < a else (b if v > b else v)

def lighten(c, f):
    return tuple(clamp(round(v + (255 - v) * f), 0, 255) for v in c)

def darken(c, f):
    return tuple(round(v * (1 - f)) for v in c)

# ---------- 绘制基元（坐标一律 55 逻辑空间，内部 xSS） ----------
def pline(dr, pts, w, fill=WHITE):
    p = [(x * SS, y * SS) for x, y in pts]
    dr.line(p, fill=fill, width=w, joint="curve")
    r = w / 2
    for q in (p[0], p[-1]):
        dr.ellipse([q[0] - r, q[1] - r, q[0] + r, q[1] + r], fill=fill)

def parc(dr, cx, cy, r, a0, a1, w, fill=WHITE):
    n = max(8, int(abs(a1 - a0) / 5))
    pts = []
    for i in range(n + 1):
        a = math.radians(a0 + (a1 - a0) * i / n)
        pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    pline(dr, pts, w, fill)

def pcircle(dr, cx, cy, r, w, fill=WHITE):
    parc(dr, cx, cy, r, 0, 360, w, fill)

def dcircle(dr, cx, cy, r, fill):
    dr.ellipse([(cx - r) * SS, (cy - r) * SS, (cx + r) * SS, (cy + r) * SS], fill=fill)

def poly(dr, pts, fill=None, ow=None):
    p = [(x * SS, y * SS) for x, y in pts]
    if fill is not None:
        dr.polygon(p, fill=fill)
    if ow:
        dr.line(p + [p[0]], fill=WHITE, width=ow, joint="curve")
        r = ow / 2
        for q in p:
            dr.ellipse([q[0] - r, q[1] - r, q[0] + r, q[1] + r], fill=WHITE)

def rrect(dr, x0, y0, x1, y1, r, fill=None, ow=None):
    bbox = [x0 * SS, y0 * SS, x1 * SS, y1 * SS]
    if fill is not None:
        dr.rounded_rectangle(bbox, radius=r * SS, fill=fill)
    if ow:
        dr.rounded_rectangle(bbox, radius=r * SS, outline=WHITE, width=ow)

def dot(dr, x, y, r, fill):
    dcircle(dr, x, y, r, fill)

def head(dr, T, d, s, w):
    """线性箭头：两条短翼线（d 为前进方向单位向量）"""
    for ang in (150, -150):
        rad = math.radians(ang)
        dx = d[0] * math.cos(rad) - d[1] * math.sin(rad)
        dy = d[0] * math.sin(rad) + d[1] * math.cos(rad)
        pline(dr, [T, (T[0] + dx * s, T[1] + dy * s)], w)

def head_tri(dr, T, d, s):
    """面性箭头：实心三角"""
    b = (T[0] - d[0] * s, T[1] - d[1] * s)
    perp = (-d[1], d[0])
    hw = s * 0.55
    poly(dr, [T, (b[0] + perp[0] * hw, b[1] + perp[1] * hw),
              (b[0] - perp[0] * hw, b[1] - perp[1] * hw)], fill=WHITE)

def heart_pts():
    pts = []
    for i in range(80):
        t = i / 80 * 2 * math.pi
        x = 16 * math.sin(t) ** 3
        y = 13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t)
        pts.append((x, -y))
    return pts

def fit(pts, cx, cy, bw, bh):
    xs = [p[0] for p in pts]; ys = [p[1] for p in pts]
    minx, maxx, miny, maxy = min(xs), max(xs), min(ys), max(ys)
    s = min(bw / (maxx - minx), bh / (maxy - miny))
    return [((x - (minx + maxx) / 2) * s + cx, (y - (miny + maxy) / 2) * s + cy) for x, y in pts]

# ---------- 12 个图标（line / fill 双版本） ----------
def g_refresh(dr, fill):
    cx, cy, r = 27.5, 27.5, 13.5
    a = math.radians(150)
    T = (cx + r * math.cos(a), cy + r * math.sin(a))
    d = (-math.sin(a), math.cos(a))
    if not fill:
        parc(dr, cx, cy, r, 330, 150, W5)
        head(dr, T, d, 6.5, W5)
    else:
        parc(dr, cx, cy, r, 330, 150, int(7 * SS))
        head_tri(dr, T, d, 8.5)

def g_home(dr, fill):
    pent = [(13.5, 24), (27.5, 10.5), (41.5, 24), (41.5, 41), (13.5, 41)]
    if not fill:
        poly(dr, pent, ow=W5)
        pline(dr, [(23.5, 41), (23.5, 30.5), (31.5, 30.5), (31.5, 41)], W5)
    else:
        poly(dr, pent, fill=WHITE)
        poly(dr, [(23.5, 30.5), (31.5, 30.5), (31.5, 42.5), (23.5, 42.5)], fill=CUT)

def g_search(dr, fill):
    if not fill:
        pcircle(dr, 24, 24, 10.5, W5)
        pline(dr, [(31.5, 31.5), (41, 41)], W5)
    else:
        dcircle(dr, 24, 24, 10.5, WHITE)
        dcircle(dr, 24, 24, 5.8, CUT)
        pline(dr, [(30.5, 30.5), (41.5, 41.5)], int(5.5 * SS))

def g_play(dr, fill):
    tri = [(22.5, 19.5), (22.5, 35.5), (36.5, 27.5)]
    if not fill:
        pcircle(dr, 27.5, 27.5, 15.5, W5)
        poly(dr, tri, ow=W5)
    else:
        dcircle(dr, 27.5, 27.5, 15.5, WHITE)
        poly(dr, tri, fill=CUT)

def g_comment(dr, fill):
    if not fill:
        rrect(dr, 11, 13, 44, 36, 9, ow=W5)
        pline(dr, [(22, 35.5), (19, 44.5), (31, 35.5)], W5)
    else:
        rrect(dr, 11, 13, 44, 36, 9, fill=WHITE)
        poly(dr, [(22, 34), (19, 44.5), (31, 34)], fill=WHITE)

def g_flag(dr, fill):
    if not fill:
        pline(dr, [(16.5, 10.5), (16.5, 44.5)], W5)
        poly(dr, [(16.5, 16), (39, 16), (39, 29), (16.5, 29)], ow=W5)
    else:
        pline(dr, [(16.5, 10.5), (16.5, 44.5)], int(5.5 * SS))
        poly(dr, [(16.5, 16), (39, 16), (39, 29), (16.5, 29)], fill=WHITE)

def g_monitor(dr, fill):
    if not fill:
        rrect(dr, 12, 13, 43, 33, 4.5, ow=W5)
        pline(dr, [(27.5, 33), (27.5, 38.5)], W5)
        pline(dr, [(20.5, 40), (34.5, 40)], W5)
    else:
        rrect(dr, 12, 13, 43, 33, 4.5, fill=WHITE)
        rrect(dr, 16, 17, 39, 29, 2.5, fill=CUT)
        pline(dr, [(27.5, 33), (27.5, 38.5)], int(5 * SS))
        pline(dr, [(20.5, 40), (34.5, 40)], int(5 * SS))

def g_keyboard(dr, fill):
    if not fill:
        rrect(dr, 10, 17, 45, 38, 5, ow=W5)
        for y in (22.5, 28.5):
            for x in (15, 20, 25, 30, 35, 40):
                dot(dr, x, y, 1.7, WHITE)
        pline(dr, [(19, 33.5), (36, 33.5)], W5)
    else:
        rrect(dr, 10, 17, 45, 38, 5, fill=WHITE)
        for y in (22.5, 28.5):
            for x in (15, 20, 25, 30, 35, 40):
                dot(dr, x, y, 2.1, CUT)
        pline(dr, [(19, 33.5), (36, 33.5)], int(4.5 * SS), fill=CUT)

def g_trash(dr, fill):
    if not fill:
        pline(dr, [(15, 16), (40, 16)], W5)
        pline(dr, [(23.5, 16), (23.5, 11), (31.5, 11), (31.5, 16)], W5)
        poly(dr, [(18, 16), (19.5, 43), (35.5, 43), (37, 16)], ow=W5)
        pline(dr, [(25, 22.5), (25.5, 36.5)], W5)
        pline(dr, [(30, 22.5), (30.5, 36.5)], W5)
    else:
        poly(dr, [(18, 16), (19.5, 43), (35.5, 43), (37, 16)], fill=WHITE)
        pline(dr, [(15, 16), (40, 16)], int(5.5 * SS))
        pline(dr, [(23.5, 16), (23.5, 11), (31.5, 11), (31.5, 16)], int(4.5 * SS))
        pline(dr, [(25, 22.5), (25.5, 36.5)], int(4.2 * SS), fill=CUT)
        pline(dr, [(30, 22.5), (30.5, 36.5)], int(4.2 * SS), fill=CUT)

def g_logout(dr, fill):
    if not fill:
        rrect(dr, 13, 11, 31, 44, 3.5, ow=W5)
        pline(dr, [(25, 27.5), (41, 27.5)], W5)
        pline(dr, [(36.5, 21.5), (43, 27.5)], W5)
        pline(dr, [(36.5, 33.5), (43, 27.5)], W5)
    else:
        rrect(dr, 13, 11, 31, 44, 3.5, fill=WHITE)
        dot(dr, 25.5, 27.5, 2.2, CUT)
        pline(dr, [(25, 27.5), (39, 27.5)], int(5.5 * SS))
        head_tri(dr, (43, 27.5), (1, 0), 8)

def g_heart(dr, fill):
    pts = fit(heart_pts(), 27.5, 28, 30, 27)
    if not fill:
        poly(dr, pts, ow=W5)
    else:
        poly(dr, pts, fill=WHITE)

def g_info(dr, fill):
    if not fill:
        pcircle(dr, 27.5, 27.5, 15.5, W5)
        dot(dr, 27.5, 20, 2.6, WHITE)
        pline(dr, [(27.5, 25.5), (27.5, 37)], W5)
    else:
        dcircle(dr, 27.5, 27.5, 15.5, WHITE)
        pline(dr, [(27.5, 25.5), (27.5, 37)], int(5 * SS), fill=CUT)
        dot(dr, 27.5, 19.8, 3.1, CUT)

ICONS = [
    ("freshtype",  "refresh",  g_refresh),
    ("homevidcount", "home",   g_home),
    ("searchvidcount", "search", g_search),
    ("enablefullanim", "play", g_play),
    ("commentpictures", "comment", g_comment),
    ("startuppage", "startup", g_flag),
    ("playerappearance", "player", g_monitor),
    ("keyboard",    "keyboard", g_keyboard),
    ("removetmp",   "clean",    g_trash),
    ("logout",      "logout",   g_logout),
    ("donation",    "donate",   g_heart),
    ("about",       "about",    g_info),
]

# ---------- 徽章底：同色系纵向渐变圆 ----------
def badge(primary, size=S):
    top = lighten(primary, 0.10)
    bot = darken(primary, 0.12)
    col = Image.new("RGB", (1, size))
    for y in range(size):
        t = y / (size - 1)
        col.putpixel((0, y), tuple(round(top[i] + (bot[i] - top[i]) * t) for i in range(3)))
    grad = col.resize((size, size))
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).ellipse([0, 0, size - 1, size - 1], fill=255)
    b = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    b.paste(grad, (0, 0), mask)
    return b

def make_icon(primary, glyph, fill):
    b = badge(primary)
    lay = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    glyph(ImageDraw.Draw(lay), fill)
    b.alpha_composite(lay)
    return b.resize((BASE, BASE), Image.LANCZOS)

# ---------- 生成：两风格 × 12 图标（bilibili 粉做基准） ----------
PINK = hx("#FF7DA8")
for style, fill in (("line", False), ("fill", True)):
    for key, label, glyph in ICONS:
        make_icon(PINK, glyph, fill).save(OUT + style + "/" + key + ".png")
    print(style, "12 icons ok")

# ---------- 应用图标（192，线性小电视 + DEV） ----------
def app_icon(primary):
    SS2 = 2
    size = 192 * SS2
    # 渐变圆底
    top, bot = lighten(primary, 0.08), darken(primary, 0.10)
    col = Image.new("RGB", (1, size))
    for y in range(size):
        t = y / (size - 1)
        col.putpixel((0, y), tuple(round(top[i] + (bot[i] - top[i]) * t) for i in range(3)))
    grad = col.resize((size, size))
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).ellipse([0, 0, size - 1, size - 1], fill=255)
    b = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    b.paste(grad, (0, 0), mask)
    lay = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    dr = ImageDraw.Draw(lay)
    W = 9 * SS2
    def L(pts, w=W):
        dr.line([(x * SS2, y * SS2) for x, y in pts], fill=WHITE, width=w, joint="curve")
        r = w / 2
        for q in ((pts[0][0] * SS2, pts[0][1] * SS2), (pts[-1][0] * SS2, pts[-1][1] * SS2)):
            dr.ellipse([q[0] - r, q[1] - r, q[0] + r, q[1] + r], fill=WHITE)
    # 天线
    L([(72, 64), (58, 42)]); L([(120, 64), (134, 42)])
    for x, y in ((58, 42), (134, 42)):
        r = 6.5 * SS2
        dr.ellipse([x * SS2 - r, y * SS2 - r, x * SS2 + r, y * SS2 + r], fill=WHITE)
    # 机身
    dr.rounded_rectangle([48 * SS2, 66 * SS2, 144 * SS2, 138 * SS2],
                         radius=20 * SS2, outline=WHITE, width=W)
    # 眼睛
    for x in (79, 113):
        r = 7.5 * SS2
        dr.ellipse([x * SS2 - r, 102 * SS2 - r, x * SS2 + r, 102 * SS2 + r], fill=WHITE)
    b.alpha_composite(lay)
    b = b.resize((192, 192), Image.LANCZOS)
    dr2 = ImageDraw.Draw(b)
    dr2.text((96, 164), "DEV", font=FONT_D, fill=(255, 255, 255, 255), anchor="mm")
    return b

# ---------- banner（365x121，渐变卡 + 白字 + 折线箭头） ----------
def banner(c1, c2):
    SS2 = 2
    w, h = 365 * SS2, 121 * SS2
    g = Image.new("RGB", (w, h))
    px = g.load()
    for y in range(h):
        for x in range(w):
            t = (x / (w - 1) + y / (h - 1)) / 2
            px[x, y] = tuple(round((c1[i] + (c2[i] - c1[i]) * t) * 0.84) for i in range(3))
    mask = Image.new("L", (w, h), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, w - 1, h - 1], radius=16 * SS2, fill=255)
    card = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    card.paste(g, (0, 0), mask)
    dr = ImageDraw.Draw(card)
    dr.text((26 * SS2, 34 * SS2), "Hyperbili Next", font=FONT_T, fill=(255, 255, 255, 255))
    pts = [(322 * SS2, 48 * SS2), (340 * SS2, 60.5 * SS2), (322 * SS2, 73 * SS2)]
    dr.line(pts, fill=(255, 255, 255, 255), width=6 * SS2, joint="curve")
    r = 3 * SS2
    for q in (pts[0], pts[-1]):
        dr.ellipse([q[0] - r, q[1] - r, q[0] + r, q[1] + r], fill=(255, 255, 255, 255))
    return card.resize((365, 121), Image.LANCZOS)

# ---------- 汇总图 ----------
BG = (24, 26, 32)
FG = (200, 205, 215)

def flat(img, bg=BG):
    if img.mode == "RGBA":
        b = Image.new("RGB", img.size, bg)
        b.paste(img, (0, 0), img)
        return b
    return img.convert("RGB")

# A. 线性 vs 面性
PAD, GAP, LBL = 24, 14, 26
cols = len(ICONS)
W = PAD * 2 + cols * BASE + (cols - 1) * GAP
H = PAD + 2 * (LBL + BASE + 22) + PAD
sa = Image.new("RGB", (W, H), BG)
d = ImageDraw.Draw(sa)
for si, (style, cname) in enumerate((("LINE 线性", "line"), ("FILL 面性", "fill"))):
    y0 = PAD + si * (LBL + BASE + 22)
    d.text((PAD, y0), style, fill=FG, font=FONT)
    for j, (key, label, _) in enumerate(ICONS):
        x = PAD + j * (BASE + GAP)
        im = Image.open(OUT + cname + "/" + key + ".png")
        sa.paste(flat(im), (x, y0 + LBL))
        d.text((x + BASE / 2, y0 + LBL + BASE + 3), label, fill=(150, 155, 165),
               font=FONT_S, anchor="ma")
sa.save(OUT + "line_vs_fill.png")
print("line_vs_fill.png", sa.size)

# B. 线性版 × 多主题
THEMES = [
    ("bilibili", "#FF7DA8"), ("neon", "#A78BFA"), ("ocean", "#2E6BFF"),
    ("matrix", "#1FFFA0"), ("honey", "#FFC53D"), ("inferno", "#FF3D3D"),
]
W = PAD * 2 + cols * BASE + (cols - 1) * GAP
H = PAD + len(THEMES) * (LBL + BASE + 10) + PAD
sb = Image.new("RGB", (W, H), BG)
d = ImageDraw.Draw(sb)
for ti, (tname, tc) in enumerate(THEMES):
    y0 = PAD + ti * (LBL + BASE + 10)
    d.text((PAD, y0), tname, fill=FG, font=FONT)
    for j, (key, label, glyph) in enumerate(ICONS):
        x = PAD + j * (BASE + GAP)
        sb.paste(flat(make_icon(hx(tc), glyph, False)), (x, y0 + LBL))
sb.save(OUT + "themes_line.png")
print("themes_line.png", sb.size)

# C. 整体语言：banner + 应用图标（3 主题）
PAIRS = [("bilibili", "#FF7DA8", "#38C8F0"), ("ocean", "#2E6BFF", "#25D5E8"),
         ("matrix", "#1FFFA0", "#12A5FF")]
row_h = max(121, 192) + LBL + 10
sc = Image.new("RGB", (PAD * 2 + 365 + 18 + 192, PAD + len(PAIRS) * row_h + PAD), BG)
d = ImageDraw.Draw(sc)
for i, (tname, c1, c2) in enumerate(PAIRS):
    y0 = PAD + i * row_h
    d.text((PAD, y0), tname, fill=FG, font=FONT)
    y1 = y0 + LBL
    sc.paste(flat(banner(hx(c1), hx(c2))), (PAD, y1))
    sc.paste(flat(app_icon(hx(c1))), (PAD + 365 + 18, y1))
sc.save(OUT + "language.png")
print("language.png", sc.size)

# 存单件
for tname, c1, c2 in PAIRS:
    app_icon(hx(c1)).save(OUT + "appicon_" + tname + ".png")
    banner(hx(c1), hx(c2)).save(OUT + "banner_" + tname + ".png")
print("single files ok")
