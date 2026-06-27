import type {
  Question,
  QuestionAnswer,
  QuestionItem,
} from "@spectrum/agent-events"
import { type ReactElement, useRef, useState } from "react"
import { Button } from "../atoms/Button"

export type QuestionCardProps = {
  readonly item: QuestionItem
  readonly onAnswer: (answer: QuestionAnswer) => void
  /** Replay / sub-runner: render resolved state only, no inputs. */
  readonly inert?: boolean
}

type Draft = { labels: string[]; freeText: string }

/** A step is answered when it has >=1 selected label, OR non-empty free text
 * (only when the question allows it), OR has no options and no free text
 * (degenerate but schema-valid — treat as answered so it never blocks). */
export const isAnswered = (draft: Draft, question: Question): boolean => {
  if (draft.labels.length > 0) return true
  if (question.allowFreeText && draft.freeText.trim().length > 0) return true
  if (question.options.length === 0 && !question.allowFreeText) return true
  return false
}

export const allAnswered = (
  drafts: readonly Draft[],
  questions: readonly Question[],
): boolean => drafts.every((d, i) => isAnswered(d, questions[i] as Question))

const selectionText = (
  answer: QuestionAnswer,
  questionIndex: number,
): string => {
  const sel = answer.selections.find((s) => s.questionIndex === questionIndex)
  if (sel === undefined) return "—"
  const parts = [...sel.labels, ...(sel.freeText ? [sel.freeText] : [])]
  return parts.length > 0 ? parts.join(", ") : "—"
}

export const QuestionCard = ({
  item,
  onAnswer,
  inert = false,
}: QuestionCardProps): ReactElement => {
  const [drafts, setDrafts] = useState<readonly Draft[]>(
    item.prompt.questions.map(() => ({ labels: [], freeText: "" })),
  )
  const [step, setStep] = useState(0)
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])

  if (item.answer !== undefined) {
    const answer = item.answer
    return (
      <div className="lk-question" data-resolved>
        {item.prompt.questions.map((q, qi) => (
          <div
            className="lk-question__resolved-q"
            key={`${item.requestId}-${qi}`}
          >
            <p className="lk-question__text">{q.question}</p>
            <p className="lk-question__resolved-answer">
              {selectionText(answer, qi)}
            </p>
          </div>
        ))}
      </div>
    )
  }

  const setDraft = (qi: number, next: Draft): void =>
    setDrafts((prev) => prev.map((d, i) => (i === qi ? next : d)))

  const toggle = (qi: number, label: string, multi: boolean): void => {
    const d = drafts[qi] as Draft
    const has = d.labels.includes(label)
    const labels = multi
      ? has
        ? d.labels.filter((l) => l !== label)
        : [...d.labels, label]
      : [label]
    setDraft(qi, { ...d, labels })
  }

  const submit = (): void => {
    const selections = item.prompt.questions.map((_, qi) => {
      const d = drafts[qi] as Draft
      const free = d.freeText.trim()
      return {
        questionIndex: qi,
        labels: d.labels,
        ...(free.length > 0 ? { freeText: free } : {}),
      }
    })
    onAnswer({ selections })
  }

  const questions = item.prompt.questions
  const last = questions.length - 1
  const current = questions[step] as Question

  const tabState = (qi: number): "current" | "answered" | "todo" => {
    if (qi === step) return "current"
    return isAnswered(drafts[qi] as Draft, questions[qi] as Question)
      ? "answered"
      : "todo"
  }

  return (
    <div className="lk-question" data-wizard>
      <div
        className="lk-question__tabs"
        role="tablist"
        aria-label="Questions"
        onKeyDown={(event) => {
          // WAI-ARIA Tabs keyboard pattern: ArrowLeft / ArrowRight wrap between
          // tabs; Home / End jump to the first / last tab. Skip the handler if a
          // modifier key is held so we never hijack browser shortcuts.
          if (event.altKey || event.ctrlKey || event.metaKey) return
          const n = questions.length
          const moveTo = (next: number): void => {
            const wrapped = ((next % n) + n) % n
            setStep(wrapped)
            tabRefs.current[wrapped]?.focus()
          }
          switch (event.key) {
            case "ArrowRight":
              moveTo(step + 1)
              event.preventDefault()
              return
            case "ArrowLeft":
              moveTo(step - 1)
              event.preventDefault()
              return
            case "Home":
              moveTo(0)
              event.preventDefault()
              return
            case "End":
              moveTo(n - 1)
              event.preventDefault()
              return
            default:
              return
          }
        }}
      >
        {questions.map((q, qi) => (
          <button
            type="button"
            key={`${item.requestId}-tab-${qi}`}
            id={`${item.requestId}-tab-${qi}`}
            role="tab"
            aria-selected={qi === step}
            aria-controls={`${item.requestId}-panel-${qi}`}
            tabIndex={qi === step ? 0 : -1}
            ref={(el) => {
              tabRefs.current[qi] = el
            }}
            data-state={tabState(qi)}
            className="lk-question__tab"
            title={`${qi + 1}. ${q.header}`}
            disabled={inert}
            onClick={() => setStep(qi)}
          >
            <span className="lk-question__tab-label">{`${qi + 1}. ${q.header}`}</span>
            {tabState(qi) === "answered" ? (
              <span className="lk-question__tab-check" aria-hidden="true">
                ✓
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {questions.map((q, qi) => (
        <div
          key={`${item.requestId}-panel-${qi}`}
          className="lk-question__step"
          role="tabpanel"
          id={`${item.requestId}-panel-${qi}`}
          aria-labelledby={`${item.requestId}-tab-${qi}`}
          hidden={qi !== step}
        >
          <fieldset className="lk-question__q">
            <legend className="lk-question__header">{q.header}</legend>
            <p className="lk-question__text">{q.question}</p>
            {q.options.map((o) => (
              <label className="lk-question__opt" key={o.label}>
                <input
                  type={q.multiSelect ? "checkbox" : "radio"}
                  name={`${item.requestId}-${qi}`}
                  aria-label={o.label}
                  disabled={inert}
                  checked={(drafts[qi] as Draft).labels.includes(o.label)}
                  onChange={() => toggle(qi, o.label, q.multiSelect)}
                />
                <span className="lk-question__opt-text">
                  <span className="lk-question__opt-label">{o.label}</span>
                  {o.description === undefined ? null : (
                    <span className="lk-question__opt-desc">
                      {o.description}
                    </span>
                  )}
                </span>
              </label>
            ))}
            {q.allowFreeText ? (
              <input
                type="text"
                className="lk-question__other"
                placeholder="Other…"
                aria-label="Other"
                disabled={inert}
                value={(drafts[qi] as Draft).freeText}
                onChange={(e) =>
                  setDraft(qi, {
                    ...(drafts[qi] as Draft),
                    freeText: e.target.value,
                  })
                }
              />
            ) : null}
          </fieldset>
        </div>
      ))}

      <div className="lk-question__nav">
        {questions.length > 1 ? (
          <Button
            variant="secondary"
            disabled={inert || step === 0}
            onClick={() => setStep(Math.max(0, step - 1))}
          >
            Back
          </Button>
        ) : null}
        {step < last ? (
          <Button
            variant="primary"
            disabled={inert || !isAnswered(drafts[step] as Draft, current)}
            onClick={() => setStep(step + 1)}
          >
            Next
          </Button>
        ) : (
          <Button
            variant="primary"
            disabled={inert || !allAnswered(drafts, questions)}
            onClick={submit}
          >
            Submit
          </Button>
        )}
      </div>
    </div>
  )
}
