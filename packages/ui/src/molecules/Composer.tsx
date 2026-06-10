import { type KeyboardEvent, type ReactElement, useState } from "react"
import { Button } from "../atoms/Button"

export type ComposerProps = {
  readonly onSend: (text: string) => void
  readonly disabled?: boolean
}

export const Composer = ({
  onSend,
  disabled = false,
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
      <Button variant="primary" disabled={disabled} onClick={() => submit()}>
        Send
      </Button>
    </div>
  )
}
