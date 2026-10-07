import type { Paragraph, PhrasingContent, Root } from 'mdast';
import remarkColorTags from '../remarkColorTags';

/**
 * The trees here are what remark-parse hands the plugin: a paragraph whose
 * children are text nodes split around inline formatting. A rendered span is a
 * node with `data.hName: 'span'` that remark-rehype turns into the element.
 */

function paragraph(...children: PhrasingContent[]): Paragraph {
  return { type: 'paragraph', children };
}

function root(...children: Root['children']): Root {
  return { type: 'root', children };
}

function text(value: string): PhrasingContent {
  return { type: 'text', value };
}

/** Flattens a phrasing tree into a readable string: spans become `<blue>…</blue>`. */
function render(nodes: PhrasingContent[]): string {
  return nodes
    .map((node) => {
      if (node.type === 'text') return node.value;
      if (node.type === 'strong') return `**${render(node.children)}**`;
      if (node.type === 'break') return '\\n';
      if ((node as { type: string }).type === 'colorSpan') {
        const span = node as unknown as {
          children: PhrasingContent[];
          data: { hName: string; hProperties: { className: string[] } };
        };
        const color = span.data.hProperties.className[1].replace('md-color--', '');

        return `<${color}>${render(span.children)}</${color}>`;
      }

      return `[${node.type}]`;
    })
    .join('');
}

function run(tree: Root): string {
  remarkColorTags()(tree);
  const first = tree.children[0];

  return 'children' in first ? render(first.children as PhrasingContent[]) : '';
}

describe('remarkColorTags', () => {
  it('wraps the text between an open and close tag', () => {
    const tree = root(paragraph(text('say (blue)hello(/blue) there')));

    expect(run(tree)).toBe('say <blue>hello</blue> there');
  });

  it('emits a span with the md-color classes', () => {
    const tree = root(paragraph(text('(red)x(/red)')));
    remarkColorTags()(tree);
    const span = (tree.children[0] as Paragraph).children[0] as unknown as {
      type: string;
      data: { hName: string; hProperties: { className: string[] } };
    };

    expect(span.type).toBe('colorSpan');
    expect(span.data).toEqual({ hName: 'span', hProperties: { className: ['md-color', 'md-color--red'] } });
  });

  it('colours across inline formatting — the tags land in different text nodes', () => {
    const tree = root(
      paragraph(text('(green)bold '), { type: 'strong', children: [text('here')] }, text(' and after(/green).'))
    );

    expect(run(tree)).toBe('<green>bold **here** and after</green>.');
  });

  it('colours across a line break inside the paragraph', () => {
    const tree = root(paragraph(text('(orange)line one'), { type: 'break' }, text('line two(/orange)')));

    expect(run(tree)).toBe('<orange>line one\\nline two</orange>');
  });

  it('nests one colour inside another', () => {
    const tree = root(paragraph(text('(blue)a (red)b(/red) c(/blue)')));

    expect(run(tree)).toBe('<blue>a <red>b</red> c</blue>');
  });

  it('leaves an unclosed tag as typed', () => {
    const tree = root(paragraph(text('(blue)never closed')));

    expect(run(tree)).toBe('(blue)never closed');
  });

  it('leaves a stray close tag as typed', () => {
    const tree = root(paragraph(text('oops(/purple) here')));

    expect(run(tree)).toBe('oops(/purple) here');
  });

  it('ignores colours that are not in the list', () => {
    const tree = root(paragraph(text('(pink)not a colour(/pink)')));

    expect(run(tree)).toBe('(pink)not a colour(/pink)');
  });

  it('does not match a tag with the wrong closing colour', () => {
    const tree = root(paragraph(text('(blue)text(/red)')));

    expect(run(tree)).toBe('(blue)text(/red)');
  });

  it('handles several runs in one paragraph', () => {
    const tree = root(paragraph(text('(blue)a(/blue) and (gray)b(/gray)')));

    expect(run(tree)).toBe('<blue>a</blue> and <gray>b</gray>');
  });

  it('reaches paragraphs inside list items and headings', () => {
    const tree: Root = root(
      { type: 'heading', depth: 2, children: [text('(purple)Title(/purple)')] },
      {
        type: 'list',
        ordered: false,
        spread: false,
        children: [{ type: 'listItem', spread: false, children: [paragraph(text('(red)item(/red)'))] }],
      }
    );
    remarkColorTags()(tree);

    const heading = tree.children[0] as { children: PhrasingContent[] };
    const item = (tree.children[1] as { children: { children: Paragraph[] }[] }).children[0].children[0];

    expect(render(heading.children)).toBe('<purple>Title</purple>');
    expect(render(item.children)).toBe('<red>item</red>');
  });

  it('leaves Hebrew text around the tags intact', () => {
    const tree = root(paragraph(text('שימו לב: (blue)הסקר מתמקד(/blue) בשימושים')));

    expect(run(tree)).toBe('שימו לב: <blue>הסקר מתמקד</blue> בשימושים');
  });
});
