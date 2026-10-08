CREATE TABLE `bookings` (
	`id` text PRIMARY KEY NOT NULL,
	`resource_id` text NOT NULL,
	`email` text NOT NULL,
	`task_id` text,
	`date` text NOT NULL,
	`start` text NOT NULL,
	`end` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`resource_id`) REFERENCES `resources`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `bookings_slot` ON `bookings` (`resource_id`,`date`);--> statement-breakpoint
CREATE TABLE `resources` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`kind` text DEFAULT 'alat' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`archived` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `tasks` ADD `revisions` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE `tasks` SET `revisions` = 1 WHERE `returned_at` IS NOT NULL;
