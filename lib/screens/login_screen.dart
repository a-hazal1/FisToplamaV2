import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});
  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final email = TextEditingController();
  final password = TextEditingController();
  bool loading = false;
  bool obscure = true;

  Future<void> login() async {
    setState(() => loading = true);
    try {
      await Supabase.instance.client.auth.signInWithPassword(
        email: email.text.trim(), password: password.text,
      );
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Giriş yapılamadı: $e')));
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final wide = MediaQuery.sizeOf(context).width >= 900;
    return Scaffold(
      body: Row(children: [
        if (wide) Expanded(child: Container(
          color: const Color(0xFF111827), padding: const EdgeInsets.all(48),
          child: const Column(mainAxisAlignment: MainAxisAlignment.center, crossAxisAlignment: CrossAxisAlignment.start, children: [
            Icon(Icons.document_scanner_rounded, color: Colors.white, size: 64),
            SizedBox(height: 24),
            Text('FişToplama Pro', style: TextStyle(color: Colors.white, fontSize: 40, fontWeight: FontWeight.w900)),
            SizedBox(height: 12),
            Text('Fişleri tara, merkezi arşivde topla ve 6’lı A4 çıktıları oluştur.', style: TextStyle(color: Colors.white70, fontSize: 17)),
          ]),
        )),
        Expanded(child: Center(child: SingleChildScrollView(padding: const EdgeInsets.all(24), child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 430),
          child: Card(child: Padding(padding: const EdgeInsets.all(28), child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            const Text('Giriş Yap', style: TextStyle(fontSize: 28, fontWeight: FontWeight.w900)),
            const SizedBox(height: 6),
            const Text('Kurumsal hesabınla devam et.', style: TextStyle(color: Color(0xFF667085))),
            const SizedBox(height: 24),
            TextField(controller: email, decoration: const InputDecoration(labelText: 'E-posta', prefixIcon: Icon(Icons.mail_outline))),
            const SizedBox(height: 14),
            TextField(controller: password, obscureText: obscure, onSubmitted: (_) => login(), decoration: InputDecoration(
              labelText: 'Şifre', prefixIcon: const Icon(Icons.lock_outline),
              suffixIcon: IconButton(onPressed: () => setState(() => obscure = !obscure), icon: Icon(obscure ? Icons.visibility_outlined : Icons.visibility_off_outlined)),
            )),
            const SizedBox(height: 18),
            FilledButton(onPressed: loading ? null : login, child: Padding(padding: const EdgeInsets.symmetric(vertical: 14), child: Text(loading ? 'Giriş yapılıyor...' : 'Giriş Yap'))),
          ]))),
        )))),
      ]),
    );
  }
}
