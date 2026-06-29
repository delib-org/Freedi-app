import { FC, useEffect } from 'react';
import { useSelector } from 'react-redux';
import { useLocation, useParams, useSearchParams } from 'react-router';
import { StatementType } from '@freedi/shared-types';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { useAuthentication } from '@/controllers/hooks/useAuthentication';
import { useAppSelector } from '@/controllers/hooks/reduxHooks';
import { isAdmin as isAdminRole } from '@/controllers/general/helpers';
import { listenToMindMapData } from '@/controllers/db/statements/optimizedListeners';
import { listenToStatementSubscription } from '@/controllers/db/statements/listenToStatements';
import {
	statementSelector,
	statementSubscriptionSelector,
} from '@/redux/statements/statementsSlice';
import ShareButton from '@/view/components/buttons/shareButton/ShareButton';
import ClusterBoard from './ClusterBoard';
import MapAdminPanel from './MapAdminPanel';
import { useMindMap } from '../MindMapMV';
import styles from './ClusterMap.module.scss';

/**
 * Standalone, shareable, embeddable cluster board.
 *
 * Reuses the mind-map data layer (useMindMap + Firestore listeners + edit
 * functions) but renders a custom radial board: a central subject, colored
 * cluster pills, and a grid of sticky-note cards per cluster. Access is handled
 * by ProtectedLayout (which auto signs-in anonymous visitors for public
 * statements), so anyone with access can co-edit.
 */
const ClusterMap: FC = () => {
	const { t } = useTranslation();
	const { statementId } = useParams();
	const location = useLocation();
	const [searchParams] = useSearchParams();

	const isEmbed = searchParams.get('embed') === '1' || location.pathname.endsWith('/embed');

	const { user, creator } = useAuthentication();
	const statement = useSelector(statementSelector(statementId));
	const { results } = useMindMap();

	// Admins (board owner or admin-role) get the in-place map controls. Mirrors
	// ClusterBoard's admin check so the gear shows for the same people who can
	// already manage cards.
	const subscription = useAppSelector(
		statementSubscriptionSelector(statement?.topParentId ?? statement?.statementId ?? ''),
	);
	const isAdmin = isAdminRole(subscription?.role) || (!!user && statement?.creatorId === user.uid);
	const canConfigureMap =
		isAdmin && !isEmbed && statement?.statementType === StatementType.question;

	// Real-time descendants + root for the board (mirrors useStatementListeners'
	// 'mind-map' branch). The standalone page owns this listener itself.
	useEffect(() => {
		if (!statementId) return;
		const unsubscribe = listenToMindMapData(statementId);

		return () => unsubscribe();
	}, [statementId]);

	// Load the user's subscription/role for the board (and its top parent) so
	// admins are recognized for managing every card.
	useEffect(() => {
		if (!creator) return;
		const ids = [statement?.statementId, statement?.topParentId].filter((id): id is string => !!id);
		const unsubscribers = ids.map((id) => listenToStatementSubscription(id, creator));

		return () => unsubscribers.forEach((unsubscribe) => unsubscribe?.());
	}, [creator, statement?.statementId, statement?.topParentId]);

	if (!statement) {
		return (
			<div className={styles.loading}>
				<div className={styles.spinner} />
				<p>{t('Loading map...')}</p>
			</div>
		);
	}

	return (
		<div className={styles.board}>
			{!isEmbed && (
				<header className={styles.toolbar}>
					<h1 className={styles.title}>{statement.statement}</h1>
					<div className={styles.toolbarActions}>
						<ShareButton
							title={t('Share map')}
							text={t('Share')}
							url={`/map/${statementId}`}
							embedUrl={`/map/${statementId}/embed`}
						/>
					</div>
				</header>
			)}

			<div className={styles.canvas}>
				{results ? (
					<ClusterBoard results={results} />
				) : (
					<div className={styles.loading}>
						<div className={styles.spinner} />
						<p>{t('Building map...')}</p>
					</div>
				)}
			</div>

			{canConfigureMap && (
				<MapAdminPanel statement={statement} settings={statement.statementSettings ?? {}} />
			)}
		</div>
	);
};

export default ClusterMap;
