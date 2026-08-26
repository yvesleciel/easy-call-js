/**
 * Base type for every error thrown by `easy-call-js`. Carries a stable
 * {@code code} that consumers can switch on without depending on
 * {@code instanceof} checks.
 */
export abstract class CallError extends Error {

    protected constructor(message: string, public readonly code: string, public readonly context?: any) {
        super(message);
        this.name = this.constructor.name;
        if (typeof (Error as any).captureStackTrace === 'function') {
            (Error as any).captureStackTrace(this, this.constructor);
        }
    }
}

/** Thrown when an argument fails a domain-level precondition (blank id, empty list, ...). */
export class ValidationError extends CallError {
    constructor(message: string, context?: any) {
        super(message, 'VALIDATION_ERROR', context);
    }
}

/** Thrown when a WebRTC operation (create/set description, add ICE, ...) fails. */
export class WebRTCConnectionError extends CallError {
    constructor(message: string, context?: any) {
        super(message, 'WEBRTC_CONNECTION_ERROR', context);
    }
}

/** Thrown when the local camera/microphone cannot be accessed. */
export class MediaDeviceError extends CallError {
    constructor(message: string, context?: any) {
        super(message, 'MEDIA_DEVICE_ERROR', context);
    }
}

/** Thrown by the DOM adapter when the expected {@code <video>} element cannot be resolved. */
export class VideoElementError extends CallError {
    constructor(message: string, context?: any) {
        super(message, 'VIDEO_ELEMENT_ERROR', context);
    }
}

/** Thrown when an illegal state transition is attempted on {@link CallStateMachine}. */
export class CallStateError extends CallError {
    constructor(message: string, context?: any) {
        super(message, 'CALL_STATE_ERROR', context);
    }
}

/**
 * Thrown by {@link ICallProcessService.takeCall} when the join has not
 * completed before {@link TakeCallOptions.joinTimeoutMs}.
 */
export class CallJoinTimeoutError extends CallError {
    constructor(callId: string, timeoutMs: number) {
        super(
            `Failed to join call ${callId} within ${timeoutMs}ms`,
            'CALL_JOIN_TIMEOUT',
            { callId, timeoutMs }
        );
    }
}
