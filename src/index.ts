// Core service + factory
export { CallProcessService } from './services/call-process.service';
export { CallServiceFactory } from './core/call/factory/call-service.factory';
export { ConfigService, mergeCallConfig } from './core/call/app-config/call-config';
export { Logger, LogLevel } from './shared/utils/logger';

// Bundled browser adapters (usable directly or through provideEasyCall / CallServiceFactory)
export { MediaService } from './infrastructure/media/media.service.adapter';
export { WebRTCService } from './infrastructure/webrtc/webrtc.service.adapter';

// Public types
export type { CallConfig, RTCConfig, MediaConfig } from './core/call/app-config/call-config';
export type { ICallProcessService, TakeCallOptions } from './core/call/driving/call-process';
export type { CallEvent } from './core/call/driving/call-events';

// Errors
export * from './shared/errors/call-error';

// State machine
export { CallState, CallStateMachine } from './core/call/state/call-state-machine';

// Secondary ports (for adapter implementers)
export { CallProcessSignaling, RTCExchangeDataType } from './core/call/driven/call-process-signaling';
export type { CallBack, PeerConnect } from './core/call/driven/call-process-signaling';
export type { IMediaService } from './core/call/driven/media.service';
export type { IWebRTCService } from './core/call/driven/webrtc.service';

// Bundled Firebase adapter
export { FirebaseCallProcess } from './infrastructure/signaling/FirebaseCallProcess';

