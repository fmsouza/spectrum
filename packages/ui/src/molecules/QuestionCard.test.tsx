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

  const multi: QuestionItem = {
    kind: "question",
    requestId: "q2",
    prompt: {
      questions: [
        {
          question: "Which provider?",
          header: "Provider",
          options: [{ label: "Anthropic" }, { label: "OpenAI" }],
          multiSelect: false,
          allowFreeText: false,
        },
        {
          question: "Which region?",
          header: "Region",
          options: [{ label: "us" }, { label: "eu" }],
          multiSelect: false,
          allowFreeText: false,
        },
      ],
    },
  }

  it("renders one question at a time with a tab per question when unanswered", () => {
    render(<QuestionCard item={multi} onAnswer={() => {}} />)
    expect(screen.getByText("Which provider?")).toBeInTheDocument()
    expect(screen.queryByText("Which region?")).toBeNull()
    expect(
      screen.getByRole("tab", { name: /1\. Provider/ }),
    ).toBeInTheDocument()
    expect(screen.getByRole("tab", { name: /2\. Region/ })).toBeInTheDocument()
    cleanup()
  })

  it("disables Next until the current question is answered", () => {
    render(<QuestionCard item={multi} onAnswer={() => {}} />)
    expect(screen.getByRole("button", { name: /next/i })).toBeDisabled()
    fireEvent.click(screen.getByLabelText("Anthropic"))
    expect(screen.getByRole("button", { name: /next/i })).toBeEnabled()
    cleanup()
  })

  it("advances to the next question on Next and shows Back", () => {
    render(<QuestionCard item={multi} onAnswer={() => {}} />)
    fireEvent.click(screen.getByLabelText("Anthropic"))
    fireEvent.click(screen.getByRole("button", { name: /next/i }))
    expect(screen.getByText("Which region?")).toBeInTheDocument()
    expect(screen.queryByText("Which provider?")).toBeNull()
    expect(screen.getByRole("button", { name: /back/i })).toBeEnabled()
    cleanup()
  })

  it("disables Back on the first step and shows Submit only on the last step", () => {
    render(<QuestionCard item={multi} onAnswer={() => {}} />)
    expect(screen.getByRole("button", { name: /back/i })).toBeDisabled()
    expect(screen.queryByRole("button", { name: /submit/i })).toBeNull()
    fireEvent.click(screen.getByLabelText("Anthropic"))
    fireEvent.click(screen.getByRole("button", { name: /next/i }))
    fireEvent.click(screen.getByLabelText("us"))
    expect(screen.getByRole("button", { name: /submit/i })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /next/i })).toBeNull()
    cleanup()
  })

  it("marks a tab as answered with a checkmark once its question has a selection", () => {
    render(<QuestionCard item={multi} onAnswer={() => {}} />)
    fireEvent.click(screen.getByLabelText("Anthropic"))
    fireEvent.click(screen.getByRole("button", { name: /next/i }))
    const providerTab = screen.getByRole("tab", { name: /1\. Provider/ })
    expect(providerTab.getAttribute("data-state")).toBe("answered")
    expect(providerTab.querySelector(".lk-question__tab-check")).not.toBeNull()
    cleanup()
  })

  it("clears the checkmark when a previously answered question is cleared", () => {
    // Uses a multiSelect fixture so a checkbox click toggles off (single-select
    // radios do not deselect under the current `toggle`). Navigates AWAY from
    // step 0 before asserting because `tabState` always returns "current" for
    // `qi === step` regardless of answered status.
    const multiSelect: QuestionItem = {
      kind: "question",
      requestId: "q3",
      prompt: {
        questions: [
          {
            question: "Which providers?",
            header: "Providers",
            options: [{ label: "Anthropic" }, { label: "OpenAI" }],
            multiSelect: true,
            allowFreeText: false,
          },
          {
            question: "Which region?",
            header: "Region",
            options: [{ label: "us" }, { label: "eu" }],
            multiSelect: false,
            allowFreeText: false,
          },
        ],
      },
    }
    render(<QuestionCard item={multiSelect} onAnswer={() => {}} />)
    // Step 0: pick Anthropic.
    fireEvent.click(screen.getByLabelText("Anthropic"))
    // Advance to step 1 — tab 0 should be answered + checkmark.
    fireEvent.click(screen.getByRole("button", { name: /next/i }))
    // Go back to step 0, then clear the selection by clicking again (multiSelect).
    fireEvent.click(screen.getByRole("button", { name: /back/i }))
    fireEvent.click(screen.getByLabelText("Anthropic"))
    // Advance away from step 0 so tabState evaluates the answered branch
    // (jump directly via tab click — Next is disabled because step 0 is now empty).
    fireEvent.click(screen.getByRole("tab", { name: /2\. Region/ }))
    const providersTab = screen.getByRole("tab", { name: /1\. Providers/ })
    expect(providersTab.getAttribute("data-state")).toBe("todo")
    expect(providersTab.querySelector(".lk-question__tab-check")).toBeNull()
    cleanup()
  })

  it("jumps directly to a question when its tab is clicked", () => {
    render(<QuestionCard item={multi} onAnswer={() => {}} />)
    fireEvent.click(screen.getByRole("tab", { name: /2\. Region/ }))
    expect(screen.getByText("Which region?")).toBeInTheDocument()
    expect(
      screen
        .getByRole("tab", { name: /2\. Region/ })
        .getAttribute("data-state"),
    ).toBe("current")
    cleanup()
  })

  it("disables Submit on the last step until every question is answered", () => {
    render(<QuestionCard item={multi} onAnswer={() => {}} />)
    fireEvent.click(screen.getByRole("tab", { name: /2\. Region/ }))
    fireEvent.click(screen.getByLabelText("us"))
    expect(screen.getByRole("button", { name: /submit/i })).toBeDisabled() // first still unanswered
    fireEvent.click(screen.getByRole("tab", { name: /1\. Provider/ }))
    fireEvent.click(screen.getByLabelText("Anthropic"))
    fireEvent.click(screen.getByRole("tab", { name: /2\. Region/ }))
    expect(screen.getByRole("button", { name: /submit/i })).toBeEnabled()
    cleanup()
  })

  it("submits a selection per question with correct questionIndex on final Submit", () => {
    let got: unknown
    render(
      <QuestionCard
        item={multi}
        onAnswer={(a) => {
          got = a
        }}
      />,
    )
    fireEvent.click(screen.getByLabelText("Anthropic"))
    fireEvent.click(screen.getByRole("button", { name: /next/i }))
    fireEvent.click(screen.getByLabelText("eu"))
    fireEvent.click(screen.getByRole("button", { name: /submit/i }))
    expect(got).toEqual({
      selections: [
        { questionIndex: 0, labels: ["Anthropic"] },
        { questionIndex: 1, labels: ["eu"] },
      ],
    })
    cleanup()
  })

  it("preserves drafts across Back/Next navigation", () => {
    render(<QuestionCard item={multi} onAnswer={() => {}} />)
    fireEvent.click(screen.getByLabelText("Anthropic"))
    fireEvent.click(screen.getByRole("button", { name: /next/i }))
    fireEvent.click(screen.getByRole("button", { name: /back/i }))
    expect(screen.getByLabelText("Anthropic")).toBeChecked()
    cleanup()
  })

  it("shows only Submit with no Back/Next for a single-question prompt", () => {
    render(<QuestionCard item={item} onAnswer={() => {}} />)
    expect(screen.queryByRole("button", { name: /back/i })).toBeNull()
    expect(screen.queryByRole("button", { name: /next/i })).toBeNull()
    expect(screen.getByRole("button", { name: /submit/i })).toBeInTheDocument()
    cleanup()
  })

  it("still renders the flat resolved list when item.answer is present", () => {
    render(
      <QuestionCard
        item={{
          ...multi,
          answer: {
            selections: [
              { questionIndex: 0, labels: ["OpenAI"] },
              { questionIndex: 1, labels: ["eu"] },
            ],
          },
        }}
        onAnswer={() => {}}
      />,
    )
    expect(screen.getByText("Which provider?")).toBeInTheDocument()
    expect(screen.getByText("Which region?")).toBeInTheDocument()
    expect(screen.queryByRole("tab")).toBeNull()
    expect(screen.queryByRole("button", { name: /submit/i })).toBeNull()
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
