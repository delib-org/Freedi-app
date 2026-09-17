import { CARD_IMAGE } from '@/constants/common';
import {
  buildCardImagePath,
  buildCardImageUrl,
  bytesMatchType,
  checkCardImageFile,
  isCardImageType,
  normalizeAltText,
  storagePathFromCardImageUrl,
} from '../cardImage';

const bytes = (...values: number[]): Uint8Array => Uint8Array.from(values);

describe('cardImage', () => {
  describe('isCardImageType', () => {
    it('accepts the raster types a card can show', () => {
      expect(isCardImageType('image/png')).toBe(true);
      expect(isCardImageType('image/jpeg')).toBe(true);
      expect(isCardImageType('image/webp')).toBe(true);
      expect(isCardImageType('image/gif')).toBe(true);
    });

    it('refuses SVG and anything that is not an image', () => {
      expect(isCardImageType('image/svg+xml')).toBe(false);
      expect(isCardImageType('text/html')).toBe(false);
      expect(isCardImageType('')).toBe(false);
    });
  });

  describe('checkCardImageFile', () => {
    it('passes a normal image', () => {
      expect(checkCardImageFile({ type: 'image/png', size: 1024 })).toBeNull();
    });

    it('passes a file exactly at the size cap', () => {
      expect(checkCardImageFile({ type: 'image/png', size: CARD_IMAGE.MAX_BYTES })).toBeNull();
    });

    it('names the problem', () => {
      expect(checkCardImageFile({ type: 'image/svg+xml', size: 10 })).toBe('type');
      expect(checkCardImageFile({ type: 'image/png', size: 0 })).toBe('empty');
      expect(checkCardImageFile({ type: 'image/png', size: CARD_IMAGE.MAX_BYTES + 1 })).toBe('size');
    });
  });

  describe('bytesMatchType', () => {
    it('recognises each allowed type by its signature', () => {
      expect(bytesMatchType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0), 'image/png')).toBe(true);
      expect(bytesMatchType(bytes(0xff, 0xd8, 0xff, 0xe0), 'image/jpeg')).toBe(true);
      expect(bytesMatchType(bytes(0x47, 0x49, 0x46, 0x38, 0x39, 0x61), 'image/gif')).toBe(true);
      expect(
        bytesMatchType(
          bytes(0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50),
          'image/webp'
        )
      ).toBe(true);
    });

    it('refuses bytes that say something else than the declared type', () => {
      const html = new TextEncoder().encode('<html><script>');
      expect(bytesMatchType(html, 'image/png')).toBe(false);
      expect(bytesMatchType(bytes(0xff, 0xd8, 0xff), 'image/png')).toBe(false);
      // RIFF without WEBP is a WAV or AVI, not a picture
      expect(bytesMatchType(bytes(0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x41, 0x56, 0x45), 'image/webp')).toBe(false);
    });

    it('refuses a file too short to carry a signature', () => {
      expect(bytesMatchType(bytes(0x89, 0x50), 'image/png')).toBe(false);
      expect(bytesMatchType(bytes(), 'image/jpeg')).toBe(false);
    });
  });

  describe('normalizeAltText', () => {
    it('trims and keeps real text', () => {
      expect(normalizeAltText('  A bridge at dusk ')).toBe('A bridge at dusk');
    });

    it('returns undefined for nothing to say', () => {
      expect(normalizeAltText('   ')).toBeUndefined();
      expect(normalizeAltText(null)).toBeUndefined();
      expect(normalizeAltText(42)).toBeUndefined();
    });

    it('caps the length', () => {
      const long = 'x'.repeat(CARD_IMAGE.ALT_MAX_LENGTH + 50);
      expect(normalizeAltText(long)).toHaveLength(CARD_IMAGE.ALT_MAX_LENGTH);
    });
  });

  describe('buildCardImagePath', () => {
    it('stays inside the statement folder the storage rule covers', () => {
      const path = buildCardImagePath('opt1', 'image/jpeg', 1700000000000);
      expect(path).toMatch(/^statements\/opt1\/card-1700000000000-[a-z0-9]+\.jpg$/);
    });

    it('gives each upload a fresh name', () => {
      const a = buildCardImagePath('opt1', 'image/png', 1);
      const b = buildCardImagePath('opt1', 'image/png', 1);
      expect(a).not.toBe(b);
    });
  });

  describe('buildCardImageUrl / storagePathFromCardImageUrl', () => {
    const path = 'statements/opt1/card-1-abc.png';

    it('builds a public GCS URL in production and reads it back', () => {
      const url = buildCardImageUrl('bucket-a', path, undefined);
      expect(url).toBe('https://storage.googleapis.com/bucket-a/statements/opt1/card-1-abc.png');
      expect(storagePathFromCardImageUrl(url, 'bucket-a')).toBe(path);
    });

    it('builds an emulator URL and reads it back', () => {
      const url = buildCardImageUrl('bucket-a', path, 'localhost:9199');
      expect(url).toBe(
        'http://localhost:9199/v0/b/bucket-a/o/statements%2Fopt1%2Fcard-1-abc.png?alt=media'
      );
      expect(storagePathFromCardImageUrl(url, 'bucket-a')).toBe(path);
    });

    it('reads a Firebase download URL from the main app', () => {
      const url =
        'https://firebasestorage.googleapis.com/v0/b/bucket-a/o/statements%2Fopt1%2Fphoto.jpg?alt=media&token=t';
      expect(storagePathFromCardImageUrl(url, 'bucket-a')).toBe('statements/opt1/photo.jpg');
    });

    it('returns null for a URL that is not ours', () => {
      expect(storagePathFromCardImageUrl('https://example.com/a.png', 'bucket-a')).toBeNull();
    });
  });
});
