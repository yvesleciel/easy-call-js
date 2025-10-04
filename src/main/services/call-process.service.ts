import { Observable, Subject, takeUntil } from 'rxjs';
import { ICallProcessService } from '../core/call/driving/call-process';
import { CallProcessSignaling, RTCExchangeDataType } from '../core/call/driven/call-process-signaling';
import { CallParam, TriggerCallParam, CallValidators } from '../core/call/validators/call-validators';
import { Logger } from '../shared/utils/logger';
import { CallStateMachine, CallState } from '../core/call/state/call-state-machine';
import { IMediaService } from '../core/call/driven/media.service';
import { IVideoUIService } from '../core/call/driven/video-ui.service';
import { IWebRTCService } from '../core/call/driven/webrtc.service';
import { ResourceManager } from '../core/call/driven/resource-manager.service';
import {AnswerHandler, IceHandler, OfferHandler} from "../core/call/handlers/callback-handlers";

export class CallProcessService implements ICallProcessService {
  private readonly logger = Logger.getInstance();
  private readonly stateMachine = new CallStateMachine();
  private readonly resourceManager = new ResourceManager();
  private readonly destroySubject = new Subject<void>();

  constructor(
      private readonly callProcess: CallProcessSignaling,
      private readonly mediaService: IMediaService,
      private readonly videoUIService: IVideoUIService,
      private readonly webRTCService: IWebRTCService
  ) {
    this.setupStateSubscriptions();
  }

  /**
   * Initialize a new call
   */
  async initializeCall(callIssuer: string, usersToCallId: string[]): Promise<string> {
    try {
      CallValidators.validateParticipantId(callIssuer);
      CallValidators.validateUsersArray(usersToCallId);

      this.stateMachine.transition(CallState.INITIALIZING, { participantCount: usersToCallId.length });

      this.logger.info('Initializing call', { callIssuer, participantCount: usersToCallId.length });

      const callId = await this.callProcess.createCall(callIssuer, usersToCallId);

      this.logger.info('Call initialized successfully', { callId, callIssuer });
      return callId;

    } catch (error) {
      this.stateMachine.transition(CallState.ERROR, { error: (error as Error).message });
      this.logger.error('Failed to initialize call', error as Error, { callIssuer });
      throw error;
    }
  }

  /**
   * Launch a call to multiple users
   */
  async launchCall(callParam: CallParam, callId: string): Promise<void> {
    try {
      CallValidators.validateCallParam(callParam);
      CallValidators.validateCallId(callId);

      this.stateMachine.transition(CallState.CONNECTING, { callId });

      this.logger.info('Launching call', { callId, participantCount: callParam.usersToCallId.length });

      const localStream = await this.setupLocalVideo(callParam.localVideoSelector);

      const processPromises = callParam.usersToCallId.map(participantId =>
          this.processParticipant({
            callParam,
            callId,
            participantId,
            localStream
          })
      );

      await Promise.allSettled(processPromises);

      this.stateMachine.transition(CallState.CONNECTED, { callId });
      this.logger.info('Call launched successfully', { callId });

    } catch (error) {
      this.stateMachine.transition(CallState.ERROR, { error: (error as Error).message });
      this.logger.error('Failed to launch call', error as Error, { callId });
      throw error;
    }
  }

  /**
   * Accept an incoming call
   */
  async takeCall(
      participantId: string,
      callId: string,
      localVideoSelector: string,
      idContentForCallSelector: string
  ): Promise<void> {
    try {
      CallValidators.validateParticipantId(participantId);
      CallValidators.validateCallId(callId);

      this.stateMachine.transition(CallState.CONNECTING, { callId, participantCount: 1 });

      this.logger.info('Taking call', { participantId, callId });

      const localStream = await this.setupLocalVideo(localVideoSelector);

      // Listen for lock release to join the call
      this.callProcess.listenForLockRelease(callId, participantId, async () => {
        await this.handleJoinCall(callId, participantId, localStream, idContentForCallSelector);
      });

    } catch (error) {
      this.stateMachine.transition(CallState.ERROR, { error: (error as Error).message });
      this.logger.error('Failed to take call', error as Error, { participantId, callId });
      throw error;
    }
  }

  /**
   *Monitor new calls for a user
   */
  async trackCall(userId: string): Promise<string> {
    try {
      CallValidators.validateParticipantId(userId);

      this.logger.info('Tracking calls for user', { userId });
      return await this.callProcess.onNewCall(userId);

    } catch (error) {
      this.logger.error('Failed to track calls', error as Error, { userId });
      throw error;
    }
  }

  /**
   * Leave a call and free resources
   */
  async releaseCall(callId: string, userId: string): Promise<void> {
    try {
      CallValidators.validateCallId(callId);
      CallValidators.validateParticipantId(userId);

      this.stateMachine.transition(CallState.DISCONNECTING, { callId });

      this.logger.info('Releasing call', { callId, userId });

      await this.callProcess.releaseCall(callId, userId);
      await this.resourceManager.cleanupAll();

      this.stateMachine.transition(CallState.IDLE);
      this.logger.info('Call released successfully', { callId, userId });

    } catch (error) {
      this.logger.error('Failed to release call', error as Error, { callId, userId });
      throw error;
    }
  }

  async rejectCall(userId: string): Promise<void> {
    try {
      CallValidators.validateParticipantId(userId);
      await this.callProcess.rejectCall(userId);

      this.logger.info('Call rejected successfully', { userId });
    } catch (error) {
      this.logger.error('Failed to reject call', error as Error, { userId });
      throw error;
    }
  }

  /**
   * Listen for call departure events
   */
  handleLeaveCall(callId: string): Observable<string> {
    CallValidators.validateCallId(callId);

    this.logger.info('Setting up leave call handler', { callId });
    return this.callProcess.onLeaveCall(callId);
  }

  /**
   * Remove a participant's video
   */
  removeParticipantVideo(userId: string): void {
    try {
      CallValidators.validateParticipantId(userId);

      this.logger.info('Removing participant video', { userId });
      this.videoUIService.removeVideo(`remote${userId}`);
      this.resourceManager.cleanupParticipant(userId);

    } catch (error) {
      this.logger.error('Failed to remove participant video', error as Error, { userId });
    }
  }


  /**
   * Clean up all resources
   */
  async cleanup(): Promise<void> {
    this.logger.info('Cleaning up call process service');

    this.destroySubject.next();
    this.destroySubject.complete();

    // Clean up all resources in parallel and capture errors
    const cleanupOperations = [
      this.safeCleanup('ResourceManager', () => this.resourceManager.cleanupAll()),
      this.safeCleanup('MediaService', () => this.mediaService.cleanup()),
      this.safeCleanup('VideoUIService', () => this.videoUIService.cleanup()),
      this.safeCleanup('WebRTCService', () => this.webRTCService.cleanup())
    ];

    const results = await Promise.allSettled(cleanupOperations);

    const failures = results
        .map((result, index) => ({ result, operation: cleanupOperations[index] }))
        .filter(({ result }) => result.status === 'rejected');

    if (failures.length > 0) {
      this.logger.warn(`Some cleanup operations failed`, {
        failedCount: failures.length,
        totalCount: cleanupOperations.length
      });
    }
  }



  // private method
  private async safeCleanup(serviceName: string, cleanupFn: () => void | Promise<void>): Promise<void> {
    try {
      await cleanupFn();
      this.logger.debug(`${serviceName} cleanup completed`);
    } catch (error) {
      this.logger.error(`${serviceName} cleanup failed`, error as Error);
    }
  }

  private async setupLocalVideo(videoSelector: string): Promise<MediaStream> {
    const localStream = await this.mediaService.getUserMedia();
    this.videoUIService.attachStream(videoSelector, localStream);
    this.resourceManager.addStream('local', localStream);
    return localStream;
  }

  private async processParticipant(triggerCallParam: TriggerCallParam): Promise<void> {
    try {
      this.logger.debug('Processing participant', { participantId: triggerCallParam.participantId });

      const rtcConnection = await this.webRTCService.createConnection(triggerCallParam.participantId);
      this.resourceManager.addConnection(triggerCallParam.participantId, rtcConnection);

      // add local track
      triggerCallParam.localStream.getTracks().forEach(track => {
        this.webRTCService.addTrack(rtcConnection, track, triggerCallParam.localStream);
      });

      // Create and send offer
      const offer = await this.webRTCService.createOffer(rtcConnection);

      // Configure events management
      await this.setupConnectionEventHandlers(rtcConnection, triggerCallParam);

      this.callProcess.writeOfferOrAnswerOrIce(
          triggerCallParam.callId,
          triggerCallParam.participantId,
          RTCExchangeDataType.OFFER,
          {offer, issuer: triggerCallParam.callParam.callIssuerId}
      );

      // Listen to responses
      await this.setupAnswerAndIceHandlers(rtcConnection, triggerCallParam);

      this.logger.info('Participant processed successfully', { participantId: triggerCallParam.participantId });

    } catch (error) {
      this.logger.error('Failed to process participant', error as Error, {
        participantId: triggerCallParam.participantId
      });
      throw error;
    }
  }

  private async setupConnectionEventHandlers(
      connection: RTCPeerConnection,
      triggerCallParam: TriggerCallParam
  ): Promise<void> {
    // ICE candidates managemen
    connection.addEventListener('icecandidate', event => {
      if (event.candidate) {
        const iceCandidateData = {
          candidate: event.candidate.candidate,
          sdpMid: event.candidate.sdpMid,
          sdpMLineIndex: event.candidate.sdpMLineIndex,
        };

        this.callProcess.writeOfferOrAnswerOrIce(
            triggerCallParam.callId,
            triggerCallParam.participantId,
            RTCExchangeDataType.ICE,
            { ice: iceCandidateData, issuer: triggerCallParam.callParam.callIssuerId }
        );
      }
    });

    // Incoming streams management
    connection.addEventListener('track', event => {
      const remoteVideoId = `remote${triggerCallParam.participantId}`;

      this.logger.info('Received track', {
        kind: event.track.kind,
        enabled: event.track.enabled,
        streamsCount: event.streams.length
      });

      if (event.streams && event.streams.length > 0) {
        const remoteStream = event.streams[0];

        let remoteVideo = this.videoUIService.getVideoElement(remoteVideoId);
        if (!remoteVideo) {
          remoteVideo = this.videoUIService.createVideoElement(
              remoteVideoId,
              triggerCallParam.callParam.idContentForCall
          );
        }

        // attach stream
        this.videoUIService.attachStream(remoteVideoId, remoteStream);
        this.resourceManager.addStream(triggerCallParam.participantId, remoteStream);

        this.logger.info('Remote stream attached', {
          participantId: triggerCallParam.participantId,
          videoTracks: remoteStream.getVideoTracks().length,
          audioTracks: remoteStream.getAudioTracks().length
        });
      } else {
        this.logger.warn('No streams received with track', {
          participantId: triggerCallParam.participantId,
          trackKind: event.track.kind
        });
      }
    });

  }

  private async setupAnswerAndIceHandlers(
      connection: RTCPeerConnection,
      triggerCallParam: TriggerCallParam
  ): Promise<void> {
    // listen responses
    console.log("setupAnswerAndIceHandlers");
    await this.callProcess.onReadOfferOrAnswerOrIce(
        triggerCallParam.callId,
        triggerCallParam.callParam.callIssuerId,
        triggerCallParam.participantId,
        RTCExchangeDataType.ANSWER,
        new AnswerHandler(connection, this.webRTCService)
    );

    // listen ice candidate
    await this.callProcess.onReadOfferOrAnswerOrIce(
        triggerCallParam.callId,
        triggerCallParam.callParam.callIssuerId,
        triggerCallParam.participantId,
        RTCExchangeDataType.ICE,
        new IceHandler(connection, this.webRTCService)
    );
  }

  private async handleJoinCall(
      callId: string,
      participantId: string,
      localStream: MediaStream,
      idContentForCallSelector: string
  ): Promise<void> {
    await this.callProcess.joinCall(callId, participantId);

    await this.handleExistingParticipants(callId, participantId, localStream, idContentForCallSelector);

    await this.handleNewParticipants(callId, participantId, localStream, idContentForCallSelector);

    this.stateMachine.transition(CallState.CONNECTED, { callId });
  }

  private async handleNewParticipants(
      callId: string,
      participantId: string,
      localStream: MediaStream,
      idContentForCallSelector: string
  ): Promise<void> {
    const participantsToProcess = await this.callProcess.getParticipantNotInCall(callId);
    if (participantsToProcess.length > 0) {
      const processPromises = participantsToProcess.map(async participant => {
        try {
          await this.processParticipant({
            callParam: {
              usersToCallId: participantsToProcess,
              callIssuerId: participantId,
              idContentForCall: idContentForCallSelector,
              localVideoSelector: 'localVideo'
            },
            participantId: participant,
            callId,
            localStream
          });
        } catch (error) {
          this.logger.error('Error processing new participant', error as Error, { participant });
        }
      });

      await Promise.allSettled(processPromises);
    }
  }

  private async handleExistingParticipants(
      callId: string,
      participantId: string,
      localStream: MediaStream,
      idContentForCallSelector: string
  ): Promise<void> {
    const existingParticipants = await this.callProcess.getAlreadyParticipants(callId);
    this.logger.info('Existing participants', { existingParticipants });
    if (existingParticipants) {
      for (const participant of existingParticipants) {
        if (participant !== participantId) {
          await this.handleExistingParticipant(
              callId,
              participantId,
              participant,
              localStream,
              idContentForCallSelector
          );
        }
      }
    }
  }

  private async handleExistingParticipant(
      callId: string,
      participantId: string,
      existingParticipant: string,
      localStream: MediaStream,
      idContentForCallSelector: string
  ): Promise<void> {
    try {
      this.logger.debug('Handling existing participant', { existingParticipant });
      const connection = await this.webRTCService.createConnection(existingParticipant);
      this.resourceManager.addConnection(existingParticipant, connection);

      localStream.getTracks().forEach(track => {
        this.webRTCService.addTrack(connection, track, localStream);
      });

      await this.callProcess.onReadOfferOrAnswerOrIce(
          callId,
          participantId,
          existingParticipant,
          RTCExchangeDataType.OFFER,
          new OfferHandler(connection, this.webRTCService, callId, existingParticipant, participantId, this.callProcess)
      );

      await this.setupExistingParticipantEvents(
          connection,
          callId,
          participantId,
          existingParticipant,
          idContentForCallSelector
      );

    } catch (error) {
      this.logger.error('Failed to handle existing participant', error as Error, { existingParticipant });
    }
  }

  private async setupExistingParticipantEvents(
      connection: RTCPeerConnection,
      callId: string,
      participantId: string,
      existingParticipant: string,
      idContentForCallSelector: string
  ): Promise<void> {
    connection.addEventListener('icecandidate', event => {
      if (event.candidate) {
        const iceCandidateData = {
          candidate: event.candidate.candidate,
          sdpMid: event.candidate.sdpMid,
          sdpMLineIndex: event.candidate.sdpMLineIndex,
        };

        this.callProcess.writeOfferOrAnswerOrIce(
            callId,
            existingParticipant,
            RTCExchangeDataType.ICE,
            { ice: iceCandidateData, issuer: participantId }
        );
      }
    });

    connection.addEventListener('track', event => {
      const remoteVideoId = `remote${existingParticipant}`;

      this.logger.info('Received track', {
        kind: event.track.kind,
        enabled: event.track.enabled,
        streamsCount: event.streams.length
      });

      if (event.streams && event.streams.length > 0) {
        const remoteStream = event.streams[0];

        let remoteVideo = this.videoUIService.getVideoElement(remoteVideoId);
        if (!remoteVideo) {
          remoteVideo = this.videoUIService.createVideoElement(
              remoteVideoId,
              idContentForCallSelector
          );
        }

        this.videoUIService.attachStream(remoteVideoId, remoteStream);
        this.resourceManager.addStream(participantId, remoteStream);

        this.logger.info('Remote stream attached', {
          participantId: participantId,
          videoTracks: remoteStream.getVideoTracks().length,
          audioTracks: remoteStream.getAudioTracks().length
        });
      } else {
        this.logger.warn('No streams received with track', {
          participantId: participantId,
          trackKind: event.track.kind
        });
      }
    });

    await this.callProcess.onReadOfferOrAnswerOrIce(
        callId,
        participantId,
        existingParticipant,
        RTCExchangeDataType.ICE,
        new IceHandler(connection, this.webRTCService)
    );
  }

  private setupStateSubscriptions(): void {
    this.stateMachine.stateChanges$
        .pipe(takeUntil(this.destroySubject))
        .subscribe(({ state, context }) => {
          this.logger.info('Call state changed', { state, context });
        });
  }
}