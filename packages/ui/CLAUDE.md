# @spectrum/ui

**Responsibility:** React atomic design system — pure, presentational components (atoms → templates) that the desktop pages compose.

**Public API (barrel `src/index.ts`):** atoms (`Button`, `TextInput`, `Select`, `Badge`, `StatusDot`, `Spinner`, `Label`, `Tooltip`, `Icon`), molecules (`FormField`, `ModelRow`, `EmptyState`, `Composer`, `ModeSelector`), organisms (`ProviderList`, `ModelTable`, `ProjectGroup`, `ProjectList`), templates (`AppShell`, `SettingsLayout`) — each re-exported via its level barrel and the package barrel. The `Icon` glyph set has grown to include `send`, `stop`, `chevron-down`, `shield`, `pencil`, `list`, and `zap`. `StatusDot` now has an `error` (red) variant in addition to the existing status states.

**Depends on:** `@spectrum/types`, `@spectrum/utils`, `@spectrum/agent-events`, `@spectrum/brand` (prop shapes, pure formatting, and the canonical event/view-state vocabulary only; never `ipc`/`config`/`proxy`/`sessions`/`harnesses`).

**Effects owned:** none. No data fetching, no IPC, no global state.

**Local rules:** atoms→organisms are pure/presentational — typed props in, JSX out, events out via callback props; follow `01-conventions/atomic-design.md`. Data enters only at the page level (in `apps/desktop`), never here. Every component has an explicit `Props` type (no `any`). Provider props use a secret-free display shape (`Pick<Provider, "id" | "name" | "sdkProvider">`) — no `secrets` field ever reaches a component. One component per file with a co-located `*.test.tsx`. Long lists take a paging prop and the page loads incrementally (e.g. `ProjectGroup` shows a bounded page of sessions with a "Show more" affordance; `01-conventions/performance.md`).
