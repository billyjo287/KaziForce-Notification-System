import type { Prisma } from '../../generated/prisma/client.js';

/** What we load for "the current user" everywhere. */
export const userWithProfile = {
  location: true,
  skills: { orderBy: { nameEn: 'asc' } },
  preference: { select: { preset: true, channelOrder: true } },
} satisfies Prisma.UserInclude;

export type UserWithProfile = Prisma.UserGetPayload<{ include: typeof userWithProfile }>;

/** The user as the website sees it (never the password hash or internal fields). */
export function serializeUser(user: UserWithProfile) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    language: user.language,
    phone: user.phone,
    phoneVerified: user.phoneVerified,
    usesWhatsApp: user.usesWhatsApp,
    companyName: user.companyName,
    location: user.location ? { id: user.location.id, name: user.location.name } : null,
    skills: user.skills.map((s) => ({ id: s.id, nameEn: s.nameEn, nameSw: s.nameSw })),
    onboardingCompleted: user.onboardingCompletedAt !== null,
    preference: user.preference,
  };
}
