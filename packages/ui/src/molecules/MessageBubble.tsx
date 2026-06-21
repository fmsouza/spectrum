import { type ReactElement, useId } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"

export type MessageBubbleProps = {
  readonly text: string
  /** Message author. Named `author` (not `role`) so it isn't mistaken for the ARIA `role` attribute. */
  readonly author?: "user" | "assistant"
  /** Set when the message carries a turn error (e.g. a provider failure) — renders the error state. */
  readonly tone?: "error"
  /** When the turn failed (tone="error"), fires to re-run the prompt. */
  readonly onRetry?: () => void
  /**
   * Open a link in the OS default browser. When provided, a left-click on a link calls this with the
   * link's href; `preventDefault()` always runs so the SPA webview never navigates in-window. When
   * omitted, links render but do nothing on click (the legacy inert behavior) — callers that don't
   * need external-link handling can ignore this prop.
   */
  readonly onOpenLink?: (url: string) => void
}

/**
 * A chat message. `author` drives alignment (user → right, assistant → left) via `data-role`. An error
 * `tone` renders the bubble in its error state (red, `role="alert"`). The body is rendered as
 * GitHub-flavored Markdown into React elements (no innerHTML — CSP-safe). Links always prevent
 * default (a same-window navigation would unload this SPA webview); when `onOpenLink` is wired,
 * the click is routed to the OS browser instead of navigating in-window.
 */
export const MessageBubble = ({
  text,
  author = "assistant",
  tone,
  onRetry,
  onOpenLink,
}: MessageBubbleProps): ReactElement => {
  const msgId = useId()
  return (
    <div
      className="lk-message-bubble"
      data-role={author}
      {...(tone === "error" ? { "data-tone": "error", role: "alert" } : {})}
    >
      <div id={msgId} className="lk-markdown">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            // react-markdown types `href` as `string | undefined`; guard so onOpenLink is never
            // called with undefined (react-markdown emits `undefined` for `[text]()` with an empty url).
            a: ({ href, children }) => (
              <a
                href={href}
                title={href}
                onClick={(e) => {
                  // ALWAYS preventDefault: a same-window navigation would unload this SPA webview.
                  // When onOpenLink is wired, route the click to the OS browser instead.
                  e.preventDefault()
                  if (href !== undefined && onOpenLink !== undefined) {
                    onOpenLink(href)
                  }
                }}
              >
                {children}
              </a>
            ),
          }}
        >
          {text}
        </ReactMarkdown>
      </div>
      {tone === "error" && onRetry !== undefined ? (
        <button
          type="button"
          className="lk-message-bubble__retry"
          aria-describedby={msgId}
          onClick={() => onRetry()}
        >
          Retry
        </button>
      ) : null}
    </div>
  )
}
