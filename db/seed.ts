import { db, User, Ensemble, EnsembleMember } from 'astro:db';
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

  console.log('Seeded database with admin user');
  console.log('Email: admin@example.com');
  console.log('Password: admin123 (Please change this in production!)');
}
