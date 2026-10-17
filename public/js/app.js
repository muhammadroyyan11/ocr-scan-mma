import { apiRequest } from './scanner/api-client.js';
import { getItemForm } from './scanner/item-form.js';

let toastTimer;
export function notify(message, isError = false) {
    const toast = document.querySelector('#toast');
    clearTimeout(toastTimer);
    toast.textContent = message;
    toast.classList.toggle('error', isError);
    toast.hidden = false;
    toastTimer = setTimeout(() => { toast.hidden = true; }, 6000);
}

getItemForm();

document.querySelector('#session-form')?.addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('button[type="submit"]');
    if (button.disabled) return;
    button.disabled = true;
    const error = form.querySelector('#form-error');
    error.hidden = true;
    try {
        const result = await apiRequest('/api/receiving-sessions', { method: 'POST', body: Object.fromEntries(new FormData(form)) });
        window.location.assign(`/receiving-sessions/${result.data.id}/scanner`);
    } catch (failure) { error.textContent = failure.message; error.hidden = false; button.disabled = false; }
});

document.querySelectorAll('[data-session-status]').forEach(button => button.addEventListener('click', async () => {
    if (!confirm('Ubah status sesi ini? Sesi selesai tidak dapat diedit sebelum dibuka kembali.')) return;
    button.disabled = true;
    try {
        await apiRequest(`/api/receiving-sessions/${button.dataset.sessionId}/status`, { method: 'PATCH', body: { status: button.dataset.sessionStatus } });
        window.location.reload();
    } catch (failure) { notify(failure.message, true); button.disabled = false; }
}));

document.querySelectorAll('[data-delete-item]').forEach(button => button.addEventListener('click', async () => {
    if (!confirm('Hapus item dan catatan crop-nya secara permanen?')) return;
    button.disabled = true;
    try {
        await apiRequest(`/api/receiving-items/${button.dataset.deleteItem}`, { method: 'DELETE' });
        window.location.reload();
    } catch (failure) { notify(failure.message, true); button.disabled = false; }
}));

document.querySelectorAll('.user-form').forEach(form => form.addEventListener('submit', async event => {
    event.preventDefault();
    const button = form.querySelector('button');
    if (button.disabled) return;
    button.disabled = true;
    const error = form.querySelector('.form-error');
    error.hidden = true;
    const body = Object.fromEntries(new FormData(form));
    body.is_active = body.is_active === '1';
    try {
        await apiRequest(form.dataset.userId ? `/api/users/${form.dataset.userId}` : '/api/users', { method: form.dataset.userId ? 'PUT' : 'POST', body });
        window.location.reload();
    } catch (failure) { error.textContent = failure.message; error.hidden = false; button.disabled = false; }
}));
