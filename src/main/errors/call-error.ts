export abstract class CallError extends Error {

    protected constructor(message: string, public readonly code: string, public readonly context?: any) {
        super(message);
        this.name = this.constructor.name;
        Error.captureStackTrace(this, this.constructor);
    }
}

export class ValidationError extends CallError {
    constructor(message: string, context?: any) {
        super(message, 'VALIDATION_ERROR', context);
    }
}

export class WebRTCConnectionError extends CallError {
    constructor(message: string, context?: any) {
        super(message, 'WEBRTC_CONNECTION_ERROR', context);
    }
}

export class MediaDeviceError extends CallError {
    constructor(message: string, context?: any) {
        super(message, 'MEDIA_DEVICE_ERROR', context);
    }
}

export class VideoElementError extends CallError {
    constructor(message: string, context?: any) {
        super(message, 'VIDEO_ELEMENT_ERROR', context);
    }
}

export class CallStateError extends CallError {
    constructor(message: string, context?: any) {
        super(message, 'CALL_STATE_ERROR', context);
    }
}