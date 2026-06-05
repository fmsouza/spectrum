CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`harnessId` text NOT NULL,
	`modelId` text,
	`startedAt` text NOT NULL,
	`endedAt` text,
	`exitCode` integer,
	`name` text,
	`cwd` text
);
--> statement-breakpoint
CREATE INDEX `idx_sessions_startedAt` ON `sessions` (`startedAt`);--> statement-breakpoint
CREATE INDEX `idx_sessions_harnessId` ON `sessions` (`harnessId`);