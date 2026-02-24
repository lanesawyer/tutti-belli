import { describe, it, expect, vi } from 'vitest';

// songs.ts imports storage.ts which has module-level S3 side effects that
// crash when STORAGE_ENDPOINT env var is missing. Mock it before importing songs.ts.
vi.mock('../../src/lib/storage.ts', () => ({
  validateSongFile: vi.fn().mockReturnValue({ valid: true }),
  uploadSongFile: vi.fn().mockResolvedValue('https://storage.example.com/test.pdf'),
  deleteStorageFile: vi.fn().mockResolvedValue(undefined),
  getFileStream: vi.fn().mockResolvedValue(null),
}));
import {
  formatRuntime,
  categoryLabel,
  categoryTagClass,
  getYouTubeId,
  buildSongPartsMap,
  buildSongSeasonsMap,
  buildSongFilesMap,
} from '../../src/lib/songs.ts';

describe('formatRuntime', () => {
  it('returns dash for null', () => {
    expect(formatRuntime(null)).toBe('-');
  });

  it('returns dash for 0', () => {
    expect(formatRuntime(0)).toBe('-');
  });

  it('formats seconds only (< 60s)', () => {
    expect(formatRuntime(45)).toBe('0:45');
  });

  it('pads single-digit seconds with a leading zero', () => {
    expect(formatRuntime(61)).toBe('1:01');
  });

  it('formats round minutes', () => {
    expect(formatRuntime(240)).toBe('4:00');
  });

  it('handles exactly 60 seconds', () => {
    expect(formatRuntime(60)).toBe('1:00');
  });

  it('formats longer durations', () => {
    expect(formatRuntime(3661)).toBe('61:01');
  });
});

describe('categoryLabel', () => {
  it('returns Sheet Music for sheet_music', () => {
    expect(categoryLabel('sheet_music')).toBe('Sheet Music');
  });

  it('returns Rehearsal Track for rehearsal_track', () => {
    expect(categoryLabel('rehearsal_track')).toBe('Rehearsal Track');
  });

  it('returns Link for link', () => {
    expect(categoryLabel('link')).toBe('Link');
  });

  it('returns Other for unknown categories', () => {
    expect(categoryLabel('other')).toBe('Other');
    expect(categoryLabel('unknown')).toBe('Other');
  });
});

describe('categoryTagClass', () => {
  it('returns is-success for sheet_music', () => {
    expect(categoryTagClass('sheet_music')).toBe('is-success');
  });

  it('returns is-warning for rehearsal_track', () => {
    expect(categoryTagClass('rehearsal_track')).toBe('is-warning');
  });

  it('returns is-info for link', () => {
    expect(categoryTagClass('link')).toBe('is-info');
  });

  it('returns is-light for other/unknown', () => {
    expect(categoryTagClass('other')).toBe('is-light');
    expect(categoryTagClass('unknown')).toBe('is-light');
  });
});

describe('getYouTubeId', () => {
  it('extracts ID from youtu.be short URL', () => {
    expect(getYouTubeId('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });

  it('extracts ID from youtube.com/watch?v= URL', () => {
    expect(getYouTubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });

  it('extracts ID from youtube.com/watch URL with extra params', () => {
    expect(getYouTubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=30')).toBe('dQw4w9WgXcQ');
  });

  it('extracts ID from youtu.be URL with query string', () => {
    expect(getYouTubeId('https://youtu.be/dQw4w9WgXcQ?t=30')).toBe('dQw4w9WgXcQ');
  });

  it('returns null for a non-YouTube URL', () => {
    expect(getYouTubeId('https://vimeo.com/123456')).toBeNull();
  });

  it('returns null for an invalid URL string', () => {
    expect(getYouTubeId('not-a-url')).toBeNull();
  });
});

describe('buildSongPartsMap', () => {
  it('groups partIds by songId', () => {
    const data = [
      { songId: 'song1', partId: 'part1' },
      { songId: 'song1', partId: 'part2' },
      { songId: 'song2', partId: 'part1' },
    ];
    const map = buildSongPartsMap(data);
    expect(map.get('song1')).toEqual(['part1', 'part2']);
    expect(map.get('song2')).toEqual(['part1']);
  });

  it('returns an empty map for empty input', () => {
    expect(buildSongPartsMap([])).toEqual(new Map());
  });
});

describe('buildSongSeasonsMap', () => {
  it('groups seasonIds by songId', () => {
    const data = [
      { songId: 'song1', seasonId: 'season1' },
      { songId: 'song1', seasonId: 'season2' },
    ];
    const map = buildSongSeasonsMap(data);
    expect(map.get('song1')).toEqual(['season1', 'season2']);
  });

  it('returns an empty map for empty input', () => {
    expect(buildSongSeasonsMap([])).toEqual(new Map());
  });
});

describe('buildSongFilesMap', () => {
  it('groups files by songId, filtering to only requested songIds', () => {
    const files = [
      { songId: 'song1', name: 'file1.pdf' },
      { songId: 'song1', name: 'file2.pdf' },
      { songId: 'song2', name: 'file3.pdf' },
      { songId: 'song3', name: 'excluded.pdf' },
    ];
    const map = buildSongFilesMap(new Set(['song1', 'song2']), files);
    expect(map.get('song1')).toHaveLength(2);
    expect(map.get('song2')).toHaveLength(1);
    expect(map.has('song3')).toBe(false);
  });

  it('returns an empty map for empty files', () => {
    expect(buildSongFilesMap(new Set(['song1']), [])).toEqual(new Map());
  });
});
