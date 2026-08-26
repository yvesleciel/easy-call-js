import { CallBack, CallProcessSignaling, RTCExchangeDataType } from '../driven/call-process-signaling';
import { IWebRTCService } from '../driven/webrtc.service';
import { Logger } from '../../../shared/utils/logger';

/** Applies a received SDP answer as the remote description on the peer connection. */
export class AnswerHandler implements CallBack {
    private readonly logger = Logger.getInstance();

    constructor(
        private readonly connection: RTCPeerConnection,
        private readonly webRTCService: IWebRTCService
    ) {}

    async do(answer: RTCSessionDescriptionInit): Promise<void> {
        // An answer is only meaningful right after we've sent our offer. A
        // connection that already reached 'stable' has already applied one —
        // a duplicate/late delivery here must be ignored rather than crash
        // the peer connection with an InvalidStateError.
        if (this.connection.signalingState !== 'have-local-offer') {
            this.logger.warn('Ignoring answer: connection is not awaiting one', {
                signalingState: this.connection.signalingState,
            });
            return;
        }
        try {
            this.logger.info('Handling answer');
            await this.webRTCService.setRemoteDescription(this.connection, answer);
            this.logger.info('Answer handled successfully');
        } catch (error) {
            this.logger.error('Failed to handle answer', error as Error);
            throw error;
        }
    }
}

/** Forwards a received ICE candidate to the peer connection. */
export class IceHandler implements CallBack {
    private readonly logger = Logger.getInstance();

    constructor(
        private readonly connection: RTCPeerConnection,
        private readonly webRTCService: IWebRTCService,
    ) {}

    async do(ice: RTCIceCandidateInit): Promise<void> {
        try {
            this.logger.debug('Handling ICE candidate');
            await this.webRTCService.addIceCandidate(this.connection, ice);
            this.logger.debug('ICE candidate handled successfully');
        } catch (error) {
            // ICE failures are typically recoverable — log and continue.
            this.logger.warn('Failed to handle ICE candidate', { error: (error as Error).message });
        }
    }
}

/**
 * Applies a received SDP offer as the remote description, produces the
 * matching answer, and forwards it back through the signaling adapter.
 */
export class OfferHandler implements CallBack {
    private readonly logger = Logger.getInstance();

    constructor(
        private readonly connection: RTCPeerConnection,
        private readonly webRTCService: IWebRTCService,
        private readonly callId: string,
        private readonly participantId: string,
        private readonly issuerId: string,
        private readonly signaling: CallProcessSignaling,
    ) {}

    async do(offer: RTCSessionDescriptionInit): Promise<void> {
        try {
            this.logger.debug('Handling offer');

            await this.webRTCService.setRemoteDescription(this.connection, offer);
            const answer = await this.webRTCService.createAnswer(this.connection);

            await this.signaling.writeOfferOrAnswerOrIce(
                this.callId,
                this.participantId,
                RTCExchangeDataType.ANSWER,
                { answer, issuer: this.issuerId },
            );

            this.logger.info('Offer handled successfully', {
                participantId: this.participantId,
                issuerId: this.issuerId,
            });
        } catch (error) {
            this.logger.error('Failed to handle offer', error as Error);
            throw error;
        }
    }
}