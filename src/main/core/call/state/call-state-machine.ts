import { BehaviorSubject, Observable } from 'rxjs';
import { CallStateError } from '../../../shared/errors/call-error';
import { Logger } from '../../../shared/utils/logger';

export enum CallState {
    IDLE = 'idle',
    INITIALIZING = 'initializing',
    CONNECTING = 'connecting',
    CONNECTED = 'connected',
    RECONNECTING = 'reconnecting',
    DISCONNECTING = 'disconnecting',
    ERROR = 'error'
}

export interface CallStateContext {
    callId?: string;
    participantCount?: number;
    error?: string;
}

export class CallStateMachine {
    private state: CallState = CallState.IDLE;
    private context: CallStateContext = {};
    private readonly stateSubject = new BehaviorSubject<{ state: CallState; context: CallStateContext }>({
        state: this.state,
        context: this.context
    });
    private readonly logger = Logger.getInstance();

    readonly stateChanges$: Observable<{ state: CallState; context: CallStateContext }> =
        this.stateSubject.asObservable();

    get currentState(): CallState {
        return this.state;
    }

    get currentContext(): CallStateContext {
        return { ...this.context };
    }

    transition(newState: CallState, context?: Partial<CallStateContext>): void {
        const validTransitions = this.getValidTransitions(this.state);

        if (!validTransitions.includes(newState)) {
            const error = `Invalid transition from ${this.state} to ${newState}`;
            this.logger.error(error, undefined, {
                currentState: this.state,
                attemptedState: newState
            });
            throw new CallStateError(error);
        }

        const previousState = this.state;
        this.state = newState;
        this.context = { ...this.context, ...context };

        this.logger.info(`State transition: ${previousState} → ${newState}`, {
            previousState,
            newState,
            context: this.context
        });

        this.stateSubject.next({ state: this.state, context: this.context });
    }

    private getValidTransitions(currentState: CallState): CallState[] {
        const transitions: Record<CallState, CallState[]> = {
            [CallState.IDLE]: [CallState.INITIALIZING, CallState.CONNECTING, CallState.DISCONNECTING, CallState.ERROR],
            [CallState.INITIALIZING]: [CallState.CONNECTING, CallState.ERROR],
            [CallState.CONNECTING]: [CallState.CONNECTED, CallState.RECONNECTING, CallState.DISCONNECTING, CallState.ERROR],
            [CallState.CONNECTED]: [CallState.DISCONNECTING, CallState.RECONNECTING, CallState.ERROR],
            [CallState.RECONNECTING]: [CallState.CONNECTED, CallState.ERROR],
            [CallState.DISCONNECTING]: [CallState.IDLE],
            [CallState.ERROR]: [CallState.IDLE, CallState.INITIALIZING, CallState.DISCONNECTING]
        };

        return transitions[currentState] || [];
    }

    reset(): void {
        this.state = CallState.IDLE;
        this.context = {};
        this.stateSubject.next({ state: this.state, context: this.context });
    }
}