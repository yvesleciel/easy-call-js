import { CallConfig, mergeCallConfig } from '../core/call/app-config/call-config';

const DEFAULTS: CallConfig = {
    rtc: {
        iceServers: [{ urls: 'stun:default.example' }],
        iceCandidatePoolSize: 10,
        bundlePolicy: 'balanced',
    },
    media: {
        video: { width: { ideal: 1280 } },
        audio: { echoCancellation: true },
    },
    timeouts: {
        connectionTimeout: 30000,
        iceGatheringTimeout: 10000,
        callSetupTimeout: 15000,
    },
};

describe('mergeCallConfig', () => {

    it('replaces iceServers when the caller provides its own STUN/TURN list', () => {
        const custom = [
            { urls: 'stun:my.stun.example' },
            { urls: 'turn:my.turn.example', username: 'u', credential: 'p' },
        ];

        const merged = mergeCallConfig(DEFAULTS, { rtc: { iceServers: custom } });

        expect(merged.rtc.iceServers).toEqual(custom);
    });

    it('preserves rtc defaults not touched by the override (iceCandidatePoolSize, bundlePolicy)', () => {
        const merged = mergeCallConfig(DEFAULTS, {
            rtc: { iceServers: [{ urls: 'turn:my.turn.example' }] },
        });

        expect(merged.rtc.iceCandidatePoolSize).toBe(10);
        expect(merged.rtc.bundlePolicy).toBe('balanced');
    });

    it('preserves the whole media and timeouts sections when only rtc is overridden', () => {
        const merged = mergeCallConfig(DEFAULTS, { rtc: { iceServers: [] } });

        expect(merged.media).toEqual(DEFAULTS.media);
        expect(merged.timeouts).toEqual(DEFAULTS.timeouts);
    });

    it('returns the defaults untouched when no override is given', () => {
        const merged = mergeCallConfig(DEFAULTS, undefined);

        expect(merged).toEqual(DEFAULTS);
    });
});
