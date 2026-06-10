/** Typed failures for every run-store operation. Never thrown — always returned in a Result. */
export type RunStoreError = {
  readonly kind: "db-failed"
  readonly detail: string
}
