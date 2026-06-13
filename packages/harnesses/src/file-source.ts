import { type Result, err, ok } from "@spectrum/utils"
import type { HarnessError } from "./errors"

/**
 * Reads + JSON-parses each `*.json` file in the user harness directory, and
 * writes/deletes individual definitions. Reads return the raw parsed values
 * (still `unknown`); validation happens in the registry. Writes validate first.
 */
export interface HarnessFileSource {
  listDefinitions(): Promise<Result<readonly unknown[], HarnessError>>
  writeDefinition(definition: unknown): Promise<Result<void, HarnessError>>
  deleteDefinition(id: string): Promise<Result<void, HarnessError>>
}

/** Best-effort id extraction from a raw definition (mirrors what `listDefinitions` stores). */
const idOf = (definition: unknown): string | undefined => {
  if (typeof definition !== "object" || definition === null) return undefined
  const id = (definition as { id?: unknown }).id
  return typeof id === "string" ? id : undefined
}

/**
 * In-memory fake: holds a mutable list of raw defs. `writeDefinition` upserts by id,
 * `deleteDefinition` filters by id. A preset `failure` short-circuits every method.
 */
export const createInMemoryHarnessFileSource = (
  defs: readonly unknown[],
  failure?: HarnessError,
): HarnessFileSource => {
  const store: unknown[] = [...defs]
  return {
    listDefinitions: async (): Promise<
      Result<readonly unknown[], HarnessError>
    > => (failure === undefined ? ok([...store]) : err(failure)),

    writeDefinition: async (
      definition: unknown,
    ): Promise<Result<void, HarnessError>> => {
      if (failure !== undefined) return err(failure)
      const id = idOf(definition)
      const index = store.findIndex((d) => idOf(d) === id)
      if (index >= 0) store[index] = definition
      else store.push(definition)
      return ok(undefined)
    },

    deleteDefinition: async (
      id: string,
    ): Promise<Result<void, HarnessError>> => {
      if (failure !== undefined) return err(failure)
      const next = store.filter((d) => idOf(d) !== id)
      store.length = 0
      store.push(...next)
      return ok(undefined)
    },
  }
}
