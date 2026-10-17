export async function apiRequest(path, { method = 'GET', body, signal } = {}) {
    const response = await fetch(path, {
        method, credentials: 'same-origin', signal,
        headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.content ?? '' },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const data = await response.json().catch(() => ({ message: 'Server mengirim respons tidak valid.' }));
    if (!response.ok) {
        const details = Object.values(data.errors ?? {}).flat().join(' ');
        const error = new Error(response.status === 419 ? 'Sesi telah berakhir. Muat ulang halaman dan login kembali.' : `${data.message ?? 'Permintaan gagal.'} ${details}`.trim());
        error.status = response.status;
        throw error;
    }
    return data;
}
