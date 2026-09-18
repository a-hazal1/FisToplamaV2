import 'dart:typed_data';
import 'package:document_scan/document_scan.dart';
class ScanData {
  final Uint8List scanned;
  final Uint8List original;
  final bool detected;
  ScanData(this.scanned, this.original, this.detected);
}
class ScannerService {
  final _scanner = DocumentScanner();
  Future<ScanData> process(String path, Uint8List bytes) async {
    try {
      final result = await _scanner.scan(
        ScanInput.file(path),
        filter: ScanFilter.enhance,
        output: ScanOutputFormat.jpeg,
      );
      if (result == null) return ScanData(bytes, bytes, false);
      return ScanData(result.bytes, bytes, true);
    } catch (_) {
      return ScanData(bytes, bytes, false);
    }
  }
}
