import { Observable } from 'rxjs';

/**
 * Secondary port for the signaling rendez-vous layer.
 *
 * Adapter contract used by {@link CallProcessService} to create and join
 * rooms, exchange SDP offers/answers/ICE candidates between peers, coordinate
 * the joining lock, and observe leave notifications. A reference Firestore
 * implementation is provided as {@link FirebaseCallProcess}.
 *
 * Data written by an adapter is expected to be read by another adapter of
 * the same kind (e.g. two Firebase clients talking to the same Firestore
 * project); the shape of the persisted payloads is therefore an external
 * contract between adapters, not just an internal detail.
 */
export interface CallProcessSignaling {
    /** Creates a new call room. Returns the identifier of the created call. */
    createCall(callIssuerId: string, usersToCallId: string[]): Promise<string>;

    /** Writes a signaling payload (SDP offer, answer, or ICE candidate) for a peer. */
    writeOfferOrAnswerOrIce(path: string, idUser: string, type: RTCExchangeDataType, element: any): void;

    /** Subscribes to signaling payloads of the given type for a peer and invokes the callback for each. */
    onReadOfferOrAnswerOrIce(path: string, idUser: string, participantId: string, type: RTCExchangeDataType, callBack: CallBack): Promise<RTCSessionDescriptionInit | any>;

    /** Marks the participant as part of the given call room. */
    joinCall(roomId: string, participantId: string): Promise<void>;

    /** Attempts to acquire the exclusive join lock. Returns {@code true} when the lock is now held by the caller. */
    acquireLock(roomId: string, participantId: string): Promise<boolean>;

    /** Returns the identifiers of the participants already present in the call. */
    getAlreadyParticipants(roomId: string): Promise<string[]>;

    /** Registers a callback fired when the join lock becomes free. */
    listenForLockRelease(roomId: string, participantId: string, action: () => void): void;

    /** Returns the identifiers of invited users who have not joined the call yet. */
    getParticipantNotInCall(roomId: string): Promise<string[]>;

    /** Releases the join lock. */
    releaseLock(roomId: string): void;

    /** Records that the user has left the call. */
    releaseCall(callId: string, userId: string): Promise<void>;

    /** Rejects the pending incoming call for the given user. */
    rejectCall(userId: string): Promise<void>;

    /**
     * Awaits the next incoming call for the given user. Returns both the call
     * id and, when the signaling backend knows it, the caller's user id
     * (`from`). Adapters that do not persist the caller id may return the
     * result without `from`; consumers must treat it as best-effort.
     */
    onNewCall(userId: string): Promise<{ callId: string; from?: string }>;

    /** Observable stream of participant identifiers as they leave the call. */
    onLeaveCall(callId: string): Observable<string>;
}

/** Kind of signaling payload exchanged between peers. */
export enum RTCExchangeDataType {
    ANSWER = 'answer',
    OFFER = 'offer',
    ICE = 'ice',
}

/**
 * Callback invoked by {@link CallProcessSignaling.onReadOfferOrAnswerOrIce}
 * for every received signaling payload.
 */
export interface CallBack {
    do(answer: RTCSessionDescriptionInit | any): void;
}

/** @deprecated Legacy v1 callback shape — kept for adapter compatibility. */
export interface CallBackAcquireLock {
    do(roomId: string, participantId: string, videoSelector: string, idContentForParticipant: string): void;
}

/** Simple pair binding a participant identifier to its peer connection. */
export interface PeerConnect {
    id: string;
    peer: RTCPeerConnection;
}
