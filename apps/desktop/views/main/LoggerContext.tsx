import { type Logger, createNoopLogger } from "@spectrum/logger"
import {
  type ReactElement,
  type ReactNode,
  createContext,
  useContext,
} from "react"

/** Default is a no-op logger; the real webview logger is injected by `LoggerProvider`. */
export const LoggerContext = createContext<Logger>(createNoopLogger())

export type LoggerProviderProps = {
  readonly logger: Logger
  readonly children: ReactNode
}

/** Injects the webview logger so components/hooks consume it via `useLogger()`. */
export const LoggerProvider = ({
  logger,
  children,
}: LoggerProviderProps): ReactElement => (
  <LoggerContext.Provider value={logger}>{children}</LoggerContext.Provider>
)

/** Read the injected webview `Logger` (defaults to a no-op when no provider is mounted). */
export const useLogger = (): Logger => useContext(LoggerContext)
