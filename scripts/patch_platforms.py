from pathlib import Path
m=Path('android/app/src/main/AndroidManifest.xml')
if m.exists():
    t=m.read_text(encoding='utf-8'); p='<uses-permission android:name="android.permission.CAMERA" />'
    if p not in t:
        i=t.find('>'); t=t[:i+1]+'\n    '+p+t[i+1:]
    m.write_text(t,encoding='utf-8')
p=Path('ios/Runner/Info.plist')
if p.exists():
    t=p.read_text(encoding='utf-8')
    add='''\n<key>NSCameraUsageDescription</key><string>Fiş fotoğrafı çekmek için kamera erişimi gerekir.</string>\n<key>NSPhotoLibraryUsageDescription</key><string>Galeriden fiş seçmek için fotoğraf erişimi gerekir.</string>\n'''
    if 'NSCameraUsageDescription' not in t: t=t.replace('</dict>',add+'</dict>')
    p.write_text(t,encoding='utf-8')
