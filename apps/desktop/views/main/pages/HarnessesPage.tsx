import { useState } from "react"
import type { HarnessDefinition, HarnessId } from "@launchkit/types"
import {
  Badge,
  Button,
  EmptyState,
  HarnessForm,
  SettingsLayout,
  Spinner,
} from "@launchkit/ui"
import type { HarnessFormValues } from "@launchkit/ui"
import { useIpcClient } from "../IpcClientContext"
import { useHarnesses } from "../hooks/useHarnesses"

const NEW_HARNESS_DEFAULTS: HarnessFormValues = {
  name: "",
  command: "",
  apiFormat: "anthropic",
  defaultAlias: "default",
}

export const HarnessesPage = (): JSX.Element => {
  const client = useIpcClient()
  const { data, loading, error, refetch } = useHarnesses()
  const [addOpen, setAddOpen] = useState<boolean>(false)

  const builtIns = (data ?? []).filter((h) => h.builtIn)
  const customs = (data ?? []).filter((h) => !h.builtIn)

  const submitAdd = async (values: HarnessFormValues): Promise<void> => {
    // The page derives the non-user fields; the form only edits the user-facing ones.
    const definition = {
      id: values.command,
      name: values.name,
      command: values.command,
      apiFormat: values.apiFormat,
      envTemplate: {},
      defaultAlias: values.defaultAlias,
      builtIn: false,
    } as unknown as HarnessDefinition
    const r = await client.addHarness(definition)
    if (r.ok) {
      setAddOpen(false)
      refetch()
    }
  }

  const deleteHarness = async (id: string): Promise<void> => {
    const r = await client.deleteHarness({ id: id as HarnessId })
    if (r.ok) refetch()
  }

  return (
    <SettingsLayout title="Harnesses">
      {loading ? <Spinner label="Loading harnesses" /> : null}
      {error !== undefined ? (
        <EmptyState title="Could not load harnesses" hint={`IPC error: ${error.kind}`} />
      ) : null}

      {data !== undefined ? (
        <>
          <section aria-label="Built-in harnesses">
            <h2>Built-in</h2>
            <ul>
              {builtIns.map((h) => (
                <li key={h.id}>
                  <span>{h.name}</span>
                  <Badge tone="info">{h.apiFormat}</Badge>
                  <Badge tone="neutral">built-in</Badge>
                </li>
              ))}
            </ul>
          </section>

          <section aria-label="Custom harnesses">
            <h2>Custom</h2>
            {customs.length === 0 ? (
              <EmptyState title="No custom harnesses yet" hint="Add one to launch your own tool." />
            ) : (
              <ul>
                {customs.map((h) => (
                  <li key={h.id}>
                    <span>{h.name}</span>
                    <Badge tone="info">{h.apiFormat}</Badge>
                    <Button variant="danger" onClick={() => void deleteHarness(h.id)}>
                      {`Delete ${h.name}`}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            <Button onClick={() => setAddOpen(true)}>Add custom harness</Button>
          </section>
        </>
      ) : null}

      {addOpen ? (
        <HarnessForm
          initialValues={NEW_HARNESS_DEFAULTS}
          onSubmit={(v) => void submitAdd(v)}
          onCancel={() => setAddOpen(false)}
        />
      ) : null}
    </SettingsLayout>
  )
}
