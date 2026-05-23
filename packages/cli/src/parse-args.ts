/** The structured result of tokenizing the argv tail. */
export type ParsedArgs = {
  readonly command: string
  readonly rest: readonly string[]
  readonly flags: Readonly<Record<string, string | boolean>>
}

const isFlag = (token: string): boolean => token.startsWith("--")
const flagName = (token: string): string => token.slice(2)

/**
 * Pure argv tokenizer. The first non-flag token is the `command`; subsequent non-flag
 * tokens are `rest` (positionals). `--key value` yields a string flag; a bare `--flag`
 * (followed by another flag or the end of input) yields a boolean `true`.
 */
export const parseArgs = (argv: readonly string[]): ParsedArgs => {
  let command = ""
  const rest: string[] = []
  const flags: Record<string, string | boolean> = {}

  let i = 0
  while (i < argv.length) {
    const token = argv[i]
    if (token === undefined) {
      i += 1
      continue
    }
    if (isFlag(token)) {
      const next = argv[i + 1]
      if (next !== undefined && !isFlag(next)) {
        flags[flagName(token)] = next
        i += 2
      } else {
        flags[flagName(token)] = true
        i += 1
      }
    } else {
      if (command === "") command = token
      else rest.push(token)
      i += 1
    }
  }

  return { command, rest, flags }
}
