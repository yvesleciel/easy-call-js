import { NEVER, Subject, of } from 'rxjs';

import { CallProcessService } from '../services/call-process.service';
import { ICallProcessService, TakeCallOptions } from '../core/call/driving/call-process';
import { CallEvent } from '../core/call/driving/call-events';
import {
    CallProcessSignaling,
    RTCExchangeDataType,
} from '../core/call/driven/call-process-signaling';
import { IMediaService } from '../core/call/driven/media.service';
import { IWebRTCService } from '../core/call/driven/webrtc.service';
import { CallJoinTimeoutError, ValidationError } from '../shared/errors/call-error';

// Diagnostic logging is not observable behavior (see SKILL.md > Logging).
jest.mock('../shared/utils/logger', () => {
    const silent = {
        debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn(),
    };
    return {
        LogLevel: { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 },
        Logger: { getInstance: () => silent },
    };
});

// ---------------------------------------------------------------------------

const CALL_ID = 'call-42';
const ISSUER = 'caller-1';
const PARTICIPANTS = ['alice', 'bob'];

// ---------------------------------------------------------------------------
// Doubles at the unmanaged dependency boundaries
// ---------------------------------------------------------------------------

function createStream(): MediaStream {
    return {
        getTracks: () => [],
        getVideoTracks: () => [],
        getAudioTracks: () => [],
    } as unknown as MediaStream;
}

function createRtcConnection(): RTCPeerConnection {
    return {
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        close: jest.fn(),
    } as unknown as RTCPeerConnection;
}

function createSignaling(): jest.Mocked<CallProcessSignaling> {
    return {
        createCall: jest.fn().mockResolvedValue(CALL_ID),
        onNewCall: jest.fn().mockResolvedValue({ callId: 'incoming-call' }),
        onLeaveCall: jest.fn().mockReturnValue(NEVER),
        joinCall: jest.fn().mockResolvedValue(undefined),
        acquireLock: jest.fn().mockResolvedValue(true),
        releaseLock: jest.fn(),
        getAlreadyParticipants: jest.fn().mockResolvedValue([]),
        getParticipantNotInCall: jest.fn().mockResolvedValue([]),
        listenForLockRelease: jest.fn(),
        releaseCall: jest.fn().mockResolvedValue(undefined),
        rejectCall: jest.fn().mockResolvedValue(undefined),
        writeOfferOrAnswerOrIce: jest.fn(),
        onReadOfferOrAnswerOrIce: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<CallProcessSignaling>;
}

function createMedia(): jest.Mocked<IMediaService> {
    return {
        getUserMedia: jest.fn().mockResolvedValue(createStream()),
        getAvailableDevices: jest.fn().mockResolvedValue([]),
        stopAllTracks: jest.fn(),
        cleanup: jest.fn(),
    } as unknown as jest.Mocked<IMediaService>;
}

function createWebRTC(): jest.Mocked<IWebRTCService> {
    return {
        createConnection: jest.fn().mockResolvedValue(createRtcConnection()),
        createOffer: jest.fn().mockResolvedValue({ type: 'offer', sdp: 'x' }),
        createAnswer: jest.fn().mockResolvedValue({ type: 'answer', sdp: 'x' }),
        setRemoteDescription: jest.fn().mockResolvedValue(undefined),
        addIceCandidate: jest.fn().mockResolvedValue(undefined),
        addTrack: jest.fn(),
        cleanup: jest.fn(),
        closeConnection: jest.fn(),
    } as unknown as jest.Mocked<IWebRTCService>;
}

type Doubles = {
    signaling: jest.Mocked<CallProcessSignaling>;
    media: jest.Mocked<IMediaService>;
    webrtc: jest.Mocked<IWebRTCService>;
};

function buildSut(overrides: Partial<Doubles> = {}): Doubles & { sut: CallProcessService } {
    const signaling = overrides.signaling ?? createSignaling();
    const media = overrides.media ?? createMedia();
    const webrtc = overrides.webrtc ?? createWebRTC();
    const sut = new CallProcessService(signaling, media, webrtc);
    return { sut, signaling, media, webrtc };
}

function collectEvents(sut: ICallProcessService): CallEvent[] {
    const events: CallEvent[] = [];
    sut.events$.subscribe(e => events.push(e));
    return events;
}

function offerRecipients(signaling: jest.Mocked<CallProcessSignaling>): string[] {
    return signaling.writeOfferOrAnswerOrIce.mock.calls
        .filter(([, , type]) => type === RTCExchangeDataType.OFFER)
        .map(([, participantId]) => participantId as string)
        .sort();
}

const flush = () => new Promise(resolve => setImmediate(resolve));

// ---------------------------------------------------------------------------
// Specs
// ---------------------------------------------------------------------------

describe('CallProcessService', () => {

    describe('startCall', () => {

        it('returns the id of the call created by the signaling layer', async () => {
            const { sut, signaling } = buildSut();
            signaling.createCall.mockResolvedValue('new-call-id');

            const result = await sut.startCall(ISSUER, PARTICIPANTS);

            expect(result).toBe('new-call-id');
        });

        it('publishes LocalStreamReady with the captured local stream', async () => {
            const localStream = createStream();
            const media = createMedia();
            media.getUserMedia.mockResolvedValue(localStream);
            const { sut } = buildSut({ media });
            const events = collectEvents(sut);

            await sut.startCall(ISSUER, PARTICIPANTS);

            expect(events).toContainEqual({ kind: 'LocalStreamReady', stream: localStream });
        });

        it('sends an OFFER to every requested participant', async () => {
            const { sut, signaling } = buildSut();

            await sut.startCall(ISSUER, PARTICIPANTS);

            expect(offerRecipients(signaling)).toEqual([...PARTICIPANTS].sort());
        });

        it('publishes Joined once the call is established', async () => {
            const { sut } = buildSut();
            const events = collectEvents(sut);

            await sut.startCall(ISSUER, PARTICIPANTS);

            expect(events).toContainEqual({ kind: 'Joined', callId: CALL_ID });
        });

        it('rejects with a validation error when the issuer id is blank', async () => {
            const { sut } = buildSut();

            await expect(sut.startCall('   ', PARTICIPANTS)).rejects.toThrow(ValidationError);
        });

        it('rejects with a validation error when any user id in the list is blank', async () => {
            const { sut } = buildSut();

            await expect(sut.startCall(ISSUER, ['alice', ''])).rejects.toThrow(ValidationError);
        });

        it('rejects with a validation error when the users list is empty', async () => {
            const { sut } = buildSut();

            await expect(sut.startCall(ISSUER, [])).rejects.toThrow(ValidationError);
        });

        it('surfaces a signaling createCall failure to the caller', async () => {
            const { sut, signaling } = buildSut();
            const boom = new Error('signaling unavailable');
            signaling.createCall.mockRejectedValue(boom);

            await expect(sut.startCall(ISSUER, PARTICIPANTS)).rejects.toBe(boom);
        });

        it('does not create the call at signaling when local media cannot be captured', async () => {
            const media = createMedia();
            const mediaFailure = new Error('camera denied');
            media.getUserMedia.mockRejectedValue(mediaFailure);
            const { sut, signaling } = buildSut({ media });

            await expect(sut.startCall(ISSUER, PARTICIPANTS)).rejects.toBe(mediaFailure);
            expect(signaling.createCall).not.toHaveBeenCalled();
            expect(signaling.writeOfferOrAnswerOrIce).not.toHaveBeenCalled();
        });

        it('still delivers offers to the healthy participants when one connection fails', async () => {
            const webrtc = createWebRTC();
            webrtc.createConnection
                .mockResolvedValueOnce(createRtcConnection())
                .mockRejectedValueOnce(new Error('ICE gathering failed'));
            const { sut, signaling } = buildSut({ webrtc });

            await sut.startCall(ISSUER, PARTICIPANTS);

            expect(offerRecipients(signaling)).toEqual(['alice']);
        });
    });

    describe('takeCall', () => {

        it('publishes LocalStreamReady once the local media is captured', async () => {
            const localStream = createStream();
            const media = createMedia();
            media.getUserMedia.mockResolvedValue(localStream);
            const { sut } = buildSut({ media });
            const events = collectEvents(sut);

            // Fire and forget — no lock release, no Joined; takeCall stays pending.
            sut.takeCall('participant-9', CALL_ID, { joinTimeoutMs: 60_000 }).catch(() => {});
            await flush();

            expect(events).toContainEqual({ kind: 'LocalStreamReady', stream: localStream });
        });

        it('rejects with a validation error when the participant id is blank', async () => {
            const { sut } = buildSut();

            await expect(sut.takeCall('', CALL_ID)).rejects.toThrow(ValidationError);
        });

        it('rejects with a validation error when the call id is blank', async () => {
            const { sut } = buildSut();

            await expect(sut.takeCall('participant-9', '   ')).rejects.toThrow(ValidationError);
        });

        it('aborts without emitting any signaling command when the local media capture fails', async () => {
            const media = createMedia();
            media.getUserMedia.mockRejectedValue(new Error('no devices'));
            const { sut, signaling } = buildSut({ media });

            await expect(sut.takeCall('p', CALL_ID)).rejects.toThrow('no devices');

            expect(signaling.joinCall).not.toHaveBeenCalled();
            expect(signaling.writeOfferOrAnswerOrIce).not.toHaveBeenCalled();
        });

        it('rejects with CallJoinTimeoutError when no join event is observed within the deadline', async () => {
            jest.useFakeTimers();
            try {
                const { sut } = buildSut();

                // Attach a swallowing catch upfront so the rejection that fires
                // during advanceTimers isn't reported as unhandled.
                let caught: unknown;
                const takePromise = sut
                    .takeCall('participant-9', CALL_ID, { joinTimeoutMs: 500 })
                    .catch(err => { caught = err; });

                await jest.advanceTimersByTimeAsync(600);
                await takePromise;

                expect(caught).toBeInstanceOf(CallJoinTimeoutError);
            } finally {
                jest.useRealTimers();
            }
        });

        // Controller-level integration test — drives the lock callback to prove
        // the take resolves once the join negotiation completes. This test is
        // coupled to the lock-callback coordination; if that mechanism changes,
        // the setup must be revisited (assertion remains valid).
        it('resolves once the join negotiation completes and publishes Joined', async () => {
            const signaling = createSignaling();
            let triggerJoin: (() => Promise<void>) | undefined;
            signaling.listenForLockRelease.mockImplementation((_c, _p, cb) => {
                triggerJoin = cb as () => Promise<void>;
            });
            const { sut } = buildSut({ signaling });
            const events = collectEvents(sut);

            const takePromise = sut.takeCall('participant-9', CALL_ID);
            await flush();
            expect(triggerJoin).toBeDefined();
            await triggerJoin!();

            await expect(takePromise).resolves.toBeUndefined();
            expect(events).toContainEqual({ kind: 'Joined', callId: CALL_ID });
        });
    });

    describe('trackIncomingCalls', () => {

        it('returns the id of the next incoming call reported by the signaling layer', async () => {
            const { sut, signaling } = buildSut();
            signaling.onNewCall.mockResolvedValue({ callId: 'inbound-77', from: 'alice' });

            const result = await sut.trackIncomingCalls('user-x');

            expect(result).toEqual({ callId: 'inbound-77', from: 'alice' });
        });

        it('publishes an IncomingCall event when a new call is reported', async () => {
            const { sut, signaling } = buildSut();
            signaling.onNewCall.mockResolvedValue({ callId: 'inbound-77', from: 'alice' });
            const events = collectEvents(sut);

            await sut.trackIncomingCalls('user-x');

            expect(events).toContainEqual({ kind: 'IncomingCall', callId: 'inbound-77', from: 'alice' });
        });

        it('forwards the caller id when the signaling backend does not expose it', async () => {
            const { sut, signaling } = buildSut();
            signaling.onNewCall.mockResolvedValue({ callId: 'x' });
            const events = collectEvents(sut);

            const result = await sut.trackIncomingCalls('user-x');

            expect(result).toEqual({ callId: 'x', from: undefined });
            expect(events).toContainEqual({ kind: 'IncomingCall', callId: 'x', from: undefined });
        });

        it('rejects with a validation error when the user id is blank', async () => {
            const { sut } = buildSut();

            await expect(sut.trackIncomingCalls('')).rejects.toThrow(ValidationError);
        });

        it('surfaces signaling failures to the caller', async () => {
            const { sut, signaling } = buildSut();
            const boom = new Error('lost connection');
            signaling.onNewCall.mockRejectedValue(boom);

            await expect(sut.trackIncomingCalls('user-x')).rejects.toBe(boom);
        });
    });

    describe('releaseCall', () => {

        it('releases the call at the signaling layer on behalf of the given user', async () => {
            const { sut, signaling } = buildSut();

            await sut.releaseCall(CALL_ID, 'user-1');

            expect(signaling.releaseCall).toHaveBeenCalledWith(CALL_ID, 'user-1');
        });

        it('publishes Left and CallEnded events after a successful release', async () => {
            const { sut } = buildSut();
            const events = collectEvents(sut);

            await sut.releaseCall(CALL_ID, 'user-1');

            expect(events).toContainEqual({ kind: 'Left', callId: CALL_ID, userId: 'user-1' });
            expect(events).toContainEqual({ kind: 'CallEnded', callId: CALL_ID, reason: 'released' });
        });

        it('rejects with a validation error when the call id is blank', async () => {
            const { sut, signaling } = buildSut();

            await expect(sut.releaseCall('', 'user-1')).rejects.toThrow(ValidationError);
            expect(signaling.releaseCall).not.toHaveBeenCalled();
        });

        it('rejects with a validation error when the user id is blank', async () => {
            const { sut, signaling } = buildSut();

            await expect(sut.releaseCall(CALL_ID, '   ')).rejects.toThrow(ValidationError);
            expect(signaling.releaseCall).not.toHaveBeenCalled();
        });

        it('surfaces signaling failures to the caller', async () => {
            const { sut, signaling } = buildSut();
            const boom = new Error('release failed');
            signaling.releaseCall.mockRejectedValue(boom);

            await expect(sut.releaseCall(CALL_ID, 'user-1')).rejects.toBe(boom);
        });
    });

    describe('rejectCall', () => {

        it('rejects the incoming call at the signaling layer', async () => {
            const { sut, signaling } = buildSut();

            await sut.rejectCall('user-1');

            expect(signaling.rejectCall).toHaveBeenCalledWith('user-1');
        });

        it('rejects with a validation error when the user id is blank', async () => {
            const { sut, signaling } = buildSut();

            await expect(sut.rejectCall('')).rejects.toThrow(ValidationError);
            expect(signaling.rejectCall).not.toHaveBeenCalled();
        });

        it('surfaces signaling failures to the caller', async () => {
            const { sut, signaling } = buildSut();
            const boom = new Error('reject failed');
            signaling.rejectCall.mockRejectedValue(boom);

            await expect(sut.rejectCall('user-1')).rejects.toBe(boom);
        });
    });

    describe('leave notifications', () => {

        it('republishes signaling leave notifications as ParticipantLeft events during a call', async () => {
            const leaves = new Subject<string>();
            const signaling = createSignaling();
            signaling.onLeaveCall.mockReturnValue(leaves.asObservable());
            const { sut } = buildSut({ signaling });
            const events = collectEvents(sut);

            await sut.startCall(ISSUER, PARTICIPANTS);
            leaves.next('alice');

            expect(events).toContainEqual({ kind: 'ParticipantLeft', participantId: 'alice' });
        });
    });

    describe('cleanup', () => {

        it('releases resources at every underlying adapter', async () => {
            const { sut, media, webrtc } = buildSut();

            await sut.cleanup();

            expect(media.cleanup).toHaveBeenCalledTimes(1);
            expect(webrtc.cleanup).toHaveBeenCalledTimes(1);
        });

        it('completes successfully even when one adapter fails to clean up', async () => {
            const media = createMedia();
            media.cleanup.mockImplementation(() => { throw new Error('media stuck'); });
            const { sut, webrtc } = buildSut({ media });

            await expect(sut.cleanup()).resolves.toBeUndefined();
            expect(webrtc.cleanup).toHaveBeenCalledTimes(1);
        });
    });
});
