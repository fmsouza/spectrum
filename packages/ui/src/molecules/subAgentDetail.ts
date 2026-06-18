import type { Json } from "@spectrum/agent-events"

const asString = (v: unknown): string | undefined =>
  typeof v === "string" && v.trim().length > 0 ? v.trim() : undefined

const firstLine = (v: unknown): string | undefined => {
  const s = asString(v)
  return s === undefined ? undefined : (s.split("\n")[0] as string)
}

/**
 * The human hint shown beside "Agent" on a sub-runner row: the spawning tool's task description,
 * else the first line of its prompt, else the agent type / name. PURE.
 */
export const subAgentDetail = (input: Json | undefined): string | undefined => {
  if (
    input === null ||
    input === undefined ||
    typeof input !== "object" ||
    Array.isArray(input)
  )
    return undefined
  const o = input as Record<string, unknown>
  return (
    asString(o.description) ??
    firstLine(o.prompt) ??
    asString(o.subagent_type) ??
    asString(o.name)
  )
}
