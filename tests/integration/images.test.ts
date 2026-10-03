import { describe, it, expect, vi, beforeEach } from 'vitest';
import { db, eq, Ensemble, User } from '@db';

vi.mock('../../src/lib/storage.ts', () => ({
  uploadImage: vi.fn(async (_file: File, kind: string) => `/images/${kind}/00000000-0000-4000-8000-000000000001.png`),
  deleteImage: vi.fn(async () => {}),
}));

import { deleteImage, uploadImage } from '../../src/lib/storage.ts';
import { updateEnsemble } from '../../src/lib/ensemble.ts';
import { deleteEnsemble } from '../../src/lib/admin.ts';
import { adminDeleteUser, updateAvatar } from '../../src/lib/profile.ts';
import { createUser, createEnsemble } from './fixtures.ts';

const OLD = '/images/avatars/00000000-0000-4000-8000-000000000000.png';
const NEW = '/images/avatars/00000000-0000-4000-8000-000000000001.png';
const png = () => new File([new Uint8Array(8)], 'me.png', { type: 'image/png' });
const noFile = () => new File([], '');

beforeEach(() => {
  vi.mocked(deleteImage).mockClear();
  vi.mocked(uploadImage).mockClear();
});

async function userWithAvatar(avatarUrl: string | null) {
  const user = await createUser();
  await db.update(User).set({ avatarUrl }).where(eq(User.id, user!.id));
  return user!;
}

async function avatarOf(userId: string) {
  return (await db.select().from(User).where(eq(User.id, userId)).get())!.avatarUrl;
}

describe('updateAvatar', () => {
  it('uploads the new avatar to storage and deletes the old one', async () => {
    const user = await userWithAvatar(OLD);

    await updateAvatar(user.id, OLD, png(), false);

    expect(uploadImage).toHaveBeenCalledWith(expect.any(File), 'avatars');
    expect(await avatarOf(user.id)).toBe(NEW);
    expect(deleteImage).toHaveBeenCalledWith(OLD);
  });

  it('deletes the avatar when it is removed', async () => {
    const user = await userWithAvatar(OLD);

    await updateAvatar(user.id, OLD, noFile(), true);

    expect(await avatarOf(user.id)).toBeNull();
    expect(deleteImage).toHaveBeenCalledWith(OLD);
  });

  it('leaves storage alone when the avatar is unchanged', async () => {
    const user = await userWithAvatar(OLD);

    await updateAvatar(user.id, OLD, noFile(), false);

    expect(await avatarOf(user.id)).toBe(OLD);
    expect(uploadImage).not.toHaveBeenCalled();
    expect(deleteImage).not.toHaveBeenCalled();
  });

  it('rejects SVG without uploading it', async () => {
    const user = await userWithAvatar(null);
    const svg = new File(['<svg/>'], 'me.svg', { type: 'image/svg+xml' });

    const result = await updateAvatar(user.id, null, svg, false);

    expect(result.type).toBe('error');
    expect(uploadImage).not.toHaveBeenCalled();
  });
});

describe('deleting records with images', () => {
  it('deletes the avatar of a deleted user', async () => {
    const user = await userWithAvatar(OLD);

    await adminDeleteUser(user.id);

    expect(deleteImage).toHaveBeenCalledWith(OLD);
  });

  it('deletes the image of a deleted ensemble', async () => {
    const admin = await createUser();
    const ensemble = await createEnsemble(admin!.id);
    await db.update(Ensemble).set({ imageUrl: OLD }).where(eq(Ensemble.id, ensemble!.id));

    await deleteEnsemble(ensemble!.id);

    expect(deleteImage).toHaveBeenCalledWith(OLD);
  });
});

describe('updateEnsemble', () => {
  const fields = {
    name: 'Choir',
    slug: null,
    description: null,
    discordLink: null,
    discordWebhookUrl: null,
    codeOfConduct: null,
    checkInStartMinutes: 30,
    checkInEndMinutes: 15,
  };

  it('deletes the old image when it is replaced, and keeps it when the image is left out', async () => {
    const admin = await createUser();
    const ensemble = await createEnsemble(admin!.id);
    await db.update(Ensemble).set({ imageUrl: OLD }).where(eq(Ensemble.id, ensemble!.id));

    await updateEnsemble(ensemble!.id, fields);
    expect(deleteImage).not.toHaveBeenCalled();

    await updateEnsemble(ensemble!.id, { ...fields, imageUrl: NEW });
    expect(deleteImage).toHaveBeenCalledWith(OLD);
  });
});
