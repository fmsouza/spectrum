import { describe, expect, it } from "bun:test"

// Regression guard for the blank-GUI bug: Electrobun's webview opens a WebSocket to
// `ws://localhost:<dynamic-port>` (its bun<->webview RPC bridge). A CSP that forbids that
// connection makes `new Electroview()` throw in its constructor, so the React app never mounts
// and the window renders blank. The CSP must stay hardened BUT permit the loopback ws bridge.
const indexHtml = await Bun.file(
  new URL("./index.html", import.meta.url),
).text()

const cspContent = (html: string): string => {
  const match = html.match(
    /http-equiv="Content-Security-Policy"\s+content="([^"]+)"/,
  )
  if (match?.[1] === undefined) throw new Error("no CSP meta tag found")
  return match[1]
}

const directive = (csp: string, name: string): string => {
  const part = csp.split(";").find((d) => d.trim().startsWith(`${name} `))
  if (part === undefined) throw new Error(`no ${name} directive`)
  return part.trim()
}

describe("views/main/index.html CSP", () => {
  it("permits the Electrobun loopback ws bridge in connect-src so the webview can mount", () => {
    const connectSrc = directive(cspContent(indexHtml), "connect-src")
    expect(connectSrc).toContain("ws://localhost:*")
  })

  it("keeps the CSP hardened: no remote script, no eval, no object/frame", () => {
    const csp = cspContent(indexHtml)
    expect(directive(csp, "script-src")).toBe("script-src 'self'")
    expect(directive(csp, "object-src")).toBe("object-src 'none'")
    expect(directive(csp, "frame-ancestors")).toBe("frame-ancestors 'none'")
  })

  it("links the LaunchKit favicon", () => {
    expect(indexHtml).toContain('rel="icon"')
    expect(indexHtml).toContain("launchkit-favicon.svg")
  })
})
