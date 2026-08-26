import { EnvironmentProviders, InjectionToken, makeEnvironmentProviders } from '@angular/core';

import {
    CallProcessSignaling,
    ConfigService,
    MediaService,
    WebRTCService,
    mergeCallConfig,
    type CallConfig,
    type IMediaService,
    type IWebRTCService,
} from 'easy-call-js';

import { CallProcessAngular } from './call-process-angular.service';

/** DI token for the signaling adapter used by {@link CallProcessAngular}. */
export const SIGNALING_TOKEN = new InjectionToken<CallProcessSignaling>('easy-call.signaling');
/** DI token for the media adapter used by {@link CallProcessAngular}. */
export const MEDIA_TOKEN = new InjectionToken<IMediaService>('easy-call.media');
/** DI token for the WebRTC adapter used by {@link CallProcessAngular}. */
export const WEBRTC_TOKEN = new InjectionToken<IWebRTCService>('easy-call.webrtc');

/**
 * Providers accepted by {@link provideEasyCall}. Only {@code signaling} is
 * mandatory; the media/webrtc adapters default to the bundled browser-based
 * implementations, and {@code config} is deep-merged onto the library defaults.
 */
export interface EasyCallProviders {
    signaling: CallProcessSignaling;
    media?: IMediaService;
    webrtc?: IWebRTCService;
    config?: Partial<CallConfig>;
}

/**
 * Registers {@link CallProcessAngular} and its dependencies in the Angular
 * dependency-injection tree. Call once during application bootstrap:
 *
 * ```ts
 * bootstrapApplication(AppComponent, {
 *   providers: [
 *     provideEasyCall({ signaling: new FirebaseCallProcess(...) }),
 *   ],
 * });
 * ```
 */
export function provideEasyCall(providers: EasyCallProviders): EnvironmentProviders {
    const finalConfig = mergeCallConfig(
        ConfigService.getInstance().getDefaultConfig(),
        providers.config,
    );

    return makeEnvironmentProviders([
        { provide: SIGNALING_TOKEN, useValue: providers.signaling },
        {
            provide: MEDIA_TOKEN,
            useFactory: () => providers.media ?? new MediaService(finalConfig.media),
        },
        {
            provide: WEBRTC_TOKEN,
            useFactory: () => providers.webrtc ?? new WebRTCService(finalConfig.rtc, finalConfig.timeouts),
        },
        CallProcessAngular,
    ]);
}
