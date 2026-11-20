import m from 'mithril';

/**
 * Test helper: a real-DOM render smoke test. Unit tests that only inspect vnode
 * trees cannot see what Mithril's diff does with them (a fragment mixing keyed
 * and unkeyed vnodes blanked every student phone and passed them all). This
 * MOUNTS a view into a jsdom node and redraws it synchronously, so any error
 * Mithril throws while creating, updating or removing the DOM fails the test.
 * Use it from a file that starts with `// @vitest-environment jsdom`.
 */

export interface Mounted {
	root: HTMLElement;
	/** Draw again with the same view (what a Firestore snapshot does). */
	redraw: () => void;
	/** Draw again with another view; Mithril diffs it against the old tree. */
	update: (next: () => m.Children) => void;
	unmount: () => void;
}

/** Mounts `view`, draws it once, and returns controls for redraws. Throws on any render error. */
export function mountSmoke(view: () => m.Children): Mounted {
	const root = document.createElement('div');
	document.body.appendChild(root);
	let current = view;
	m.mount(root, { view: () => current() });
	m.redraw.sync();

	return {
		root,
		redraw: () => m.redraw.sync(),
		update: (next) => {
			current = next;
			m.redraw.sync();
		},
		unmount: () => {
			m.mount(root, null);
			root.remove();
		},
	};
}

/**
 * Mounts the view, redraws it twice (the second tree is diffed against the
 * first: mixed-key and removeChild errors only show on an update), draws each
 * alternate view in between (changed attrs), and unmounts. Returns the HTML of
 * the first draw. Any thrown error fails the calling test.
 */
export function smoke(view: () => m.Children, alternates: Array<() => m.Children> = []): string {
	const mounted = mountSmoke(view);
	const html = mounted.root.innerHTML;
	mounted.redraw();
	for (const next of alternates) mounted.update(next);
	mounted.update(view);
	mounted.redraw();
	mounted.unmount();

	return html;
}
