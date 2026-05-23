const escapeRegExp = (s: string): string =>
  s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

export const redactSecrets = (
  text: string,
  secrets: readonly string[],
): string =>
  secrets
    .filter((s) => s.length > 0)
    .reduce(
      (acc, secret) =>
        acc.replaceAll(new RegExp(escapeRegExp(secret), "g"), "[REDACTED]"),
      text,
    )
