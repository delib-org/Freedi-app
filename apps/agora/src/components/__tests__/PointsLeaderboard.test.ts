import { describe, expect, it } from 'vitest';
import m from 'mithril';
import type { AgoraParticipant, AgoraPoints } from '@freedi/shared-types';
import { PointsLeaderboard, type PointsLeaderboardAttrs } from '../PointsLeaderboard';
import { t } from '../../lib/i18n';

type Child = m.Vnode | m.Vnode[] | null | undefined | string;

/** Every vnode under a tree, flattened — the hyperscript, no DOM needed */
function walk(node: Child, out: m.Vnode[] = []): m.Vnode[] {
	if (node == null || typeof node === 'string') return out;
	if (Array.isArray(node)) {
		node.forEach((child) => walk(child as Child, out));

		return out;
	}
	out.push(node);
	walk(node.children as Child, out);

	return out;
}

function classesOf(node: m.Vnode): string {
	const attrs = (node.attrs ?? {}) as { className?: string; class?: string };

	return `${attrs.className ?? ''} ${attrs.class ?? ''}`;
}

function render(attrs: PointsLeaderboardAttrs): m.Vnode[] {
	return walk(PointsLeaderboard.view({ attrs } as m.Vnode<PointsLeaderboardAttrs>) as Child);
}

function participant(
	userId: string,
	pts: Partial<AgoraPoints>,
	joinedAt: number,
): AgoraParticipant {
	const points: AgoraPoints = { valueAccuracy: 0, proposals: 0, helping: 0, total: 0, ...pts };

	return {
		participantId: `s--${userId}`,
		sessionId: 's',
		userId,
		anonName: `${userId} name`,
		points,
		joinedAt,
		lastActive: joinedAt,
	};
}

const rowsOf = (nodes: m.Vnode[]): m.Vnode[] =>
	nodes.filter((node) => node.tag === 'li' && classesOf(node).includes('scoreboard__row'));

describe('PointsLeaderboard', () => {
	it('lists every student in points order, with the podium on top', () => {
		const nodes = render({
			participants: [
				participant('a', { helping: 1, total: 1 }, 1),
				participant('b', { rating: 4, total: 4 }, 2),
				participant('c', { proposals: 3, total: 3 }, 3),
				participant('d', {}, 4),
			],
		});

		const rows = rowsOf(nodes);
		expect(rows.map((row) => row.key)).toEqual(['s--b', 's--c', 's--a', 's--d']);

		const steps = nodes.filter((node) => classesOf(node).includes('scoreboard__step '));
		expect(steps).toHaveLength(3);
		// The student on zero is on the list but never on the podium
		expect(steps.map((step) => step.key)).not.toContain('s--d');
	});

	it('highlights my own row and calls me "you"', () => {
		const nodes = render({
			participants: [participant('a', { helping: 2, total: 2 }, 1), participant('me', {}, 2)],
			userId: 'me',
		});

		const mine = rowsOf(nodes).find((row) => row.key === 's--me');
		expect(mine).toBeDefined();
		expect(classesOf(mine as m.Vnode)).toContain('scoreboard__row--mine');
		expect((mine?.attrs as { 'aria-label': string })['aria-label']).toContain(t('board.you'));
	});

	it('never marks a zero as a deficit and never draws a bottom', () => {
		const nodes = render({
			participants: [participant('a', { helping: 1, total: 1 }, 1), participant('z', {}, 2)],
		});

		const last = rowsOf(nodes)[1];
		expect(classesOf(last)).not.toMatch(/last|zero|bottom|deficit/);
	});

	it('names the role each student earned most in', () => {
		const nodes = render({
			participants: [participant('r', { rating: 3, proposals: 1, total: 4 }, 1)],
		});

		const roles = nodes.filter((node) => classesOf(node).includes('scoreboard__role'));
		expect(roles).toHaveLength(1);
		expect(JSON.stringify(roles[0].children)).toContain(t('scoreboard.role_rating'));
	});

	it('shows the class total as the first number', () => {
		const nodes = render({
			participants: [
				participant('a', { helping: 1.5, total: 1.5 }, 1),
				participant('b', { rating: 2, total: 2 }, 2),
			],
		});

		const total = nodes.find((node) => classesOf(node).includes('scoreboard__class-total'));
		expect((total?.attrs as { 'aria-label': string })['aria-label']).toContain('3.5');
	});

	it('says what fills a board of zeros', () => {
		const nodes = render({ participants: [participant('a', {}, 1)] });

		const empty = nodes.find((node) => classesOf(node).includes('scoreboard__empty'));
		expect(empty).toBeDefined();
	});
});
