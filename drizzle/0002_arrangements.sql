CREATE TABLE `Arrangement` (
	`id` text PRIMARY KEY NOT NULL,
	`ensembleId` text NOT NULL,
	`title` text NOT NULL,
	`composer` text,
	`arranger` text,
	`runTime` integer,
	`notes` text,
	`status` text DEFAULT 'in_review' NOT NULL,
	`submittedBy` text NOT NULL,
	`approvedSongId` text,
	`createdAt` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`ensembleId`) REFERENCES `Ensemble`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`submittedBy`) REFERENCES `User`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`approvedSongId`) REFERENCES `Song`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `ArrangementComment` (
	`id` text PRIMARY KEY NOT NULL,
	`versionId` text NOT NULL,
	`userId` text NOT NULL,
	`content` text NOT NULL,
	`createdAt` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`versionId`) REFERENCES `ArrangementVersion`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `ArrangementPart` (
	`id` text PRIMARY KEY NOT NULL,
	`arrangementId` text NOT NULL,
	`partId` text NOT NULL,
	FOREIGN KEY (`arrangementId`) REFERENCES `Arrangement`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`partId`) REFERENCES `Part`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `ArrangementVersion` (
	`id` text PRIMARY KEY NOT NULL,
	`arrangementId` text NOT NULL,
	`versionNumber` integer NOT NULL,
	`fileName` text NOT NULL,
	`url` text NOT NULL,
	`notes` text,
	`uploadedBy` text NOT NULL,
	`uploadedAt` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`arrangementId`) REFERENCES `Arrangement`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`uploadedBy`) REFERENCES `User`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `Ensemble` ADD `arrangementReviewGroupId` text;