import { GlobalRegistrator } from "@happy-dom/global-registrator"

// happy-dom is registered globally for the whole `bun test` run (Bun's
// test preload is process-wide), but it replaces Bun's native web-platform
// globals with its own JS implementations. Bun's server (`Bun.serve`) and
// the Vercel AI SDK used by the proxy package require the *native* classes
// ("Expected a Response object" / "readable should be ReadableStream" when
// given happy-dom's). Capture the native constructors and restore them after
// registration — pure React/DOM component tests never touch network or
// stream APIs, so they keep everything they need (document, window, …).
const native = {
  ReadableStream: globalThis.ReadableStream,
  WritableStream: globalThis.WritableStream,
  TransformStream: globalThis.TransformStream,
  Response: globalThis.Response,
  Request: globalThis.Request,
  Headers: globalThis.Headers,
  fetch: globalThis.fetch,
  Blob: globalThis.Blob,
  FormData: globalThis.FormData,
} as const

// Register happy-dom before any testing-library code runs.
// ESM static imports are hoisted, so modules that check for `document`
// at module-evaluation time must be imported after registration via
// dynamic import() to respect the ordering.
GlobalRegistrator.register()

Object.assign(globalThis, native)

// Now that a global document exists, load testing-library modules dynamically.
const { afterEach, expect } = await import("bun:test")
const matchers = await import("@testing-library/jest-dom/matchers")
const { cleanup } = await import("@testing-library/react")

expect.extend(matchers)
afterEach(() => cleanup())
