import type {
  AliasName,
  HarnessDefinition,
  HarnessId,
  ModelAlias,
  Profile,
} from "@launchkit/types"
import { useEffect, useState } from "react"
import type { ReactElement } from "react"
import { Button } from "../atoms/Button"
import { Modal } from "../atoms/Modal"
import { Select } from "../atoms/Select"
import { TextInput } from "../atoms/TextInput"
import { FolderField } from "../molecules/FolderField"
import { FormField } from "../molecules/FormField"

export type NewSessionValues = {
  readonly name: string
  readonly cwd: string
  readonly harnessId: HarnessId
  readonly alias: AliasName
  readonly env: Record<string, string>
  readonly saveAsProfile?: { readonly name: string }
}

export type NewSessionModalProps = {
  readonly open: boolean
  readonly profiles: readonly Profile[]
  readonly harnesses: readonly HarnessDefinition[]
  readonly aliases: readonly ModelAlias[]
  readonly folder: string
  readonly onBrowse: () => void
  readonly onSubmit: (values: NewSessionValues) => void
  readonly onCancel: () => void
}

type FormState = {
  readonly name: string
  readonly cwd: string
  readonly profileId: string
  readonly harnessId: HarnessId
  readonly alias: AliasName
  readonly env: Record<string, string>
  readonly save: boolean
  readonly saveName: string
}

export const NewSessionModal = ({
  open,
  profiles,
  harnesses,
  aliases,
  folder,
  onBrowse,
  onSubmit,
  onCancel,
}: NewSessionModalProps): ReactElement => {
  const firstHarness = (harnesses[0]?.id ?? "") as HarnessId
  const firstAlias = (aliases[0]?.alias ?? "") as AliasName
  const [state, setState] = useState<FormState>({
    name: "",
    cwd: folder,
    profileId: "",
    harnessId: firstHarness,
    alias: firstAlias,
    env: {},
    save: false,
    saveName: "",
  })

  // Fix 1: sync cwd field whenever the folder prop changes (Browse flow)
  useEffect(() => {
    setState((prev) => ({ ...prev, cwd: folder }))
  }, [folder])

  // Fix 3: reset form when the modal is reopened
  useEffect(() => {
    if (open) {
      setState({
        name: "",
        cwd: folder,
        profileId: "",
        harnessId: firstHarness,
        alias: firstAlias,
        env: {},
        save: false,
        saveName: "",
      })
    }
  }, [open, folder, firstHarness, firstAlias])

  const update = <K extends keyof FormState>(
    key: K,
    value: FormState[K],
  ): void => setState((prev) => ({ ...prev, [key]: value }))

  const selectProfile = (id: string): void => {
    const profile = profiles.find((p) => p.id === id)
    if (profile === undefined) {
      update("profileId", id)
      return
    }
    setState((prev) => ({
      ...prev,
      profileId: id,
      harnessId: profile.harnessId,
      alias: profile.alias,
      env: profile.env,
    }))
  }

  const submit = (): void => {
    const values: NewSessionValues = {
      name: state.name,
      cwd: state.cwd,
      harnessId: state.harnessId,
      alias: state.alias,
      env: state.env,
      ...(state.save ? { saveAsProfile: { name: state.saveName } } : {}),
    }
    onSubmit(values)
  }

  const profileOptions = [
    { value: "", label: "None" },
    ...profiles.map((p) => ({ value: p.id, label: p.name })),
  ]
  const harnessOptions = harnesses.map((h) => ({ value: h.id, label: h.name }))
  const aliasOptions = aliases.map((a) => ({ value: a.alias, label: a.alias }))

  return (
    <Modal title="New session" open={open} onClose={onCancel}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <FormField id="session-profile" label="Profile">
          <Select
            id="session-profile"
            value={state.profileId}
            options={profileOptions}
            onChange={selectProfile}
          />
        </FormField>
        <FormField id="session-name" label="Name">
          <TextInput
            id="session-name"
            value={state.name}
            onChange={(v) => update("name", v)}
          />
        </FormField>
        <FormField id="session-folder" label="Folder">
          <FolderField
            id="session-folder"
            value={state.cwd}
            onChange={(v) => update("cwd", v)}
            onBrowse={onBrowse}
          />
        </FormField>
        <FormField id="session-harness" label="Harness">
          <Select
            id="session-harness"
            value={state.harnessId}
            options={harnessOptions}
            onChange={(v) => update("harnessId", v as HarnessId)}
          />
        </FormField>
        <FormField id="session-alias" label="Alias">
          <Select
            id="session-alias"
            value={state.alias}
            options={aliasOptions}
            onChange={(v) => update("alias", v as AliasName)}
          />
        </FormField>
        <label>
          <input
            type="checkbox"
            checked={state.save}
            onChange={(e) => update("save", e.currentTarget.checked)}
          />
          Save edits as new profile
        </label>
        {state.save ? (
          <FormField id="session-save-name" label="Profile name">
            <TextInput
              id="session-save-name"
              value={state.saveName}
              onChange={(v) => update("saveName", v)}
            />
          </FormField>
        ) : null}
        <Button onClick={() => submit()}>Launch</Button>
        <Button variant="secondary" onClick={() => onCancel()}>
          Cancel
        </Button>
      </form>
    </Modal>
  )
}
