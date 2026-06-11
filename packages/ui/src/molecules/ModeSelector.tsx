import type { PermissionMode } from "@launchkit/agent-events"
import { type ReactElement, useState } from "react"
import { Icon, type IconName } from "../atoms/Icon"

export type ModeSelectorProps = {
  readonly mode: PermissionMode
  readonly supportedModes: readonly PermissionMode[]
  readonly onChange: (mode: PermissionMode) => void
  readonly disabled?: boolean
}

const MODE_META: Record<
  PermissionMode,
  { readonly label: string; readonly hint: string; readonly icon: IconName }
> = {
  manual: {
    label: "Manual approval",
    hint: "Ask before every tool use",
    icon: "shield",
  },
  "auto-edits": {
    label: "Auto-approve edits",
    hint: "File edits run without asking",
    icon: "pencil",
  },
  plan: {
    label: "Plan mode",
    hint: "Read-only; the agent proposes a plan",
    icon: "list",
  },
  bypass: {
    label: "Bypass permissions",
    hint: "Run everything without asking",
    icon: "zap",
  },
}

export const ModeSelector = ({
  mode,
  supportedModes,
  onChange,
  disabled = false,
}: ModeSelectorProps): ReactElement => {
  const [open, setOpen] = useState(false)
  const current = MODE_META[mode]
  return (
    // Escape is handled on the wrapper so it works whether focus sits on the
    // pill (just opened by click) or inside the menu.
    <div
      className="lk-mode-selector"
      onKeyDown={(e) => {
        if (e.key === "Escape") setOpen(false)
      }}
    >
      <button
        type="button"
        className="lk-mode-selector__pill"
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
      >
        <Icon name={current.icon} size={12} />
        {current.label}
        <Icon name="chevron-down" size={12} />
      </button>
      {open ? (
        <div className="lk-mode-selector__menu" role="menu">
          {supportedModes.map((m) => (
            <button
              key={m}
              type="button"
              role="menuitemradio"
              aria-checked={m === mode}
              className="lk-mode-selector__item"
              onClick={() => {
                setOpen(false)
                if (m !== mode) onChange(m)
              }}
            >
              <Icon name={MODE_META[m].icon} size={12} /> {MODE_META[m].label}
              <span className="lk-mode-selector__hint">
                {MODE_META[m].hint}
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
