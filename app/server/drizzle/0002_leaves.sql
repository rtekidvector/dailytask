CREATE TABLE `leaves` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`kind` text NOT NULL,
	`from_date` text NOT NULL,
	`to_date` text NOT NULL,
	`reason` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`decided_by` text,
	`decided_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`email`) REFERENCES `members`(`email`) ON UPDATE cascade ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `leaves_email` ON `leaves` (`email`,`from_date`);