import { CallProcessService } from '../../../services/call-process.service';
import { CallProcessSignaling } from '../driven/call-process-signaling';
import { ConfigService, CallConfig } from '../app-config/call-config';
import {MediaService} from "../../../infrastructure/media/media.service.adapter";
import {VideoUIService} from "../../../infrastructure/video-ui/video-ui.service.adapter";
import {WebRTCService} from "../../../infrastructure/webrtc/webrtc.service.adapter";

export class CallServiceFactory {
    static create(callProcess: CallProcessSignaling, config?: Partial<CallConfig>): CallProcessService {
        const finalConfig = { ...ConfigService.getInstance().getDefaultConfig(), ...config };

        const mediaService = new MediaService(finalConfig.media);
        const videoUIService = new VideoUIService(finalConfig.ui);
        const webRTCService = new WebRTCService(finalConfig.rtc, finalConfig.timeouts);

        return new CallProcessService(
            callProcess,
            mediaService,
            videoUIService,
            webRTCService
        );
    }
}