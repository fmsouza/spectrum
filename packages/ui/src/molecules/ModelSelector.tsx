import type { ModelRoute } from "@launchkit/types"
import { type ReactElement, useState } from "react"
import { Icon } from "../atoms/Icon"

export type ModelSelectorProps = {
  /** Current model id, or "" for the default (no-proxy) route. */
  readonly model: string
  readonly models: readonly ModelRoute[]
  readonly providerNames?: Readonly<Record<string, string>>
  readonly onChange: (modelId: string) => void
  readonly disabled?: boolean
}

const labelFor = (
  m: ModelRoute,
  providerNames?: Readonly<Record<string, string>>,
): string =>
  `${providerNames?.[String(m.providerId)] ?? String(m.providerId)} / ${m.providerModel}`

const DEFAULT_OPTION = "" // sentinel: "" = "default" (no proxy route)

export const ModelSelector = ({
  model,
  models,
  providerNames,
  onChange,
  disabled = false,
}: ModelSelectorProps): ReactElement => {
  const [open, setOpen] = useState(false)
  // Resolve the current model to a label; fall back to the raw id if the route is gone.
  const currentRoute = models.find((m) => String(m.id) === model)
  const pillLabel =
    model === DEFAULT_OPTION
      ? "default"
      : currentRoute !== undefined
        ? labelFor(currentRoute, providerNames)
        : model

  // The menu always starts with a "default" option (model id = "") followed by every route.
  const options: readonly { readonly id: string; readonly label: string }[] = [
    { id: DEFAULT_OPTION, label: "default" },
    ...models.map((m) => ({
      id: String(m.id),
      label: labelFor(m, providerNames),
    })),
  ]

  return (
    // Escape/blur handled on the wrapper so they work whether focus sits on
    // the pill or inside the menu; focus leaving the wrapper entirely
    // (outside click, Tab away) dismisses the menu.
    <div
      className="lk-mode-selector"
      onKeyDown={(e) => {
        if (e.key === "Escape") setOpen(false)
      }}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false)
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
        {pillLabel}
        <Icon name="chevron-down" size={12} />
      </button>
      {open ? (
        <div className="lk-mode-selector__menu" role="menu">
          {options.map((o) => (
            <button
              key={o.id}
              type="button"
              role="menuitemradio"
              aria-checked={o.id === model}
              className="lk-mode-selector__item"
              onClick={() => {
                setOpen(false)
                if (o.id !== model) onChange(o.id)
              }}
            >
              {o.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
