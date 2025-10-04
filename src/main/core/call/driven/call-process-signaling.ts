import {Observable} from "rxjs";

export interface CallProcessSignaling {
  createCall(callIssuer: string, usersToCallId: string[]): Promise<string>;
  writeOfferOrAnswerOrIce(path: string, idUser: string, type: RTCExchangeDataType, element:any):void;
  onReadOfferOrAnswerOrIce(path: string, idUser: string, participantId: string,type: RTCExchangeDataType, callBack: CallBack):Promise<RTCSessionDescriptionInit | any>;
  joinCall(roomId: string, participantId: string):Promise<void>;
  acquireLock(roomId: string, participantId: string):Promise<boolean>;
  getAlreadyParticipants(roomId: string):Promise<string[]>;
  listenForLockRelease(roomId: string, participantId: string, action: () => void):void;
  getParticipantNotInCall(roomId: string): Promise<string[]>;
  releaseLock(roomId: string): void;
  releaseCall(callId: string, userId: string): Promise<void>;
  rejectCall(userId: string): Promise<void>;
  onNewCall(userId: string):Promise<string>;
  onLeaveCall(callId: string): Observable<string>;
}

export enum RTCExchangeDataType {
  ANSWER="answer",
  OFFER="offer",
  ICE="ice"
}

export interface CallBack {
  do(answer: RTCSessionDescriptionInit | any): void;
}

export interface CallBackAcquireLock {
  do(roomId: string, participantId: string, videoSelector: string, idContentForParticipant: string): void;
}

export interface PeerConnect{
  id: string,
  peer: RTCPeerConnection
}
