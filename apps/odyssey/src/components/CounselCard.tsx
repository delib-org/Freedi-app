import type { KeyboardEvent } from 'react';
import type { OdysseyElder } from '@freedi/shared-types';
import { aiPersonaNote, silentLine, type CounselLean } from '../lib/counsel';
import { useT } from '../i18n/useT';

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

const SCOPE_KEY: Record<CounselScope, string> = {
	island: 'counsel.scope.island',
	shore: 'counsel.scope.shore',
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
	const { t } = useT();

	function onCloseKeyDown(event: KeyboardEvent<HTMLButtonElement>): void {
		if (event.key !== 'Escape') return;
		event.preventDefault();
		onClose();
	}

	return (
		<div className="counsel-card">
			<div className="counsel-card__head">
				<p className="counsel-card__eyebrow">
					{t(SCOPE_KEY[scope])}
					{elder.role ? ` · ${elder.role}` : ''}
				</p>
				<button
					type="button"
					className="counsel-card__close"
					aria-label={t('common.close')}
					onClick={onClose}
					onKeyDown={onCloseKeyDown}
				>
					✕
				</button>
			</div>
			<p className="counsel-card__name">{elder.name}</p>
			{lean.kind === 'silent' ? (
				<p className="counsel-card__line">{silentLine()}</p>
			) : (
				<p className="counsel-card__lean">
					<span className="counsel-card__lean-label">
						{lean.kind === 'here'
							? t('counsel.leanHere')
							: t('counsel.leanShore', { number: lean.number })}
						{scope === 'island' && lean.kind === 'shore' ? ':' : ''}
					</span>
					{scope === 'island' && lean.kind === 'shore' ? ` ${lean.text}` : null}
				</p>
			)}
			{line ? (
				<p className="counsel-card__line">
					{lineAboutIsland ? (
						<>
							<span className="counsel-card__lean-label">{t('counsel.aboutIsland')}</span>{' '}
						</>
					) : null}
					{line}
				</p>
			) : null}
			<p className="counsel-card__note">{aiPersonaNote()}</p>
		</div>
	);
}
