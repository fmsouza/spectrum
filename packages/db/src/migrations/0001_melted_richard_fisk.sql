CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`path` text NOT NULL,
	`createdAt` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_projects_path` ON `projects` (`path`);
--> statement-breakpoint
DROP TABLE `sessions`;
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`harnessId` text NOT NULL,
	`modelId` text,
	`startedAt` text NOT NULL,
	`endedAt` text,
	`exitCode` integer,
	`name` text,
	`cwd` text,
	`projectId` text NOT NULL REFERENCES projects(id)
);
--> statement-breakpoint
CREATE INDEX `idx_sessions_startedAt` ON `sessions` (`startedAt`);
--> statement-breakpoint
CREATE INDEX `idx_sessions_harnessId` ON `sessions` (`harnessId`);
--> statement-breakpoint
CREATE INDEX `idx_sessions_projectId` ON `sessions` (`projectId`);
