import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core"

/**
 * Session history. Column names match the legacy hand-written schema (camelCase)
 * so the generated migration produces the same table the app already expects.
 */
export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    harnessId: text("harnessId").notNull(),
    modelId: text("modelId"),
    startedAt: text("startedAt").notNull(),
    endedAt: text("endedAt"),
    exitCode: integer("exitCode"),
    name: text("name"),
    cwd: text("cwd"),
  },
  (t) => [
    index("idx_sessions_startedAt").on(t.startedAt),
    index("idx_sessions_harnessId").on(t.harnessId),
  ],
)
