import { useRef } from 'react';
import type { OdysseyElder, Statement } from '@freedi/shared-types';
import type { IslandContent } from '../lib/game';
import { shoreCounsel } from '../lib/counsel';
import { useT } from '../i18n/useT';
import CrewRow, { focusCrewChip } from './CrewRow';
import CounselCard from './CounselCard';

interface ShoreCounselProps {
	crew: OdysseyElder[];
	island: IslandContent;
	stance: Statement;
	/** 0-based; shown to the player as shore N */
	stanceIndex: number;
	open: boolean;
	openElderId: string | null;
	onToggleRow(): void;
	onToggleElder(elderId: string): void;
}

/**
 * התייעצות על החוף — one collapsed line under a shore's text that opens,
 * inline, into the same crew row the island has, and then one sailor's card.
 *
 * A line, not a card: four of them read as four quiet options, not four
 * panels, and none says anything until tapped. It sits between the shore's
 * text and its attitude buttons so the reading order is text → consult →
 * mark; an open card pushes the buttons down, never aside.
 */
export default function ShoreCounsel({
	crew,
	island,
	stance,
	stanceIndex,
	open,
	openElderId,
	onToggleRow,
	onToggleElder,
}: ShoreCounselProps) {
	const { t } = useT();
	const root = useRef<HTMLDivElement>(null);
	const number = stanceIndex + 1;
	const rowId = `shore-counsel-${stance.statementId}`;
	const cardId = `${rowId}-card`;
	const openElder = open ? (crew.find((elder) => elder.elderId === openElderId) ?? null) : null;
	const counsel = openElder ? shoreCounsel(openElder, island, stance) : null;

	function close(): void {
		if (!openElderId) return;
		onToggleElder(openElderId);
		focusCrewChip(root.current, openElderId);
	}

	return (
		<div className="shore-counsel" ref={root}>
			<button
				type="button"
				className={`shore-counsel__line${open ? ' shore-counsel__line--open' : ''}`}
				aria-expanded={open}
				aria-controls={rowId}
				onClick={onToggleRow}
			>
				<span>{t('counsel.shoreLine', { number })}</span>
				{/* the closed glyph points into the text, so it is a translation */}
				<span className="shore-counsel__chevron" aria-hidden="true">
					{open ? t('counsel.chevronOpen') : t('counsel.chevronClosed')}
				</span>
			</button>
			{open ? (
				<div id={rowId} className="shore-counsel__body">
					<CrewRow
						crew={crew}
						openElderId={openElderId}
						onToggle={onToggleElder}
						onEscape={close}
						ariaLabel={t('counsel.shoreRowAria', { number })}
						controlsId={cardId}
					/>
					<div id={cardId} className="counsel-slot" aria-live="polite" aria-atomic="true">
						{counsel ? (
							<CounselCard
								key={counsel.elder.elderId}
								elder={counsel.elder}
								scope="shore"
								lean={counsel.lean}
								line={counsel.line}
								lineAboutIsland={counsel.lineAboutIsland}
								onClose={close}
							/>
						) : null}
					</div>
				</div>
			) : null}
		</div>
	);
}
