export function captureImage(source, maximum = 2560) {
    const width = source.videoWidth || source.naturalWidth || source.width;
    const height = source.videoHeight || source.naturalHeight || source.height;
    if (!width || !height) throw new Error('Gambar belum siap. Tunggu kamera, lalu coba kembali.');
    if (width * height > 40000000) throw new Error('Resolusi gambar terlalu besar (maksimal 40 megapiksel).');
    const ratio = Math.min(1, maximum / Math.max(width, height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    canvas.getContext('2d').drawImage(source, 0, 0, canvas.width, canvas.height);
    return canvas;
}

export async function loadImageFile(file) {
    if (!file || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Pilih foto JPEG, PNG, atau WebP.');
    if (file.size > 15 * 1024 * 1024) throw new Error('Ukuran foto maksimal 15 MB. Foto tidak diunggah ke server.');
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    try { return captureImage(bitmap); } finally { bitmap.close(); }
}
