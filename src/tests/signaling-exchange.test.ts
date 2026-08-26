import { Subject } from 'rxjs';

import { SignalingExchange } from '../core/call/domain/signaling-exchange';
import {
    CallProcessSignaling,
    RTCExchangeDataType,
} from '../core/call/driven/call-process-signaling';
import { IWebRTCService } from '../core/call/driven/webrtc.service';
import { ResourceManager } from '../core/call/driven/resource-manager.service';
import { AnswerHandler, IceHandler, OfferHandler } from '../core/call/handlers/callback-handlers';
import { CallEvent } from '../core/call/driving/call-events';

jest.mock('../shared/utils/logger', () => {
    const silent = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
    return { LogLevel: {}, Logger: { getInstance: () => silent } };
});

const CALL_ID = 'call-42';
const MY_ID = 'me';
const PEER_ID = 'peer-1';

// ---------------------------------------------------------------------------
// Doubles
// ---------------------------------------------------------------------------

type EventListeners = Record<string, (event: any) => void>;

function createConnection(): { connection: RTCPeerConnection; listeners: EventListeners } {
    const listeners: EventListeners = {};
    const connection = {
        addEventListener: jest.fn((event: string, handler: (e: any) => void) => {
            listeners[event] = handler;
        }),
        connectionState: 'new' as RTCPeerConnectionState,
        close: jest.fn(),
    } as unknown as RTCPeerConnection;
    return { connection, listeners };
}

function createStream(): MediaStream {
    return {
        getTracks: () => [{ kind: 'video' } as MediaStreamTrack],
        getVideoTracks: () => [],
        getAudioTracks: () => [],
    } as unknown as MediaStream;
}

function createWebRTC(connection: RTCPeerConnection): jest.Mocked<IWebRTCService> {
    return {
        createConnection: jest.fn().mockResolvedValue(connection),
        createOffer: jest.fn().mockResolvedValue({ type: 'offer', sdp: 'x' }),
        createAnswer: jest.fn().mockResolvedValue({ type: 'answer', sdp: 'x' }),
        setRemoteDescription: jest.fn().mockResolvedValue(undefined),
        addIceCandidate: jest.fn().mockResolvedValue(undefined),
        addTrack: jest.fn(),
        cleanup: jest.fn(),
        closeConnection: jest.fn(),
    } as unknown as jest.Mocked<IWebRTCService>;
}

function createSignaling(): jest.Mocked<CallProcessSignaling> {
    return {
        writeOfferOrAnswerOrIce: jest.fn(),
        onReadOfferOrAnswerOrIce: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<CallProcessSignaling>;
}

function build() {
    const { connection, listeners } = createConnection();
    const webrtc = createWebRTC(connection);
    const signaling = createSignaling();
    const resourceManager = new ResourceManager();
    const events = new Subject<CallEvent>();
    const exchange = new SignalingExchange(signaling, webrtc, resourceManager, events);
    return { exchange, connection, listeners, webrtc, signaling, events };
}

function collect(events: Subject<CallEvent>): CallEvent[] {
    const out: CallEvent[] = [];
    events.subscribe(e => out.push(e));
    return out;
}

// ---------------------------------------------------------------------------
// Specs
// ---------------------------------------------------------------------------

describe('SignalingExchange — initiator role', () => {

    it('sends an OFFER for the peer through the signaling layer', async () => {
        const { exchange, signaling } = build();

        await exchange.negotiate({
            callId: CALL_ID, myId: MY_ID, peerId: PEER_ID, localStream: createStream(), role: 'initiator',
        });

        expect(signaling.writeOfferOrAnswerOrIce).toHaveBeenCalledWith(
            CALL_ID,
            PEER_ID,
            RTCExchangeDataType.OFFER,
            expect.objectContaining({ issuer: MY_ID }),
        );
    });

    it('registers an ANSWER handler routed by the peer for this call', async () => {
        const { exchange, signaling } = build();

        await exchange.negotiate({
            callId: CALL_ID, myId: MY_ID, peerId: PEER_ID, localStream: createStream(), role: 'initiator',
        });

        const answerRegistration = signaling.onReadOfferOrAnswerOrIce.mock.calls
            .find(call => call[3] === RTCExchangeDataType.ANSWER);
        expect(answerRegistration).toBeDefined();
        expect(answerRegistration![0]).toBe(CALL_ID);
        expect(answerRegistration![1]).toBe(MY_ID);
        expect(answerRegistration![2]).toBe(PEER_ID);
        expect(answerRegistration![4]).toBeInstanceOf(AnswerHandler);
    });

    it('adds every local track to the RTC connection', async () => {
        const { exchange, webrtc, connection } = build();
        const track1 = { kind: 'audio' } as MediaStreamTrack;
        const track2 = { kind: 'video' } as MediaStreamTrack;
        const stream = { getTracks: () => [track1, track2] } as unknown as MediaStream;

        await exchange.negotiate({
            callId: CALL_ID, myId: MY_ID, peerId: PEER_ID, localStream: stream, role: 'initiator',
        });

        expect(webrtc.addTrack).toHaveBeenCalledWith(connection, track1, stream);
        expect(webrtc.addTrack).toHaveBeenCalledWith(connection, track2, stream);
    });
});

describe('SignalingExchange — joiner role', () => {

    it('does NOT send an OFFER — instead registers an OfferHandler that will answer', async () => {
        const { exchange, signaling } = build();

        await exchange.negotiate({
            callId: CALL_ID, myId: MY_ID, peerId: PEER_ID, localStream: createStream(), role: 'joiner',
        });

        const offerWrites = signaling.writeOfferOrAnswerOrIce.mock.calls
            .filter(call => call[2] === RTCExchangeDataType.OFFER);
        expect(offerWrites).toEqual([]);

        const offerRegistration = signaling.onReadOfferOrAnswerOrIce.mock.calls
            .find(call => call[3] === RTCExchangeDataType.OFFER);
        expect(offerRegistration).toBeDefined();
        expect(offerRegistration![4]).toBeInstanceOf(OfferHandler);
    });

    it('registers an ICE handler for the peer', async () => {
        const { exchange, signaling } = build();

        await exchange.negotiate({
            callId: CALL_ID, myId: MY_ID, peerId: PEER_ID, localStream: createStream(), role: 'joiner',
        });

        const iceRegistration = signaling.onReadOfferOrAnswerOrIce.mock.calls
            .find(call => call[3] === RTCExchangeDataType.ICE);
        expect(iceRegistration).toBeDefined();
        expect(iceRegistration![4]).toBeInstanceOf(IceHandler);
    });
});

describe('SignalingExchange — event publication', () => {

    it('publishes RemoteStreamAvailable when the peer connection emits a track with streams', async () => {
        const { exchange, listeners, events } = build();
        const collected = collect(events);
        const remoteStream = createStream();

        await exchange.negotiate({
            callId: CALL_ID, myId: MY_ID, peerId: PEER_ID, localStream: createStream(), role: 'initiator',
        });
        listeners['track']({ track: { kind: 'video' }, streams: [remoteStream] });

        expect(collected).toContainEqual({
            kind: 'RemoteStreamAvailable',
            participantId: PEER_ID,
            stream: remoteStream,
        });
    });

    it('publishes PeerConnectionStateChanged when the RTC connection state transitions', async () => {
        const { exchange, listeners, connection, events } = build();
        const collected = collect(events);

        await exchange.negotiate({
            callId: CALL_ID, myId: MY_ID, peerId: PEER_ID, localStream: createStream(), role: 'initiator',
        });
        (connection as any).connectionState = 'connected';
        listeners['connectionstatechange']({});

        expect(collected).toContainEqual({
            kind: 'PeerConnectionStateChanged',
            participantId: PEER_ID,
            state: 'connected',
        });
    });

    it('forwards local ICE candidates to signaling as they are gathered', async () => {
        const { exchange, listeners, signaling } = build();

        await exchange.negotiate({
            callId: CALL_ID, myId: MY_ID, peerId: PEER_ID, localStream: createStream(), role: 'initiator',
        });
        listeners['icecandidate']({
            candidate: { candidate: 'candidate:1', sdpMid: '0', sdpMLineIndex: 0 },
        });

        expect(signaling.writeOfferOrAnswerOrIce).toHaveBeenCalledWith(
            CALL_ID,
            PEER_ID,
            RTCExchangeDataType.ICE,
            expect.objectContaining({
                ice: expect.objectContaining({ candidate: 'candidate:1', sdpMid: '0', sdpMLineIndex: 0 }),
                issuer: MY_ID,
            }),
        );
    });

    it('ignores icecandidate events with a null candidate (end-of-gathering signal)', async () => {
        const { exchange, listeners, signaling } = build();

        await exchange.negotiate({
            callId: CALL_ID, myId: MY_ID, peerId: PEER_ID, localStream: createStream(), role: 'initiator',
        });
        const before = signaling.writeOfferOrAnswerOrIce.mock.calls.length;

        listeners['icecandidate']({ candidate: null });

        expect(signaling.writeOfferOrAnswerOrIce.mock.calls.length).toBe(before);
    });
});
