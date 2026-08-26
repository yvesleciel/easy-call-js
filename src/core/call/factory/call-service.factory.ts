import { CallProcessService } from '../../../services/call-process.service';
import { CallProcessSignaling } from '../driven/call-process-signaling';
import { ConfigService, CallConfig, mergeCallConfig } from '../app-config/call-config';
import { MediaService } from '../../../infrastructure/media/media.service.adapter';
import { WebRTCService } from '../../../infrastructure/webrtc/webrtc.service.adapter';

/**
 * Convenience factory that wires a {@link CallProcessService} with the
 * bundled browser-based media and WebRTC adapters. The provided
 * {@code config} is deep-merged onto the library defaults.
 *
 * ```ts
 * const service = CallServiceFactory.create(new FirebaseCallProcess(...));
 * ```
 */
export class CallServiceFactory {
    static create(signaling: CallProcessSignaling, config?: Partial<CallConfig>): CallProcessService {
        const finalConfig = mergeCallConfig(ConfigService.getInstance().getDefaultConfig(), config);

        const mediaService = new MediaService(finalConfig.media);
        const webRTCService = new WebRTCService(finalConfig.rtc, finalConfig.timeouts);

        return new CallProcessService(signaling, mediaService, webRTCService);
    }
}
