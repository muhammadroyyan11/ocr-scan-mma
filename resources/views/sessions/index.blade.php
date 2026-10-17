@extends('layout')
@section('title', 'Riwayat penerimaan')
@section('content')
<div class="page-heading"><div><span class="eyebrow">CATATAN PENERIMAAN</span><h1>Riwayat penerimaan</h1><p>Telusuri sesi, periksa hasil, dan ekspor data yang Anda perlukan.</p></div>@if(auth()->user()->canWrite())<a class="button primary" href="/receiving-sessions/new">@include('partials.icon', ['name' => 'plus']) Penerimaan baru</a>@endif</div>
<form class="filter-bar" method="GET"><label class="grow">Cari sesi<input name="search" value="{{ request('search') }}" placeholder="Nomor sesi, referensi, atau supplier" maxlength="100"></label><label>Status<select name="status"><option value="">Semua status</option><option value="open" @selected(request('status') === 'open')>Aktif</option><option value="completed" @selected(request('status') === 'completed')>Selesai</option></select></label><button class="button secondary">Terapkan</button><a href="/receiving-sessions" class="button subtle">Reset</a></form>
@include('sessions.table')
{{ $sessions->links('partials.pagination') }}
@endsection
