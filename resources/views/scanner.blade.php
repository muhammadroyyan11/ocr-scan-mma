@extends('layout')
@section('title', 'Scanner label')
@push('head')<link rel="stylesheet" href="/css/scanner.css">@endpush
@section('content')
<div class="page-heading scanner-heading"><div><span class="eyebrow">LANGKAH 02 / SCAN & VERIFIKASI</span><h1>Scanner label</h1><p>{{ $session->reference_number ?: 'Tanpa referensi' }} &middot; {{ $session->supplier_name ?: 'Supplier belum diisi' }}</p></div><a class="button secondary" href="/receiving-sessions/{{ $session->id }}">Lihat sesi @include('partials.icon', ['name' => 'arrow'])</a></div>
<div id="scanner" class="scanner-grid" data-session-id="{{ $session->id }}">
<div class="scanner-left">
<section class="panel scanner-panel"><div class="panel-heading"><h2>@include('partials.icon', ['name' => 'camera']) Kamera & foto label</h2><span id="ocr-status" class="badge" role="status" aria-live="polite">Idle</span></div>
<p class="muted camera-explanation">Tekan Mulai kamera, izinkan akses, lalu tekan OCR otomatis untuk langsung memotret dan membaca label. Foto tidak diunggah.</p>
<div class="camera-stage">
<div id="camera-placeholder" class="camera-placeholder"><span class="viewfinder">@include('partials.icon', ['name' => 'scan'])</span><strong>Siapkan label produk Anda</strong><p>Gunakan kamera atau pilih foto dari perangkat.</p><span class="stage-tag">LOT &nbsp; / &nbsp; MFG &nbsp; / &nbsp; EXP</span></div>
<video id="camera-video" autoplay muted playsinline hidden></video>
<div id="camera-field-picker" class="camera-field-picker" hidden><fieldset><legend>Pilih data yang akan di-scan</legend><div class="camera-field-options">
<label><input type="radio" name="camera-field" value="AUTO"><span>Otomatis</span></label>
<label><input type="radio" name="camera-field" value="LOT"><span>LOT</span></label>
<label><input type="radio" name="camera-field" value="MFG"><span>MG / MFG</span></label>
<label><input type="radio" name="camera-field" value="EXP"><span>Expired Date</span></label>
</div></fieldset><p id="camera-field-hint" aria-live="polite">Pilih Otomatis, LOT, MG / MFG, atau Expired Date sebelum mengambil foto.</p></div>
<div id="image-workspace" class="image-workspace" hidden><canvas id="captured-image" aria-label="Foto label asli"></canvas><canvas id="crop-overlay" aria-label="Tarik untuk memilih area teks pada foto"></canvas></div>
</div>
<p id="camera-status" class="muted" role="status" aria-live="polite">Kamera belum aktif. Tekan Mulai kamera atau Pilih foto.</p>
<div class="camera-controls"><button type="button" class="button primary" id="start-camera">@include('partials.icon', ['name' => 'camera']) Mulai kamera</button><button type="button" class="button secondary" id="capture-image" disabled>Ambil foto</button><label class="button secondary upload-button">Pilih foto<input id="image-file" type="file" accept="image/jpeg,image/png,image/webp" hidden></label><button type="button" class="button subtle" id="stop-camera" disabled>Hentikan</button><button type="button" class="button subtle" id="switch-camera" disabled>Ganti kamera</button><button type="button" class="button subtle" id="torch-camera" disabled>Lampu</button><button type="button" class="button subtle" id="retake" disabled>Foto ulang</button></div>
<div class="scanner-divider"></div><div class="ocr-toolbar"><label>Preset gambar<select id="preprocess-preset"><option value="original">Asli (disarankan)</option><option value="grayscale">Grayscale</option><option value="contrast">Kontras sedang</option><option value="threshold">Hitam-putih / threshold</option></select></label><button type="button" id="auto-ocr" class="button primary" disabled>OCR otomatis @include('partials.icon', ['name' => 'scan'])</button></div><div class="ocr-progress" hidden id="ocr-progress"><progress max="100" value="0"></progress><span>Menyiapkan OCR...</span></div><div id="scanner-error" class="notice error" hidden role="alert"></div>
</section>
<section class="panel"><div class="panel-heading"><h2>Pilih area tulisan</h2><span class="step-tag">MANUAL CROP</span></div><p class="muted">Tarik kotak di foto, dari sudut mana saja. Setiap area yang dibaca ditambahkan ke riwayat crop item ini.</p><div class="button-row"><button type="button" class="button secondary" id="manual-crop" disabled>@include('partials.icon', ['name' => 'crop']) Pilih area</button><button type="button" class="button subtle" id="clear-selection" disabled>Hapus seleksi</button><button type="button" class="button secondary" id="crop-area" disabled>Preview crop</button></div><div id="crop-preview" class="crop-preview" hidden></div><div class="ocr-toolbar"><label>Tujuan field<select id="crop-field"><option value="AUTO">Deteksi dari keyword</option><option value="LOT">LOT</option><option value="MFG">MFG</option><option value="EXP">EXP</option><option value="OTHER">OTHER / Teks lain</option></select></label><button type="button" id="read-selected" class="button primary" disabled>Baca area terpilih</button></div><div id="crop-history" class="crop-history" aria-live="polite"></div></section>
<section class="panel"><div class="panel-heading"><h2>Kandidat hasil parsing</h2><span class="badge" id="candidate-count">0 kandidat</span></div><p class="muted">Kandidat bukan hasil final. Pilih untuk mengisi field, lalu cocokkan dengan label asli.</p><div id="parser-candidates" class="candidate-list"></div><div id="parser-warnings" class="parser-warnings" aria-live="polite"></div></section>
</div>
<section class="panel results-panel"><div class="panel-heading"><div><span class="eyebrow">LANGKAH 03 / KONFIRMASI</span><h2>Hasil scan</h2></div><span class="badge amber" id="saved-count">{{ $session->items()->count() }} item di sesi</span></div><p class="muted">Semua field dapat diedit. LOT Number, MFG, dan EXP opsional jika tidak tersedia pada produk.</p>@include('partials.item-form', ['item' => null])</section>
</div>
@endsection
@push('scripts')<script type="module" src="/js/scanner/scanner-ui.js"></script>@endpush
