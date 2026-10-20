import type { OdysseyElder } from '@freedi/shared-types';
import type { IslandContent } from '../lib/game';
import { aiPersonaNote } from '../lib/counsel';
import { pickIslandRemark } from '../lib/elders';
import { useT } from '../i18n/useT';

interface CrewReactionsProps {
	crew: OdysseyElder[];
	island: IslandContent;
	attitudes: Record<string, number | undefined>;
}

/**
 * המלחים מגיבים — one sailor's reaction to a shore the player marked.
 *
 * Reveal phase only. A reaction during the question would be exactly the
 * mid-evaluation nudge the game refuses to make, so this is mounted after
 * the island is submitted and nowhere else. Static: no chips, no close —
 * the sea has already answered, this is the crew's word after it.
 */
export default function CrewReactions({ crew, island, attitudes }: CrewReactionsProps) {
	const { t } = useT();
	const remark = pickIslandRemark(crew, island, attitudes);
	if (!remark) return null;

	const number = island.stances.findIndex((stance) => stance.statementId === remark.stanceId) + 1;

	return (
		<div className="counsel-card counsel-card--reactions fade-in">
			<p className="counsel-card__eyebrow">{t('counsel.reactionsEyebrow', { number })}</p>
			<p className="counsel-card__name">
				<span
					className="counsel-card__portrait"
					style={{ background: remark.elder.color }}
					aria-hidden="true"
				>
					{remark.elder.portraitUrl ? <img src={remark.elder.portraitUrl} alt="" /> : '⚓'}
				</span>
				{remark.elder.name}
			</p>
			<p className="counsel-card__line">{remark.line}</p>
			<p className="counsel-card__note">{aiPersonaNote()}</p>
		</div>
	);
}
