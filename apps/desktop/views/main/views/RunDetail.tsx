import { type RunState, initialRunState, reduce } from "@launchkit/agent-events"
import type { SessionId } from "@launchkit/types"
import { EmptyState, RunView, Spinner } from "@launchkit/ui"
import { type ReactElement, useEffect, useState } from "react"
import { useStore } from "zustand"
import { useIpcClient } from "../IpcClientContext"
import type { RunnerClient } from "../runner/runnerClient"
import { useStores } from "../stores/createStores"

export type RunDetailProps = {
  readonly mode: "live" | "replay"
  readonly sessionId: SessionId
  readonly runnerClient: RunnerClient
}

/** Live conversation: owns the runner socket attach + per-frame reduce. */
const LiveRunDetail = ({
  sessionId,
  runnerClient,
}: {
  readonly sessionId: SessionId
  readonly runnerClient: RunnerClient
}): ReactElement => {
  const store = useStores().runView
  const runState = useStore(store, (s) => s.byId[sessionId])
  const openSubId = useStore(store, (s) => s.openSubBySession[sessionId])
  const busy = useStore(store, (s) => s.busyBySession[sessionId] ?? false)
  const applyEvent = useStore(store, (s) => s.applyEvent)
  const openSub = useStore(store, (s) => s.openSub)
  const closeSub = useStore(store, (s) => s.closeSub)

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
      busy={busy}
    />
  )
}

/** Read-only replay: fold the stored events once; composer + approvals inert. */
const ReplayRunDetail = ({
  sessionId,
}: {
  readonly sessionId: SessionId
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
      inert
    />
  )
}

/**
 * The native conversation detail. `RunDetail` owns ALL data: live mode connects
 * the runner WS client (attach + reduce each frame into `runViewStore`); replay
 * mode folds `getRunEvents` once and renders read-only. The dumb `RunView` only
 * receives props. Mirrors the `TerminalPane` live/replay duality.
 */
export const RunDetail = ({
  mode,
  sessionId,
  runnerClient,
}: RunDetailProps): ReactElement =>
  mode === "live" ? (
    <LiveRunDetail sessionId={sessionId} runnerClient={runnerClient} />
  ) : (
    <ReplayRunDetail sessionId={sessionId} />
  )
