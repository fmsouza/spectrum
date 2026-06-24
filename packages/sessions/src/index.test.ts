import { describe, expect, it } from "bun:test"
import type { Session, SessionId } from "@spectrum/types"
import type { Result } from "@spectrum/utils"
import type { SessionError } from "./errors"
import * as sessions from "./index"
import type { SessionStore } from "./store"

describe("@spectrum/sessions barrel", () => {
  it("exports createSessionStore when imported", () => {
    expect(typeof sessions.createSessionStore).toBe("function")
  })

  it("no longer exports the removed bun:sqlite/in-memory adapters", () => {
    expect("createInMemoryDatabase" in sessions).toBe(false)
    expect("createBunSqliteDatabase" in sessions).toBe(false)
  })

  it("SessionStore interface includes setResumeId, reopen, and get", () => {
    const s = {} as SessionStore
    // Compile-time gate: if any signature is missing or wrong, this fails to typecheck.
    const _set: (id: SessionId, r: string) => Result<Session, SessionError> =
      s.setResumeId
    const _reopen: (id: SessionId) => Result<Session, SessionError> = s.reopen
    const _get: (id: SessionId) => Result<Session | undefined, SessionError> =
      s.get
    void _set
    void _reopen
    void _get
  })
})
