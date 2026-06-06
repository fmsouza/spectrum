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
import { type ReactElement, useState } from "react"
import { useHarnesses } from "../hooks/useHarnesses"

const NEW_HARNESS_DEFAULTS: HarnessFormValues = {
  name: "",
  command: "",
  apiFormat: "anthropic",
}

export const HarnessesPage = (): ReactElement => {
  const { data, loading, error, add, remove } = useHarnesses()
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
      builtIn: false,
    } as unknown as HarnessDefinition
    const r = await add(definition)
    if (r.ok) setAddOpen(false)
  }

  const deleteHarness = async (id: string): Promise<void> => {
    await remove(id as HarnessId)
  }

  return (
    <SettingsLayout title="Harnesses">
      {loading ? <Spinner label="Loading harnesses" /> : null}
      {error !== undefined ? (
        <EmptyState
          title="Could not load harnesses"
          hint={`IPC error: ${error.kind}`}
        />
      ) : null}

      {data !== undefined ? (
        <>
          <section aria-label="Built-in harnesses">
            <h2>Built-in</h2>
            <ul className="lk-list">
              {builtIns.map((h) => (
                <li key={h.id} className="lk-list-row">
                  <span className="lk-list-row__label">{h.name}</span>
                  <Badge tone="info">{h.apiFormat}</Badge>
                  <Badge tone="neutral">built-in</Badge>
                </li>
              ))}
            </ul>
          </section>

          <section aria-label="Custom harnesses">
            <h2>Custom</h2>
            {customs.length === 0 ? (
              <EmptyState
                title="No custom harnesses yet"
                hint="Add one to launch your own tool."
              />
            ) : (
              <ul className="lk-list">
                {customs.map((h) => (
                  <li key={h.id} className="lk-list-row">
                    <span className="lk-list-row__label">{h.name}</span>
                    <Badge tone="info">{h.apiFormat}</Badge>
                    <Button
                      variant="danger"
                      onClick={() => void deleteHarness(h.id)}
                    >
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
