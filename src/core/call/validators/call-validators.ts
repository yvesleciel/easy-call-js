import { ValidationError } from '../../../shared/errors/call-error';

/**
 * Domain-level guards enforcing the preconditions of {@link ICallProcessService}.
 * Each guard throws {@link ValidationError} with a message dedicated to the
 * violated invariant so callers can surface it verbatim.
 */
export class CallValidators {
    /** Ensures the call identifier is a non-blank string. */
    static validateCallId(callId: string): asserts callId is string {
        if (!callId?.trim()) {
            throw new ValidationError('Call ID is required');
        }
    }

    /** Ensures the participant identifier is a non-blank string. */
    static validateParticipantId(participantId: string): asserts participantId is string {
        if (!participantId?.trim()) {
            throw new ValidationError('Participant ID is required');
        }
    }

    /** Ensures the users list is a non-empty array of non-blank identifiers. */
    static validateUsersArray(users: string[]): asserts users is string[] {
        if (!Array.isArray(users)) {
            throw new ValidationError('Users must be an array');
        }

        if (users.length === 0) {
            throw new ValidationError('Users list cannot be empty');
        }

        if (users.some(user => !user?.trim())) {
            throw new ValidationError('All user IDs must be non-empty strings');
        }
    }
}
