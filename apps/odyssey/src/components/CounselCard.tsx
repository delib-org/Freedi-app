import type { KeyboardEvent } from 'react';
import type { OdysseyElder } from '@freedi/shared-types';
import { AI_PERSONA_NOTE, SILENT_LINE, type CounselLean } from '../lib/counsel';

export type CounselScope = 'island' | 'shore';

interface CounselCardProps {
	elder: OdysseyElder;
	scope: CounselScope;
	lean: CounselLean;
	line: string | null;
	/** the line is the sailor's island line, standing in for a shore line */
	lineAboutIsland?: boolean;
	onClose(): void;
}

const SCOPE_LABEL: Record<CounselScope, string> = {
	island: 'התייעצות על האי',
	shore: 'התייעצות על החוף',
};

/**
 * What one sailor says, once asked. The same card in both scopes: the
 * eyebrow names the scope, then the name, the lean (or the silent line), the
 * line, and the one persona disclaimer. A silent sailor gets the same frame
 * as a leaning one — the card never looks like less of an answer.
 *
 * The parent owns the live-region slot this card sits in, so a swap between
 * sailors is announced in full.
 */
export default function CounselCard({
	elder,
	scope,
	lean,
	line,
	lineAboutIsland = false,
	onClose,
}: CounselCardProps) {
	function onCloseKeyDown(event: KeyboardEvent<HTMLButtonElement>): void {
		if (event.key !== 'Escape') return;
		event.preventDefault();
		onClose();
	}

	return (
		<div className="counsel-card">
			<div className="counsel-card__head">
				<p className="counsel-card__eyebrow">
					{SCOPE_LABEL[scope]}
					{elder.role ? ` · ${elder.role}` : ''}
				</p>
				<button
					type="button"
					className="counsel-card__close"
					aria-label="סגירה"
					onClick={onClose}
					onKeyDown={onCloseKeyDown}
				>
					✕
				</button>
			</div>
			<p className="counsel-card__name">{elder.name}</p>
			{lean.kind === 'silent' ? (
				<p className="counsel-card__line">{SILENT_LINE}</p>
			) : (
				<p className="counsel-card__lean">
					<span className="counsel-card__lean-label">
						{lean.kind === 'here' ? 'נוטה אל החוף הזה' : `נוטה אל חוף ${lean.number}`}
						{scope === 'island' && lean.kind === 'shore' ? ':' : ''}
					</span>
					{scope === 'island' && lean.kind === 'shore' ? ` ${lean.text}` : null}
				</p>
			)}
			{line ? (
				<p className="counsel-card__line">
					{lineAboutIsland ? (
						<>
							<span className="counsel-card__lean-label">על האי כולו:</span>{' '}
						</>
					) : null}
					{line}
				</p>
			) : null}
			<p className="counsel-card__note">{AI_PERSONA_NOTE}</p>
		</div>
	);
}
