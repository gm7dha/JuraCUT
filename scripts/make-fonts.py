#!/usr/bin/env python3
"""
Turns the font files JuraCUT ships into compact outline JSON (src/geometry/fonts/*.json).

Each glyph is kept as drawing commands in font units: "m x y" (move), "l x y" (line),
"q cx cy x y" (quadratic curve), "c x1 y1 x2 y2 x y" (cubic curve) and "z" (close).
Only the characters most people type are kept (basic Latin, Latin-1 letters and
symbols, a few typographic marks), so each file stays small.

Needs fontTools (pip install fonttools). Run from the repository root:

    python3 scripts/make-fonts.py /path/to/Inter-Regular.otf inter-regular "Inter Regular"

The fonts shipped (all under the SIL Open Font License, see src/geometry/fonts/LICENSE.md):
Inter Regular and Bold, Poppins Regular and Bold, Lora Regular.
"""
import json
import sys

from fontTools.pens.basePen import BasePen
from fontTools.pens.boundsPen import BoundsPen
from fontTools.ttLib import TTFont

# Characters kept: printable ASCII, Latin-1 Supplement, and some typographic marks.
KEEP = [chr(c) for c in range(0x20, 0x7F)] + [chr(c) for c in range(0xA0, 0x100)] + list("‘’“”–—…•€£™°±×÷")


class Pen(BasePen):
    def __init__(self, glyphSet):
        super().__init__(glyphSet)
        self.cmds = []

    def n(self, v):
        v = round(v, 1)
        return str(int(v)) if v == int(v) else str(v)

    def _moveTo(self, p):
        self.cmds.append(f"m {self.n(p[0])} {self.n(p[1])}")

    def _lineTo(self, p):
        self.cmds.append(f"l {self.n(p[0])} {self.n(p[1])}")

    def _curveToOne(self, p1, p2, p3):
        self.cmds.append(f"c {self.n(p1[0])} {self.n(p1[1])} {self.n(p2[0])} {self.n(p2[1])} {self.n(p3[0])} {self.n(p3[1])}")

    def _qCurveToOne(self, p1, p2):
        self.cmds.append(f"q {self.n(p1[0])} {self.n(p1[1])} {self.n(p2[0])} {self.n(p2[1])}")

    def _closePath(self):
        self.cmds.append("z")

    def _endPath(self):
        self.cmds.append("z")


def convert(path, out_id, label):
    font = TTFont(path)
    cmap = font.getBestCmap()
    glyph_set = font.getGlyphSet()
    hmtx = font["hmtx"]
    os2 = font["OS/2"]
    upem = font["head"].unitsPerEm
    glyphs = {}
    for ch in KEEP:
        name = cmap.get(ord(ch))
        if not name:
            continue
        pen = Pen(glyph_set)
        glyph_set[name].draw(pen)
        glyphs[ch] = {"a": hmtx[name][0], "o": " ".join(pen.cmds)}
    # The height of a capital letter: measured from the H itself, so "20 mm letters" are 20 mm tall.
    cap = getattr(os2, "sCapHeight", 0) or 0
    if ord("H") in cmap:
        bp = BoundsPen(glyph_set)
        glyph_set[cmap[ord("H")]].draw(bp)
        if bp.bounds:
            cap = bp.bounds[3] - bp.bounds[1]
    x_height = getattr(os2, "sxHeight", 0) or 0
    data = {
        "id": out_id,
        "label": label,
        "unitsPerEm": upem,
        "ascender": font["hhea"].ascent,
        "descender": font["hhea"].descent,
        "capHeight": cap,
        "xHeight": x_height,
        "glyphs": glyphs,
    }
    out = f"src/geometry/fonts/{out_id}.json"
    with open(out, "w") as f:
        json.dump(data, f, separators=(",", ":"), ensure_ascii=False)
    print(f"{out}: {len(glyphs)} glyphs, {sum(len(g['o']) for g in glyphs.values()) // 1024} KB of outlines")


if __name__ == "__main__":
    if len(sys.argv) != 4:
        print(__doc__)
        sys.exit(1)
    convert(sys.argv[1], sys.argv[2], sys.argv[3])
