import { db, User, Ensemble, EnsembleMember, Part, EnsembleInvite, Season, SeasonMembership, Rehearsal, Announcement, Group, GroupMembership } from 'astro:db';
import bcrypt from 'bcryptjs';

export default async function seed() {
  // Create a default admin user
  // Password: admin123
  const adminId = crypto.randomUUID();
  const passwordHash = await bcrypt.hash('admin123', 10);
  
  await db.insert(User).values([
    {
      id: adminId,
      email: 'admin@example.com',
      passwordHash: passwordHash,
      name: 'Site Administrator',
      role: 'admin',
    },
  ]);

  // Create a test user
  // Password: test123
  const testUserId = crypto.randomUUID();
  const testPasswordHash = await bcrypt.hash('test123', 10);
  
  await db.insert(User).values([
    {
      id: testUserId,
      email: 'test@example.com',
      passwordHash: testPasswordHash,
      name: 'Test User',
      role: 'user',
    },
  ]);

  // Create an ensemble admin user (not site admin, but admin of specific ensemble)
  // Password: ensadmin123
  const ensembleAdminId = crypto.randomUUID();
  const ensembleAdminPasswordHash = await bcrypt.hash('ensadmin123', 10);
  
  await db.insert(User).values([
    {
      id: ensembleAdminId,
      email: 'ensadmin@example.com',
      passwordHash: ensembleAdminPasswordHash,
      name: 'Ensemble Admin User',
      role: 'ensemble_admin',
    },
  ]);

  // Create a test ensemble
  const ensembleId = crypto.randomUUID();
  await db.insert(Ensemble).values([
    {
      id: ensembleId,
      name: 'Chamber Orchestra',
      description: 'A test ensemble for development and testing',
      discordLink: 'https://discord.gg/example',
      createdBy: adminId,
    },
  ]);

  // Create parts for the ensemble
  const sopranoId = crypto.randomUUID();
  const altoId = crypto.randomUUID();
  const tenorId = crypto.randomUUID();
  const baritoneId = crypto.randomUUID();
  const bassId = crypto.randomUUID();

  await db.insert(Part).values([
    {
      id: sopranoId,
      ensembleId: ensembleId,
      name: 'Soprano',
      sortOrder: 1,
    },
    {
      id: altoId,
      ensembleId: ensembleId,
      name: 'Alto',
      sortOrder: 2,
    },
    {
      id: tenorId,
      ensembleId: ensembleId,
      name: 'Tenor',
      sortOrder: 3,
    },
    {
      id: baritoneId,
      ensembleId: ensembleId,
      name: 'Baritone',
      sortOrder: 4,
    },
    {
      id: bassId,
      ensembleId: ensembleId,
      name: 'Bass',
      sortOrder: 5,
    },
  ]);

  // Add admin as ensemble admin
  await db.insert(EnsembleMember).values([
    {
      id: crypto.randomUUID(),
      ensembleId: ensembleId,
      userId: adminId,
      role: 'admin',
      partId: tenorId,
    },
  ]);

  // Add ensemble admin user as ensemble admin
  await db.insert(EnsembleMember).values([
    {
      id: crypto.randomUUID(),
      ensembleId: ensembleId,
      userId: ensembleAdminId,
      role: 'admin',
      partId: sopranoId,
    },
  ]);

  // Add test user as member
  await db.insert(EnsembleMember).values([
    {
      id: crypto.randomUUID(),
      ensembleId: ensembleId,
      userId: testUserId,
      role: 'member',
      partId: bassId,
    },
  ]);

  // Create an invite code
  await db.insert(EnsembleInvite).values([
    {
      id: crypto.randomUUID(),
      ensembleId: ensembleId,
      code: 'TEST1234',
      createdBy: adminId,
    },
  ]);

  // Create a current season
  const seasonId = crypto.randomUUID();
  const seasonStartDate = new Date();
  seasonStartDate.setMonth(seasonStartDate.getMonth() - 1); // Started 1 month ago
  const seasonEndDate = new Date();
  seasonEndDate.setMonth(seasonEndDate.getMonth() + 2); // Ends in 2 months

  await db.insert(Season).values([
    {
      id: seasonId,
      ensembleId: ensembleId,
      name: 'Spring 2026',
      startDate: seasonStartDate,
      endDate: seasonEndDate,
      isActive: 1,
    },
  ]);

  // Add all members to the current season
  await db.insert(SeasonMembership).values([
    {
      id: crypto.randomUUID(),
      seasonId: seasonId,
      userId: adminId,
    },
    {
      id: crypto.randomUUID(),
      seasonId: seasonId,
      userId: ensembleAdminId,
    },
    {
      id: crypto.randomUUID(),
      seasonId: seasonId,
      userId: testUserId,
    },
  ]);

  // Create sample groups
  const sectionLeadersGroupId = crypto.randomUUID();
  const boardMembersGroupId = crypto.randomUUID();

  await db.insert(Group).values([
    {
      id: sectionLeadersGroupId,
      ensembleId: ensembleId,
      name: 'Section Leaders',
      description: 'Leaders of each vocal section',
      color: 'primary',
    },
    {
      id: boardMembersGroupId,
      ensembleId: ensembleId,
      name: 'Board Members',
      description: 'Ensemble board and decision makers',
      color: 'warning',
    },
  ]);

  // Add some members to groups
  await db.insert(GroupMembership).values([
    {
      id: crypto.randomUUID(),
      groupId: sectionLeadersGroupId,
      userId: adminId,
    },
    {
      id: crypto.randomUUID(),
      groupId: boardMembersGroupId,
      userId: adminId,
    },
    {
      id: crypto.randomUUID(),
      groupId: boardMembersGroupId,
      userId: ensembleAdminId,
    },
  ]);

  // Create sample announcements
  const recentAnnouncementDate = new Date();
  recentAnnouncementDate.setDate(recentAnnouncementDate.getDate() - 2); // 2 days ago

  const olderAnnouncementDate = new Date();
  olderAnnouncementDate.setDate(olderAnnouncementDate.getDate() - 7); // 1 week ago

  await db.insert(Announcement).values([
    {
      id: crypto.randomUUID(),
      ensembleId: ensembleId,
      title: 'Welcome to the Spring 2026 Season!',
      content: 'We\'re excited to begin our Spring 2026 season together! Please make sure to check the rehearsal schedule and mark your calendars. Don\'t forget to join our Discord server to stay connected with everyone between rehearsals.',
      createdBy: adminId,
      createdAt: olderAnnouncementDate,
    },
    {
      id: crypto.randomUUID(),
      ensembleId: ensembleId,
      title: 'Reminder: Concert Attire',
      content: 'Just a friendly reminder that our spring concert is coming up next month. Please ensure you have your concert attire ready. If you need assistance with ordering, please reach out to the board members.',
      createdBy: ensembleAdminId,
      createdAt: recentAnnouncementDate,
    },
    {
      id: crypto.randomUUID(),
      ensembleId: ensembleId,
      title: 'New Check-In System',
      content: 'We\'ve implemented a new digital check-in system for rehearsals! When you arrive at rehearsal, look for the check-in code displayed on the screen. Use the code to mark your attendance through the app. The check-in window opens 30 minutes before rehearsal starts.',
      createdBy: adminId,
    },
  ]);

  // Create rehearsals for testing
  
  // Past rehearsal (1 month ago)
  const pastDate = new Date();
  pastDate.setMonth(pastDate.getMonth() - 1);
  pastDate.setHours(19, 0, 0, 0); // 7 PM

  await db.insert(Rehearsal).values([
    {
      id: crypto.randomUUID(),
      ensembleId: ensembleId,
      seasonId: seasonId,
      title: 'Past Rehearsal',
      description: 'A rehearsal that already happened for testing',
      scheduledAt: pastDate,
      durationMinutes: 90,
      location: 'Music Hall, Room 101',
      checkInCode: crypto.randomUUID().substring(0, 8).toUpperCase(),
    },
  ]);

  // Current time rehearsal (happening right now - for testing check-in)
  const currentDate = new Date();
  // Set to current time, members should be able to check in now

  await db.insert(Rehearsal).values([
    {
      id: crypto.randomUUID(),
      ensembleId: ensembleId,
      seasonId: seasonId,
      title: 'Current Rehearsal (Check-in Available)',
      description: 'This rehearsal is happening right now - test check-in functionality',
      scheduledAt: currentDate,
      durationMinutes: 120, // 2 hours
      location: 'Music Hall, Room 101',
      checkInCode: 'CHECKIN1',
    },
  ]);

  // Near future rehearsal (1 week from now)
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + 7); // 1 week from now
  futureDate.setHours(19, 0, 0, 0); // 7 PM

  await db.insert(Rehearsal).values([
    {
      id: crypto.randomUUID(),
      ensembleId: ensembleId,
      seasonId: seasonId,
      title: 'Weekly Rehearsal',
      description: 'Regular practice session',
      scheduledAt: futureDate,
      durationMinutes: 90,
      location: 'Music Hall, Room 101',
      checkInCode: crypto.randomUUID().substring(0, 8).toUpperCase(),
    },
  ]);

  console.log('✓ Seeded database successfully!');
  console.log('');
  console.log('Site Admin Account:');
  console.log('  Email: admin@example.com');
  console.log('  Password: admin123');
  console.log('');
  console.log('Ensemble Admin Account (admin of Chamber Orchestra):');
  console.log('  Email: ensadmin@example.com');
  console.log('  Password: ensadmin123');
  console.log('');
  console.log('Test User Account (regular member):');
  console.log('  Email: test@example.com');
  console.log('  Password: test123');
  console.log('');
  console.log('Test Ensemble: Chamber Orchestra');
  console.log('  Invite Code: TEST1234');
  console.log('  Current Season: Spring 2026');
  console.log('  Check-in window: 30 minutes before to 15 minutes after rehearsal start');
  console.log('');
  console.log('Test Rehearsals:');
  console.log('  - Past rehearsal (1 month ago)');
  console.log('  - Current rehearsal (happening now - check-in code: CHECKIN1)');
  console.log('  - Weekly rehearsal (1 week from now)');
  console.log('');
  console.log('⚠️  Remember to change passwords in production!');
}
