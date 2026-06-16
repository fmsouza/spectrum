import type { SecretFieldSpec } from "@spectrum/providers"
import type { ReactElement } from "react"
import { TextInput } from "../atoms/TextInput"
import { FormField } from "../molecules/FormField"

export type SecretFieldsFormProps = {
  readonly fields: readonly SecretFieldSpec[]
  /** Current write-only values keyed by field name. */
  readonly values: Readonly<Record<string, string>>
  readonly onChange: (name: string, value: string) => void
}

/** Renders a provider's declarative secret fields as password inputs. Presentational; never fetches. */
export const SecretFieldsForm = ({
  fields,
  values,
  onChange,
}: SecretFieldsFormProps): ReactElement => (
  <>
    {fields.map((f) => (
      <FormField id={`secret-${f.name}`} label={f.label} key={f.name}>
        <TextInput
          id={`secret-${f.name}`}
          type="password"
          value={values[f.name] ?? ""}
          onChange={(v) => onChange(f.name, v)}
        />
      </FormField>
    ))}
  </>
)
