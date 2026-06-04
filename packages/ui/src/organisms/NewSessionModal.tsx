import type {
  AliasName,
  HarnessDefinition,
  HarnessId,
  ModelAlias,
  Profile,
} from "@launchkit/types"
import { useEffect, useRef, useState } from "react"
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
  /** A launch failure surfaced by the page; rendered as an inline alert. */
  readonly error?: string
}

type FormState = {
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
  error,
}: NewSessionModalProps): ReactElement => {
  const firstHarness = (harnesses[0]?.id ?? "") as HarnessId
  const firstAlias = (aliases[0]?.alias ?? "") as AliasName
  const [state, setState] = useState<FormState>({
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

  // Fix 3: reset form only on the false→true transition of open
  const wasOpen = useRef(false)
  useEffect(() => {
    if (open && !wasOpen.current) {
      setState({
        cwd: folder,
        profileId: "",
        harnessId: firstHarness,
        alias: firstAlias,
        env: {},
        save: false,
        saveName: "",
      })
    }
    wasOpen.current = open
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
      name: "Untitled",
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

  // A session can only launch with both a harness and a routing alias selected.
  // Without an alias the proxy has nothing to route to, so Launch stays disabled.
  const canLaunch = state.harnessId !== "" && state.alias !== ""
  const noAliases = aliases.length === 0

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
        {noAliases ? (
          <p role="alert">
            No model alias is configured. Add one under Settings → Routing to
            start a session.
          </p>
        ) : null}
        {error === undefined ? null : <p role="alert">{error}</p>}
        <Button disabled={!canLaunch} onClick={() => submit()}>
          Launch
        </Button>
        <Button variant="secondary" onClick={() => onCancel()}>
          Cancel
        </Button>
      </form>
    </Modal>
  )
}
