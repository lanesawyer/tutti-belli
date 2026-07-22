-- Rebuilds EventProgram to add the type/label/length columns and make songId
-- nullable (rehearsal-plan breaks feature). This schema change existed in the app
-- before the drizzle migration but was never pushed to production, so the copy
-- SELECT is hand-edited to read only the columns the old table actually has.
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_EventProgram` (
	`id` text PRIMARY KEY NOT NULL,
	`eventId` text NOT NULL,
	`type` text DEFAULT 'song' NOT NULL,
	`songId` text,
	`label` text,
	`sortOrder` integer DEFAULT 0 NOT NULL,
	`length` integer,
	`notes` text,
	`addedAt` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`eventId`) REFERENCES `Event`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`songId`) REFERENCES `Song`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_EventProgram`("id", "eventId", "type", "songId", "label", "sortOrder", "length", "notes", "addedAt") SELECT "id", "eventId", 'song', "songId", NULL, "sortOrder", NULL, "notes", "addedAt" FROM `EventProgram`;--> statement-breakpoint
DROP TABLE `EventProgram`;--> statement-breakpoint
ALTER TABLE `__new_EventProgram` RENAME TO `EventProgram`;--> statement-breakpoint
PRAGMA foreign_keys=ON;