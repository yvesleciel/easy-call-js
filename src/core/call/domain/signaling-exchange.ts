import { Subject } from 'rxjs';
import { CallProcessSignaling, RTCExchangeDataType } from '../driven/call-process-signaling';
import { IWebRTCService } from '../driven/webrtc.service';
import { ResourceManager } from '../driven/resource-manager.service';
import { AnswerHandler, IceHandler, OfferHandler } from '../handlers/callback-handlers';
import { Logger } from '../../../shared/utils/logger';
import { CallEvent } from '../driving/call-events';
import { ParticipantConnection } from './participant-connection';

/**
 * Which side of a peer negotiation the caller plays:
 * - {@code 'initiator'}: sends the SDP offer and awaits the answer.
 * - {@code 'joiner'}: awaits the SDP offer and sends the answer.
 */
export type ExchangeRole = 'initiator' | 'joiner';

/** Inputs required to negotiate one peer connection through {@link SignalingExchange}. */
export interface ExchangeContext {
    callId: string;
    myId: string;
    peerId: string;
    localStream: MediaStream;
    role: ExchangeRole;
}

/**
 * Domain object that orchestrates the SDP/ICE handshake for a single
 * remote peer: creates the RTC connection, wires up the offer/answer and
 * ICE-candidate exchanges through {@link CallProcessSignaling}, and
 * publishes track/state events on the shared event subject.
 */
export class SignalingExchange {
    private readonly logger = Logger.getInstance();

    constructor(
        private readonly signaling: CallProcessSignaling,
        private readonly webRTCService: IWebRTCService,
        private readonly resourceManager: ResourceManager,
        private readonly events: Subject<CallEvent>,
    ) {}

    async negotiate(ctx: ExchangeContext): Promise<ParticipantConnection> {
        const rtcConnection = await this.webRTCService.createConnection(ctx.peerId);
        this.resourceManager.addConnection(ctx.peerId, rtcConnection);

        const participant = new ParticipantConnection(ctx.peerId, rtcConnection, this.webRTCService);
        participant.bindLocalTracks(ctx.localStream);

        this.installIceCandidateForwarding(participant, ctx);
        this.installRemoteTrackHandler(participant, ctx);
        this.installConnectionStateHandler(participant, ctx);

        if (ctx.role === 'initiator') {
            await this.sendOfferAndAwaitAnswer(participant, ctx);
        } else {
            await this.awaitOfferAndSendAnswer(participant, ctx);
        }

        await this.registerIceHandler(participant, ctx);

        return participant;
    }

    private installIceCandidateForwarding(participant: ParticipantConnection, ctx: ExchangeContext): void {
        participant.connection.addEventListener('icecandidate', event => {
            if (!event.candidate) return;
            const ice = {
                candidate: event.candidate.candidate,
                sdpMid: event.candidate.sdpMid,
                sdpMLineIndex: event.candidate.sdpMLineIndex,
            };
            this.signaling.writeOfferOrAnswerOrIce(
                ctx.callId,
                ctx.peerId,
                RTCExchangeDataType.ICE,
                { ice, issuer: ctx.myId },
            );
        });
    }

    private installRemoteTrackHandler(participant: ParticipantConnection, ctx: ExchangeContext): void {
        participant.connection.addEventListener('track', event => {
            this.logger.info('Received track', {
                kind: event.track.kind,
                enabled: event.track.enabled,
                streamsCount: event.streams.length,
            });

            if (event.streams && event.streams.length > 0) {
                const remoteStream = event.streams[0];
                this.resourceManager.addStream(ctx.peerId, remoteStream);
                this.events.next({
                    kind: 'RemoteStreamAvailable',
                    participantId: ctx.peerId,
                    stream: remoteStream,
                });
            } else {
                this.logger.warn('No streams received with track', {
                    participantId: ctx.peerId,
                    trackKind: event.track.kind,
                });
            }
        });
    }

    private installConnectionStateHandler(participant: ParticipantConnection, ctx: ExchangeContext): void {
        participant.onConnectionStateChange(state => {
            this.events.next({
                kind: 'PeerConnectionStateChanged',
                participantId: ctx.peerId,
                state,
            });
        });
    }

    private async sendOfferAndAwaitAnswer(participant: ParticipantConnection, ctx: ExchangeContext): Promise<void> {
        const offer = await this.webRTCService.createOffer(participant.connection);
        this.signaling.writeOfferOrAnswerOrIce(
            ctx.callId,
            ctx.peerId,
            RTCExchangeDataType.OFFER,
            { offer, issuer: ctx.myId },
        );
        await this.signaling.onReadOfferOrAnswerOrIce(
            ctx.callId,
            ctx.myId,
            ctx.peerId,
            RTCExchangeDataType.ANSWER,
            new AnswerHandler(participant.connection, this.webRTCService),
        );
    }

    private async awaitOfferAndSendAnswer(participant: ParticipantConnection, ctx: ExchangeContext): Promise<void> {
        await this.signaling.onReadOfferOrAnswerOrIce(
            ctx.callId,
            ctx.myId,
            ctx.peerId,
            RTCExchangeDataType.OFFER,
            new OfferHandler(
                participant.connection,
                this.webRTCService,
                ctx.callId,
                ctx.peerId,
                ctx.myId,
                this.signaling,
            ),
        );
    }

    private async registerIceHandler(participant: ParticipantConnection, ctx: ExchangeContext): Promise<void> {
        await this.signaling.onReadOfferOrAnswerOrIce(
            ctx.callId,
            ctx.myId,
            ctx.peerId,
            RTCExchangeDataType.ICE,
            new IceHandler(participant.connection, this.webRTCService),
        );
    }
}
