export interface Scrollback {
  append(chunk: Uint8Array): void
  snapshot(): Uint8Array
}

export const createScrollback = (capBytes: number): Scrollback => {
  let buf = new Uint8Array(0)
  return {
    append: (chunk) => {
      const combined = new Uint8Array(buf.length + chunk.length)
      combined.set(buf)
      combined.set(chunk, buf.length)
      buf =
        combined.length > capBytes
          ? combined.subarray(combined.length - capBytes)
          : combined
    },
    snapshot: () => buf,
  }
}
