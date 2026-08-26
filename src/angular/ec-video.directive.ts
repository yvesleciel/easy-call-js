import { Directive, ElementRef, Input, OnChanges, OnDestroy } from '@angular/core';

/**
 * Angular directive that binds a {@link MediaStream} to a {@code <video>}
 * element declaratively:
 *
 * ```html
 * <video ecVideo [ecVideo]="stream" [ecMuted]="true"></video>
 * ```
 *
 * The directive assigns {@code srcObject} on every input change and clears
 * it on destruction to avoid keeping the stream referenced.
 */
@Directive({
    selector: 'video[ecVideo]',
    standalone: true,
})
export class EcVideoDirective implements OnChanges, OnDestroy {
    /** Stream to render. Set to {@code null} to detach without removing the element. */
    @Input({ required: true }) ecVideo: MediaStream | null = null;
    /** Mirrors {@link HTMLVideoElement.muted}. */
    @Input() ecMuted = false;
    /** Mirrors {@link HTMLVideoElement.autoplay}. */
    @Input() ecAutoplay = true;
    /** Mirrors {@link HTMLVideoElement.playsInline}. */
    @Input() ecPlaysInline = true;

    constructor(private readonly elementRef: ElementRef<HTMLVideoElement>) {}

    ngOnChanges(): void {
        const video = this.elementRef.nativeElement;
        video.srcObject = this.ecVideo;
        video.muted = this.ecMuted;
        video.autoplay = this.ecAutoplay;
        video.playsInline = this.ecPlaysInline;
    }

    ngOnDestroy(): void {
        this.elementRef.nativeElement.srcObject = null;
    }
}
