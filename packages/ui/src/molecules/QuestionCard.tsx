import type { QuestionAnswer, QuestionItem } from "@spectrum/agent-events"
import { type ReactElement, useState } from "react"
import { Button } from "../atoms/Button"

export type QuestionCardProps = {
  readonly item: QuestionItem
  readonly onAnswer: (answer: QuestionAnswer) => void
  /** Replay / sub-runner: render resolved state only, no inputs. */
  readonly inert?: boolean
}

type Draft = { labels: string[]; freeText: string }

const summarize = (answer: QuestionAnswer): string =>
  answer.selections
    .map((s) => [...s.labels, ...(s.freeText ? [s.freeText] : [])].join(", "))
    .join(" · ")

export const QuestionCard = ({
  item,
  onAnswer,
  inert = false,
}: QuestionCardProps): ReactElement => {
  const [drafts, setDrafts] = useState<readonly Draft[]>(
    item.prompt.questions.map(() => ({ labels: [], freeText: "" })),
  )

  if (item.answer !== undefined)
    return (
      <div className="lk-question" data-resolved>
        <div className="lk-question__resolved">{summarize(item.answer)}</div>
      </div>
    )

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

  return (
    <div className="lk-question">
      {item.prompt.questions.map((q, qi) => (
        <fieldset className="lk-question__q" key={`${item.requestId}-${qi}`}>
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
              <span className="lk-question__opt-label">{o.label}</span>
              {o.description === undefined ? null : (
                <span className="lk-question__opt-desc">{o.description}</span>
              )}
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
      ))}
      <div className="lk-question__actions">
        <Button variant="primary" disabled={inert} onClick={submit}>
          Submit
        </Button>
      </div>
    </div>
  )
}
