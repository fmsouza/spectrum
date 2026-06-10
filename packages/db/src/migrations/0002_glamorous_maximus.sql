CREATE TABLE `run_events` (
	`sessionId` text NOT NULL,
	`seq` integer NOT NULL,
	`runnerId` text NOT NULL,
	`type` text NOT NULL,
	`payload` text NOT NULL,
	`ts` text NOT NULL,
	PRIMARY KEY(`sessionId`, `seq`),
	FOREIGN KEY (`sessionId`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_run_events_runner` ON `run_events` (`sessionId`,`runnerId`);