from pathlib import Path

from PIL import Image, ImageDraw


ASSET_DIR = Path(__file__).parents[1] / "public" / "assets" / "islands"
FILES = [ASSET_DIR / f"island-{index:02d}.png" for index in range(1, 13)]
THUMB_SIZE = (384, 240)
PADDING = 24
LABEL_HEIGHT = 34
COLS = 3
ROWS = 4


def checkerboard(size: tuple[int, int], tile: int = 16) -> Image.Image:
    image = Image.new("RGB", size, "#13263b")
    draw = ImageDraw.Draw(image)
    for y in range(0, size[1], tile):
        for x in range(0, size[0], tile):
            if (x // tile + y // tile) % 2:
                draw.rectangle((x, y, x + tile - 1, y + tile - 1), fill="#1b334a")
    return image


cell_width = THUMB_SIZE[0] + PADDING * 2
cell_height = THUMB_SIZE[1] + LABEL_HEIGHT + PADDING * 2
sheet = Image.new("RGB", (cell_width * COLS, cell_height * ROWS), "#06182c")
draw = ImageDraw.Draw(sheet)

for index, path in enumerate(FILES):
    sprite = Image.open(path).convert("RGBA")
    sprite.thumbnail(THUMB_SIZE, Image.Resampling.LANCZOS)
    cell_x = (index % COLS) * cell_width
    cell_y = (index // COLS) * cell_height
    preview = checkerboard(THUMB_SIZE)
    offset = ((THUMB_SIZE[0] - sprite.width) // 2, (THUMB_SIZE[1] - sprite.height) // 2)
    preview.paste(sprite, offset, sprite)
    sheet.paste(preview, (cell_x + PADDING, cell_y + PADDING))
    label = path.stem
    draw.text((cell_x + PADDING, cell_y + PADDING + THUMB_SIZE[1] + 9), label, fill="#f3dfb4")

sheet.save(ASSET_DIR / "islands-contact-sheet.png", optimize=True)

for path in FILES:
    with Image.open(path) as image:
        alpha = image.getchannel("A")
        bounds = alpha.getbbox()
        corners = [alpha.getpixel(point) for point in ((0, 0), (image.width - 1, 0), (0, image.height - 1), (image.width - 1, image.height - 1))]
        assert image.width >= 1024 and image.height >= 640
        assert bounds is not None
        assert corners == [0, 0, 0, 0]
        print(f"{path.name}: {image.width}x{image.height}, RGBA, bounds={bounds}, corners=transparent")
