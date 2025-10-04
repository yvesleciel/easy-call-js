import { ValidationError } from '../../../shared/errors/call-error';

export interface CallParam {
    usersToCallId: string[];
    callIssuerId: string;
    localVideoSelector: string;
    idContentForCall: string;
}

export interface TriggerCallParam {
    callParam: CallParam;
    callId: string;
    participantId: string;
    localStream: MediaStream;
}

export class CallValidators {
    static validateCallParam(param: unknown): asserts param is CallParam {
        if (!param || typeof param !== 'object') {
            throw new ValidationError('Call parameter must be an object');
        }

        const callParam = param as any;

        if (!Array.isArray(callParam.usersToCallId)) {
            throw new ValidationError('usersToCallId must be an array');
        }

        if (callParam.usersToCallId.length === 0) {
            throw new ValidationError('usersToCallId cannot be empty');
        }

        if (!callParam.callIssuerId?.trim()) {
            throw new ValidationError('callIssuerId is required');
        }

        if (!callParam.localVideoSelector?.trim()) {
            throw new ValidationError('videoSelector is required');
        }

        if (!callParam.idContentForCall?.trim()) {
            throw new ValidationError('idContentForCall is required');
        }
    }

    static validateCallId(callId: string): asserts callId is string {
        if (!callId?.trim()) {
            throw new ValidationError('Call ID is required');
        }
    }

    static validateParticipantId(participantId: string): asserts participantId is string {
        if (!participantId?.trim()) {
            throw new ValidationError('Participant ID is required');
        }
    }

    static validateUsersArray(users: string[]): asserts users is string[] {
        if (!Array.isArray(users)) {
            throw new ValidationError('Users must be an array');
        }

        if (users.some(user => !user?.trim())) {
            throw new ValidationError('All user IDs must be valid strings');
        }
    }
}