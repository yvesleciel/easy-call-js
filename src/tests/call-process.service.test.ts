import { CallProcessService } from '../main/services/call-process.service';
import { ICallProcessService } from '../main/core/call/driving/call-process';
import { CallProcessSignaling, RTCExchangeDataType } from '../main/core/call/driven/call-process-signaling';
import { IMediaService } from '../main/core/call/driven/media.service';
import { IVideoUIService } from '../main/core/call/driven/video-ui.service';
import { IWebRTCService } from '../main/core/call/driven/webrtc.service';
import { CallParam, CallValidators } from '../main/core/call/validators/call-validators';
import { Logger } from '../main/shared/utils/logger';
import { CallState } from '../main/core/call/state/call-state-machine';
import { Subject, of, throwError } from 'rxjs';

jest.mock('../main/shared/utils/logger');
jest.mock('../main/core/call/validators/call-validators');

describe('CallProcessService', () => {
    let service: ICallProcessService;
    let mockStream: MediaStream;
    let mockConnection: RTCPeerConnection;

    let mockCallProcess: jest.Mocked<CallProcessSignaling>;
    let mockMediaService: jest.Mocked<IMediaService>;
    let mockVideoUIService: jest.Mocked<IVideoUIService>;
    let mockWebRTCService: jest.Mocked<IWebRTCService>;
    let mockLogger: any;
    let mockCallValidators: jest.Mocked<typeof CallValidators>;

    beforeEach(() => {
        mockCallProcess = {
            createCall: jest.fn(),
            onNewCall: jest.fn(),
            listenForLockRelease: jest.fn(),
            releaseCall: jest.fn(),
            rejectCall: jest.fn(),
            onLeaveCall: jest.fn(),
            joinCall: jest.fn(),
            getParticipantNotInCall: jest.fn(),
            getAlreadyParticipants: jest.fn(),
            writeOfferOrAnswerOrIce: jest.fn(),
            onReadOfferOrAnswerOrIce: jest.fn()
        } as unknown as jest.Mocked<CallProcessSignaling>;

        mockMediaService = {
            getUserMedia: jest.fn(),
            stopAllTracks: jest.fn(),
            cleanup: jest.fn()
        } as unknown as jest.Mocked<IMediaService>;

        mockVideoUIService = {
            attachStream: jest.fn(),
            removeVideo: jest.fn(),
            getVideoElement: jest.fn(),
            createVideoElement: jest.fn(),
            cleanup: jest.fn()
        } as jest.Mocked<IVideoUIService>;

        mockWebRTCService = {
            createConnection: jest.fn(),
            createOffer: jest.fn(),
            createAnswer: jest.fn(),
            addTrack: jest.fn(),
            setLocalDescription: jest.fn(),
            setRemoteDescription: jest.fn(),
            addIceCandidate: jest.fn(),
            cleanup: jest.fn()
        } as unknown as jest.Mocked<IWebRTCService>;

        mockLogger = {
            info: jest.fn(),
            error: jest.fn(),
            debug: jest.fn(),
            warn: jest.fn()
        };
        (Logger.getInstance as jest.Mock).mockReturnValue(mockLogger);

        mockCallValidators = {
            validateParticipantId: jest.fn(),
            validateUsersArray: jest.fn(),
            validateCallParam: jest.fn(),
            validateCallId: jest.fn()
        } as unknown as jest.Mocked<typeof CallValidators>;
        (CallValidators as jest.Mocked<typeof CallValidators>) = mockCallValidators;

        mockStream = {
            getTracks: jest.fn().mockReturnValue([]),
            getVideoTracks: jest.fn().mockReturnValue([]),
            getAudioTracks: jest.fn().mockReturnValue([])
        } as unknown as MediaStream;

        mockConnection = {
            addEventListener: jest.fn(),
            removeEventListener: jest.fn(),
            close: jest.fn()
        } as unknown as RTCPeerConnection;

        mockMediaService.getUserMedia.mockResolvedValue(mockStream);
        mockWebRTCService.createConnection.mockResolvedValue(mockConnection);
        mockWebRTCService.createOffer.mockResolvedValue({} as RTCSessionDescriptionInit);
        mockCallProcess.createCall.mockResolvedValue('test-call-id');
        mockCallProcess.onNewCall.mockResolvedValue('incoming-call-id');
        mockCallProcess.onLeaveCall.mockReturnValue(of('user-left'));
        mockCallProcess.getParticipantNotInCall.mockResolvedValue([]);
        mockCallProcess.getAlreadyParticipants.mockResolvedValue([]);
        mockCallProcess.releaseCall.mockResolvedValue(undefined);
        mockCallProcess.rejectCall.mockResolvedValue(undefined);

        service = new CallProcessService(
            mockCallProcess,
            mockMediaService,
            mockVideoUIService,
            mockWebRTCService
        );
    });

    // Clean up after each test
    afterEach(async () => {
        if (service && typeof service.cleanup === 'function') {
            try {
                await service.cleanup();
            } catch (error) {
                // Ignore clean up error in test
            }
        }

        jest.resetAllMocks();
        jest.clearAllMocks();
    });

    describe('initializeCall', () => {
        const callIssuer = 'test-issuer';
        const usersToCallId = ['user1', 'user2'];

        beforeEach(() => {
            // Specific reset for this test group
            mockCallProcess.createCall.mockResolvedValue('test-call-id');
        });

        it('should initialize a call successfully', async () => {
            const result = await service.initializeCall(callIssuer, usersToCallId);

            expect(result).toBe('test-call-id');
            expect(mockCallValidators.validateParticipantId).toHaveBeenCalledWith(callIssuer);
            expect(mockCallValidators.validateUsersArray).toHaveBeenCalledWith(usersToCallId);
            expect(mockCallProcess.createCall).toHaveBeenCalledWith(callIssuer, usersToCallId);
            expect(mockLogger.info).toHaveBeenCalledWith('Initializing call', expect.any(Object));
            expect(mockLogger.info).toHaveBeenCalledWith('Call initialized successfully', expect.any(Object));
        });

        it('should handle validation errors', async () => {
            const validationError = new Error('Invalid participant ID');
            mockCallValidators.validateParticipantId.mockImplementationOnce(() => {
                throw validationError;
            });

            await expect(service.initializeCall(callIssuer, usersToCallId))
                .rejects.toThrow(validationError);

            expect(mockLogger.error).toHaveBeenCalledWith(
                'Failed to initialize call',
                validationError,
                expect.any(Object)
            );
        });

        it('should handle call creation errors', async () => {
            const createError = new Error('Failed to create call');
            mockCallProcess.createCall.mockRejectedValueOnce(createError);

            await expect(service.initializeCall(callIssuer, usersToCallId))
                .rejects.toThrow(createError);

            expect(mockLogger.error).toHaveBeenCalledWith(
                'Failed to initialize call',
                createError,
                expect.any(Object)
            );
        });

        it('should validate empty users array', async () => {
            await service.initializeCall(callIssuer, []);

            expect(mockCallValidators.validateUsersArray).toHaveBeenCalledWith([]);
            expect(mockCallProcess.createCall).toHaveBeenCalledWith(callIssuer, []);
        });
    });

    describe('launchCall', () => {
        const callParam: CallParam = {
            usersToCallId: ['user1', 'user2'],
            callIssuerId: 'caller',
            localVideoSelector: 'local-video',
            idContentForCall: 'video-container'
        };
        const callId = 'test-call-id';

        beforeEach(() => {
            // Reset specific mocks for launchCall
            mockMediaService.getUserMedia.mockResolvedValue(mockStream);
            mockWebRTCService.createConnection.mockResolvedValue(mockConnection);
        });

        it('should launch a call successfully', async () => {
            await service.launchCall(callParam, callId);

            expect(mockCallValidators.validateCallParam).toHaveBeenCalledWith(callParam);
            expect(mockCallValidators.validateCallId).toHaveBeenCalledWith(callId);
            expect(mockMediaService.getUserMedia).toHaveBeenCalled();
            expect(mockVideoUIService.attachStream).toHaveBeenCalledWith(
                callParam.localVideoSelector,
                mockStream
            );
            expect(mockLogger.info).toHaveBeenCalledWith('Launching call', expect.any(Object));
            expect(mockLogger.info).toHaveBeenCalledWith('Call launched successfully', expect.any(Object));
        });

        it('should handle parameter validation errors', async () => {
            const validationError = new Error('Invalid call parameters');
            mockCallValidators.validateCallParam.mockImplementationOnce(() => {
                throw validationError;
            });

            await expect(service.launchCall(callParam, callId))
                .rejects.toThrow(validationError);

            expect(mockLogger.error).toHaveBeenCalledWith(
                'Failed to launch call',
                validationError,
                expect.any(Object)
            );
        });

        it('should handle local stream retrieval errors', async () => {
            const mediaError = new Error('Failed to get user media');
            mockMediaService.getUserMedia.mockRejectedValueOnce(mediaError);

            await expect(service.launchCall(callParam, callId))
                .rejects.toThrow(mediaError);

            expect(mockLogger.error).toHaveBeenCalledWith(
                'Failed to launch call',
                mediaError,
                expect.any(Object)
            );
        });

        it('should process participants even if some fail', async () => {
            const connectionError = new Error('Connection failed');
            mockWebRTCService.createConnection
                .mockResolvedValueOnce(mockConnection)
                .mockRejectedValueOnce(connectionError);

            // Should not throw global error
            await service.launchCall(callParam, callId);

            expect(mockWebRTCService.createConnection).toHaveBeenCalledTimes(2);
            expect(mockLogger.info).toHaveBeenCalledWith('Call launched successfully', expect.any(Object));
        });

        it('should handle call with no participants', async () => {
            const emptyCallParam = { ...callParam, usersToCallId: [] };

            await service.launchCall(emptyCallParam, callId);

            expect(mockLogger.info).toHaveBeenCalledWith('Call launched successfully', expect.any(Object));
        });
    });

    describe('takeCall', () => {
        const participantId = 'participant-123';
        const callId = 'call-456';
        const localVideoSelector = 'local-video';
        const idContentForCallSelector = 'video-container';

        beforeEach(() => {
            mockMediaService.getUserMedia.mockResolvedValue(mockStream);
        });

        it('should accept a call successfully', async () => {
            await service.takeCall(participantId, callId, localVideoSelector, idContentForCallSelector);

            expect(mockCallValidators.validateParticipantId).toHaveBeenCalledWith(participantId);
            expect(mockCallValidators.validateCallId).toHaveBeenCalledWith(callId);
            expect(mockMediaService.getUserMedia).toHaveBeenCalled();
            expect(mockVideoUIService.attachStream).toHaveBeenCalledWith(
                localVideoSelector,
                mockStream
            );
            expect(mockCallProcess.listenForLockRelease).toHaveBeenCalledWith(
                callId,
                participantId,
                expect.any(Function)
            );
            expect(mockLogger.info).toHaveBeenCalledWith('Taking call', expect.any(Object));
        });

        it('should handle participant validation errors', async () => {
            const validationError = new Error('Invalid participant ID');
            mockCallValidators.validateParticipantId.mockImplementationOnce(() => {
                throw validationError;
            });

            await expect(service.takeCall(participantId, callId, localVideoSelector, idContentForCallSelector))
                .rejects.toThrow(validationError);

            expect(mockLogger.error).toHaveBeenCalledWith(
                'Failed to take call',
                validationError,
                expect.any(Object)
            );
        });

        it('should handle call ID validation errors', async () => {
            const validationError = new Error('Invalid call ID');
            mockCallValidators.validateCallId.mockImplementationOnce(() => {
                throw validationError;
            });

            await expect(service.takeCall(participantId, callId, localVideoSelector, idContentForCallSelector))
                .rejects.toThrow(validationError);

            expect(mockLogger.error).toHaveBeenCalledWith(
                'Failed to take call',
                validationError,
                expect.any(Object)
            );
        });

        it('should handle local video setup errors', async () => {
            const mediaError = new Error('Media access denied');
            mockMediaService.getUserMedia.mockRejectedValueOnce(mediaError);

            await expect(service.takeCall(participantId, callId, localVideoSelector, idContentForCallSelector))
                .rejects.toThrow(mediaError);

            expect(mockLogger.error).toHaveBeenCalledWith(
                'Failed to take call',
                mediaError,
                expect.any(Object)
            );
        });
    });

    describe('trackCall', () => {
        const userId = 'user-123';

        beforeEach(() => {
            mockCallProcess.onNewCall.mockResolvedValue('incoming-call-id');
        });

        it('should track calls successfully', async () => {
            const result = await service.trackCall(userId);

            expect(result).toBe('incoming-call-id');
            expect(mockCallValidators.validateParticipantId).toHaveBeenCalledWith(userId);
            expect(mockCallProcess.onNewCall).toHaveBeenCalledWith(userId);
            expect(mockLogger.info).toHaveBeenCalledWith('Tracking calls for user', expect.any(Object));
        });

        it('should handle validation errors', async () => {
            const validationError = new Error('Invalid user ID');
            mockCallValidators.validateParticipantId.mockImplementationOnce(() => {
                throw validationError;
            });

            await expect(service.trackCall(userId))
                .rejects.toThrow(validationError);

            expect(mockLogger.error).toHaveBeenCalledWith(
                'Failed to track calls',
                validationError,
                expect.any(Object)
            );
        });

        it('should handle tracking errors', async () => {
            const trackError = new Error('Failed to track calls');
            mockCallProcess.onNewCall.mockRejectedValueOnce(trackError);

            await expect(service.trackCall(userId))
                .rejects.toThrow(trackError);

            expect(mockLogger.error).toHaveBeenCalledWith(
                'Failed to track calls',
                trackError,
                expect.any(Object)
            );
        });
    });

    describe('releaseCall', () => {
        const callId = 'call-123';
        const userId = 'user-456';

        beforeEach(() => {
            mockCallProcess.releaseCall.mockResolvedValue(undefined);

            // Mock state machine to allow all transitions
            jest.spyOn((service as any).stateMachine, 'transition').mockImplementation(() => {
                // Do nothing, allowing all transitions
            });

        });

        it('should release a call successfully', async () => {
            await service.releaseCall(callId, userId);

            expect(mockCallValidators.validateCallId).toHaveBeenCalledWith(callId);
            expect(mockCallValidators.validateParticipantId).toHaveBeenCalledWith(userId);
            expect(mockCallProcess.releaseCall).toHaveBeenCalledWith(callId, userId);
            expect(mockLogger.info).toHaveBeenCalledWith('Releasing call', expect.any(Object));
            expect(mockLogger.info).toHaveBeenCalledWith('Call released successfully', expect.any(Object));
        });

        it('should handle call ID validation errors', async () => {
            const validationError = new Error('Invalid call ID');
            mockCallValidators.validateCallId.mockImplementationOnce(() => {
                throw validationError;
            });

            await expect(service.releaseCall(callId, userId))
                .rejects.toThrow(validationError);

            expect(mockLogger.error).toHaveBeenCalledWith(
                'Failed to release call',
                validationError,
                expect.any(Object)
            );
        });

        it('should handle user validation errors', async () => {
            const validationError = new Error('Invalid user ID');
            mockCallValidators.validateParticipantId.mockImplementationOnce(() => {
                throw validationError;
            });

            await expect(service.releaseCall(callId, userId))
                .rejects.toThrow(validationError);

            expect(mockLogger.error).toHaveBeenCalledWith(
                'Failed to release call',
                validationError,
                expect.any(Object)
            );
        });

        it('should handle call release errors', async () => {
            const releaseError = new Error('Failed to release call');
            mockCallProcess.releaseCall.mockRejectedValueOnce(releaseError);

            await expect(service.releaseCall(callId, userId))
                .rejects.toThrow(releaseError);

            expect(mockLogger.error).toHaveBeenCalledWith(
                'Failed to release call',
                releaseError,
                expect.any(Object)
            );
        });
    });

    describe('rejectCall', () => {
        const userId = 'user-123';

        beforeEach(() => {
            mockCallProcess.rejectCall.mockResolvedValue(undefined);
        });

        it('should reject a call successfully', async () => {
            await service.rejectCall(userId);

            expect(mockCallValidators.validateParticipantId).toHaveBeenCalledWith(userId);
            expect(mockCallProcess.rejectCall).toHaveBeenCalledWith(userId);
            expect(mockLogger.info).toHaveBeenCalledWith('Call rejected successfully', expect.any(Object));
        });

        it('should handle validation errors', async () => {
            const validationError = new Error('Invalid user ID');
            mockCallValidators.validateParticipantId.mockImplementationOnce(() => {
                throw validationError;
            });

            await expect(service.rejectCall(userId))
                .rejects.toThrow(validationError);

            expect(mockLogger.error).toHaveBeenCalledWith(
                'Failed to reject call',
                validationError,
                expect.any(Object)
            );
        });

        it('should handle call rejection errors', async () => {
            const rejectError = new Error('Failed to reject call');
            mockCallProcess.rejectCall.mockRejectedValueOnce(rejectError);

            await expect(service.rejectCall(userId))
                .rejects.toThrow(rejectError);

            expect(mockLogger.error).toHaveBeenCalledWith(
                'Failed to reject call',
                rejectError,
                expect.any(Object)
            );
        });
    });

    describe('handleLeaveCall', () => {
        const callId = 'call-123';

        beforeEach(() => {
            mockCallProcess.onLeaveCall.mockReturnValue(of('user-left'));
        });

        it('should set up call leave listener successfully', () => {
            const result = service.handleLeaveCall(callId);

            expect(mockCallValidators.validateCallId).toHaveBeenCalledWith(callId);
            expect(mockCallProcess.onLeaveCall).toHaveBeenCalledWith(callId);
            expect(mockLogger.info).toHaveBeenCalledWith('Setting up leave call handler', expect.any(Object));
            expect(result).toBeDefined();
        });

        it('should handle validation errors', () => {
            const validationError = new Error('Invalid call ID');
            mockCallValidators.validateCallId.mockImplementationOnce(() => {
                throw validationError;
            });

            expect(() => service.handleLeaveCall(callId))
                .toThrow(validationError);
        });

        it('should return an Observable', () => {
            const mockObservable = of('user-left');
            mockCallProcess.onLeaveCall.mockReturnValue(mockObservable);

            const result = service.handleLeaveCall(callId);

            expect(result).toBe(mockObservable);
        });

        it('should handle Observable errors', () => {
            const errorObservable = throwError(() => new Error('Observable error'));
            mockCallProcess.onLeaveCall.mockReturnValue(errorObservable);

            const result = service.handleLeaveCall(callId);

            expect(result).toBe(errorObservable);
        });
    });

    describe('removeParticipantVideo', () => {
        const userId = 'user-123';

        it('should remove participant video successfully', () => {
            service.removeParticipantVideo(userId);

            expect(mockCallValidators.validateParticipantId).toHaveBeenCalledWith(userId);
            expect(mockVideoUIService.removeVideo).toHaveBeenCalledWith(`remote${userId}`);
            expect(mockLogger.info).toHaveBeenCalledWith('Removing participant video', expect.any(Object));
        });

        it('should handle validation errors', () => {
            const validationError = new Error('Invalid user ID');
            mockCallValidators.validateParticipantId.mockImplementationOnce(() => {
                throw validationError;
            });

            // Should not throw error as it's handled internally
            expect(() => service.removeParticipantVideo(userId))
                .not.toThrow();

            expect(mockLogger.error).toHaveBeenCalledWith(
                'Failed to remove participant video',
                validationError,
                expect.any(Object)
            );
        });

        it('should handle video removal errors', () => {
            const removeError = new Error('Failed to remove video');
            mockVideoUIService.removeVideo.mockImplementationOnce(() => {
                throw removeError;
            });

            // Should not throw error as it's handled internally
            expect(() => service.removeParticipantVideo(userId))
                .not.toThrow();

            expect(mockLogger.error).toHaveBeenCalledWith(
                'Failed to remove participant video',
                removeError,
                expect.any(Object)
            );
        });

        it('should remove multiple participants', () => {
            const users = ['user1', 'user2', 'user3'];

            users.forEach(user => service.removeParticipantVideo(user));

            users.forEach(user => {
                expect(mockVideoUIService.removeVideo).toHaveBeenCalledWith(`remote${user}`);
            });
        });
    });

    describe('cleanup', () => {
        it('should clean up all resources successfully', async () => {
            await service.cleanup();

            expect(mockMediaService.cleanup).toHaveBeenCalled();
            expect(mockVideoUIService.cleanup).toHaveBeenCalled();
            expect(mockWebRTCService.cleanup).toHaveBeenCalled();
            expect(mockLogger.info).toHaveBeenCalledWith('Cleaning up call process service');
        });

        it('should handle service cleanup errors', async () => {
            const cleanupError = new Error('Cleanup failed');
            mockMediaService.cleanup.mockImplementationOnce(() => {
                throw cleanupError;
            });

            // Cleanup should continue even if a service fails
            await expect(service.cleanup()).resolves.toBeUndefined();
        });

        it('should be able to be called multiple times without error', async () => {
            await service.cleanup();
            await service.cleanup();

            expect(mockMediaService.cleanup).toHaveBeenCalledTimes(2);
            expect(mockVideoUIService.cleanup).toHaveBeenCalledTimes(2);
            expect(mockWebRTCService.cleanup).toHaveBeenCalledTimes(2);
        });
    });

    describe('State machine state management', () => {
        it('should transition to INITIALIZING state during initializeCall', async () => {
            const stateMachineSpy = jest.spyOn((service as any).stateMachine, 'transition');

            await service.initializeCall('caller', ['user1']);

            expect(stateMachineSpy).toHaveBeenCalledWith(
                CallState.INITIALIZING,
                { participantCount: 1 }
            );

            stateMachineSpy.mockRestore();
        });

        it('should transition to ERROR state on error', async () => {
            const stateMachineSpy = jest.spyOn((service as any).stateMachine, 'transition');
            const error = new Error('Test error');
            mockCallProcess.createCall.mockRejectedValueOnce(error);

            await expect(service.initializeCall('caller', ['user1']))
                .rejects.toThrow(error);

            expect(stateMachineSpy).toHaveBeenCalledWith(
                CallState.ERROR,
                { error: error.message }
            );

            stateMachineSpy.mockRestore();
        });

        it('should transition to CONNECTING state during launchCall', async () => {
            const stateMachineSpy = jest.spyOn((service as any).stateMachine, 'transition');
            const callParam: CallParam = {
                usersToCallId: ['user1'],
                callIssuerId: 'caller',
                localVideoSelector: 'video',
                idContentForCall: 'container'
            };

            await service.launchCall(callParam, 'call-id');

            expect(stateMachineSpy).toHaveBeenCalledWith(
                CallState.CONNECTING,
                { callId: 'call-id' }
            );

            stateMachineSpy.mockRestore();
        });

        it('should transition to DISCONNECTING state during releaseCall', async () => {
            (service as any).stateMachine.state = CallState.CONNECTED;

            const stateMachineSpy = jest.spyOn((service as any).stateMachine, 'transition');

            service.releaseCall('call-id', 'user-id');

            expect(stateMachineSpy).toHaveBeenCalledWith(
                CallState.DISCONNECTING,
                { callId: 'call-id' }
            );

            stateMachineSpy.mockRestore();
        });
    });

    describe('Integration and complex use cases', () => {
        it('should handle complete call workflow', async () => {
            // 1. Initialize call
            const callId = await service.initializeCall('caller', ['user1', 'user2']);

            // 2. Launch call
            const callParam: CallParam = {
                usersToCallId: ['user1', 'user2'],
                callIssuerId: 'caller',
                localVideoSelector: 'video',
                idContentForCall: 'container'
            };
            await service.launchCall(callParam, callId);

            // 3. Handle leaves
            const leaveObservable = service.handleLeaveCall(callId);
            expect(leaveObservable).toBeDefined();

            // 4. Remove participant
            service.removeParticipantVideo('user1');

            // 5. Release call
            await service.releaseCall(callId, 'caller');

            // 6. Cleanup
            await service.cleanup();

            // Verify all steps were logged
            expect(mockLogger.info).toHaveBeenCalled();
        });

        it('should handle simultaneous incoming calls', async () => {
            // Configure different responses for each call
            mockCallProcess.onNewCall
                .mockResolvedValueOnce('incoming-call-1')
                .mockResolvedValueOnce('incoming-call-2')
                .mockResolvedValueOnce('incoming-call-3');

            const trackPromises = ['user1', 'user2', 'user3'].map(userId =>
                service.trackCall(userId)
            );

            const results = await Promise.all(trackPromises);

            expect(results).toEqual(['incoming-call-1', 'incoming-call-2', 'incoming-call-3']);
            expect(mockCallProcess.onNewCall).toHaveBeenCalledTimes(3);
        });

        it('should maintain consistent state after partial errors', async () => {
            const callParam: CallParam = {
                usersToCallId: ['user1', 'user2'],
                callIssuerId: 'caller',
                localVideoSelector: 'video',
                idContentForCall: 'container'
            };

            // Simulate error for one participant only
            mockWebRTCService.createConnection
                .mockResolvedValueOnce(mockConnection)
                .mockRejectedValueOnce(new Error('Connection failed'));

            // Call should still succeed globally
            await expect(service.launchCall(callParam, 'call-id'))
                .resolves.toBeUndefined();

            expect(mockWebRTCService.createConnection).toHaveBeenCalledTimes(2);
        });
    });
});

