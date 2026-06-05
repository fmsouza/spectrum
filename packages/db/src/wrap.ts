import { type Result, err, ok } from "@launchkit/utils"
import type { DbError } from "./errors"

const detailOf = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause)

/** Run a (synchronous) Drizzle call, converting any throw into a query-failed DbError. */
export const tryDb = <T>(fn: () => T): Result<T, DbError> => {
  try {
    return ok(fn())
  } catch (cause) {
    return err({ kind: "query-failed", detail: detailOf(cause) })
  }
}
