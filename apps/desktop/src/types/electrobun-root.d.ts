/**
 * Local type surface for the Electrobun **root** export (`electrobun`), used only by
 * `electrobun.config.ts` for the `ElectrobunConfig` type. See `electrobun-bun.d.ts` for the full
 * rationale: Electrobun ships non-strict-compiling `.ts` source, so we map `"electrobun"` onto this
 * declaration via the desktop `tsconfig.json` `paths` (type resolution only). This is a SUBSET of
 * the real `ElectrobunConfig` — the authoritative validator is `electrobun build` itself.
 */

export interface ElectrobunConfig {
  app: {
    name: string
    identifier: string
    version: string
    description?: string
  }
  build?: {
    bun?: { entrypoint?: string }
    views?: { [viewName: string]: { entrypoint: string } }
    copy?: { [sourcePath: string]: string }
    buildFolder?: string
    targets?: string
    mac?: { codesign?: boolean; createDmg?: boolean; notarize?: boolean }
    linux?: { bundleCEF?: boolean; defaultRenderer?: "native" | "cef" }
    win?: { bundleCEF?: boolean; defaultRenderer?: "native" | "cef" }
  }
}
