import { db, eq, SiteBanner } from 'astro:db';

export type BannerColor = 'primary' | 'link' | 'info' | 'success' | 'warning' | 'danger';

export async function getActiveBanner() {
  return (await db.select().from(SiteBanner).where(eq(SiteBanner.isActive, 1)).get()) ?? null;
}

export async function setBanner(message: string, color: BannerColor) {
  // Deactivate any existing banners
  await db.update(SiteBanner).set({ isActive: 0 });

  await db.insert(SiteBanner).values({
    id: crypto.randomUUID(),
    message,
    color,
    isActive: 1,
  });
}

export async function clearBanner() {
  await db.update(SiteBanner).set({ isActive: 0 });
}
