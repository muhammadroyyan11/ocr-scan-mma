@extends('layout')
@section('title', 'Scanner label')
@push('head')<link rel="stylesheet" href="/css/scanner.css">@endpush
@section('content')
<div class="page-heading scanner-heading"><div><span class="eyebrow">{{ $session->reference_number ?: 'PENERIMAAN BARANG' }}</span><h1>Scan label barang</h1><p>Foto label, periksa hasilnya, lalu simpan.</p></div><a class="button secondary" href="/receiving-sessions/{{ $session->id }}">Lihat sesi @include('partials.icon', ['name' => 'arrow'])</a></div>
<div id="scanner" class="scanner-grid" data-session-id="{{ $session->id }}">
<div class="scanner-left">
<section class="panel scanner-panel"><div class="panel-heading"><h2><span class="scan-step">1</span> Foto label</h2><span id="ocr-status" class="badge" role="status" aria-live="polite">Siap</span></div>
<p class="muted camera-explanation">Pastikan LOT dan tanggal terlihat jelas, termasuk ikon pabrik atau jam pasir jika ada.</p>
<div class="camera-stage">
<div id="camera-placeholder" class="camera-placeholder"><span class="viewfinder">@include('partials.icon', ['name' => 'scan'])</span><strong>Mulai dari foto label</strong><p>Buka kamera atau pilih foto yang sudah ada.</p><span class="stage-tag">Foto tetap di perangkat Anda</span></div>
<video id="camera-video" autoplay muted playsinline hidden></video>
<div id="image-workspace" class="image-workspace" hidden><canvas id="captured-image" aria-label="Foto label asli"></canvas><canvas id="crop-overlay" aria-label="Tarik untuk memilih area teks pada foto"></canvas></div>
</div>
<p id="camera-status" class="muted" role="status" aria-live="polite">Pilih salah satu cara untuk mulai.</p>
<div class="scan-main-actions">
<button type="button" class="button primary" id="start-camera">@include('partials.icon', ['name' => 'camera']) Mulai kamera</button>
<button type="button" id="auto-ocr" class="button primary" disabled hidden>Scan label @include('partials.icon', ['name' => 'scan'])</button>
<label class="button secondary upload-button">Pilih foto<input id="image-file" class="sr-only" type="file" accept="image/jpeg,image/png,image/webp"></label>
</div>
<div class="camera-controls"><button type="button" class="button subtle" id="retake" disabled hidden>Foto ulang</button><button type="button" class="button subtle" id="stop-camera" disabled hidden>Hentikan</button><button type="button" class="button subtle" id="switch-camera" disabled hidden>Ganti kamera</button><button type="button" class="button subtle" id="torch-camera" disabled hidden>Lampu</button></div>
<div class="ocr-progress" hidden id="ocr-progress"><progress max="100" value="0"></progress><span>Menyiapkan pembacaan...</span></div><div id="scanner-error" class="notice error" hidden role="alert"></div>
</section>
<details class="panel scan-disclosure" id="scan-tools">
<summary><span>Alat bantu scan<small>Jika hasil belum terbaca dengan baik</small></span><span class="disclosure-plus" aria-hidden="true">+</span></summary>
<div class="scan-disclosure-body stack">
<div id="camera-field-picker" class="camera-field-picker" hidden><fieldset><legend>Opsional: baca satu jenis data saja</legend><div class="camera-field-options">
<label><input type="radio" name="camera-field" value="AUTO" checked><span>Otomatis</span></label>
<label><input type="radio" name="camera-field" value="LOT"><span>LOT</span></label>
<label><input type="radio" name="camera-field" value="MFG"><span>MG / MFG</span></label>
<label><input type="radio" name="camera-field" value="EXP"><span>Expired Date</span></label>
</div></fieldset><p id="camera-field-hint" aria-live="polite">Mode otomatis membaca semua data pada label.</p><button type="button" class="button secondary" id="capture-image" disabled>Ambil foto</button></div>
<label>Tampilan foto<select id="preprocess-preset"><option value="original">Asli (disarankan)</option><option value="grayscale">Grayscale</option><option value="contrast">Kontras sedang</option><option value="threshold">Hitam-putih / threshold</option></select></label>
<div><h3>Baca bagian tertentu</h3><p class="muted">Pilih area pada foto jika hanya ingin membaca sebagian tulisan.</p></div>
<div class="button-row"><button type="button" class="button secondary" id="manual-crop" disabled>@include('partials.icon', ['name' => 'crop']) Pilih area</button><button type="button" class="button subtle" id="clear-selection" disabled>Hapus seleksi</button><button type="button" class="button secondary" id="crop-area" disabled>Preview crop</button></div>
<div id="crop-preview" class="crop-preview" hidden></div><div class="ocr-toolbar"><label>Isi hasil ke<select id="crop-field"><option value="AUTO">Deteksi otomatis</option><option value="LOT">LOT</option><option value="MFG">MFG</option><option value="EXP">EXP</option><option value="OTHER">OTHER / Teks lain</option></select></label><button type="button" id="read-selected" class="button primary" disabled>Baca area terpilih</button></div><div id="crop-history" class="crop-history" aria-live="polite"></div>
</div>
</details>
</div>
<section class="panel results-panel" aria-labelledby="scan-result-heading">
<div class="panel-heading"><h2 id="scan-result-heading" tabindex="-1"><span class="scan-step">2</span> Periksa & simpan</h2><span class="badge" id="saved-count">{{ $session->items()->count() }} item di sesi</span></div>
<p class="muted" id="scan-result-hint" role="status" aria-live="polite">Hasil akan terisi setelah scan. Anda juga bisa mengisinya manual.</p>
<div id="parser-warnings" class="parser-warnings" aria-live="polite"></div>
<details class="scan-disclosure scan-candidates" id="candidate-options" hidden><summary><span>Pilihan hasil baca lainnya</span><span class="badge" id="candidate-count">0 kandidat</span></summary><div class="scan-disclosure-body"><p class="muted">Pilih nilai yang sesuai dengan label untuk mengisi kolomnya.</p><div id="parser-candidates" class="candidate-list"></div></div></details>
@include('partials.item-form', ['item' => null, 'simplified' => true])
</section>
</div>
@endsection
@push('scripts')<script type="module" src="/js/scanner/scanner-ui.js"></script>@endpush
