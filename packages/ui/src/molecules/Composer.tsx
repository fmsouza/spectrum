import { type ReactElement, useState } from "react"
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
  return (
    <div className="lk-composer">
      <textarea
        className="lk-composer__input"
        value={text}
        disabled={disabled}
        placeholder="Send a message"
        onChange={(e) => setText(e.target.value)}
      />
      <Button variant="primary" disabled={disabled} onClick={() => submit()}>
        Send
      </Button>
    </div>
  )
}
