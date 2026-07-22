-- Baseline migration: matches the schema @astrojs/db had pushed to production, and
-- hand-edited to use IF NOT EXISTS so it no-ops against that pre-existing database.
-- The unique indexes are new objects (prod uses inline UNIQUE autoindexes) and simply
-- add a redundant-but-harmless enforcement layer there.
CREATE TABLE IF NOT EXISTS `Announcement` (
	`id` text PRIMARY KEY NOT NULL,
	`ensembleId` text NOT NULL,
	`title` text NOT NULL,
	`content` text NOT NULL,
	`createdBy` text NOT NULL,
	`createdAt` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updatedAt` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`ensembleId`) REFERENCES `Ensemble`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`createdBy`) REFERENCES `User`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `Attendance` (
	`id` text PRIMARY KEY NOT NULL,
	`eventId` text NOT NULL,
	`userId` text NOT NULL,
	`checkedInAt` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`checkedInMethod` text NOT NULL,
	FOREIGN KEY (`eventId`) REFERENCES `Event`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `EmailChangeToken` (
	`id` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`token` text NOT NULL,
	`newEmail` text NOT NULL,
	`expiresAt` text NOT NULL,
	`usedAt` text,
	`createdAt` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `EmailChangeToken_token_unique` ON `EmailChangeToken` (`token`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `EmailVerificationToken` (
	`id` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`token` text NOT NULL,
	`expiresAt` text NOT NULL,
	`usedAt` text,
	`createdAt` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `EmailVerificationToken_token_unique` ON `EmailVerificationToken` (`token`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `Ensemble` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text,
	`description` text,
	`imageUrl` text,
	`discordLink` text,
	`discordWebhookUrl` text,
	`codeOfConduct` text,
	`checkInStartMinutes` integer DEFAULT 30 NOT NULL,
	`checkInEndMinutes` integer DEFAULT 15 NOT NULL,
	`createdBy` text NOT NULL,
	`createdAt` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`createdBy`) REFERENCES `User`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `Ensemble_slug_unique` ON `Ensemble` (`slug`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `EnsembleInvite` (
	`id` text PRIMARY KEY NOT NULL,
	`ensembleId` text NOT NULL,
	`code` text NOT NULL,
	`createdBy` text NOT NULL,
	`expiresAt` text,
	`createdAt` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`ensembleId`) REFERENCES `Ensemble`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`createdBy`) REFERENCES `User`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `EnsembleInvite_code_unique` ON `EnsembleInvite` (`code`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `EnsembleLink` (
	`id` text PRIMARY KEY NOT NULL,
	`ensembleId` text NOT NULL,
	`label` text NOT NULL,
	`url` text NOT NULL,
	`sortOrder` integer DEFAULT 0 NOT NULL,
	`createdAt` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`ensembleId`) REFERENCES `Ensemble`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `EnsembleMember` (
	`id` text PRIMARY KEY NOT NULL,
	`ensembleId` text NOT NULL,
	`userId` text NOT NULL,
	`role` text DEFAULT 'member' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`agreedToCodeOfConductAt` text,
	`joinedAt` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`ensembleId`) REFERENCES `Ensemble`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `Event` (
	`id` text PRIMARY KEY NOT NULL,
	`ensembleId` text NOT NULL,
	`seasonId` text NOT NULL,
	`category` text DEFAULT 'rehearsal' NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`scheduledAt` text NOT NULL,
	`durationMinutes` integer DEFAULT 90 NOT NULL,
	`location` text,
	`checkInCode` text NOT NULL,
	`groupId` text,
	`rsvpEnabled` integer,
	`createdAt` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`ensembleId`) REFERENCES `Ensemble`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`seasonId`) REFERENCES `Season`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`groupId`) REFERENCES `Group`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `Event_checkInCode_unique` ON `Event` (`checkInCode`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `EventProgram` (
	`id` text PRIMARY KEY NOT NULL,
	`eventId` text NOT NULL,
	`songId` text NOT NULL,
	`sortOrder` integer DEFAULT 0 NOT NULL,
	`notes` text,
	`addedAt` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`eventId`) REFERENCES `Event`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`songId`) REFERENCES `Song`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `EventRsvp` (
	`id` text PRIMARY KEY NOT NULL,
	`eventId` text NOT NULL,
	`userId` text NOT NULL,
	`response` text NOT NULL,
	`respondedAt` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`eventId`) REFERENCES `Event`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `Group` (
	`id` text PRIMARY KEY NOT NULL,
	`ensembleId` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`color` text DEFAULT 'info' NOT NULL,
	`createdAt` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`ensembleId`) REFERENCES `Ensemble`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `GroupMembership` (
	`id` text PRIMARY KEY NOT NULL,
	`groupId` text NOT NULL,
	`userId` text NOT NULL,
	`role` text,
	`addedAt` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`groupId`) REFERENCES `Group`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `MemberPart` (
	`id` text PRIMARY KEY NOT NULL,
	`membershipId` text NOT NULL,
	`partId` text NOT NULL,
	FOREIGN KEY (`membershipId`) REFERENCES `EnsembleMember`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`partId`) REFERENCES `Part`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `Part` (
	`id` text PRIMARY KEY NOT NULL,
	`ensembleId` text NOT NULL,
	`name` text NOT NULL,
	`sortOrder` integer DEFAULT 0 NOT NULL,
	`createdAt` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`ensembleId`) REFERENCES `Ensemble`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `PasswordResetToken` (
	`id` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`token` text NOT NULL,
	`expiresAt` text NOT NULL,
	`usedAt` text,
	`createdAt` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `PasswordResetToken_token_unique` ON `PasswordResetToken` (`token`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `Season` (
	`id` text PRIMARY KEY NOT NULL,
	`ensembleId` text NOT NULL,
	`name` text NOT NULL,
	`startDate` text,
	`endDate` text,
	`isActive` integer DEFAULT 1 NOT NULL,
	`createdAt` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`ensembleId`) REFERENCES `Ensemble`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `SeasonMembership` (
	`id` text PRIMARY KEY NOT NULL,
	`seasonId` text NOT NULL,
	`userId` text NOT NULL,
	`joinedAt` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`seasonId`) REFERENCES `Season`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `SeasonSong` (
	`id` text PRIMARY KEY NOT NULL,
	`seasonId` text NOT NULL,
	`songId` text NOT NULL,
	`addedAt` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`seasonId`) REFERENCES `Season`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`songId`) REFERENCES `Song`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `SiteBanner` (
	`id` text PRIMARY KEY NOT NULL,
	`message` text NOT NULL,
	`color` text DEFAULT 'info' NOT NULL,
	`isActive` integer DEFAULT 1 NOT NULL,
	`createdAt` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updatedAt` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `Song` (
	`id` text PRIMARY KEY NOT NULL,
	`ensembleId` text NOT NULL,
	`name` text NOT NULL,
	`composer` text,
	`arranger` text,
	`runTime` integer,
	`createdAt` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`ensembleId`) REFERENCES `Ensemble`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `SongFile` (
	`id` text PRIMARY KEY NOT NULL,
	`songId` text NOT NULL,
	`name` text NOT NULL,
	`url` text NOT NULL,
	`category` text DEFAULT 'other' NOT NULL,
	`uploadedBy` text NOT NULL,
	`uploadedAt` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`songId`) REFERENCES `Song`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`uploadedBy`) REFERENCES `User`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `SongPart` (
	`id` text PRIMARY KEY NOT NULL,
	`songId` text NOT NULL,
	`partId` text NOT NULL,
	FOREIGN KEY (`songId`) REFERENCES `Song`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`partId`) REFERENCES `Part`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `Task` (
	`id` text PRIMARY KEY NOT NULL,
	`ensembleId` text NOT NULL,
	`seasonId` text,
	`title` text NOT NULL,
	`description` text,
	`sortOrder` integer DEFAULT 0 NOT NULL,
	`createdAt` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`ensembleId`) REFERENCES `Ensemble`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`seasonId`) REFERENCES `Season`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `TaskCompletion` (
	`id` text PRIMARY KEY NOT NULL,
	`taskId` text NOT NULL,
	`userId` text NOT NULL,
	`completedAt` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`completedBy` text NOT NULL,
	FOREIGN KEY (`taskId`) REFERENCES `Task`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`completedBy`) REFERENCES `User`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `User` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`passwordHash` text NOT NULL,
	`name` text NOT NULL,
	`avatarUrl` text,
	`phone` text,
	`role` text DEFAULT 'user' NOT NULL,
	`emailVerifiedAt` text,
	`createdAt` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `User_email_unique` ON `User` (`email`);