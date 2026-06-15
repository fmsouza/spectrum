/** Typed failures for every data-admin operation. Never thrown — always returned. */
export type DataAdminError = {
  readonly kind: "db-failed"
  readonly detail: string
}
