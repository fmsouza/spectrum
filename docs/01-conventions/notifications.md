# Notifications convention

Spectrum surfaces user-facing outcomes through one small **notifications engine**. A notification is
*feedback*: it tells the user what just happened to an action they took (or to an important
background event) — it never drives control flow. Control flow is still the `Result<T, E>` a
function returns; the toast sits *alongside* it, exactly as a log line does (see `logging.md`).

This is the canonical rule. Surface user-facing failures here; do not swallow a failed `Result`
silently.

## The two surfaces

| Surface                  | When                                                                                                  |
| ------------------------ | ----------------------------------------------------------------------------------------------------- |
| In-app **toast** (primary) | Default for everything the user can see right now — action failures, brief destructive-action success. |
| **Native OS notification** | Important **background** events only, and only when the window is **unfocused** (focus-aware).        |

The toast is the primary surface. The native notification is a focus-aware backstop for events the
user would otherwise miss because the window isn't in front of them — today, a background run
finishing/failing. When the window *is* focused, the in-app toast already covers it, so the native
one is suppressed (`createNotificationService` returns early when `isWindowFocused()` is true).

```ts
// apps/desktop/src/gui/notification-service.ts — native fires ONLY when unfocused
onRunFinished: (event) => {
  if (deps.isWindowFocused()) return
  const title = event.status === "errored" ? "Run failed" : "Run finished"
  // …
  deps.showNotification({ title, body })
},
```

## Tone — when to use each

Four tones, from `apps/desktop/views/main/stores/notifications-model.ts`:

| Tone      | Use for                                                            | Dismissal             |
| --------- | ----------------------------------------------------------------- | --------------------- |
| `info`    | Neutral background fact ("A run finished").                        | Auto-dismiss after 5s |
| `success` | A destructive/irreversible action succeeded ("Session deleted").  | Auto-dismiss after 5s |
| `warning` | Recoverable / expected-but-notable condition the user should see. | Sticky                |
| `error`   | A user action failed ("Couldn't delete the session").             | Sticky                |

The auto-dismiss policy is `autoDismissFor(tone)`: `info`/`success` get `5000` ms; `warning`/`error`
return `undefined` (sticky — the user must dismiss, or act on the toast's action). Pick the tone by
the *outcome*, not the event: a background run finishing is `info`; the same run failing is `error`.

## Trigger policy

Notify on:

- **user-action failures** — a `Result` came back `!ok` from something the user triggered; and
- **important background events** — a run the user isn't watching finishes or fails.

Add a **brief success** toast *only* for **destructive / irreversible** actions (delete, reset) so
the user has confirmation the thing is actually gone. Everything else that simply worked stays
silent — **never per-CRUD spam**. Creating a session, saving a setting, toggling a flag: the UI
already reflects success; a toast would be noise.

The pure model enforces two guards so a burst can't flood the stack
(`reduceNotifications` in `notifications-model.ts`):

- **Dedupe** — an identical *visible* `(tone, message)` already on screen is skipped (a retried
  failure won't stack three identical errors).
- **Cap** — at most `MAX_TOASTS` (`4`) are visible; over the cap, the oldest auto-dismissible toast
  is dropped first (falling back to the oldest overall), so a sticky `error` is never silently
  evicted by newer `info` noise.

## Raise toasts at the shell, not in stores

**Stores return `Result`; the page / hook / shell layer decides whether to toast.** A store action
never reaches for `notify` — it stays pure and testable, returning `Result<void, IpcError>`. The
shell that called it inspects the `Result` and raises the toast. This is the Task 6 pattern: the
delete actions return a `Result`, and `app.tsx` toasts on the outcome.

```ts
// apps/desktop/views/main/app.tsx — the SHELL inspects the Result and toasts
const r = await projectsView.deleteSession(sessionId)
if (r.ok) {
  notifications.notify({ tone: "success", message: "Session deleted" })
  // …
} else {
  notifications.notify({
    tone: "error",
    message: "Couldn't delete the session",
    action: { label: "Retry", onClick: () => void projectsView.deleteSession(sessionId) },
  })
}
```

`useNotifications()` is the only entry point a page uses:

```ts
const notifications = useNotifications()
const id = notifications.notify({ tone, message, action }) // returns the toast id
notifications.dismiss(id)
notifications.clear()
```

`notify` takes a `NotificationInput` — `{ tone, message, action? }`, where `action` is an optional
`{ label, onClick }` (e.g. a "Retry" / "View" affordance). The model assigns the id and the
`autoDismissMs`; the page never sets them.

## Suppress when the user is already looking at it

For run events, **don't toast the session the user is currently viewing** — they can already see it.
The background-run handler checks the active view before notifying (Task 7):

```ts
// apps/desktop/views/main/app.tsx — suppress the toast for the session in view
runnerClient.onAny((id, stored) => {
  const ev = stored.event
  if (ev.type !== "runner-finished") return
  if (ev.status === "interrupted") return
  const isViewing = view.kind === "sessions" && view.selectedSessionId === id
  if (isViewing) return // already on screen — no toast
  const action = {
    label: "View",
    onClick: () => navigate({ kind: "sessions", selectedSessionId: id }),
  }
  notifications.notify(
    ev.status === "errored"
      ? { tone: "error", message: "A run failed", action }
      : { tone: "info", message: "A run finished", action },
  )
})
```

`onAny` *accumulates* listeners, so the effect MUST drop its previous listener via the returned
unsubscribe fn on every re-run — otherwise toasts stack. The native counterpart's "don't disturb a
focused user" rule (above) is the same idea at the OS layer.

## Log AND notify at failure sites

A user-facing failure is usually *both* a log line (for the operator) and a toast (for the user).
They are independent: the log records *what happened* for debugging; the toast tells *the user*
what to do about it. At a failure site that the user triggered, do both — log at the boundary
(`logging.md`) and surface a toast at the shell. Never let one stand in for the other, and never let
a failed `Result` fall through with neither.

Keep toast copy user-facing and secret-free: like log fields, a toast message must never carry a raw
secret, a `SecretRef`, or a leak-prone `detail`. The `app.tsx` helpers derive a message from an
`IpcError`'s typed `detail`/`kind` only — never a stack or a value.

## Do / don't

**DO** — return a `Result` from the store; toast at the shell on the outcome:

```ts
const r = await projectsView.deleteProject(projectId)
if (r.ok) notifications.notify({ tone: "success", message: "Project deleted" })
else notifications.notify({ tone: "error", message: "Couldn't delete the project", action })
```

**DO** — give a sticky `error` an action so the user can recover:

```ts
notifications.notify({
  tone: "error",
  message: "Couldn't delete the session",
  action: { label: "Retry", onClick: () => void projectsView.deleteSession(sessionId) },
})
```

**DON'T** — `notify` from inside a store (it couples pure state to UI feedback and breaks dedupe/cap
ownership):

```ts
// store action
deleteSession: async (id) => {
  const r = await client.deleteSession(id)
  notify({ tone: "error", message: "failed" }) // ✗ the shell owns the toast; return the Result
  return r
}
```

**DON'T** — toast every successful CRUD (per-action spam) or the session already in view:

```ts
notifications.notify({ tone: "success", message: "Session created" }) // ✗ not destructive — silent
// inside onAny, with isViewing === true:
notifications.notify({ tone: "info", message: "A run finished" })     // ✗ they're looking at it
```

**DON'T** — swallow a failed `Result` with neither a log nor a toast:

```ts
const r = await projectsView.deleteSession(id)
if (!r.ok) return // ✗ the user is left staring at a silently-failed action
```

## TODO / related

See `logging.md` for the operator-facing half of a failure site. The sibling conventions referenced
by `@spectrum/ui`'s `CLAUDE.md` — `atomic-design.md` and `performance.md` — remain to be backfilled
(out of scope here).
