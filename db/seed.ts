import { db, User, Ensemble, EnsembleMember, Part, EnsembleInvite, Season, SeasonMembership, Rehearsal, Announcement, Group, GroupMembership, Song, SongPart, SeasonSong } from 'astro:db';
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
      status: 'active',
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
      status: 'active',
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
      status: 'active',
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
    {
      id: crypto.randomUUID(),
      ensembleId: ensembleId,
      title: 'Spring Concert — Everything You Need to Know',
      content: `Dear Chamber Orchestra family,

We are just six weeks away from our Spring 2026 Concert, and we want to make sure everyone has all the details they need to prepare. Please read this announcement carefully from top to bottom — there is important information for every single member.

📅 CONCERT DATE & VENUE
Saturday, April 12, 2026 at 7:30 PM
Westfield Arts Center, Grand Hall
123 Harmony Boulevard, Westfield

Doors open at 6:45 PM. Members should arrive no later than 6:00 PM for warm-up and final seating arrangements. Please do not arrive earlier than 5:30 PM as the hall may not yet be unlocked.

🎼 PROGRAM
The program for the evening will be as follows:

Act I
  1. Lux Aurumque — Eric Whitacre
  2. Shenandoah — arr. James Erb
  3. Ave Maria — Franz Biebl
  4. Sure On This Shining Night — arr. Morten Lauridsen

Intermission (15 minutes)

Act II
  5. The Seal Lullaby — Eric Whitacre
  6. Commissioned premiere (title TBA — details coming next week)
  7. Encore TBD

The total runtime is expected to be approximately 90 minutes including intermission.

👗 CONCERT ATTIRE
All members are required to wear the standard black concert attire:
  - Black dress shirt or blouse (no logos or patterns)
  - Black dress pants or skirt (below the knee)
  - Black closed-toe shoes (no sneakers)
  - Minimal jewelry — simple stud earrings acceptable

If you do not have appropriate attire or need assistance sourcing items, please contact Ensemble Admin directly no later than March 28th so we have time to help you. We will not be making exceptions on concert day.

🎟️ TICKETS
Each member will receive two complimentary tickets. Additional tickets may be purchased through the Westfield Arts Center box office or at the door (subject to availability). Tickets are $15 general admission, $10 for students and seniors.

If you need more than two comp tickets for family members, please let us know by April 1st and we will do our best to accommodate.

🚗 PARKING & TRANSPORTATION
Free parking is available in Lot B on the north side of the Westfield Arts Center. The lot fills quickly on weekend evenings, so we encourage carpooling. Several members have already offered to coordinate rides — check the Discord #logistics channel for details.

📋 REMAINING REHEARSAL SCHEDULE
  - March 15 — Full rehearsal, 7–9:30 PM (Act I focus)
  - March 22 — Full rehearsal, 7–9:30 PM (Act II focus)
  - March 29 — Combined run-through, 7–10 PM
  - April 5 — Dress rehearsal at Westfield Arts Center, 6–10 PM (MANDATORY)
  - April 12 — Concert day

The April 5th dress rehearsal is mandatory for all members. If you have a conflict, you must notify leadership immediately. Unexcused absence from the dress rehearsal may affect your eligibility to perform.

🙏 A NOTE FROM LEADERSHIP
We know this has been a demanding season with a challenging repertoire, and we are incredibly proud of the growth every one of you has shown. The Spring Concert is our opportunity to share months of hard work with our community. Let's finish strong.

Please don't hesitate to reach out if you have any questions or concerns.

With gratitude,
The Chamber Orchestra Leadership Team`,
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

  // Create sample songs
  const song1Id = crypto.randomUUID();
  const song2Id = crypto.randomUUID();
  const song3Id = crypto.randomUUID();
  const song4Id = crypto.randomUUID();
  const song5Id = crypto.randomUUID();

  await db.insert(Song).values([
    {
      id: song1Id,
      ensembleId: ensembleId,
      name: 'Ave Maria',
      composer: 'Franz Biebl',
      arranger: null,
      runTime: 240, // 4:00
    },
    {
      id: song2Id,
      ensembleId: ensembleId,
      name: 'Shenandoah',
      composer: 'Traditional',
      arranger: 'James Erb',
      runTime: 195, // 3:15
    },
    {
      id: song3Id,
      ensembleId: ensembleId,
      name: 'Lux Aurumque',
      composer: 'Eric Whitacre',
      arranger: null,
      runTime: 225, // 3:45
    },
    {
      id: song4Id,
      ensembleId: ensembleId,
      name: 'The Seal Lullaby',
      composer: 'Eric Whitacre',
      arranger: null,
      runTime: 270, // 4:30
    },
    {
      id: song5Id,
      ensembleId: ensembleId,
      name: 'Sure On This Shining Night',
      composer: 'Samuel Barber',
      arranger: 'Morten Lauridsen',
      runTime: 180, // 3:00
    },
  ]);

  // Associate songs with parts
  // Song 1 (Ave Maria) - SATBB arrangement (Soprano, Alto, Tenor, Bass 1, Bass 2)
  await db.insert(SongPart).values([
    { id: crypto.randomUUID(), songId: song1Id, partId: sopranoId },
    { id: crypto.randomUUID(), songId: song1Id, partId: altoId },
    { id: crypto.randomUUID(), songId: song1Id, partId: tenorId },
    { id: crypto.randomUUID(), songId: song1Id, partId: baritoneId },
    { id: crypto.randomUUID(), songId: song1Id, partId: bassId },
  ]);

  // Song 2 (Shenandoah) - SATB
  await db.insert(SongPart).values([
    { id: crypto.randomUUID(), songId: song2Id, partId: sopranoId },
    { id: crypto.randomUUID(), songId: song2Id, partId: altoId },
    { id: crypto.randomUUID(), songId: song2Id, partId: tenorId },
    { id: crypto.randomUUID(), songId: song2Id, partId: bassId },
  ]);

  // Song 3 (Lux Aurumque) - SATB
  await db.insert(SongPart).values([
    { id: crypto.randomUUID(), songId: song3Id, partId: sopranoId },
    { id: crypto.randomUUID(), songId: song3Id, partId: altoId },
    { id: crypto.randomUUID(), songId: song3Id, partId: tenorId },
    { id: crypto.randomUUID(), songId: song3Id, partId: bassId },
  ]);

  // Song 4 (The Seal Lullaby) - SATB
  await db.insert(SongPart).values([
    { id: crypto.randomUUID(), songId: song4Id, partId: sopranoId },
    { id: crypto.randomUUID(), songId: song4Id, partId: altoId },
    { id: crypto.randomUUID(), songId: song4Id, partId: tenorId },
    { id: crypto.randomUUID(), songId: song4Id, partId: bassId },
  ]);

  // Song 5 (Sure On This Shining Night) - Full choir with divisi
  await db.insert(SongPart).values([
    { id: crypto.randomUUID(), songId: song5Id, partId: sopranoId },
    { id: crypto.randomUUID(), songId: song5Id, partId: altoId },
    { id: crypto.randomUUID(), songId: song5Id, partId: tenorId },
    { id: crypto.randomUUID(), songId: song5Id, partId: baritoneId },
    { id: crypto.randomUUID(), songId: song5Id, partId: bassId },
  ]);

  // Associate songs with the current season
  // Let's add songs 1, 2, and 3 to the current season
  await db.insert(SeasonSong).values([
    { id: crypto.randomUUID(), seasonId: seasonId, songId: song1Id },
    { id: crypto.randomUUID(), seasonId: seasonId, songId: song2Id },
    { id: crypto.randomUUID(), seasonId: seasonId, songId: song3Id },
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
  console.log('Sample Songs:');
  console.log('  - 5 songs with various composers and arrangers');
  console.log('  - 3 songs assigned to Spring 2026 season');
  console.log('  - All songs have parts assigned');
  console.log('');
  console.log('⚠️  Remember to change passwords in production!');
}
