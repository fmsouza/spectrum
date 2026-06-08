// AUTO-GENERATED — do not edit. Regenerate via `bun run db:generate`.
export type BundledMigration = {
  readonly tag: string
  readonly when: number
  readonly statements: readonly string[]
}

export const bundledMigrations: readonly BundledMigration[] = [
  {
    tag: "0000_sad_turbo",
    when: 1780694863502,
    statements: [
      "CREATE TABLE `sessions` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`harnessId` text NOT NULL,\n\t`modelId` text,\n\t`startedAt` text NOT NULL,\n\t`endedAt` text,\n\t`exitCode` integer,\n\t`name` text,\n\t`cwd` text\n);",
      "CREATE INDEX `idx_sessions_startedAt` ON `sessions` (`startedAt`);",
      "CREATE INDEX `idx_sessions_harnessId` ON `sessions` (`harnessId`);",
    ],
  },
  {
    tag: "0001_melted_richard_fisk",
    when: 1780866608992,
    statements: [
      "CREATE TABLE `projects` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`name` text NOT NULL,\n\t`path` text NOT NULL,\n\t`createdAt` text NOT NULL\n);",
      "CREATE UNIQUE INDEX `idx_projects_path` ON `projects` (`path`);",
      "DROP TABLE `sessions`;",
      "CREATE TABLE `sessions` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`harnessId` text NOT NULL,\n\t`modelId` text,\n\t`startedAt` text NOT NULL,\n\t`endedAt` text,\n\t`exitCode` integer,\n\t`name` text,\n\t`cwd` text,\n\t`projectId` text NOT NULL REFERENCES projects(id)\n);",
      "CREATE INDEX `idx_sessions_startedAt` ON `sessions` (`startedAt`);",
      "CREATE INDEX `idx_sessions_harnessId` ON `sessions` (`harnessId`);",
      "CREATE INDEX `idx_sessions_projectId` ON `sessions` (`projectId`);",
    ],
  },
] as const
