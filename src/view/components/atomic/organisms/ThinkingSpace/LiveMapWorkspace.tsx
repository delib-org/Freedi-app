import { ReactNode, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Screen, Statement } from '@freedi/shared-types';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { buildStatementPath } from '@/routes/statementPaths';
import ShareModal from '@/view/components/shareModal/ShareModal';
import { availableMapViews, mapViews, MapViewId } from './MapExplorer';
import styles from './LiveMapWorkspace.module.scss';

/**
 * A map, full screen: back to the Maps tab, the map's title over the question,
 * share, the existing map canvas, and a pill switcher along the bottom to jump
 * between maps.
 */
export default function LiveMapWorkspace({
	statement,
	active,
	children,
}: {
	statement: Statement;
	active: MapViewId;
	children: ReactNode;
}) {
	const { t, dir } = useTranslation();
	const navigate = useNavigate();
	const { pathname } = useLocation();
	const [shareOpen, setShareOpen] = useState(false);
	const hidden =
		statement.statementSettings?.showEvaluation !== true &&
		[Screen.agreementMap, Screen.polarizationIndex].includes(active);
	const current = mapViews.find((view) => view.id === active);
	const views = availableMapViews(statement.statementSettings);
	const Back = dir === 'rtl' ? ChevronRight : ChevronLeft;
	const open = (view: Parameters<typeof buildStatementPath>[0]['view']) =>
		navigate(buildStatementPath({ statementId: statement.statementId, view }));

	return (
		<div
			className={`thinking-space ${styles.workspace}`}
			data-map-root
			data-testid="map-fullscreen"
		>
			<header className={styles.workspace__bar}>
				<button
					type="button"
					className={styles.workspace__back}
					onClick={() => open('maps')}
					aria-label={t('Back')}
					data-testid="map-back"
				>
					<Back size={20} aria-hidden="true" />
				</button>
				<div className={styles.workspace__titles}>
					<h1 className={styles.workspace__title}>{current ? t(current.rowTitle) : t('Maps')}</h1>
					<span className={styles.workspace__question}>{statement.statement}</span>
				</div>
				<button
					type="button"
					className={styles.workspace__share}
					onClick={() => setShareOpen(true)}
					data-testid="map-share"
				>
					{t('Share')}
				</button>
			</header>

			{(active === Screen.clusterBoard || (statement.parentId && statement.parentId !== 'top')) && (
				<nav className={styles.workspace__links} aria-label={t('Question path')}>
					{statement.parentId && statement.parentId !== 'top' && (
						<button
							type="button"
							onClick={() =>
								navigate(buildStatementPath({ statementId: statement.parentId, view: 'results' }))
							}
						>
							{t('Parent question')}
						</button>
					)}
					{active === Screen.clusterBoard && (
						<button type="button" onClick={() => open('themes')}>
							{t('Themes & synthesis')} · {t('Settings')}
						</button>
					)}
				</nav>
			)}

			<div className={styles.workspace__canvas}>
				{hidden ? (
					<p className={styles.workspace__hidden}>
						{t('Results are hidden. Evaluate independently.')}
					</p>
				) : (
					<div className={styles.workspace__native}>{children}</div>
				)}
			</div>

			<nav className={styles.workspace__switcher} aria-label={t('Map views')}>
				{views.map((view) => (
					<button
						key={view.id}
						type="button"
						aria-current={view.id === active ? 'page' : undefined}
						className={styles.workspace__pill}
						onClick={() => open(view.id)}
						data-testid={`map-switch-${view.id}`}
					>
						{t(view.rowTitle)}
					</button>
				))}
			</nav>

			<ShareModal
				isOpen={shareOpen}
				onClose={() => setShareOpen(false)}
				url={pathname}
				title={t('Share this link')}
			/>
		</div>
	);
}
