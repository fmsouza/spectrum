export type { SecretError, KeychainBackend } from "./backend"
export { createInMemoryKeychainBackend } from "./backend"
export type { SecretStore } from "./store"
export { createSecretStore } from "./store"
export type { ProcessRunner } from "./process-runner"
export { createBunProcessRunner } from "./bun-process-runner"
export { createMacosSecurityBackend } from "./macos-backend"
export type { SecretFileOps } from "./secret-file-ops"
export {
  createFsSecretFileOps,
  createInMemorySecretFileOps,
} from "./secret-file-ops"
export type { SecretCipher } from "./cipher"
export { createPassphraseAeadCipher } from "./cipher-passphrase"
export { createDpapiCipher } from "./cipher-dpapi"
export { createEncryptedFileBackend } from "./encrypted-file-backend"
export { createSecretToolBackend } from "./secret-tool-backend"
export { isSecretServiceAvailable } from "./secret-service-probe"
export {
  type PlatformKeychainDeps,
  createPlatformKeychainBackend,
} from "./platform-keychain-backend"
