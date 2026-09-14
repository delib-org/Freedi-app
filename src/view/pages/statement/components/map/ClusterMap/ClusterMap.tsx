import { FC, useCallback, useEffect, useMemo, useState } from 'react';
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
import { loadLocalFilter, saveLocalFilter, type LocalMapFilter } from './mapLocalFilter';
import { useMindMap } from '../MindMapMV';
import { useMapDetailLevel } from '../mapHelpers/useMapDetailLevel';
import { hasClusters, pathToMine } from '../mapHelpers/detailLevel';
import MapDetailControl from '../components/MapDetailControl';
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
	const isQuestion = statement?.statementType === StatementType.question;
	const canConfigureMap = isAdmin && !isEmbed && isQuestion;
	// Admins get the full panel; permitted viewers get a filter-only panel when
	// the admin has opted in via statementSettings.map.allowViewerFilter.
	const allowViewerFilter = statement?.statementSettings?.map?.allowViewerFilter ?? false;
	const canFilterMap = !isEmbed && isQuestion && (isAdmin || allowViewerFilter);

	// One altitude for the board (themes / ideas / everything), shared with the
	// mind map through the same per-question, per-device memory.
	const detail = useMapDetailLevel(
		statementId,
		statement?.statementSettings?.map,
		user?.uid,
		isAdmin,
	);
	const showDetailControl = !!results && hasClusters(results);

	// "My ideas": where the viewer's own statements ended up on the board.
	const mine = useMemo(
		() => (results ? pathToMine(results, user?.uid) : null),
		[results, user?.uid],
	);
	const [locateToken, setLocateToken] = useState(0);
	const [showBreadcrumb, setShowBreadcrumb] = useState(false);
	const locateMine = useCallback(() => {
		if (!mine?.firstId) return;
		detail.expandMany(mine.ancestorIds);
		setLocateToken((token) => token + 1);
		setShowBreadcrumb(true);
	}, [mine, detail.expandMany]);

	// Per-viewer local filter override. A viewer (and an admin who picks "only me")
	// filters their OWN view via this, without touching the shared statementSettings
	// filter everyone else sees. Persisted per (statement, user) in localStorage.
	// `applyToEveryone` (admins only, session state) decides where an admin's filter
	// edits go: the shared setting (default) or this local override.
	const [localFilter, setLocalFilter] = useState<LocalMapFilter | null>(null);
	const [applyToEveryone, setApplyToEveryone] = useState(true);

	useEffect(() => {
		if (!statementId) return;
		setLocalFilter(loadLocalFilter(statementId, user?.uid));
	}, [statementId, user?.uid]);

	const updateLocalFilter = useCallback(
		(next: LocalMapFilter | null) => {
			setLocalFilter(next);
			if (statementId) saveLocalFilter(statementId, user?.uid, next);
		},
		[statementId, user?.uid],
	);

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
		<div className={styles.board} data-map-root>
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
				{showDetailControl && (
					<div className={styles.detailControl}>
						<MapDetailControl
							level={detail.level}
							onChange={detail.setLevel}
							disabled={!detail.allowExpand}
							mineCount={mine?.mineIds.size ?? 0}
							onLocateMine={locateMine}
							breadcrumb={showBreadcrumb ? (mine?.breadcrumb ?? []) : []}
							onDismissBreadcrumb={() => setShowBreadcrumb(false)}
						/>
					</div>
				)}
				{results ? (
					<ClusterBoard
						results={results}
						localFilter={localFilter}
						detail={detail}
						mine={mine}
						highlightId={mine?.firstId}
						highlightToken={locateToken}
					/>
				) : (
					<div className={styles.loading}>
						<div className={styles.spinner} />
						<p>{t('Building map...')}</p>
					</div>
				)}
			</div>

			{canFilterMap && (
				<MapAdminPanel
					statement={statement}
					settings={statement.statementSettings ?? {}}
					canConfigure={canConfigureMap}
					localFilter={localFilter}
					onLocalFilterChange={updateLocalFilter}
					applyToEveryone={applyToEveryone}
					onApplyToEveryoneChange={setApplyToEveryone}
				/>
			)}
		</div>
	);
};

export default ClusterMap;
