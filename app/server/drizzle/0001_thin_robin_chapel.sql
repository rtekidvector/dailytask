CREATE TABLE `activity` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text,
	`actor_email` text NOT NULL,
	`actor_name` text NOT NULL,
	`kind` text NOT NULL,
	`text` text NOT NULL,
	`at` integer NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `activity_task` ON `activity` (`task_id`);--> statement-breakpoint
CREATE INDEX `activity_at` ON `activity` (`at`);--> statement-breakpoint
CREATE TABLE `labels` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`color` text DEFAULT 'gray' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`kind` text NOT NULL,
	`task_id` text,
	`text` text NOT NULL,
	`at` integer NOT NULL,
	`read_at` integer,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `notifications_email` ON `notifications` (`email`,`at`);--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`color` text DEFAULT 'lilac' NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`archived` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `subtasks` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`title` text NOT NULL,
	`done` integer DEFAULT false NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `subtasks_task` ON `subtasks` (`task_id`);--> statement-breakpoint
CREATE TABLE `task_labels` (
	`task_id` text NOT NULL,
	`label_id` text NOT NULL,
	PRIMARY KEY(`task_id`, `label_id`),
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`label_id`) REFERENCES `labels`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `routines` ADD `priority` text DEFAULT 'normal' NOT NULL;--> statement-breakpoint
ALTER TABLE `routines` ADD `project_id` text REFERENCES projects(id);--> statement-breakpoint
ALTER TABLE `tasks` ADD `priority` text DEFAULT 'normal' NOT NULL;--> statement-breakpoint
ALTER TABLE `tasks` ADD `project_id` text REFERENCES projects(id);--> statement-breakpoint
UPDATE `tasks` SET `priority` = 'high' WHERE `hot` = 1;--> statement-breakpoint
UPDATE `routines` SET `priority` = 'high' WHERE `hot` = 1;
