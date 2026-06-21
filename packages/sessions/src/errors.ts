/** Typed failures for every sessions operation. Never thrown — always returned. */
export type SessionError =
  | { readonly kind: "not-found" }
  | { readonly kind: "db-failed"; readonly detail: string }
  | { readonly kind: "invalid-name" }
