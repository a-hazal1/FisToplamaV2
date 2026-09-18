from pathlib import Path
import shutil

web_dir = Path("web")
web_index = web_dir / "index.html"

source_scanner = Path("scripts/opencv_receipt.js")
target_scanner = web_dir / "opencv_receipt.js"

if web_dir.exists() and source_scanner.exists():
    shutil.copy2(
        source_scanner,
        target_scanner,
    )

if web_index.exists():
    html = web_index.read_text(
        encoding="utf-8"
    )

    # Daha önce eklenen eski scanner/OpenCV scriptlerini temizle
    html = html.replace(
        '<script src="opencv_receipt.js"></script>',
        '',
    )

    html = html.replace(
        '<script src="opencv.js"></script>',
        '',
    )

    # Önce yerel OpenCV, sonra bizim scanner
    scripts = """
  <script src="opencv.js"></script>
  <script src="opencv_receipt.js"></script>
"""

    html = html.replace(
        "</body>",
        scripts + "\n</body>",
    )

    web_index.write_text(
        html,
        encoding="utf-8",
    )


# -----------------------------
# ANDROID
# -----------------------------

manifest = Path(
    "android/app/src/main/AndroidManifest.xml"
)

if manifest.exists():
    text = manifest.read_text(
        encoding="utf-8"
    )

    permissions = [
        '<uses-permission android:name="android.permission.INTERNET" />',
        '<uses-permission android:name="android.permission.CAMERA" />',
        '<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />',
    ]

    additions = ""

    for permission in permissions:
        if permission not in text:
            additions += "\n    " + permission

    if additions:
        pos = text.find(">")

        text = (
            text[:pos + 1]
            + additions
            + text[pos + 1:]
        )

    manifest.write_text(
        text,
        encoding="utf-8",
    )


# -----------------------------
# IOS
# -----------------------------

plist = Path(
    "ios/Runner/Info.plist"
)

if plist.exists():
    text = plist.read_text(
        encoding="utf-8"
    )

    additions = """
    <key>NSCameraUsageDescription</key>
    <string>Fiş fotoğrafı çekmek için kamera erişimi gerekir.</string>

    <key>NSPhotoLibraryUsageDescription</key>
    <string>Galeriden fiş seçmek için fotoğraf erişimi gerekir.</string>
"""

    if "NSCameraUsageDescription" not in text:
        text = text.replace(
            "</dict>",
            additions + "\n</dict>",
        )

    plist.write_text(
        text,
        encoding="utf-8",
    )
