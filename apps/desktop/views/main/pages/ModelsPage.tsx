import type { ModelId, ProviderId } from "@launchkit/types"
import {
  Button,
  EmptyState,
  FormField,
  ModelTable,
  Select,
  SettingsLayout,
  Spinner,
  TextInput,
} from "@launchkit/ui"
import { type ReactElement, useState } from "react"
import { useIpcClient } from "../IpcClientContext"
import { useModels } from "../hooks/useModels"
import { useProviderModels } from "../hooks/useProviderModels"
import { useProviders } from "../hooks/useProviders"

type ModelDraft = {
  readonly providerId: string
  readonly providerModel: string
  /** When editing, the ModelId being updated; undefined for a new model. */
  readonly editingOf: string | undefined
}

const EMPTY_DRAFT: ModelDraft = {
  providerId: "",
  providerModel: "",
  editingOf: undefined,
}

/** Renders the Model form field: loading / discovered-select / free-text fallback. */
const ModelField = ({
  providerId,
  value,
  onChange,
}: {
  readonly providerId: string
  readonly value: string
  readonly onChange: (v: string) => void
}): ReactElement => {
  const { data: models, loading, error } = useProviderModels(providerId)

  if (loading && providerId !== "") {
    return (
      <FormField id="model-model" label="Model">
        <Select
          id="model-model"
          value=""
          options={[]}
          onChange={() => {}}
          disabled
        />
        <Spinner label="Loading models…" />
      </FormField>
    )
  }

  const discovered = models ?? []
  if (error === undefined && discovered.length > 0) {
    // Primary path: a picker of the discovered models.
    const options = [
      { value: "", label: "Select a model…" },
      ...discovered.map((m) => ({ value: m, label: m })),
    ]
    return (
      <FormField id="model-model" label="Model">
        <Select
          id="model-model"
          value={value}
          options={options}
          onChange={onChange}
        />
      </FormField>
    )
  }

  // Empty list or error (incl. unsupported SDKs) → free-text fallback.
  return (
    <FormField id="model-model" label="Model">
      <TextInput id="model-model" value={value} onChange={onChange} />
      {providerId !== "" ? (
        <span>
          {"Couldn't list models for this provider — enter one manually."}
        </span>
      ) : null}
    </FormField>
  )
}

export const ModelsPage = (): ReactElement => {
  const client = useIpcClient()
  const models = useModels()
  const providers = useProviders()

  const [draft, setDraft] = useState<ModelDraft | undefined>(undefined)

  const providerNames: Record<string, string> = {}
  for (const p of providers.data ?? []) providerNames[p.id] = p.name

  const providerOptions = (providers.data ?? []).map((p) => ({
    value: p.id,
    label: p.name,
  }))

  const startEdit = (id: string): void => {
    const found = (models.data ?? []).find((m) => m.id === id)
    if (found === undefined) return
    setDraft({
      providerId: found.providerId,
      providerModel: found.providerModel,
      editingOf: found.id,
    })
  }

  const submitDraft = async (): Promise<void> => {
    if (draft === undefined) return
    if (draft.providerId.trim() === "" || draft.providerModel.trim() === "")
      return

    const r =
      draft.editingOf === undefined
        ? await client.addModel({
            providerId: draft.providerId as ProviderId,
            providerModel: draft.providerModel,
          })
        : await client.updateModel({
            id: draft.editingOf as ModelId,
            input: {
              providerId: draft.providerId as ProviderId,
              providerModel: draft.providerModel,
            },
          })
    if (r.ok) {
      setDraft(undefined)
      models.refetch()
    }
  }

  const deleteModel = async (id: string): Promise<void> => {
    const r = await client.deleteModel({ id: id as ModelId })
    if (r.ok) models.refetch()
  }

  const update = <K extends keyof ModelDraft>(
    key: K,
    value: ModelDraft[K],
  ): void => setDraft((prev) => ({ ...(prev ?? EMPTY_DRAFT), [key]: value }))

  /** When the provider changes, clear providerModel — the previous model may not be valid. */
  const updateProvider = (newProviderId: string): void =>
    setDraft((prev) => ({
      ...(prev ?? EMPTY_DRAFT),
      providerId: newProviderId,
      providerModel: "",
    }))

  const draftIncomplete =
    draft === undefined ||
    draft.providerId.trim() === "" ||
    draft.providerModel.trim() === ""

  return (
    <SettingsLayout title="Models">
      {models.loading || providers.loading ? (
        <Spinner label="Loading models" />
      ) : null}
      {models.error !== undefined ? (
        <EmptyState
          title="Could not load models"
          hint={`IPC error: ${models.error.kind}`}
        />
      ) : null}

      {models.data !== undefined ? (
        <>
          <Button
            onClick={() =>
              setDraft({
                ...EMPTY_DRAFT,
                providerId: providers.data?.[0]?.id ?? "",
              })
            }
          >
            Add model
          </Button>
          <ModelTable
            models={models.data}
            providerNames={providerNames}
            onEdit={startEdit}
            onDelete={(id) => void deleteModel(id)}
          />
        </>
      ) : null}

      {draft !== undefined ? (
        <form
          aria-label={
            draft.editingOf === undefined ? "Add model" : "Edit model"
          }
          onSubmit={(e) => {
            e.preventDefault()
            void submitDraft()
          }}
        >
          <FormField id="model-provider" label="Provider">
            <Select
              id="model-provider"
              value={draft.providerId}
              options={[
                { value: "", label: "Select a provider…" },
                ...providerOptions,
              ]}
              onChange={updateProvider}
            />
          </FormField>
          <ModelField
            providerId={draft.providerId}
            value={draft.providerModel}
            onChange={(v) => update("providerModel", v)}
          />
          <Button onClick={() => void submitDraft()} disabled={draftIncomplete}>
            Save model
          </Button>
          <Button variant="secondary" onClick={() => setDraft(undefined)}>
            Cancel
          </Button>
        </form>
      ) : null}
    </SettingsLayout>
  )
}
