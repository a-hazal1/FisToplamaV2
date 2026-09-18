from pathlib import Path
import shutil


# ============================================================
# WEB
# ============================================================

web_dir = Path("web")
web_index = web_dir / "index.html"

source_scanner = Path("scripts/opencv_receipt.js")
target_scanner = web_dir / "opencv_receipt.js"

source_worker = Path("scripts/opencv_worker.js")
target_worker = web_dir / "opencv_worker.js"


# Flutter create ile web klasörü oluşturulduktan sonra
# scanner bridge dosyasını web içine kopyala.
if web_dir.exists() and source_scanner.exists():
    shutil.copy2(
        source_scanner,
        target_scanner,
    )


# OpenCV Worker dosyasını web içine kopyala.
if web_dir.exists() and source_worker.exists():
    shutil.copy2(
        source_worker,
        target_worker,
    )


# index.html içerisine yalnızca küçük scanner bridge dosyasını ekle.
# opencv.js burada doğrudan çalıştırılmıyor.
# opencv_worker.js kendi Worker ortamında opencv.js dosyasını yükleyecek.
if web_index.exists():
    html = web_index.read_text(
        encoding="utf-8"
    )

    scanner_tag = '<script src="opencv_receipt.js"></script>'

    # Önceden eklenmiş scanner etiketlerini temizle.
    html = html.replace(
        scanner_tag,
        "",
    )

    # Daha önceki denemelerden kalabilecek OpenCV scriptlerini temizle.
    html = html.replace(
        '<script src="opencv.js"></script>',
        "",
    )

    html = html.replace(
        '<script defer src="opencv.js"></script>',
        "",
    )

    html = html.replace(
        '<script async src="opencv.js"></script>',
        "",
    )

    html = html.replace(
        '<script src="https://docs.opencv.org/4.x/opencv.js"></script>',
        "",
    )

    html = html.replace(
        '<script src="https://docs.opencv.org/4.10.0/opencv.js"></script>',
        "",
    )

    # Scanner bridge'i body kapanmadan hemen önce ekle.
    html = html.replace(
        "</body>",
        f"  {scanner_tag}\n</body>",
    )

    web_index.write_text(
        html,
        encoding="utf-8",
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
        # AndroidManifest.xml içindeki ilk <manifest ...> etiketinin
        # kapanışından hemen sonra permission satırlarını ekler.
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

    if "NSCameraUsageDescription" not in text:
        text = text.replace(
            "</dict>",
            additions + "\n</dict>",
        )

    plist.write_text(
        text,
        encoding="utf-8",
    )


# ============================================================
# BUILD DEBUG BİLGİSİ
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
