import { describe, it, expect, vi } from 'vitest';
import { db, eq, Arrangement, ArrangementPart, ArrangementVersion, Song, SongFile, SongPart } from '@db';
import {
  createUser,
  createEnsemble,
  createMembership,
  createGroup,
  createGroupMembership,
  createPart,
} from './fixtures.ts';
import {
  submitArrangement,
  addArrangementVersion,
  addArrangementComment,
  approveArrangement,
  declineArrangement,
  setArrangementReviewGroup,
  isArrangementReviewer,
  isAudioFile,
  isPdfFile,
  toRunTime,
  getEnsembleArrangements,
  getArrangementDetail,
  getArrangementFileWithAccess,
} from '../../src/lib/arrangements.ts';
import { validateSongFile } from '../../src/lib/storage.ts';

vi.mock('../../src/lib/storage.ts', () => ({
  validateSongFile: vi.fn().mockReturnValue({ valid: true }),
  uploadArrangementFile: vi.fn().mockResolvedValue('https://storage.example.com/arrangement.pdf'),
  uploadSongFile: vi.fn().mockResolvedValue('https://storage.example.com/test.pdf'),
  deleteStorageFile: vi.fn().mockResolvedValue(undefined),
}));

function pdfFile(name = 'score.pdf') {
  return new File([new Uint8Array(16)], name, { type: 'application/pdf' });
}

async function setupEnsemble() {
  const admin = await createUser();
  const submitter = await createUser({ name: 'Sub Mitter' });
  const ensemble = await createEnsemble(admin!.id);
  await createMembership(ensemble!.id, admin!.id, { role: 'admin' });
  await createMembership(ensemble!.id, submitter!.id);
  return { admin, submitter, ensemble };
}

describe('arrangements lib', () => {
  describe('file type helpers', () => {
    it('detects PDFs and audio files case-insensitively', () => {
      expect(isPdfFile('score.pdf')).toBe(true);
      expect(isPdfFile('SCORE.PDF')).toBe(true);
      expect(isPdfFile('track.mp3')).toBe(false);
      expect(isAudioFile('track.mp3')).toBe(true);
      expect(isAudioFile('track.MP3')).toBe(true);
      expect(isAudioFile('score.pdf')).toBe(false);
    });
  });

  describe('submitArrangement', () => {
    it('creates an arrangement with an initial version', async () => {
      const { submitter, ensemble } = await setupEnsemble();

      const result = await submitArrangement(ensemble!.id, submitter!.id, {
        title: '  My Arrangement  ',
        composer: 'Bach',
        arranger: 'Me',
        notes: 'First draft',
        file: pdfFile(),
      });

      expect(result.error).toBeUndefined();
      const arrangement = await db
        .select()
        .from(Arrangement)
        .where(eq(Arrangement.id, result.arrangementId!))
        .get();
      expect(arrangement!.title).toBe('My Arrangement');
      expect(arrangement!.composer).toBe('Bach');
      expect(arrangement!.status).toBe('in_review');
      expect(arrangement!.submittedBy).toBe(submitter!.id);

      const versions = await db
        .select()
        .from(ArrangementVersion)
        .where(eq(ArrangementVersion.arrangementId, arrangement!.id))
        .all();
      expect(versions).toHaveLength(1);
      expect(versions[0].versionNumber).toBe(1);
      expect(versions[0].fileName).toBe('score.pdf');
      expect(versions[0].uploadedBy).toBe(submitter!.id);
    });

    it('rejects a missing title', async () => {
      const { submitter, ensemble } = await setupEnsemble();
      const result = await submitArrangement(ensemble!.id, submitter!.id, {
        title: '   ',
        file: pdfFile(),
      });
      expect(result.error).toBe('A title is required.');
    });

    it('rejects a missing file', async () => {
      const { submitter, ensemble } = await setupEnsemble();
      const result = await submitArrangement(ensemble!.id, submitter!.id, {
        title: 'No File',
      });
      expect(result.error).toBe('An arrangement file is required.');
    });

    it('rejects an invalid file', async () => {
      const { submitter, ensemble } = await setupEnsemble();
      vi.mocked(validateSongFile).mockReturnValueOnce({
        valid: false,
        error: 'Only PDF and MP3 files are allowed.',
      });
      const result = await submitArrangement(ensemble!.id, submitter!.id, {
        title: 'Bad File',
        file: pdfFile('bad.txt'),
      });
      expect(result.error).toBe('Only PDF and MP3 files are allowed.');
    });
  });

  describe('addArrangementVersion', () => {
    it('increments the version number', async () => {
      const { submitter, ensemble } = await setupEnsemble();
      const { arrangementId } = await submitArrangement(ensemble!.id, submitter!.id, {
        title: 'Versioned',
        file: pdfFile(),
      });

      const result = await addArrangementVersion(arrangementId!, submitter!.id, {
        notes: 'Fixed the alto line',
        file: pdfFile('score-v2.pdf'),
      });

      expect(result.error).toBeUndefined();
      const versions = await db
        .select()
        .from(ArrangementVersion)
        .where(eq(ArrangementVersion.arrangementId, arrangementId!))
        .all();
      expect(versions).toHaveLength(2);
      expect(versions.map((v) => v.versionNumber).sort()).toEqual([1, 2]);
    });

    it('rejects uploads to an approved arrangement', async () => {
      const { admin, submitter, ensemble } = await setupEnsemble();
      const { arrangementId } = await submitArrangement(ensemble!.id, submitter!.id, {
        title: 'Done',
        file: pdfFile(),
      });
      await approveArrangement(arrangementId!, admin!.id);

      const result = await addArrangementVersion(arrangementId!, submitter!.id, {
        file: pdfFile(),
      });
      expect(result.error).toBe('This arrangement has already been approved.');
    });

    it('reopens a declined arrangement', async () => {
      const { submitter, ensemble } = await setupEnsemble();
      const { arrangementId } = await submitArrangement(ensemble!.id, submitter!.id, {
        title: 'Declined',
        file: pdfFile(),
      });
      await declineArrangement(arrangementId!);

      await addArrangementVersion(arrangementId!, submitter!.id, { file: pdfFile() });

      const arrangement = await db
        .select()
        .from(Arrangement)
        .where(eq(Arrangement.id, arrangementId!))
        .get();
      expect(arrangement!.status).toBe('in_review');
    });
  });

  describe('review group', () => {
    it('setArrangementReviewGroup assigns a group of the same ensemble', async () => {
      const { admin, ensemble } = await setupEnsemble();
      const group = await createGroup(ensemble!.id, { name: 'Artistic Guild' });

      const result = await setArrangementReviewGroup(ensemble!.id, group!.id);
      expect(result.error).toBeUndefined();

      const reviewer = await createUser();
      await createMembership(ensemble!.id, reviewer!.id);
      await createGroupMembership(group!.id, reviewer!.id);

      expect(await isArrangementReviewer(ensemble!.id, reviewer!.id)).toBe(true);
      expect(await isArrangementReviewer(ensemble!.id, admin!.id)).toBe(false);
    });

    it('rejects a group belonging to a different ensemble', async () => {
      const { ensemble } = await setupEnsemble();
      const otherOwner = await createUser();
      const otherEnsemble = await createEnsemble(otherOwner!.id);
      const foreignGroup = await createGroup(otherEnsemble!.id);

      const result = await setArrangementReviewGroup(ensemble!.id, foreignGroup!.id);
      expect(result.error).toBe('Group not found in this ensemble.');
    });

    it('clears the review group with null', async () => {
      const { ensemble } = await setupEnsemble();
      const group = await createGroup(ensemble!.id);
      await setArrangementReviewGroup(ensemble!.id, group!.id);
      const reviewer = await createUser();
      await createGroupMembership(group!.id, reviewer!.id);

      await setArrangementReviewGroup(ensemble!.id, null);
      expect(await isArrangementReviewer(ensemble!.id, reviewer!.id)).toBe(false);
    });

    it('isArrangementReviewer is false when no group is assigned', async () => {
      const { submitter, ensemble } = await setupEnsemble();
      expect(await isArrangementReviewer(ensemble!.id, submitter!.id)).toBe(false);
    });
  });

  describe('getEnsembleArrangements', () => {
    it('shows only own submissions unless the viewer can see all', async () => {
      const { admin, submitter, ensemble } = await setupEnsemble();
      await submitArrangement(ensemble!.id, submitter!.id, { title: 'Mine', file: pdfFile() });
      await submitArrangement(ensemble!.id, admin!.id, { title: 'Theirs', file: pdfFile() });

      const own = await getEnsembleArrangements(ensemble!.id, submitter!.id, false);
      expect(own.arrangements).toHaveLength(1);
      expect(own.arrangements[0].title).toBe('Mine');
      expect(own.arrangements[0].submitterName).toBe('Sub Mitter');

      const all = await getEnsembleArrangements(ensemble!.id, submitter!.id, true);
      expect(all.arrangements).toHaveLength(2);
    });

    it('counts versions per arrangement', async () => {
      const { submitter, ensemble } = await setupEnsemble();
      const { arrangementId } = await submitArrangement(ensemble!.id, submitter!.id, {
        title: 'Counted',
        file: pdfFile(),
      });
      await addArrangementVersion(arrangementId!, submitter!.id, { file: pdfFile() });

      const { versionCounts } = await getEnsembleArrangements(ensemble!.id, submitter!.id, false);
      expect(versionCounts.get(arrangementId!)).toBe(2);
    });
  });

  describe('comments and detail', () => {
    it('adds a comment and returns it with the version number', async () => {
      const { admin, submitter, ensemble } = await setupEnsemble();
      const { arrangementId } = await submitArrangement(ensemble!.id, submitter!.id, {
        title: 'Discussed',
        file: pdfFile(),
      });
      const detailBefore = await getArrangementDetail(arrangementId!);
      const versionId = detailBefore.versions[0].id;

      const result = await addArrangementComment(versionId, admin!.id, '  Needs work  ');
      expect(result.error).toBeUndefined();

      const { arrangement, versions, comments } = await getArrangementDetail(arrangementId!);
      expect(arrangement!.title).toBe('Discussed');
      expect(versions).toHaveLength(1);
      expect(comments).toHaveLength(1);
      expect(comments[0].content).toBe('Needs work');
      expect(comments[0].versionNumber).toBe(1);
    });

    it('rejects an empty comment', async () => {
      const { admin, submitter, ensemble } = await setupEnsemble();
      const { arrangementId } = await submitArrangement(ensemble!.id, submitter!.id, {
        title: 'Quiet',
        file: pdfFile(),
      });
      const { versions } = await getArrangementDetail(arrangementId!);

      const result = await addArrangementComment(versions[0].id, admin!.id, '   ');
      expect(result.error).toBe('A comment is required.');
    });

    it('lists versions newest first', async () => {
      const { submitter, ensemble } = await setupEnsemble();
      const { arrangementId } = await submitArrangement(ensemble!.id, submitter!.id, {
        title: 'Ordered',
        file: pdfFile(),
      });
      await addArrangementVersion(arrangementId!, submitter!.id, { file: pdfFile() });

      const { versions } = await getArrangementDetail(arrangementId!);
      expect(versions.map((v) => v.versionNumber)).toEqual([2, 1]);
    });
  });

  describe('approveArrangement', () => {
    it('creates a song with the latest file and marks the arrangement approved', async () => {
      const { admin, submitter, ensemble } = await setupEnsemble();
      const { arrangementId } = await submitArrangement(ensemble!.id, submitter!.id, {
        title: 'Adopted',
        composer: 'Composer',
        arranger: 'Arranger',
        file: pdfFile(),
      });

      const result = await approveArrangement(arrangementId!, admin!.id);
      expect(result.error).toBeUndefined();

      const song = await db.select().from(Song).where(eq(Song.id, result.songId!)).get();
      expect(song!.name).toBe('Adopted');
      expect(song!.composer).toBe('Composer');
      expect(song!.arranger).toBe('Arranger');
      expect(song!.ensembleId).toBe(ensemble!.id);

      const files = await db.select().from(SongFile).where(eq(SongFile.songId, song!.id)).all();
      expect(files).toHaveLength(1);
      expect(files[0].category).toBe('sheet_music');
      expect(files[0].uploadedBy).toBe(admin!.id);

      const arrangement = await db
        .select()
        .from(Arrangement)
        .where(eq(Arrangement.id, arrangementId!))
        .get();
      expect(arrangement!.status).toBe('approved');
      expect(arrangement!.approvedSongId).toBe(song!.id);
    });

    it('categorizes an mp3 as a rehearsal track', async () => {
      const { admin, submitter, ensemble } = await setupEnsemble();
      const { arrangementId } = await submitArrangement(ensemble!.id, submitter!.id, {
        title: 'Audio',
        file: pdfFile('demo.MP3'),
      });

      const result = await approveArrangement(arrangementId!, admin!.id);
      const files = await db
        .select()
        .from(SongFile)
        .where(eq(SongFile.songId, result.songId!))
        .all();
      expect(files[0].category).toBe('rehearsal_track');
    });

    it('cannot approve twice', async () => {
      const { admin, submitter, ensemble } = await setupEnsemble();
      const { arrangementId } = await submitArrangement(ensemble!.id, submitter!.id, {
        title: 'Once',
        file: pdfFile(),
      });
      await approveArrangement(arrangementId!, admin!.id);

      const result = await approveArrangement(arrangementId!, admin!.id);
      expect(result.error).toBe('Already approved.');
    });
  });

  describe('declineArrangement', () => {
    it('marks the arrangement declined', async () => {
      const { submitter, ensemble } = await setupEnsemble();
      const { arrangementId } = await submitArrangement(ensemble!.id, submitter!.id, {
        title: 'Rejected',
        file: pdfFile(),
      });

      const result = await declineArrangement(arrangementId!);
      expect(result.error).toBeUndefined();

      const arrangement = await db
        .select()
        .from(Arrangement)
        .where(eq(Arrangement.id, arrangementId!))
        .get();
      expect(arrangement!.status).toBe('declined');
    });

    it('cannot decline an approved arrangement', async () => {
      const { admin, submitter, ensemble } = await setupEnsemble();
      const { arrangementId } = await submitArrangement(ensemble!.id, submitter!.id, {
        title: 'Locked',
        file: pdfFile(),
      });
      await approveArrangement(arrangementId!, admin!.id);

      const result = await declineArrangement(arrangementId!);
      expect(result.error).toBe('Already approved.');
    });
  });

  describe('parts and runtime', () => {
    it('stores runtime and selected parts on submission', async () => {
      const { submitter, ensemble } = await setupEnsemble();
      const soprano = await createPart(ensemble!.id, { name: 'Soprano', sortOrder: 0 });
      const alto = await createPart(ensemble!.id, { name: 'Alto', sortOrder: 1 });

      const { arrangementId } = await submitArrangement(ensemble!.id, submitter!.id, {
        title: 'With Parts',
        runTimeMinutes: 3,
        runTimeSeconds: 45,
        parts: [soprano!.id, alto!.id],
        file: pdfFile(),
      });

      const arrangement = await db
        .select()
        .from(Arrangement)
        .where(eq(Arrangement.id, arrangementId!))
        .get();
      expect(arrangement!.runTime).toBe(225);

      const linked = await db
        .select()
        .from(ArrangementPart)
        .where(eq(ArrangementPart.arrangementId, arrangementId!))
        .all();
      expect(linked).toHaveLength(2);
    });

    it('leaves runtime null when omitted and records no parts', async () => {
      const { submitter, ensemble } = await setupEnsemble();
      const { arrangementId } = await submitArrangement(ensemble!.id, submitter!.id, {
        title: 'Bare',
        file: pdfFile(),
      });

      const arrangement = await db
        .select()
        .from(Arrangement)
        .where(eq(Arrangement.id, arrangementId!))
        .get();
      expect(arrangement!.runTime).toBeNull();

      const { parts } = await getArrangementDetail(arrangementId!);
      expect(parts).toHaveLength(0);
    });

    it('returns parts ordered by sortOrder in detail and list views', async () => {
      const { submitter, ensemble } = await setupEnsemble();
      const bass = await createPart(ensemble!.id, { name: 'Bass', sortOrder: 3 });
      const soprano = await createPart(ensemble!.id, { name: 'Soprano', sortOrder: 0 });

      const { arrangementId } = await submitArrangement(ensemble!.id, submitter!.id, {
        title: 'Ordered Parts',
        parts: [bass!.id, soprano!.id],
        file: pdfFile(),
      });

      const { parts } = await getArrangementDetail(arrangementId!);
      expect(parts.map((p) => p.name)).toEqual(['Soprano', 'Bass']);

      const { partsByArrangement } = await getEnsembleArrangements(
        ensemble!.id,
        submitter!.id,
        true
      );
      expect(partsByArrangement.get(arrangementId!)).toEqual(['Soprano', 'Bass']);
    });

    it('carries runtime and parts onto the song when approved', async () => {
      const { admin, submitter, ensemble } = await setupEnsemble();
      const soprano = await createPart(ensemble!.id, { name: 'Soprano', sortOrder: 0 });
      const tenor = await createPart(ensemble!.id, { name: 'Tenor', sortOrder: 2 });

      const { arrangementId } = await submitArrangement(ensemble!.id, submitter!.id, {
        title: 'Inherited',
        runTimeMinutes: 2,
        runTimeSeconds: 30,
        parts: [soprano!.id, tenor!.id],
        file: pdfFile(),
      });

      const result = await approveArrangement(arrangementId!, admin!.id);

      const song = await db.select().from(Song).where(eq(Song.id, result.songId!)).get();
      expect(song!.runTime).toBe(150);

      const songParts = await db
        .select()
        .from(SongPart)
        .where(eq(SongPart.songId, result.songId!))
        .all();
      expect(songParts.map((sp) => sp.partId).sort()).toEqual(
        [soprano!.id, tenor!.id].sort()
      );
    });

    it('toRunTime converts minutes and seconds, treating zero as unset', () => {
      expect(toRunTime(3, 45)).toBe(225);
      expect(toRunTime(0, 30)).toBe(30);
      expect(toRunTime(2, undefined)).toBe(120);
      expect(toRunTime(undefined, undefined)).toBeNull();
      expect(toRunTime(0, 0)).toBeNull();
    });
  });

  describe('getArrangementFileWithAccess', () => {
    async function setupWithVersion() {
      const { admin, submitter, ensemble } = await setupEnsemble();
      const { arrangementId } = await submitArrangement(ensemble!.id, submitter!.id, {
        title: 'Guarded',
        file: pdfFile(),
      });
      const { versions } = await getArrangementDetail(arrangementId!);
      return { admin, submitter, ensemble, versionId: versions[0].id };
    }

    it('allows the submitter', async () => {
      const { submitter, versionId } = await setupWithVersion();
      const result = await getArrangementFileWithAccess(versionId, {
        id: submitter!.id,
        role: 'user',
      });
      expect(result).not.toBeNull();
      expect(result!.name).toBe('score.pdf');
    });

    it('allows an ensemble admin', async () => {
      const { admin, versionId } = await setupWithVersion();
      const result = await getArrangementFileWithAccess(versionId, {
        id: admin!.id,
        role: 'user',
      });
      expect(result).not.toBeNull();
    });

    it('allows a review-group member', async () => {
      const { ensemble, versionId } = await setupWithVersion();
      const group = await createGroup(ensemble!.id);
      await setArrangementReviewGroup(ensemble!.id, group!.id);
      const reviewer = await createUser();
      await createMembership(ensemble!.id, reviewer!.id);
      await createGroupMembership(group!.id, reviewer!.id);

      const result = await getArrangementFileWithAccess(versionId, {
        id: reviewer!.id,
        role: 'user',
      });
      expect(result).not.toBeNull();
    });

    it('denies a regular member who is not the submitter', async () => {
      const { ensemble, versionId } = await setupWithVersion();
      const other = await createUser();
      await createMembership(ensemble!.id, other!.id);

      const result = await getArrangementFileWithAccess(versionId, {
        id: other!.id,
        role: 'user',
      });
      expect(result).toBeNull();
    });

    it('denies a non-member', async () => {
      const { versionId } = await setupWithVersion();
      const outsider = await createUser();
      const result = await getArrangementFileWithAccess(versionId, {
        id: outsider!.id,
        role: 'user',
      });
      expect(result).toBeNull();
    });

    it('allows a site admin', async () => {
      const { versionId } = await setupWithVersion();
      const siteAdmin = await createUser({ role: 'admin' });
      const result = await getArrangementFileWithAccess(versionId, {
        id: siteAdmin!.id,
        role: 'admin',
      });
      expect(result).not.toBeNull();
    });

    it('returns null for a missing version', async () => {
      const user = await createUser();
      const result = await getArrangementFileWithAccess(crypto.randomUUID(), {
        id: user!.id,
        role: 'user',
      });
      expect(result).toBeNull();
    });
  });
});
