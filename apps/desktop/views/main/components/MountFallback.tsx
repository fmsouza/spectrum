import type { ReactElement } from "react"

/**
 * Last-resort UI when `mount()` fails or times out (renderer alive, but startup
 * IPC/connection failed). Gives the user a manual reload affordance instead of an
 * empty window. The dead-renderer case is handled bun-side (renderer watchdog).
 */
export const MountFallback = ({
  message,
  onReload,
}: {
  readonly message: string
  readonly onReload: () => void
}): ReactElement => (
  <div
    role="alert"
    style={{
      display: "flex",
      flexDirection: "column",
      gap: "12px",
      alignItems: "center",
      justifyContent: "center",
      height: "100vh",
      padding: "16px",
      textAlign: "center",
    }}
  >
    <strong>Spectrum couldn't finish loading.</strong>
    <span>{message}</span>
    <button type="button" onClick={onReload}>
      Reload
    </button>
  </div>
)
