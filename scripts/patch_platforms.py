from pathlib import Path

# ----------------------------
# ANDROID
# ----------------------------

manifest = Path("android/app/src/main/AndroidManifest.xml")

if manifest.exists():
    text = manifest.read_text(encoding="utf-8")

    permissions = [
        '<uses-permission android:name="android.permission.INTERNET" />',
        '<uses-permission android:name="android.permission.CAMERA" />',
        '<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />',
    ]

    insert_text = ""

    for permission in permissions:
        if permission not in text:
            insert_text += f"\n    {permission}"

    if insert_text:
        pos = text.find(">")

        text = (
            text[:pos + 1]
            + insert_text
            + text[pos + 1:]
        )

    manifest.write_text(
        text,
        encoding="utf-8",
    )


# ----------------------------
# IOS
# ----------------------------

plist = Path("ios/Runner/Info.plist")

if plist.exists():
    text = plist.read_text(encoding="utf-8")

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
