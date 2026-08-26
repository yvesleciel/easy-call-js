import { Observable } from 'rxjs';
import { CallEvent } from './call-events';

/**
 * Options accepted by {@link ICallProcessService.takeCall}.
 */
export interface TakeCallOptions {
    /**
     * Deadline, in milliseconds, after which {@link ICallProcessService.takeCall}
     * rejects with a {@link CallJoinTimeoutError} if the join has not completed
     * (i.e. no {@code Joined} event has been observed for the target call).
     *
     * Defaults to 30 000 ms.
     */
    joinTimeoutMs?: number;
}

/**
 * Primary port of `easy-call-js`. A framework-agnostic, event-driven contract
 * for driving a multipoint WebRTC call. Consumers observe every meaningful
 * outcome through {@link events$}; the port knows nothing about the DOM.
 *
 * @see CallEvent for the full list of published events.
 */
export interface ICallProcessService {
    /**
     * Stream of every observable outcome produced by the service:
     * call lifecycle, local/remote streams, participants, connection health,
     * state transitions, and asynchronous errors surfaced from the pipeline.
     */
    readonly events$: Observable<CallEvent>;

    /**
     * Creates a new call and initiates negotiation towards every requested user.
     *
     * Resolves with the identifier of the newly created call once the initial
     * offer wave has been dispatched; the {@code Joined} event is published on
     * {@link events$} at the same point.
     *
     * @param callIssuerId identifier of the user starting the call.
     * @param users identifiers of the users to invite (must be non-empty).
     */
    startCall(callIssuerId: string, users: string[]): Promise<string>;

    /**
     * Joins an already-created call. Resolves once the join is complete
     * (i.e. after the {@code Joined} event has been published), or rejects
     * with a {@link CallJoinTimeoutError} if the deadline expires.
     *
     * @param participantId identifier of the joining participant.
     * @param callId identifier of the call to join.
     * @param options optional per-invocation overrides — see {@link TakeCallOptions}.
     */
    takeCall(participantId: string, callId: string, options?: TakeCallOptions): Promise<void>;

    /**
     * Awaits the next incoming call notification for the given user and
     * publishes an {@code IncomingCall} event on {@link events$}.
     *
     * @param userId identifier of the user for whom to track incoming calls.
     * @returns the identifier of the incoming call along with the caller's
     * user id (`from`) when the signaling backend exposes it. `from` may be
     * `undefined` for adapters that do not persist the caller identity.
     */
    trackIncomingCalls(userId: string): Promise<{ callId: string; from?: string }>;

    /**
     * Leaves a call: releases signaling state on behalf of the given user,
     * tears down local resources, and publishes {@code Left} then
     * {@code CallEnded} events.
     */
    releaseCall(callId: string, userId: string): Promise<void>;

    /**
     * Rejects an incoming call for the given user at the signaling layer.
     */
    rejectCall(userId: string): Promise<void>;

    /**
     * Releases every resource held by the service (streams, connections,
     * subscriptions) and completes {@link events$}. Safe to call multiple
     * times: adapter-level failures are logged and swallowed.
     */
    cleanup(): Promise<void>;
}
