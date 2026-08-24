CREATE TABLE `ArrangementPart` (
	`id` text PRIMARY KEY NOT NULL,
	`arrangementId` text NOT NULL,
	`partId` text NOT NULL,
	FOREIGN KEY (`arrangementId`) REFERENCES `Arrangement`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`partId`) REFERENCES `Part`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `Arrangement` ADD `runTime` integer;