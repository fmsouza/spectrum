import type { ReactElement, ReactNode } from "react"

export type SettingsLayoutProps = {
  readonly title: string
  readonly children: ReactNode
}

export const SettingsLayout = ({
  title,
  children,
}: SettingsLayoutProps): ReactElement => (
  <section className="lk-page">
    <header className="lk-page__header">
      <h1>{title}</h1>
    </header>
    <div className="lk-page__body">{children}</div>
  </section>
)
