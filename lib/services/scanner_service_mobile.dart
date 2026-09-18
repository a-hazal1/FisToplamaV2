import 'dart:typed_data';

import 'package:document_scan/document_scan.dart';

class ScanResultData {
  final Uint8List scannedBytes;
  final Uint8List originalBytes;
  final double confidence;

  const ScanResultData({
    required this.scannedBytes,
    required this.originalBytes,
    required this.confidence,
  });
}

class ReceiptNotDetectedException implements Exception {
  final String message;
  const ReceiptNotDetectedException(this.message);

  @override
  String toString() => message;
}

class ScannerService {
  final DocumentDetector _detector = DocumentDetector();
  final DocumentProcessor _processor = const DocumentProcessor();

  Future<ScanResultData> process({
    required String path,
    required Uint8List originalBytes,
  }) async {
    final input = ScanInput.file(path);

    final corners = await _detector.detect(
      input,
      sensitivity: DetectionSensitivity.balanced,
    );

    if (corners == null) {
      throw const ReceiptNotDetectedException(
        'Fişin dört kenarı algılanamadı. Fişin tamamını kadraja alıp tekrar çek.',
      );
    }

    final scanned = await _processor.crop(
      input,
      corners,
      filter: ScanFilter.enhance,
      output: ScanOutputFormat.jpegAt(94),
      maxDimension: 2400,
      background: true,
    );

    if (scanned == null || scanned.bytes.isEmpty) {
      throw const ReceiptNotDetectedException(
        'Fiş algılandı fakat perspektif düzeltme tamamlanamadı.',
      );
    }

    return ScanResultData(
      scannedBytes: scanned.bytes,
      originalBytes: originalBytes,
      confidence: corners.confidence,
    );
  }
}
