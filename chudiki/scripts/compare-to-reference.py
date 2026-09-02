#!/usr/bin/env python3
"""Measure a render against the reference painting.

    python3 scripts/compare-to-reference.py <render.png> [--out side-by-side.png]

Reports the luminance percentiles and mean saturation that the Blender grade was
fitted against, so a browser screenshot can be judged by the same numbers rather
than by eye. Both images are compared on their own terms: absolute percentiles,
not a pixel diff, because the composition is deliberately not identical.
"""
from __future__ import annotations

import argparse
import os

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
REFERENCE = os.path.normpath(os.path.join(HERE, "../../handoff/evidence/reference-frame.png"))

LUMA = np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)


def local_detail(lum: np.ndarray, radius: int = 4) -> float:
    """Mean deviation from a box blur: how much fine texture the image carries.

    The reference is a painting and reads smoother than a render, so this is the
    number that catches "too crunchy" even when the histogram already matches.
    """
    padded = np.pad(lum, radius, mode="edge")
    cumulative = padded.cumsum(axis=0)
    band = cumulative[2 * radius :] - cumulative[: -2 * radius]
    cumulative = band.cumsum(axis=1)
    blur = (cumulative[:, 2 * radius :] - cumulative[:, : -2 * radius]) / (2 * radius) ** 2
    return float(np.abs(lum - blur[: lum.shape[0], : lum.shape[1]]).mean())


def metrics(rgb: np.ndarray) -> dict[str, float]:
    """Luminance spread and colourfulness of an sRGB image in 0..1."""
    lum = rgb @ LUMA
    hi = rgb.max(axis=2)
    lo = rgb.min(axis=2)
    saturation = np.where(hi > 1e-4, (hi - lo) / np.maximum(hi, 1e-4), 0.0)

    p05, p25, med, p75, p95 = np.percentile(lum, [5, 25, 50, 75, 95])
    detail = local_detail(lum)
    return {
        "p05": float(p05),
        "p25": float(p25),
        "med": float(med),
        "p75": float(p75),
        "p95": float(p95),
        "sat": float(saturation.mean()),
        "detail": detail,
    }


def load(path: str, crop_bottom: float = 0.0) -> np.ndarray:
    image = Image.open(path).convert("RGB")
    if crop_bottom > 0:
        width, height = image.size
        image = image.crop((0, 0, width, int(height * (1 - crop_bottom))))
    return np.ascontiguousarray(np.asarray(image, dtype=np.float32) / 255.0)


def side_by_side(reference: str, render: str, out: str) -> None:
    top = Image.open(reference).convert("RGB")
    bottom = Image.open(render).convert("RGB")
    width = min(top.width, bottom.width)
    top = top.resize((width, round(top.height * width / top.width)), Image.LANCZOS)
    bottom = bottom.resize((width, round(bottom.height * width / bottom.width)), Image.LANCZOS)

    canvas = Image.new("RGB", (width, top.height + bottom.height + 8), (10, 10, 12))
    canvas.paste(top, (0, 0))
    canvas.paste(bottom, (0, top.height + 8))
    os.makedirs(os.path.dirname(out), exist_ok=True)
    canvas.save(out)
    print(f"wrote {out}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("render")
    parser.add_argument("--reference", default=REFERENCE)
    parser.add_argument("--out", default="")
    parser.add_argument(
        "--crop-bottom",
        type=float,
        default=0.12,
        help="fraction of the render to drop, so the on-screen UI buttons do not skew the stats",
    )
    args = parser.parse_args()

    ref = metrics(load(args.reference))
    got = metrics(load(args.render, args.crop_bottom))

    keys = ["p05", "p25", "med", "p75", "p95", "sat", "detail"]
    print(f"{'':10s}" + "".join(f"{k:>9s}" for k in keys))
    print(f"{'reference':10s}" + "".join(f"{ref[k]:9.3f}" for k in keys))
    print(f"{'render':10s}" + "".join(f"{got[k]:9.3f}" for k in keys))
    print(f"{'delta':10s}" + "".join(f"{got[k] - ref[k]:+9.3f}" for k in keys))

    if args.out:
        side_by_side(args.reference, args.render, args.out)


if __name__ == "__main__":
    main()
