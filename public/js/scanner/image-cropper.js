export function imagePoint(clientX, clientY, rectangle, width, height) {
    return { x: Math.max(0, Math.min(width, (clientX - rectangle.left) * width / rectangle.width)), y: Math.max(0, Math.min(height, (clientY - rectangle.top) * height / rectangle.height)) };
}

export function selectionBounds(start, end, width, height) {
    const left = Math.max(0, Math.floor(Math.min(start.x, end.x)));
    const top = Math.max(0, Math.floor(Math.min(start.y, end.y)));
    return { x: left, y: top, width: Math.min(width, Math.ceil(Math.max(start.x, end.x))) - left, height: Math.min(height, Math.ceil(Math.max(start.y, end.y))) - top, image_width: width, image_height: height };
}

export class ImageCropper {
    constructor(canvas, overlay, onSelection = () => {}) {
        this.canvas = canvas;
        this.overlay = overlay;
        this.onSelection = onSelection;
        this.enabled = false;
        this.selection = null;
        this.pointer = null;
        overlay.addEventListener('pointerdown', event => {
            if (!this.enabled || this.pointer !== null || !event.isPrimary) return;
            event.preventDefault();
            this.pointer = event.pointerId;
            this.start = this.point(event);
            overlay.setPointerCapture(event.pointerId);
            this.selection = null;
        });
        overlay.addEventListener('pointermove', event => {
            if (event.pointerId !== this.pointer) return;
            this.selection = selectionBounds(this.start, this.point(event), canvas.width, canvas.height);
            this.render();
        });
        overlay.addEventListener('pointerup', event => {
            if (event.pointerId !== this.pointer) return;
            this.selection = selectionBounds(this.start, this.point(event), canvas.width, canvas.height);
            this.pointer = null;
            if (this.selection.width < 8 || this.selection.height < 8) this.selection = null;
            this.render();
            this.onSelection(this.selection);
        });
        overlay.addEventListener('pointercancel', () => { this.pointer = null; this.clear(); });
    }

    point(event) { return imagePoint(event.clientX, event.clientY, this.overlay.getBoundingClientRect(), this.canvas.width, this.canvas.height); }

    setImage(source) {
        this.canvas.width = this.overlay.width = source.width;
        this.canvas.height = this.overlay.height = source.height;
        this.canvas.getContext('2d').drawImage(source, 0, 0);
        this.clear();
    }

    enable(enabled = true) {
        this.enabled = enabled;
        this.overlay.style.touchAction = enabled ? 'none' : 'pan-y';
        this.overlay.style.cursor = enabled ? 'crosshair' : 'default';
    }

    clear() {
        this.selection = null;
        this.render();
        this.onSelection(null);
    }

    render() {
        const context = this.overlay.getContext('2d');
        context.clearRect(0, 0, this.overlay.width, this.overlay.height);
        if (!this.selection) return;
        const { x, y, width, height } = this.selection;
        context.fillStyle = 'rgba(6, 25, 35, 0.55)';
        context.fillRect(0, 0, this.overlay.width, this.overlay.height);
        context.clearRect(x, y, width, height);
        context.strokeStyle = '#caff52';
        context.lineWidth = Math.max(3, this.canvas.width / this.overlay.getBoundingClientRect().width * 2);
        context.strokeRect(x, y, width, height);
    }

    crop() {
        if (!this.selection) throw new Error('Pilih area tulisan dengan tarik kotak pada foto terlebih dahulu.');
        const { x, y, width, height } = this.selection;
        const result = document.createElement('canvas');
        result.width = width;
        result.height = height;
        result.getContext('2d').drawImage(this.canvas, x, y, width, height, 0, 0, width, height);
        return { canvas: result, metadata: { ...this.selection } };
    }
}
