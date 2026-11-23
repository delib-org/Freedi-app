import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/firebase', () => ({}));

import { t } from '@/lib/i18n';
import { renderSides } from '../PlanSides';

/** Trello 8ehPaI4M: the sides are "Side A" / "Side B" with one field each, no character names. */
describe('renderSides', () => {
	const markup = JSON.stringify(renderSides());

	it('has no character-name field for either side', () => {
		expect(markup).not.toContain('plan.details.side_a');
		expect(markup).not.toContain('plan.details.side_b');
	});

	it('keeps one claim field per side, under a Side A / Side B legend', () => {
		expect(markup.match(/"tag":"textarea"/g)).toHaveLength(2);
		expect(markup).toContain('plan.details.claim_a');
		expect(markup).toContain('plan.details.claim_b');
		expect(markup).toContain(t('console.side_a'));
		expect(markup).toContain(t('console.side_b'));
	});

	it('explains that this step builds mixed tables', () => {
		expect(markup).toContain(t('plan.sides.help'));
	});
});
