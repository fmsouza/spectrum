import { type KeyboardEvent, type ReactElement, useState } from "react"
import { Icon } from "../atoms/Icon"

export type ComposerProps = {
  readonly onSend: (text: string) => void
  readonly disabled?: boolean
  /** A turn is in flight: swap send → stop (the cancel affordance). Typing stays enabled. */
  readonly busy?: boolean
  readonly onInterrupt?: () => void
}

export const Composer = ({
  onSend,
  disabled = false,
  busy = false,
  onInterrupt,
}: ComposerProps): ReactElement => {
  const [text, setText] = useState("")
  const submit = (): void => {
    const trimmed = text.trim()
    if (trimmed === "") return
    onSend(trimmed)
    setText("")
  }
  // Enter sends; Shift+Enter inserts a newline (the textarea's default, so don't preventDefault there).
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      submit()
    }
  }
  return (
    <div className="lk-composer">
      <textarea
        className="lk-composer__input"
        value={text}
        disabled={disabled}
        placeholder="Send a message  (Enter to send · Shift+Enter for newline)"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
      />
      <div className="lk-composer__bar">
        {busy ? (
          <button
            type="button"
            className="lk-composer__action"
            data-action="stop"
            aria-label="Stop run"
            onClick={() => onInterrupt?.()}
          >
            <Icon name="stop" size={14} />
          </button>
        ) : (
          <button
            type="button"
            className="lk-composer__action"
            data-action="send"
            aria-label="Send message"
            disabled={disabled || text.trim() === ""}
            onClick={() => submit()}
          >
            <Icon name="send" size={14} />
          </button>
        )}
      </div>
    </div>
  )
}
