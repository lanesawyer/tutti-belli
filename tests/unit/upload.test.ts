import { describe, it, expect } from 'vitest';
import { validateImageFile } from '../../src/lib/upload.ts';

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

  it('rejects SVG, which could run scripts when served from our origin', () => {
    const file = new File(['<svg/>'], 'logo.svg', { type: 'image/svg+xml' });
    expect(validateImageFile(file, 2).valid).toBe(false);
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
