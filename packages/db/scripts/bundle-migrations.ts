/**
 * Build/dev-time codegen: inline the drizzle-kit migrations into a TS module so
 * `bun build` includes them in the bundle. The packaged app applies migrations from
 * this generated data and never reads the `migrations/` folder at runtime.
 *
 * Run via `bun run db:generate` (chained after `drizzle-kit generate`).
 */
import { join } from "node:path"

interface JournalEntry {
  readonly idx: number
  readonly version: string
  readonly when: number
  readonly tag: string
  readonly breakpoints: boolean
}

interface Journal {
  readonly version: string
  readonly dialect: string
  readonly entries: readonly JournalEntry[]
}

const MIGRATIONS_DIR = join(import.meta.dir, "..", "src", "migrations")
const JOURNAL_PATH = join(MIGRATIONS_DIR, "meta", "_journal.json")
const OUTPUT_PATH = join(
  import.meta.dir,
  "..",
  "src",
  "migrations.generated.ts",
)

const splitStatements = (sql: string): readonly string[] =>
  sql
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter((s) => s.length > 0)

const main = async (): Promise<void> => {
  const journal = (await Bun.file(JOURNAL_PATH).json()) as Journal
  const ordered = [...journal.entries].sort((a, b) => a.idx - b.idx)

  const blocks: string[] = []
  for (const entry of ordered) {
    const sql = await Bun.file(join(MIGRATIONS_DIR, `${entry.tag}.sql`)).text()
    const statements = splitStatements(sql)
    const statementLines = statements
      .map((stmt) => `      ${JSON.stringify(stmt)},`)
      .join("\n")
    blocks.push(
      [
        "  {",
        `    tag: ${JSON.stringify(entry.tag)},`,
        `    when: ${entry.when},`,
        "    statements: [",
        statementLines,
        "    ],",
        "  },",
      ].join("\n"),
    )
  }

  const content = [
    "// AUTO-GENERATED — do not edit. Regenerate via `bun run db:generate`.",
    "export type BundledMigration = {",
    "  readonly tag: string",
    "  readonly when: number",
    "  readonly statements: readonly string[]",
    "}",
    "",
    "export const bundledMigrations: readonly BundledMigration[] = [",
    blocks.join("\n"),
    "] as const",
    "",
  ].join("\n")

  await Bun.write(OUTPUT_PATH, content)
  process.stdout.write(
    `wrote ${OUTPUT_PATH} (${ordered.length} migration(s))\n`,
  )
}

await main()
