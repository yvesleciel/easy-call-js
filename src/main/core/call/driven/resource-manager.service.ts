import { Logger } from '../../../shared/utils/logger';

export class ResourceManager {
    private readonly logger = Logger.getInstance();
    private connections = new Map<string, RTCPeerConnection>();
    private streams = new Map<string, MediaStream>();
    private cleanupTasks = new Set<() => Promise<void> | void>();

    addConnection(participantId: string, connection: RTCPeerConnection): void {
        this.logger.debug('Adding connection to resource manager', { participantId });
        this.connections.set(participantId, connection);
    }

    addStream(participantId: string, stream: MediaStream): void {
        this.logger.debug('Adding stream to resource manager', { participantId });
        this.streams.set(participantId, stream);
    }

    addCleanupTask(task: () => Promise<void> | void): void {
        this.cleanupTasks.add(task);
    }

    async cleanupParticipant(participantId: string): Promise<void> {
        this.logger.info('Cleaning up participant resources', { participantId });

        // Fermer la connexion WebRTC
        const connection = this.connections.get(participantId);
        if (connection) {
            try {
                connection.close();
                this.connections.delete(participantId);
                this.logger.debug('Connection closed and removed', { participantId });
            } catch (error) {
                this.logger.error('Error closing connection', error as Error, { participantId });
            }
        }

        // Arrêter le stream
        const stream = this.streams.get(participantId);
        if (stream) {
            try {
                stream.getTracks().forEach(track => track.stop());
                this.streams.delete(participantId);
                this.logger.debug('Stream stopped and removed', { participantId });
            } catch (error) {
                this.logger.error('Error stopping stream', error as Error, { participantId });
            }
        }
    }

    async cleanupAll(): Promise<void> {
        this.logger.info('Cleaning up all resources');

        // Nettoyer tous les participants
        const participantIds = Array.from(new Set([
            ...this.connections.keys(),
            ...this.streams.keys()
        ]));

        await Promise.all(
            participantIds.map(id => this.cleanupParticipant(id))
        );

        // Exécuter les tâches de nettoyage personnalisées
        const cleanupPromises = Array.from(this.cleanupTasks).map(async task => {
            try {
                await task();
            } catch (error) {
                this.logger.error('Error in cleanup task', error as Error);
            }
        });

        await Promise.all(cleanupPromises);
        this.cleanupTasks.clear();

        this.logger.info('All resources cleaned up');
    }

    getConnectionCount(): number {
        return this.connections.size;
    }

    getStreamCount(): number {
        return this.streams.size;
    }

    hasParticipant(participantId: string): boolean {
        return this.connections.has(participantId) || this.streams.has(participantId);
    }
}