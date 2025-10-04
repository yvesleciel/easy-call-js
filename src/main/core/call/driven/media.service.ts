export interface IMediaService {
    getUserMedia(constraints?: MediaStreamConstraints): Promise<MediaStream>;
    stopAllTracks(stream: MediaStream): void;
    getAvailableDevices(): Promise<MediaDeviceInfo[]>;
    cleanup(): void;
}