import { Logger } from "../../shared/utils/logger";
import { MediaConfig } from "../../core/call/app-config/call-config";
import { MediaDeviceError } from "../../shared/errors/call-error";
import { IMediaService } from "../../core/call/driven/media.service";

/**
 * Bundled browser implementation of {@link IMediaService}. Delegates to
 * {@code navigator.mediaDevices} and keeps a reference to every captured
 * stream so {@link cleanup} can release them all.
 */
export class MediaService implements IMediaService {
    private readonly logger = Logger.getInstance();
    private activeStreams = new Set<MediaStream>();

    constructor(private readonly config: MediaConfig) {
    }

    async getUserMedia(constraints?: MediaStreamConstraints): Promise<MediaStream> {
        try {
            this.logger.debug('Requesting user media', { constraints });

            const finalConstraints = constraints || this.config;

            if (!navigator.mediaDevices?.getUserMedia) {
                throw new MediaDeviceError('getUserMedia is not supported in this browser');
            }

            const stream = await navigator.mediaDevices.getUserMedia(finalConstraints);
            this.activeStreams.add(stream);

            this.logger.info('User media obtained successfully', {
                videoTracks: stream.getVideoTracks().length,
                audioTracks: stream.getAudioTracks().length
            });

            return stream;
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown media error';
            this.logger.error('Failed to get user media', error as Error);
            throw new MediaDeviceError(`Failed to access media devices: ${message}`, {constraints});
        }
    }

    stopAllTracks(stream: MediaStream): void {
        try {
            this.logger.debug('Stopping media stream tracks');

            stream.getTracks().forEach(track => {
                track.stop();
                this.logger.debug(`Stopped ${track.kind} track`);
            });

            this.activeStreams.delete(stream);

        } catch (error) {
            this.logger.error('Error stopping media tracks', error as Error);
        }
    }

    async getAvailableDevices(): Promise<MediaDeviceInfo[]> {
        try {
            if (!navigator.mediaDevices?.enumerateDevices) {
                throw new MediaDeviceError('Device enumeration not supported');
            }

            const devices = await navigator.mediaDevices.enumerateDevices();
            this.logger.debug('Available devices enumerated', {count: devices.length});
            return devices;
        } catch (error) {
            this.logger.error('Failed to enumerate devices', error as Error);
            throw new MediaDeviceError('Failed to enumerate media devices');
        }
    }

    cleanup(): void {
        try {
            this.logger.info('Cleaning up media service');
            this.activeStreams.forEach(stream => this.stopAllTracks(stream));
            this.activeStreams.clear();
        } catch (error) {
            this.logger.error('Failed to cleanup media service', error as Error);
        }
    }
}