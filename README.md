# easy-call-js

**Peer-to-peer video calls for any JavaScript app — event-driven, framework-agnostic, fully typed.**

[![npm version](https://img.shields.io/npm/v/easy-call-js.svg)](https://www.npmjs.com/package/easy-call-js)
[![CI](https://github.com/yvesleciel/easy-call-js/actions/workflows/ci.yml/badge.svg)](https://github.com/yvesleciel/easy-call-js/actions/workflows/ci.yml)
[![license](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6.svg)](tsconfig.json)
[![Angular adapter](https://img.shields.io/badge/Angular-%3E%3D18%20first--class-dd0031.svg)](#angular--full-integration)

`easy-call-js` gives you `startCall`, `takeCall`, and an `events$` stream — and handles SDP/ICE negotiation, multiparty mesh, and resource cleanup for you. The core knows nothing about the DOM or your framework; bind it to React refs, plain `<video>` tags, or — with first-class support in v2 — a few lines of Angular DI.

```bash
npm install easy-call-js
```

🔴 **[Live demo](https://call-app-e29f1.web.app/)** · 💻 **[Demo source (Angular)](https://github.com/yvesleciel/test-easy-call-js)**

---

## Table of contents

[Why easy-call-js](#why-easy-call-js) · [Demo](#demo) · [Quick start](#quick-start) · [What's new in v2](#whats-new-in-v2)

**Understand**
[Core concepts](#core-concepts) · [How it works](#how-it-works) · [Event-driven API](#event-driven-api) · [Signaling](#signaling) · [STUN/TURN](#stunturn) · [Multiparty architecture](#multiparty-architecture)

**Use**
[Calls](#calls) · [Incoming calls](#incoming-calls) · [Errors](#errors) · [Configuration](#configuration) · [Examples](#examples)

**Reference**
[API reference](#api-reference) · [Events reference](#events-reference) · [Browser support](#browser-support) · [Limitations](#limitations) · [Security](#security) · [Migration](#migration) · [Contributing](#contributing) · [License](#license)

---

## Why easy-call-js

- **Framework-agnostic core, first-class Angular support.** The primary port (`ICallProcessService`) never touches the DOM, so the same core package works from React, Vue, Svelte, or a plain `<script>` tag — but v2 ships a real Angular integration, not an afterthought: `provideEasyCall(...)` wires everything through standard DI in one call, `CallProcessAngular` is an injectable facade whose derived streams bridge cleanly to signals with `toSignal()`, and `[ecVideo]` binds a stream to a `<video>` declaratively. The reference example uses signal inputs, `@if`/`@for`, and `toSignal()` throughout — modern Angular, not legacy `@Input()`/`*ngIf`. See the [Angular example](#angular--full-integration) — a full call hub is under 150 lines.
- **One event stream, not a callback jungle.** Every outcome — local media ready, a peer's stream arriving, a participant leaving, a state change, an async failure — is a variant of a single discriminated union, `CallEvent`, published on `events$`.
- **Multiparty out of the box.** Calling three people works the same way as calling one: `startCall` negotiates a full-mesh connection to every invited user, and late joiners negotiate with everyone already present.
- **Pluggable signaling.** Rendez-vous (offer/answer/ICE exchange, room membership, join locking) is an interface — `CallProcessSignaling` — with a ready-to-use Firestore adapter (`FirebaseCallProcess`) bundled in. Swap in your own backend by implementing 12 methods.
- **Optional adapters, not a monolith.** The DOM binder (`easy-call-js/dom`) and the Angular integration (`easy-call-js/angular`) are separate entry points. Don't need them? Don't import them.
- **Typed errors with stable codes.** Every failure is a `CallError` subclass (`ValidationError`, `MediaDeviceError`, `WebRTCConnectionError`, …) carrying a `code` string you can safely `switch` on.
- **Deterministic cleanup.** A `ResourceManager` tracks every stream and connection it opens and guarantees they're torn down on `cleanup()` — including when only some of them failed.
- **Strict TypeScript, ships its own `.d.ts`.** No `@types` package to chase, no `any` leaking from the public API.

## Demo

**[Try the live demo](https://call-app-e29f1.web.app/)** — a small Angular app (source: **[demo repo](https://github.com/yvesleciel/test-easy-call-js)**) where each participant picks a user id, calls one or more of the others by id, and shows a full mesh video grid. It exercises the whole v2 surface: `startCall`, incoming-call banners via `trackIncomingCalls`, `takeCall`/`rejectCall`, `[ecVideo]` for rendering, and `releaseCall`/`cleanup` on hang-up/logout. The [Angular example](#angular--full-integration) below walks through the same app's key files.

No Angular? The same flow in plain TypeScript fits on one screen — see [Quick start](#quick-start) and the [Vanilla example](#vanilla-js--the-dom-adapter).

> [!IMPORTANT]
> Open the demo on **two (or three) separate physical devices** — a laptop plus a phone, two laptops, etc. — not multiple tabs or windows of the same browser on one machine. The demo claims your local camera for the call; most webcams (built-in or USB) only serve one active capture session at a time, so a second tab fighting the first for the same physical camera won't behave like an independent second participant. It's not a representative way to see the mesh in action, whatever the call banners show.

> [!TIP]
> **Trying the demo with 2, then 3 participants**
>
> **Two participants:**
> 1. Open the demo on two devices. On each, pick a different user id (e.g. `alice` on device A, `bob` on device B).
> 2. On device A, place a call to `bob`.
> 3. Device B gets an incoming-call banner — accept it.
> 4. Within a couple of seconds both devices should show the other participant's live video.
>
> **Three participants:**
> 1. Open the demo on a third device and pick a third id (e.g. `carol`).
> 2. On device A, place a call to both `bob` and `carol` at once.
> 3. Accept on device B and device C independently — any order, any pace; they don't need to accept together.
> 4. Once both have joined, all three devices should show the other two participants' video — a full mesh of 3 peer connections (see [Multiparty architecture](#multiparty-architecture)).

## Quick start

```bash
npm install easy-call-js
```

```ts
import { CallServiceFactory, FirebaseCallProcess } from 'easy-call-js';
import { DomVideoBinder } from 'easy-call-js/dom';

// 1. Wire signaling (Firestore adapter ships with the package)
const signaling = new FirebaseCallProcess({
  apiKey: '...', authDomain: '...', projectId: '...', /* ... */
});
const service = CallServiceFactory.create(signaling);

// 2. Bind video elements (opt-in; skip this if you render your own)
const binder = new DomVideoBinder({
  localVideoSelector: 'local-video',
  remoteContainerId: 'video-container',
});
binder.attach(service.events$);

// 3. React to whatever you care about
service.events$.subscribe(event => {
  if (event.kind === 'Error') console.error(event.operation, event.error);
});

// 4. Start or join a call
const callId = await service.startCall('alice', ['bob', 'carol']);
// ... elsewhere, on Bob's client
const { callId: incomingId } = await service.trackIncomingCalls('bob');
await service.takeCall('bob', incomingId);

// 5. Leave
await service.releaseCall(callId, 'alice');
```

`firebase` and `rxjs` are regular dependencies of `easy-call-js` — no extra install needed. Using your own signaling backend instead of Firestore? Skip `FirebaseCallProcess` and pass any `CallProcessSignaling` implementation to `CallServiceFactory.create` (see [Signaling](#signaling)).

> **Using Angular?** Skip straight to the [full Angular integration example](#angular--full-integration) — `provideEasyCall({ signaling })` in your app config is the entire setup; everything else is one injected service and one directive.

## What's new in v2

v2.0.0 is a breaking rewrite around hexagonal architecture. Highlights:

- **The core is DOM-free.** No more `videoSelector` / `idContentForCall` scattered through the API. All DOM binding moved to the opt-in `easy-call-js/dom` package.
- **One atomic `startCall`.** `initializeCall` + `launchCall` merged into a single call that resolves once negotiation has been dispatched.
- **`takeCall` waits for the actual join**, with a configurable timeout (`TakeCallOptions.joinTimeoutMs`, default 30 s) that rejects with `CallJoinTimeoutError` instead of resolving prematurely.
- **`trackIncomingCalls`** (renamed from `trackCall`) now returns the caller's identity (`from`) when the signaling backend exposes it, so you can render "Alice is calling…" before answering.
- **A single `events$` stream** replaces `handleLeaveCall(...)`/`removeParticipantVideo(...)` and any ad-hoc callback wiring.
- **A first-class Angular adapter** (`easy-call-js/angular`): `provideEasyCall`, a `CallProcessAngular` facade with derived `state$`/`localStream$`/`remoteStreams$` observables, and an `[ecVideo]` directive.
- **Deep-mergeable configuration** via `mergeCallConfig` — override just `rtc.iceServers` without re-specifying every media/timeout default.

Full breaking-change list, before/after snippets per framework, and the removed-exports table: see [Migration](#migration) and [MIGRATION.md](MIGRATION.md).

---

# Understand

## Core concepts

The library follows a **hexagonal (ports & adapters)** design. `CallProcessService` is the orchestrator; it depends only on interfaces, never on concrete browser or backend APIs.

| Kind | Name | Role |
| --- | --- | --- |
| Primary port (driving) | `ICallProcessService` | The public contract consumers program against: `startCall`, `takeCall`, `trackIncomingCalls`, `releaseCall`, `rejectCall`, `cleanup`, `events$`. |
| Secondary port (driven) | `CallProcessSignaling` | Rendez-vous layer: create/join rooms, exchange SDP/ICE, join locking, leave notifications. |
| Secondary port (driven) | `IMediaService` | Local camera/microphone capture and release. |
| Secondary port (driven) | `IWebRTCService` | `RTCPeerConnection` lifecycle: offers, answers, descriptions, ICE, tracks. |
| Bundled adapter | `FirebaseCallProcess` | Reference `CallProcessSignaling` implementation backed by Cloud Firestore. |
| Bundled adapter | `MediaService` | `IMediaService` implementation delegating to `navigator.mediaDevices`. |
| Bundled adapter | `WebRTCService` | `IWebRTCService` implementation wrapping `RTCPeerConnection`, with per-operation timeouts. |
| Optional adapter | `DomVideoBinder` (`easy-call-js/dom`) | Subscribes to `events$` and paints `<video>` elements. Entirely opt-in. |
| Optional adapter | `easy-call-js/angular` | DI providers + facade + `[ecVideo]` directive for Angular apps. |

Because the core depends only on ports, `CallProcessService`'s own test suite runs under plain Node — no browser, no `jsdom` — by supplying in-memory fakes for the three secondary ports. Only the DOM and Angular adapters need a browser-like environment.

`CallServiceFactory.create(signaling, config?)` is the convenience entry point: it instantiates the bundled `MediaService`/`WebRTCService` adapters and wires them with your `CallProcessSignaling` of choice, deep-merging `config` onto the library defaults.

## How it works

**Starting a call** (`startCall`):
1. Validate `callIssuerId` and `users`.
2. Capture local media **first** — Teams-style: if the caller has no camera, recipients are never rung with a call that could never negotiate.
3. Create the call room via the signaling adapter.
4. Negotiate a peer connection with every invited user in parallel (`Promise.allSettled` — one failed peer doesn't abort the others).
5. Publish `Joined`, resolve with the `callId`.

**Answering a call** (`takeCall`):
1. Validate inputs, capture local media.
2. Acquire the signaling join lock (serializes concurrent joiners so two people don't negotiate against a half-updated participant list at once).
3. Once the lock is granted: register in the room, negotiate with every participant already present, then fire-and-forget negotiate with every other pending invitee.
4. Publish `Joined` — or reject with `CallJoinTimeoutError` if no `Joined` event lands before the deadline.

**Leaving** (`releaseCall`): releases signaling state, tears down every tracked stream/connection via `ResourceManager`, publishes `Left` then `CallEnded`.

Every step above logs through the internal `Logger` and surfaces failures as an `Error` event rather than throwing invisibly inside a subscription.

## Event-driven API

Every observable outcome — not just call lifecycle — comes through one stream:

```ts
service.events$.subscribe(event => {
  switch (event.kind) {
    case 'LocalStreamReady':
      localVideo.srcObject = event.stream;
      break;
    case 'RemoteStreamAvailable':
      renderRemote(event.participantId, event.stream);
      break;
    case 'ParticipantLeft':
      removeRemote(event.participantId);
      break;
    case 'Error':
      console.error(`[${event.operation}]`, event.error);
      break;
  }
});
```

`events$` is a hot RxJS `Observable<CallEvent>` that completes when `cleanup()` finishes. See [Events reference](#events-reference) for the full union.

## Signaling

`CallProcessSignaling` is the port responsible for getting two peers' SDP offers/answers/ICE candidates to each other, plus lightweight room bookkeeping (who's in the call, who's still pending, who just left). It does **not** carry any media — only small JSON payloads.

```ts
interface CallProcessSignaling {
  createCall(callIssuerId: string, usersToCallId: string[]): Promise<string>;
  writeOfferOrAnswerOrIce(path: string, idUser: string, type: RTCExchangeDataType, element: any): void;
  onReadOfferOrAnswerOrIce(path: string, idUser: string, participantId: string, type: RTCExchangeDataType, callBack: CallBack): Promise<any>;
  joinCall(roomId: string, participantId: string): Promise<void>;
  acquireLock(roomId: string, participantId: string): Promise<boolean>;
  getAlreadyParticipants(roomId: string): Promise<string[]>;
  listenForLockRelease(roomId: string, participantId: string, action: () => void): void;
  getParticipantNotInCall(roomId: string): Promise<string[]>;
  releaseLock(roomId: string): void;
  releaseCall(callId: string, userId: string): Promise<void>;
  rejectCall(userId: string): Promise<void>;
  onNewCall(userId: string): Promise<{ callId: string; from?: string }>;
  onLeaveCall(callId: string): Observable<string>;
}
```

**`FirebaseCallProcess`** is the bundled reference implementation, backed by Cloud Firestore:

| Path | Shape |
| --- | --- |
| `rooms/{callId}` | `{ personIds: string[], inCall: string[] }` |
| `rooms/{callId}/lock/mutex` | `{ participantId, timestamp }` — the join lock |
| `rooms/{callId}/sdp/{type}/{peerId}` | SDP offer/answer or ICE payloads, tagged with `issuer` |
| `rooms/{callId}/leave` | Leave notifications: `{ userId, timestamp }` |
| `users/{userId}/call/callId` | Pending-call marker: `{ callId, from }` |

This shape is a contract shared between clients talking to the same Firestore project — two peers using `FirebaseCallProcess` must agree on it, but you're free to replace the whole adapter. Implement `CallProcessSignaling` against WebSockets, a custom REST API, Supabase Realtime, or anything else, and pass it to `CallServiceFactory.create` the same way.

## STUN/TURN

ICE server configuration lives under `CallConfig.rtc`:

```ts
interface RTCConfig {
  iceServers: RTCIceServer[];
  iceCandidatePoolSize?: number;
  bundlePolicy?: RTCBundlePolicy;
}
```

The default configuration only ships public Google STUN servers:

```ts
iceServers: [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
]
```

STUN alone is enough for peers on open networks, but **it cannot traverse symmetric NATs or restrictive corporate firewalls** — a meaningful share of real-world users. For production, add a TURN server:

```ts
const service = CallServiceFactory.create(signaling, {
  rtc: {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'turn:your-turn-server.com:3478', username: 'user', credential: 'pass' },
    ],
  },
});
```

`easy-call-js` does not bundle or operate a TURN server — bring your own (coturn, a managed provider, etc.). See [Security](#security) for a note on TURN credential handling.

Angular apps configure the same `RTCConfig` through `provideEasyCall({ config: { rtc: { iceServers: [...] } } })` instead of `CallServiceFactory.create` — see the [Angular example](#angular--full-integration) for a full snippet.

## Multiparty architecture

`easy-call-js` uses a **full-mesh** topology: every participant holds a direct `RTCPeerConnection` to every other participant — there's no SFU/MCU in the media path.

```
   Alice ── Bob
     \      /
      \    /
      Carol
```

- `startCall` negotiates one connection from the issuer to each invited user.
- A late joiner negotiates with **everyone already in the room** (`getAlreadyParticipants`) and, fire-and-forget, with everyone still pending (`getParticipantNotInCall`) — so two people joining seconds apart still end up fully connected to each other.
- The signaling **join lock** (`acquireLock` / `listenForLockRelease`) serializes the join sequence itself, so concurrent joiners don't race on a half-updated participant list — it does not limit how many peer connections a joined participant ends up with.

Full mesh keeps the architecture simple and needs no media server, but its cost scales with the group: for _n_ participants each client uploads _n − 1_ outbound streams. As a rule of thumb, mesh calls stay comfortable up to roughly 4–6 participants; beyond that, per-client bandwidth and CPU become the bottleneck, and you'd want an SFU in front (not provided by this library — see [Limitations](#limitations)).

---

# Use

## Calls

```ts
import { ValidationError, MediaDeviceError } from 'easy-call-js';

try {
  const callId = await service.startCall('alice', ['bob', 'carol']);
  // ... later
  await service.releaseCall(callId, 'alice');
} catch (error) {
  if (error instanceof MediaDeviceError) {
    // camera/mic denied or unavailable
  } else if (error instanceof ValidationError) {
    // bad callIssuerId / empty users list
  }
}
```

`releaseCall` releases signaling state, tears down local resources, and publishes `Left` then `CallEnded` — call it for every participant that leaves, including the last one.

## Incoming calls

```ts
import { CallJoinTimeoutError } from 'easy-call-js';

// Resolves once — call it again in a loop to keep listening for the next call.
const { callId, from } = await service.trackIncomingCalls('bob');
showIncomingCallUi(from); // "Alice is calling…" (from may be undefined for some adapters)

try {
  await service.takeCall('bob', callId, { joinTimeoutMs: 15_000 });
} catch (error) {
  if (error instanceof CallJoinTimeoutError) {
    showUnableToJoin();
  } else {
    throw error;
  }
}

// Or decline it:
await service.rejectCall('bob');
```

`trackIncomingCalls` resolves for the **next** incoming call only; wrap it in a loop (or re-invoke it after each call ends) if the user should keep receiving calls.

## Errors

Every error thrown by the library extends the abstract `CallError`, which carries a stable `code` you can switch on without `instanceof` chains across module boundaries:

```ts
try {
  await service.startCall(issuerId, users);
} catch (error) {
  if (error instanceof CallError) {
    console.error(error.code, error.message, error.context);
  }
}
```

See [Errors reference](#errors-easy-call-js) below for the full list of subclasses and codes.

## Configuration

```ts
import { ConfigService, mergeCallConfig } from 'easy-call-js';

const defaults = ConfigService.getInstance().getDefaultConfig();
// defaults.rtc / defaults.media / defaults.timeouts

const config = mergeCallConfig(defaults, {
  rtc: { iceServers: [{ urls: 'turn:my-turn.example.com', username: 'u', credential: 'p' }] },
  timeouts: { connectionTimeout: 45_000 },
});

const service = CallServiceFactory.create(signaling, config);
```

`mergeCallConfig` deep-merges one level: overriding `timeouts.connectionTimeout` keeps `timeouts.iceGatheringTimeout` and `timeouts.callSetupTimeout` at their defaults. Overriding `rtc.iceServers` replaces the whole array (not item-by-item).

Diagnostic logging is a separate, independent knob:

```ts
import { Logger, LogLevel } from 'easy-call-js';

Logger.getInstance(LogLevel.DEBUG); // DEBUG | INFO (default) | WARN | ERROR
```

## Examples

### Angular — full integration

v2 was built with Angular as its first-class target — and this example leans on current Angular idioms throughout: signal inputs instead of `@Input()`, the built-in `@if`/`@for` control flow instead of `*ngIf`/`*ngFor`, and `toSignal()` to bridge the SDK's RxJS streams into signals once, at the component boundary. This is a trimmed-down version of the reference demo app (linked in [Demo](#demo)) — a user picks an id, lands on a call hub, and can call, receive, and hang up.

**1. Bootstrap — `app.config.ts`.** `provideEasyCall` is the entire setup. `withComponentInputBinding()` is what lets the call hub below receive `:userId` as a signal input instead of injecting `ActivatedRoute`:

```ts
import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { FirebaseCallProcess } from 'easy-call-js';
import { provideEasyCall } from 'easy-call-js/angular';
import { routes } from './app.routes';

const firebaseConfig = {
  apiKey: '...', authDomain: '...', projectId: '...', /* ... your Firebase project ... */
};

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes, withComponentInputBinding()),

    provideEasyCall({
      signaling: new FirebaseCallProcess(firebaseConfig),

      // Optional — bring your own STUN/TURN servers. If omitted, easy-call-js
      // falls back to public Google STUN servers (fine for demos, not for
      // production behind NAT/firewalls — see STUN/TURN).
      config: {
        rtc: {
          iceServers: [
            { urls: 'stun:stun.mycompany.com' },
            { urls: 'turn:turn.mycompany.com', username: 'user', credential: 'pass' },
          ],
        },
      },
    }),
  ],
};
```

**2. Routes — `app.routes.ts`.** One route to pick an identity, one to land in the call hub. The `:userId` segment name must match the signal input's name below:

```ts
import { Routes } from '@angular/router';
import { IdentityComponent } from './identity/identity.component';
import { CallHubComponent } from './call-hub/call-hub.component';

export const routes: Routes = [
  { path: '', component: IdentityComponent },
  { path: 'hub/:userId', component: CallHubComponent },
  { path: '**', redirectTo: '' },
];
```

**3. The call hub — `call-hub.component.ts`.** Everything is driven by `CallProcessAngular`, injected once. `userId` is a **required signal input** bound straight from the route (Angular ≥ 17.1; stable since v19 — on older setups, inject `ActivatedRoute` and read `snapshot.paramMap` instead):

```ts
import { Component, DestroyRef, OnInit, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { map } from 'rxjs';

import { CallJoinTimeoutError } from 'easy-call-js';
import { CallProcessAngular, EcVideoDirective } from 'easy-call-js/angular';

type Status = 'idle' | 'incoming' | 'calling' | 'in-call';

@Component({
  selector: 'app-call-hub',
  imports: [FormsModule, EcVideoDirective], // standalone by default since Angular v19
  templateUrl: './call-hub.component.html',
})
export class CallHubComponent implements OnInit {
  private readonly destroyRef = inject(DestroyRef);
  private readonly callService = inject(CallProcessAngular); // <- the whole SDK

  // Bound from the `:userId` route segment — see withComponentInputBinding() above.
  readonly userId = input.required<string>();

  readonly targetsInput = signal('');
  readonly status = signal<Status>('idle');
  readonly currentCallId = signal<string | null>(null);
  readonly incomingCallId = signal<string | null>(null);
  readonly incomingFrom = signal<string | null>(null);
  readonly errorMessage = signal<string | null>(null);

  // Bridge the SDK's RxJS streams to signals once — the template never touches `| async`.
  readonly localStream = toSignal(this.callService.localStream$, { initialValue: null });
  readonly remoteEntries = toSignal(
    this.callService.remoteStreams$.pipe(
      map(record => Object.entries(record).map(([participantId, stream]) => ({ participantId, stream }))),
    ),
    { initialValue: [] as { participantId: string; stream: MediaStream }[] },
  );

  ngOnInit(): void {
    this.callService.events$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(event => {
      switch (event.kind) {
        case 'Joined':
          this.status.set('in-call');
          this.currentCallId.set(event.callId);
          break;
        case 'CallEnded':
          this.status.set('idle');
          this.currentCallId.set(null);
          this.listenForIncomingCalls();
          break;
        case 'Error':
          this.errorMessage.set(`${event.operation}: ${event.error.message}`);
          break;
      }
    });
    this.listenForIncomingCalls();
  }

  async startCall(): Promise<void> {
    const users = this.targetsInput().split(',').map(s => s.trim()).filter(Boolean);
    if (users.length === 0) return;
    this.status.set('calling');
    try {
      await this.callService.startCall(this.userId(), users);
    } catch (err) {
      this.status.set('idle');
      this.errorMessage.set((err as Error).message);
    }
  }

  async acceptIncoming(): Promise<void> {
    const callId = this.incomingCallId();
    if (!callId) return;
    this.status.set('calling');
    try {
      await this.callService.takeCall(this.userId(), callId, { joinTimeoutMs: 20_000 });
    } catch (err) {
      this.status.set('idle');
      this.errorMessage.set(
        err instanceof CallJoinTimeoutError ? 'Join timed out — the caller may have left.' : (err as Error).message,
      );
      this.listenForIncomingCalls();
    }
  }

  rejectIncoming(): Promise<void> {
    return this.callService.rejectCall(this.userId()).finally(() => {
      this.incomingCallId.set(null);
      this.status.set('idle');
      this.listenForIncomingCalls();
    });
  }

  leaveCall(): Promise<void> {
    const callId = this.currentCallId();
    return callId ? this.callService.releaseCall(callId, this.userId()) : Promise.resolve();
  }

  // trackIncomingCalls resolves once per incoming call — re-arm after every ring.
  private listenForIncomingCalls(): void {
    this.callService.trackIncomingCalls(this.userId()).then(({ callId, from }) => {
      if (this.status() === 'in-call') { this.listenForIncomingCalls(); return; }
      this.incomingCallId.set(callId);
      this.incomingFrom.set(from ?? null);
      this.status.set('incoming');
    });
  }
}
```

**4. The template — `call-hub.component.html`.** Built-in `@if`/`@for` control flow, no `CommonModule` import needed; `[ecVideo]` binds a `MediaStream` the way `[src]` binds a URL:

```html
@if (status() === 'incoming') {
  <section>
    <strong>{{ incomingFrom() ?? 'Someone' }} is calling…</strong>
    <button (click)="acceptIncoming()">Accept</button>
    <button (click)="rejectIncoming()">Decline</button>
  </section>
}

<section class="video-grid">
  <video [ecVideo]="localStream()" [ecMuted]="true"></video>

  @for (entry of remoteEntries(); track entry.participantId) {
    <video [ecVideo]="entry.stream"></video>
  }
</section>

@if (status() === 'idle') {
  <section>
    <input [ngModel]="targetsInput()" (ngModelChange)="targetsInput.set($event)" placeholder="bob, carol" />
    <button (click)="startCall()">Start call</button>
  </section>
}

@if (status() === 'in-call') {
  <button (click)="leaveCall()">Leave call</button>
}
```

That's the entire integration: one `provideEasyCall(...)` call, one injected `CallProcessAngular`, one directive. `CallProcessAngular` implements `ICallProcessService` itself, plus `state$`/`localStream$`/`remoteStreams$` — RxJS observables you bridge to signals with `toSignal()` (as above) or consume directly with the `async` pipe if you prefer. It calls `cleanup()` automatically on `ngOnDestroy` — no manual teardown needed when the component is destroyed mid-call.

### Vanilla JS + the DOM adapter

```ts
import { CallServiceFactory, FirebaseCallProcess } from 'easy-call-js';
import { DomVideoBinder } from 'easy-call-js/dom';

const service = CallServiceFactory.create(new FirebaseCallProcess(firebaseConfig));

// Opt-in DOM binding — paints <video id="local-video"> and one
// <video id="remote{participantId}"> per peer inside #video-container.
const binder = new DomVideoBinder({
  localVideoSelector: 'local-video',
  remoteContainerId: 'video-container',
});
binder.attach(service.events$);

service.events$.subscribe(event => {
  if (event.kind === 'IncomingCall') showIncomingBanner(event.callId, event.from);
  if (event.kind === 'Error') console.error(event.operation, event.error);
});

// Caller
const callId = await service.startCall('alice', ['bob']);

// Callee (e.g. after clicking "Accept" on the banner above)
await service.takeCall('bob', callId);

// Either side, on hang-up
await service.releaseCall(callId, 'alice');
```

No framework, no build-time glue: `CallServiceFactory.create` wires the bundled adapters, and `DomVideoBinder` handles every `<video>` element for you. Skip it and subscribe to `LocalStreamReady`/`RemoteStreamAvailable` yourself if you'd rather render the DOM by hand.

### React (bring your own glue)

There's no React adapter — consume the core directly and bind to your own refs:

```tsx
import { useEffect, useMemo, useRef, useState } from 'react';
import { CallServiceFactory, FirebaseCallProcess, type CallEvent } from 'easy-call-js';

function CallView() {
  const localRef = useRef<HTMLVideoElement>(null);
  const [remotes, setRemotes] = useState<Record<string, MediaStream>>({});
  const service = useMemo(() => CallServiceFactory.create(new FirebaseCallProcess(firebaseConfig)), []);

  useEffect(() => {
    const sub = service.events$.subscribe((e: CallEvent) => {
      if (e.kind === 'LocalStreamReady' && localRef.current) localRef.current.srcObject = e.stream;
      if (e.kind === 'RemoteStreamAvailable') setRemotes(prev => ({ ...prev, [e.participantId]: e.stream }));
      if (e.kind === 'ParticipantLeft' || e.kind === 'RemoteStreamLost') {
        setRemotes(({ [e.participantId]: _drop, ...rest }) => rest);
      }
    });
    return () => { sub.unsubscribe(); service.cleanup(); };
  }, [service]);

  return (
    <>
      <video ref={localRef} autoPlay muted playsInline />
      {Object.entries(remotes).map(([id, stream]) => <RemoteVideo key={id} stream={stream} />)}
    </>
  );
}

function RemoteVideo({ stream }: { stream: MediaStream }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => { if (ref.current) ref.current.srcObject = stream; }, [stream]);
  return <video ref={ref} autoPlay playsInline />;
}
```

---

# Reference

## API reference

### `ICallProcessService` (primary port — from `easy-call-js`)

| Member | Signature | Description |
| --- | --- | --- |
| `events$` | `Observable<CallEvent>` | Every observable outcome. Completes when `cleanup()` finishes. |
| `startCall` | `(callIssuerId: string, users: string[]) => Promise<string>` | Creates a call, negotiates with every invited user, resolves with the `callId`. |
| `takeCall` | `(participantId: string, callId: string, options?: TakeCallOptions) => Promise<void>` | Joins an existing call. Resolves once `Joined` fires; rejects with `CallJoinTimeoutError` past `options.joinTimeoutMs` (default 30 000 ms). |
| `trackIncomingCalls` | `(userId: string) => Promise<{ callId: string; from?: string }>` | Resolves on the next incoming call; publishes `IncomingCall`. |
| `releaseCall` | `(callId: string, userId: string) => Promise<void>` | Leaves the call; publishes `Left` then `CallEnded`. |
| `rejectCall` | `(userId: string) => Promise<void>` | Declines a pending incoming call at the signaling layer. |
| `cleanup` | `() => Promise<void>` | Releases every resource and completes `events$`. Safe to call more than once. |

### Factory & configuration

| Export | From | Description |
| --- | --- | --- |
| `CallServiceFactory.create(signaling, config?)` | `easy-call-js` | Builds a `CallProcessService` wired with the bundled `MediaService`/`WebRTCService` adapters. |
| `ConfigService.getInstance().getDefaultConfig()` | `easy-call-js` | Returns the library's default `CallConfig` (see [STUN/TURN](#stunturn) / [Configuration](#configuration)). |
| `mergeCallConfig(defaults, partial?)` | `easy-call-js` | One-level deep merge of a partial `CallConfig` onto a base config. |
| `Logger.getInstance(level?)` / `LogLevel` | `easy-call-js` | Singleton structured console logger; diagnostic only, not part of observable behavior. |
| `CallState` / `CallStateMachine` | `easy-call-js` | The lifecycle enum (`IDLE → INITIALIZING → CONNECTING → CONNECTED/RECONNECTING → DISCONNECTING → IDLE`, with `ERROR` reachable from most states) and the machine driving `StateChanged` events. |

### Secondary ports (for adapter implementers)

| Export | From | Description |
| --- | --- | --- |
| `CallProcessSignaling`, `RTCExchangeDataType`, `CallBack`, `PeerConnect` | `easy-call-js` | The signaling port — implement this to replace Firestore. |
| `IMediaService` | `easy-call-js` | The local-media port. |
| `IWebRTCService` | `easy-call-js` | The `RTCPeerConnection` port. |
| `FirebaseCallProcess` | `easy-call-js` | Bundled Firestore `CallProcessSignaling` adapter. |
| `MediaService`, `WebRTCService` | `easy-call-js` | Bundled browser adapters, exported so they can be composed manually or mocked in tests. |

### `easy-call-js/dom`

| Export | Description |
| --- | --- |
| `DomVideoBinder` | `attach(events$)` / `detach()`. Binds `LocalStreamReady`/`RemoteStreamAvailable` to `<video>` elements and cleans them up on `RemoteStreamLost`/`ParticipantLeft`/`LocalStreamStopped`. |
| `DomVideoBinderConfig` | `{ localVideoSelector, remoteContainerId, ui? }` |
| `UIConfig`, `DEFAULT_UI_CONFIG` | Cosmetic `<video>` settings (`videoWidth`/`videoHeight`/`autoplay`/`controls`/`playsInline`/`marginRight`). Defaults: `200×200`, autoplay on, controls off, plays inline, `10px` right margin. |

### `easy-call-js/angular`

| Export | Description |
| --- | --- |
| `provideEasyCall({ signaling, media?, webrtc?, config? })` | Registers DI providers; returns `EnvironmentProviders`. |
| `CallProcessAngular` | Injectable facade implementing `ICallProcessService`, plus `state$`, `localStream$`, `remoteStreams$`. Calls `cleanup()` on `ngOnDestroy`. |
| `EcVideoDirective` | `video[ecVideo]` — binds a `MediaStream` via `[ecVideo]`, with `[ecMuted]`, `[ecAutoplay]`, `[ecPlaysInline]` inputs. |
| `SIGNALING_TOKEN`, `MEDIA_TOKEN`, `WEBRTC_TOKEN` | `InjectionToken`s, exposed for advanced overriding. |

### Errors (`easy-call-js`)

| Class | `code` | Thrown when |
| --- | --- | --- |
| `ValidationError` | `VALIDATION_ERROR` | A domain precondition fails (blank id, empty user list, …). |
| `WebRTCConnectionError` | `WEBRTC_CONNECTION_ERROR` | A WebRTC operation (create/set description, add track, …) fails or times out. |
| `MediaDeviceError` | `MEDIA_DEVICE_ERROR` | The camera/microphone can't be accessed, or `getUserMedia` isn't supported. |
| `CallStateError` | `CALL_STATE_ERROR` | An illegal transition is attempted on `CallStateMachine`. |
| `CallJoinTimeoutError` | `CALL_JOIN_TIMEOUT` | `takeCall` doesn't observe a `Joined` event within `joinTimeoutMs`. |
| `VideoElementError` | `VIDEO_ELEMENT_ERROR` | Reserved for DOM-adapter element-resolution failures. Currently the shipped `DomVideoBinder` logs a `console.warn` instead of throwing when an element is missing — don't rely on catching this from `attach()` today. |

## Events reference

All published on `events$: Observable<CallEvent>`, discriminated by `kind`:

| Group | `kind` | Payload | Fires when |
| --- | --- | --- | --- |
| Call lifecycle | `Joined` | `{ callId }` | The local participant has finished joining/starting the call. |
| | `Left` | `{ callId, userId }` | `releaseCall` has released signaling state for `userId`. |
| | `CallEnded` | `{ callId, reason: 'released' \| 'rejected' \| 'error' }` | The call has fully ended for the local participant. |
| | `IncomingCall` | `{ callId, from? }` | `trackIncomingCalls` resolved a new incoming call. |
| | `IncomingCallRejected` | `{ callId, by }` | An incoming call was declined. |
| Local media | `LocalStreamReady` | `{ stream }` | The local camera/microphone stream was captured. |
| | `LocalStreamStopped` | `{}` | `cleanup()` released the local stream. |
| Participants | `ParticipantJoined` | `{ participantId }` | Negotiation with a peer (existing or newly invited) completed. |
| | `ParticipantLeft` | `{ participantId }` | The signaling layer reported a peer leaving. |
| | `RemoteStreamAvailable` | `{ participantId, stream }` | A remote peer's media track arrived. |
| | `RemoteStreamLost` | `{ participantId }` | A remote peer's stream is no longer available. |
| Connection health | `PeerConnectionStateChanged` | `{ participantId, state }` | A peer's `RTCPeerConnectionState` changed. |
| State machine | `StateChanged` | `{ state, context }` | The internal `CallStateMachine` transitioned (see `CallState`). |
| Errors | `Error` | `{ operation, error, context? }` | An async failure was surfaced from the pipeline instead of thrown into the void. |

## Browser support

The core service and its bundled adapters target evergreen browsers with standard WebRTC support:

| Requirement | Notes |
| --- | --- |
| `RTCPeerConnection`, `navigator.mediaDevices.getUserMedia` | Current Chrome, Firefox, Safari, Edge. |
| Secure context | `getUserMedia` requires HTTPS (or `localhost`) — a browser platform requirement, not a library one. |
| Language target | Compiled to `ES2022` — bundle/transpile further down if you must support older runtimes. |
| Angular adapter | Peer dependency `@angular/core`/`@angular/common` `>=18`; `easy-call-js/angular` is a separate entry point, not required by the core. |

The core domain logic itself (`CallProcessService` and its ports) has no DOM dependency and is tested under plain Node — only the bundled `MediaService`/`WebRTCService`/`DomVideoBinder` adapters require real browser APIs. Node.js server-side calling is not a supported use case out of the box, but the ports are open to a server-side `IWebRTCService`/`IMediaService` implementation if you need one.

## Limitations

- **Full mesh, not an SFU/MCU.** Bandwidth and CPU per client grow with participant count; see [Multiparty architecture](#multiparty-architecture). Large-conference use cases need a media server this library doesn't provide.
- **No built-in screen sharing, recording, or chat.** The `MediaConfig` only covers camera/microphone constraints; layering in a `getDisplayMedia()` track is up to the consumer.
- **No automatic reconnection / ICE restart.** `WebRTCService` surfaces connection-state changes (`PeerConnectionStateChanged`) but doesn't retry failed connections for you.
- **One signaling adapter ships in the box** (`FirebaseCallProcess`, Firestore-backed). Anything else means implementing `CallProcessSignaling` yourself.
- **`trackIncomingCalls` resolves once per call.** Keep calling it (e.g. in a loop) to keep receiving new incoming calls for a user.
- **No authentication/authorization.** See [Security](#security).

## Security

- **`getUserMedia` requires a secure context.** Serve your app over HTTPS (or `localhost` in development) — browsers refuse camera/microphone access otherwise.
- **The library does not authenticate users or authorize room membership.** `callIssuerId`/participant ids are opaque strings; verifying that a given browser session is allowed to act as that id is your application's responsibility, enforced at your signaling backend (e.g. Firestore Security Rules for `FirebaseCallProcess`) — this library ships no rules of its own.
- **TURN credentials passed via `RTCConfig.iceServers` are visible to the client.** Prefer short-lived, per-session TURN credentials issued by your backend over long-lived static secrets.
- **Firestore project configuration is your responsibility.** `FirebaseCallProcess` reads/writes `rooms/*` and `users/*/call/*` — restrict those paths with Security Rules matching your auth model before going to production.

## Migration

Upgrading from v1.0.1? v2.0.0 is a breaking release — the primary port is now event-driven and DOM-free. See **[MIGRATION.md](MIGRATION.md)** for the full breaking-changes table, before/after snippets per framework (vanilla, Angular, React), and the list of removed exports (`CallParam`, `initializeCall`/`launchCall`, `IVideoUIService`, `UIConfig` moved to `easy-call-js/dom`, `handleLeaveCall`/`removeParticipantVideo` replaced by `events$`, `trackCall` renamed to `trackIncomingCalls`).

## Contributing

Contributions are welcome.

```bash
npm install
npm test            # Jest, run under Node — no browser required for core tests
npm run build        # builds the core package and the Angular package (build:core + build:angular)
```

- Tests live in `src/tests/**/*.test.ts`; the DOM adapter suite opts into a `jsdom` environment via a per-file `@jest-environment jsdom` pragma.
- Keep the primary port (`ICallProcessService`) DOM-free — DOM/framework concerns belong in `easy-call-js/dom` or `easy-call-js/angular`.
- Open a PR against `main` with a clear description of the behavior change; make sure `npm test` and `npm run build` both pass.

## License

Apache License 2.0 — see [LICENSE](LICENSE).
