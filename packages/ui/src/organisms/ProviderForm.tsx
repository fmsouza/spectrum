import type { ConfigFieldSpec } from "@spectrum/providers"
import type { ReactElement } from "react"
import { Button } from "../atoms/Button"
import { TextInput } from "../atoms/TextInput"
import { FormField } from "../molecules/FormField"
import { Row } from "../primitives/Row"

export type ProviderFormProps = {
  readonly fields: readonly ConfigFieldSpec[]
  /** Current string values keyed by field name (headers field holds a JSON string). */
  readonly values: Readonly<Record<string, string>>
  readonly onChange: (name: string, value: string) => void
}

type HeaderPair = { readonly key: string; readonly value: string }

const parseHeaders = (json: string): HeaderPair[] => {
  if (json === "") return []
  try {
    const obj = JSON.parse(json) as Record<string, string>
    return Object.entries(obj).map(([key, value]) => ({ key, value }))
  } catch {
    return []
  }
}

const serializeHeaders = (pairs: readonly HeaderPair[]): string => {
  const obj: Record<string, string> = {}
  for (const p of pairs) if (p.key !== "") obj[p.key] = p.value
  return Object.keys(obj).length === 0 ? "" : JSON.stringify(obj)
}

const HeadersEditor = ({
  value,
  onChange,
}: {
  readonly value: string
  readonly onChange: (next: string) => void
}): ReactElement => {
  const pairs = parseHeaders(value)
  const update = (next: HeaderPair[]): void => onChange(serializeHeaders(next))
  return (
    <div>
      {pairs.map((p, i) => (
        <Row gap={2} key={`${i}-${p.key}`}>
          <TextInput
            id={`header-key-${i}`}
            value={p.key}
            onChange={(k) =>
              update(pairs.map((q, j) => (j === i ? { ...q, key: k } : q)))
            }
            placeholder="Header"
          />
          <TextInput
            id={`header-value-${i}`}
            value={p.value}
            onChange={(v) =>
              update(pairs.map((q, j) => (j === i ? { ...q, value: v } : q)))
            }
            placeholder="Value"
          />
          <Button
            variant="secondary"
            onClick={() => update(pairs.filter((_, j) => j !== i))}
          >
            Remove
          </Button>
        </Row>
      ))}
      {/* Use a native button so we can set aria-label for getByLabelText("Add header") */}
      <button
        type="button"
        aria-label="Add header"
        onClick={() => update([...pairs, { key: "", value: "" }])}
      >
        Add header
      </button>
    </div>
  )
}

/** Renders a provider's declarative config fields. Presentational: it never fetches. */
export const ProviderForm = ({
  fields,
  values,
  onChange,
}: ProviderFormProps): ReactElement => (
  <>
    {fields.map((f) =>
      f.kind === "headers" ? (
        <FormField id={`field-${f.name}`} label={f.label} key={f.name}>
          <HeadersEditor
            value={values[f.name] ?? ""}
            onChange={(next) => onChange(f.name, next)}
          />
        </FormField>
      ) : (
        <FormField id={`field-${f.name}`} label={f.label} key={f.name}>
          <TextInput
            id={`field-${f.name}`}
            value={values[f.name] ?? f.default ?? ""}
            onChange={(v) => onChange(f.name, v)}
            type={f.kind === "url" ? "url" : "text"}
            placeholder={f.placeholder ?? ""}
          />
        </FormField>
      ),
    )}
  </>
)
