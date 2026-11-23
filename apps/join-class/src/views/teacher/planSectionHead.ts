import m from 'mithril';

/**
 * The top of a plan section: its title and, always visible under it, one or two
 * lines on what the section is for (Trello DMMTEOlR). `id` is the heading's id,
 * which the section's aria-labelledby points at.
 */
export function sectionHead(id: string, title: string, purpose: string): m.Children {
	return [m('h2.plan__section-title', { id }, title), m('p.plan__help', purpose)];
}
