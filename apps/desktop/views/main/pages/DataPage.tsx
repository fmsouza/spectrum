import { Button, ConfirmDialog, SettingsLayout } from "@spectrum/ui"
import { type ReactElement, useState } from "react"

export type DataPageProps = {
  /** Perform the factory reset (production: call the resetApp IPC). */
  readonly onReset: () => void
}

/**
 * Settings → Data danger zone: a single irreversible "Reset app" action behind a
 * type-to-confirm dialog. Wipes all projects, sessions, run history, provider
 * configs, and keychain secrets, then relaunches.
 */
export const DataPage = ({ onReset }: DataPageProps): ReactElement => {
  const [confirming, setConfirming] = useState(false)
  return (
    <SettingsLayout title="Data">
      <section className="lk-danger-zone">
        <h3>Reset app</h3>
        <p>
          Permanently delete all projects, sessions, run history, providers,
          models, and stored API keys. The app returns to a first-launch state
          and relaunches. This cannot be undone.
        </p>
        <Button variant="danger" onClick={() => setConfirming(true)}>
          Reset app
        </Button>
      </section>
      {confirming ? (
        <ConfirmDialog
          open
          title="Reset app?"
          message="Type RESET to permanently erase all data and relaunch."
          confirmLabel="Reset everything"
          confirmPhrase="RESET"
          onConfirm={() => {
            setConfirming(false)
            onReset()
          }}
          onClose={() => setConfirming(false)}
        />
      ) : null}
    </SettingsLayout>
  )
}
