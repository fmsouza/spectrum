import { GlobalRegistrator } from "@happy-dom/global-registrator"

// Register happy-dom before any testing-library code runs.
// ESM static imports are hoisted, so modules that check for `document`
// at module-evaluation time must be imported after registration via
// dynamic import() to respect the ordering.
GlobalRegistrator.register()

// Now that a global document exists, load testing-library modules dynamically.
const { afterEach, expect } = await import("bun:test")
const matchers = await import("@testing-library/jest-dom/matchers")
const { cleanup } = await import("@testing-library/react")

expect.extend(matchers)
afterEach(() => cleanup())
