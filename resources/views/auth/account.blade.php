@extends('layout')
@section('title', 'Pengaturan akun')
@section('content')
<div class="page-heading"><div><span class="eyebrow">AKUN & KEAMANAN</span><h1>Pengaturan akun</h1><p>{{ auth()->user()->email }} <span class="badge">{{ auth()->user()->role }}</span></p></div></div>
<section class="panel narrow"><h2>Ganti password</h2><p class="muted">Minimal 12 karakter, mengandung huruf dan angka.</p><form method="POST" action="/account/password" class="stack">@csrf @method('PUT')<label>Password saat ini<input name="current_password" type="password" autocomplete="current-password" required maxlength="255"></label><label>Password baru<input name="password" type="password" autocomplete="new-password" minlength="12" required maxlength="255"></label><label>Ulangi password baru<input name="password_confirmation" type="password" autocomplete="new-password" minlength="12" required maxlength="255"></label><button class="button primary">Perbarui password</button></form></section>
@endsection
