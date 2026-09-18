from pathlib import Path
import shutil

web_dir = Path("web")
web_index = web_dir / "index.html"

source_js = Path(
    "scripts/opencv_receipt.js"
)

target_js = (
    web_dir /
    "opencv_receipt.js"
)

if (
    web_dir.exists()
    and source_js.exists()
):
    shutil.copy2(
        source_js,
        target_js
    )

if web_index.exists():
    html = web_index.read_text(
        encoding="utf-8"
    )

    tag = (
        '<script '
        'src="opencv_receipt.js">'
        '</script>'
    )

    if tag not in html:
        html = html.replace(
            "</body>",
            "  "
            + tag
            + "\n</body>",
        )

    web_index.write_text(
        html,
        encoding="utf-8"
    )
