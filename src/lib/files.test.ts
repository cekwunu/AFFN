import { describe, expect, it } from 'vitest';
import { formatFileSize, isAccepted, validateFiles } from './files';

const pdf = { name: 'Mattilsynet.PDF', size: 200_000, type: 'application/pdf' };
const png = { name: 'logo.png', size: 50_000, type: 'image/png' };
const big = { name: 'video.mp4', size: 20_000_000, type: 'video/mp4' };

describe('isAccepted', () => {
  it('matches MIME type, wildcard and extension, case-insensitively', () => {
    expect(isAccepted(pdf, ['application/pdf'])).toBe(true);
    expect(isAccepted(png, ['image/*'])).toBe(true);
    expect(isAccepted(pdf, ['.pdf'])).toBe(true);
    expect(isAccepted(png, ['application/pdf', '.jpg'])).toBe(false);
  });

  it('accepts anything when no rules are given', () => {
    expect(isAccepted(big)).toBe(true);
  });
});

describe('validateFiles', () => {
  it('rejects wrong type, too large and over the count limit, in order', () => {
    const result = validateFiles([pdf, big, png, png], {
      accept: ['application/pdf', 'image/*'],
      maxSizeBytes: 5_000_000,
      maxFiles: 2,
    });
    expect(result.accepted).toEqual([pdf, png]);
    expect(result.rejected.map((r) => r.reason)).toEqual(['type', 'count']);
  });

  it('flags size before count', () => {
    const result = validateFiles([big], { maxSizeBytes: 1_000 });
    expect(result.rejected).toEqual([{ file: big, reason: 'size' }]);
  });

  it('counts files that are already selected', () => {
    const result = validateFiles([pdf], { maxFiles: 1 }, 1);
    expect(result.accepted).toEqual([]);
    expect(result.rejected[0]?.reason).toBe('count');
  });
});

describe('formatFileSize', () => {
  it('uses decimal units and locale separators', () => {
    expect(formatFileSize(512, 'en')).toBe('512 byte');
    expect(formatFileSize(2_400_000, 'en')).toBe('2.4 MB');
    expect(formatFileSize(2_400_000, 'nb').replace(/ /g, ' ')).toBe('2,4 MB');
  });
});
