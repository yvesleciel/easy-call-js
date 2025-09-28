
import { WebRTCConnectionError } from '../errors/call-error';
import { Logger } from '../utils/logger';
import { RTCConfig, TimeoutConfig } from '../config/call-config';

export interface IWebRTCService {
    createConnection(participantId: string): Promise<RTCPeerConnection>;
    createOffer(connection: RTCPeerConnection): Promise<RTCSessionDescriptionInit>;
    createAnswer(connection: RTCPeerConnection): Promise<RTCSessionDescriptionInit>;
    setRemoteDescription(connection: RTCPeerConnection, description: RTCSessionDescriptionInit): Promise<void>;
    addIceCandidate(connection: RTCPeerConnection, candidate: RTCIceCandidateInit): Promise<void>;
    addTrack(connection: RTCPeerConnection, track: MediaStreamTrack, stream: MediaStream): void;
    cleanup(): void;
    closeConnection(participantId: string): void;
}

export class WebRTCService implements IWebRTCService {
    private readonly logger = Logger.getInstance();
    private connections = new Map<string, RTCPeerConnection>();

    constructor(
        private rtcConfig: RTCConfig,
        private timeouts: TimeoutConfig
    ) {}

    async createConnection(participantId: string): Promise<RTCPeerConnection> {
        try {
            this.logger.debug('Creating WebRTC connection', { participantId });

            const connection = new RTCPeerConnection(this.rtcConfig);

            // Configuration des événements de base
            this.setupConnectionEvents(connection, participantId);

            this.connections.set(participantId, connection);

            this.logger.info('WebRTC connection created successfully', { participantId });
            return connection;

        } catch (error) {
            this.logger.error('Failed to create WebRTC connection', error as Error, { participantId });
            throw new WebRTCConnectionError(`Failed to create connection for ${participantId}`, { participantId });
        }
    }

    async createOffer(connection: RTCPeerConnection): Promise<RTCSessionDescriptionInit> {
        try {
            this.logger.debug('Creating WebRTC offer');

            const offer: RTCSessionDescriptionInit  = await Promise.race([
                connection.createOffer(),
                this.createTimeoutPromise<never>('Create offer timed out')
            ]);

            await this.setLocalDescription(connection, offer);

            this.logger.info('WebRTC offer created successfully');
            return offer;

        } catch (error) {
            this.logger.error('Failed to create offer', error as Error);
            throw new WebRTCConnectionError('Failed to create WebRTC offer');
        }
    }

    async createAnswer(connection: RTCPeerConnection): Promise<RTCSessionDescriptionInit> {
        try {
            this.logger.debug('Creating WebRTC answer');

            const answer: RTCSessionDescriptionInit = await Promise.race([
                connection.createAnswer(),
                this.createTimeoutPromise<never>('Create answer timed out')
            ]);

            await this.setLocalDescription(connection, answer);

            this.logger.info('WebRTC answer created successfully');
            return answer;

        } catch (error) {
            this.logger.error('Failed to create answer', error as Error);
            throw new WebRTCConnectionError('Failed to create WebRTC answer');
        }
    }

    async setRemoteDescription(connection: RTCPeerConnection, description: RTCSessionDescriptionInit): Promise<void> {
        try {
            this.logger.debug('Setting remote description', { type: description.type });

            await Promise.race([
                connection.setRemoteDescription(description),
                this.createTimeoutPromise('Set remote description timed out')
            ]);

            this.logger.info('Remote description set successfully', { type: description.type });

        } catch (error) {
            this.logger.error('Failed to set remote description', error as Error);
            throw new WebRTCConnectionError('Failed to set remote description');
        }
    }

    async addIceCandidate(connection: RTCPeerConnection, candidate: RTCIceCandidateInit): Promise<void> {
        try {
            this.logger.debug('Adding ICE candidate');

            await Promise.race([
                connection.addIceCandidate(new RTCIceCandidate(candidate)),
                this.createTimeoutPromise('Add ICE candidate timed out')
            ]);

            this.logger.debug('ICE candidate added successfully');

        } catch (error) {
            // Les erreurs ICE peuvent être non-critiques
            this.logger.warn('Failed to add ICE candidate', { error: (error as Error).message });
        }
    }

    async addTrack(connection: RTCPeerConnection, track: MediaStreamTrack, stream: MediaStream): Promise<void> {
        try {
            this.logger.debug('Adding track to connection', { trackKind: track.kind });
            connection.addTrack(track, stream);
            // To Remove
/*            const sender = connection.getSenders().find(s => s.track?.kind === 'video');
            if (sender) {
                const rep = await sender.getStats();
                rep.forEach(s => {
                    if (s.type === 'outbound-rtp' && !s.isRemote) {
                        this.logger.info('outbound-rtp', {
                            frameWidth: (s as any).frameWidth,
                            frameHeight: (s as any).frameHeight,
                            fps: s.framesPerSecond,
                            qualityLimitationReason: (s as any).qualityLimitationReason // 'cpu' | 'bandwidth' | 'none'
                        });
                    }
                });

                const params = sender.getParameters();
                params.encodings = [{ scaleResolutionDownBy: 1, maxBitrate: 1_500_000 }];
                (params as any).degradationPreference = 'maintain-resolution';
                await sender.setParameters(params);
            }*/

            // END
            this.logger.debug('Track added successfully', { trackKind: track.kind });

        } catch (error) {
            this.logger.error('Failed to add track', error as Error);
            throw new WebRTCConnectionError('Failed to add track to connection');
        }
    }

    private async setLocalDescription(connection: RTCPeerConnection, description: RTCSessionDescriptionInit): Promise<void> {
        await Promise.race([
            connection.setLocalDescription(description),
            this.createTimeoutPromise('Set local description timed out')
        ]);
    }

    private setupConnectionEvents(connection: RTCPeerConnection, participantId: string): void {
        connection.addEventListener('connectionstatechange', () => {
            this.logger.info('Connection state changed', {
                participantId,
                state: connection.connectionState
            });
        });

        connection.addEventListener('iceconnectionstatechange', () => {
            this.logger.info('ICE connection state changed', {
                participantId,
                state: connection.iceConnectionState
            });
        });

        connection.addEventListener('icegatheringstatechange', () => {
            this.logger.debug('ICE gathering state changed', {
                participantId,
                state: connection.iceGatheringState
            });
        });
    }

    private createTimeoutPromise<T>(message: string): Promise<T> {
        return new Promise((_, reject) => {
            setTimeout(() => reject(new Error(message)), this.timeouts.connectionTimeout);
        });
    }

    closeConnection(participantId: string): void {
        const connection = this.connections.get(participantId);
        if (connection) {
            try {
                connection.close();
                this.connections.delete(participantId);
                this.logger.info('WebRTC connection closed', { participantId });
            } catch (error) {
                this.logger.error('Error closing WebRTC connection', error as Error, { participantId });
            }
        }
    }

    cleanup(): void {
        this.logger.info('Cleaning up WebRTC service');
        Array.from(this.connections.keys()).forEach(id => this.closeConnection(id));
    }
}