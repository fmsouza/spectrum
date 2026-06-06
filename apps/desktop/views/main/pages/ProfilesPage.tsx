import type { Profile, ProfileId } from "@launchkit/types"
import {
  Button,
  EmptyState,
  Modal,
  ProfileForm,
  ProfileList,
  SettingsLayout,
  Spinner,
} from "@launchkit/ui"
import type { ProfileFormValues } from "@launchkit/ui"
import { type ReactElement, useState } from "react"
import { useHarnesses } from "../hooks/useHarnesses"
import { useModels } from "../hooks/useModels"
import { useProfiles } from "../hooks/useProfiles"
import { useProviders } from "../hooks/useProviders"

/** Modal editor state: closed, adding (no id), or editing an existing profile. */
type Editor =
  | { readonly kind: "closed" }
  | { readonly kind: "add" }
  | { readonly kind: "edit"; readonly profile: Profile }

export const ProfilesPage = (): ReactElement => {
  const { data, loading, error, add, update, remove } = useProfiles()
  const harnesses = useHarnesses()
  const models = useModels()
  const providers = useProviders()
  const [editor, setEditor] = useState<Editor>({ kind: "closed" })

  const harnessList = harnesses.data ?? []
  const modelList = models.data ?? []

  const providerNames: Record<string, string> = {}
  for (const p of providers.data ?? []) providerNames[p.id] = p.name

  const initialValues: ProfileFormValues =
    editor.kind === "edit"
      ? {
          name: editor.profile.name,
          harnessId: editor.profile.harnessId,
          ...(editor.profile.modelId !== undefined
            ? { modelId: editor.profile.modelId }
            : {}),
          env: editor.profile.env,
        }
      : {
          name: "",
          harnessId: harnessList[0]?.id ?? ("" as Profile["harnessId"]),
          env: {},
        }

  const onSubmit = async (v: ProfileFormValues): Promise<void> => {
    if (editor.kind === "edit") {
      await update({
        id: editor.profile.id,
        name: v.name,
        harnessId: v.harnessId,
        env: v.env,
        ...(v.modelId !== undefined ? { modelId: v.modelId } : {}),
      })
    } else {
      await add(v)
    }
    setEditor({ kind: "closed" })
  }

  return (
    <SettingsLayout title="Profiles">
      {loading ? <Spinner label="Loading profiles" /> : null}
      {error !== undefined ? (
        <EmptyState
          title="Could not load profiles"
          hint={`IPC error: ${error.kind}`}
        />
      ) : null}
      {data !== undefined ? (
        <>
          <Button onClick={() => setEditor({ kind: "add" })}>
            Add profile
          </Button>
          <ProfileList
            profiles={data}
            onEdit={(p: Profile) => setEditor({ kind: "edit", profile: p })}
            onDelete={(id: ProfileId) => void remove(id)}
          />
        </>
      ) : null}
      <Modal
        title={editor.kind === "edit" ? "Edit profile" : "New profile"}
        open={editor.kind !== "closed"}
        onClose={() => setEditor({ kind: "closed" })}
      >
        <ProfileForm
          // ProfileForm reads initialValues on mount only — key by the edited
          // profile id (or "add") so switching targets re-initialises the form.
          key={editor.kind === "edit" ? editor.profile.id : "add"}
          initialValues={initialValues}
          harnesses={harnessList}
          models={modelList}
          providerNames={providerNames}
          onSubmit={(v) => void onSubmit(v)}
          onCancel={() => setEditor({ kind: "closed" })}
        />
      </Modal>
    </SettingsLayout>
  )
}
