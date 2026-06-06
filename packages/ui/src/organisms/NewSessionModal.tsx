import type {
  HarnessDefinition,
  HarnessId,
  ModelId,
  ModelRoute,
} from "@launchkit/types"
import { useEffect, useRef, useState } from "react"
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
  readonly modelId?: ModelId
  readonly env: Record<string, string>
}

export type NewSessionModalProps = {
  readonly open: boolean
  readonly harnesses: readonly HarnessDefinition[]
  readonly models: readonly ModelRoute[]
  readonly providerNames?: Readonly<Record<string, string>>
  readonly folder: string
  readonly onBrowse: () => void
  readonly onSubmit: (values: NewSessionValues) => void
  readonly onCancel: () => void
  /** A launch failure surfaced by the page; rendered as an inline alert. */
  readonly error?: string
}

type FormState = {
  readonly cwd: string
  readonly harnessId: HarnessId
  readonly modelId: ModelId | ""
  readonly env: Record<string, string>
}

export const NewSessionModal = ({
  open,
  harnesses,
  models,
  providerNames,
  folder,
  onBrowse,
  onSubmit,
  onCancel,
  error,
}: NewSessionModalProps): ReactElement => {
  const firstHarness = (harnesses[0]?.id ?? "") as HarnessId
  const [state, setState] = useState<FormState>({
    cwd: folder,
    harnessId: firstHarness,
    modelId: "",
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
        harnessId: firstHarness,
        modelId: "",
        env: {},
      })
    }
    wasOpen.current = open
  }, [open, folder, firstHarness])

  const update = <K extends keyof FormState>(
    key: K,
    value: FormState[K],
  ): void => setState((prev) => ({ ...prev, [key]: value }))

  const submit = (): void => {
    const values: NewSessionValues = {
      name: "Untitled",
      cwd: state.cwd,
      harnessId: state.harnessId,
      ...(state.modelId !== "" ? { modelId: state.modelId as ModelId } : {}),
      env: state.env,
    }
    onSubmit(values)
  }

  const harnessOptions = harnesses.map((h) => ({ value: h.id, label: h.name }))
  const modelLabel = (m: ModelRoute): string =>
    `${providerNames?.[String(m.providerId)] ?? String(m.providerId)} / ${m.providerModel}`
  const modelOptions = [
    { value: "", label: "default" },
    ...models.map((m) => ({ value: String(m.id), label: modelLabel(m) })),
  ]

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
        <FormField id="session-model" label="Model">
          <Select
            id="session-model"
            value={state.modelId === "" ? "" : String(state.modelId)}
            options={modelOptions}
            onChange={(v) =>
              update("modelId", (v === "" ? "" : v) as FormState["modelId"])
            }
          />
        </FormField>
        {error === undefined ? null : <p role="alert">{error}</p>}
        <Button disabled={!canLaunch} onClick={() => submit()}>
          Launch
        </Button>
        <Button variant="secondary" onClick={() => onCancel()}>
          Cancel
        </Button>
      </form>
    </Modal>
  )
}
