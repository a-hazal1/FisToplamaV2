from pathlib import Path
import shutil


# ============================================================
# WEB
# ============================================================

web_dir = Path("web")

source_scanner = Path(
    "scripts/opencv_receipt.js"
)

target_scanner = (
    web_dir / "opencv_receipt.js"
)

source_worker = Path(
    "scripts/opencv_worker.js"
)

target_worker = (
    web_dir / "opencv_worker.js"
)


if web_dir.exists():

    if source_scanner.exists():
        shutil.copy2(
            source_scanner,
            target_scanner,
        )

    if source_worker.exists():
        shutil.copy2(
            source_worker,
            target_worker,
        )


# ============================================================
# ANDROID
# ============================================================

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
            additions += (
                "\n    "
                + permission
            )

    if additions:
        manifest_end = text.find(">")

        if manifest_end != -1:
            text = (
                text[:manifest_end + 1]
                + additions
                + text[manifest_end + 1:]
            )

    manifest.write_text(
        text,
        encoding="utf-8",
    )


# ============================================================
# IOS
# ============================================================

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

    if (
        "NSCameraUsageDescription"
        not in text
    ):
        text = text.replace(
            "</dict>",
            additions
            + "\n</dict>",
        )

    plist.write_text(
        text,
        encoding="utf-8",
    )


# ============================================================
# KONTROL
# ============================================================

print("Platform patch tamamlandı.")

if web_dir.exists():
    print(
        "opencv.js:",
        (web_dir / "opencv.js").exists(),
    )

    print(
        "opencv_receipt.js:",
        target_scanner.exists(),
    )

    print(
        "opencv_worker.js:",
        target_worker.exists(),
    )
