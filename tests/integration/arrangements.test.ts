import { describe, it, expect, vi } from 'vitest';
import {
  createArrangement,
  getEnsembleArrangements,
  getMemberArrangements,
  getArrangement,
  getArrangementFiles,
  getArrangementMessages,
  getArrangementReviewers,
  addArrangementReviewer,
  updateArrangementStatus,
  addArrangementMessage,
  addArrangementRevision,
} from '../../src/lib/arrangements.ts';
import { db, Arrangement, SongFile, Song, eq } from 'astro:db';
import {
  createUser,
  createEnsemble,
  createMembership,
  createArrangement as createArrangementFixture,
  createSongFile as createSongFileFixture,
  createArrangementMessage as createArrangementMessageFixture,
} from './fixtures.ts';

// Mock storage — avoid real S3 calls
vi.mock('../../src/lib/storage.ts', () => ({
  validateArrangementFile: vi.fn().mockReturnValue({ valid: true }),
  uploadArrangementFile: vi.fn().mockResolvedValue('https://storage.example.com/test-arrangement.pdf'),
  deleteStorageFile: vi.fn().mockResolvedValue(undefined),
  validateSongFile: vi.fn().mockReturnValue({ valid: true }),
  uploadSongFile: vi.fn().mockResolvedValue('https://storage.example.com/test-file.pdf'),
}));

describe('createArrangement', () => {
  it('inserts an Arrangement and ArrangementFile row with status submitted', async () => {
    const user = await createUser();
    const ensemble = await createEnsemble(user!.id);
    const file = new File(['%PDF-1.4'], 'score.pdf', { type: 'application/pdf' });

    const result = await createArrangement(
      {
        ensembleId: ensemble!.id,
        submittedBy: user!.id,
        name: 'Ave Verum Corpus',
        composer: 'Mozart',
      },
      file,
    );

    expect(result.error).toBeUndefined();
    expect(result.id).toBeTruthy();

    const arrangement = await db.select().from(Arrangement).where(eq(Arrangement.id, result.id)).get();
    expect(arrangement?.status).toBe('submitted');
    expect(arrangement?.submittedBy).toBe(user!.id);
    expect(arrangement?.songId).toBeTruthy();

    const song = await db.select().from(Song).where(eq(Song.id, arrangement!.songId)).get();
    expect(song?.name).toBe('Ave Verum Corpus');
    expect(song?.composer).toBe('Mozart');

    const files = await db.select().from(SongFile).where(eq(SongFile.songId, arrangement!.songId)).all();
    expect(files).toHaveLength(1);
    expect(files[0].url).toBe('https://storage.example.com/test-arrangement.pdf');
  });

  it('returns an error when storage validation fails', async () => {
    const { validateArrangementFile } = await import('../../src/lib/storage.ts');
    vi.mocked(validateArrangementFile).mockReturnValueOnce({ valid: false, error: 'Only PDF files are allowed for arrangements.' });

    const user = await createUser();
    const ensemble = await createEnsemble(user!.id);
    const file = new File(['data'], 'track.mp3', { type: 'audio/mpeg' });

    const result = await createArrangement(
      { ensembleId: ensemble!.id, submittedBy: user!.id, name: 'Bad Upload' },
      file,
    );

    expect(result.error).toBe('Only PDF files are allowed for arrangements.');
    expect(result.id).toBe('');
  });
});

describe('getEnsembleArrangements', () => {
  it('returns all arrangements for an ensemble with submitter name', async () => {
    const admin = await createUser({ name: 'Admin User' });
    const ensemble = await createEnsemble(admin!.id);
    const member = await createUser({ name: 'Choir Member' });
    await createMembership(ensemble!.id, member!.id);

    await createArrangementFixture(ensemble!.id, member!.id, { name: 'First Arrangement' });
    await createArrangementFixture(ensemble!.id, admin!.id, { name: 'Second Arrangement' });

    const arrangements = await getEnsembleArrangements(ensemble!.id);
    expect(arrangements).toHaveLength(2);
    const names = arrangements.map((a) => a.name);
    expect(names).toContain('First Arrangement');
    expect(names).toContain('Second Arrangement');

    const first = arrangements.find((a) => a.name === 'First Arrangement');
    expect(first?.submitterName).toBe('Choir Member');
  });

  it('returns an empty array when there are no arrangements', async () => {
    const user = await createUser();
    const ensemble = await createEnsemble(user!.id);
    const arrangements = await getEnsembleArrangements(ensemble!.id);
    expect(arrangements).toHaveLength(0);
  });
});

describe('getMemberArrangements', () => {
  it('returns only the requesting user\'s arrangements', async () => {
    const user = await createUser();
    const other = await createUser();
    const ensemble = await createEnsemble(user!.id);

    await createArrangementFixture(ensemble!.id, user!.id, { name: 'My Arrangement' });
    await createArrangementFixture(ensemble!.id, other!.id, { name: 'Their Arrangement' });

    const mine = await getMemberArrangements(ensemble!.id, user!.id);
    expect(mine).toHaveLength(1);
    expect(mine[0].name).toBe('My Arrangement');
  });
});

describe('getArrangement', () => {
  it('returns the arrangement with submitter name', async () => {
    const submitter = await createUser({ name: 'Submitter' });
    const ensemble = await createEnsemble(submitter!.id);

    const fixture = await createArrangementFixture(ensemble!.id, submitter!.id, {
      name: 'Detail Test',
      status: 'in_review',
    });

    const arrangement = await getArrangement(fixture!.id);
    expect(arrangement?.name).toBe('Detail Test');
    expect(arrangement?.submitterName).toBe('Submitter');
    expect(arrangement?.status).toBe('in_review');
  });

  it('returns null for a non-existent id', async () => {
    const result = await getArrangement('non-existent-id');
    expect(result).toBeFalsy();
  });
});

describe('updateArrangementStatus', () => {
  it('transitions status and records reviewer via addArrangementReviewer', async () => {
    const user = await createUser();
    const reviewer = await createUser();
    const ensemble = await createEnsemble(user!.id);
    const fixture = await createArrangementFixture(ensemble!.id, user!.id, { status: 'submitted' });

    await addArrangementReviewer(fixture!.id, reviewer!.id);
    await updateArrangementStatus(fixture!.id, 'in_review');

    const updated = await db.select().from(Arrangement).where(eq(Arrangement.id, fixture!.id)).get();
    expect(updated?.status).toBe('in_review');

    const reviewers = await getArrangementReviewers(fixture!.id);
    expect(reviewers.some((r) => r.userId === reviewer!.id)).toBe(true);
  });

  it('transitions through needs_revision → approved', async () => {
    const user = await createUser();
    const ensemble = await createEnsemble(user!.id);
    const fixture = await createArrangementFixture(ensemble!.id, user!.id, { status: 'in_review' });

    await updateArrangementStatus(fixture!.id, 'needs_revision');
    let row = await db.select().from(Arrangement).where(eq(Arrangement.id, fixture!.id)).get();
    expect(row?.status).toBe('needs_revision');

    await updateArrangementStatus(fixture!.id, 'approved');
    row = await db.select().from(Arrangement).where(eq(Arrangement.id, fixture!.id)).get();
    expect(row?.status).toBe('approved');
  });
});

describe('addArrangementMessage', () => {
  it('inserts a message visible via getArrangementMessages', async () => {
    const user = await createUser({ name: 'Test Author' });
    const ensemble = await createEnsemble(user!.id);
    const fixture = await createArrangementFixture(ensemble!.id, user!.id);

    await addArrangementMessage(fixture!.id, user!.id, 'Please add more dynamics.');

    const messages = await getArrangementMessages(fixture!.id);
    expect(messages).toHaveLength(1);
    expect(messages[0].content).toBe('Please add more dynamics.');
    expect(messages[0].authorName).toBe('Test Author');
  });

  it('returns messages in chronological order', async () => {
    const user = await createUser();
    const ensemble = await createEnsemble(user!.id);
    const fixture = await createArrangementFixture(ensemble!.id, user!.id);

    await createArrangementMessageFixture(fixture!.id, user!.id, { content: 'First message' });
    await createArrangementMessageFixture(fixture!.id, user!.id, { content: 'Second message' });

    const messages = await getArrangementMessages(fixture!.id);
    expect(messages[0].content).toBe('First message');
    expect(messages[1].content).toBe('Second message');
  });
});

describe('addArrangementRevision', () => {
  it('inserts a new SongFile and resets status to submitted', async () => {
    const user = await createUser();
    const ensemble = await createEnsemble(user!.id);
    const fixture = await createArrangementFixture(ensemble!.id, user!.id, { status: 'needs_revision' });
    await createSongFileFixture(fixture!.songId, user!.id);

    const newFile = new File(['%PDF-1.4 revised'], 'revision.pdf', { type: 'application/pdf' });
    const result = await addArrangementRevision(fixture!.id, newFile, ensemble!.id, user!.id);

    expect(result.error).toBeUndefined();

    const files = await getArrangementFiles(fixture!.songId);
    expect(files).toHaveLength(2);

    const arrangement = await db.select().from(Arrangement).where(eq(Arrangement.id, fixture!.id)).get();
    expect(arrangement?.status).toBe('submitted');
  });
});
