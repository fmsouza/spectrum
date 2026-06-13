import type { ApplicationMenuItemConfig } from "electrobun/bun"

/**
 * The macOS application menu descriptor (PURE). The **Edit** roles (`undo`/`redo`/`cut`/`copy`/`paste`/
 * `selectAll`) map to the standard NSResponder selectors, and the accelerators install their key
 * equivalents. Without this menu a WKWebView never receives `Cmd+C/V/X/A` — so copy/paste in the
 * conversation + composer silently do nothing. The App submenu carries Quit (and friends) so the
 * window is closable from the menu bar too.
 */
export const buildAppMenu = (appName: string): ApplicationMenuItemConfig[] => [
  {
    label: appName,
    submenu: [
      { role: "about" },
      { type: "separator" },
      { role: "hide", accelerator: "CommandOrControl+H" },
      { role: "hideOthers" },
      { role: "showAll" },
      { type: "separator" },
      { role: "quit", accelerator: "CommandOrControl+Q" },
    ],
  },
  {
    label: "Edit",
    submenu: [
      { role: "undo", accelerator: "CommandOrControl+Z" },
      { role: "redo", accelerator: "CommandOrControl+Shift+Z" },
      { type: "separator" },
      { role: "cut", accelerator: "CommandOrControl+X" },
      { role: "copy", accelerator: "CommandOrControl+C" },
      { role: "paste", accelerator: "CommandOrControl+V" },
      { role: "selectAll", accelerator: "CommandOrControl+A" },
    ],
  },
]

/**
 * Install the native application menu. Electrobun is imported lazily (only present in the built
 * binary — mirrors `gui/tray.ts`/`gui/window.ts`), so the rest of the shell stays unit-testable.
 */
export const mountAppMenu = (appName = "Spectrum"): void => {
  void import("electrobun/bun").then(({ ApplicationMenu }) => {
    ApplicationMenu.setApplicationMenu(buildAppMenu(appName))
  })
}
