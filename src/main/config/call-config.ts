export interface RTCConfig {
    iceServers: RTCIceServer[];
    iceCandidatePoolSize?: number;
    bundlePolicy?: RTCBundlePolicy;
}

export interface MediaConfig {
    video: boolean | MediaTrackConstraints;
    audio: boolean | MediaTrackConstraints;
}

export interface UIConfig {
    videoWidth: number;
    videoHeight: number;
    autoplay: boolean;
    controls: boolean;
    playsInline: boolean;
    marginRight: string;
}

export interface TimeoutConfig {
    connectionTimeout: number;
    iceGatheringTimeout: number;
    callSetupTimeout: number;
}

export interface CallConfig {
    rtc: RTCConfig;
    media: MediaConfig;
    ui: UIConfig;
    timeouts: TimeoutConfig;
}

export class ConfigService {
    private static instance: ConfigService;

    static getInstance(): ConfigService {
        if (!this.instance) {
            this.instance = new ConfigService();
        }
        return this.instance;
    }

    getDefaultConfig(): CallConfig {
        return {
            rtc: {
                iceServers: [
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:stun1.l.google.com:19302' }
                ],
                iceCandidatePoolSize: 10,
                bundlePolicy: 'balanced'
            },
            media:  {
                video: {
                    width: { ideal: 1280, min: 640, max: 1920 },
                    height: { ideal: 720, min: 480, max: 1080 },
                    aspectRatio: { ideal: 1.7777777777777777 },
                    frameRate: { ideal: 30 }
                },
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: { ideal: false },
                    channelCount: { ideal: 1 }
                }
            },
            ui: {
                videoWidth: 200,
                videoHeight: 200,
                autoplay: true,
                controls: false,
                playsInline: true,
                marginRight: '10px'
            },
            timeouts: {
                connectionTimeout: 30000,
                iceGatheringTimeout: 10000,
                callSetupTimeout: 15000
            }
        };
    }
}