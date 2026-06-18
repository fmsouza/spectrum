import { type RunState, initialRunState, reduce } from "@spectrum/agent-events"
import type { HarnessId, ModelId, ModelRoute, SessionId } from "@spectrum/types"
import { EmptyState, RunView, Spinner } from "@spectrum/ui"
import { type ReactElement, useEffect, useState } from "react"
import { useStore } from "zustand"
import { useIpcClient } from "../IpcClientContext"
import type { RunnerClient } from "../runner/runnerClient"
import { useStores } from "../stores/createStores"

export type RunDetailProps = {
  readonly mode: "live" | "replay"
  readonly sessionId: SessionId
  readonly runnerClient: RunnerClient
  /** The session's harness, used to persist per-harness composer prefs. Absent in replay. */
  readonly harnessId?: HarnessId
  /** All model routes, so the composer can render a picker. Absent = no picker. */
  readonly models?: readonly ModelRoute[]
  /** Map of providerId -> human name, used to label the model picker. */
  readonly providerNames?: Readonly<Record<string, string>>
}

/** Live conversation: owns the runner socket attach + per-frame reduce. */
const LiveRunDetail = ({
  sessionId,
  runnerClient,
  harnessId,
  models,
  providerNames,
}: {
  readonly sessionId: SessionId
  readonly runnerClient: RunnerClient
  readonly harnessId?: HarnessId
  readonly models?: readonly ModelRoute[]
  readonly providerNames?: Readonly<Record<string, string>>
}): ReactElement => {
  const client = useIpcClient()
  const store = useStores().runView
  const runState = useStore(store, (s) => s.byId[sessionId])
  const openSubId = useStore(store, (s) => s.openSubBySession[sessionId])
  const busy = useStore(store, (s) => s.busyBySession[sessionId] ?? false)
  const mode = useStore(store, (s) => s.modeBySession[sessionId] ?? "manual")
  const model = useStore(store, (s) => s.modelBySession[sessionId] ?? "")
  const applyEvent = useStore(store, (s) => s.applyEvent)
  const openSub = useStore(store, (s) => s.openSub)
  const closeSub = useStore(store, (s) => s.closeSub)
  const setMode = useStore(store, (s) => s.setMode)
  const setModelStore = useStore(store, (s) => s.setModel)

  // Register the per-session listener and attach once. The store accumulates the
  // RunState; this effect owns the only socket coupling on the page.
  useEffect(() => {
    runnerClient.onEvent(sessionId, (e) => applyEvent(sessionId, e.event))
    runnerClient.attach(sessionId)
  }, [sessionId, runnerClient, applyEvent])

  const state = runState ?? initialRunState
  const root =
    state.rootRunnerId === undefined
      ? undefined
      : state.runners.get(state.rootRunnerId)
  if (root === undefined)
    return (
      <EmptyState title="Starting…" hint="Waiting for the agent to begin." />
    )

  const openRunner =
    openSubId === undefined ? undefined : state.runners.get(openSubId)
  const breadcrumb = [root.title ?? "main", openRunner?.title ?? "sub-runner"]

  return (
    <RunView
      root={root}
      runners={state.runners}
      {...(openRunner === undefined ? {} : { openRunner })}
      subBreadcrumb={breadcrumb}
      onOpenSubRunner={(rid) => openSub(sessionId, rid)}
      onCloseSub={() => closeSub(sessionId)}
      onSend={(text) => runnerClient.send(sessionId, text)}
      onDecide={(requestId, decision) =>
        runnerClient.approve(sessionId, requestId, decision)
      }
      onAnswer={(requestId, answer) =>
        runnerClient.answer(sessionId, requestId, answer)
      }
      onInterrupt={() => runnerClient.interrupt(sessionId)}
      busy={busy}
      mode={mode}
      onModeChange={(m) => {
        setMode(sessionId, m)
        runnerClient.setMode(sessionId, m)
        // Remember this harness's last-used mode so the next session of it starts here.
        if (harnessId !== undefined)
          void client.updateHarnessPrefs({ harnessId, mode: m })
      }}
      model={model}
      {...(models === undefined ? {} : { models })}
      {...(providerNames === undefined ? {} : { providerNames })}
      onModelChange={(modelId) => {
        setModelStore(sessionId, modelId)
        // The runner seam takes a real ModelId — only forward real picks; the
        // "" (default) sentinel is a no-op over the socket for now. Persistence
        // still records "" so the next launch of this harness starts default.
        if (modelId !== "") {
          runnerClient.setModel(sessionId, modelId as ModelId)
        }
        if (harnessId !== undefined)
          void client.updateHarnessPrefs({ harnessId, modelId })
      }}
    />
  )
}

/** Read-only replay: fold the stored events once; composer + approvals inert. */
const ReplayRunDetail = ({
  sessionId,
  models,
  providerNames,
}: {
  readonly sessionId: SessionId
  readonly models?: readonly ModelRoute[]
  readonly providerNames?: Readonly<Record<string, string>>
}): ReactElement => {
  const client = useIpcClient()
  const [state, setState] = useState<RunState | undefined>(undefined)
  const [openSubId, setOpenSubId] =
    useState<RunState["rootRunnerId"]>(undefined)

  useEffect(() => {
    let active = true
    void client.getRunEvents({ id: sessionId }).then((r) => {
      if (!active || !r.ok) return
      setState(
        r.value.events.reduce(
          (acc, ev) => reduce(acc, ev.event),
          initialRunState,
        ),
      )
    })
    return () => {
      active = false
    }
  }, [client, sessionId])

  if (state === undefined) return <Spinner label="Loading conversation" />
  const root =
    state.rootRunnerId === undefined
      ? undefined
      : state.runners.get(state.rootRunnerId)
  if (root === undefined)
    return (
      <EmptyState
        title="No recorded conversation"
        hint="This session has no captured agent events."
      />
    )
  const openRunner =
    openSubId === undefined ? undefined : state.runners.get(openSubId)
  const breadcrumb = [root.title ?? "main", openRunner?.title ?? "sub-runner"]

  return (
    <RunView
      root={root}
      runners={state.runners}
      {...(openRunner === undefined ? {} : { openRunner })}
      subBreadcrumb={breadcrumb}
      onOpenSubRunner={(rid) => setOpenSubId(rid)}
      onCloseSub={() => setOpenSubId(undefined)}
      onSend={() => {}}
      onDecide={() => {}}
      onAnswer={() => {}}
      inert
      {...(models === undefined ? {} : { models })}
      {...(providerNames === undefined ? {} : { providerNames })}
    />
  )
}

/**
 * The native conversation detail. `RunDetail` owns ALL data: live mode connects
 * the runner WS client (attach + reduce each frame into `runViewStore`); replay
 * mode folds `getRunEvents` once and renders read-only. The dumb `RunView` only
 * receives props.
 */
export const RunDetail = ({
  mode,
  sessionId,
  runnerClient,
  harnessId,
  models,
  providerNames,
}: RunDetailProps): ReactElement =>
  mode === "live" ? (
    <LiveRunDetail
      sessionId={sessionId}
      runnerClient={runnerClient}
      {...(harnessId === undefined ? {} : { harnessId })}
      {...(models === undefined ? {} : { models })}
      {...(providerNames === undefined ? {} : { providerNames })}
    />
  ) : (
    <ReplayRunDetail
      sessionId={sessionId}
      {...(models === undefined ? {} : { models })}
      {...(providerNames === undefined ? {} : { providerNames })}
    />
  )
