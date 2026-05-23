/** Every failure mode a CLI invocation can produce. */
export type CliError =
  | { readonly kind: "unknown-command"; readonly command: string }
  | { readonly kind: "usage"; readonly detail: string }
  | { readonly kind: "failed"; readonly detail: string }
