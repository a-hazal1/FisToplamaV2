import 'dart:typed_data';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import '../models/app_profile.dart';
import '../services/receipt_service.dart';
import '../services/scanner_service.dart';

class ScanReceiptScreen extends StatefulWidget {
  final AppProfile profile;
  final VoidCallback onSaved;

  const ScanReceiptScreen({
    super.key,
    required this.profile,
    required this.onSaved,
  });

  @override
  State<ScanReceiptScreen> createState() => _ScanReceiptScreenState();
}

class _ScanReceiptScreenState extends State<ScanReceiptScreen> {
  final ImagePicker _picker = ImagePicker();
  final TextEditingController _note = TextEditingController();
  final ScannerService _scanner = ScannerService();
  final ReceiptService _receipts = ReceiptService();

  Uint8List? _preview;
  Uint8List? _original;

  double? _confidence;
  bool _processing = false;
  bool _saving = false;
  String? _scanMessage;

  Future<void> _capture(ImageSource source) async {
    final file = await _picker.pickImage(
      source: source,
      imageQuality: 95,
      maxWidth: 3000,
    );

    if (file == null) return;

    setState(() {
      _processing = true;
      _preview = null;
      _original = null;
      _confidence = null;
      _scanMessage = 'Fiş aranıyor…';
    });

    try {
      final bytes = await file.readAsBytes();

      final result = await _scanner.process(
        path: file.path,
        originalBytes: bytes,
      );

      if (!mounted) return;

      setState(() {
        _original = result.originalBytes;
        _preview = result.scannedBytes;
        _confidence = result.confidence;
        _scanMessage = 'Fiş algılandı ve otomatik kırpıldı.';
      });

      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Fiş algılandı ✓ Perspektif düzeltilip kırpıldı.'),
        ),
      );
    } on ReceiptNotDetectedException catch (e) {
      if (!mounted) return;

      setState(() {
        _scanMessage = e.message;
      });

      await showDialog<void>(
        context: context,
        builder: (context) => AlertDialog(
          icon: const Icon(
            Icons.document_scanner_outlined,
            size: 42,
          ),
          title: const Text('Fiş algılanamadı'),
          content: Text(
            '${e.message}\n\n'
            'İyi sonuç için:\n'
            '• Fişin dört köşesi kadrajda olsun.\n'
            '• Fiş ile zemin arasında kontrast olsun.\n'
            '• Kamerayı mümkün olduğunca karşıdan tut.\n'
            '• Gölge ve parlamayı azalt.',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Tamam'),
            ),
            if (!kIsWeb)
              FilledButton.icon(
                onPressed: () {
                  Navigator.pop(context);
                  _capture(ImageSource.camera);
                },
                icon: const Icon(Icons.photo_camera),
                label: const Text('Tekrar Çek'),
              ),
          ],
        ),
      );
    } catch (e) {
      if (!mounted) return;

      setState(() {
        _scanMessage = 'Tarama hatası oluştu.';
      });

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Fiş işlenemedi: $e')),
      );
    } finally {
      if (mounted) {
        setState(() => _processing = false);
      }
    }
  }

  Future<void> _save() async {
    if (_preview == null || _original == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'Önce kenarları algılanmış ve kırpılmış bir fiş oluştur.',
          ),
        ),
      );
      return;
    }

    setState(() => _saving = true);

    try {
      await _receipts.createReceipt(
        profile: widget.profile,
        scannedBytes: _preview!,
        originalBytes: _original!,
        note: _note.text,
        edgesDetected: true,
      );

      if (!mounted) return;

      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Taranmış fiş merkezi arşive kaydedildi.'),
        ),
      );

      widget.onSaved();
    } catch (e) {
      if (!mounted) return;

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Kaydetme başarısız: $e')),
      );
    } finally {
      if (mounted) {
        setState(() => _saving = false);
      }
    }
  }

  void _clearScan() {
    setState(() {
      _preview = null;
      _original = null;
      _confidence = null;
      _scanMessage = null;
    });
  }

  @override
  void dispose() {
    _note.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final confidenceText = _confidence == null
        ? null
        : '%${(_confidence! * 100).clamp(0, 100).toStringAsFixed(0)}';

    return ListView(
      padding: const EdgeInsets.all(24),
      children: [
        const Text(
          'Fiş Tara',
          style: TextStyle(
            fontSize: 28,
            fontWeight: FontWeight.w900,
          ),
        ),
        const SizedBox(height: 6),
        const Text(
          'Fişin tamamını kadraja al. Uygulama dört köşeyi bulur, perspektifi düzeltir ve sadece fişi arşive kaydeder.',
          style: TextStyle(color: Color(0xFF667085)),
        ),
        const SizedBox(height: 20),

        LayoutBuilder(
          builder: (context, constraints) {
            final wide = constraints.maxWidth >= 820;

            final previewCard = Card(
              child: Padding(
                padding: const EdgeInsets.all(18),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Row(
                      children: [
                        const Expanded(
                          child: Text(
                            'Tarama Önizlemesi',
                            style: TextStyle(
                              fontSize: 17,
                              fontWeight: FontWeight.w900,
                            ),
                          ),
                        ),
                        if (_preview != null)
                          Chip(
                            avatar: const Icon(
                              Icons.check_circle,
                              size: 17,
                              color: Colors.green,
                            ),
                            label: Text(
                              confidenceText == null
                                  ? 'Algılandı'
                                  : 'Algılandı $confidenceText',
                            ),
                          ),
                      ],
                    ),
                    const SizedBox(height: 14),

                    AspectRatio(
                      aspectRatio: 0.72,
                      child: Container(
                        decoration: BoxDecoration(
                          color: const Color(0xFFF2F4F7),
                          borderRadius: BorderRadius.circular(16),
                          border: Border.all(
                            color: _preview != null
                                ? Colors.green
                                : const Color(0xFFE4E7EC),
                          ),
                        ),
                        child: _processing
                            ? const Column(
                                mainAxisAlignment: MainAxisAlignment.center,
                                children: [
                                  CircularProgressIndicator(),
                                  SizedBox(height: 14),
                                  Text('Fişin kenarları algılanıyor…'),
                                ],
                              )
                            : _preview == null
                                ? const Column(
                                    mainAxisAlignment:
                                        MainAxisAlignment.center,
                                    children: [
                                      Icon(
                                        Icons.document_scanner_outlined,
                                        size: 60,
                                        color: Color(0xFF98A2B3),
                                      ),
                                      SizedBox(height: 12),
                                      Text(
                                        'Henüz taranmış fiş yok',
                                        style: TextStyle(
                                          fontWeight: FontWeight.w800,
                                        ),
                                      ),
                                    ],
                                  )
                                : ClipRRect(
                                    borderRadius:
                                        BorderRadius.circular(16),
                                    child: Image.memory(
                                      _preview!,
                                      fit: BoxFit.contain,
                                    ),
                                  ),
                      ),
                    ),

                    if (_scanMessage != null) ...[
                      const SizedBox(height: 12),
                      Container(
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: _preview != null
                              ? const Color(0xFFECFDF3)
                              : const Color(0xFFFFF4E5),
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Icon(
                              _preview != null
                                  ? Icons.auto_fix_high
                                  : Icons.info_outline,
                              size: 19,
                            ),
                            const SizedBox(width: 9),
                            Expanded(child: Text(_scanMessage!)),
                          ],
                        ),
                      ),
                    ],

                    if (_preview != null) ...[
                      const SizedBox(height: 12),
                      OutlinedButton.icon(
                        onPressed: _processing ? null : _clearScan,
                        icon: const Icon(Icons.refresh),
                        label: const Text('Bu Taramayı Sil ve Yeniden Çek'),
                      ),
                    ],
                  ],
                ),
              ),
            );

            final controls = Card(
              child: Padding(
                padding: const EdgeInsets.all(22),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text(
                      widget.profile.branchName ?? 'Şube atanmamış',
                      style: const TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                    const SizedBox(height: 5),
                    Text(
                      'Ekleyen: ${widget.profile.fullName}',
                      style: const TextStyle(
                        color: Color(0xFF667085),
                      ),
                    ),
                    const SizedBox(height: 20),

                    TextField(
                      controller: _note,
                      minLines: 3,
                      maxLines: 5,
                      decoration: const InputDecoration(
                        labelText: 'Açıklama',
                        hintText: 'İsteğe bağlı',
                      ),
                    ),
                    const SizedBox(height: 18),

                    if (!kIsWeb) ...[
                      FilledButton.icon(
                        onPressed: _processing
                            ? null
                            : () => _capture(ImageSource.camera),
                        icon: const Icon(Icons.photo_camera),
                        label: const Padding(
                          padding: EdgeInsets.symmetric(vertical: 14),
                          child: Text('Kamerayla Fiş Tara'),
                        ),
                      ),
                      const SizedBox(height: 10),
                    ],

                    OutlinedButton.icon(
                      onPressed: _processing
                          ? null
                          : () => _capture(ImageSource.gallery),
                      icon: const Icon(Icons.photo_library_outlined),
                      label: Padding(
                        padding:
                            const EdgeInsets.symmetric(vertical: 14),
                        child: Text(
                          kIsWeb
                              ? 'Bilgisayardan Fiş Seç'
                              : 'Galeriden Fiş Tara',
                        ),
                      ),
                    ),

                    const SizedBox(height: 20),

                    FilledButton.icon(
                      onPressed:
                          _preview == null || _saving ? null : _save,
                      icon: const Icon(Icons.cloud_upload_outlined),
                      label: Padding(
                        padding:
                            const EdgeInsets.symmetric(vertical: 14),
                        child: Text(
                          _saving
                              ? 'Kaydediliyor…'
                              : 'Kırpılmış Fişi Arşive Kaydet',
                        ),
                      ),
                    ),

                    const SizedBox(height: 16),
                    const Divider(),
                    const SizedBox(height: 10),
                    const Text(
                      'Daha iyi otomatik kırpma için',
                      style: TextStyle(fontWeight: FontWeight.w900),
                    ),
                    const SizedBox(height: 8),
                    const Text(
                      '• Fişi koyu veya renkli bir zemine koy.\n'
                      '• Dört köşeyi de görünür bırak.\n'
                      '• Fiş kadrajın çoğunu kaplasın.\n'
                      '• Aşırı eğik çekme.\n'
                      '• Flaş parlaması ve sert gölgelerden kaçın.',
                      style: TextStyle(
                        color: Color(0xFF667085),
                        height: 1.6,
                      ),
                    ),
                  ],
                ),
              ),
            );

            if (!wide) {
              return Column(
                children: [
                  previewCard,
                  const SizedBox(height: 16),
                  controls,
                ],
              );
            }

            return Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(child: previewCard),
                const SizedBox(width: 16),
                Expanded(child: controls),
              ],
            );
          },
        ),
      ],
    );
  }
}
