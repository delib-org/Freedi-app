import { useRef, useState, type KeyboardEvent } from 'react';
import type { OdysseyElder } from '@freedi/shared-types';

interface CrewRowProps {
	crew: OdysseyElder[];
	openElderId: string | null;
	onToggle(elderId: string): void;
	/** Escape on a chip: the parent closes its open card and returns focus here */
	onEscape?(): void;
	ariaLabel: string;
	/** id of the card slot the chips disclose */
	controlsId: string;
}

/**
 * The crew, one chip each, in crew order — the same row in both scopes
 * (island and shore).
 *
 * Equal juice, made structural: a CSS grid of N equal columns, so no sailor
 * can be wider, first, or alone on a second row; it never wraps or scrolls
 * (a scrolled-off fifth sailor is a quieter sailor). A chip's only state is
 * open/closed: marking a shore changes nothing on any chip, and nothing is
 * numbered, ticked or counted.
 *
 * One Tab stop: the chips are a roving-tabindex group, arrows move along the
 * row (in reading direction), Home/End jump to its ends.
 */
export default function CrewRow({
	crew,
	openElderId,
	onToggle,
	onEscape,
	ariaLabel,
	controlsId,
}: CrewRowProps) {
	const [focusIndex, setFocusIndex] = useState(() =>
		Math.max(
			0,
			crew.findIndex((elder) => elder.elderId === openElderId),
		),
	);
	const chips = useRef<(HTMLButtonElement | null)[]>([]);

	function moveFocus(target: number): void {
		const next = (target + crew.length) % crew.length;
		setFocusIndex(next);
		chips.current[next]?.focus();
	}

	function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number): void {
		const rtl = getComputedStyle(event.currentTarget).direction === 'rtl';
		const forward = rtl ? 'ArrowLeft' : 'ArrowRight';
		const back = rtl ? 'ArrowRight' : 'ArrowLeft';
		if (event.key === forward) moveFocus(index + 1);
		else if (event.key === back) moveFocus(index - 1);
		else if (event.key === 'Home') moveFocus(0);
		else if (event.key === 'End') moveFocus(crew.length - 1);
		else if (event.key === 'Escape' && openElderId !== null && onEscape) onEscape();
		else return;
		event.preventDefault();
	}

	return (
		<div className="crew-row" role="group" aria-label={ariaLabel}>
			{crew.map((elder, index) => {
				const open = elder.elderId === openElderId;

				return (
					<button
						key={elder.elderId}
						ref={(element) => {
							chips.current[index] = element;
						}}
						type="button"
						className={`crew-row__chip${open ? ' crew-row__chip--open' : ''}`}
						data-elder-id={elder.elderId}
						aria-label={elder.name}
						aria-expanded={open}
						aria-controls={controlsId}
						tabIndex={index === focusIndex ? 0 : -1}
						onFocus={() => setFocusIndex(index)}
						onKeyDown={(event) => onKeyDown(event, index)}
						onClick={() => onToggle(elder.elderId)}
					>
						<span
							className="crew-row__portrait"
							style={{ background: elder.color }}
							aria-hidden="true"
						>
							{elder.portraitUrl ? <img src={elder.portraitUrl} alt="" /> : '⚓'}
						</span>
						<span className="crew-row__name">{elder.name}</span>
					</button>
				);
			})}
		</div>
	);
}

/** Put focus back on a sailor's chip (after their card closed). */
export function focusCrewChip(container: HTMLElement | null, elderId: string): void {
	container?.querySelector<HTMLButtonElement>(`[data-elder-id="${CSS.escape(elderId)}"]`)?.focus();
}
