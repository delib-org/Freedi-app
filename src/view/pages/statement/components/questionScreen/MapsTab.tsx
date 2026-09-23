import { FC } from 'react';
import clsx from 'clsx';
import { useNavigate } from 'react-router';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Statement } from '@freedi/shared-types';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { buildStatementPath } from '@/routes/statementPaths';
import {
	availableMapViews,
	MapView,
} from '@/view/components/atomic/organisms/ThinkingSpace/MapExplorer';
import styles from './QuestionScreen.module.scss';

interface MapsTabProps {
	statement: Statement;
}

export const MapGlyph: FC<{ view: MapView; size?: number }> = ({ view, size = 40 }) => (
	<svg
		width={size}
		height={size}
		viewBox="0 0 40 40"
		fill="none"
		stroke="currentColor"
		strokeWidth="1.6"
		strokeLinecap="round"
		strokeLinejoin="round"
		aria-hidden="true"
	>
		<path d={view.glyph} />
	</svg>
);

/**
 * מפות — one row per map (tinted tile, title, one-line description) opening the
 * existing map screen full-screen; themes & synthesis stay one tap away.
 */
const MapsTab: FC<MapsTabProps> = ({ statement }) => {
	const { t, dir } = useTranslation();
	const navigate = useNavigate();
	const Chevron = dir === 'rtl' ? ChevronLeft : ChevronRight;
	const views = availableMapViews(statement.statementSettings);

	return (
		<div className={styles.tab} data-testid="maps-tab">
			<p className={styles.intro}>
				{t('Different pictures of the same question. Each map opens full screen.')}
			</p>
			<ul className={styles.maps}>
				{views.map((view) => (
					<li key={view.id}>
						<button
							type="button"
							className={styles.mapRow}
							onClick={() =>
								navigate(buildStatementPath({ statementId: statement.statementId, view: view.id }))
							}
							data-testid={`map-row-${view.id}`}
						>
							<span className={clsx(styles.mapRow__tile, styles[`tone--${view.tone}`])}>
								<MapGlyph view={view} />
							</span>
							<span className={styles.mapRow__text}>
								<span className={styles.mapRow__title}>{t(view.rowTitle)}</span>
								<span className={styles.mapRow__sub}>{t(view.rowDescription)}</span>
							</span>
							<Chevron size={16} aria-hidden="true" className={styles.chevron} />
						</button>
					</li>
				))}
			</ul>
			<button
				type="button"
				className={styles.outlineButton}
				onClick={() =>
					navigate(buildStatementPath({ statementId: statement.statementId, view: 'themes' }))
				}
				data-testid="maps-themes"
			>
				{t('Themes & synthesis')}
			</button>
		</div>
	);
};

export default MapsTab;
