import {Observable} from "rxjs";
import {CallParam} from "../validators/call-validators";

export interface ICallProcessService {
    initializeCall(callIssuer: string, usersToCallId: string[]): Promise<string>;

    launchCall(callParam: CallParam, callId: string): Promise<void>;

    takeCall(participantId: string, callId: string, localVideoSelector: string, idContentForCallSelector: string): Promise<void>;

    trackCall(userId: string): Promise<string>;

    releaseCall(callId: string, userId: string): Promise<void>;

    rejectCall(userId: string): Promise<void>

    handleLeaveCall(callId: string): Observable<string>;

    removeParticipantVideo(userId: string): void;

    cleanup(): Promise<void>
}
