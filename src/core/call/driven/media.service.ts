/**
 * Secondary port for local media capture.
 *
 * Adapter contract used by {@link CallProcessService} to request the local
 * camera/microphone stream, enumerate devices, and release captured tracks.
 * A default implementation delegating to {@code navigator.mediaDevices} is
 * shipped as {@code MediaService}.
 */
export interface IMediaService {
    /** Requests a local {@link MediaStream}. Uses the configured constraints when none are supplied. */
    getUserMedia(constraints?: MediaStreamConstraints): Promise<MediaStream>;

    /** Stops every track of the provided stream. */
    stopAllTracks(stream: MediaStream): void;

    /** Enumerates the media input/output devices available to the user. */
    getAvailableDevices(): Promise<MediaDeviceInfo[]>;

    /** Releases every stream captured through {@link getUserMedia}. */
    cleanup(): void;
}
