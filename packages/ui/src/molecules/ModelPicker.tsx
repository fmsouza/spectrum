import type { ReactElement } from "react"
import { Select } from "../atoms/Select"
import { Spinner } from "../atoms/Spinner"
import { TextInput } from "../atoms/TextInput"
import { FormField } from "./FormField"

export type ModelPickerProps = {
  readonly models: readonly string[]
  readonly loading: boolean
  readonly value: string
  readonly onChange: (value: string) => void
  /** When set, render the free-text fallback and show this message. */
  readonly errorMessage?: string
  readonly id?: string
}

/** Discovered-model picker: loading spinner → select of models → free-text fallback. Presentational. */
export const ModelPicker = ({
  models,
  loading,
  value,
  onChange,
  errorMessage,
  id = "model",
}: ModelPickerProps): ReactElement => {
  if (loading) {
    return (
      <FormField id={id} label="Model">
        <Select id={id} value="" options={[]} onChange={() => {}} disabled />
        <Spinner label="Loading models…" />
      </FormField>
    )
  }
  if (errorMessage === undefined && models.length > 0) {
    const options = [
      { value: "", label: "Select a model…" },
      ...models.map((m) => ({ value: m, label: m })),
    ]
    return (
      <FormField id={id} label="Model">
        <Select id={id} value={value} options={options} onChange={onChange} />
      </FormField>
    )
  }
  return (
    <FormField id={id} label="Model">
      <TextInput id={id} value={value} onChange={onChange} />
      {errorMessage !== undefined ? <span>{errorMessage}</span> : null}
    </FormField>
  )
}
