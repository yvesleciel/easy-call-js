export interface IVideoUIService {
    createVideoElement(id: string, containerId: string): HTMLVideoElement;
    attachStream(videoId: string, stream: MediaStream): void;
    removeVideo(videoId: string): void;
    getVideoElement(id: string): HTMLVideoElement | null;
    cleanup(): void;
}