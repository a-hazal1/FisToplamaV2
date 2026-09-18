from pathlib import Path
import shutil

manifest = Path("android/app/src/main/AndroidManifest.xml")
if manifest.exists():
    text = manifest.read_text(encoding="utf-8")
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
        text = text[:pos + 1] + additions + text[pos + 1:]
    manifest.write_text(text, encoding="utf-8")

plist = Path("ios/Runner/Info.plist")
if plist.exists():
    text = plist.read_text(encoding="utf-8")
    additions = (
        "    <key>NSCameraUsageDescription</key>\n"
        "    <string>Fiş fotoğrafı çekmek için kamera erişimi gerekir.</string>\n"
        "    <key>NSPhotoLibraryUsageDescription</key>\n"
        "    <string>Galeriden fiş seçmek için fotoğraf erişimi gerekir.</string>\n"
    )
    if "NSCameraUsageDescription" not in text:
        text = text.replace("</dict>", additions + "</dict>")
    plist.write_text(text, encoding="utf-8")

web_dir = Path("web")
web_index = web_dir / "index.html"
source_js = Path("scripts/opencv_receipt.js")
target_js = web_dir / "opencv_receipt.js"

if web_dir.exists() and source_js.exists():
    shutil.copy2(source_js, target_js)

if web_index.exists():
    html = web_index.read_text(encoding="utf-8")
    tag = '<script src="opencv_receipt.js"></script>'
    if tag not in html:
        html = html.replace("</body>", "  " + tag + "\n</body>")
    web_index.write_text(html, encoding="utf-8")
