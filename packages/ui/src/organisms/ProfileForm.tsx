import type {
  AliasName,
  HarnessDefinition,
  HarnessId,
  ModelAlias,
} from "@launchkit/types"
import { useState } from "react"
import type { ReactElement } from "react"
import { Button } from "../atoms/Button"
import { Select } from "../atoms/Select"
import { TextInput } from "../atoms/TextInput"
import { FormField } from "../molecules/FormField"

export type ProfileFormValues = {
  readonly name: string
  readonly harnessId: HarnessId
  readonly alias: AliasName
  readonly env: Record<string, string>
}

export type ProfileFormProps = {
  readonly initialValues: ProfileFormValues
  readonly harnesses: readonly HarnessDefinition[]
  readonly aliases: readonly ModelAlias[]
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
  aliases,
  onSubmit,
  onCancel,
}: ProfileFormProps): ReactElement => {
  const [values, setValues] = useState<ProfileFormValues>(initialValues)
  const update = <K extends keyof ProfileFormValues>(
    key: K,
    value: ProfileFormValues[K],
  ): void => setValues((prev) => ({ ...prev, [key]: value }))

  const submit = (): void => {
    if (values.name.trim() === "") return
    onSubmit(values)
  }

  const harnessOptions = harnesses.map((h) => ({ value: h.id, label: h.name }))
  const aliasOptions = aliases.map((a) => ({ value: a.alias, label: a.alias }))

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
      <FormField id="profile-alias" label="Alias">
        <Select
          id="profile-alias"
          value={values.alias}
          options={aliasOptions}
          onChange={(v) => update("alias", v as AliasName)}
        />
      </FormField>
      <Button onClick={() => submit()}>Save</Button>
      <Button variant="secondary" onClick={() => onCancel()}>
        Cancel
      </Button>
    </form>
  )
}
