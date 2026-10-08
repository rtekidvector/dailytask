ALTER TABLE `projects` ADD `closed_at` integer;--> statement-breakpoint
ALTER TABLE `projects` ADD `closed_by` text;--> statement-breakpoint
ALTER TABLE `projects` ADD `summary` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `projects` ADD `result_links` text DEFAULT '[]' NOT NULL;