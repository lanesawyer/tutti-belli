CREATE TABLE `Audition` (
	`id` text PRIMARY KEY NOT NULL,
	`ensembleId` text NOT NULL,
	`songId` text,
	`title` text NOT NULL,
	`description` text,
	`signupDeadline` text,
	`status` text DEFAULT 'open' NOT NULL,
	`createdAt` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`ensembleId`) REFERENCES `Ensemble`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`songId`) REFERENCES `Song`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `AuditionSignup` (
	`id` text PRIMARY KEY NOT NULL,
	`auditionId` text NOT NULL,
	`userId` text NOT NULL,
	`note` text,
	`selected` integer DEFAULT false NOT NULL,
	`createdAt` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`auditionId`) REFERENCES `Audition`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `AuditionSignup_auditionId_userId` ON `AuditionSignup` (`auditionId`,`userId`);