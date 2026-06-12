import type {
  ApprovalDecision,
  PermissionMode,
  RunnerId,
  RunnerState,
} from "@launchkit/agent-events"
import type { ModelRoute } from "@launchkit/types"
import { type ReactElement, useEffect, useRef } from "react"
import { TypingIndicator } from "../atoms/TypingIndicator"
import { Composer } from "../molecules/Composer"
import { ConversationTimeline } from "./ConversationTimeline"
import { SubRunnerPane } from "./SubRunnerPane"

export type RunViewProps = {
  readonly root: RunnerState
  readonly runners: ReadonlyMap<RunnerId, RunnerState>
  readonly openRunner?: RunnerState
  readonly subBreadcrumb: readonly string[]
  readonly onOpenSubRunner: (id: RunnerId) => void
  readonly onCloseSub: () => void
  readonly onSend: (text: string) => void
  readonly onDecide: (requestId: string, decision: ApprovalDecision) => void
  /** Show the typing indicator + keep the feed pinned to the bottom while a turn is in flight. */
  readonly busy?: boolean
  readonly inert?: boolean
  readonly onInterrupt?: () => void
  readonly mode?: PermissionMode
  readonly onModeChange?: (mode: PermissionMode) => void
  /** Current model id, or "" for the default (no-proxy) route. */
  readonly model?: string
  readonly models?: readonly ModelRoute[]
  readonly providerNames?: Readonly<Record<string, string>>
  readonly onModelChange?: (modelId: string) => void
}

/** A length proxy for the feed's content so streaming text (not just new items) triggers autoscroll. */
const contentTick = (root: RunnerState): number => {
  const last = root.items.at(-1)
  const tail =
    last === undefined
      ? 0
      : "text" in last
        ? last.text.length
        : "output" in last && last.output !== undefined
          ? last.output.length
          : 0
  return root.items.length * 1_000_000 + tail
}

export const RunView = ({
  root,
  runners,
  openRunner,
  subBreadcrumb,
  onOpenSubRunner,
  onCloseSub,
  onSend,
  onDecide,
  busy = false,
  inert = false,
  onInterrupt,
  mode,
  onModeChange,
  model,
  models,
  providerNames,
  onModelChange,
}: RunViewProps): ReactElement => {
  const scrollRef = useRef<HTMLDivElement>(null)
  // Autoscroll: pin the feed to the latest message as items stream in (and when the dots appear).
  const tick = contentTick(root)
  // biome-ignore lint/correctness/useExhaustiveDependencies: `tick`/`busy` are the content signal; the ref is stable.
  useEffect(() => {
    const el = scrollRef.current
    if (el !== null) el.scrollTop = el.scrollHeight
  }, [tick, busy])

  return (
    <div className="lk-run-view" data-sub-open={openRunner !== undefined}>
      <section className="lk-run-view__main">
        <div className="lk-run-view__scroll" ref={scrollRef}>
          <ConversationTimeline
            runner={root}
            runners={runners}
            onOpenSubRunner={onOpenSubRunner}
            onDecide={onDecide}
            inert={inert}
          />
          {busy ? <TypingIndicator /> : null}
        </div>
        <Composer
          onSend={onSend}
          disabled={inert}
          busy={busy}
          {...(onInterrupt === undefined ? {} : { onInterrupt })}
          {...(root.supportedModes === undefined
            ? {}
            : { supportedModes: root.supportedModes })}
          {...(mode === undefined ? {} : { mode })}
          {...(onModeChange === undefined ? {} : { onModeChange })}
          {...(model === undefined ? {} : { model })}
          {...(models === undefined ? {} : { models })}
          {...(providerNames === undefined ? {} : { providerNames })}
          {...(onModelChange === undefined ? {} : { onModelChange })}
        />
      </section>
      {openRunner === undefined ? null : (
        <SubRunnerPane
          runner={openRunner}
          runners={runners}
          breadcrumb={subBreadcrumb}
          onOpenSubRunner={onOpenSubRunner}
          onClose={onCloseSub}
        />
      )}
    </div>
  )
}
