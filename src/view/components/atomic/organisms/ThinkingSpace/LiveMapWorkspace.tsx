import { ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { Statement } from '@freedi/shared-types';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import MapExplorer, { MapViewId } from './MapExplorer';
import styles from './LiveMapWorkspace.module.scss';

export default function LiveMapWorkspace({
	statement,
	active,
	children,
}: {
	statement: Statement;
	active: MapViewId;
	children: ReactNode;
}) {
	const { t } = useTranslation();
	const navigate = useNavigate();
	const hidden =
		statement.statementSettings?.showEvaluation !== true &&
		['agreementMap', 'polarizationIndex'].includes(active);

	return (
		<div className={`thinking-space ${styles.workspace}`}>
			<nav className={styles.workspace__path} aria-label={t('Question path')}>
				{statement.parentId && statement.parentId !== 'top' && (
					<button onClick={() => navigate(`/statement/${statement.parentId}?tab=overview`)}>
						← {t('Parent question')}
					</button>
				)}
				<button onClick={() => navigate(`/statement/${statement.statementId}?tab=overview`)}>
					{statement.statement}
				</button>
				<button onClick={() => navigate(`/statement/${statement.statementId}?tab=maps`)}>
					{t('Maps')}
				</button>
			</nav>
			<MapExplorer
				t={t}
				active={active}
				onSelect={(id) => navigate(`/statement-screen/${statement.statementId}/${id}`)}
			>
				{active === 'clusterBoard' && (
					<div className={styles.workspace__path}>
						<button onClick={() => navigate(`/statement/${statement.statementId}?tab=themes`)}>
							{t('Themes & synthesis')} · {t('Settings')}
						</button>
					</div>
				)}
				{hidden ? (
					<p>{t('Results are hidden. Evaluate independently.')}</p>
				) : (
					<div className={styles.workspace__native}>{children}</div>
				)}
			</MapExplorer>
		</div>
	);
}
