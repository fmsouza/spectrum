/** Typed failures for every projects operation. Never thrown — always returned. */
export type ProjectError =
  | { readonly kind: "invalid-path" }
  | { readonly kind: "db-failed"; readonly detail: string }
