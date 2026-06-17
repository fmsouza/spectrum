import { Button, SettingsLayout } from "@spectrum/ui"
import type { ReactElement } from "react"
import { useUpdate } from "../hooks/useUpdate"

/**
 * The General settings section: the in-app updater controls (current version,
 * channel toggle, manual check). Data enters via the `useUpdate` hook — the
 * layout stays presentational.
 */
export const GeneralPage = (): ReactElement => {
  const update = useUpdate()
  const s = update.state

  const statusText =
    s === undefined
      ? "…"
      : s.phase === "available"
        ? `Update ${s.latestVersion} available.`
        : s.phase === "downloading"
          ? `Downloading… ${Math.round(s.progress * 100)}%`
          : s.phase === "downloaded"
            ? `Update ${s.latestVersion} ready — restart to apply.`
            : s.phase === "error"
              ? "Couldn't check for updates."
              : "Up to date."

  return (
    <SettingsLayout title="General">
      <section aria-label="Updates" className="settings-updates">
        <h2>Updates</h2>

        <div className="settings-updates__row">
          <span className="settings-updates__row-label">Current version</span>
          <span className="settings-updates__row-value">
            {s === undefined ? "…" : `${s.currentVersion} · ${s.channel}`}
          </span>
        </div>

        <div
          className="settings-updates__channel"
          role="radiogroup"
          aria-label="Update channel"
        >
          <span className="settings-updates__channel-label">
            Update channel
          </span>
          <div className="settings-updates__choices">
            <label className="settings-updates__choice">
              <input
                type="radio"
                name="update-channel"
                aria-label="Stable"
                checked={s?.channel === "stable"}
                onChange={() => update.setChannel("stable")}
              />
              <span>Stable</span>
            </label>
            <label className="settings-updates__choice">
              <input
                type="radio"
                name="update-channel"
                aria-label="Canary"
                checked={s?.channel === "canary"}
                onChange={() => update.setChannel("canary")}
              />
              <span>Canary</span>
            </label>
          </div>
          <p className="settings-updates__hint">
            Channel changes take effect after you restart Spectrum.
          </p>
        </div>

        <div className="settings-updates__actions">
          <Button variant="secondary" onClick={update.check}>
            Check for updates
          </Button>
          <span className="settings-updates__status" aria-live="polite">
            {statusText}
          </span>
        </div>
      </section>
    </SettingsLayout>
  )
}
