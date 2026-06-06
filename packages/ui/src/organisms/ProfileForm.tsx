import type {
  HarnessDefinition,
  HarnessId,
  ModelId,
  ModelRoute,
} from "@launchkit/types"
import { useState } from "react"
import type { ReactElement } from "react"
import { Button } from "../atoms/Button"
import { Select } from "../atoms/Select"
import { TextInput } from "../atoms/TextInput"
import { FormField } from "../molecules/FormField"
import { Row } from "../primitives/Row"

export type ProfileFormValues = {
  readonly name: string
  readonly harnessId: HarnessId
  readonly modelId?: ModelId
  readonly env: Record<string, string>
}

export type ProfileFormProps = {
  readonly initialValues: ProfileFormValues
  readonly harnesses: readonly HarnessDefinition[]
  readonly models: readonly ModelRoute[]
  readonly providerNames?: Readonly<Record<string, string>>
  readonly onSubmit: (values: ProfileFormValues) => void
  readonly onCancel: () => void
}

/**
 * Form for creating or editing a profile.
 *
 * IMPORTANT: callers MUST render this component with a React `key` tied to the
 * profile id so that switching the edited profile re-initialises the form (it
 * reads `initialValues` only on mount). For example:
 *   `<ProfileForm key={profile.id} initialValues={...} ... />`
 *
 * This matches the HarnessForm convention. Do NOT add a useEffect([initialValues])
 * — it would reset the form on every parent re-render.
 */
export const ProfileForm = ({
  initialValues,
  harnesses,
  models,
  providerNames,
  onSubmit,
  onCancel,
}: ProfileFormProps): ReactElement => {
  const [values, setValues] = useState<ProfileFormValues>(initialValues)
  const update = <K extends keyof ProfileFormValues>(
    key: K,
    value: ProfileFormValues[K],
  ): void => setValues((prev) => ({ ...prev, [key]: value }))

  // exactOptionalPropertyTypes forbids `modelId: undefined`; a "" selection must
  // OMIT the key rather than set it, so this field uses a dedicated setter.
  const setModel = (v: string): void =>
    setValues((prev) => {
      const { modelId: _drop, ...rest } = prev
      return v === "" ? rest : { ...rest, modelId: v as ModelId }
    })

  const submit = (): void => {
    if (values.name.trim() === "") return
    onSubmit(values)
  }

  const harnessOptions = harnesses.map((h) => ({ value: h.id, label: h.name }))
  const modelLabel = (m: ModelRoute): string =>
    `${providerNames?.[String(m.providerId)] ?? String(m.providerId)} / ${m.providerModel}`
  const modelOptions = [
    { value: "", label: "default" },
    ...models.map((m) => ({ value: String(m.id), label: modelLabel(m) })),
  ]

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      <FormField id="profile-name" label="Name">
        <TextInput
          id="profile-name"
          value={values.name}
          onChange={(v) => update("name", v)}
        />
      </FormField>
      <FormField id="profile-harness" label="Harness">
        <Select
          id="profile-harness"
          value={values.harnessId}
          options={harnessOptions}
          onChange={(v) => update("harnessId", v as HarnessId)}
        />
      </FormField>
      <FormField id="profile-model" label="Model">
        <Select
          id="profile-model"
          value={values.modelId === undefined ? "" : String(values.modelId)}
          options={modelOptions}
          onChange={setModel}
        />
      </FormField>
      <Row gap={2} className="lk-form-actions">
        <Button onClick={() => submit()}>Save</Button>
        <Button variant="secondary" onClick={() => onCancel()}>
          Cancel
        </Button>
      </Row>
    </form>
  )
}
