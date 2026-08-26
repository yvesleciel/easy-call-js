import { CallBack, CallProcessSignaling, RTCExchangeDataType } from "../../core/call/driven/call-process-signaling";
import { FirebaseOptions, initializeApp } from "firebase/app";
import {
    getFirestore, Firestore, doc, setDoc, getDoc, addDoc, collection, updateDoc,
    arrayUnion, onSnapshot, deleteDoc, query, where, runTransaction,
} from "firebase/firestore";
import { Observable } from "rxjs";
import { Logger, LogLevel } from "../../shared/utils/logger";

/**
 * Reference {@link CallProcessSignaling} implementation backed by Cloud
 * Firestore. The persisted document shape is part of the contract shared
 * with any other client connecting to the same Firestore project:
 *
 * - {@code rooms/{callId}}: `{ personIds: string[], inCall: string[] }`
 * - {@code rooms/{callId}/lock/mutex`}: `{ participantId, timestamp }`
 * - {@code rooms/{callId}/sdp/{type}/{peerId}}: SDP or ICE payloads with an
 *   {@code issuer} field so peers can route messages.
 * - {@code rooms/{callId}/leave}: leave notifications `{ userId, timestamp }`.
 * - {@code users/{userId}/call/callId}: pending-call marker `{ callId }`.
 */
export class FirebaseCallProcess implements CallProcessSignaling {
    private readonly db: Firestore;
    private readonly logger = Logger.getInstance(LogLevel.DEBUG);
    private hasAcquiredLock = false;

    constructor(firebaseConfig: FirebaseOptions) {
        const app = initializeApp(firebaseConfig);
        this.db = getFirestore(app);
    }

    async acquireLock(roomId: string, participantId: string): Promise<boolean> {
        if (this.hasAcquiredLock) {
            return false;
        }
        const lockRef = doc(this.db, "rooms", roomId, "lock", "mutex");
        // Read-then-write inside a transaction so two concurrent callers can't
        // both observe an absent lock and both believe they claimed it — one
        // of the transactions is retried by Firestore once the other commits,
        // and re-reads the now-existing document.
        try {
            const acquired = await runTransaction(this.db, async transaction => {
                const lockDoc = await transaction.get(lockRef);
                if (lockDoc.exists()) {
                    return false;
                }
                transaction.set(lockRef, { participantId, timestamp: Date.now() });
                return true;
            });
            if (acquired) {
                this.hasAcquiredLock = true;
            }
            return acquired;
        } catch {
            return false;
        }
    }

    async createCall(callIssuerId: string, usersToCallId: string[]): Promise<string> {
        const callRef = await addDoc(
            collection(this.db, "rooms"),
            { personIds: usersToCallId, inCall: [callIssuerId] },
        );
        for (const user of usersToCallId) {
            const userCallRef = doc(this.db, "users", user, "call", "callId");
            const userCallDoc = await getDoc(userCallRef);
            if (!userCallDoc.exists()) {
                await setDoc(userCallRef, { callId: callRef.id, from: callIssuerId });
            }
        }
        return callRef.id;
    }

    async getAlreadyParticipants(roomId: string): Promise<string[]> {
        const roomRef = doc(this.db, "rooms", roomId);
        const roomDoc = await getDoc(roomRef);
        return roomDoc.data()!["inCall"];
    }

    async getParticipantNotInCall(roomId: string): Promise<string[]> {
        const roomRef = doc(this.db, "rooms", roomId);
        const roomDoc = await getDoc(roomRef);
        const data = roomDoc.data()!;
        const inCall: string[] = data["inCall"];
        return (data["personIds"] as string[]).filter(id => !inCall.includes(id));
    }

    async joinCall(roomId: string, participantId: string): Promise<void> {
        const roomRef = doc(this.db, "rooms", roomId);
        await updateDoc(roomRef, { inCall: arrayUnion(participantId) });
    }

    listenForLockRelease(roomId: string, participantId: string, action: () => void): void {
        const lockRef = doc(this.db, "rooms", roomId, "lock", "mutex");
        // One-shot: this participant only needs to grab the mutex once to run
        // their own join action. Left attached, this snapshot listener would
        // fire again the moment it deletes the lock document itself below,
        // re-acquiring it and re-running `action()` a second time.
        const unsubscribe = onSnapshot(lockRef, async lockDoc => {
            if (!lockDoc.exists() && !this.hasAcquiredLock) {
                const acquired = await this.acquireLock(roomId, participantId);
                if (acquired) {
                    unsubscribe();
                    this.logger.info('Signaling lock acquired', { roomId, participantId });
                    try {
                        action();
                    } catch (error) {
                        this.logger.error('Lock-release action failed', error as Error, { roomId, participantId });
                    } finally {
                        await this.releaseLock(roomId);
                    }
                }
            }
        });
    }

    onNewCall(userId: string): Promise<{ callId: string; from?: string }> {
        return new Promise(resolve => {
            const userCallRef = collection(this.db, "users", userId, "call");
            onSnapshot(query(userCallRef), snapshot => {
                snapshot.docChanges().forEach(change => {
                    if (change.type === "added") {
                        const data = change.doc.data()!;
                        resolve({ callId: data["callId"], from: data["from"] });
                    }
                });
            });
        });
    }

    onReadOfferOrAnswerOrIce(
        path: string,
        idUser: string,
        participantId: string,
        type: RTCExchangeDataType,
        callBack: CallBack,
    ): Promise<RTCSessionDescriptionInit | any> {
        this.logger.debug('onReadOfferOrAnswerOrIce', { path, idUser, participantId, type });
        // An offer and an answer are each expected exactly once per negotiation;
        // ICE candidates trickle in repeatedly and must keep being delivered.
        const singleShot = type !== RTCExchangeDataType.ICE;
        return new Promise(resolve => {
            const payloadCollection = collection(this.db, "rooms", path, "sdp", type, idUser);
            const payloadQuery = query(payloadCollection, where("issuer", "==", participantId));
            const unsubscribe = onSnapshot(payloadQuery, snapshot => {
                snapshot.docChanges().forEach(change => {
                    if (change.type === "added") {
                        this.logger.debug('Signaling payload received', { type, participantId });
                        const payload = change.doc.data()![type];
                        callBack.do(payload);
                        resolve(payload);
                        if (singleShot) {
                            unsubscribe();
                        }
                    }
                });
            });
        });
    }

    async releaseCall(callId: string, userId: string): Promise<void> {
        const leaveCollection = collection(this.db, "rooms", callId, "leave");
        await addDoc(leaveCollection, { userId, timestamp: Date.now() });
        const userCallRef = doc(this.db, "users", userId, "call", "callId");
        await deleteDoc(userCallRef);
    }

    async rejectCall(userId: string): Promise<void> {
        const userCallRef = doc(this.db, "users", userId, "call", "callId");
        await deleteDoc(userCallRef);
    }

    async releaseLock(roomId: string): Promise<void> {
        const lockRef = doc(this.db, "rooms", roomId, "lock", "mutex");
        await deleteDoc(lockRef);
        this.hasAcquiredLock = false;
    }

    async writeOfferOrAnswerOrIce(path: string, idUser: string, type: RTCExchangeDataType, element: any): Promise<void> {
        const payloadCollection = collection(this.db, "rooms", path, "sdp", type, idUser);
        await addDoc(payloadCollection, element);
    }

    onLeaveCall(callId: string): Observable<string> {
        return new Observable(observer => {
            const leaveCollection = collection(this.db, "rooms", callId, "leave");
            onSnapshot(query(leaveCollection), snapshot => {
                snapshot.docChanges().forEach(change => {
                    if (change.type === "added") {
                        observer.next(change.doc.data()!["userId"]);
                    }
                });
            });
        });
    }
}
