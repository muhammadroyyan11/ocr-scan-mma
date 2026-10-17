@php
$paths = [
 'grid' => '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
 'scan' => '<path d="M8 3H5a2 2 0 0 0-2 2v3m13-5h3a2 2 0 0 1 2 2v3M3 16v3a2 2 0 0 0 2 2h3m13-5v3a2 2 0 0 1-2 2h-3M7 12h10M9 8v8m6-8v8"/>',
 'box' => '<path d="m12 3 9 5v9l-9 5-9-5V8l9-5Zm0 9L3 8m9 4 9-4m-9 4v10M7.5 5.5l9 5"/>',
 'clock' => '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
 'users' => '<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3m2-16a3 3 0 0 1 0 6m4 10v-3a6 6 0 0 0-3-5"/>',
 'plus' => '<path d="M12 5v14M5 12h14"/>',
 'arrow' => '<path d="M5 12h14m-5-5 5 5-5 5"/>',
 'camera' => '<path d="M4 6h4l2-3h4l2 3h4a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1Z"/><circle cx="12" cy="13" r="4"/>',
 'check' => '<path d="m5 12 4 4L19 6"/>',
 'shield' => '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z"/><path d="m8 12 3 3 5-6"/>',
 'logout' => '<path d="M9 4H4v16h5m5-13 5 5-5 5m-6-5h13"/>',
 'download' => '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
 'crop' => '<path d="M6 3v15h15M3 6h15v15"/>',
];
@endphp
<svg class="icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">{!! $paths[$name] ?? $paths['box'] !!}</svg>
