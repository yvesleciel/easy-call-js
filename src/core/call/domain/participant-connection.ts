import { IWebRTCService } from '../driven/webrtc.service';

/**
 * Value object binding an {@link RTCPeerConnection} to its participant
 * identifier. Provides the small subset of operations that
 * {@link SignalingExchange} needs to wire up the peer.
 */
export class ParticipantConnection {
    constructor(
        readonly participantId: string,
        readonly connection: RTCPeerConnection,
        private readonly webRTCService: IWebRTCService,
    ) {}

    /** Attaches every track of the given local stream to the peer connection. */
    bindLocalTracks(stream: MediaStream): void {
        stream.getTracks().forEach(track => {
            this.webRTCService.addTrack(this.connection, track, stream);
        });
    }

    /** Registers a callback invoked whenever the connection state changes. */
    onConnectionStateChange(callback: (state: RTCPeerConnectionState) => void): void {
        this.connection.addEventListener('connectionstatechange', () => {
            callback(this.connection.connectionState);
        });
    }

    /** Closes the underlying peer connection. */
    close(): void {
        this.connection.close();
    }
}

