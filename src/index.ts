// Exports principaux
export { CallProcessService } from './main/services/call-process.service';
export { CallServiceFactory } from './main/core/call/factory/call-service.factory';
export { ConfigService } from './main/core/call/app-config/call-config';
export { Logger, LogLevel } from './main/shared/utils/logger';

// Exports des types
export type { CallParam, TriggerCallParam } from './main/core/call/validators/call-validators';
export type { CallConfig, RTCConfig, MediaConfig, UIConfig } from './main/core/call/app-config/call-config';
export type { ICallProcessService } from './main/core/call/driving/call-process';

// Exports des erreurs
export * from './main/shared/errors/call-error';

// Exports des états
export { CallState, CallStateMachine } from './main/core/call/state/call-state-machine';

// Export de la classe d'origine pour compatibilité
export { CallProcessSignaling, RTCExchangeDataType } from './main/core/call/driven/call-process-signaling';
export type { CallBack, PeerConnect } from './main/core/call/driven/call-process-signaling';

export {FirebaseCallProcess} from './main/infrastructure/signaling/FirebaseCallProcess'