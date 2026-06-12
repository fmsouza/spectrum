import type { ReactElement } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"

export type MessageBubbleProps = {
  readonly text: string
  /** Message author. Named `author` (not `role`) so it isn't mistaken for the ARIA `role` attribute. */
  readonly author?: "user" | "assistant"
  /** Set when the message carries a turn error (e.g. a provider failure) — renders the error state. */
  readonly tone?: "error"
}

/**
 * A chat message. `author` drives alignment (user → right, assistant → left) via `data-role`. An error
 * `tone` renders the bubble in its error state (red, `role="alert"`). The body is rendered as
 * GitHub-flavored Markdown into React elements (no innerHTML — CSP-safe). Links are made inert: a
 * same-window navigation would unload this SPA webview, so they render but do not navigate.
 */
export const MessageBubble = ({
  text,
  author = "assistant",
  tone,
}: MessageBubbleProps): ReactElement => (
  <div
    className="lk-message-bubble"
    data-role={author}
    {...(tone === "error" ? { "data-tone": "error", role: "alert" } : {})}
  >
    <div className="lk-markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => (
            <a href={href} title={href} onClick={(e) => e.preventDefault()}>
              {children}
            </a>
          ),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  </div>
)
