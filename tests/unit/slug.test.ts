import { describe, it, expect } from 'vitest';
import { generateSlug, getEnsembleUrlId } from '../../src/lib/slug.ts';

describe('generateSlug', () => {
  it('lowercases the input', () => {
    expect(generateSlug('My Ensemble')).toBe('my-ensemble');
  });

  it('replaces spaces with hyphens', () => {
    expect(generateSlug('Chamber Orchestra')).toBe('chamber-orchestra');
  });

  it('collapses multiple spaces into a single hyphen', () => {
    expect(generateSlug('too  many  spaces')).toBe('too-many-spaces');
  });

  it('removes special characters', () => {
    expect(generateSlug('The "Best" Choir!')).toBe('the-best-choir');
  });

  it('normalizes accented characters (strips diacritics via NFD)', () => {
    // NFD normalizes accented letters — e.g. 'é' → 'e', 'ü' → 'u'
    expect(generateSlug('Übung')).toBe('ubung');
    expect(generateSlug('café')).toBe('cafe');
  });

  it('strips leading and trailing hyphens', () => {
    expect(generateSlug(' -leading and trailing- ')).toBe('leading-and-trailing');
  });

  it('returns empty string for input with no valid chars', () => {
    expect(generateSlug('!!!')).toBe('');
  });
});

describe('getEnsembleUrlId', () => {
  it('returns the slug when one is set', () => {
    expect(getEnsembleUrlId({ id: 'uuid-123', slug: 'my-ensemble' })).toBe('my-ensemble');
  });

  it('returns the id when slug is null', () => {
    expect(getEnsembleUrlId({ id: 'uuid-123', slug: null })).toBe('uuid-123');
  });

  it('returns the id when slug is undefined', () => {
    expect(getEnsembleUrlId({ id: 'uuid-123' })).toBe('uuid-123');
  });

  it('returns the id when slug is empty string', () => {
    expect(getEnsembleUrlId({ id: 'uuid-123', slug: '' })).toBe('uuid-123');
  });
});
