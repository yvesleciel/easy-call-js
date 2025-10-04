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