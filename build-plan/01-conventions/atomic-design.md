# Convention — Atomic Design (React UI only)

Applies to `packages/ui` (the design system) and `apps/desktop/views/main` (page composition). Backend packages do **not** use atomic design — they follow `functional-style.md`.

## The hierarchy

| Level | What it is | Examples | Rules |
|---|---|---|---|
| **atoms** | Smallest UI primitives. No app domain knowledge. | `Button`, `TextInput`, `Select`, `Badge`, `StatusDot`, `Label`, `Spinner`, `Icon` | Pure, fully presentational. Props in, JSX out. No IPC, no fetching, no global state. |
| **molecules** | A few atoms combined for one small purpose. | `FormField` (Label+Input+error), `ProviderCard`, `AliasRow`, `SearchBox` | Pure. Compose atoms. Still no data fetching. |
| **organisms** | Larger sections combining molecules/atoms. | `ProviderList`, `AliasTable`, `HarnessForm`, `SessionTable`, `TrayStatusBar` | Pure. Receive data + callbacks via props. |
| **templates** | Page-level layout/scaffolding, no real data. | `AppShell` (sidebar + content), `SettingsLayout` | Layout only; slots for organisms. |
| **pages** | A route. Wires data to a template. | `DashboardPage`, `ProvidersPage`, `RoutingPage`, `HarnessesPage`, `SessionsPage` | **The only place data enters.** Calls IPC hooks, passes data + handlers down. |

## Rules

1. **Dumb components never fetch.** Atoms → organisms are pure and presentational: they receive everything via typed props and emit events via callback props. Data flows *down*, events flow *up*.
2. **Data enters only at the page level**, via IPC-client hooks (e.g. `useProviders()` calling the `@launchkit/ipc` client). Pages compose a template + organisms and pass props down.
3. **Typed props, no `any`.** Every component has an explicit `Props` type. Prefer required props; optional only when truly optional.
4. **One component per file**, named `ComponentName.tsx`, co-located with `ComponentName.test.tsx`. Re-export through the level barrel (`atoms/index.ts`) and the package barrel.
5. **No business logic in components.** Formatting helpers, validation, and transforms are pure functions imported from `@launchkit/utils` or a local `lib/`. Components only render.
6. **Styling**: scoped CSS (CSS modules or a tiny utility layer — decided in `phase0`/`ui` plan). No inline business logic in styles.
7. **Accessibility**: atoms render correct semantic elements and ARIA where needed; this is asserted in tests.

## Testing components

Use `@testing-library/react` on happy-dom (`tdd.md`). Test **behavior the user sees**, not internals:

```typescript
it("calls onLaunch with the harness id when the launch button is clicked", async () => {
  const onLaunch = mock(() => {})
  render(<ProviderCard provider={fakeProvider} onLaunch={onLaunch} />)
  await userEvent.click(screen.getByRole("button", { name: /launch/i }))
  expect(onLaunch).toHaveBeenCalledWith(fakeProvider.id)
})
```

Pages are tested with the IPC client faked (injected), so no real main-process calls.
