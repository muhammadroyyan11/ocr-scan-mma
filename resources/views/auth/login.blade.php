@extends('layout')
@section('title', 'Masuk')
@section('content')
<main class="login-shell">
    <section class="login-story"><a href="/login" class="brand light"><span class="brand-mark">@include('partials.icon', ['name' => 'scan'])</span><span>arrival<span class="brand-sub">STOCK SCANNER</span></span></a><div><span class="eyebrow light-text">DARI LABEL, MENJADI DATA.</span><h1>Barang tiba.<br>Catat dengan<br><em>lebih pasti.</em></h1><p>Satu workspace untuk memindai label, memeriksa tanggal, dan merapikan setiap penerimaan.</p><div class="label-art"><div class="label-art-top"><span>INCOMING STOCK</span><span>01 / 03</span></div><div class="barcode-art"></div><div class="label-art-values"><span>LOT <b>ABC12345</b></span><span>MFG <b>25 DEC 2025</b></span><span>EXP <b>30 DEC 2027</b></span></div><span class="art-corner tl"></span><span class="art-corner br"></span></div></div><small>PRIVASI DIUTAMAKAN &nbsp; / &nbsp; OCR DI PERANGKAT</small></section>
    <section class="login-panel"><div class="login-form-wrap"><span class="eyebrow">SELAMAT DATANG KEMBALI</span><h2>Masuk ke workspace</h2><p class="muted">Gunakan akun yang diberikan administrator Anda.</p>
    @if($errors->any())<div class="notice error" role="alert">{{ $errors->first() }}</div>@endif
    <form method="POST" action="/login" class="stack">@csrf<label>Email<input type="email" name="email" value="{{ old('email') }}" autocomplete="username" placeholder="nama@perusahaan.com" required autofocus maxlength="255"></label><label>Password<input type="password" name="password" autocomplete="current-password" placeholder="Masukkan password Anda" required maxlength="255"></label><button class="button primary full">Masuk ke workspace @include('partials.icon', ['name' => 'arrow'])</button></form><div class="login-help">@include('partials.icon', ['name' => 'shield'])<span>Akses sesuai role. Tidak memiliki akun? Hubungi administrator gudang Anda.</span></div></div></section>
</main>
@endsection
