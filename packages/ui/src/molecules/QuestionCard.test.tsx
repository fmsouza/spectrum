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
})
