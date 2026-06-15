import {
  Component,
  type ContextType,
  type ErrorInfo,
  type ReactNode,
} from "react"
import { LoggerContext } from "./LoggerContext"

type ErrorBoundaryProps = {
  readonly children: ReactNode
}
type ErrorBoundaryState = {
  readonly error: Error | null
}

/**
 * Contains a render/effect crash in one page so it can't tear down the whole app
 * (which would also kill the shared Electroview → IPC). Renders the error visibly
 * so the exact message/stack is observable without a webview inspector. The rest
 * of the shell (nav, other pages, IPC) keeps working.
 */
export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  override state: ErrorBoundaryState = { error: null }

  static override contextType = LoggerContext
  declare context: ContextType<typeof LoggerContext>

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // Forward to the webview logger; it persists error/fatal to the main-process
    // log file. The on-screen panel below remains the primary visible signal.
    this.context.error("page error", {
      name: error.name,
      message: error.message,
      stack: info.componentStack ?? error.stack ?? undefined,
    })
  }

  override render(): ReactNode {
    const { error } = this.state
    if (error !== null) {
      return (
        <div
          role="alert"
          style={{
            padding: "16px",
            margin: "16px",
            border: "2px solid #c0392b",
            borderRadius: "8px",
            background: "#2a1a1a",
            color: "#ffd7d0",
            fontFamily: "ui-monospace, monospace",
            fontSize: "13px",
            whiteSpace: "pre-wrap",
            overflow: "auto",
          }}
        >
          <strong>This page crashed:</strong>
          {`\n\n${error.name}: ${error.message}\n\n${error.stack ?? "(no stack)"}`}
        </div>
      )
    }
    return this.props.children
  }
}
