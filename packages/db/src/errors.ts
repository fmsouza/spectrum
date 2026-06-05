/** Typed failures for every db operation. Never thrown — always returned in a Result. */
export type DbError =
  | { readonly kind: "open-failed"; readonly detail: string }
  | { readonly kind: "migration-failed"; readonly detail: string }
  | { readonly kind: "query-failed"; readonly detail: string }
