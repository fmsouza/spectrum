import { SettingsLayout, Spinner, StatusDot } from "@spectrum/ui"
import type { ReactElement } from "react"
import { useProxyStatus } from "../hooks/useProxyStatus"
import { useUpdate } from "../hooks/useUpdate"

/**
 * The General settings section: proxy status + the in-app updater controls
 * (current version, channel toggle, manual check). All data enters here via
 * hooks — the layout stays presentational.
 */
export const GeneralPage = (): ReactElement => {
  const proxy = useProxyStatus()
  const update = useUpdate()
  const s = update.state

  return (
    <SettingsLayout title="General">
      <div aria-label="Proxy status">
        {proxy.data === undefined ? (
          <Spinner label="Checking proxy" />
        ) : (
          <StatusDot
            status={proxy.data.running ? "on" : "off"}
            label={
              proxy.data.running
                ? `Proxy running on port ${proxy.data.port}`
                : "Proxy stopped"
            }
          />
        )}
      </div>

      <section aria-label="Updates" className="settings-updates">
        <h3>Updates</h3>
        <p>Current version: {s?.currentVersion ?? "…"}</p>

        <fieldset>
          <legend>Update channel</legend>
          <label>
            <input
              type="radio"
              name="update-channel"
              aria-label="Stable"
              checked={s?.channel === "stable"}
              onChange={() => update.setChannel("stable")}
            />
            Stable
          </label>
          <label>
            <input
              type="radio"
              name="update-channel"
              aria-label="Canary"
              checked={s?.channel === "canary"}
              onChange={() => update.setChannel("canary")}
            />
            Canary
          </label>
        </fieldset>

        <button type="button" onClick={update.check}>
          Check for updates
        </button>

        <p aria-live="polite" className="settings-updates__status">
          {s === undefined
            ? "…"
            : s.phase === "available"
              ? `Update ${s.latestVersion} available.`
              : s.phase === "downloading"
                ? `Downloading… ${Math.round(s.progress * 100)}%`
                : s.phase === "downloaded"
                  ? `Update ${s.latestVersion} ready — restart to apply.`
                  : s.phase === "error"
                    ? "Couldn't check for updates."
                    : "Up to date."}
        </p>
      </section>
    </SettingsLayout>
  )
}
