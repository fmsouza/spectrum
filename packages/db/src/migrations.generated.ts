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
] as const
