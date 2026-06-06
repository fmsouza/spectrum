import type { ReactElement } from "react"

export type SettingsSection = {
  readonly key: string
  readonly label: string
}

export type SettingsNavProps = {
  readonly sections: readonly SettingsSection[]
  readonly active: string
  readonly onSelect: (key: string) => void
}

export const SettingsNav = ({
  sections,
  active,
  onSelect,
}: SettingsNavProps): ReactElement => (
  <ul className="lk-settings-nav">
    {sections.map((section) => (
      <li key={section.key}>
        <a
          href={`#${section.key}`}
          aria-current={section.key === active ? "page" : undefined}
          onClick={(e) => {
            e.preventDefault()
            onSelect(section.key)
          }}
        >
          {section.label}
        </a>
      </li>
    ))}
  </ul>
)
