export function preprocessImage(source, preset = 'original') {
    const canvas = document.createElement('canvas');
    const scale = Math.min(3, Math.max(1, 1200 / source.width), 3000 / Math.max(source.width, source.height));
    canvas.width = Math.round(source.width * scale);
    canvas.height = Math.round(source.height * scale);
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(source, 0, 0, canvas.width, canvas.height);
    if (preset === 'original') return canvas;
    const image = context.getImageData(0, 0, canvas.width, canvas.height);
    for (let index = 0; index < image.data.length; index += 4) {
        let gray = image.data[index] * 0.299 + image.data[index + 1] * 0.587 + image.data[index + 2] * 0.114;
        if (preset === 'contrast') gray = Math.max(0, Math.min(255, (gray - 128) * 1.45 + 128));
        if (preset === 'threshold') gray = gray > 145 ? 255 : 0;
        image.data[index] = image.data[index + 1] = image.data[index + 2] = gray;
    }
    context.putImageData(image, 0, 0);
    return canvas;
}
