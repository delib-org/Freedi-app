import type { Parent, PhrasingContent, Root, Text } from 'mdast';

/**
 * Coloured text in explanation pages.
 *
 * Admins write `(blue)this text(/blue)` and the span renders in that colour.
 * Markdown has no syntax for colour and we do not allow raw HTML, so this
 * remark plugin turns the tags into `<span class="md-color md-color--blue">`.
 *
 * The open and close tags must sit in the same paragraph (or heading, or list
 * item), but anything inline may sit between them: `(red)**bold** and
 * *italic*(/red)` colours all of it. A tag without its partner, or a colour
 * not in the list, is left as typed.
 */

/** Colour names an admin can use. Each has a matching `.md-color--<name>` rule. */
export const MARKDOWN_COLORS = ['blue', 'green', 'red', 'orange', 'purple', 'gray'] as const;

export type MarkdownColor = (typeof MARKDOWN_COLORS)[number];

const COLOR_SET: ReadonlySet<string> = new Set(MARKDOWN_COLORS);

/** Matches one open or close tag: `(blue)` or `(/blue)`. */
const TAG_PATTERN = new RegExp(`\\((\\/?)(${MARKDOWN_COLORS.join('|')})\\)`, 'g');

/** Wrapper node; `data` tells remark-rehype which element to emit. */
interface ColorSpan extends Parent {
  type: 'colorSpan';
  children: PhrasingContent[];
  data: { hName: 'span'; hProperties: { className: string[] } };
}

type Token =
  | { kind: 'node'; node: PhrasingContent }
  | { kind: 'open'; color: MarkdownColor }
  | { kind: 'close'; color: MarkdownColor };

function textNode(value: string): Text {
  return { type: 'text', value };
}

/** Breaks a text node into plain text and colour tags, keeping everything. */
function tokenizeText(node: Text): Token[] {
  const tokens: Token[] = [];
  let last = 0;

  for (const match of node.value.matchAll(TAG_PATTERN)) {
    const index = match.index ?? 0;
    if (index > last) tokens.push({ kind: 'node', node: textNode(node.value.slice(last, index)) });

    const color = match[2];
    if (COLOR_SET.has(color)) {
      tokens.push({ kind: match[1] === '/' ? 'close' : 'open', color: color as MarkdownColor });
    }
    last = index + match[0].length;
  }

  if (last < node.value.length) {
    tokens.push({ kind: 'node', node: textNode(node.value.slice(last)) });
  }

  return tokens;
}

function tagText(kind: 'open' | 'close', color: MarkdownColor): Text {
  return textNode(kind === 'open' ? `(${color})` : `(/${color})`);
}

/**
 * Rebuilds a parent's children, wrapping whatever sits between a matching
 * open and close tag. Tags that never find a partner come back as literal text.
 */
function wrapColorRuns(children: PhrasingContent[]): PhrasingContent[] {
  const tokens: Token[] = children.flatMap((child) =>
    child.type === 'text' ? tokenizeText(child) : [{ kind: 'node' as const, node: child }]
  );

  return wrapTokens(tokens);
}

/** Recursive so that a colour inside another colour nests as a span inside a span. */
function wrapTokens(tokens: Token[]): PhrasingContent[] {
  const result: PhrasingContent[] = [];
  let index = 0;

  while (index < tokens.length) {
    const token = tokens[index];

    if (token.kind === 'open') {
      const closeIndex = tokens.findIndex(
        (candidate, i) => i > index && candidate.kind === 'close' && candidate.color === token.color
      );

      if (closeIndex !== -1) {
        const span: ColorSpan = {
          type: 'colorSpan',
          children: wrapTokens(tokens.slice(index + 1, closeIndex)),
          data: { hName: 'span', hProperties: { className: ['md-color', `md-color--${token.color}`] } },
        };
        // The span is not a standard mdast node; remark-rehype only needs `data`.
        result.push(span as unknown as PhrasingContent);
        index = closeIndex + 1;
        continue;
      }
    }

    result.push(token.kind === 'node' ? token.node : tagText(token.kind, token.color));
    index++;
  }

  return result;
}

function hasPhrasingChildren(node: Parent): boolean {
  return node.type === 'paragraph' || node.type === 'heading' || node.type === 'tableCell';
}

function walk(node: Parent): void {
  if (hasPhrasingChildren(node)) {
    node.children = wrapColorRuns(node.children as PhrasingContent[]);

    return;
  }

  for (const child of node.children) {
    if ('children' in child) walk(child as Parent);
  }
}

/** remark plugin: `(blue)text(/blue)` → coloured span. */
export default function remarkColorTags() {
  return (tree: Root): void => {
    walk(tree);
  };
}
