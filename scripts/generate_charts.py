# -*- coding: utf-8 -*-
import os, sys
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageChops
sys.stdout.reconfigure(encoding='utf-8')

folder = r"D:\fffaa-photo\test-photo"
outdir = r"D:\fffaa-photo\histograms"
os.makedirs(outdir, exist_ok=True)

S = 2                      # supersample factor
W, H = 960, 480
W2, H2 = W*S, H*S
MAXDIM = 1200

BG      = (13, 17, 23)     # deep navy-black
GRID    = (255, 255, 255, 10)
TXT     = (232, 237, 243)
TXT_DIM = (139, 148, 158)
ACCENT  = (88, 166, 255)

_rc = {}
def F(sz, bold=False):
    key = (sz, bold)
    if key in _rc: return _rc[key]
    cands = ([r"C:\Windows\Fonts\msyhbd.ttc", r"C:\Windows\Fonts\msyh.ttc"] if bold
             else [r"C:\Windows\Fonts\msyh.ttc", r"C:\Windows\Fonts\segoeui.ttf"])
    for p in cands:
        try:
            f = ImageFont.truetype(p, sz*S)
            _rc[key] = f
            return f
        except Exception:
            continue
    f = ImageFont.load_default(); _rc[key] = f; return f

def smooth(h, passes=3):
    out = [float(x) for x in h]
    for _ in range(passes):
        new = out[:]
        for i in range(1, len(out)-1):
            new[i] = (out[i-1] + 2*out[i] + out[i+1]) / 4
        out = new
    return out

def new_canvas():
    img = Image.new("RGBA", (W2, H2), BG + (0,))
    mask = Image.new("L", (W2, H2), 0)
    md = ImageDraw.Draw(mask)
    md.rounded_rectangle([0, 0, W2-1, H2-1], radius=18*S, fill=255)
    base = Image.new("RGBA", (W2, H2), BG + (255,))
    canvas = Image.new("RGBA", (W2, H2), (0,0,0,0))
    canvas.paste(base, (0,0), mask)
    d = ImageDraw.Draw(canvas, "RGBA")
    return canvas, d, mask

def header(d, title, subtitle):
    d.text((22*S, 16*S), title, font=F(21, bold=True), fill=TXT)
    f_s = F(13)
    tw = d.textlength(subtitle, font=f_s)
    d.text((W2 - tw - 22*S, 19*S), subtitle, font=f_s, fill=TXT_DIM)

def grid(d):
    for gy in range(46*S, H2-36*S, int((H2-82*S)/5)):
        d.line([(14*S, gy), (W2-14*S, gy)], fill=GRID, width=S)

def gradient_fill(canvas, mask, h, peak, rgb, a_top=120, a_bot=18):
    """smooth area under curve with vertical fade"""
    layer = Image.new("RGBA", (W2, H2), (0,0,0,0))
    ld = ImageDraw.Draw(layer)
    pts = [(0, H2-36*S)]
    n = len(h)
    for i, v in enumerate(h):
        x = i * (W2-28*S) / (n-1) + 14*S
        y = (H2-36*S) - (v/peak) * (H2-100*S)
        pts.append((x, y))
    pts.append((W2-14*S, H2-36*S))
    ld.polygon(pts, fill=rgb + (255,))
    # vertical gradient alpha
    grad = Image.new("L", (1, H2))
    gp = []
    for y in range(H2):
        t = y / (H2-1)
        # alpha higher near curve zone (upper-middle), fading toward axis
        a = int(a_top + (a_bot - a_top) * t)
        gp.append(max(0, a))
    grad.putdata(gp)
    grad = grad.resize((W2, H2))
    area_mask = layer.split()[3]
    area_mask = ImageChops.multiply(area_mask, grad)
    solid = Image.new("RGBA", (W2, H2), rgb + (255,))
    layer = Image.new("RGBA", (W2, H2), (0,0,0,0))
    layer.paste(solid, (0,0), area_mask)
    layer.putalpha(ImageChops.multiply(layer.split()[3], mask))
    canvas.alpha_composite(layer)

def glow_line(canvas, mask, h, peak, rgb, width=2):
    pts = []
    n = len(h)
    for i, v in enumerate(h):
        x = i * (W2-28*S) / (n-1) + 14*S
        y = (H2-36*S) - (v/peak) * (H2-100*S)
        pts.append((x, y))
    line = Image.new("RGBA", (W2, H2), (0,0,0,0))
    ld = ImageDraw.Draw(line)
    ld.line(pts, fill=rgb + (200,), width=width*S*3, joint="curve")
    line = line.filter(ImageFilter.GaussianBlur(4*S))
    line.putalpha(ImageChops.multiply(line.split()[3], mask))
    canvas.alpha_composite(line)
    crisp = Image.new("RGBA", (W2, H2), (0,0,0,0))
    cd = ImageDraw.Draw(crisp)
    cd.line(pts, fill=(min(255, rgb[0]+40), min(255, rgb[1]+40), min(255, rgb[2]+40), 255), width=width*S, joint="curve")
    crisp.putalpha(ImageChops.multiply(crisp.split()[3], mask))
    canvas.alpha_composite(crisp)
    return pts

def xaxis(d, mask):
    f = F(11)
    for i in (0, 64, 128, 192, 255):
        x = 14*S + i * (W2-28*S) / 255
        d.line([(x, H2-34*S), (x, H2-30*S)], fill=(255,255,255,60), width=S)
        tw2 = d.textlength(str(i), font=f)
        d.text((x - tw2/2, H2-27*S), str(i), font=f, fill=TXT_DIM)

def gen_rgb(img, fname):
    canvas, d, mask = new_canvas()
    header(d, "RGB 直方图", fname)
    grid(d)
    rgb = img.convert("RGB")
    hs = [smooth(rgb.getchannel(i).histogram()) for i in range(3)]
    peak = max(max(h) for h in hs) or 1
    for h, col in zip(hs, [(255,77,79),(69,214,91),(74,144,255)]):
        gradient_fill(canvas, mask, h, peak, col)
    for h, col in zip(hs, [(255,107,107),(81,227,115),(105,167,255)]):
        glow_line(canvas, mask, h, peak, col)
    xaxis(d, Image.new("L", (W2,H2), 255))
    # legend chips
    lx = 22*S
    for name, col in zip(["R 红", "G 绿", "B 蓝"], [(255,107,107),(81,227,115),(105,167,255)]):
        d.rounded_rectangle([lx, 40*S, lx+14*S, 54*S], radius=4*S, fill=col+(255,))
        d.text((lx+20*S, 41*S), name, font=F(13), fill=TXT)
        lx += int((34 + d.textlength(name, font=F(13)))*1.2)
    return canvas

def gen_luma(img, fname):
    canvas, d, mask = new_canvas()
    header(d, "亮度直方图", fname)
    grid(d)
    h = smooth(img.convert("L").histogram())
    peak = max(h) or 1
    gradient_fill(canvas, mask, h, peak, (210, 215, 225), a_top=100, a_bot=14)
    glow_line(canvas, mask, h, peak, (225, 228, 235))
    xaxis(d, Image.new("L", (W2,H2), 255))
    f = F(12)
    d.text((22*S, 40*S), "0 全黑", font=f, fill=TXT_DIM)
    tw3 = d.textlength("255 全白", font=f)
    d.text((W2 - tw3 - 22*S, 40*S), "255 全白", font=f, fill=TXT_DIM)
    return canvas

def gen_palette(img, fname, n=8):
    ch, info_h = 150, 66
    W3, H3 = W, ch + 78
    img3 = Image.new("RGBA", (W3*S, H3*S), (0,0,0,0))
    mask3 = Image.new("L", (W3*S, H3*S), 0)
    md = ImageDraw.Draw(mask3)
    md.rounded_rectangle([0, 0, W3*S-1, H3*S-1], radius=18*S, fill=255)
    base = Image.new("RGBA", (W3*S, H3*S), BG + (255,))
    img3.paste(base, (0,0), mask3)
    d = ImageDraw.Draw(img3, "RGBA")
    header(d, "主色色板", fname)
    rgb = img.convert("RGB")
    small = rgb.copy(); small.thumbnail((160, 160))
    q = small.quantize(colors=n, method=Image.MEDIANCUT, dither=Image.NONE)
    pal = q.getpalette()
    counts = sorted(q.getcolors(160*160), reverse=True)
    total = sum(c for c, _ in counts)
    gap = 8
    bw = (W - 44 - gap*(n-1)) // n
    for i, (cnt, idx) in enumerate(counts[:n]):
        r, g, b = pal[idx*3], pal[idx*3+1], pal[idx*3+2]
        pct = cnt/total*100
        x0 = (22 + i*(bw+gap)) * S
        y0 = 52 * S
        card = Image.new("RGBA", (bw*S, (ch)*S), (0,0,0,0))
        cd = ImageDraw.Draw(card)
        cd.rounded_rectangle([0, 0, bw*S-1, ch*S-1], radius=10*S, fill=(r,g,b,255))
        # subtle top highlight
        hl = Image.new("RGBA", (bw*S, ch*S), (0,0,0,0))
        hd = ImageDraw.Draw(hl)
        hd.rounded_rectangle([0, 0, bw*S-1, ch*S-1], radius=10*S, outline=(255,255,255,26), width=S)
        card.alpha_composite(hl)
        lum = 0.299*r + 0.587*g + 0.114*b
        tc = (16,18,22) if lum > 140 else (244,246,248)
        cd.text((8*S, 8*S), "#%02X%02X%02X" % (r,g,b), font=F(13, bold=True), fill=tc)
        cd.text((8*S, 30*S), "%.1f%%" % pct, font=F(12), fill=tc)
        img3.alpha_composite(card, (int(x0), int(y0)))
    return img3

for fname in sorted(os.listdir(folder)):
    path = os.path.join(folder, fname)
    if os.path.splitext(fname)[1].lower() not in (".jpg", ".jpeg", ".png"):
        continue
    try:
        img = Image.open(path); img.load()
    except Exception as e:
        print("skip", fname, e); continue
    base = os.path.splitext(fname)[0][:40]
    if max(img.size) > MAXDIM:
        img = img.copy(); img.thumbnail((MAXDIM, MAXDIM))
    for gen, tag in [(gen_rgb, "rgb"), (gen_luma, "luma"), (gen_palette, "pal")]:
        out = gen(img, fname)
        out = out.resize((out.width // S, out.height // S), Image.LANCZOS)
        out.save(os.path.join(outdir, f"{tag}_{base}.png"))
    print("done:", base)
