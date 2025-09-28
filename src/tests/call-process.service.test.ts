
import { CallProcessService } from '../main/services/call-process.service';
import { ICallProcessService } from '../main/api/call-process';
import { CallProcess, RTCExchangeDataType } from '../main/feature/CallProcess';
import { IMediaService } from '../main/services/media.service';
import { IVideoUIService } from '../main/services/video-ui.service';
import { IWebRTCService } from '../main/services/webrtc.service';
import { CallParam, CallValidators } from '../main/validators/call-validators';
import { Logger } from '../main/utils/logger';
import { CallState } from '../main/state/call-state-machine';
import { Subject, of, throwError } from 'rxjs';

// Mock des modules avant leur utilisation
jest.mock('../main/utils/logger');
jest.mock('../main/validators/call-validators');

describe('CallProcessService', () => {
    let service: ICallProcessService;
    let mockStream: MediaStream;
    let mockConnection: RTCPeerConnection;

    // Déclaration des mocks qui seront recréés à chaque test
    let mockCallProcess: jest.Mocked<CallProcess>;
    let mockMediaService: jest.Mocked<IMediaService>;
    let mockVideoUIService: jest.Mocked<IVideoUIService>;
    let mockWebRTCService: jest.Mocked<IWebRTCService>;
    let mockLogger: any;
    let mockCallValidators: jest.Mocked<typeof CallValidators>;

    beforeEach(() => {
        // Créer des nouveaux mocks à chaque test pour une isolation complète
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
        } as unknown as jest.Mocked<CallProcess>;

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

        // Mock du Logger
        mockLogger = {
            info: jest.fn(),
            error: jest.fn(),
            debug: jest.fn(),
            warn: jest.fn()
        };
        (Logger.getInstance as jest.Mock).mockReturnValue(mockLogger);

        // Mock des validateurs
        mockCallValidators = {
            validateParticipantId: jest.fn(),
            validateUsersArray: jest.fn(),
            validateCallParam: jest.fn(),
            validateCallId: jest.fn()
        } as unknown as jest.Mocked<typeof CallValidators>;
        (CallValidators as jest.Mocked<typeof CallValidators>) = mockCallValidators;

        // Mock du MediaStream
        mockStream = {
            getTracks: jest.fn().mockReturnValue([]),
            getVideoTracks: jest.fn().mockReturnValue([]),
            getAudioTracks: jest.fn().mockReturnValue([])
        } as unknown as MediaStream;

        // Mock de RTCPeerConnection
        mockConnection = {
            addEventListener: jest.fn(),
            removeEventListener: jest.fn(),
            close: jest.fn()
        } as unknown as RTCPeerConnection;

        // Configuration par défaut des mocks
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

        // Créer une nouvelle instance du service pour chaque test
        service = new CallProcessService(
            mockCallProcess,
            mockMediaService,
            mockVideoUIService,
            mockWebRTCService
        );
    });

    // Nettoyer après chaque test
    afterEach(async () => {
        // Nettoyer le service si il a une méthode cleanup
        if (service && typeof service.cleanup === 'function') {
            try {
                await service.cleanup();
            } catch (error) {
                // Ignorer les erreurs de cleanup en test
            }
        }

        // Reset complet de tous les mocks
        jest.resetAllMocks();
        jest.clearAllMocks();
    });

    describe('initializeCall', () => {
        const callIssuer = 'test-issuer';
        const usersToCallId = ['user1', 'user2'];

        beforeEach(() => {
            // Reset spécifique pour ce groupe de tests
            mockCallProcess.createCall.mockResolvedValue('test-call-id');
        });

        it('devrait initialiser un appel avec succès', async () => {
            const result = await service.initializeCall(callIssuer, usersToCallId);

            expect(result).toBe('test-call-id');
            expect(mockCallValidators.validateParticipantId).toHaveBeenCalledWith(callIssuer);
            expect(mockCallValidators.validateUsersArray).toHaveBeenCalledWith(usersToCallId);
            expect(mockCallProcess.createCall).toHaveBeenCalledWith(callIssuer, usersToCallId);
            expect(mockLogger.info).toHaveBeenCalledWith('Initializing call', expect.any(Object));
            expect(mockLogger.info).toHaveBeenCalledWith('Call initialized successfully', expect.any(Object));
        });

        it('devrait gérer les erreurs de validation', async () => {
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

        it('devrait gérer les erreurs de création d\'appel', async () => {
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

        it('devrait valider un tableau d\'utilisateurs vide', async () => {
            await service.initializeCall(callIssuer, []);

            expect(mockCallValidators.validateUsersArray).toHaveBeenCalledWith([]);
            expect(mockCallProcess.createCall).toHaveBeenCalledWith(callIssuer, []);
        });
    });

    describe('launchCall', () => {
        const callParam: CallParam = {
            usersToCallId: ['user1', 'user2'],
            callIssuerId: 'caller',
            videoSelector: 'local-video',
            idContentForCall: 'video-container'
        };
        const callId = 'test-call-id';

        beforeEach(() => {
            // Reset des mocks spécifiques pour launchCall
            mockMediaService.getUserMedia.mockResolvedValue(mockStream);
            mockWebRTCService.createConnection.mockResolvedValue(mockConnection);
        });

        it('devrait lancer un appel avec succès', async () => {
            await service.launchCall(callParam, callId);

            expect(mockCallValidators.validateCallParam).toHaveBeenCalledWith(callParam);
            expect(mockCallValidators.validateCallId).toHaveBeenCalledWith(callId);
            expect(mockMediaService.getUserMedia).toHaveBeenCalled();
            expect(mockVideoUIService.attachStream).toHaveBeenCalledWith(
                callParam.videoSelector,
                mockStream
            );
            expect(mockLogger.info).toHaveBeenCalledWith('Launching call', expect.any(Object));
            expect(mockLogger.info).toHaveBeenCalledWith('Call launched successfully', expect.any(Object));
        });

        it('devrait gérer les erreurs de validation des paramètres', async () => {
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

        it('devrait gérer les erreurs de récupération du stream local', async () => {
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

        it('devrait traiter les participants même si certains échouent', async () => {
            const connectionError = new Error('Connection failed');
            mockWebRTCService.createConnection
                .mockResolvedValueOnce(mockConnection)
                .mockRejectedValueOnce(connectionError);

            // Ne devrait pas lever d'erreur globale
            await service.launchCall(callParam, callId);

            expect(mockWebRTCService.createConnection).toHaveBeenCalledTimes(2);
            expect(mockLogger.info).toHaveBeenCalledWith('Call launched successfully', expect.any(Object));
        });

        it('devrait gérer un appel sans participants', async () => {
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

        it('devrait accepter un appel avec succès', async () => {
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

        it('devrait gérer les erreurs de validation du participant', async () => {
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

        it('devrait gérer les erreurs de validation de l\'ID d\'appel', async () => {
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

        it('devrait gérer les erreurs de configuration vidéo locale', async () => {
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

        it('devrait surveiller les appels avec succès', async () => {
            const result = await service.trackCall(userId);

            expect(result).toBe('incoming-call-id');
            expect(mockCallValidators.validateParticipantId).toHaveBeenCalledWith(userId);
            expect(mockCallProcess.onNewCall).toHaveBeenCalledWith(userId);
            expect(mockLogger.info).toHaveBeenCalledWith('Tracking calls for user', expect.any(Object));
        });

        it('devrait gérer les erreurs de validation', async () => {
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

        it('devrait gérer les erreurs de surveillance', async () => {
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

            // Mock de la machine d'état pour permettre toutes les transitions
            jest.spyOn((service as any).stateMachine, 'transition').mockImplementation(() => {
                // Ne fait rien, permettant ainsi toutes les transitions
            });

        });

        it('devrait libérer un appel avec succès', async () => {
            await service.releaseCall(callId, userId);

            expect(mockCallValidators.validateCallId).toHaveBeenCalledWith(callId);
            expect(mockCallValidators.validateParticipantId).toHaveBeenCalledWith(userId);
            expect(mockCallProcess.releaseCall).toHaveBeenCalledWith(callId, userId);
            expect(mockLogger.info).toHaveBeenCalledWith('Releasing call', expect.any(Object));
            expect(mockLogger.info).toHaveBeenCalledWith('Call released successfully', expect.any(Object));
        });

        it('devrait gérer les erreurs de validation de l\'ID d\'appel', async () => {
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

        it('devrait gérer les erreurs de validation de l\'utilisateur', async () => {
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

        it('devrait gérer les erreurs de libération d\'appel', async () => {
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

        it('devrait rejeter un appel avec succès', async () => {
            await service.rejectCall(userId);

            expect(mockCallValidators.validateParticipantId).toHaveBeenCalledWith(userId);
            expect(mockCallProcess.rejectCall).toHaveBeenCalledWith(userId);
            expect(mockLogger.info).toHaveBeenCalledWith('Call rejected successfully', expect.any(Object));
        });

        it('devrait gérer les erreurs de validation', async () => {
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

        it('devrait gérer les erreurs de rejet d\'appel', async () => {
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

        it('devrait configurer l\'écoute des départs d\'appel avec succès', () => {
            const result = service.handleLeaveCall(callId);

            expect(mockCallValidators.validateCallId).toHaveBeenCalledWith(callId);
            expect(mockCallProcess.onLeaveCall).toHaveBeenCalledWith(callId);
            expect(mockLogger.info).toHaveBeenCalledWith('Setting up leave call handler', expect.any(Object));
            expect(result).toBeDefined();
        });

        it('devrait gérer les erreurs de validation', () => {
            const validationError = new Error('Invalid call ID');
            mockCallValidators.validateCallId.mockImplementationOnce(() => {
                throw validationError;
            });

            expect(() => service.handleLeaveCall(callId))
                .toThrow(validationError);
        });

        it('devrait retourner un Observable', () => {
            const mockObservable = of('user-left');
            mockCallProcess.onLeaveCall.mockReturnValue(mockObservable);

            const result = service.handleLeaveCall(callId);

            expect(result).toBe(mockObservable);
        });

        it('devrait gérer les erreurs d\'Observable', () => {
            const errorObservable = throwError(() => new Error('Observable error'));
            mockCallProcess.onLeaveCall.mockReturnValue(errorObservable);

            const result = service.handleLeaveCall(callId);

            expect(result).toBe(errorObservable);
        });
    });

    describe('removeParticipantVideo', () => {
        const userId = 'user-123';

        it('devrait supprimer la vidéo d\'un participant avec succès', () => {
            service.removeParticipantVideo(userId);

            expect(mockCallValidators.validateParticipantId).toHaveBeenCalledWith(userId);
            expect(mockVideoUIService.removeVideo).toHaveBeenCalledWith(`remote${userId}`);
            expect(mockLogger.info).toHaveBeenCalledWith('Removing participant video', expect.any(Object));
        });

        it('devrait gérer les erreurs de validation', () => {
            const validationError = new Error('Invalid user ID');
            mockCallValidators.validateParticipantId.mockImplementationOnce(() => {
                throw validationError;
            });

            // Ne devrait pas lever d'erreur car elle est gérée en interne
            expect(() => service.removeParticipantVideo(userId))
                .not.toThrow();

            expect(mockLogger.error).toHaveBeenCalledWith(
                'Failed to remove participant video',
                validationError,
                expect.any(Object)
            );
        });

        it('devrait gérer les erreurs de suppression vidéo', () => {
            const removeError = new Error('Failed to remove video');
            mockVideoUIService.removeVideo.mockImplementationOnce(() => {
                throw removeError;
            });

            // Ne devrait pas lever d'erreur car elle est gérée en interne
            expect(() => service.removeParticipantVideo(userId))
                .not.toThrow();

            expect(mockLogger.error).toHaveBeenCalledWith(
                'Failed to remove participant video',
                removeError,
                expect.any(Object)
            );
        });

        it('devrait supprimer plusieurs participants', () => {
            const users = ['user1', 'user2', 'user3'];

            users.forEach(user => service.removeParticipantVideo(user));

            users.forEach(user => {
                expect(mockVideoUIService.removeVideo).toHaveBeenCalledWith(`remote${user}`);
            });
        });
    });

    describe('cleanup', () => {
        it('devrait nettoyer toutes les ressources avec succès', async () => {
            await service.cleanup();

            expect(mockMediaService.cleanup).toHaveBeenCalled();
            expect(mockVideoUIService.cleanup).toHaveBeenCalled();
            expect(mockWebRTCService.cleanup).toHaveBeenCalled();
            expect(mockLogger.info).toHaveBeenCalledWith('Cleaning up call process service');
        });

        it('devrait gérer les erreurs de nettoyage des services', async () => {
            const cleanupError = new Error('Cleanup failed');
            mockMediaService.cleanup.mockImplementationOnce(() => {
                throw cleanupError;
            });

            // Le cleanup devrait continuer même si un service échoue
            await expect(service.cleanup()).resolves.toBeUndefined();
        });

        it('devrait pouvoir être appelé plusieurs fois sans erreur', async () => {
            await service.cleanup();
            await service.cleanup();

            expect(mockMediaService.cleanup).toHaveBeenCalledTimes(2);
            expect(mockVideoUIService.cleanup).toHaveBeenCalledTimes(2);
            expect(mockWebRTCService.cleanup).toHaveBeenCalledTimes(2);
        });
    });

    describe('Gestion des états de la machine d\'état', () => {
        it('devrait transitionner vers l\'état INITIALIZING lors de initializeCall', async () => {
            const stateMachineSpy = jest.spyOn((service as any).stateMachine, 'transition');

            await service.initializeCall('caller', ['user1']);

            expect(stateMachineSpy).toHaveBeenCalledWith(
                CallState.INITIALIZING,
                { participantCount: 1 }
            );

            stateMachineSpy.mockRestore();
        });

        it('devrait transitionner vers l\'état ERROR en cas d\'erreur', async () => {
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

        it('devrait transitionner vers l\'état CONNECTING lors de launchCall', async () => {
            const stateMachineSpy = jest.spyOn((service as any).stateMachine, 'transition');
            const callParam: CallParam = {
                usersToCallId: ['user1'],
                callIssuerId: 'caller',
                videoSelector: 'video',
                idContentForCall: 'container'
            };

            await service.launchCall(callParam, 'call-id');

            expect(stateMachineSpy).toHaveBeenCalledWith(
                CallState.CONNECTING,
                { callId: 'call-id' }
            );

            stateMachineSpy.mockRestore();
        });

        it('devrait transitionner vers l\'état DISCONNECTING lors de releaseCall', async () => {
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

    describe('Intégration et cas d\'usage complexes', () => {
        it('devrait gérer un workflow complet d\'appel', async () => {
            // 1. Initialiser un appel
            const callId = await service.initializeCall('caller', ['user1', 'user2']);

            // 2. Lancer l\'appel
            const callParam: CallParam = {
                usersToCallId: ['user1', 'user2'],
                callIssuerId: 'caller',
                videoSelector: 'video',
                idContentForCall: 'container'
            };
            await service.launchCall(callParam, callId);

            // 3. Gérer les départs
            const leaveObservable = service.handleLeaveCall(callId);
            expect(leaveObservable).toBeDefined();

            // 4. Supprimer un participant
            service.removeParticipantVideo('user1');

            // 5. Libérer l\'appel
            await service.releaseCall(callId, 'caller');

            // 6. Nettoyer
            await service.cleanup();

            // Vérifier que toutes les étapes ont été loggées
            expect(mockLogger.info).toHaveBeenCalled();
        });

        it('devrait gérer les appels entrants simultanément', async () => {
            // Configurer des réponses différentes pour chaque appel
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

        it('devrait maintenir l\'état cohérent après des erreurs partielles', async () => {
            const callParam: CallParam = {
                usersToCallId: ['user1', 'user2'],
                callIssuerId: 'caller',
                videoSelector: 'video',
                idContentForCall: 'container'
            };

            // Simuler une erreur pour un participant seulement
            mockWebRTCService.createConnection
                .mockResolvedValueOnce(mockConnection)
                .mockRejectedValueOnce(new Error('Connection failed'));

            // L'appel devrait quand même réussir globalement
            await expect(service.launchCall(callParam, 'call-id'))
                .resolves.toBeUndefined();

            expect(mockWebRTCService.createConnection).toHaveBeenCalledTimes(2);
        });
    });
});