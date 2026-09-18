import 'dart:typed_data';
class ScanData {
  final Uint8List scanned;
  final Uint8List original;
  final bool detected;
  ScanData(this.scanned, this.original, this.detected);
}
class ScannerService {
  Future<ScanData> process(String path, Uint8List bytes) async => ScanData(bytes, bytes, false);
}
