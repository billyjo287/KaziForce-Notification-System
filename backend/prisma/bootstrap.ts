// Prepares a PRODUCTION database (docs/DEPLOYMENT.md): the lookup lists (places, skills) and the
// admin account. Safe to run on every deploy: it adds what is missing and changes nothing else
// (an existing admin's password is never touched). Unlike prisma/seed.ts it creates no fake
// people and never deletes anything.
//   npm run db:bootstrap -w backend
import 'dotenv/config';
import bcrypt from 'bcrypt';
import { LOCATIONS, SKILLS } from '../src/data/lookups.js';
import { prisma } from '../src/lib/prisma.js';

const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD ?? '';
const name = process.env.ADMIN_NAME?.trim() || 'KaziForce Admin';

for (const location of LOCATIONS) {
  await prisma.location.upsert({ where: { slug: location.slug }, create: location, update: {} });
}
for (const skill of SKILLS) {
  await prisma.skill.upsert({ where: { slug: skill.slug }, create: skill, update: {} });
}

if (!email) {
  console.log('ADMIN_EMAIL is not set: no admin account created.');
} else if (await prisma.user.findUnique({ where: { email } })) {
  console.log(`Admin ${email} already exists (password unchanged).`);
} else {
  if (password.length < 12 || password === 'Password123!') {
    throw new Error(
      'Set ADMIN_PASSWORD to a new password of at least 12 characters (not the example one).',
    );
  }
  await prisma.user.create({
    data: {
      email,
      name,
      role: 'admin',
      passwordHash: await bcrypt.hash(password, 12),
      onboardingCompletedAt: new Date(),
    },
  });
  console.log(`Created the admin account ${email}. You can remove ADMIN_PASSWORD now.`);
}

console.log(`Lookups ready: ${LOCATIONS.length} places, ${SKILLS.length} skills.`);
await prisma.$disconnect();
