import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core"

/** A named group of sessions (one per folder). `path` is the absolute cwd, unique for find-or-create. */
export const projects = sqliteTable(
  "projects",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    path: text("path").notNull(),
    createdAt: text("createdAt").notNull(),
  },
  (t) => [uniqueIndex("idx_projects_path").on(t.path)],
)

/**
 * Session history. Every session belongs to exactly one project (`projectId`, NOT NULL).
 * Column names match the legacy hand-written schema (camelCase).
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
    projectId: text("projectId")
      .notNull()
      .references(() => projects.id),
  },
  (t) => [
    index("idx_sessions_startedAt").on(t.startedAt),
    index("idx_sessions_harnessId").on(t.harnessId),
    index("idx_sessions_projectId").on(t.projectId),
  ],
)

/**
 * Append-only canonical run events. One row per event; PRIMARY KEY (sessionId, seq)
 * gives a monotonic per-session ordering. `payload` is the JSON of the domain event.
 * Additive — existing data untouched.
 */
export const runEvents = sqliteTable(
  "run_events",
  {
    sessionId: text("sessionId")
      .notNull()
      .references(() => sessions.id),
    seq: integer("seq").notNull(),
    runnerId: text("runnerId").notNull(),
    type: text("type").notNull(),
    payload: text("payload").notNull(),
    ts: text("ts").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.sessionId, t.seq] }),
    index("idx_run_events_runner").on(t.sessionId, t.runnerId),
  ],
)
