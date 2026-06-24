import type { ReactElement } from "react"

/** Brief overlay shown while the webview self-reloads after a detected wake/connection loss. */
export const ConnectionLostOverlay = (): ReactElement => (
  <div
    role="alert"
    style={{
      position: "fixed",
      inset: 0,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "rgba(0,0,0,0.6)",
      color: "#fff",
      zIndex: 9999,
    }}
  >
    Reconnecting…
  </div>
)
