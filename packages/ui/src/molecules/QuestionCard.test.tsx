import { describe, expect, it } from "bun:test"
import type { QuestionItem } from "@spectrum/agent-events"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { QuestionCard } from "./QuestionCard"

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
