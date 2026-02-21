import { db, User, Ensemble, EnsembleMember, Part, EnsembleInvite, Rehearsal } from 'astro:db';
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

  // Create a test ensemble
  const ensembleId = crypto.randomUUID();
  await db.insert(Ensemble).values([
    {
      id: ensembleId,
      name: 'Chamber Orchestra',
      description: 'A test ensemble for development and testing',
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

  // Create an upcoming rehearsal
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + 7); // 1 week from now
  futureDate.setHours(19, 0, 0, 0); // 7 PM

  await db.insert(Rehearsal).values([
    {
      id: crypto.randomUUID(),
      ensembleId: ensembleId,
      title: 'Weekly Rehearsal',
      description: 'Regular practice session',
      scheduledAt: futureDate,
      location: 'Music Hall, Room 101',
      checkInCode: crypto.randomUUID().substring(0, 8).toUpperCase(),
    },
  ]);

  console.log('✓ Seeded database successfully!');
  console.log('');
  console.log('Admin Account:');
  console.log('  Email: admin@example.com');
  console.log('  Password: admin123');
  console.log('');
  console.log('Test User Account:');
  console.log('  Email: test@example.com');
  console.log('  Password: test123');
  console.log('');
  console.log('Test Ensemble: Chamber Orchestra');
  console.log('  Invite Code: TEST1234');
  console.log('');
  console.log('⚠️  Remember to change passwords in production!');
}
