from pathlib import Path
from collections import deque

import numpy as np
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"


def trim_and_pad(image: Image.Image, size: tuple[int, int], padding: int) -> Image.Image:
    alpha = image.getchannel("A")
    box = alpha.getbbox()
    if box:
        image = image.crop(box)
    max_w, max_h = size[0] - padding * 2, size[1] - padding * 2
    scale = min(max_w / image.width, max_h / image.height)
    resized = image.resize(
        (round(image.width * scale), round(image.height * scale)),
        Image.Resampling.LANCZOS,
    )
    canvas = Image.new("RGBA", size)
    canvas.alpha_composite(
        resized,
        ((size[0] - resized.width) // 2, (size[1] - resized.height) // 2),
    )
    return canvas


def keep_largest_alpha_component(image: Image.Image) -> Image.Image:
    alpha = np.asarray(image.getchannel("A"), dtype=np.uint8).copy()
    mask = alpha > 28
    visited = np.zeros(mask.shape, dtype=bool)
    components: list[list[tuple[int, int]]] = []
    height, width = mask.shape
    for y in range(height):
        for x in range(width):
            if not mask[y, x] or visited[y, x]:
                continue
            queue = deque([(y, x)])
            visited[y, x] = True
            component = []
            while queue:
                cy, cx = queue.popleft()
                component.append((cy, cx))
                for dy, dx in ((-1, -1), (-1, 0), (-1, 1), (0, -1), (0, 1), (1, -1), (1, 0), (1, 1)):
                    ny, nx = cy + dy, cx + dx
                    if 0 <= ny < height and 0 <= nx < width and mask[ny, nx] and not visited[ny, nx]:
                        visited[ny, nx] = True
                        queue.append((ny, nx))
            components.append(component)
    if components:
        largest = max(components, key=len)
        keep = np.zeros(mask.shape, dtype=bool)
        ys, xs = zip(*largest)
        keep[np.asarray(ys), np.asarray(xs)] = True
        alpha[~keep] = 0
        image.putalpha(Image.fromarray(alpha, mode="L"))
    return image


cases = Image.open(ASSETS / "cases.png").convert("RGBA")
case_names = ("recoil", "dreams", "revolution")
for index, name in enumerate(case_names):
    left = round(index * cases.width / 3)
    right = round((index + 1) * cases.width / 3)
    crop = cases.crop((left, 0, right, cases.height))
    trim_and_pad(crop, (720, 540), 22).save(ASSETS / f"case-{name}.webp", quality=92)

weapons = Image.open(ASSETS / "weapons.png").convert("RGBA")
for row in range(3):
    for column in range(4):
        left = round(column * weapons.width / 4)
        right = round((column + 1) * weapons.width / 4)
        top = round(row * weapons.height / 3)
        bottom = round((row + 1) * weapons.height / 3)
        crop = weapons.crop((left, top, right, bottom))
        trim_and_pad(crop, (640, 360), 26).save(
            ASSETS / f"weapon-{row * 4 + column + 1:02d}.webp", quality=92
        )

special_dir = ASSETS / "special"
for collection, kind in (
    ("recoil", "glove"),
    ("dreams", "knife"),
    ("revolution", "glove"),
):
    sheet = Image.open(special_dir / f"{collection}-{'knives' if kind == 'knife' else 'gloves'}.png").convert("RGBA")
    for index in range(6):
        left = round(index * sheet.width / 6)
        right = round((index + 1) * sheet.width / 6)
        crop = sheet.crop((left, 0, right, sheet.height))
        if kind == "knife":
            crop = keep_largest_alpha_component(crop)
        trim_and_pad(crop, (640, 360), 20).save(
            special_dir / f"{collection}-{kind}-{index + 1:02d}.webp", quality=94
        )
