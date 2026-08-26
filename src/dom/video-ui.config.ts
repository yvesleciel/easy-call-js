/**
 * Cosmetic HTMLVideoElement settings applied by {@link DomVideoBinder}
 * to every video element it creates or manages.
 */
export interface UIConfig {
    /** Width, in CSS pixels, applied to managed {@code <video>} elements. */
    videoWidth: number;
    /** Height, in CSS pixels, applied to managed {@code <video>} elements. */
    videoHeight: number;
    /** Whether the video plays automatically once its {@code srcObject} is set. */
    autoplay: boolean;
    /** Whether default video controls are shown. */
    controls: boolean;
    /** Whether the video plays inline on iOS instead of going fullscreen. */
    playsInline: boolean;
    /** Right margin applied to remote videos to space them out. */
    marginRight: string;
}

/** Default {@link UIConfig} used when the caller does not override individual fields. */
export const DEFAULT_UI_CONFIG: UIConfig = {
    videoWidth: 200,
    videoHeight: 200,
    autoplay: true,
    controls: false,
    playsInline: true,
    marginRight: '10px',
};
