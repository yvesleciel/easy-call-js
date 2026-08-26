import { AnswerHandler, IceHandler, OfferHandler } from '../core/call/handlers/callback-handlers';
import { CallProcessSignaling, RTCExchangeDataType } from '../core/call/driven/call-process-signaling';
import { IWebRTCService } from '../core/call/driven/webrtc.service';

jest.mock('../shared/utils/logger', () => {
    const silent = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
    return { LogLevel: {}, Logger: { getInstance: () => silent } };
});

function createConnection(signalingState: RTCSignalingState = 'have-local-offer'): RTCPeerConnection {
    return { addEventListener: jest.fn(), signalingState } as unknown as RTCPeerConnection;
}

function createWebRTC(): jest.Mocked<IWebRTCService> {
    return {
        createConnection: jest.fn(),
        createOffer: jest.fn(),
        createAnswer: jest.fn().mockResolvedValue({ type: 'answer', sdp: 'y' }),
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
    } as unknown as jest.Mocked<CallProcessSignaling>;
}

describe('AnswerHandler', () => {

    it('applies the received answer as the remote description of the connection', async () => {
        const connection = createConnection();
        const webrtc = createWebRTC();
        const handler = new AnswerHandler(connection, webrtc);
        const answer = { type: 'answer', sdp: 'x' } as RTCSessionDescriptionInit;

        await handler.do(answer);

        expect(webrtc.setRemoteDescription).toHaveBeenCalledWith(connection, answer);
    });

    it('surfaces WebRTC failures to the caller', async () => {
        const connection = createConnection();
        const webrtc = createWebRTC();
        const boom = new Error('sdp rejected');
        webrtc.setRemoteDescription.mockRejectedValue(boom);
        const handler = new AnswerHandler(connection, webrtc);

        await expect(handler.do({ type: 'answer', sdp: 'x' } as RTCSessionDescriptionInit)).rejects.toBe(boom);
    });

    it('ignores a duplicate or late answer once the connection is already stable', async () => {
        const connection = createConnection('stable');
        const webrtc = createWebRTC();
        const handler = new AnswerHandler(connection, webrtc);

        await handler.do({ type: 'answer', sdp: 'x' } as RTCSessionDescriptionInit);

        expect(webrtc.setRemoteDescription).not.toHaveBeenCalled();
    });
});

describe('IceHandler', () => {

    it('forwards received ICE candidates to the connection', async () => {
        const connection = createConnection();
        const webrtc = createWebRTC();
        const handler = new IceHandler(connection, webrtc);
        const ice = { candidate: 'candidate:1' } as RTCIceCandidateInit;

        await handler.do(ice);

        expect(webrtc.addIceCandidate).toHaveBeenCalledWith(connection, ice);
    });

    it('swallows ICE addition failures and does not throw', async () => {
        const connection = createConnection();
        const webrtc = createWebRTC();
        webrtc.addIceCandidate.mockRejectedValue(new Error('bad candidate'));
        const handler = new IceHandler(connection, webrtc);

        await expect(handler.do({ candidate: 'candidate:1' } as RTCIceCandidateInit)).resolves.toBeUndefined();
    });
});

describe('OfferHandler', () => {

    it('emits an ANSWER to the peer through signaling after applying the offer', async () => {
        const connection = createConnection();
        const webrtc = createWebRTC();
        const signaling = createSignaling();
        const answerDescription = { type: 'answer', sdp: 'built' } as RTCSessionDescriptionInit;
        webrtc.createAnswer.mockResolvedValue(answerDescription);
        const handler = new OfferHandler(connection, webrtc, 'call-42', 'peer', 'me', signaling);
        const offer = { type: 'offer', sdp: 'incoming' } as RTCSessionDescriptionInit;

        await handler.do(offer);

        expect(webrtc.setRemoteDescription).toHaveBeenCalledWith(connection, offer);
        expect(webrtc.createAnswer).toHaveBeenCalledWith(connection);
        expect(signaling.writeOfferOrAnswerOrIce).toHaveBeenCalledWith(
            'call-42',
            'peer',
            RTCExchangeDataType.ANSWER,
            { answer: answerDescription, issuer: 'me' },
        );
    });

    it('surfaces WebRTC failures to the caller and does not emit an ANSWER', async () => {
        const connection = createConnection();
        const webrtc = createWebRTC();
        const signaling = createSignaling();
        const boom = new Error('createAnswer failed');
        webrtc.createAnswer.mockRejectedValue(boom);
        const handler = new OfferHandler(connection, webrtc, 'call-42', 'peer', 'me', signaling);

        await expect(handler.do({ type: 'offer', sdp: 'x' } as RTCSessionDescriptionInit)).rejects.toBe(boom);
        expect(signaling.writeOfferOrAnswerOrIce).not.toHaveBeenCalled();
    });
});
