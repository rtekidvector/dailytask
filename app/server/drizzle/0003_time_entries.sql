CREATE TABLE `time_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`email` text NOT NULL,
	`started_at` integer NOT NULL,
	`ended_at` integer,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `time_task` ON `time_entries` (`task_id`);--> statement-breakpoint
CREATE INDEX `time_email` ON `time_entries` (`email`,`started_at`);