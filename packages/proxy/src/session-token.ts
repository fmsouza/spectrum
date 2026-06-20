/**
 * The proxy token a harness session presents is `<masterKey>.<base64url(modelId)>`. The masterKey is
 * the secret (constant-time checked in auth); the base64url payload self-describes the session's
 * SELECTED model id so the stateless, shared proxy can attribute any request (sub-agent, background,
 * review) to that session's route across processes — no registry, no lifecycle. The model id is the
 * user's own non-secret config value. `masterKey` is base64url and never contains ".", so the FIRST
 * "." cleanly separates the two halves.
 */
export const encodeSessionProxyKey = (
  masterKey: string,
  modelId: string,
): string => `${masterKey}.${Buffer.from(modelId, "utf8").toString("base64url")}`

export const decodeSessionToken = (
  token: string,
): { readonly masterKey: string; readonly modelId?: string } => {
  const dot = token.indexOf(".")
  if (dot === -1) return { masterKey: token }
  const masterKey = token.slice(0, dot)
  const payload = token.slice(dot + 1)
  if (payload === "") return { masterKey }
  const modelId = Buffer.from(payload, "base64url").toString("utf8")
  return modelId === "" ? { masterKey } : { masterKey, modelId }
}
