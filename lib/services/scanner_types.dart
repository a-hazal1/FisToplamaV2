import 'dart:typed_data';

class ScanResult {
  final Uint8List originalBytes;
  final Uint8List scannedBytes;
  final bool detected;
  final String? error;

  const ScanResult({
    required this.originalBytes,
    required this.scannedBytes,
    required this.detected,
    this.error,
  });
}
