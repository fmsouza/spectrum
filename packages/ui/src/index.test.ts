import { describe, expect, it } from "bun:test"
import * as ui from "./index"

describe("@launchkit/ui barrel", () => {
  it("exports every public component when imported", () => {
    for (const name of [
      "Button",
      "TextInput",
      "Select",
      "Badge",
      "StatusDot",
      "Spinner",
      "Label",
      "Modal",
      "IconButton",
      "FormField",
      "ModelRow",
      "EmptyState",
      "RailItem",
      "FolderField",
      "SessionRow",
      "ProviderList",
      "ModelTable",
      "HarnessForm",
      "SessionTable",
      "SessionList",
      "SettingsNav",
      "ProfileList",
      "ProfileForm",
      "NewSessionModal",
      "AppShell",
      "SettingsLayout",
    ]) {
      expect(ui).toHaveProperty(name)
    }
  })
})
