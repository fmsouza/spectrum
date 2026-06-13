import { type ReactElement, useRef } from "react"

export type MarkVariant = "color" | "mono-white" | "mono-black"

export type SpectrumMarkProps = {
  readonly size?: number
  readonly title?: string
  readonly variant?: MarkVariant
}

let markSeq = 0

const escapeHtml = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

// Verbatim inner markup from spectrum-brand/logo/spectrum-mark.svg.
const COLOR_BODY = `<defs><radialGradient id="mk_hub" cx="38%" cy="30%" r="78%"><stop offset="0" stop-color="#8FB0F5"/><stop offset="1" stop-color="#3E6FD4"/></radialGradient></defs><circle cx="120" cy="128" r="37" fill="#5B8DEF" opacity="0.13"/><g stroke-linecap="round" stroke-width="7.5"><line x1="50" y1="128" x2="95" y2="128" stroke="#D7D9E0"/><line x1="134.69" y1="107.77" x2="183.48" y2="40.63" stroke="#A56BFF"/><line x1="142.28" y1="116.65" x2="216.23" y2="78.97" stroke="#22D3EE"/><line x1="145.00" y1="128.00" x2="228.00" y2="128.00" stroke="#4ADE80"/><line x1="142.28" y1="139.35" x2="216.23" y2="177.03" stroke="#FFB13B"/><line x1="134.69" y1="148.23" x2="183.48" y2="215.37" stroke="#F472B6"/></g><circle cx="38" cy="128" r="11" fill="#D7D9E0"/><circle cx="183.48" cy="40.63" r="12.50" fill="#A56BFF"/><circle cx="216.23" cy="78.97" r="12.50" fill="#22D3EE"/><circle cx="228.00" cy="128.00" r="12.50" fill="#4ADE80"/><circle cx="216.23" cy="177.03" r="12.50" fill="#FFB13B"/><circle cx="183.48" cy="215.37" r="12.50" fill="#F472B6"/><circle cx="120" cy="128" r="25" fill="url(#mk_hub)"/><circle cx="120" cy="128" r="15" fill="none" stroke="rgba(255,255,255,0.55)" stroke-width="2.5"/><circle cx="120" cy="128" r="5" fill="#FFFFFF"/>`

// Verbatim inner markup from spectrum-brand/logo/spectrum-mark-mono-white.svg.
const MONO_WHITE_BODY = `<g stroke="#FFFFFF" stroke-linecap="round" stroke-width="7.5"><line x1="50" y1="128" x2="95" y2="128"/><line x1="134.69" y1="107.77" x2="183.48" y2="40.63"/><line x1="142.28" y1="116.65" x2="216.23" y2="78.97"/><line x1="145.00" y1="128.00" x2="228.00" y2="128.00"/><line x1="142.28" y1="139.35" x2="216.23" y2="177.03"/><line x1="134.69" y1="148.23" x2="183.48" y2="215.37"/></g><g fill="#FFFFFF"><circle cx="38" cy="128" r="11"/><circle cx="183.48" cy="40.63" r="12.50"/><circle cx="216.23" cy="78.97" r="12.50"/><circle cx="228.00" cy="128.00" r="12.50"/><circle cx="216.23" cy="177.03" r="12.50"/><circle cx="183.48" cy="215.37" r="12.50"/><circle cx="120" cy="128" r="22" fill="none" stroke="#FFFFFF" stroke-width="7"/><circle cx="120" cy="128" r="6"/></g>`

// Verbatim inner markup from spectrum-brand/logo/spectrum-mark-mono-black.svg.
const MONO_BLACK_BODY = `<g stroke="#000000" stroke-linecap="round" stroke-width="7.5"><line x1="50" y1="128" x2="95" y2="128"/><line x1="134.69" y1="107.77" x2="183.48" y2="40.63"/><line x1="142.28" y1="116.65" x2="216.23" y2="78.97"/><line x1="145.00" y1="128.00" x2="228.00" y2="128.00"/><line x1="142.28" y1="139.35" x2="216.23" y2="177.03"/><line x1="134.69" y1="148.23" x2="183.48" y2="215.37"/></g><g fill="#000000"><circle cx="38" cy="128" r="11"/><circle cx="183.48" cy="40.63" r="12.50"/><circle cx="216.23" cy="78.97" r="12.50"/><circle cx="228.00" cy="128.00" r="12.50"/><circle cx="216.23" cy="177.03" r="12.50"/><circle cx="183.48" cy="215.37" r="12.50"/><circle cx="120" cy="128" r="22" fill="none" stroke="#000000" stroke-width="7"/><circle cx="120" cy="128" r="6"/></g>`

const MONO_BODY: Record<Exclude<MarkVariant, "color">, string> = {
  "mono-white": MONO_WHITE_BODY,
  "mono-black": MONO_BLACK_BODY,
}

export const SpectrumMark = ({
  size = 24,
  title,
  variant = "color",
}: SpectrumMarkProps): ReactElement => {
  const hubIdRef = useRef<string | null>(null)
  if (hubIdRef.current === null) {
    markSeq += 1
    hubIdRef.current = `sp_hub_${markSeq}`
  }
  const hubId = hubIdRef.current
  const body =
    variant === "color"
      ? COLOR_BODY.replaceAll("mk_hub", hubId)
      : MONO_BODY[variant]
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 256 256"
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title ? escapeHtml(title) : undefined}
      // biome-ignore lint/security/noDangerouslySetInnerHtml: static, in-repo brand SVG markup only
      dangerouslySetInnerHTML={{
        __html: (title ? `<title>${escapeHtml(title)}</title>` : "") + body,
      }}
    />
  )
}
