import type { HarnessDefinition, HarnessId } from "@launchkit/types"
import { useCallback, useEffect, useRef, useState } from "react"
import type { ReactElement } from "react"
import { Button } from "../atoms/Button"
import { Modal } from "../atoms/Modal"
import { Select } from "../atoms/Select"
import { FolderField } from "../molecules/FolderField"
import { FormField } from "../molecules/FormField"

export type NewSessionValues = {
  readonly name: string
  readonly cwd: string
  readonly harnessId: HarnessId
  readonly env: Record<string, string>
}

export type NewSessionModalProps = {
  readonly open: boolean
  readonly harnesses: readonly HarnessDefinition[]
  readonly folder: string
  /** Persisted last-launched harness id; preselected on open when it matches a harness. */
  readonly initialHarnessId?: string
  readonly onBrowse: () => void
  readonly onSubmit: (values: NewSessionValues) => void
  readonly onCancel: () => void
  /** A launch failure surfaced by the page; rendered as an inline alert. */
  readonly error?: string
}

type FormState = {
  readonly cwd: string
  readonly harnessId: HarnessId
  readonly env: Record<string, string>
}

export const NewSessionModal = ({
  open,
  harnesses,
  folder,
  initialHarnessId,
  onBrowse,
  onSubmit,
  onCancel,
  error,
}: NewSessionModalProps): ReactElement => {
  const firstHarness = (harnesses[0]?.id ?? "") as HarnessId

  // Resolve a persisted harness id against the currently-available options,
  // falling back to the first harness when the persisted id no longer exists
  // (e.g. it was deleted between sessions).
  const resolveHarness = useCallback((): HarnessId => {
    const match = harnesses.find((h) => h.id === initialHarnessId)
    return (match?.id ?? firstHarness) as HarnessId
  }, [harnesses, initialHarnessId, firstHarness])

  const [state, setState] = useState<FormState>({
    cwd: folder,
    harnessId: resolveHarness(),
    env: {},
  })

  // Sync cwd field whenever the folder prop changes (Browse flow + prefill).
  useEffect(() => {
    setState((prev) => ({ ...prev, cwd: folder }))
  }, [folder])

  // Reset form only on the false→true transition of open.
  const wasOpen = useRef(false)
  useEffect(() => {
    if (open && !wasOpen.current) {
      setState({
        cwd: folder,
        harnessId: resolveHarness(),
        env: {},
      })
    }
    wasOpen.current = open
  }, [open, folder, resolveHarness])

  const update = <K extends keyof FormState>(
    key: K,
    value: FormState[K],
  ): void => setState((prev) => ({ ...prev, [key]: value }))

  const submit = (): void => {
    const values: NewSessionValues = {
      name: "Untitled",
      cwd: state.cwd,
      harnessId: state.harnessId,
      env: state.env,
    }
    onSubmit(values)
  }

  const harnessOptions = harnesses.map((h) => ({ value: h.id, label: h.name }))

  // A session can launch as long as a harness is selected. The "default" model
  // option (no modelId) bypasses the proxy, so Launch is always available.
  const canLaunch = state.harnessId !== ""

  return (
    <Modal title="New session" open={open} onClose={onCancel}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <FormField id="session-folder" label="Folder">
          <FolderField
            id="session-folder"
            value={state.cwd}
            onChange={(v) => update("cwd", v)}
            onBrowse={onBrowse}
          />
        </FormField>
        <FormField id="session-harness" label="Harness">
          <Select
            id="session-harness"
            value={state.harnessId}
            options={harnessOptions}
            onChange={(v) => update("harnessId", v as HarnessId)}
          />
        </FormField>
        {error === undefined ? null : <p role="alert">{error}</p>}
        <Button disabled={!canLaunch} onClick={() => submit()}>
          Launch
        </Button>
      </form>
    </Modal>
  )
}
