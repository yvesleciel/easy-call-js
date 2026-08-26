import { Observable, Subject, Subscription, takeUntil } from 'rxjs';
import { ICallProcessService, TakeCallOptions } from '../core/call/driving/call-process';
import { CallEvent } from '../core/call/driving/call-events';
import { CallProcessSignaling } from '../core/call/driven/call-process-signaling';
import { CallValidators } from '../core/call/validators/call-validators';
import { Logger } from '../shared/utils/logger';
import { CallStateMachine, CallState } from '../core/call/state/call-state-machine';
import { IMediaService } from '../core/call/driven/media.service';
import { IWebRTCService } from '../core/call/driven/webrtc.service';
import { ResourceManager } from '../core/call/driven/resource-manager.service';
import { SignalingExchange } from '../core/call/domain/signaling-exchange';
import { CallJoinTimeoutError } from '../shared/errors/call-error';

/** Default join deadline for {@link CallProcessService.takeCall} when no override is provided. */
const DEFAULT_JOIN_TIMEOUT_MS = 30_000;

/**
 * Reference implementation of the primary port {@link ICallProcessService}.
 *
 * Orchestrates a multipoint WebRTC call by composing three secondary ports:
 * signaling (rendez-vous), media capture, and WebRTC. All observable outcomes
 * are surfaced on {@link events$}; the class knows nothing about the DOM.
 */
export class CallProcessService implements ICallProcessService {
    private readonly logger = Logger.getInstance();
    private readonly destroySubject = new Subject<void>();
    private readonly eventsSubject = new Subject<CallEvent>();
    private readonly exchange: SignalingExchange;
    private leaveSubscription: Subscription | null = null;

    readonly events$: Observable<CallEvent> = this.eventsSubject.asObservable();

    constructor(
        private readonly signaling: CallProcessSignaling,
        private readonly mediaService: IMediaService,
        private readonly webRTCService: IWebRTCService,
        private readonly stateMachine: CallStateMachine = new CallStateMachine(),
        private readonly resourceManager: ResourceManager = new ResourceManager()
    ) {
        this.exchange = new SignalingExchange(signaling, webRTCService, resourceManager, this.eventsSubject);
        this.setupStateSubscriptions();
    }

    async startCall(callIssuerId: string, users: string[]): Promise<string> {
        let callId: string;
        let localStream: MediaStream;
        try {
            CallValidators.validateParticipantId(callIssuerId);
            CallValidators.validateUsersArray(users);

            this.stateMachine.transition(CallState.INITIALIZING, { participantCount: users.length });
            this.logger.info('Starting call', { callIssuerId, participantCount: users.length });

            // Capture media FIRST — Teams-style. If the caller has no camera,
            // we don't ring recipients with a call that could never negotiate.
            localStream = await this.captureLocalStream();
            callId = await this.signaling.createCall(callIssuerId, users);
        } catch (error) {
            this.stateMachine.transition(CallState.ERROR, { error: (error as Error).message });
            this.emitError('startCall', error as Error, { callIssuerId });
            throw error;
        }

        try {
            this.stateMachine.transition(CallState.CONNECTING, { callId });

            this.subscribeToParticipantLeaves(callId);

            const negotiations = users.map(peerId =>
                this.exchange.negotiate({
                    callId,
                    myId: callIssuerId,
                    peerId,
                    localStream,
                    role: 'initiator',
                })
            );
            await Promise.allSettled(negotiations);

            this.stateMachine.transition(CallState.CONNECTED, { callId });
            this.eventsSubject.next({ kind: 'Joined', callId });
            this.logger.info('Call started successfully', { callId });
            return callId;
        } catch (error) {
            this.stateMachine.transition(CallState.ERROR, { error: (error as Error).message });
            this.emitError('startCall', error as Error, { callId });
            throw error;
        }
    }

    async takeCall(participantId: string, callId: string, options?: TakeCallOptions): Promise<void> {
        try {
            CallValidators.validateParticipantId(participantId);
            CallValidators.validateCallId(callId);

            this.stateMachine.transition(CallState.CONNECTING, { callId, participantCount: 1 });
            this.logger.info('Taking call', { participantId, callId });
        } catch (error) {
            this.stateMachine.transition(CallState.ERROR, { error: (error as Error).message });
            this.emitError('takeCall', error as Error, { participantId, callId });
            throw error;
        }

        let localStream: MediaStream;
        try {
            localStream = await this.captureLocalStream();
        } catch (error) {
            this.stateMachine.transition(CallState.ERROR, { error: (error as Error).message });
            this.emitError('takeCall', error as Error, { participantId, callId });
            throw error;
        }

        this.subscribeToParticipantLeaves(callId);
        return this.awaitJoinOrTimeout(callId, participantId, localStream, options?.joinTimeoutMs ?? DEFAULT_JOIN_TIMEOUT_MS);
    }

    async trackIncomingCalls(userId: string): Promise<{ callId: string; from?: string }> {
        try {
            CallValidators.validateParticipantId(userId);
            this.logger.info('Tracking calls for user', { userId });
            const { callId, from } = await this.signaling.onNewCall(userId);
            this.eventsSubject.next({ kind: 'IncomingCall', callId, from });
            return { callId, from };
        } catch (error) {
            this.emitError('trackIncomingCalls', error as Error, { userId });
            throw error;
        }
    }

    async releaseCall(callId: string, userId: string): Promise<void> {
        try {
            CallValidators.validateCallId(callId);
            CallValidators.validateParticipantId(userId);

            this.stateMachine.transition(CallState.DISCONNECTING, { callId });
            this.logger.info('Releasing call', { callId, userId });

            await this.signaling.releaseCall(callId, userId);
            this.unsubscribeFromLeaves();
            await this.resourceManager.cleanupAll();

            this.stateMachine.transition(CallState.IDLE);
            this.eventsSubject.next({ kind: 'Left', callId, userId });
            this.eventsSubject.next({ kind: 'CallEnded', callId, reason: 'released' });
            this.logger.info('Call released successfully', { callId, userId });
        } catch (error) {
            this.emitError('releaseCall', error as Error, { callId, userId });
            throw error;
        }
    }

    async rejectCall(userId: string): Promise<void> {
        try {
            CallValidators.validateParticipantId(userId);
            await this.signaling.rejectCall(userId);
            this.logger.info('Call rejected successfully', { userId });
        } catch (error) {
            this.emitError('rejectCall', error as Error, { userId });
            throw error;
        }
    }

    async cleanup(): Promise<void> {
        this.logger.info('Cleaning up call process service');

        this.unsubscribeFromLeaves();
        this.destroySubject.next();
        this.destroySubject.complete();

        const cleanupOperations = [
            this.safeCleanup('ResourceManager', () => this.resourceManager.cleanupAll()),
            this.safeCleanup('MediaService', () => this.mediaService.cleanup()),
            this.safeCleanup('WebRTCService', () => this.webRTCService.cleanup()),
        ];
        const results = await Promise.allSettled(cleanupOperations);
        const failures = results.filter(r => r.status === 'rejected');
        if (failures.length > 0) {
            this.logger.warn('Some cleanup operations failed', {
                failedCount: failures.length,
                totalCount: cleanupOperations.length,
            });
        }

        this.eventsSubject.next({ kind: 'LocalStreamStopped' });
        this.eventsSubject.complete();
    }

    private awaitJoinOrTimeout(
        callId: string,
        participantId: string,
        localStream: MediaStream,
        timeoutMs: number,
    ): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            const timer = setTimeout(() => {
                subscription.unsubscribe();
                const err = new CallJoinTimeoutError(callId, timeoutMs);
                this.stateMachine.transition(CallState.ERROR, { error: err.message });
                this.emitError('takeCall', err, { callId, participantId });
                reject(err);
            }, timeoutMs);

            const subscription = this.eventsSubject.subscribe(event => {
                if (event.kind === 'Joined' && event.callId === callId) {
                    clearTimeout(timer);
                    subscription.unsubscribe();
                    resolve();
                }
            });

            this.signaling.listenForLockRelease(callId, participantId, async () => {
                try {
                    await this.completeJoin(callId, participantId, localStream);
                } catch (error) {
                    clearTimeout(timer);
                    subscription.unsubscribe();
                    this.stateMachine.transition(CallState.ERROR, { error: (error as Error).message });
                    this.emitError('takeCall', error as Error, { callId, participantId });
                    reject(error);
                }
            });
        });
    }

    private async completeJoin(
        callId: string,
        participantId: string,
        localStream: MediaStream,
    ): Promise<void> {
        await this.signaling.joinCall(callId, participantId);
        await this.negotiateWithExistingParticipants(callId, participantId, localStream);
        await this.negotiateWithNewParticipants(callId, participantId, localStream);
        this.stateMachine.transition(CallState.CONNECTED, { callId });
        this.eventsSubject.next({ kind: 'Joined', callId });
    }

    private async negotiateWithExistingParticipants(
        callId: string,
        participantId: string,
        localStream: MediaStream,
    ): Promise<void> {
        const existing = await this.signaling.getAlreadyParticipants(callId);
        this.logger.info('Existing participants', { existing });
        if (!existing) return;

        // Negotiate with every existing peer in parallel — each is an
        // independent RTCPeerConnection, so serializing them (as a plain
        // for-await loop would) only adds up their round-trip latencies and
        // delays when later peers' streams appear, without buying safety.
        const negotiations = existing
            .filter(peerId => peerId !== participantId)
            .map(async peerId => {
                try {
                    await this.exchange.negotiate({
                        callId,
                        myId: participantId,
                        peerId,
                        localStream,
                        role: 'joiner',
                    });
                    this.eventsSubject.next({ kind: 'ParticipantJoined', participantId: peerId });
                } catch (error) {
                    this.emitError('takeCall.existingParticipant', error as Error, { peerId });
                }
            });

        await Promise.allSettled(negotiations);
    }

    private async negotiateWithNewParticipants(
        callId: string,
        participantId: string,
        localStream: MediaStream,
    ): Promise<void> {
        const newcomers = await this.signaling.getParticipantNotInCall(callId);
        if (newcomers.length === 0) return;

        // Fire-and-forget: pending targets may never accept — do not block
        // the join on their answer. Handlers registered by negotiate() stay
        // armed and complete the handshake if/when they do accept.
        for (const peerId of newcomers) {
            this.exchange
                .negotiate({ callId, myId: participantId, peerId, localStream, role: 'initiator' })
                .then(() => this.eventsSubject.next({ kind: 'ParticipantJoined', participantId: peerId }))
                .catch(error => this.emitError('takeCall.newParticipant', error as Error, { peerId }));
        }
    }

    private async captureLocalStream(): Promise<MediaStream> {
        const stream = await this.mediaService.getUserMedia();
        this.resourceManager.addStream('local', stream);
        this.eventsSubject.next({ kind: 'LocalStreamReady', stream });
        return stream;
    }

    private subscribeToParticipantLeaves(callId: string): void {
        this.unsubscribeFromLeaves();
        this.leaveSubscription = this.signaling.onLeaveCall(callId).subscribe({
            next: (leaverId: string) => {
                this.eventsSubject.next({ kind: 'ParticipantLeft', participantId: leaverId });
            },
            error: (err: Error) => this.emitError('onLeaveCall', err, { callId }),
        });
    }

    private unsubscribeFromLeaves(): void {
        if (this.leaveSubscription) {
            this.leaveSubscription.unsubscribe();
            this.leaveSubscription = null;
        }
    }

    private async safeCleanup(serviceName: string, cleanupFn: () => void | Promise<void>): Promise<void> {
        try {
            await cleanupFn();
            this.logger.debug(`${serviceName} cleanup completed`);
        } catch (error) {
            this.logger.error(`${serviceName} cleanup failed`, error as Error);
        }
    }

    private emitError(operation: string, error: Error, context?: unknown): void {
        this.logger.error(`${operation} failed`, error, context as any);
        this.eventsSubject.next({ kind: 'Error', operation, error, context });
    }

    private setupStateSubscriptions(): void {
        this.stateMachine.stateChanges$
            .pipe(takeUntil(this.destroySubject))
            .subscribe(({ state, context }) => {
                this.logger.info('Call state changed', { state, context });
                this.eventsSubject.next({ kind: 'StateChanged', state, context });
            });
    }
}
