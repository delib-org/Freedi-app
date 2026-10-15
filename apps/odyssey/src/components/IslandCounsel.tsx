import { useRef } from 'react';
import { Link } from 'react-router-dom';
import type { OdysseyElder } from '@freedi/shared-types';
import type { IslandContent } from '../lib/game';
import { islandCounsel, islandLean } from '../lib/counsel';
import CrewRow, { focusCrewChip } from './CrewRow';
import CounselCard from './CounselCard';

interface IslandCounselProps {
	crew: OdysseyElder[];
	island: IslandContent;
	openElderId: string | null;
	onToggle(elderId: string): void;
}

/**
 * התייעצות על האי — the crew's counsel on the island under your feet, before
 * the shores.
 *
 * The sailors are the conscience of the game: they are here so the player
 * chooses more consciously, not so they choose the same. So the row is
 * visible but says nothing until a sailor is tapped, every sailor is offered
 * the same way, and what is said is a value lens — the shore their record
 * leans to and a question in their voice — never a verdict. One sailor
 * speaks at a time; a chorus would read as a majority.
 *
 * State lives in the caller (one disclosure across the whole island panel).
 */
export default function IslandCounsel({ crew, island, openElderId, onToggle }: IslandCounselProps) {
	const root = useRef<HTMLDivElement>(null);
	const cardId = `island-counsel-${island.statementId}`;
	const openElder = crew.find((elder) => elder.elderId === openElderId) ?? null;
	const open = openElder ? islandCounsel(openElder, island) : null;

	function close(): void {
		if (!openElderId) return;
		onToggle(openElderId);
		focusCrewChip(root.current, openElderId);
	}

	if (crew.length === 0) {
		return (
			<p className="island-counsel__empty">
				עדיין אין מלחים על הסיפון ·{' '}
				<Link className="underline" to="/elders">
					להוספת מלחים
				</Link>
			</p>
		);
	}

	return (
		<div className="island-counsel" ref={root}>
			<p className="island-counsel__caption">📜 להתייעץ עם הצוות על האי</p>
			<p className="island-counsel__hint">הקישו על מלח או מלחית</p>
			<CrewRow
				crew={crew}
				openElderId={openElderId}
				onToggle={onToggle}
				onEscape={close}
				ariaLabel="הצוות — התייעצות על האי"
				controlsId={cardId}
			/>
			<div id={cardId} className="counsel-slot" aria-live="polite" aria-atomic="true">
				{open ? (
					<CounselCard
						key={open.elder.elderId}
						elder={open.elder}
						scope="island"
						lean={islandLean(open)}
						line={open.line}
						onClose={close}
					/>
				) : null}
			</div>
		</div>
	);
}
