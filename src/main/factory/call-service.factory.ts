import { CallProcessService } from '../services/call-process.service';
import { MediaService } from '../services/media.service';
import { VideoUIService } from '../services/video-ui.service';
import { WebRTCService } from '../services/webrtc.service';
import { CallProcess } from '../feature/CallProcess';
import { ConfigService, CallConfig } from '../config/call-config';

export class CallServiceFactory {
    static create(callProcess: CallProcess, config?: Partial<CallConfig>): CallProcessService {
        const finalConfig = { ...ConfigService.getInstance().getDefaultConfig(), ...config };

        const mediaService = new MediaService(finalConfig.media);
        const videoUIService = new VideoUIService(finalConfig.ui);
        const webRTCService = new WebRTCService(finalConfig.rtc, finalConfig.timeouts);

        return new CallProcessService(
            callProcess,
            mediaService,
            videoUIService,
            webRTCService,
            finalConfig
        );
    }
}