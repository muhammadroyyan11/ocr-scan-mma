export class Camera {
    constructor(video, onChange = () => {}) {
        this.video = video;
        this.onChange = onChange;
        this.stream = null;
        this.devices = [];
        this.torch = false;
        this.generation = 0;
    }

    async start(deviceId = null) {
        this.stop();
        if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw new Error('Kamera membutuhkan HTTPS dari HP, atau localhost di komputer. Anda tetap dapat memilih foto.');
        const generation = this.generation;
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: { ...(deviceId ? { deviceId: { exact: deviceId } } : { facingMode: { ideal: 'environment' } }), width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
            if (generation !== this.generation || document.hidden) {
                stream.getTracks().forEach(track => track.stop());
                return;
            }
            this.stream = stream;
            this.video.srcObject = stream;
            await this.video.play();
            this.devices = (await navigator.mediaDevices.enumerateDevices()).filter(device => device.kind === 'videoinput');
            this.onChange(this.state());
        } catch (error) {
            this.stop();
            const messages = { NotAllowedError: 'Izin kamera ditolak. Izinkan kamera di pengaturan situs, lalu coba lagi.', NotFoundError: 'Kamera tidak ditemukan. Gunakan tombol Pilih foto.', NotReadableError: 'Kamera sedang digunakan aplikasi lain atau tidak dapat dibuka.', OverconstrainedError: 'Kamera yang dipilih tidak tersedia. Mulai ulang kamera.' };
            throw new Error(messages[error.name] ?? `Kamera gagal dimulai: ${error.message}`);
        }
    }

    state() {
        return { running: Boolean(this.stream), canSwitch: this.devices.length > 1, canTorch: Boolean(this.stream?.getVideoTracks()[0]?.getCapabilities?.().torch), torch: this.torch };
    }

    async switch() {
        const current = this.stream?.getVideoTracks()[0]?.getSettings().deviceId;
        const index = this.devices.findIndex(device => device.deviceId === current);
        await this.start(this.devices[(index + 1) % this.devices.length]?.deviceId);
    }

    async toggleTorch() {
        const track = this.stream?.getVideoTracks()[0];
        if (!track?.getCapabilities?.().torch) throw new Error('Torch tidak didukung kamera ini.');
        await track.applyConstraints({ advanced: [{ torch: !this.torch }] });
        this.torch = !this.torch;
        this.onChange(this.state());
    }

    stop() {
        this.generation += 1;
        this.stream?.getTracks().forEach(track => track.stop());
        this.stream = null;
        this.torch = false;
        this.video.srcObject = null;
        this.onChange(this.state());
    }
}
