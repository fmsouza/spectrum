import { Badge, EmptyState, SettingsLayout, Spinner } from "@spectrum/ui"
import type { ReactElement } from "react"
import { useHarnesses } from "../hooks/useHarnesses"

/**
 * Read-only list of the built-in harnesses. Custom user harnesses are no longer
 * supported — every launchable harness is one of the native builtins.
 */
export const HarnessesPage = (): ReactElement => {
  const { data, loading, error } = useHarnesses()

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
        <section aria-label="Built-in harnesses">
          <h2>Built-in</h2>
          <ul className="lk-list">
            {data.map((h) => (
              <li key={h.id} className="lk-list-row">
                <span className="lk-list-row__label">{h.name}</span>
                <Badge tone="info">{h.apiFormat}</Badge>
                <Badge tone="neutral">built-in</Badge>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </SettingsLayout>
  )
}
