CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`path` text NOT NULL,
	`createdAt` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_projects_path` ON `projects` (`path`);--> statement-breakpoint
ALTER TABLE `sessions` ADD `projectId` text NOT NULL REFERENCES projects(id);--> statement-breakpoint
CREATE INDEX `idx_sessions_projectId` ON `sessions` (`projectId`);