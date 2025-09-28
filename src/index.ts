// Exports principaux
export { CallProcessService } from './main/services/call-process.service';
export { CallServiceFactory } from './main/factory/call-service.factory';
export { ConfigService } from './main/config/call-config';
export { Logger, LogLevel } from './main/utils/logger';

// Exports des types
export type { CallParam, TriggerCallParam } from './main/validators/call-validators';
export type { CallConfig, RTCConfig, MediaConfig, UIConfig } from './main/config/call-config';
export type { ICallProcessService } from './main/api/call-process';

// Exports des erreurs
export * from './main/errors/call-error';

// Exports des états
export { CallState, CallStateMachine } from './main/state/call-state-machine';

// Export de la classe d'origine pour compatibilité
export { CallProcess, RTCExchangeDataType } from './main/feature/CallProcess';
export type { CallBack, PeerConnect } from './main/feature/CallProcess';

export {FirebaseCallProcess} from './main/signaling/FirebaseCallProcess'