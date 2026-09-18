from pathlib import Path
import shutil

web=Path("web")
idx=web/"index.html"
src=Path("scripts/opencv_receipt.js")
if web.exists() and src.exists(): shutil.copy2(src,web/"opencv_receipt.js")
if idx.exists():
    html=idx.read_text(encoding="utf-8")
    tag='<script src="opencv_receipt.js"></script>'
    html=html.replace(tag,"")
    html=html.replace("</body>",f"  {tag}\n</body>")
    idx.write_text(html,encoding="utf-8")
manifest=Path("android/app/src/main/AndroidManifest.xml")
if manifest.exists():
    t=manifest.read_text(encoding="utf-8")
    perms=['<uses-permission android:name="android.permission.INTERNET" />','<uses-permission android:name="android.permission.CAMERA" />','<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />']
    add=''.join('\n    '+p for p in perms if p not in t)
    if add:
        pos=t.find('>');t=t[:pos+1]+add+t[pos+1:]
    manifest.write_text(t,encoding="utf-8")
plist=Path("ios/Runner/Info.plist")
if plist.exists():
    t=plist.read_text(encoding="utf-8")
    if "NSCameraUsageDescription" not in t:
        add='    <key>NSCameraUsageDescription</key>\n    <string>Fiş fotoğrafı çekmek için kamera erişimi gerekir.</string>\n    <key>NSPhotoLibraryUsageDescription</key>\n    <string>Galeriden fiş seçmek için fotoğraf erişimi gerekir.</string>\n'
        t=t.replace("</dict>",add+"</dict>")
    plist.write_text(t,encoding="utf-8")
