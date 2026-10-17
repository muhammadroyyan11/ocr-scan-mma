<!doctype html>
<html lang="id">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="csrf-token" content="{{ csrf_token() }}">
    <meta name="theme-color" content="#153b35">
    <title>@yield('title', 'Dashboard') - Stock Arrival Scanner</title>
    <link rel="stylesheet" href="/css/app.css">
    <link rel="stylesheet" href="/css/touch.css">
    <script type="module" src="/js/app.js"></script>
    @stack('head')
</head>
<body>
@auth
<aside class="sidebar">
    <a href="/" class="brand"><span class="brand-mark">@include('partials.icon', ['name' => 'scan'])</span><span>arrival<span class="brand-sub">STOCK SCANNER</span></span><span class="brand-dot"></span></a>
    <div class="nav-label">WORKSPACE</div>
    <nav class="main-nav" aria-label="Navigasi utama">
        <a href="/" @class(['active' => request()->is('/')])>@include('partials.icon', ['name' => 'grid'])<span>Dashboard</span></a>
        @if(auth()->user()->canWrite())<a href="/receiving-sessions/new" @class(['active' => request()->is('receiving-sessions/new')])>@include('partials.icon', ['name' => 'scan'])<span>Penerimaan baru</span></a>@endif
        <a href="/receiving-sessions" @class(['active' => request()->is('receiving-sessions')])>@include('partials.icon', ['name' => 'clock'])<span>Riwayat penerimaan</span></a>
        @if(auth()->user()->role === 'admin')<a href="/users" @class(['active' => request()->is('users')])>@include('partials.icon', ['name' => 'users'])<span>Pengguna & akses</span></a>@endif
    </nav>
    <div class="sidebar-note">@include('partials.icon', ['name' => 'shield'])<strong>Foto tetap di perangkat.</strong><span>OCR berjalan di browser Anda. Tidak ada foto yang diunggah.</span></div>
    <div class="sidebar-user"><a href="/account" class="user-link"><span class="avatar">{{ strtoupper(substr(auth()->user()->name, 0, 1)) }}</span><span><strong>{{ auth()->user()->name }}</strong><small>{{ ucfirst(auth()->user()->role) }} &middot; Pengaturan akun</small></span></a><form method="POST" action="/logout">@csrf<button class="icon-button" aria-label="Keluar" title="Keluar">@include('partials.icon', ['name' => 'logout'])</button></form></div>
</aside>
<div class="app-main">
<header class="topbar"><span class="breadcrumb">Operasional <span>/</span> <strong>@yield('title', 'Dashboard')</strong></span><span class="connection"><i></i> Workspace aktif</span><span class="top-date">{{ now()->translatedFormat('d M Y') }}</span></header>
<main class="page-content" id="main-content">
@if(session('success'))<div class="notice success" role="status">{{ session('success') }}</div>@endif
@if($errors->any())<div class="notice error" role="alert">@foreach($errors->all() as $error)<div>{{ $error }}</div>@endforeach</div>@endif
@yield('content')
<footer class="page-footer"><span>ARRIVAL / Penerimaan yang lebih terarah.</span><span>Hasil OCR selalu memerlukan verifikasi manusia.</span></footer>
</main>
</div>
@else
@yield('content')
@endauth
<div id="toast" class="toast" role="status" aria-live="polite" hidden></div>
@stack('scripts')
</body>
</html>
