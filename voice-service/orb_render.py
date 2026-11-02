r"""
orb_render.py - draws the corner reactor: a translucent glowing sphere with a living web of
cells (the same look as the big reactor), an inner lattice, a white-hot core, drifting dust
and a soft bloom. It produces an image with a real alpha channel, so the glow fades smoothly
into whatever is behind it (a white web page, a dark video, anything).

Pure numpy + Pillow; no GPU needed. One frame takes about 15-25 ms.
"""
import math
import os

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

WHITE = np.array([1.0, 1.0, 1.0], dtype=np.float32)


def _unit_vectors(n, seed):
    v = np.random.default_rng(seed).normal(size=(n, 3)).astype(np.float32)
    return v / np.linalg.norm(v, axis=1, keepdims=True)


def _rot_y(a):
    c, s = math.cos(a), math.sin(a)
    return np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]], dtype=np.float32)


def _rot_x(a):
    c, s = math.cos(a), math.sin(a)
    return np.array([[1, 0, 0], [0, c, -s], [0, s, c]], dtype=np.float32)


def _rot_z(a):
    c, s = math.cos(a), math.sin(a)
    return np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]], dtype=np.float32)


def _find_font(size):
    for path in (r"C:\Windows\Fonts\segoeuib.ttf", r"C:\Windows\Fonts\segoeui.ttf", r"C:\Windows\Fonts\arial.ttf",
                 "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"):
        if os.path.exists(path):
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


class OrbRenderer:
    def __init__(self, size=240, quality=2):
        self.S = size
        self.q = quality                        # the sphere web is computed at 1/q resolution (then smoothed up)
        self.R = size * 0.30                    # sphere radius in pixels
        self.cx = size / 2
        self.cy = size / 2 - size * 0.04
        s = size
        ys, xs = np.mgrid[0:s, 0:s].astype(np.float32)
        self.X = (xs - self.cx) / self.R
        self.Y = (ys - self.cy) / self.R
        self.R2 = self.X ** 2 + self.Y ** 2     # full-resolution radius map (core glow)

        # half-resolution sphere points (the cell web lives here)
        sm = s // quality
        ys2, xs2 = np.mgrid[0:sm, 0:sm].astype(np.float32)
        X2 = (xs2 + 0.5) * quality
        Y2 = (ys2 + 0.5) * quality
        self.small = sm
        x = (X2 - self.cx) / self.R
        y = (Y2 - self.cy) / self.R
        r2 = x * x + y * y
        self.inside = r2 <= 1.0
        zz = np.sqrt(np.clip(1 - r2, 0, 1))
        self.P = np.stack([x[self.inside], y[self.inside], zz[self.inside]], axis=1)       # N x 3 points on the front of the sphere
        self.z = zz[self.inside]
        self.fres = (1 - self.z) ** 2.3
        # inner sphere (radius 0.62)
        xi, yi = x / 0.62, y / 0.62
        r2i = xi * xi + yi * yi
        self.inside_i = r2i <= 1.0
        zi = np.sqrt(np.clip(1 - r2i, 0, 1))
        self.Pi = np.stack([xi[self.inside_i], yi[self.inside_i], zi[self.inside_i]], axis=1)
        self.zi = zi[self.inside_i]

        self.sites_outer = _unit_vectors(70, 11)
        self.sites_inner = _unit_vectors(44, 23)

        # dust
        rng = np.random.default_rng(5)
        self.dust = [(rng.uniform(0, math.tau), rng.uniform(1.14, 1.62), rng.uniform(0.12, 0.5) * rng.choice((-1, 1)),
                      rng.uniform(0.6, 1.5), rng.uniform(0, math.tau), rng.uniform(-0.25, 0.25)) for _ in range(46)]
        self.stamp = self._stamp(4)
        self.font = _find_font(max(10, size // 22))
        self.base = (-int(s * 0.5), 0)

    @staticmethod
    def _stamp(r):
        yy, xx = np.mgrid[-r:r + 1, -r:r + 1].astype(np.float32)
        return np.exp(-(xx * xx + yy * yy) / (0.55 * r * r)).astype(np.float32)

    # ------------------------------------------------------------------ web
    def _web(self, P, sites, rot, widths=(0.030, 0.13)):
        """Voronoi cell walls on a sphere: bright thin lines (web) and a soft halo around them (soft)."""
        d = (P @ rot.T) @ sites.T                          # similarity to every cell centre
        top2 = np.partition(d, -2, axis=1)[:, -2:]
        edge = top2.max(axis=1) - top2.min(axis=1)         # ~0 on a cell wall
        web = np.exp(-(edge / widths[0]) ** 2)
        soft = np.exp(-(edge / widths[1]) ** 2)
        return web.astype(np.float32), soft.astype(np.float32)

    def _layer(self, reactor):
        """Sphere emission (small resolution) -> float RGB image (full resolution)."""
        sm = self.small
        col = np.array(reactor.color, dtype=np.float32) / 255.0
        light = col * 0.80 + WHITE * 0.20
        spin, surge = reactor.spin, reactor.surge
        boost = 1.0 + 0.7 * surge

        img = np.zeros((sm, sm, 3), dtype=np.float32)

        # --- outer shell: front cells, back cells (seen through the glass), rim light
        Ro = _rot_y(spin * 0.9) @ _rot_x(spin * 0.35)
        web, soft = self._web(self.P, self.sites_outer, Ro)
        back = self.P * np.array([1, 1, -1], dtype=np.float32)
        webb, softb = self._web(back, self.sites_outer, Ro)
        fres = self.fres[:, None]
        e = (col * (0.025 + 0.10 * soft[:, None] + 0.50 * fres)
             + light * (0.50 * web[:, None])
             + col * (0.03 * softb[:, None]) + light * (0.13 * webb[:, None])) * boost
        img[self.inside] += e

        # --- inner lattice (turns the other way, smaller, finer)
        Ri = _rot_y(-spin * 1.35) @ _rot_z(spin * 0.55)
        webi, softi = self._web(self.Pi, self.sites_inner, Ri, widths=(0.034, 0.15))
        ei = (col * (0.02 + 0.10 * softi[:, None]) + light * (0.42 * webi[:, None]) + col * (0.12 * ((1 - self.zi) ** 2)[:, None])) * (0.85 * boost)
        img[self.inside_i] += ei

        im = Image.fromarray(np.clip(img * 255, 0, 255).astype(np.uint8), "RGB").resize((self.S, self.S), Image.BILINEAR)
        return np.asarray(im, dtype=np.float32) / 255.0

    def _scale_about_center(self, arr, scale):
        if abs(scale - 1.0) < 0.004:
            return arr
        im = Image.fromarray(np.clip(arr * 255, 0, 255).astype(np.uint8), "RGB")
        cx, cy = self.cx, self.cy
        inv = 1.0 / scale
        out = im.transform(im.size, Image.AFFINE, (inv, 0, cx - inv * cx, 0, inv, cy - inv * cy), resample=Image.BILINEAR)
        return np.asarray(out, dtype=np.float32) / 255.0

    # ------------------------------------------------------------------ frame
    def render(self, reactor, label="", live=False):
        """-> float RGBA image (H, W, 4), premultiplied alpha, values 0..1"""
        S = self.S
        appear = float(min(1.0, max(0.0, reactor.appear)))
        beat = math.sin(reactor.pulse) * reactor.amp
        col = np.array(reactor.color, dtype=np.float32) / 255.0
        light = col * 0.74 + WHITE * 0.26
        surge = reactor.surge

        body = self._layer(reactor)
        edge = np.clip((1.0 - np.sqrt(self.R2)) * self.R / 2.5, 0, 1)        # soft 2.5 px rim at full resolution
        body = body * (edge * edge * (3 - 2 * edge))[..., None]

        # core: white-hot centre + tinted halo
        r2 = self.R2 / max(1e-3, (1 + beat * 2.2 + surge * 0.35)) ** 2
        core = (WHITE * np.exp(-r2 * 95)[..., None] * 1.1
                + light * np.exp(-r2 * 22)[..., None] * 0.55
                + col * np.exp(-r2 * 5.0)[..., None] * 0.16) * (1 + 0.5 * surge)
        E = body + core

        # breathing + appearing: scale the whole sphere about its centre
        E = self._scale_about_center(E, (1 + beat) * (0.55 + 0.45 * appear))

        # dust drifting around the sphere
        stamp = self.stamp
        r = (stamp.shape[0] - 1) // 2
        for ang, rad, spd, size, tw, tilt in self.dust:
            a = ang + reactor.spin * spd
            dist = self.R * rad * (1 + beat * 0.6 + surge * 0.12) * (0.55 + 0.45 * appear)
            px = int(round(self.cx + dist * math.cos(a)))
            py = int(round(self.cy + dist * (math.sin(a) * 0.92 + tilt)))
            if r <= px < S - r and r <= py < S - r:
                b = size * (0.55 + 0.45 * math.sin(reactor.pulse * 0.8 + tw))
                E[py - r:py + r + 1, px - r:px + r + 1] += stamp[..., None] * light * b * 0.75

        # bloom: blurred copies of the light, added back
        base = Image.fromarray(np.clip(E * 255, 0, 255).astype(np.uint8), "RGB")
        b1 = np.asarray(base.filter(ImageFilter.GaussianBlur(S * 0.022)), dtype=np.float32) / 255.0
        b2 = np.asarray(base.filter(ImageFilter.GaussianBlur(S * 0.060)), dtype=np.float32) / 255.0
        E = E + 0.38 * b1 + 0.36 * b2
        E = 1.0 - np.exp(-E * 1.35)                                         # soft shoulder: no flat white

        # light -> transparency: bright = opaque, faint glow = see-through
        a = np.clip(E.max(axis=2) * 1.05, 0, 1)
        rgb = np.minimum(np.clip(E, 0, 1), a[..., None])

        # a faint dark "glass" inside the sphere: the glowing web then reads clearly on a white web page too
        scale = (1 + beat) * (0.55 + 0.45 * appear)
        rim = np.clip((1.0 - np.sqrt(self.R2) / scale) * self.R / 2.5, 0, 1)
        glass_a = 0.58 * rim * rim * (3 - 2 * rim) * (0.65 + 0.35 * np.clip(1.0 - self.R2 / (scale * scale), 0, 1))
        glass_rgb = np.array([0.02, 0.035, 0.085], dtype=np.float32)
        rgb = rgb + glass_rgb * glass_a[..., None] * (1 - a[..., None])
        a = a + glass_a * (1 - a)

        a *= appear
        rgb *= appear
        out = np.concatenate([rgb, a[..., None]], axis=2)

        # label under the sphere
        if label:
            text = ("LIVE  " if live else "") + label
            layer = Image.new("RGBA", (S, S), (0, 0, 0, 0))
            d = ImageDraw.Draw(layer)
            w = d.textlength(text, font=self.font)
            tint = tuple(int(255 * v) for v in light)
            d.text(((S - w) / 2, S - self.font.size * 1.9), text, font=self.font, fill=tint + (int(240 * appear),),
                   stroke_width=2, stroke_fill=(8, 14, 30, int(210 * appear)))      # dark outline: readable on a white page too
            t = np.asarray(layer, dtype=np.float32) / 255.0
            ta = t[..., 3:4]
            out[..., :3] = t[..., :3] * ta + out[..., :3] * (1 - ta)
            out[..., 3:4] = ta + out[..., 3:4] * (1 - ta)
            out[..., :3] = np.minimum(out[..., :3], out[..., 3:4])
        return out


def to_bgra_premultiplied(rgba):
    """float RGBA (premultiplied) -> contiguous uint8 BGRA bytes for a Windows layered window"""
    u8 = np.clip(rgba * 255.0 + 0.5, 0, 255).astype(np.uint8)
    return np.ascontiguousarray(u8[..., [2, 1, 0, 3]])


def to_pil(rgba):
    """premultiplied float RGBA -> straight-alpha PIL image (for previews / tests)"""
    a = rgba[..., 3:4]
    rgb = np.where(a > 1e-4, rgba[..., :3] / np.maximum(a, 1e-4), 0)
    return Image.fromarray(np.clip(np.concatenate([rgb, a], axis=2) * 255, 0, 255).astype(np.uint8), "RGBA")
