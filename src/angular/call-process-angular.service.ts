import { Injectable, OnDestroy, inject } from '@angular/core';
import { Observable, filter, map, scan, startWith } from 'rxjs';

import {
    CallProcessService,
    CallState,
    type CallEvent,
    type ICallProcessService,
    type TakeCallOptions,
} from 'easy-call-js';

import { MEDIA_TOKEN, SIGNALING_TOKEN, WEBRTC_TOKEN } from './provide-easy-call';

/**
 * Angular-flavoured facade over {@link CallProcessService}. Implements the
 * primary port {@link ICallProcessService} and additionally exposes derived
 * streams tailored for Angular templates:
 *
 * - {@link state$}: current {@link CallState} derived from the state machine.
 * - {@link localStream$}: the local {@link MediaStream}, or {@code null} when none is captured.
 * - {@link remoteStreams$}: a live record of remote streams keyed by participant id.
 *
 * Register the service via {@link provideEasyCall}. It disposes the
 * underlying {@link CallProcessService} on {@code ngOnDestroy}.
 */
@Injectable({ providedIn: 'root' })
export class CallProcessAngular implements ICallProcessService, OnDestroy {
    private readonly delegate: CallProcessService;

    readonly events$: Observable<CallEvent>;
    readonly state$: Observable<CallState>;
    readonly localStream$: Observable<MediaStream | null>;
    readonly remoteStreams$: Observable<Record<string, MediaStream>>;

    constructor() {
        const signaling = inject(SIGNALING_TOKEN);
        const media = inject(MEDIA_TOKEN);
        const webrtc = inject(WEBRTC_TOKEN);

        this.delegate = new CallProcessService(signaling, media, webrtc);
        this.events$ = this.delegate.events$;

        this.state$ = this.events$.pipe(
            filter((e): e is Extract<CallEvent, { kind: 'StateChanged' }> => e.kind === 'StateChanged'),
            map(e => e.state),
            startWith(CallState.IDLE),
        );

        this.localStream$ = this.events$.pipe(
            filter(e =>
                e.kind === 'LocalStreamReady' ||
                e.kind === 'LocalStreamStopped' ||
                e.kind === 'CallEnded',
            ),
            map(e => e.kind === 'LocalStreamReady' ? e.stream : null),
            startWith(null as MediaStream | null),
        );

        this.remoteStreams$ = this.events$.pipe(
            filter(e =>
                e.kind === 'RemoteStreamAvailable' ||
                e.kind === 'RemoteStreamLost' ||
                e.kind === 'ParticipantLeft' ||
                e.kind === 'CallEnded',
            ),
            scan<CallEvent, Record<string, MediaStream>>((acc, e) => {
                if (e.kind === 'RemoteStreamAvailable') {
                    return { ...acc, [e.participantId]: e.stream };
                }
                if (e.kind === 'RemoteStreamLost' || e.kind === 'ParticipantLeft') {
                    const { [e.participantId]: _removed, ...rest } = acc;
                    return rest;
                }
                if (e.kind === 'CallEnded') {
                    return {};
                }
                return acc;
            }, {}),
            startWith({} as Record<string, MediaStream>),
        );
    }

    startCall(callIssuerId: string, users: string[]): Promise<string> {
        return this.delegate.startCall(callIssuerId, users);
    }

    takeCall(participantId: string, callId: string, options?: TakeCallOptions): Promise<void> {
        return this.delegate.takeCall(participantId, callId, options);
    }

    trackIncomingCalls(userId: string): Promise<{ callId: string; from?: string }> {
        return this.delegate.trackIncomingCalls(userId);
    }

    releaseCall(callId: string, userId: string): Promise<void> {
        return this.delegate.releaseCall(callId, userId);
    }

    rejectCall(userId: string): Promise<void> {
        return this.delegate.rejectCall(userId);
    }

    cleanup(): Promise<void> {
        return this.delegate.cleanup();
    }

    ngOnDestroy(): void {
        void this.cleanup();
    }
}
