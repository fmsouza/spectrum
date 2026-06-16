import type { ProviderView } from "@spectrum/ipc"
import type { SdkProvider } from "@spectrum/types"
import {
  Button,
  EmptyState,
  FormField,
  Modal,
  ModelPicker,
  ProviderForm,
  ProviderList,
  Row,
  SecretFieldsForm,
  Select,
  SettingsLayout,
  Spinner,
  StatusDot,
  TextInput,
} from "@spectrum/ui"
import type { ProviderRow } from "@spectrum/ui"
import { type ReactElement, useState } from "react"
import { useDraftConnectionTest } from "../hooks/useDraftConnectionTest"
import { useDraftProviderModels } from "../hooks/useDraftProviderModels"
import { useNotifications } from "../hooks/useNotifications"
import { useProviderCatalog } from "../hooks/useProviderCatalog"
import { useProviders } from "../hooks/useProviders"

/** Drop empty-string config values so optional fields read as "unset" (zod `.url().optional()` rejects ""). */
const omitEmpty = (
  config: Readonly<Record<string, string>>,
): Record<string, string> =>
  Object.fromEntries(Object.entries(config).filter(([, v]) => v !== ""))

const toRow = (view: ProviderView): ProviderRow => {
  const fields = Object.values(view.secretFields)
  const secretSet = fields.length > 0 && fields.every((s) => s.isSet)
  return {
    id: view.id,
    name: view.name,
    sdkProvider: view.sdkProvider,
    secretSet,
  }
}

export const ProvidersPage = (): ReactElement => {
  const { data, loading, error, add, update, setSecret } = useProviders()
  const catalog = useProviderCatalog()
  const { notify } = useNotifications()

  const catalogOptions =
    catalog.data?.map((c) => ({ value: c.key, label: c.label })) ?? []

  const defaultSdk = catalogOptions[0]?.value ?? "openai"

  const [addOpen, setAddOpen] = useState<boolean>(false)
  const [newName, setNewName] = useState<string>("")
  const [newSdk, setNewSdk] = useState<string>(defaultSdk)
  const [newConfig, setNewConfig] = useState<Record<string, string>>({})
  const [newSecrets, setNewSecrets] = useState<Record<string, string>>({})
  const [chosenModel, setChosenModel] = useState<string>("")
  const discovery = useDraftProviderModels()
  const conn = useDraftConnectionTest()

  const resetDraftProbes = (): void => {
    discovery.reset()
    conn.reset()
    setChosenModel("")
  }

  const closeAddModal = (): void => {
    setAddOpen(false)
    setNewName("")
    setNewConfig({})
    setNewSecrets({})
    resetDraftProbes()
  }

  const selectedEntry = catalog.data?.find((c) => c.key === newSdk)

  const submitAdd = async (): Promise<void> => {
    const trimmed = newName.trim()
    const secretFieldNames = selectedEntry?.secretFields.map((s) => s.name) ?? [
      "apiKey",
    ]
    // Use the typed key from the catalog entry; fall back to a cast if catalog not yet loaded.
    const sdkProvider: SdkProvider =
      selectedEntry?.key ?? (newSdk as SdkProvider)
    const r = await add({
      ...(trimmed !== "" ? { name: trimmed } : {}),
      sdkProvider,
      config: omitEmpty(newConfig),
      secretFieldNames,
      ...(Object.keys(newSecrets).length > 0 ? { secrets: newSecrets } : {}),
      models: chosenModel !== "" ? [chosenModel] : [],
    })
    if (r.ok) {
      closeAddModal()
    } else notify({ tone: "error", message: "Couldn't add the provider" })
  }

  const [secretFor, setSecretFor] = useState<ProviderView | undefined>(
    undefined,
  )
  const [secretField, setSecretField] = useState<string>("")
  const [secretValue, setSecretValue] = useState<string>("")

  const [editFor, setEditFor] = useState<ProviderView | undefined>(undefined)
  const [editConfig, setEditConfig] = useState<Record<string, string>>({})

  const submitSecret = async (): Promise<void> => {
    if (
      secretFor === undefined ||
      secretField.trim() === "" ||
      secretValue.trim() === ""
    )
      return
    const r = await setSecret({
      providerId: secretFor.id,
      field: secretField,
      value: secretValue,
    })
    if (r.ok) {
      // Write-only: clear the value immediately; never echo it back.
      setSecretValue("")
      setSecretField("")
      setSecretFor(undefined)
    } else notify({ tone: "error", message: "Couldn't save the secret" })
  }

  const submitEdit = async (): Promise<void> => {
    if (editFor === undefined) return
    const r = await update(editFor.id, {
      name: editFor.name,
      sdkProvider: editFor.sdkProvider,
      config: editConfig,
      secretFieldNames: Object.keys(editFor.secretFields),
      models: editFor.models,
    })
    if (r.ok) {
      setEditFor(undefined)
    } else notify({ tone: "error", message: "Couldn't save the provider" })
  }

  const editCatalogEntry =
    editFor !== undefined
      ? catalog.data?.find((c) => c.key === editFor.sdkProvider)
      : undefined

  return (
    <SettingsLayout title="Providers">
      {loading ? <Spinner label="Loading providers" /> : null}
      {error !== undefined ? (
        <EmptyState
          title="Could not load providers"
          hint={`IPC error: ${error.kind}`}
        />
      ) : null}

      {data !== undefined ? (
        <>
          <Button onClick={() => setAddOpen(true)}>Add provider</Button>
          <ProviderList
            providers={data.map(toRow)}
            onSetSecret={(id) => {
              const p = data.find((x) => x.id === id)
              if (p !== undefined) setSecretFor(p)
            }}
            onEdit={(id) => {
              const p = data.find((x) => x.id === id)
              if (p !== undefined) {
                setEditFor(p)
                setEditConfig({ ...p.config })
              }
            }}
          />
        </>
      ) : null}

      <Modal title="Add provider" open={addOpen} onClose={closeAddModal}>
        <form
          aria-label="Add provider"
          onSubmit={(e) => {
            e.preventDefault()
            void submitAdd()
          }}
        >
          <FormField id="new-provider-name" label="Provider name">
            <TextInput
              id="new-provider-name"
              value={newName}
              onChange={setNewName}
              placeholder="Defaults to the SDK provider name"
            />
          </FormField>
          <FormField id="new-provider-sdk" label="SDK provider">
            <Select
              id="new-provider-sdk"
              value={newSdk}
              options={catalogOptions}
              onChange={(v) => {
                setNewSdk(v)
                setNewConfig({})
                setNewSecrets({})
                resetDraftProbes()
              }}
            />
          </FormField>
          {selectedEntry !== undefined &&
          selectedEntry.configFields.length > 0 ? (
            <ProviderForm
              fields={selectedEntry.configFields}
              values={newConfig}
              onChange={(name, value) => {
                setNewConfig((c) => ({ ...c, [name]: value }))
                resetDraftProbes()
              }}
            />
          ) : null}
          {selectedEntry !== undefined &&
          selectedEntry.secretFields.length > 0 ? (
            <SecretFieldsForm
              fields={selectedEntry.secretFields}
              values={newSecrets}
              onChange={(name, value) => {
                setNewSecrets((s) => ({ ...s, [name]: value }))
                resetDraftProbes()
              }}
            />
          ) : null}
          <Row gap={2}>
            <Button
              variant="secondary"
              disabled={discovery.loading}
              onClick={() =>
                void discovery.discover({
                  sdkProvider: selectedEntry?.key ?? (newSdk as SdkProvider),
                  config: omitEmpty(newConfig),
                  secrets: newSecrets,
                })
              }
            >
              Discover models
            </Button>
          </Row>
          <ModelPicker
            loading={discovery.loading}
            models={discovery.models}
            value={chosenModel}
            onChange={setChosenModel}
            {...(discovery.error !== undefined
              ? { errorMessage: "Couldn't list models — enter one manually." }
              : {})}
          />
          <Row gap={2}>
            <Button
              variant="secondary"
              disabled={chosenModel === "" || conn.testing}
              onClick={() =>
                void conn.test({
                  sdkProvider: selectedEntry?.key ?? (newSdk as SdkProvider),
                  config: omitEmpty(newConfig),
                  secrets: newSecrets,
                  providerModel: chosenModel,
                })
              }
            >
              Test connection
            </Button>
            {conn.testing ? <Spinner label="Testing connection…" /> : null}
            {conn.result !== undefined ? (
              <StatusDot
                status={conn.result.ok ? "on" : "error"}
                label={
                  conn.result.ok
                    ? `Connected (${conn.result.latencyMs}ms)`
                    : "Connection failed"
                }
              />
            ) : null}
            {conn.error !== undefined ? (
              <StatusDot status="error" label="Connection test failed" />
            ) : null}
          </Row>
          <Row gap={2} className="lk-form-actions">
            <Button onClick={() => void submitAdd()}>Create provider</Button>
            <Button variant="secondary" onClick={closeAddModal}>
              Cancel
            </Button>
          </Row>
        </form>
      </Modal>

      <Modal
        title={
          secretFor === undefined
            ? "Set secret"
            : `Set secret for ${secretFor.name}`
        }
        open={secretFor !== undefined}
        onClose={() => setSecretFor(undefined)}
      >
        {secretFor !== undefined ? (
          <form
            aria-label={`Set secret for ${secretFor.name}`}
            onSubmit={(e) => {
              e.preventDefault()
              void submitSecret()
            }}
          >
            <FormField id="secret-field" label="Secret field">
              <TextInput
                id="secret-field"
                value={secretField}
                onChange={setSecretField}
              />
            </FormField>
            {/* type="password" + write-only: the value is sent, then cleared, never shown. */}
            <FormField id="secret-value" label="Secret value">
              <TextInput
                id="secret-value"
                type="password"
                value={secretValue}
                onChange={setSecretValue}
              />
            </FormField>
            <Row gap={2} className="lk-form-actions">
              <Button onClick={() => void submitSecret()}>Save secret</Button>
              <Button
                variant="secondary"
                onClick={() => setSecretFor(undefined)}
              >
                Cancel
              </Button>
            </Row>
          </form>
        ) : null}
      </Modal>
      <Modal
        title={
          editFor === undefined
            ? "Edit provider"
            : `Edit provider ${editFor.name}`
        }
        open={editFor !== undefined}
        onClose={() => setEditFor(undefined)}
      >
        {editFor !== undefined ? (
          <form
            aria-label={`Edit provider ${editFor.name}`}
            onSubmit={(e) => {
              e.preventDefault()
              void submitEdit()
            }}
          >
            {editCatalogEntry !== undefined &&
            editCatalogEntry.configFields.length > 0 ? (
              <ProviderForm
                fields={editCatalogEntry.configFields}
                values={editConfig}
                onChange={(name, value) =>
                  setEditConfig((c) => ({ ...c, [name]: value }))
                }
              />
            ) : null}
            <Row gap={2} className="lk-form-actions">
              <Button onClick={() => void submitEdit()}>Save changes</Button>
              <Button variant="secondary" onClick={() => setEditFor(undefined)}>
                Cancel
              </Button>
            </Row>
          </form>
        ) : null}
      </Modal>
    </SettingsLayout>
  )
}
