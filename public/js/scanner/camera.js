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
        if (!window.isSecureContext) throw new Error('Kamera diblokir pada alamat HTTP ini. Dari HP, buka situs melalui HTTPS dengan sertifikat tepercaya. Localhost hanya berlaku di perangkat yang membuka situs. Anda tetap dapat memilih foto.');
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('Browser ini tidak menyediakan akses kamera. Buka situs di browser lain atau gunakan Pilih foto.');
        const generation = this.generation;
        let stream = null;
        try {
            stream = await navigator.mediaDevices.getUserMedia({ video: { ...(deviceId ? { deviceId: { exact: deviceId } } : { facingMode: { ideal: 'environment' } }), width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
            if (generation !== this.generation || document.hidden) {
                stream.getTracks().forEach(track => track.stop());
                return false;
            }
            this.stream = stream;
            this.video.muted = true;
            this.video.playsInline = true;
            this.video.hidden = false;
            this.video.srcObject = stream;
            this.onChange(this.state());
            await this.video.play();
            if (generation !== this.generation || this.stream !== stream) {
                stream.getTracks().forEach(track => track.stop());
                return false;
            }
            this.refreshDevices(generation);
            this.onChange(this.state());
            return true;
        } catch (error) {
            stream?.getTracks().forEach(track => track.stop());
            if (generation !== this.generation) return false;
            this.stop();
            const messages = { NotAllowedError: 'Izin kamera ditolak. Izinkan kamera di pengaturan situs, lalu coba lagi.', NotFoundError: 'Kamera tidak ditemukan. Gunakan tombol Pilih foto.', NotReadableError: 'Kamera sedang digunakan aplikasi lain atau tidak dapat dibuka.', OverconstrainedError: 'Kamera yang dipilih tidak tersedia. Mulai ulang kamera.' };
            throw new Error(messages[error.name] ?? `Kamera gagal dimulai: ${error.message}`);
        }
    }

    async refreshDevices(generation) {
        try {
            const devices = await navigator.mediaDevices.enumerateDevices?.() ?? [];
            if (generation !== this.generation) return;
            this.devices = devices.filter(device => device.kind === 'videoinput');
        } catch {
            if (generation !== this.generation) return;
            this.devices = [];
        }
        this.onChange(this.state());
    }

    state() {
        let canTorch = false;
        try { canTorch = Boolean(this.stream?.getVideoTracks()[0]?.getCapabilities?.().torch); } catch {}
        return { running: Boolean(this.stream), canSwitch: this.devices.length > 1, canTorch, torch: this.torch };
    }

    async switch() {
        const current = this.stream?.getVideoTracks()[0]?.getSettings().deviceId;
        const index = this.devices.findIndex(device => device.deviceId === current);
        return this.start(this.devices[(index + 1) % this.devices.length]?.deviceId);
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
        this.devices = [];
        this.torch = false;
        this.video.srcObject = null;
        this.onChange(this.state());
    }
}
