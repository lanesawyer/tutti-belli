import { db, eq, User, Account, Ensemble, EnsembleMember, Part, MemberPart, EnsembleInvite, Season, SeasonMembership, Event, EventProgram, Announcement, Group, GroupMembership, Song, SongPart, SeasonSong } from 'astro:db';
import { hashPassword } from '../src/lib/bcrypt';

async function createSeedUser(id: string, email: string, name: string, password: string) {
  const passwordHash = await hashPassword(password);
  await db.insert(User).values({ id, email, name, emailVerified: true });
  await db.insert(Account).values({
    id: crypto.randomUUID(),
    accountId: id,
    providerId: 'credential',
    userId: id,
    password: passwordHash,
  });
}

export default async function seed() {
  const adminId = crypto.randomUUID();
  const testUserId = crypto.randomUUID();
  const ensembleAdminId = crypto.randomUUID();

  await createSeedUser(adminId, 'admin@example.com', 'Site Administrator', 'admin123');
  await db.update(User).set({ role: 'admin' }).where(eq(User.id, adminId));

  await createSeedUser(testUserId, 'test@example.com', 'Test User', 'test123');
  await createSeedUser(ensembleAdminId, 'ensadmin@example.com', 'Ensemble Admin User', 'ensadmin123');

  // Create a test ensemble
  const ensembleId = crypto.randomUUID();
  await db.insert(Ensemble).values([
    {
      id: ensembleId,
      name: 'Chamber Orchestra',
      slug: 'chamber-orchestra',
      description: 'A test ensemble for development and testing',
      discordLink: 'https://discord.gg/example',
      codeOfConduct: `Welcome to the Chamber Orchestra!

We are committed to creating a positive and inclusive environment for all members. Please review and follow these guidelines:

1. Respect and Professionalism
   - Treat all members with respect and courtesy
   - Be punctual for rehearsals and performances
   - Give your full attention during rehearsals

2. Communication
   - Keep ensemble communications professional
   - Respond promptly to messages from administrators
   - Use appropriate channels for different types of communication

3. Attendance and Participation
   - Notify leadership in advance if you cannot attend a rehearsal
   - Come prepared having practiced your parts
   - Participate actively in ensemble activities

4. Community Standards
   - No harassment, discrimination, or bullying will be tolerated
   - Maintain confidentiality of internal ensemble discussions
   - Support fellow members in their musical growth

5. Instruments and Materials
   - Care for ensemble property and shared spaces
   - Bring all necessary materials to each rehearsal
   - Keep your music organized and marked

Violations of this code of conduct may result in removal from the ensemble. If you have concerns, please reach out to ensemble leadership.

Thank you for being part of our musical community!`,
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
    { id: sopranoId, ensembleId, name: 'Soprano', sortOrder: 1 },
    { id: altoId, ensembleId, name: 'Alto', sortOrder: 2 },
    { id: tenorId, ensembleId, name: 'Tenor', sortOrder: 3 },
    { id: baritoneId, ensembleId, name: 'Baritone', sortOrder: 4 },
    { id: bassId, ensembleId, name: 'Bass', sortOrder: 5 },
  ]);

  // Add members
  const adminMembershipId = crypto.randomUUID();
  const ensAdminMembershipId = crypto.randomUUID();
  const testMembershipId = crypto.randomUUID();

  await db.insert(EnsembleMember).values([
    { id: adminMembershipId, ensembleId, userId: adminId, role: 'admin', status: 'active' },
    { id: ensAdminMembershipId, ensembleId, userId: ensembleAdminId, role: 'admin', status: 'active' },
    { id: testMembershipId, ensembleId, userId: testUserId, role: 'member', status: 'active' },
  ]);

  // Assign parts
  await db.insert(MemberPart).values([
    { id: crypto.randomUUID(), membershipId: adminMembershipId, partId: tenorId },
    { id: crypto.randomUUID(), membershipId: adminMembershipId, partId: baritoneId },
    { id: crypto.randomUUID(), membershipId: ensAdminMembershipId, partId: sopranoId },
    { id: crypto.randomUUID(), membershipId: testMembershipId, partId: bassId },
  ]);

  // Create invite code
  await db.insert(EnsembleInvite).values([
    { id: crypto.randomUUID(), ensembleId, code: 'TEST1234', createdBy: adminId },
  ]);

  // Create a current season
  const seasonId = crypto.randomUUID();
  const seasonStartDate = new Date();
  seasonStartDate.setMonth(seasonStartDate.getMonth() - 1);
  const seasonEndDate = new Date();
  seasonEndDate.setMonth(seasonEndDate.getMonth() + 2);

  await db.insert(Season).values([
    { id: seasonId, ensembleId, name: 'Spring 2026', startDate: seasonStartDate, endDate: seasonEndDate, isActive: 1 },
  ]);

  await db.insert(SeasonMembership).values([
    { id: crypto.randomUUID(), seasonId, userId: adminId },
    { id: crypto.randomUUID(), seasonId, userId: ensembleAdminId },
    { id: crypto.randomUUID(), seasonId, userId: testUserId },
  ]);

  // Create sample groups
  const sectionLeadersGroupId = crypto.randomUUID();
  const boardMembersGroupId = crypto.randomUUID();

  await db.insert(Group).values([
    { id: sectionLeadersGroupId, ensembleId, name: 'Section Leaders', description: 'Leaders of each vocal section', color: 'primary' },
    { id: boardMembersGroupId, ensembleId, name: 'Board Members', description: 'Ensemble board and decision makers', color: 'warning' },
  ]);

  await db.insert(GroupMembership).values([
    { id: crypto.randomUUID(), groupId: sectionLeadersGroupId, userId: adminId, role: 'lead' },
    { id: crypto.randomUUID(), groupId: sectionLeadersGroupId, userId: testUserId },
    { id: crypto.randomUUID(), groupId: boardMembersGroupId, userId: adminId, role: 'lead' },
    { id: crypto.randomUUID(), groupId: boardMembersGroupId, userId: ensembleAdminId },
  ]);

  // Create sample announcements
  const recentAnnouncementDate = new Date();
  recentAnnouncementDate.setDate(recentAnnouncementDate.getDate() - 2);
  const olderAnnouncementDate = new Date();
  olderAnnouncementDate.setDate(olderAnnouncementDate.getDate() - 7);

  await db.insert(Announcement).values([
    {
      id: crypto.randomUUID(),
      ensembleId,
      title: 'Welcome to the Spring 2026 Season!',
      content: 'We\'re excited to begin our Spring 2026 season together! Please make sure to check the rehearsal schedule and mark your calendars. Don\'t forget to join our Discord server to stay connected with everyone between rehearsals.',
      createdBy: adminId,
      createdAt: olderAnnouncementDate,
    },
    {
      id: crypto.randomUUID(),
      ensembleId,
      title: 'Reminder: Concert Attire',
      content: 'Just a friendly reminder that our spring concert is coming up next month. Please ensure you have your concert attire ready. If you need assistance with ordering, please reach out to the board members.',
      createdBy: ensembleAdminId,
      createdAt: recentAnnouncementDate,
    },
    {
      id: crypto.randomUUID(),
      ensembleId,
      title: 'New Check-In System',
      content: 'We\'ve implemented a new digital check-in system for rehearsals! When you arrive at rehearsal, look for the check-in code displayed on the screen. Use the code to mark your attendance through the app. The check-in window opens 30 minutes before rehearsal starts.',
      createdBy: adminId,
    },
  ]);

  // Create events
  const pastDate = new Date();
  pastDate.setMonth(pastDate.getMonth() - 1);
  pastDate.setHours(19, 0, 0, 0);

  await db.insert(Event).values([
    {
      id: crypto.randomUUID(),
      ensembleId,
      seasonId,
      category: 'rehearsal',
      title: 'Past Rehearsal',
      description: 'A rehearsal that already happened for testing',
      scheduledAt: pastDate,
      durationMinutes: 90,
      location: 'Music Hall, Room 101',
      checkInCode: crypto.randomUUID().substring(0, 8).toUpperCase(),
    },
  ]);

  const currentDate = new Date();
  const currentRehearsalId = crypto.randomUUID();

  await db.insert(Event).values([
    {
      id: currentRehearsalId,
      ensembleId,
      seasonId,
      category: 'rehearsal',
      title: 'Current Rehearsal (Check-in Available)',
      description: 'This rehearsal is happening right now - test check-in functionality',
      scheduledAt: currentDate,
      durationMinutes: 120,
      location: 'Music Hall, Room 101',
      checkInCode: 'CHECKIN1',
    },
  ]);

  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + 7);
  futureDate.setHours(19, 0, 0, 0);

  await db.insert(Event).values([
    {
      id: crypto.randomUUID(),
      ensembleId,
      seasonId,
      category: 'rehearsal',
      title: 'Weekly Rehearsal',
      description: 'Regular practice session',
      scheduledAt: futureDate,
      durationMinutes: 90,
      location: 'Music Hall, Room 101',
      checkInCode: crypto.randomUUID().substring(0, 8).toUpperCase(),
    },
  ]);

  const performanceDate = new Date();
  performanceDate.setDate(performanceDate.getDate() + 21);
  performanceDate.setHours(19, 30, 0, 0);

  const performanceId = crypto.randomUUID();
  await db.insert(Event).values([
    {
      id: performanceId,
      ensembleId,
      seasonId,
      category: 'performance',
      title: 'Spring Concert 2026',
      description: 'Our annual spring concert featuring the full season repertoire.',
      scheduledAt: performanceDate,
      durationMinutes: 120,
      location: 'Westfield Arts Center, Grand Hall',
      checkInCode: 'CONCERT1',
    },
  ]);

  // Create sample songs
  const song1Id = crypto.randomUUID();
  const song2Id = crypto.randomUUID();
  const song3Id = crypto.randomUUID();
  const song4Id = crypto.randomUUID();
  const song5Id = crypto.randomUUID();

  await db.insert(Song).values([
    { id: song1Id, ensembleId, name: 'Ave Maria', composer: 'Franz Biebl', runTime: 240 },
    { id: song2Id, ensembleId, name: 'Shenandoah', composer: 'Traditional', arranger: 'James Erb', runTime: 195 },
    { id: song3Id, ensembleId, name: 'Lux Aurumque', composer: 'Eric Whitacre', runTime: 225 },
    { id: song4Id, ensembleId, name: 'The Seal Lullaby', composer: 'Eric Whitacre', runTime: 270 },
    { id: song5Id, ensembleId, name: 'Sure On This Shining Night', composer: 'Samuel Barber', arranger: 'Morten Lauridsen', runTime: 180 },
  ]);

  await db.insert(SongPart).values([
    { id: crypto.randomUUID(), songId: song1Id, partId: sopranoId },
    { id: crypto.randomUUID(), songId: song1Id, partId: altoId },
    { id: crypto.randomUUID(), songId: song1Id, partId: tenorId },
    { id: crypto.randomUUID(), songId: song1Id, partId: baritoneId },
    { id: crypto.randomUUID(), songId: song1Id, partId: bassId },
    { id: crypto.randomUUID(), songId: song2Id, partId: sopranoId },
    { id: crypto.randomUUID(), songId: song2Id, partId: altoId },
    { id: crypto.randomUUID(), songId: song2Id, partId: tenorId },
    { id: crypto.randomUUID(), songId: song2Id, partId: bassId },
    { id: crypto.randomUUID(), songId: song3Id, partId: sopranoId },
    { id: crypto.randomUUID(), songId: song3Id, partId: altoId },
    { id: crypto.randomUUID(), songId: song3Id, partId: tenorId },
    { id: crypto.randomUUID(), songId: song3Id, partId: bassId },
    { id: crypto.randomUUID(), songId: song4Id, partId: sopranoId },
    { id: crypto.randomUUID(), songId: song4Id, partId: altoId },
    { id: crypto.randomUUID(), songId: song4Id, partId: tenorId },
    { id: crypto.randomUUID(), songId: song4Id, partId: bassId },
    { id: crypto.randomUUID(), songId: song5Id, partId: sopranoId },
    { id: crypto.randomUUID(), songId: song5Id, partId: altoId },
    { id: crypto.randomUUID(), songId: song5Id, partId: tenorId },
    { id: crypto.randomUUID(), songId: song5Id, partId: baritoneId },
    { id: crypto.randomUUID(), songId: song5Id, partId: bassId },
  ]);

  await db.insert(SeasonSong).values([
    { id: crypto.randomUUID(), seasonId, songId: song1Id },
    { id: crypto.randomUUID(), seasonId, songId: song2Id },
    { id: crypto.randomUUID(), seasonId, songId: song3Id },
  ]);

  await db.insert(EventProgram).values([
    { id: crypto.randomUUID(), eventId: performanceId, type: 'song', songId: song3Id, sortOrder: 1 },
    { id: crypto.randomUUID(), eventId: performanceId, type: 'song', songId: song2Id, sortOrder: 2 },
    { id: crypto.randomUUID(), eventId: performanceId, type: 'song', songId: song1Id, sortOrder: 3 },
    { id: crypto.randomUUID(), eventId: currentRehearsalId, type: 'song', songId: song1Id, sortOrder: 1, length: 10 },
    { id: crypto.randomUUID(), eventId: currentRehearsalId, type: 'break', label: 'Break', sortOrder: 2, length: 10 },
    { id: crypto.randomUUID(), eventId: currentRehearsalId, type: 'song', songId: song2Id, sortOrder: 3, length: 10 },
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
}
