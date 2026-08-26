/**
 * Secondary port for the browser WebRTC layer.
 *
 * Adapter contract used by {@link CallProcessService} and
 * {@link SignalingExchange} to create peer connections, produce SDP
 * offers/answers, apply remote descriptions, forward ICE candidates, and
 * attach local tracks. A default implementation wrapping
 * {@code RTCPeerConnection} is shipped as {@code WebRTCService}.
 */
export interface IWebRTCService {
    /** Creates a new {@link RTCPeerConnection} keyed by the participant identifier. */
    createConnection(participantId: string): Promise<RTCPeerConnection>;

    /** Produces a local SDP offer and sets it as the local description. */
    createOffer(connection: RTCPeerConnection): Promise<RTCSessionDescriptionInit>;

    /** Produces a local SDP answer and sets it as the local description. */
    createAnswer(connection: RTCPeerConnection): Promise<RTCSessionDescriptionInit>;

    /** Applies the received remote SDP description. */
    setRemoteDescription(connection: RTCPeerConnection, description: RTCSessionDescriptionInit): Promise<void>;

    /** Registers a remote ICE candidate on the connection. */
    addIceCandidate(connection: RTCPeerConnection, candidate: RTCIceCandidateInit): Promise<void>;

    /** Attaches a local track/stream to the connection for transmission. */
    addTrack(connection: RTCPeerConnection, track: MediaStreamTrack, stream: MediaStream): void;

    /** Closes every managed connection. */
    cleanup(): void;

    /** Closes the connection associated with the given participant. */
    closeConnection(participantId: string): void;
}
