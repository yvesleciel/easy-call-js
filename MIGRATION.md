# Migration guide — easy-call-js v1 → v2

**v2.0.0** is a breaking release. The primary port is now event-driven and no longer knows about the DOM. This guide walks you through what changed and how to migrate.

---

## Why v2

`CallProcessService` in v1 mixed:
- **Domain logic** (WebRTC offer/answer/ICE choreography),
- **Orchestration** (participant lifecycle, resource management),
- **DOM concerns** (`localVideoSelector`, `idContentForCall`, `videoUIService`).

That mix made the service hard to reuse across frameworks (React users had to feed CSS selectors instead of using their own refs) and hard to test without mocking DOM adapters.

v2 splits these concerns via hexagonal architecture:
- The **core** (`easy-call-js`) exposes an event stream — no DOM knowledge.
- The **DOM adapter** (`easy-call-js/dom`) is an opt-in binder that subscribes to events and paints the `<video>` elements.
- The **Angular adapter** (`easy-call-js/angular`) provides a DI-friendly service, providers, and a `[ecVideo]` directive.

---

## Breaking changes summary

| v1 | v2 |
| --- | --- |
| `CallProcessService(signaling, media, videoUI, webrtc)` | `CallProcessService(signaling, media, webrtc)` — no DOM |
| `initializeCall(...)` + `launchCall(...)` (two-step) | `startCall(callIssuerId, users): Promise<string>` (atomic) |
| `CallParam { usersToCallId, callIssuerId, localVideoSelector, idContentForCall }` | Removed — `startCall` takes `(issuerId, users)` directly, no DOM selectors |
| `takeCall(pid, cid, localSelector, containerId)` | `takeCall(pid, cid, options?)` — no selectors |
| `takeCall` resolves as soon as camera is ready | `takeCall` resolves when the join is complete (timeout configurable via `TakeCallOptions.joinTimeoutMs`, default 30s → `CallJoinTimeoutError`) |
| `trackCall(userId): Promise<string>` | `trackIncomingCalls(userId): Promise<{ callId; from? }>` — `from` carries the caller identity so the UI can resolve a display name (Teams/Meet style) before answering. The `IncomingCall` event published on `events$` carries the same field. |
| `handleLeaveCall(callId): Observable<string>` | Subscribe to `events$` — `ParticipantLeft` |
| `removeParticipantVideo(userId)` | Removed — the DOM adapter unbinds on `ParticipantLeft` |
| `IVideoUIService` port | Removed from the core; DOM lives in `easy-call-js/dom` |
| `UIConfig` in `CallConfig` | Moved to `easy-call-js/dom` (`UIConfig`, `DEFAULT_UI_CONFIG`) |
| No event stream | `events$: Observable<CallEvent>` on the primary port |

---

## Migration by consumer type

### Vanilla (with the shipped DOM adapter)

**Before (v1):**
```ts
import { CallServiceFactory } from 'easy-call-js';
import { FirebaseCallProcess } from 'easy-call-js';

const service = CallServiceFactory.create(new FirebaseCallProcess(/* ... */));

const callId = await service.initializeCall('me', ['alice', 'bob']);
await service.launchCall({
  usersToCallId: ['alice', 'bob'],
  callIssuerId: 'me',
  localVideoSelector: 'local-video',
  idContentForCall: 'video-container',
}, callId);

service.handleLeaveCall(callId).subscribe(userId => { /* ... */ });
```

**After (v2):**
```ts
import { CallServiceFactory, FirebaseCallProcess } from 'easy-call-js';
import { DomVideoBinder } from 'easy-call-js/dom';

const service = CallServiceFactory.create(new FirebaseCallProcess(/* ... */));

// Bind DOM by subscribing to events (opt-in).
const binder = new DomVideoBinder({
  localVideoSelector: 'local-video',
  remoteContainerId: 'video-container',
});
binder.attach(service.events$);

// One atomic operation instead of initializeCall + launchCall.
const callId = await service.startCall('me', ['alice', 'bob']);

// Leaves come through the events stream.
service.events$.subscribe(event => {
  if (event.kind === 'ParticipantLeft') { /* ... */ }
});
```

### Angular (new adapter)

**v2:**
```ts
// app.config.ts
import { bootstrapApplication } from '@angular/platform-browser';
import { provideEasyCall, FirebaseCallProcess } from 'easy-call-js/angular';

bootstrapApplication(AppComponent, {
  providers: [
    provideEasyCall({ signaling: new FirebaseCallProcess(/* ... */) }),
  ],
});
```

```ts
// call.component.ts
import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CallProcessAngular, EcVideoDirective } from 'easy-call-js/angular';

@Component({
  standalone: true,
  imports: [CommonModule, EcVideoDirective],
  template: `
    <video ecVideo [ecVideo]="callService.localStream$ | async" [ecMuted]="true"></video>

    <ng-container *ngFor="let entry of remotesEntries$ | async">
      <video ecVideo [ecVideo]="entry.value"></video>
    </ng-container>
  `,
})
export class CallComponent {
  callService = inject(CallProcessAngular);
  remotesEntries$ = this.callService.remoteStreams$.pipe(
    map(record => Object.entries(record).map(([key, value]) => ({ key, value }))),
  );

  async startCall() {
    await this.callService.startCall('me', ['alice', 'bob']);
  }
}
```

### React (bring your own glue)

v2 does not ship a React adapter. Consume the core directly and bind to your refs.

```tsx
import { useEffect, useMemo, useRef, useState } from 'react';
import { CallServiceFactory, FirebaseCallProcess, type CallEvent } from 'easy-call-js';

function CallView() {
  const localRef = useRef<HTMLVideoElement>(null);
  const [remotes, setRemotes] = useState<Record<string, MediaStream>>({});
  const service = useMemo(() => CallServiceFactory.create(new FirebaseCallProcess(/* ... */)), []);

  useEffect(() => {
    const sub = service.events$.subscribe((e: CallEvent) => {
      if (e.kind === 'LocalStreamReady' && localRef.current) {
        localRef.current.srcObject = e.stream;
      }
      if (e.kind === 'RemoteStreamAvailable') {
        setRemotes(prev => ({ ...prev, [e.participantId]: e.stream }));
      }
      if (e.kind === 'ParticipantLeft' || e.kind === 'RemoteStreamLost') {
        setRemotes(({ [e.participantId]: _drop, ...rest }) => rest);
      }
    });
    return () => { sub.unsubscribe(); service.cleanup(); };
  }, [service]);

  return (
    <>
      <video ref={localRef} autoPlay muted playsInline />
      {Object.entries(remotes).map(([id, stream]) => (
        <RemoteVideo key={id} stream={stream} />
      ))}
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

## The `CallEvent` union

Full list of events emitted on `events$`:

- **Call lifecycle** — `Joined`, `Left`, `CallEnded`, `IncomingCall`, `IncomingCallRejected`
- **Local media** — `LocalStreamReady`, `LocalStreamStopped`
- **Participants** — `ParticipantJoined`, `ParticipantLeft`, `RemoteStreamAvailable`, `RemoteStreamLost`
- **Connection health** — `PeerConnectionStateChanged`
- **State machine** — `StateChanged`
- **Errors** — `Error` (async failures surfaced from the pipeline)

Consume them via `service.events$` (all consumers) or via the Angular derived streams (`state$`, `localStream$`, `remoteStreams$`).

---

## New error: `CallJoinTimeoutError`

Because `takeCall` in v2 waits for the actual join to complete, it can now time out. Configure with `TakeCallOptions.joinTimeoutMs` (default 30 000 ms). Catch `CallJoinTimeoutError` if you want to distinguish it from other rejection paths.

```ts
import { CallJoinTimeoutError } from 'easy-call-js';

try {
  await service.takeCall(participantId, callId, { joinTimeoutMs: 15_000 });
} catch (err) {
  if (err instanceof CallJoinTimeoutError) {
    // show "unable to join" UI
  } else {
    throw err;
  }
}
```

---

## Removed exports

- `CallParam`, `TriggerCallParam`, `LaunchParam` — removed; `startCall` takes `(issuerId, users)` directly
- `initializeCall`, `launchCall` — merged into `startCall`
- `IVideoUIService` — moved out of the core; use `DomVideoBinder` (or your own event subscriber)
- `UIConfig` — moved to `easy-call-js/dom`
- `handleLeaveCall`, `removeParticipantVideo` — replaced by `events$`
- `trackCall` — renamed to `trackIncomingCalls`
