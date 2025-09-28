import {CallBack, RTCExchangeDataType} from '../feature/CallProcess';
import { IWebRTCService } from '../services/webrtc.service';
import { Logger } from '../utils/logger';

export class AnswerHandler implements CallBack {
    private readonly logger = Logger.getInstance();

    constructor(
        private connection: RTCPeerConnection,
        private webRTCService: IWebRTCService
    ) {}

    async do(answer: RTCSessionDescriptionInit): Promise<void> {
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

export class IceHandler implements CallBack {
    private readonly logger = Logger.getInstance();

    constructor(
        private connection: RTCPeerConnection,
        private webRTCService: IWebRTCService
    ) {}

    async do(ice: RTCIceCandidateInit): Promise<void> {
        try {
            this.logger.debug('Handling ICE candidate');
            await this.webRTCService.addIceCandidate(this.connection, ice);
            this.logger.debug('ICE candidate handled successfully');
        } catch (error) {
            this.logger.warn('Failed to handle ICE candidate', { error: (error as Error).message });
            // Les erreurs ICE ne sont pas critiques
        }
    }
}

export class OfferHandler implements CallBack {
    private readonly logger = Logger.getInstance();

    constructor(
        private connection: RTCPeerConnection,
        private webRTCService: IWebRTCService,
        private callId: string,
        private participantId: string,
        private issuerId: string,
        private callProcess: any
    ) {}

    async do(offer: RTCSessionDescriptionInit): Promise<void> {
        try {
            this.logger.debug('Handling offer');

            await this.webRTCService.setRemoteDescription(this.connection, offer);
            const answer = await this.webRTCService.createAnswer(this.connection);

            await this.callProcess.writeOfferOrAnswerOrIce(
                this.callId,
                this.participantId,
                RTCExchangeDataType.ANSWER,
                { answer, issuer: this.issuerId }
            );

            this.logger.info('Offer handled successfully', {
                participantId: this.participantId,
                issuerId: this.issuerId
            });
        } catch (error) {
            this.logger.error('Failed to handle offer', error as Error);
            throw error;
        }
    }
}