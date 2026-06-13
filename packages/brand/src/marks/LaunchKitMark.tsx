import type { ReactElement } from "react"

export type MarkVariant = "color" | "mono-white" | "mono-black"

export type LaunchKitMarkProps = {
  readonly size?: number
  readonly title?: string
  readonly variant?: MarkVariant
}

// Verbatim from launchkit-brand/logo/launchkit-mark.svg (inner markup only).
const COLOR_BODY = `<defs><radialGradient id="mk_hub" cx="38%" cy="30%" r="78%"><stop offset="0" stop-color="#8FB0F5"/><stop offset="1" stop-color="#3E6FD4"/></radialGradient></defs><circle cx="120" cy="128" r="37" fill="#5B8DEF" opacity="0.13"/><g fill="none" stroke-width="7.5" stroke-linecap="round"><path d="M52 128 L95 128" stroke="#FFB13B"/><path d="M139 114 C170 84 190 70 200.5 64.5" stroke="#A56BFF"/><path d="M145 128 L216 128" stroke="#22D3EE"/><path d="M139 142 C170 172 190 186 200.5 191.5" stroke="#4ADE80"/></g><circle cx="40" cy="128" r="12" fill="#FFB13B"/><circle cx="212" cy="62" r="13" fill="#A56BFF"/><circle cx="228" cy="128" r="13" fill="#22D3EE"/><circle cx="212" cy="194" r="13" fill="#4ADE80"/><circle cx="120" cy="128" r="25" fill="url(#mk_hub)"/><circle cx="120" cy="128" r="15" fill="none" stroke="rgba(255,255,255,0.55)" stroke-width="2.5"/><circle cx="120" cy="128" r="5" fill="#FFFFFF"/>`

// Verbatim inner markup from launchkit-brand/logo/launchkit-mark-mono-white.svg
const MONO_WHITE_BODY = `<g fill="none" stroke="#FFFFFF" stroke-width="7.5" stroke-linecap="round"><path d="M52 128 L95 128"/><path d="M139 114 C170 84 190 70 200.5 64.5"/><path d="M145 128 L216 128"/><path d="M139 142 C170 172 190 186 200.5 191.5"/></g><g fill="#FFFFFF"><circle cx="40" cy="128" r="12"/><circle cx="212" cy="62" r="13"/><circle cx="228" cy="128" r="13"/><circle cx="212" cy="194" r="13"/><circle cx="120" cy="128" r="22" fill="none" stroke="#FFFFFF" stroke-width="7"/><circle cx="120" cy="128" r="6"/></g>`
// Verbatim inner markup from launchkit-brand/logo/launchkit-mark-mono-black.svg
const MONO_BLACK_BODY = `<g fill="none" stroke="#000000" stroke-width="7.5" stroke-linecap="round"><path d="M52 128 L95 128"/><path d="M139 114 C170 84 190 70 200.5 64.5"/><path d="M145 128 L216 128"/><path d="M139 142 C170 172 190 186 200.5 191.5"/></g><g fill="#000000"><circle cx="40" cy="128" r="12"/><circle cx="212" cy="62" r="13"/><circle cx="228" cy="128" r="13"/><circle cx="212" cy="194" r="13"/><circle cx="120" cy="128" r="22" fill="none" stroke="#000000" stroke-width="7"/><circle cx="120" cy="128" r="6"/></g>`

const BODY: Record<MarkVariant, string> = {
  color: COLOR_BODY,
  "mono-white": MONO_WHITE_BODY,
  "mono-black": MONO_BLACK_BODY,
}

export const LaunchKitMark = ({
  size = 24,
  title,
  variant = "color",
}: LaunchKitMarkProps): ReactElement => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 256 256"
    role={title ? "img" : undefined}
    aria-hidden={title ? undefined : true}
    aria-label={title}
    // biome-ignore lint/security/noDangerouslySetInnerHtml: static, in-repo brand SVG markup only
    dangerouslySetInnerHTML={{
      __html: (title ? `<title>${title}</title>` : "") + BODY[variant],
    }}
  />
)
