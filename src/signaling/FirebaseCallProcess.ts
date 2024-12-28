import {CallBack, CallProcess, RTCExchangeDataType} from "../feature/CallProcess";
import {FirebaseOptions, initializeApp} from "@firebase/app"
import { getFirestore, Firestore, doc, setDoc, getDoc, addDoc, collection, updateDoc,
  arrayUnion, onSnapshot, deleteDoc, query, where } from "firebase/firestore";
import {Observable} from "rxjs";


export class FirebaseCallProcess implements CallProcess {
  db: Firestore;
  hasAcquiredLock = false;
  constructor(firebaseConfig:  FirebaseOptions) {
    const app = initializeApp(firebaseConfig);
    this.db = getFirestore(app);
  }

  async acquireLock(roomId: string, participantId: string): Promise<boolean> {
    if (this.hasAcquiredLock) {
      return Promise.resolve(false);
    }
    const lockRef = doc(this.db, "rooms", roomId, "lock", "mutex");
    const lockDoc = await getDoc(lockRef);
    if (!lockDoc.exists()) {
      // Personne n'a encore pris le verrou, on essaie de le prendre
      try {
        await setDoc(lockRef,{participantId: participantId, timestamp: Date.now()}, {merge: false}); // Ne pas autoriser la fusion pour s'assurer que le verrou est pris de manière exclusive
        this.hasAcquiredLock = true; // Marqueur mis à jour
        return true;
      } catch (error) {
        return false;
      }
    } else {
      return false;
    }
  }

  async createCall(callIssuer: string, usersToCallId: string[]): Promise<string> {
    const callRef = await addDoc(collection(this.db, "rooms"),
      {personIds: usersToCallId, inCall: new Array(callIssuer)});
    for (const user of usersToCallId) {
      const userCallRef = doc(this.db, "users", user, "call", "callId");
      const userCallDoc = await getDoc(userCallRef);
      if (!userCallDoc.exists()) {
        await setDoc(userCallRef, {callId: callRef.id})
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
    return roomDoc.data()!["personIds"].filter((item: string)=> !roomDoc.data()!["inCall"].includes(item));
  }

  async joinCall(roomId: string, participantId: string): Promise<void> {
    const roomRef = doc(this.db, "rooms", roomId);
    await updateDoc(roomRef, {inCall: arrayUnion(participantId)})
  }

  listenForLockRelease(roomId: string, participantId: string, action: () => void): void {
    const lockRef = doc(this.db, "rooms", roomId, "lock", "mutex");
    onSnapshot(lockRef, async (doc) => {
      if(!doc.exists() && !this.hasAcquiredLock){
        const success = await this.acquireLock(roomId, participantId)
        if (success) {
          try {
            action();
          } catch(error) {
            console.log(error)
          } finally {
            await this.releaseLock(roomId);
          }
        }
      }
    })
  }

  onNewCall(userId: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const userCallRef = collection(this.db, "users", userId, "call");
      const q = query(userCallRef);
      onSnapshot(q, (snapshot) => {
        snapshot.docChanges().forEach((change) => {
          if (change.type === "added") {
            resolve(change.doc.data()!["callId"])
          }
        });
      });
    })
  }

  onReadOfferOrAnswerOrIce(path: string, idUser: string, participantId:string, type: RTCExchangeDataType, callBack: CallBack): Promise<RTCSessionDescriptionInit | any> {
    return new Promise((resolve, reject) => {
      const typeRef = collection(this.db, "rooms", path, "sdp",type, idUser);
      const q = query(typeRef, where("issuer", "==", participantId));
      onSnapshot(q, (snapshot) => {
        snapshot.docChanges().forEach((change) => {
          if (change.type === "added") {
            callBack.do(change.doc.data()![type]);
            resolve(change.doc.data()![type]);
          }
        });
      });
    })
  }

  async releaseCall(callId: string, userId: string): Promise<void> {
    const typeRef = collection(this.db, "rooms", callId, "leave");
    await addDoc(typeRef, {userId: userId, timestamp: Date.now()});
    const userCallRef = doc(this.db, "users", userId, "call", "callId");
    await deleteDoc(userCallRef);
  }

  async releaseLock(roomId: string): Promise<void> {
    const lockRef = doc(this.db, "rooms", roomId, "lock", "mutex");
    await deleteDoc(lockRef);
  }

  async writeOfferOrAnswerOrIce(path: string, idUser: string, type: RTCExchangeDataType, element: any): Promise<void> {
    const typeRef = collection(this.db, "rooms", path, "sdp", type, idUser);
    await addDoc(typeRef, element);
  }

  onLeaveCall(callId: string): Observable<string> {
    return new Observable((observer) => {
      const leaveUserRef = collection(this.db, "rooms", callId, "leave");
      const q = query(leaveUserRef);
      onSnapshot(q, (snapshot) => {
        snapshot.docChanges().forEach((change) => {
          if (change.type === "added") {
            observer.next(change.doc.data()!["userId"])
          }
        });
      });
    })
  }
}
