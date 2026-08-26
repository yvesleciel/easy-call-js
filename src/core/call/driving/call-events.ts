import { CallState, CallStateContext } from '../state/call-state-machine';

/**
 * Discriminated union of every event published on
 * {@link ICallProcessService.events$}. Each variant is identified by its
 * {@code kind} tag; consumers switch on it to react to the outcome.
 *
 * Groups (see the tag):
 * - Call lifecycle: {@code Joined}, {@code Left}, {@code CallEnded},
 *   {@code IncomingCall}, {@code IncomingCallRejected}.
 * - Local media: {@code LocalStreamReady}, {@code LocalStreamStopped}.
 * - Participants: {@code ParticipantJoined}, {@code ParticipantLeft},
 *   {@code RemoteStreamAvailable}, {@code RemoteStreamLost}.
 * - Connection health: {@code PeerConnectionStateChanged}.
 * - State machine: {@code StateChanged}.
 * - Errors: {@code Error} (async failures surfaced from the pipeline).
 */
export type CallEvent =
    | { kind: 'Joined'; callId: string }
    | { kind: 'Left'; callId: string; userId: string }
    | { kind: 'CallEnded'; callId: string; reason: 'released' | 'rejected' | 'error' }

    | { kind: 'LocalStreamReady'; stream: MediaStream }
    | { kind: 'LocalStreamStopped' }

    | { kind: 'ParticipantJoined'; participantId: string }
    | { kind: 'ParticipantLeft'; participantId: string }
    | { kind: 'RemoteStreamAvailable'; participantId: string; stream: MediaStream }
    | { kind: 'RemoteStreamLost'; participantId: string }

    | { kind: 'IncomingCall'; callId: string; from?: string }
    | { kind: 'IncomingCallRejected'; callId: string; by: string }

    | { kind: 'PeerConnectionStateChanged'; participantId: string; state: RTCPeerConnectionState }

    | { kind: 'StateChanged'; state: CallState; context: CallStateContext }
    | { kind: 'Error'; operation: string; error: Error; context?: unknown };
