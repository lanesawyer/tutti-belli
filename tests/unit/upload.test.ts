import { describe, it, expect } from 'vitest';
import { validateImageFile, fileToDataUri } from '../../src/lib/upload.ts';

describe('validateImageFile', () => {
  it('accepts image/jpeg', () => {
    const file = new File(['data'], 'photo.jpg', { type: 'image/jpeg' });
    expect(validateImageFile(file, 2).valid).toBe(true);
  });

  it('accepts image/png', () => {
    const file = new File(['data'], 'photo.png', { type: 'image/png' });
    expect(validateImageFile(file, 2).valid).toBe(true);
  });

  it('accepts image/gif', () => {
    const file = new File(['data'], 'anim.gif', { type: 'image/gif' });
    expect(validateImageFile(file, 2).valid).toBe(true);
  });

  it('accepts image/webp', () => {
    const file = new File(['data'], 'photo.webp', { type: 'image/webp' });
    expect(validateImageFile(file, 2).valid).toBe(true);
  });

  it('rejects application/pdf', () => {
    const file = new File(['data'], 'doc.pdf', { type: 'application/pdf' });
    const result = validateImageFile(file, 2);
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/image/i);
  });

  it('rejects text/plain', () => {
    const file = new File(['hello'], 'note.txt', { type: 'text/plain' });
    const result = validateImageFile(file, 2);
    expect(result.valid).toBe(false);
  });

  it('rejects a file that exceeds the size limit', () => {
    const oversized = new Uint8Array(3 * 1024 * 1024); // 3MB
    const file = new File([oversized], 'big.jpg', { type: 'image/jpeg' });
    const result = validateImageFile(file, 2);
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/2MB/);
  });

  it('accepts a file exactly at the size limit', () => {
    const atLimit = new Uint8Array(2 * 1024 * 1024); // exactly 2MB
    const file = new File([atLimit], 'ok.jpg', { type: 'image/jpeg' });
    expect(validateImageFile(file, 2).valid).toBe(true);
  });
});

describe('fileToDataUri', () => {
  it('returns a base64-encoded data URI', async () => {
    const file = new File(['hello'], 'test.png', { type: 'image/png' });
    const uri = await fileToDataUri(file);
    expect(uri).toMatch(/^data:image\/png;base64,/);
  });

  it('encodes the file content correctly', async () => {
    const content = 'test content';
    const file = new File([content], 'test.txt', { type: 'text/plain' });
    const uri = await fileToDataUri(file);
    const base64Part = uri.split(',')[1];
    expect(Buffer.from(base64Part, 'base64').toString()).toBe(content);
  });
});
