import m from 'mithril';

/**
 * Test helper: flattens a Mithril vnode tree (expanding object components
 * through their `view`) into the text and the class names it would draw, so a
 * view test can assert "this number / this bar / this winner tag is (not) on
 * the screen" without a DOM.
 */

export interface Drawn {
	text: string[];
	classes: string[];
	roles: string[];
}

interface VnodeLike {
	tag: unknown;
	attrs?: Record<string, unknown> | null;
	children?: unknown;
	text?: unknown;
}

function isVnode(value: unknown): value is VnodeLike {
	return typeof value === 'object' && value !== null && 'tag' in value;
}

function walk(node: unknown, out: Drawn): void {
	if (node === null || node === undefined || typeof node === 'boolean') return;
	if (typeof node === 'string' || typeof node === 'number') {
		out.text.push(String(node));

		return;
	}
	if (Array.isArray(node)) {
		node.forEach((child) => walk(child, out));

		return;
	}
	if (!isVnode(node)) return;
	const { tag, attrs } = node;
	if (tag === '#') {
		out.text.push(String(node.children));

		return;
	}
	if (typeof tag === 'object' && tag !== null && 'view' in tag) {
		const view = (tag as m.Component).view as (vnode: unknown) => m.Children;
		walk(view.call(tag, { attrs: attrs ?? {}, children: node.children, state: {} }), out);

		return;
	}
	if (typeof tag === 'string') {
		const className = attrs?.className ?? attrs?.class;
		if (typeof className === 'string') out.classes.push(...className.split(/\s+/).filter(Boolean));
		if (typeof attrs?.role === 'string') out.roles.push(attrs.role);
	}
	if (node.text !== undefined) walk(node.text, out);
	walk(node.children, out);
}

export function draw(node: m.Children | m.Vnode): Drawn {
	const out: Drawn = { text: [], classes: [], roles: [] };
	walk(node, out);

	return out;
}

export function textOf(node: m.Children | m.Vnode): string {
	return draw(node).text.join(' ');
}
