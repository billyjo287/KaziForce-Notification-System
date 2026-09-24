import { Router } from 'express';
import { prisma } from '../../lib/prisma.js';

/** Public lists for dropdowns: Kenyan places and skills. They rarely change, so browsers cache them. */
export function lookupRoutes() {
  const router = Router();

  router.get('/locations', async (_req, res) => {
    const locations = await prisma.location.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, name: true, county: true },
    });
    res.set('Cache-Control', 'public, max-age=3600').json({ locations });
  });

  router.get('/skills', async (_req, res) => {
    const skills = await prisma.skill.findMany({
      orderBy: { nameEn: 'asc' },
      select: { id: true, nameEn: true, nameSw: true },
    });
    res.set('Cache-Control', 'public, max-age=3600').json({ skills });
  });

  return router;
}
