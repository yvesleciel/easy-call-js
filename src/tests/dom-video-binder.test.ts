/**
 * @jest-environment jsdom
 */
import { Subject } from 'rxjs';

import { DomVideoBinder } from '../dom/dom-video-binder';
import { CallEvent } from '../core/call/driving/call-events';

const LOCAL_ID = 'local-video';
const REMOTE_CONTAINER_ID = 'remote-container';

function createStream(): MediaStream {
    return {
        getTracks: () => [{ stop: jest.fn() } as unknown as MediaStreamTrack],
        getVideoTracks: () => [],
        getAudioTracks: () => [],
    } as unknown as MediaStream;
}

function setupDom(): { local: HTMLVideoElement; container: HTMLDivElement } {
    document.body.innerHTML = '';
    const local = document.createElement('video');
    local.id = LOCAL_ID;
    const container = document.createElement('div');
    container.id = REMOTE_CONTAINER_ID;
    document.body.append(local, container);
    return { local, container };
}

describe('DomVideoBinder', () => {

    it('attaches the local stream to the pre-existing local video element on LocalStreamReady', () => {
        const { local } = setupDom();
        const events = new Subject<CallEvent>();
        const binder = new DomVideoBinder({ localVideoSelector: LOCAL_ID, remoteContainerId: REMOTE_CONTAINER_ID });
        binder.attach(events.asObservable());

        const stream = createStream();
        events.next({ kind: 'LocalStreamReady', stream });

        expect(local.srcObject).toBe(stream);
        expect(local.muted).toBe(true);
    });

    it('creates and mounts a remote video element in the container on RemoteStreamAvailable', () => {
        const { container } = setupDom();
        const events = new Subject<CallEvent>();
        const binder = new DomVideoBinder({ localVideoSelector: LOCAL_ID, remoteContainerId: REMOTE_CONTAINER_ID });
        binder.attach(events.asObservable());

        const stream = createStream();
        events.next({ kind: 'RemoteStreamAvailable', participantId: 'alice', stream });

        const remote = document.getElementById('remotealice') as HTMLVideoElement | null;
        expect(remote).not.toBeNull();
        expect(remote!.srcObject).toBe(stream);
        expect(remote!.parentElement).toBe(container);
    });

    it('removes the remote video element from the DOM on ParticipantLeft', () => {
        setupDom();
        const events = new Subject<CallEvent>();
        const binder = new DomVideoBinder({ localVideoSelector: LOCAL_ID, remoteContainerId: REMOTE_CONTAINER_ID });
        binder.attach(events.asObservable());

        events.next({ kind: 'RemoteStreamAvailable', participantId: 'bob', stream: createStream() });
        expect(document.getElementById('remotebob')).not.toBeNull();

        events.next({ kind: 'ParticipantLeft', participantId: 'bob' });

        expect(document.getElementById('remotebob')).toBeNull();
    });

    it('removes the remote video element on RemoteStreamLost', () => {
        setupDom();
        const events = new Subject<CallEvent>();
        const binder = new DomVideoBinder({ localVideoSelector: LOCAL_ID, remoteContainerId: REMOTE_CONTAINER_ID });
        binder.attach(events.asObservable());

        events.next({ kind: 'RemoteStreamAvailable', participantId: 'carol', stream: createStream() });
        events.next({ kind: 'RemoteStreamLost', participantId: 'carol' });

        expect(document.getElementById('remotecarol')).toBeNull();
    });

    it('detaches the local stream on LocalStreamStopped', () => {
        const { local } = setupDom();
        const events = new Subject<CallEvent>();
        const binder = new DomVideoBinder({ localVideoSelector: LOCAL_ID, remoteContainerId: REMOTE_CONTAINER_ID });
        binder.attach(events.asObservable());

        events.next({ kind: 'LocalStreamReady', stream: createStream() });
        expect(local.srcObject).not.toBeNull();

        events.next({ kind: 'LocalStreamStopped' });

        expect(local.srcObject).toBeNull();
    });

    it('leaves the DOM untouched when the configured local element is missing', () => {
        document.body.innerHTML = '';
        const container = document.createElement('div');
        container.id = REMOTE_CONTAINER_ID;
        document.body.appendChild(container);
        // Silence the diagnostic warning — but do not assert on it (see SKILL.md > Logging).
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
        const events = new Subject<CallEvent>();
        const binder = new DomVideoBinder({ localVideoSelector: LOCAL_ID, remoteContainerId: REMOTE_CONTAINER_ID });
        binder.attach(events.asObservable());

        events.next({ kind: 'LocalStreamReady', stream: createStream() });

        expect(document.getElementById(LOCAL_ID)).toBeNull();
        warn.mockRestore();
    });

    it('leaves the DOM untouched when the remote container is missing on a remote stream', () => {
        document.body.innerHTML = '';
        const local = document.createElement('video');
        local.id = LOCAL_ID;
        document.body.appendChild(local);
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
        const events = new Subject<CallEvent>();
        const binder = new DomVideoBinder({ localVideoSelector: LOCAL_ID, remoteContainerId: REMOTE_CONTAINER_ID });
        binder.attach(events.asObservable());

        events.next({ kind: 'RemoteStreamAvailable', participantId: 'eve', stream: createStream() });

        expect(document.getElementById('remoteeve')).toBeNull();
        warn.mockRestore();
    });

    it('ignores unrelated events without side effects', () => {
        const { local, container } = setupDom();
        const events = new Subject<CallEvent>();
        const binder = new DomVideoBinder({ localVideoSelector: LOCAL_ID, remoteContainerId: REMOTE_CONTAINER_ID });
        binder.attach(events.asObservable());

        events.next({ kind: 'Joined', callId: 'call-1' });
        events.next({ kind: 'IncomingCall', callId: 'call-2' });

        expect(local.srcObject).toBeFalsy();
        expect(container.children.length).toBe(0);
    });

    it('removes all managed video elements on detach', () => {
        setupDom();
        const events = new Subject<CallEvent>();
        const binder = new DomVideoBinder({ localVideoSelector: LOCAL_ID, remoteContainerId: REMOTE_CONTAINER_ID });
        binder.attach(events.asObservable());

        events.next({ kind: 'RemoteStreamAvailable', participantId: 'alice', stream: createStream() });
        events.next({ kind: 'RemoteStreamAvailable', participantId: 'bob', stream: createStream() });

        binder.detach();

        expect(document.getElementById('remotealice')).toBeNull();
        expect(document.getElementById('remotebob')).toBeNull();
    });
});
