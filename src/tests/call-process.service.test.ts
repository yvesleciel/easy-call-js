import { of, throwError, firstValueFrom, lastValueFrom } from 'rxjs';

import { CallProcessService } from '../main/services/call-process.service';
import {
    CallProcessSignaling,
    RTCExchangeDataType,
} from '../main/core/call/driven/call-process-signaling';
import { IMediaService } from '../main/core/call/driven/media.service';
import { IVideoUIService } from '../main/core/call/driven/video-ui.service';
import { IWebRTCService } from '../main/core/call/driven/webrtc.service';
import { CallParam } from '../main/core/call/validators/call-validators';
import { ValidationError } from '../main/shared/errors/call-error';

// Diagnostic logging is not observable behavior (see skill.md > Logging).
// Silence it at the module boundary, but never assert on its calls.
jest.mock('../main/shared/utils/logger', () => {
    const silent = {
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    };
    return {
        LogLevel: { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 },
        Logger: { getInstance: () => silent },
    };
});

// ---------------------------------------------------------------------------
// Fixture data — expressive, immutable, visible inside every scenario.
// ---------------------------------------------------------------------------

const CALL_ID = 'call-42';
const ISSUER = 'caller-1';
const PARTICIPANTS = ['alice', 'bob'];
const VALID_CALL_PARAM: CallParam = Object.freeze({
    usersToCallId: [...PARTICIPANTS],
    callIssuerId: ISSUER,
    localVideoSelector: 'local-video',
    idContentForCall: 'video-container',
}) as CallParam;

// ---------------------------------------------------------------------------
// Test doubles at the *unmanaged* dependency boundaries only
// (signaling → other peers; media/video/webrtc → browser APIs & DOM).
// Every double is created fresh per test — no shared mutable fixtures.
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
        onNewCall: jest.fn().mockResolvedValue('incoming-call'),
        onLeaveCall: jest.fn().mockReturnValue(of('left')),
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

function createVideoUI(): jest.Mocked<IVideoUIService> {
    return {
        createVideoElement: jest.fn(),
        attachStream: jest.fn(),
        removeVideo: jest.fn(),
        getVideoElement: jest.fn(),
        cleanup: jest.fn(),
    } as unknown as jest.Mocked<IVideoUIService>;
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
    videoUI: jest.Mocked<IVideoUIService>;
    webrtc: jest.Mocked<IWebRTCService>;
};

function buildSut(overrides: Partial<Doubles> = {}): Doubles & { sut: CallProcessService } {
    const signaling = overrides.signaling ?? createSignaling();
    const media = overrides.media ?? createMedia();
    const videoUI = overrides.videoUI ?? createVideoUI();
    const webrtc = overrides.webrtc ?? createWebRTC();
    const sut = new CallProcessService(signaling, media, videoUI, webrtc);
    return { sut, signaling, media, videoUI, webrtc };
}

function offerRecipients(signaling: jest.Mocked<CallProcessSignaling>): string[] {
    return signaling.writeOfferOrAnswerOrIce.mock.calls
        .filter(([, , type]) => type === RTCExchangeDataType.OFFER)
        .map(([, participantId]) => participantId as string)
        .sort();
}

// ---------------------------------------------------------------------------
// Behavior specs
// ---------------------------------------------------------------------------

describe('CallProcessService', () => {

    describe('initializeCall', () => {

        it('returns the id of the call created by the signaling layer', async () => {
            const { sut, signaling } = buildSut();
            signaling.createCall.mockResolvedValue('new-call-id');

            const result = await sut.initializeCall(ISSUER, PARTICIPANTS);

            expect(result).toBe('new-call-id');
        });

        it('rejects with a validation error when the issuer id is blank', async () => {
            const { sut } = buildSut();

            await expect(sut.initializeCall('   ', PARTICIPANTS))
                .rejects.toThrow(ValidationError);
        });

        it('rejects with a validation error when any user id in the list is blank', async () => {
            const { sut } = buildSut();

            await expect(sut.initializeCall(ISSUER, ['alice', '']))
                .rejects.toThrow(ValidationError);
        });

        it('surfaces a signaling failure to the caller', async () => {
            const { sut, signaling } = buildSut();
            const boom = new Error('signaling unavailable');
            signaling.createCall.mockRejectedValue(boom);

            await expect(sut.initializeCall(ISSUER, PARTICIPANTS)).rejects.toBe(boom);
        });
    });

    describe('launchCall', () => {

        it('attaches the local stream to the local video and sends an offer to every requested participant', async () => {
            const localStream = createStream();
            const media = createMedia();
            media.getUserMedia.mockResolvedValue(localStream);
            const { sut, signaling, videoUI } = buildSut({ media });

            await sut.launchCall(VALID_CALL_PARAM, CALL_ID);

            expect(videoUI.attachStream)
                .toHaveBeenCalledWith(VALID_CALL_PARAM.localVideoSelector, localStream);
            expect(offerRecipients(signaling)).toEqual([...PARTICIPANTS].sort());
        });

        it('rejects with a validation error when the participant list is empty', async () => {
            const { sut } = buildSut();
            const invalidParam: CallParam = { ...VALID_CALL_PARAM, usersToCallId: [] };

            await expect(sut.launchCall(invalidParam, CALL_ID))
                .rejects.toThrow(ValidationError);
        });

        it('rejects with a validation error when the call id is blank', async () => {
            const { sut } = buildSut();

            await expect(sut.launchCall(VALID_CALL_PARAM, '  '))
                .rejects.toThrow(ValidationError);
        });

        it('aborts the launch when the local media cannot be captured', async () => {
            const media = createMedia();
            const mediaFailure = new Error('camera denied');
            media.getUserMedia.mockRejectedValue(mediaFailure);
            const { sut, signaling } = buildSut({ media });

            await expect(sut.launchCall(VALID_CALL_PARAM, CALL_ID)).rejects.toBe(mediaFailure);
            expect(signaling.writeOfferOrAnswerOrIce).not.toHaveBeenCalled();
        });

        it('still delivers offers to the healthy participants when one connection fails', async () => {
            const webrtc = createWebRTC();
            webrtc.createConnection
                .mockResolvedValueOnce(createRtcConnection())
                .mockRejectedValueOnce(new Error('ICE gathering failed'));
            const { sut, signaling } = buildSut({ webrtc });

            await sut.launchCall(VALID_CALL_PARAM, CALL_ID);

            // Only the participant whose connection succeeded receives an offer.
            expect(offerRecipients(signaling)).toEqual(['alice']);
        });
    });

    describe('takeCall', () => {

        it('captures local media and registers a lock-release listener for the caller', async () => {
            const localStream = createStream();
            const media = createMedia();
            media.getUserMedia.mockResolvedValue(localStream);
            const { sut, signaling, videoUI } = buildSut({ media });

            await sut.takeCall('participant-9', CALL_ID, 'local-video', 'video-container');

            expect(videoUI.attachStream).toHaveBeenCalledWith('local-video', localStream);
            expect(signaling.listenForLockRelease)
                .toHaveBeenCalledWith(CALL_ID, 'participant-9', expect.any(Function));
        });

        it('rejects with a validation error when the participant id is blank', async () => {
            const { sut } = buildSut();

            await expect(sut.takeCall('', CALL_ID, 'v', 'c')).rejects.toThrow(ValidationError);
        });

        it('rejects with a validation error when the call id is blank', async () => {
            const { sut } = buildSut();

            await expect(sut.takeCall('participant-9', '   ', 'v', 'c'))
                .rejects.toThrow(ValidationError);
        });

        it('does not register a lock listener when the local media capture fails', async () => {
            const media = createMedia();
            media.getUserMedia.mockRejectedValue(new Error('no devices'));
            const { sut, signaling } = buildSut({ media });

            await expect(sut.takeCall('p', CALL_ID, 'v', 'c')).rejects.toThrow('no devices');
            expect(signaling.listenForLockRelease).not.toHaveBeenCalled();
        });
    });

    describe('trackCall', () => {

        it('returns the id of the next incoming call reported by the signaling layer', async () => {
            const { sut, signaling } = buildSut();
            signaling.onNewCall.mockResolvedValue('inbound-77');

            const result = await sut.trackCall('user-x');

            expect(result).toBe('inbound-77');
        });

        it('rejects with a validation error when the user id is blank', async () => {
            const { sut } = buildSut();

            await expect(sut.trackCall('')).rejects.toThrow(ValidationError);
        });

        it('surfaces signaling failures to the caller', async () => {
            const { sut, signaling } = buildSut();
            const boom = new Error('lost connection');
            signaling.onNewCall.mockRejectedValue(boom);

            await expect(sut.trackCall('user-x')).rejects.toBe(boom);
        });
    });

    describe('releaseCall', () => {

        it('releases the call at the signaling layer on behalf of the given user', async () => {
            const { sut, signaling } = buildSut();

            await sut.releaseCall(CALL_ID, 'user-1');

            expect(signaling.releaseCall).toHaveBeenCalledWith(CALL_ID, 'user-1');
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

    describe('handleLeaveCall', () => {

        it('returns the leave-notification stream produced by the signaling layer', async () => {
            const { sut, signaling } = buildSut();
            signaling.onLeaveCall.mockReturnValue(of('alice'));

            const first = await firstValueFrom(sut.handleLeaveCall(CALL_ID));

            expect(first).toBe('alice');
        });

        it('propagates signaling stream errors to subscribers', async () => {
            const { sut, signaling } = buildSut();
            const streamError = new Error('signaling dropped');
            signaling.onLeaveCall.mockReturnValue(throwError(() => streamError));

            await expect(lastValueFrom(sut.handleLeaveCall(CALL_ID))).rejects.toBe(streamError);
        });

        it('throws a validation error when the call id is blank', () => {
            const { sut } = buildSut();

            expect(() => sut.handleLeaveCall('   ')).toThrow(ValidationError);
        });
    });

    describe('removeParticipantVideo', () => {

        it("removes the participant's remote video element from the UI", () => {
            const { sut, videoUI } = buildSut();

            sut.removeParticipantVideo('alice');

            expect(videoUI.removeVideo).toHaveBeenCalledWith('remotealice');
        });

        it('does nothing and does not throw when the participant id is blank', () => {
            const { sut, videoUI } = buildSut();

            expect(() => sut.removeParticipantVideo('')).not.toThrow();
            expect(videoUI.removeVideo).not.toHaveBeenCalled();
        });

        it('swallows a UI removal failure and does not propagate it to the caller', () => {
            const videoUI = createVideoUI();
            videoUI.removeVideo.mockImplementation(() => { throw new Error('DOM detached'); });
            const { sut } = buildSut({ videoUI });

            expect(() => sut.removeParticipantVideo('alice')).not.toThrow();
        });
    });

    describe('cleanup', () => {

        it('releases resources at every underlying adapter', async () => {
            const { sut, media, videoUI, webrtc } = buildSut();

            await sut.cleanup();

            expect(media.cleanup).toHaveBeenCalledTimes(1);
            expect(videoUI.cleanup).toHaveBeenCalledTimes(1);
            expect(webrtc.cleanup).toHaveBeenCalledTimes(1);
        });

        it('completes successfully even when one adapter fails to clean up', async () => {
            const media = createMedia();
            media.cleanup.mockImplementation(() => { throw new Error('media stuck'); });
            const { sut, videoUI, webrtc } = buildSut({ media });

            await expect(sut.cleanup()).resolves.toBeUndefined();
            // The other adapters are still asked to release their resources.
            expect(videoUI.cleanup).toHaveBeenCalledTimes(1);
            expect(webrtc.cleanup).toHaveBeenCalledTimes(1);
        });

        it('can be invoked multiple times without raising', async () => {
            const { sut } = buildSut();

            await sut.cleanup();
            await expect(sut.cleanup()).resolves.toBeUndefined();
        });
    });
});
