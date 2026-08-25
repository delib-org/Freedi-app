import { useEffect, useRef, useState, type FC } from 'react';
import { useTranslation } from '@freedi/shared-i18n/react';
import { Button } from '@/components/atomic/atoms/Button';
import { ProgressFunnel } from '@/components/atomic/atoms/ProgressFunnel';
import { StatusPill } from '@/components/atomic/atoms/StatusPill';
import type { ProgressCounts } from '@/db/progress';
import { useRelativeTime } from '@/hooks/useRelativeTime';
import type { RollupStatus } from '../useQuestionDashboardData';
import styles from './QuestionHeader.module.scss';

/**
 * QuestionHeader — title, rolled-up status, funnel sentence + bars, last
 * activity, and (for managers) the primary actions and the ⋯ menu.
 */
export interface QuestionHeaderProps {
	title: string;
	description?: string;
	rollup: RollupStatus;
	totals: ProgressCounts;
	lastActivityAt?: number;
	canManage: boolean;
	onAdd: () => void;
	onShare: () => void;
	onSendUpdate: () => void;
	onEdit: () => void;
	onArchive: () => void;
}

const QuestionHeader: FC<QuestionHeaderProps> = ({
	title,
	description,
	rollup,
	totals,
	lastActivityAt,
	canManage,
	onAdd,
	onShare,
	onSendUpdate,
	onEdit,
	onArchive,
}) => {
	const { t, tWithParams } = useTranslation();
	const ago = useRelativeTime(lastActivityAt);
	const [menuOpen, setMenuOpen] = useState(false);
	const menuRef = useRef<HTMLDivElement>(null);
	const menuButtonRef = useRef<HTMLButtonElement>(null);

	useEffect(() => {
		if (!menuOpen) return;
		const handlePointerDown = (event: PointerEvent) => {
			if (menuRef.current && !menuRef.current.contains(event.target as Node)) setMenuOpen(false);
		};
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === 'Escape') {
				setMenuOpen(false);
				menuButtonRef.current?.focus();
			}
		};
		document.addEventListener('pointerdown', handlePointerDown);
		document.addEventListener('keydown', handleKeyDown);

		return () => {
			document.removeEventListener('pointerdown', handlePointerDown);
			document.removeEventListener('keydown', handleKeyDown);
		};
	}, [menuOpen]);

	const pick = (action: () => void) => {
		setMenuOpen(false);
		action();
	};

	const hasParticipants = totals.entered > 0 || totals.suggested > 0 || totals.evaluated > 0;
	const sentence = hasParticipants
		? tWithParams('{{entered}} entered · {{suggested}} suggested · {{evaluated}} evaluated', {
				entered: totals.entered,
				suggested: totals.suggested,
				evaluated: totals.evaluated,
			})
		: t('No participants yet');

	return (
		<header className={styles.header}>
			<div className={styles.titleRow}>
				<h1 className={styles.title}>{title || t('Untitled')}</h1>
				<div className={styles.status}>
					<StatusPill status={rollup.state} size="large" />
					{rollup.state === 'open' && (
						<span className={styles.statusNote}>
							{tWithParams('{{open}} of {{total}} open', {
								open: rollup.openCount,
								total: rollup.total,
							})}
						</span>
					)}
				</div>
			</div>
			{description && <p className={styles.description}>{description}</p>}

			<div className={styles.progress}>
				<p className={styles.sentence}>{sentence}</p>
				<ProgressFunnel counts={totals} variant="full" />
				<p className={styles.lastActivity}>
					{ago ? tWithParams('Last activity {{ago}}', { ago }) : t('No activity yet')}
				</p>
			</div>

			{canManage && (
				<div className={styles.actions}>
					<Button text={`+ ${t('Add activity')}`} variant="primary" onClick={onAdd} />
					<Button text={t('Share')} variant="secondary" onClick={onShare} />
					<Button text={t('Send update')} variant="secondary" onClick={onSendUpdate} />
					<div className={styles.menuAnchor} ref={menuRef}>
						<button
							ref={menuButtonRef}
							type="button"
							className={styles.menuButton}
							aria-haspopup="menu"
							aria-expanded={menuOpen}
							aria-label={t('More actions')}
							onClick={() => setMenuOpen((v) => !v)}
						>
							⋯
						</button>
						{menuOpen && (
							<div className={styles.menu} role="menu" aria-label={t('More actions')}>
								<button
									type="button"
									role="menuitem"
									className={styles.menuItem}
									onClick={() => pick(onEdit)}
								>
									{t('Edit question')}
								</button>
								<button
									type="button"
									role="menuitem"
									className={`${styles.menuItem} ${styles.menuItemDanger}`}
									onClick={() => pick(onArchive)}
								>
									{t('Archive question')}
								</button>
							</div>
						)}
					</div>
				</div>
			)}
		</header>
	);
};

export default QuestionHeader;
