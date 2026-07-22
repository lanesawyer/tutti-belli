import { describe, it, expect, vi } from 'vitest';

// storage.ts runs S3 client setup at module load — set env vars before import
vi.hoisted(() => {
  process.env.STORAGE_ENDPOINT = 'https://s3.us-west-004.backblazeb2.com';
  process.env.STORAGE_BUCKET = 'test-bucket';
  process.env.STORAGE_KEY_ID = 'test-key';
  process.env.STORAGE_KEY = 'test-secret';
});

import { validateArrangementFile } from '../../src/lib/storage.ts';

describe('validateArrangementFile', () => {
  it('accepts application/pdf', () => {
    const file = new File(['%PDF-1.4'], 'score.pdf', { type: 'application/pdf' });
    expect(validateArrangementFile(file).valid).toBe(true);
  });

  it('accepts audio/mpeg', () => {
    const file = new File(['data'], 'track.mp3', { type: 'audio/mpeg' });
    expect(validateArrangementFile(file).valid).toBe(true);
  });

  it('accepts a .mscz file (MuseScore compressed)', () => {
    const file = new File(['data'], 'score.mscz', { type: 'application/octet-stream' });
    expect(validateArrangementFile(file).valid).toBe(true);
  });

  it('accepts a .mscx file (MuseScore uncompressed)', () => {
    const file = new File(['data'], 'score.mscx', { type: 'text/xml' });
    expect(validateArrangementFile(file).valid).toBe(true);
  });

  it('rejects image/jpeg', () => {
    const file = new File(['data'], 'photo.jpg', { type: 'image/jpeg' });
    const result = validateArrangementFile(file);
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/MuseScore/i);
  });

  it('rejects text/plain', () => {
    const file = new File(['hello'], 'note.txt', { type: 'text/plain' });
    const result = validateArrangementFile(file);
    expect(result.valid).toBe(false);
  });

  it('rejects a file that exceeds 50 MB', () => {
    const oversized = new Uint8Array(51 * 1024 * 1024);
    const file = new File([oversized], 'big.pdf', { type: 'application/pdf' });
    const result = validateArrangementFile(file);
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/50 MB/i);
  });

  it('accepts a PDF exactly at the 50 MB limit', () => {
    const atLimit = new Uint8Array(50 * 1024 * 1024);
    const file = new File([atLimit], 'ok.pdf', { type: 'application/pdf' });
    expect(validateArrangementFile(file).valid).toBe(true);
  });
});
