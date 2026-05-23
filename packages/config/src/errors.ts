/** Every failure mode for reading, parsing, migrating, or writing the config file. */
export type ConfigError =
  | { readonly kind: "not-found" }
  | { readonly kind: "parse-failed"; readonly detail: string }
  | { readonly kind: "migration-failed"; readonly detail: string }
  | { readonly kind: "write-failed"; readonly detail: string }
