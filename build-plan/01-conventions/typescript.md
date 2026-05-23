# Convention — TypeScript

**TypeScript only. Strict everywhere. No `any`.**

## Compiler settings

`tsconfig.base.json` at the repo root is extended by every package. It sets at least:

```jsonc
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ESNext", "DOM", "DOM.Iterable"],
    "types": ["bun"],

    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "noImplicitReturns": true,
    "forceConsistentCasingInFileNames": true,
    "verbatimModuleSyntax": true,

    "skipLibCheck": true,
    "noEmit": true,
    "isolatedModules": true,
    "esModuleInterop": true,
    "resolveJsonModule": true
  }
}
```

The React package/app additionally sets `"jsx": "react-jsx"`.

## Rules

1. **Every function has an explicit input type and an explicit return type.** Do not rely on inference for any exported or public function signature. Internal one-line helpers may infer return types only when trivially obvious, but prefer explicit.
2. **`any` is banned** (Biome enforces `noExplicitAny`). At boundaries (network, fs, IPC) accept `unknown` and narrow with a zod schema. Inside the typed core, types are known.
3. **Prefer `type` aliases and discriminated unions** over `enum` and over classes. Use `interface` only for object shapes that benefit from declaration merging (rare here).
4. **`readonly` by default.** Mark object properties and array params `readonly`. Use `as const` for literal tuples/objects. No in-place mutation of inputs.
5. **No non-null assertions (`!`)** except immediately after a checked invariant with a comment. Prefer narrowing.
6. **Derive types from zod schemas** where a runtime schema exists: `type Provider = z.infer<typeof ProviderSchema>`. One source of truth.
7. **Branded types for ids** where confusion is possible: `type ProviderId = string & { readonly __brand: "ProviderId" }`. Construct via a validated smart constructor in `@launchkit/utils`.
8. **No default exports.** Named exports only, re-exported through each package's `src/index.ts` barrel.
9. **Imports** use `import type { … }` for type-only imports (`verbatimModuleSyntax` requires it).

## Verification

`bun run typecheck` runs `tsc --noEmit` across the workspace via Turborepo. It must be clean. Type errors are never "fixed" with `any`, `// @ts-ignore`, or `as unknown as X`.
