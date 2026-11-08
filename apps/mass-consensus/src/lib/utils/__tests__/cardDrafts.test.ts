import { CARD_IMAGE } from '@/constants/common';
import {
  CardDraft,
  assignFilesInOrder,
  draftsToCreate,
  draftsToLines,
  emptyDraft,
  imageFilesFrom,
  linesToDrafts,
  pictureProblemKey,
  splitLines,
} from '../cardDrafts';

const png = (name = 'a.png', size = 10): File => new File([new Uint8Array(size)], name, { type: 'image/png' });

describe('cardDrafts', () => {
  describe('splitLines', () => {
    it('keeps one trimmed card per non-empty line', () => {
      expect(splitLines('  One \n\n Two\n   \nThree')).toEqual(['One', 'Two', 'Three']);
      expect(splitLines('')).toEqual([]);
    });
  });

  describe('linesToDrafts', () => {
    it('creates a draft per line', () => {
      const drafts = linesToDrafts('One\nTwo', []);
      expect(drafts.map((d) => d.text)).toEqual(['One', 'Two']);
      expect(new Set(drafts.map((d) => d.key)).size).toBe(2);
    });

    it('reuses keys by position so rows do not remount while typing', () => {
      const first = linesToDrafts('One\nTwo', []);
      const second = linesToDrafts('One!\nTwo\nThree', first);
      expect(second[0].key).toBe(first[0].key);
      expect(second[0].text).toBe('One!');
      expect(second[1].key).toBe(first[1].key);
      expect(second[2].key).not.toBe(first[1].key);
    });

    it('drops rows whose lines were deleted', () => {
      const first = linesToDrafts('One\nTwo\nThree', []);
      expect(linesToDrafts('One', first)).toHaveLength(1);
    });
  });

  describe('draftsToLines / draftsToCreate', () => {
    it('round-trips text', () => {
      const drafts = linesToDrafts('A\nB', []);
      expect(draftsToLines(drafts)).toBe('A\nB');
    });

    it('sends only non-empty cards, trimmed, keeping their files', () => {
      const file = png();
      const drafts: CardDraft[] = [
        { ...emptyDraft('  A '), file },
        emptyDraft('   '),
        emptyDraft('B'),
      ];
      const toCreate = draftsToCreate(drafts);
      expect(toCreate.map((d) => d.text)).toEqual(['A', 'B']);
      expect(toCreate[0].file).toBe(file);
      expect(toCreate[0].key).toBe(drafts[0].key);
    });
  });

  describe('assignFilesInOrder', () => {
    it('gives files to cards without a picture, top to bottom', () => {
      const cards = [{ hasPicture: false }, { hasPicture: true }, { hasPicture: false }];
      const a = png('a.png');
      const b = png('b.png');
      const result = assignFilesInOrder(cards, [a, b]);
      expect(result.assigned).toEqual([
        { index: 0, file: a },
        { index: 2, file: b },
      ]);
      expect(result.unused).toBe(0);
      expect(result.rejected).toBe(0);
    });

    it('counts files left over when there are more pictures than empty cards', () => {
      const result = assignFilesInOrder([{ hasPicture: false }], [png(), png(), png()]);
      expect(result.assigned).toHaveLength(1);
      expect(result.unused).toBe(2);
    });

    it('skips files that are not supported pictures, without using up a card', () => {
      const svg = new File(['<svg/>'], 'x.svg', { type: 'image/svg+xml' });
      const huge = new File([new Uint8Array(CARD_IMAGE.MAX_BYTES + 1)], 'big.png', { type: 'image/png' });
      const ok = png('ok.png');
      const result = assignFilesInOrder([{ hasPicture: false }, { hasPicture: false }], [svg, huge, ok]);
      expect(result.rejected).toBe(2);
      expect(result.assigned).toEqual([{ index: 0, file: ok }]);
    });
  });

  describe('imageFilesFrom', () => {
    it('keeps image files only', () => {
      const text = new File(['hi'], 'a.txt', { type: 'text/plain' });
      const image = png();
      expect(imageFilesFrom([text, image])).toEqual([image]);
      expect(imageFilesFrom(null)).toEqual([]);
    });
  });

  describe('pictureProblemKey', () => {
    it('names each problem', () => {
      expect(pictureProblemKey('size')).toBe('Too large (max 5 MB)');
      expect(pictureProblemKey('type')).toMatch(/Not a supported image/);
      expect(pictureProblemKey('content')).toMatch(/Not a supported image/);
      expect(pictureProblemKey('network')).toMatch(/check your connection/);
    });
  });
});
