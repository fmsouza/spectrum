/** The only thing the CLI knows about output. Production wires stdout; tests record lines. */
export interface Writer {
  write(line: string): void
}

/** A `Writer` for unit tests — records every line so assertions can read `lines`. */
export interface MemoryWriter extends Writer {
  readonly lines: readonly string[]
}

export const createMemoryWriter = (): MemoryWriter => {
  const lines: string[] = []
  return {
    get lines(): readonly string[] {
      return lines
    },
    write: (line: string): void => {
      lines.push(line)
    },
  }
}
