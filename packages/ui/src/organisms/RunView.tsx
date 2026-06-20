import type {
  ApprovalDecision,
  PermissionMode,
  QuestionAnswer,
  RunnerId,
  RunnerState,
} from "@spectrum/agent-events"
import { selectTaskList } from "@spectrum/agent-events"
import type { ModelRoute } from "@spectrum/types"
import { type ReactElement, useEffect, useRef, useState } from "react"
import { TypingIndicator } from "../atoms/TypingIndicator"
import { Composer } from "../molecules/Composer"
import { ConversationTimeline } from "./ConversationTimeline"
import { RunSideRail } from "./RunSideRail"

export type RunViewProps = {
  readonly root: RunnerState
  readonly runners: ReadonlyMap<RunnerId, RunnerState>
  readonly openRunner?: RunnerState
  readonly subBreadcrumb: readonly string[]
  readonly onOpenSubRunner: (id: RunnerId) => void
  readonly onCloseSub: () => void
  readonly onSend: (text: string) => void
  readonly onDecide: (requestId: string, decision: ApprovalDecision) => void
  readonly onAnswer: (requestId: string, answer: QuestionAnswer) => void
  /** Re-run the last user prompt after a failed turn (hidden while busy). */
  readonly onRetry?: (prompt: string) => void
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
  onAnswer,
  onRetry,
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

  // Collapsed state lives here, above RunSideRail's per-sub `key`, so it survives drilling in and out
  // of sub-runners (it resets only when this conversation view unmounts).
  const [railCollapsed, setRailCollapsed] = useState(false)

  const rootList = selectTaskList(root)
  const rootTaskList =
    rootList !== undefined && rootList.total > 0 ? rootList : undefined
  const subList =
    openRunner === undefined ? undefined : selectTaskList(openRunner)
  const subTaskList =
    subList !== undefined && subList.total > 0 ? subList : undefined

  return (
    <div
      className="lk-run-view"
      data-sub-open={openRunner !== undefined || rootTaskList !== undefined}
    >
      <section className="lk-run-view__main">
        <div className="lk-run-view__scroll" ref={scrollRef}>
          {root.error !== undefined ? (
            <div className="lk-run-error" role="alert">
              <span className="lk-run-error__icon" aria-hidden>
                !
              </span>
              <div className="lk-run-error__body">
                <p className="lk-run-error__title">Runner errored</p>
                <p className="lk-run-error__detail">{root.error}</p>
              </div>
            </div>
          ) : null}
          <ConversationTimeline
            runner={root}
            runners={runners}
            onOpenSubRunner={onOpenSubRunner}
            onDecide={onDecide}
            onAnswer={onAnswer}
            {...(onRetry !== undefined && !busy ? { onRetry } : {})}
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
      <RunSideRail
        key={openRunner?.id ?? "root"}
        {...(rootTaskList === undefined ? {} : { rootTaskList })}
        {...(openRunner === undefined ? {} : { subRunner: openRunner })}
        {...(subTaskList === undefined ? {} : { subTaskList })}
        runners={runners}
        subBreadcrumb={subBreadcrumb}
        onOpenSubRunner={onOpenSubRunner}
        onCloseSub={onCloseSub}
        collapsed={railCollapsed}
        onToggleCollapsed={() => setRailCollapsed((c) => !c)}
      />
    </div>
  )
}
