# Copyright (C) 2026 Brian Muenzenmeyer
# SPDX-License-Identifier: GPL-3.0-or-later
"""Render the Six Shooter cylinder to PNG at several sizes, no dependencies."""
import math
import os
import struct
import zlib

BRASS = (201, 162, 39, 255)
DARK = (31, 33, 38, 255)
CLEAR = (0, 0, 0, 0)

OUT = "/Users/megan/Documents/six-shooter-chrome-extension/icons"


def sample(x, y, size):
    """Colour at normalized point (x, y) in [0,1]^2."""
    # At 16px a dark body leaves the brass chambers and the brass rim only a
    # sub-pixel gap apart, and they smear into a star. Flipping figure and
    # ground -- dark chambers punched out of a solid brass disc -- keeps six
    # countable holes. Verified by rendering at 10x.
    small = size <= 16
    chamber_r = 0.098
    ring_r = 0.275 if small else 0.265
    rim_inner = 0.400 if small else 0.415

    r = math.hypot(x - 0.5, y - 0.5)
    if r > 0.48:
        return CLEAR
    if r > rim_inner:
        return BRASS  # rim

    body, hole = (BRASS, DARK) if small else (DARK, BRASS)

    for i in range(6):
        a = math.radians(-90 + i * 60)
        cx, cy = 0.5 + ring_r * math.cos(a), 0.5 + ring_r * math.sin(a)
        if math.hypot(x - cx, y - cy) <= chamber_r:
            return hole

    if not small and r <= 0.06:
        return BRASS  # center hub
    return body


def render(size, ss=8):
    rows = []
    for py in range(size):
        row = bytearray()
        for px in range(size):
            acc_r = acc_g = acc_b = acc_a = 0.0
            for sy in range(ss):
                for sx in range(ss):
                    x = (px + (sx + 0.5) / ss) / size
                    y = (py + (sy + 0.5) / ss) / size
                    r, g, b, a = sample(x, y, size)
                    af = a / 255.0
                    acc_r += r * af
                    acc_g += g * af
                    acc_b += b * af
                    acc_a += af
            n = ss * ss
            alpha = acc_a / n
            if alpha > 0:
                # un-premultiply back to straight alpha
                cr = acc_r / n / alpha
                cg = acc_g / n / alpha
                cb = acc_b / n / alpha
            else:
                cr = cg = cb = 0.0
            row += bytes(
                (
                    int(round(cr)),
                    int(round(cg)),
                    int(round(cb)),
                    int(round(alpha * 255)),
                )
            )
        rows.append(bytes(row))
    return rows


def chunk(tag, data):
    return (
        struct.pack(">I", len(data))
        + tag
        + data
        + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
    )


def write_png(path, size):
    rows = render(size)
    raw = b"".join(b"\x00" + r for r in rows)
    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(raw, 9))
    png += chunk(b"IEND", b"")
    with open(path, "wb") as f:
        f.write(png)
    print(f"{path}  {size}x{size}  {len(png)} bytes")


os.makedirs(OUT, exist_ok=True)
for s in (16, 32, 48, 128):
    write_png(os.path.join(OUT, f"icon{s}.png"), s)
