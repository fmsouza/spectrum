import { describe, expect, it } from "bun:test"
import type { Question, QuestionItem } from "@spectrum/agent-events"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { QuestionCard, allAnswered, isAnswered } from "./QuestionCard"

const item: QuestionItem = {
  kind: "question",
  requestId: "q1",
  prompt: {
    questions: [
      {
        question: "Which library?",
        header: "Library",
        options: [
          { label: "date-fns", description: "lightweight" },
          { label: "day.js", description: "tiny" },
        ],
        multiSelect: false,
        allowFreeText: true,
      },
    ],
  },
}

describe("QuestionCard", () => {
  it("renders the question, header and options", () => {
    render(<QuestionCard item={item} onAnswer={() => {}} />)
    expect(screen.getByText("Which library?")).toBeInTheDocument()
    expect(screen.getByText("Library")).toBeInTheDocument()
    expect(screen.getByText("date-fns")).toBeInTheDocument()
    cleanup()
  })

  it("submits the selected option as an index-keyed answer", () => {
    let got: unknown
    render(
      <QuestionCard
        item={item}
        onAnswer={(a) => {
          got = a
        }}
      />,
    )
    fireEvent.click(screen.getByLabelText("date-fns"))
    fireEvent.click(screen.getByRole("button", { name: /submit/i }))
    expect(got).toEqual({
      selections: [{ questionIndex: 0, labels: ["date-fns"] }],
    })
    cleanup()
  })

  it("disables inputs when inert and unanswered", () => {
    render(<QuestionCard item={item} onAnswer={() => {}} inert />)
    expect(screen.getByLabelText("date-fns")).toBeDisabled()
    expect(screen.getByRole("button", { name: /submit/i })).toBeDisabled()
    cleanup()
  })

  it("includes the free-text Other value in the submitted answer", () => {
    let got: unknown
    render(
      <QuestionCard
        item={item}
        onAnswer={(a) => {
          got = a
        }}
      />,
    )
    fireEvent.click(screen.getByLabelText("date-fns"))
    fireEvent.change(screen.getByLabelText("Other"), {
      target: { value: "moment" },
    })
    fireEvent.click(screen.getByRole("button", { name: /submit/i }))
    expect(got).toEqual({
      selections: [
        { questionIndex: 0, labels: ["date-fns"], freeText: "moment" },
      ],
    })
    cleanup()
  })

  it("shows the resolved answer (inert) when already answered", () => {
    render(
      <QuestionCard
        item={{
          ...item,
          answer: { selections: [{ questionIndex: 0, labels: ["day.js"] }] },
        }}
        onAnswer={() => {}}
      />,
    )
    expect(screen.getByText(/day\.js/)).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /submit/i })).toBeNull()
    cleanup()
  })

  it("shows the original question text and the chosen answer in the resolved state", () => {
    const q = item.prompt.questions[0]
    const answered = {
      ...item,
      answer: {
        selections: [
          { questionIndex: 0, labels: [q?.options[0]?.label ?? ""] },
        ],
      },
    }
    render(<QuestionCard item={answered} onAnswer={() => {}} />)
    // The question is echoed so it stays clear what was asked.
    expect(screen.getByText(q?.question ?? "")).toBeInTheDocument()
    // The chosen answer is shown.
    expect(
      screen.getByText(new RegExp(q?.options[0]?.label ?? "")),
    ).toBeInTheDocument()
    cleanup()
  })

  it("shows a free-text answer in the resolved state", () => {
    const q = item.prompt.questions[0]
    const answered = {
      ...item,
      answer: {
        selections: [
          { questionIndex: 0, labels: [], freeText: "custom reply" },
        ],
      },
    }
    render(<QuestionCard item={answered} onAnswer={() => {}} />)
    expect(screen.getByText(q?.question ?? "")).toBeInTheDocument()
    expect(screen.getByText("custom reply")).toBeInTheDocument()
    cleanup()
  })

  it("groups each option's label and description in one stacking container, separate from the radio", () => {
    render(<QuestionCard item={item} onAnswer={() => {}} />)
    const label = screen.getByText(
      item.prompt.questions[0]?.options[0]?.label ?? "",
    )
    const wrapper = label.closest(".lk-question__opt-text")
    expect(wrapper).not.toBeNull()
    // The description (if any) lives in the SAME wrapper as the label…
    const desc = item.prompt.questions[0]?.options[0]?.description
    if (desc !== undefined)
      expect(wrapper).toContainElement(screen.getByText(desc))
    // …and the radio/checkbox is NOT inside that text wrapper (it stays beside it).
    const opt = label.closest(".lk-question__opt")
    expect(
      opt?.querySelector("input")?.closest(".lk-question__opt-text"),
    ).toBeNull()
    cleanup()
  })
})

describe("QuestionCard helpers", () => {
  const multiOpt: Question = {
    question: "q",
    header: "h",
    options: [{ label: "a" }, { label: "b" }],
    multiSelect: false,
    allowFreeText: false,
  }
  const freeTextOnly: Question = {
    question: "q",
    header: "h",
    options: [],
    multiSelect: false,
    allowFreeText: true,
  }
  const empty: Question = {
    question: "q",
    header: "h",
    options: [],
    multiSelect: false,
    allowFreeText: false,
  }

  it("isAnswered is false when no labels and no free text", () => {
    expect(isAnswered({ labels: [], freeText: "" }, multiOpt)).toBe(false)
  })

  it("isAnswered is true when a label is selected", () => {
    expect(isAnswered({ labels: ["a"], freeText: "" }, multiOpt)).toBe(true)
  })

  it("isAnswered is true when free text is present and allowed", () => {
    expect(isAnswered({ labels: [], freeText: "custom" }, freeTextOnly)).toBe(
      true,
    )
  })

  it("isAnswered ignores free text when allowFreeText is false", () => {
    expect(isAnswered({ labels: [], freeText: "custom" }, multiOpt)).toBe(false)
  })

  it("isAnswered treats a question with no options and no free text as answered by default", () => {
    expect(isAnswered({ labels: [], freeText: "" }, empty)).toBe(true)
  })

  it("allAnswered is true only when every question is answered", () => {
    const qs = [multiOpt, freeTextOnly] as const
    expect(
      allAnswered(
        [
          { labels: [], freeText: "" },
          { labels: [], freeText: "x" },
        ],
        qs,
      ),
    ).toBe(false)
    expect(
      allAnswered(
        [
          { labels: ["a"], freeText: "" },
          { labels: [], freeText: "x" },
        ],
        qs,
      ),
    ).toBe(true)
  })
})
