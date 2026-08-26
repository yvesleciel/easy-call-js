import { Observable, Subscription } from 'rxjs';
import { CallEvent } from '../core/call/driving/call-events';
import { DEFAULT_UI_CONFIG, UIConfig } from './video-ui.config';

/**
 * Configuration required by {@link DomVideoBinder}.
 */
export interface DomVideoBinderConfig {
    /** {@code id} of the pre-existing {@code <video>} element hosting the local stream. */
    localVideoSelector: string;
    /** {@code id} of the container into which remote {@code <video>} elements are appended. */
    remoteContainerId: string;
    /** Optional overrides applied on top of {@link DEFAULT_UI_CONFIG}. */
    ui?: Partial<UIConfig>;
}

/**
 * Opt-in DOM adapter for `easy-call-js`. Subscribes to the core event stream
 * and paints one {@code <video>} element per participant.
 *
 * Usage:
 * ```ts
 * const binder = new DomVideoBinder({
 *   localVideoSelector: 'local-video',
 *   remoteContainerId: 'video-container',
 * });
 * binder.attach(service.events$);
 * // ... later
 * binder.detach();
 * ```
 *
 * The binder is stateless with respect to the call itself — it only reacts
 * to the events it receives.
 */
export class DomVideoBinder {
    private readonly ui: UIConfig;
    private readonly managed = new Map<string, HTMLVideoElement>();
    private subscription: Subscription | null = null;

    constructor(private readonly config: DomVideoBinderConfig) {
        this.ui = { ...DEFAULT_UI_CONFIG, ...(config.ui ?? {}) };
    }

    /**
     * Subscribes to the given event stream. Any previous subscription is
     * disposed first. Returns the underlying subscription for convenience.
     */
    attach(events$: Observable<CallEvent>): Subscription {
        this.detach();
        this.subscription = events$.subscribe(event => this.handle(event));
        return this.subscription;
    }

    /**
     * Unsubscribes from the event stream and removes every managed
     * {@code <video>} element from the DOM.
     */
    detach(): void {
        if (this.subscription) {
            this.subscription.unsubscribe();
            this.subscription = null;
        }
        for (const id of Array.from(this.managed.keys())) {
            this.removeManaged(id);
        }
    }

    private handle(event: CallEvent): void {
        switch (event.kind) {
            case 'LocalStreamReady':
                this.bindLocal(event.stream);
                return;
            case 'RemoteStreamAvailable':
                this.bindRemote(event.participantId, event.stream);
                return;
            case 'RemoteStreamLost':
            case 'ParticipantLeft':
                this.removeRemote(event.participantId);
                return;
            case 'LocalStreamStopped':
                this.unbindLocal();
                return;
            default:
                return;
        }
    }

    private bindLocal(stream: MediaStream): void {
        const video = this.resolveVideo(this.config.localVideoSelector);
        if (!video) {
            console.warn(
                `[easy-call-js/dom] local video element "${this.config.localVideoSelector}" is missing; stream not bound`
            );
            return;
        }
        this.applyUi(video);
        video.muted = true;
        video.srcObject = stream;
        this.managed.set(this.config.localVideoSelector, video);
    }

    private unbindLocal(): void {
        const video = this.managed.get(this.config.localVideoSelector);
        if (video) {
            video.srcObject = null;
        }
    }

    private bindRemote(participantId: string, stream: MediaStream): void {
        const remoteId = `remote${participantId}`;
        let video = this.managed.get(remoteId) ?? (document.getElementById(remoteId) as HTMLVideoElement | null);

        if (!video) {
            const container = document.getElementById(this.config.remoteContainerId);
            if (!container) {
                console.warn(
                    `[easy-call-js/dom] remote container "${this.config.remoteContainerId}" is missing; stream for ${participantId} not bound`
                );
                return;
            }
            video = document.createElement('video');
            video.id = remoteId;
            container.appendChild(video);
        }

        this.applyUi(video);
        video.srcObject = stream;
        this.managed.set(remoteId, video);
    }

    private removeRemote(participantId: string): void {
        const remoteId = `remote${participantId}`;
        this.removeManaged(remoteId);
    }

    private removeManaged(id: string): void {
        const video = this.managed.get(id);
        if (!video) return;

        if (video.srcObject) {
            const stream = video.srcObject as MediaStream;
            stream.getTracks().forEach(track => track.stop());
            video.srcObject = null;
        }
        video.remove();
        this.managed.delete(id);
    }

    private resolveVideo(id: string): HTMLVideoElement | null {
        return (
            this.managed.get(id) ??
            (document.getElementById(id) as HTMLVideoElement | null)
        );
    }

    private applyUi(video: HTMLVideoElement): void {
        video.autoplay = this.ui.autoplay;
        video.playsInline = this.ui.playsInline;
        video.controls = this.ui.controls;
        video.width = this.ui.videoWidth;
        video.height = this.ui.videoHeight;
        video.style.marginRight = this.ui.marginRight;
    }
}
