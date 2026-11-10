import m from 'mithril';

/** Client-side navigation, in one place so screens stay testable without a mounted router. */
export function goTo(path: string): void {
	m.route.set(path);
}

/** Navigate without leaving an entry behind: "back" must not land on a screen that only forwards. */
export function replaceWith(path: string): void {
	m.route.set(path, undefined, { replace: true });
}
