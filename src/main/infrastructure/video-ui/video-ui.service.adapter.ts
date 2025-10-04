import {Logger} from "../../shared/utils/logger";
import {UIConfig} from "../../core/call/app-config/call-config";
import {VideoElementError} from "../../shared/errors/call-error";
import {IVideoUIService} from "../../core/call/driven/video-ui.service";

export class VideoUIService implements IVideoUIService {
    private readonly logger = Logger.getInstance();
    private videoElements = new Map<string, HTMLVideoElement>();

    constructor(private config: UIConfig) {
    }

    createVideoElement(id: string, containerId: string): HTMLVideoElement {
        try {
            this.logger.debug('Creating video element', {id, containerId});

            // Vérifier que le conteneur existe
            const container = document.getElementById(containerId);
            if (!container) {
                throw new VideoElementError(`Container element ${containerId} not found`);
            }

            // Supprimer l'élément existant s'il existe
            this.removeVideo(id);

            // Créer le nouvel élément vidéo
            const video = document.createElement('video');
            video.id = id;
            video.autoplay = this.config.autoplay;
            video.playsInline = this.config.playsInline;
            video.controls = this.config.controls;
            video.width = this.config.videoWidth;
            video.height = this.config.videoHeight;
            video.style.marginRight = this.config.marginRight;

            container.appendChild(video);
            this.videoElements.set(id, video);

            this.logger.info('Video element created successfully', {id, containerId});
            return video;

        } catch (error) {
            this.logger.error('Failed to create video element', error as Error, {id, containerId});
            throw error;
        }
    }

    attachStream(videoId: string, stream: MediaStream): void {
        try {
            this.logger.debug('Attaching stream to video', {videoId});

            const video = this.getVideoElement(videoId);
            if (!video) {
                throw new VideoElementError(`Video element ${videoId} not found`);
            }

            // Vérifier que le stream contient des tracks vidéo
            const videoTracks = stream.getVideoTracks();
            if (videoTracks.length === 0) {
                this.logger.warn('No video tracks in stream', {videoId});
            }

            // Vérifier l'état des tracks
            videoTracks.forEach((track, index) => {
                this.logger.info('Video track info', {
                    videoId,
                    trackIndex: index,
                    enabled: track.enabled,
                    readyState: track.readyState,
                    kind: track.kind
                });
            });

            video.srcObject = stream;

            // Gérer les événements de chargement
            video.onloadedmetadata = () => {
                this.logger.info('Video metadata loaded', {
                    videoId: videoId,
                    nativeWidth: video.videoWidth,
                    nativeHeight: video.videoHeight,
                    readyState: video.readyState,
                    currentTime: video.currentTime,
                    duration: video.duration
                });

                // Forcer la lecture si elle ne démarre pas automatiquement
                if (video.paused && this.config.autoplay) {
                    video.play().catch(error => {
                        this.logger.warn('Autoplay failed', {videoId});
                    });
                }
            };

            video.oncanplay = () => {
                this.logger.info('Video can play', {videoId});
            };

            video.onplay = () => {
                this.logger.info('Video started playing', {videoId});
            };

            video.onerror = (error) => {
                this.logger.error('Video error', new Error(error as string), {videoId});
            };

            this.logger.info('Stream attached to video successfully', {
                videoId,
                videoTracks: stream.getVideoTracks().length,
                audioTracks: stream.getAudioTracks().length
            });

        } catch (error) {
            this.logger.error('Failed to attach stream to video', error as Error, {videoId});
            throw error;
        }
    }

    removeVideo(videoId: string): void {
        try {
            this.logger.debug('Removing video element', {videoId});

            const video = this.videoElements.get(videoId);
            if (video) {
                // Arrêter le stream s'il existe
                if (video.srcObject) {
                    const stream = video.srcObject as MediaStream;
                    stream.getTracks().forEach(track => track.stop());
                    video.srcObject = null;
                }

                // Supprimer du DOM
                video.remove();
                this.videoElements.delete(videoId);

                this.logger.info('Video element removed successfully', {videoId});
            }

        } catch (error) {
            this.logger.error('Failed to remove video element', error as Error, {videoId});
        }
    }

    getVideoElement(id: string): HTMLVideoElement | null {
        const element = this.videoElements.get(id);
        /*        if (element) {
                    return element;
                }*/

        // Fallback: chercher dans le DOM
        const domElement = document.getElementById(id) as HTMLVideoElement;
        console.log('--------------------------  domElement', domElement)
        if (domElement) {
            this.videoElements.set(id, domElement);
            return domElement;
        }

        return null;
    }

    cleanup(): void {
        this.logger.info('Cleaning up video UI service');
        Array.from(this.videoElements.keys()).forEach(id => this.removeVideo(id));
    }
}