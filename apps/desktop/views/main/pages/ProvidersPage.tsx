import type { ProviderView } from "@launchkit/ipc"
import type { SdkProvider } from "@launchkit/types"
import {
  Button,
  EmptyState,
  FormField,
  Modal,
  ProviderList,
  Row,
  Select,
  SettingsLayout,
  Spinner,
  TextInput,
} from "@launchkit/ui"
import type { ProviderRow } from "@launchkit/ui"
import { type ReactElement, useState } from "react"
import { useProviders } from "../hooks/useProviders"

const SDK_PROVIDER_OPTIONS = [
  { value: "openai", label: "OpenAI" },
  { value: "anthropic", label: "Anthropic" },
  { value: "google", label: "Google" },
  { value: "groq", label: "Groq" },
  { value: "ollama", label: "Ollama" },
] as const

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
  const { data, loading, error, add, setSecret } = useProviders()

  const [addOpen, setAddOpen] = useState<boolean>(false)
  const [newName, setNewName] = useState<string>("")
  const [newSdk, setNewSdk] = useState<SdkProvider>("openai")

  const [secretFor, setSecretFor] = useState<ProviderView | undefined>(
    undefined,
  )
  const [secretField, setSecretField] = useState<string>("")
  const [secretValue, setSecretValue] = useState<string>("")

  const submitAdd = async (): Promise<void> => {
    const trimmed = newName.trim()
    const r = await add({
      ...(trimmed !== "" ? { name: trimmed } : {}),
      sdkProvider: newSdk,
      config: {},
      secretFieldNames: ["apiKey"],
      models: [],
    })
    if (r.ok) {
      setAddOpen(false)
      setNewName("")
    }
  }

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
    }
  }

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
          />
        </>
      ) : null}

      <Modal
        title="Add provider"
        open={addOpen}
        onClose={() => setAddOpen(false)}
      >
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
              options={SDK_PROVIDER_OPTIONS}
              onChange={(v) => setNewSdk(v as SdkProvider)}
            />
          </FormField>
          <Row gap={2} className="lk-form-actions">
            <Button onClick={() => void submitAdd()}>Create provider</Button>
            <Button variant="secondary" onClick={() => setAddOpen(false)}>
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
    </SettingsLayout>
  )
}
