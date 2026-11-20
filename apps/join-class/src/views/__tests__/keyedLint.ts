import type m from 'mithril';

/**
 * Test helper: walks a vnode tree and lists every children array that mixes keyed
 * and unkeyed vnodes. Mithril throws on that at the first redraw
 * ("vnodes must either all have keys or none have keys"). Component objects are
 * expanded through their `view` so the tree they return is checked too.
 */

interface VnodeLike {
	tag: unknown;
	key?: unknown;
	children?: unknown;
	attrs?: Record<string, unknown> | null;
}

function isVnode(value: unknown): value is VnodeLike {
	return typeof value === 'object' && value !== null && 'tag' in value;
}

function expand(node: VnodeLike): unknown {
	const { tag } = node;
	if (tag && typeof tag === 'object' && 'view' in tag) {
		const view = (tag as { view: (v: unknown) => unknown }).view;

		return view.call(tag, { attrs: node.attrs ?? {}, children: node.children, state: {} });
	}

	return null;
}

export function findMixedKeys(root: m.Children, path = 'root', out: string[] = []): string[] {
	if (Array.isArray(root)) {
		// Mithril's normalizeChildren: every entry counts, and null, booleans, strings, numbers and
		// nested arrays are all UNKEYED. Only a vnode with a key counts as keyed.
		const keyed = (root as unknown[]).filter(
			(v) => isVnode(v) && v.key !== undefined && v.key !== null,
		).length;
		if (keyed > 0 && keyed < root.length) out.push(`${path}: ${keyed} keyed of ${root.length}`);
		root.forEach((child, i) => findMixedKeys(child as m.Children, `${path}[${i}]`, out));

		return out;
	}
	if (!isVnode(root)) return out;
	const tagName = typeof root.tag === 'string' ? root.tag : 'component';
	findMixedKeys(root.children as m.Children, `${path}>${tagName}`, out);
	if (typeof root.tag !== 'string') {
		try {
			const rendered = expand(root);
			if (rendered) findMixedKeys(rendered as m.Children, `${path}>${tagName}()`, out);
		} catch {
			// a component that needs live state to render is covered by the mount tests
		}
	}

	return out;
}
