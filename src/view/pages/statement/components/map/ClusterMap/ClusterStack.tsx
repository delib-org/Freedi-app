import { CSSProperties, FC, ReactNode } from 'react';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import type { ClusterPaletteEntry } from '../mapHelpers/mindElixirTransform';
import styles from './ClusterStack.module.scss';

interface Props {
	/** The merged idea's own note (a ClusterCard). */
	children: ReactNode;
	color: ClusterPaletteEntry;
	/** How many originals were merged into this idea. */
	voices: number;
	expanded: boolean;
	/** False when the organizer pinned participants to the default depth. */
	canExpand: boolean;
	onToggle: () => void;
	/** Contains one of the viewer's originals. */
	includesMine?: boolean;
}

/**
 * A merged idea on the board: one sticky note drawn as the top sheet of a
 * stack, with a "N ▾" tab that fans the merged originals out beneath it (the
 * tray itself is rendered by the board as the next full-width grid row).
 */
const ClusterStack: FC<Props> = ({
	children,
	color,
	voices,
	expanded,
	canExpand,
	onToggle,
	includesMine = false,
}) => {
	const { t } = useTranslation();

	return (
		<div
			className={`${styles.stack} ${expanded ? styles.stackOpen : ''}`}
			style={{ '--stack-line': color.line, '--stack-card': color.card } as CSSProperties}
			data-stack
		>
			<span className={styles.sheet} aria-hidden />
			<span className={`${styles.sheet} ${styles.sheetBack}`} aria-hidden />
			<span className={styles.glyph} aria-hidden>
				⧉
			</span>
			{children}
			<button
				type="button"
				className={styles.toggle}
				style={{ background: color.line }}
				aria-expanded={expanded}
				aria-label={expanded ? t('Hide sources') : t('Show sources')}
				title={
					canExpand
						? expanded
							? t('Hide sources')
							: t('Show sources')
						: t('{n} voices').replace('{n}', String(voices))
				}
				disabled={!canExpand}
				onClick={(e) => {
					e.stopPropagation();
					onToggle();
				}}
				data-no-pan
			>
				{includesMine && <span className={styles.mineDot} aria-hidden />}
				<span>{voices}</span>
				<span className={styles.chevron} aria-hidden>
					{expanded ? '▴' : '▾'}
				</span>
			</button>
		</div>
	);
};

export default ClusterStack;
