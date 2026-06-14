import type { ReactElement } from "react"
import type { UpdateState } from "../stores/updateStore"

export interface UpdateBannerProps {
  readonly state: UpdateState | undefined
  readonly onDownload: () => void
  readonly onRestart: () => void
  readonly onDismiss: () => void
}

/**
 * Dumb startup banner. Renders only when the state says to show it; presents
 * Download -> progress -> Restart now across phases. No fetching -- the page wires
 * intents to the update store.
 */
export const UpdateBanner = ({
  state,
  onDownload,
  onRestart,
  onDismiss,
}: UpdateBannerProps): ReactElement | null => {
  if (state === undefined || !state.showBanner) return null

  return (
    <output className="update-banner">
      {state.phase === "downloading" ? (
        <span className="update-banner__msg">
          Downloading update... {Math.round(state.progress * 100)}%
        </span>
      ) : state.phase === "downloaded" ? (
        <>
          <span className="update-banner__msg">
            Update {state.latestVersion} ready.
          </span>
          <button type="button" onClick={onRestart}>
            Restart now
          </button>
          <span className="update-banner__hint">
            or it'll apply next time you quit
          </span>
        </>
      ) : (
        <>
          <span className="update-banner__msg">
            Spectrum {state.latestVersion} is available.
          </span>
          <button type="button" onClick={onDownload}>
            Download
          </button>
          <button
            type="button"
            className="update-banner__dismiss"
            onClick={onDismiss}
            aria-label="Dismiss update notification"
          >
            Dismiss
          </button>
        </>
      )}
    </output>
  )
}
