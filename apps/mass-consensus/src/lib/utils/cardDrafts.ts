import { CardImageProblem, checkCardImageFile } from './cardImage';

/**
 * A card being written in the create-question wizard, before the question
 * exists. The picture stays in memory as a File until the card has an id.
 */
export interface CardDraft {
  /** Stable across edits, so React rows and file assignments survive typing. */
  key: string;
  text: string;
  file: File | null;
  /** object URL for `file`; the owner revokes it when the file goes away. */
  previewUrl: string | null;
  alt: string;
  /** Why the last picture chosen for this card was refused, if it was. */
  problem: CardImageProblem | null;
}

/** Why a picture did not make it onto a card. */
export type CardPictureProblem = CardImageProblem | 'network';

export type CardUploadStatus = 'idle' | 'queued' | 'uploading' | 'done' | 'failed';

let keyCounter = 0;

export function newDraftKey(): string {
  keyCounter += 1;

  return `card-${Date.now().toString(36)}-${keyCounter}`;
}

export function emptyDraft(text = ''): CardDraft {
  return { key: newDraftKey(), text, file: null, previewUrl: null, alt: '', problem: null };
}

/** One card per non-empty line, trimmed. */
export function splitLines(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/**
 * Rows for the textarea's lines. Keys are reused by position so a row the
 * admin is about to drop a picture on does not remount on every keystroke.
 */
export function linesToDrafts(text: string, previous: readonly CardDraft[]): CardDraft[] {
  return splitLines(text).map((line, index) => {
    const prev = previous[index];

    return prev ? { ...prev, text: line } : emptyDraft(line);
  });
}

export function draftsToLines(drafts: readonly CardDraft[]): string {
  return drafts.map((draft) => draft.text).join('\n');
}

/** Drafts that will actually become cards, in the order they are sent. */
export function draftsToCreate(drafts: readonly CardDraft[]): CardDraft[] {
  return drafts
    .map((draft) => ({ ...draft, text: draft.text.trim() }))
    .filter((draft) => draft.text.length > 0);
}

export interface FileAssignment {
  /** Card index → file, for the cards that received one. */
  assigned: Array<{ index: number; file: File }>;
  /** Files refused by type or size. */
  rejected: number;
  /** Valid files left over after every empty card got one. */
  unused: number;
}

/**
 * Several pictures dropped on the list at once go to the cards that have no
 * picture yet, top to bottom, in the order the files came.
 */
export function assignFilesInOrder(
  cards: ReadonlyArray<{ hasPicture: boolean }>,
  files: readonly File[]
): FileAssignment {
  const valid = files.filter((file) => checkCardImageFile(file) === null);
  const emptyIndexes = cards
    .map((card, index) => (card.hasPicture ? -1 : index))
    .filter((index) => index >= 0);

  const assigned = emptyIndexes
    .slice(0, valid.length)
    .map((index, i) => ({ index, file: valid[i] }));

  return {
    assigned,
    rejected: files.length - valid.length,
    unused: Math.max(0, valid.length - emptyIndexes.length),
  };
}

/** The picture files inside a clipboard or drag payload, in order. */
export function imageFilesFrom(list: FileList | readonly File[] | null | undefined): File[] {
  if (!list) return [];

  return Array.from(list).filter((file) => file.type.startsWith('image/'));
}

/** Translation key (English sentence) for a picture problem. */
export function pictureProblemKey(problem: CardPictureProblem): string {
  switch (problem) {
    case 'size':
      return 'Too large (max 5 MB)';
    case 'type':
    case 'empty':
    case 'content':
      return 'Not a supported image. Use PNG, JPG, WebP or GIF';
    case 'network':
      return 'Upload failed — check your connection';
  }
}
