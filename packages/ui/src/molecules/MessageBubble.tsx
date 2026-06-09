import type { ReactElement } from "react"

export type MessageBubbleProps = {
  readonly text: string
}

export const MessageBubble = ({ text }: MessageBubbleProps): ReactElement => (
  <div className="lk-message-bubble" data-role="assistant">
    {text}
  </div>
)
