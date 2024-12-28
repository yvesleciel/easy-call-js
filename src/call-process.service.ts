import {
  CallBack,
  CallParam,
  CallProcess,
  PeerConnect,
  RTCExchangeDataType,
  TriggerCallParam
} from "./feature/CallProcess";
import {ICallProcessService} from "./api/call-process";
import {Observable} from "rxjs";

export class CallProcessService implements ICallProcessService {

  callProcess: CallProcess;
  configuration: RTCConfiguration;
  constraint: MediaStreamConstraints;
  peers: PeerConnect[] = [];
  constructor(callProcess: CallProcess, configuration: RTCConfiguration, constraint: MediaStreamConstraints) {
    this.callProcess = callProcess;
    this.configuration = configuration;
    this.constraint = constraint;
  }

  initializeCall(callIssuer: string, usersToCallId: string[]) {
    return this.callProcess.createCall(callIssuer, usersToCallId);
  }

  async launchCall(callParam: CallParam, callId: string): Promise<void> {
    let localStream = await navigator.mediaDevices?.getUserMedia(this.constraint);
    const localVideo = document.querySelector('video#' + callParam.videoSelector) as HTMLVideoElement;
    localVideo.srcObject = localStream
    const processPromises = callParam.usersToCallId.map(participantId => {
      return this.process({
        callParam: callParam, callId: callId, participantId: participantId, localStream: localStream
      });
    });
    await Promise.all(processPromises);
  }

  async process(triggerCallParam: TriggerCallParam): Promise<void> {
    const rtcConn = new RTCPeerConnection(this.configuration);
    triggerCallParam.localStream.getTracks().forEach(track => {
      rtcConn.addTrack(track, triggerCallParam.localStream);
    });
    this.peers.push({id: triggerCallParam.participantId, peer: rtcConn});
    const offer = await rtcConn.createOffer();
    await rtcConn.setLocalDescription(offer);
    rtcConn.addEventListener('icecandidate', event => {
      if (event.candidate) {
        const iceCandidateData = {
          candidate: event.candidate.candidate,
          sdpMid: event.candidate.sdpMid,
          sdpMLineIndex: event.candidate.sdpMLineIndex,
        };
        this.callProcess.writeOfferOrAnswerOrIce(triggerCallParam.callId, triggerCallParam.participantId, RTCExchangeDataType.ICE, {ice:iceCandidateData, issuer:triggerCallParam.callParam.callIssuerId});
      }
    });
    this.trackStream(rtcConn, triggerCallParam.callParam.idContentForCall, triggerCallParam.participantId);
    this.callProcess.writeOfferOrAnswerOrIce(triggerCallParam.callId, triggerCallParam.participantId, RTCExchangeDataType.OFFER,
      {offer: offer, issuer: triggerCallParam.callParam.callIssuerId})
    await this.callProcess.onReadOfferOrAnswerOrIce(triggerCallParam.callId, triggerCallParam.callParam.callIssuerId, triggerCallParam.participantId, RTCExchangeDataType.ANSWER, new CallBackForAnswer(rtcConn));
    await this.callProcess.onReadOfferOrAnswerOrIce(triggerCallParam.callId, triggerCallParam.callParam.callIssuerId, triggerCallParam.participantId, RTCExchangeDataType.ICE, new CallBackForIce(rtcConn));
  }

  trackStream(rtcConn: RTCPeerConnection, idContentForCall: string, idOfParticipant: string): void{
    rtcConn.addEventListener('track', event => {
      const id = 'remote'.concat(idOfParticipant);
      const video = document.createElement("video")
      video.controls = false
      video.autoplay = true;
      video.id = id;
      video.playsInline = true;
      video.width = 200;
      video.height = 200;
      video.style.marginRight = "10px";

      if (document.getElementById(id) !== null) document.getElementById(id)!.remove();
      document.getElementById(idContentForCall)!.appendChild(video)
      const remoteVideo = document.querySelector('video#' + id) as HTMLVideoElement;
      let remoteStream = new MediaStream()
      event.streams[0].getTracks().forEach((track: MediaStreamTrack) => {
        remoteStream.addTrack(track);
        remoteVideo.srcObject = remoteStream;
      });
    });
  }

  async takeCall(participantId: string, callId: string, localVideoSelector: string, idContentForCallSelector: string) {
    let localStream = await navigator.mediaDevices?.getUserMedia(this.constraint);
    const localVideo = document.querySelector('video#' + localVideoSelector) as HTMLVideoElement;
    let processPromises: any;
    localVideo.srcObject = localStream
    this.callProcess.listenForLockRelease(callId, participantId, async () => {
      await this.callProcess.joinCall(callId, participantId);
      const participantToProcess = await this.callProcess.getParticipantNotInCall(callId);
      if (participantToProcess.length > 0) {
        processPromises = participantToProcess.map(async people => {
          try {
            await this.process({
              callParam: {
                usersToCallId: participantToProcess,
                callIssuerId: participantId,
                idContentForCall: idContentForCallSelector,
                videoSelector: localVideoSelector
              },
              participantId: people, callId: callId, localStream: localStream
            });
          } catch (error) {
            console.error("Erreur dans process pour participant:", people, error);
          }
        });
      }
      const alreadyInCall = await this.callProcess.getAlreadyParticipants(callId);
      if (alreadyInCall) {
        for (const people of alreadyInCall) {
          if (people != participantId) {
            const rtcConn = new RTCPeerConnection(this.configuration);
            localStream.getTracks().forEach(track => {
              rtcConn.addTrack(track, localStream);
            })
            this.peers.push({id: people, peer: rtcConn});
            await this.callProcess.onReadOfferOrAnswerOrIce(callId, participantId, people, RTCExchangeDataType.OFFER, new CallBackForOffer(rtcConn));
            rtcConn.addEventListener('icecandidate', (event: { candidate: any; }) => {
              if (event.candidate) {
                const iceCandidateData = {
                  candidate: event.candidate.candidate,
                  sdpMid: event.candidate.sdpMid,
                  sdpMLineIndex: event.candidate.sdpMLineIndex,
                };
                this.callProcess.writeOfferOrAnswerOrIce(callId, people, RTCExchangeDataType.ICE, {
                  ice: iceCandidateData,
                  issuer: participantId
                });
              }
            });
            this.trackStream(rtcConn, idContentForCallSelector, people);
            const answer = await rtcConn.createAnswer();
            await rtcConn.setLocalDescription(answer);
            this.callProcess.writeOfferOrAnswerOrIce(callId, people, RTCExchangeDataType.ANSWER, {
              answer: answer,
              issuer: participantId
            });
            await this.callProcess.onReadOfferOrAnswerOrIce(callId, participantId, people, RTCExchangeDataType.ICE, new CallBackForIce(rtcConn));
          }
        }
      }
      try {
        await Promise.all(processPromises);
      } catch (error) {
        console.log('error resolving all promesses');
      }
    })
  }

  async trackCall(userId: string): Promise<string> {
    return await this.callProcess.onNewCall(userId);
  }

  releaseCall(callId: string, userId: string): void {
    const localStream = (document.querySelector('video#' + 'localVideo') as HTMLVideoElement)!.srcObject;
    this.callProcess.releaseCall(callId, userId).then(() => {
      if (localStream) {
        if ("getTracks" in localStream) {
          localStream.getTracks().forEach(track => track.stop());
        }
      }
      // Fermer toutes les connexions WebRTC
      this.peers.forEach(peer => {
        peer.peer.close()
      });
    });
  }

  handleLeaveCall(callId: string): Observable<string> {
    return this.callProcess.onLeaveCall(callId);
  }

  removeParticipantVideo(userId: string) {
    document.getElementById('remote'.concat(userId))!.remove()
  }
}


export class CallBackForAnswer implements CallBack{
  rtcConn: RTCPeerConnection;

  constructor(rtcConn: RTCPeerConnection) {
    this.rtcConn = rtcConn;
  }

  async do(answer: RTCSessionDescriptionInit) {
    await this.rtcConn.setRemoteDescription(answer);
  }
}

export class CallBackForIce implements CallBack {
  rtcConn: RTCPeerConnection;
  constructor(rtcConn: RTCPeerConnection) {
    this.rtcConn = rtcConn;
  }
  async do(ice: any) {
    await this.rtcConn.addIceCandidate(new RTCIceCandidate(ice));
  }
}

export class CallBackForOffer implements CallBack {
  rtcConn: RTCPeerConnection;
  constructor(rtcConn: RTCPeerConnection) {
    this.rtcConn = rtcConn;
  }
  do(offer: RTCSessionDescriptionInit) {
    this.rtcConn.setRemoteDescription(offer).then(async () => {
    });
  }
}

