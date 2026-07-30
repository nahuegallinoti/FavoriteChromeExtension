from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont


ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = ROOT / "demo-video-v2"
OUTPUT_DIR = ROOT / "store-assets" / "screenshots"

WIDTH = 1280
HEIGHT = 800
PURPLE = (124, 78, 255)
PURPLE_LIGHT = (168, 139, 255)
WHITE = (250, 250, 255)
MUTED = (180, 181, 205)

SCENES = [
    ("01-dashboard.png", "01-bookmarks.png", "ORGANIZE", "Bookmarks, beautifully sorted."),
    ("02-search.png", "02-search.png", "SEARCH", "Find anything instantly."),
    ("03-duplicates.png", "03-duplicates.png", "CLEAN UP", "Clean duplicates in one click."),
    ("05-multiselect.png", "04-bulk-actions.png", "PRODUCTIVITY", "Select once. Act in bulk."),
    ("08-dark.png", "05-personalize.png", "PERSONALIZE", "Light or dark. English or Spanish."),
]


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    candidates = [
        Path("C:/Windows/Fonts/seguisb.ttf" if bold else "C:/Windows/Fonts/segoeui.ttf"),
        Path("C:/Windows/Fonts/arialbd.ttf" if bold else "C:/Windows/Fonts/arial.ttf"),
    ]
    for candidate in candidates:
        if candidate.exists():
            return ImageFont.truetype(str(candidate), size=size)
    return ImageFont.load_default()


def background() -> Image.Image:
    image = Image.new("RGB", (WIDTH, HEIGHT))
    pixels = image.load()
    for y in range(HEIGHT):
        for x in range(WIDTH):
            diagonal = (x / WIDTH) * 0.55 + (1 - y / HEIGHT) * 0.45
            glow = max(0.0, 1.0 - (((x - 150) / 580) ** 2 + ((y - 40) / 430) ** 2))
            r = int(8 + 18 * diagonal + 28 * glow)
            g = int(8 + 10 * diagonal + 10 * glow)
            b = int(20 + 34 * diagonal + 48 * glow)
            pixels[x, y] = (r, g, b)
    return image


def rounded_screenshot(source: Image.Image) -> Image.Image:
    target_size = (1216, 594)
    screenshot = source.convert("RGB").resize(target_size, Image.Resampling.LANCZOS)

    mask = Image.new("L", target_size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, *target_size), radius=15, fill=255)

    card = Image.new("RGB", target_size, (20, 20, 28))
    card.paste(screenshot, (0, 0), mask)
    return card


def draw_bookmark_logo(draw: ImageDraw.ImageDraw) -> None:
    draw.rounded_rectangle((34, 27, 84, 77), radius=13, fill=PURPLE)
    draw.polygon([(51, 41), (67, 41), (67, 65), (59, 59), (51, 65)], fill=WHITE)


def create_asset(source_name: str, output_name: str, kicker: str, title: str) -> None:
    canvas = background()
    draw = ImageDraw.Draw(canvas)

    draw_bookmark_logo(draw)
    draw.text((101, 29), "Mark My Tabs", font=font(28, bold=True), fill=WHITE)
    draw.text((101, 61), "Chrome bookmark manager", font=font(15), fill=MUTED)

    kicker_font = font(14, bold=True)
    kicker_box = draw.textbbox((0, 0), kicker, font=kicker_font)
    kicker_width = kicker_box[2] - kicker_box[0]
    pill_left = WIDTH - kicker_width - 70
    draw.rounded_rectangle((pill_left, 36, WIDTH - 34, 70), radius=17, fill=(41, 32, 77))
    draw.text((pill_left + 18, 44), kicker, font=kicker_font, fill=PURPLE_LIGHT)

    draw.text((34, 101), title, font=font(38, bold=True), fill=WHITE)

    source = Image.open(SOURCE_DIR / source_name)
    card = rounded_screenshot(source)

    shadow = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
    shadow_draw = ImageDraw.Draw(shadow)
    shadow_draw.rounded_rectangle((26, 177, 1254, 785), radius=20, fill=(0, 0, 0, 145))
    shadow = shadow.filter(ImageFilter.GaussianBlur(16))
    canvas = Image.alpha_composite(canvas.convert("RGBA"), shadow).convert("RGB")
    canvas.paste(card, (32, 174))

    border = ImageDraw.Draw(canvas)
    border.rounded_rectangle((31, 173, 1248, 768), radius=16, outline=(78, 71, 113), width=1)

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    canvas.convert("RGB").save(
        OUTPUT_DIR / output_name,
        format="PNG",
        optimize=True,
    )


for scene in SCENES:
    create_asset(*scene)

print(f"Created {len(SCENES)} screenshots in {OUTPUT_DIR}")
