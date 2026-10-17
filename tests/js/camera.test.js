import test from 'node:test';
import assert from 'node:assert/strict';
import { Camera } from '../../public/js/scanner/camera.js';

function environment(context) {
    const originals = Object.fromEntries(['window', 'document', 'navigator'].map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
    const track = { stopped: false, stop() { this.stopped = true; }, getCapabilities: () => ({}) };
    const stream = { getTracks: () => [track], getVideoTracks: () => [track] };
    const mediaDevices = { getUserMedia: async () => stream, enumerateDevices: async () => [{ kind: 'videoinput', deviceId: 'back' }] };
    Object.defineProperty(globalThis, 'window', { value: { isSecureContext: true }, configurable: true });
    Object.defineProperty(globalThis, 'document', { value: { hidden: false }, configurable: true });
    Object.defineProperty(globalThis, 'navigator', { value: { mediaDevices }, configurable: true });
    context.after(() => {
        for (const [name, descriptor] of Object.entries(originals)) {
            if (descriptor) Object.defineProperty(globalThis, name, descriptor);
            else delete globalThis[name];
        }
    });
    const video = { hidden: true, srcObject: null, async play() { assert.equal(this.hidden, false); assert.equal(this.muted, true); assert.equal(this.playsInline, true); } };
    return { camera: new Camera(video), video, mediaDevices, stream, track };
}

test('preview is visible, muted and inline before playback starts', async context => {
    const { camera, video, stream } = environment(context);
    assert.equal(await camera.start(), true);
    assert.equal(video.srcObject, stream);
    assert.equal(camera.state().running, true);
    camera.stop();
});

test('device enumeration failure never closes an acquired camera stream', async context => {
    const { camera, mediaDevices, track } = environment(context);
    mediaDevices.enumerateDevices = async () => { throw new Error('Unavailable'); };
    assert.equal(await camera.start(), true);
    assert.equal(camera.state().running, true);
    assert.equal(track.stopped, false);
    assert.equal(camera.state().canSwitch, false);
    camera.stop();
});

test('device enumeration does not block startup even when it never resolves', async context => {
    const { camera, mediaDevices } = environment(context);
    mediaDevices.enumerateDevices = () => new Promise(() => {});
    assert.equal(await camera.start(), true);
    camera.stop();
});

test('stop cancels a pending permission request and closes a late stream', async context => {
    const { camera, mediaDevices, stream, track, video } = environment(context);
    let grant;
    mediaDevices.getUserMedia = () => new Promise(resolve => { grant = resolve; });
    const pending = camera.start();
    camera.stop();
    grant(stream);
    assert.equal(await pending, false);
    assert.equal(track.stopped, true);
    assert.equal(video.srcObject, null);
});

test('a rejected old play request does not stop a newer camera stream', async context => {
    const { camera, mediaDevices, video, stream } = environment(context);
    let rejectPlay;
    video.play = () => new Promise((resolve, reject) => { rejectPlay = reject; });
    const pending = camera.start();
    await Promise.resolve();
    camera.stop();
    const newTrack = { stopped: false, stop() { this.stopped = true; } };
    const newStream = { getTracks: () => [newTrack], getVideoTracks: () => [newTrack] };
    mediaDevices.getUserMedia = async () => newStream;
    video.play = async () => {};
    assert.equal(await camera.start(), true);
    rejectPlay(new Error('Playback interrupted'));
    assert.equal(await pending, false);
    assert.equal(camera.stream, newStream);
    assert.notEqual(camera.stream, stream);
    assert.equal(newTrack.stopped, false);
    camera.stop();
});

test('unsupported capability queries do not break an otherwise working camera', async context => {
    const { camera, track } = environment(context);
    track.getCapabilities = () => { throw new Error('Unsupported'); };
    assert.equal(await camera.start(), true);
    assert.equal(camera.state().canTorch, false);
    camera.stop();
});

test('insecure origins explain the HTTPS requirement instead of requesting a camera', async context => {
    const { camera, mediaDevices } = environment(context);
    window.isSecureContext = false;
    mediaDevices.getUserMedia = () => assert.fail('Camera must not be requested');
    await assert.rejects(camera.start(), /HTTPS/);
});
