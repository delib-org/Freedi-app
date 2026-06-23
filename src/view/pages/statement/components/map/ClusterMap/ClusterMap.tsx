import { FC, useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { useLocation, useParams, useSearchParams } from 'react-router';
import { Role, StatementType } from '@freedi/shared-types';
import { isAdmin as isAdminRole } from '@/controllers/general/helpers';
import { FilterType } from '@/controllers/general/sorting';
import { useAppSelector } from '@/controllers/hooks/reduxHooks';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { MapProvider, useMapContext } from '@/controllers/hooks/useMap';
import { listenToMindMapData } from '@/controllers/db/statements/optimizedListeners';
import {
	statementSelector,
	statementSubscriptionSelector,
} from '@/redux/statements/statementsSlice';
import Modal from '@/view/components/modal/Modal';
import ShareButton from '@/view/components/buttons/shareButton/ShareButton';
import MindElixirMap from '../components/MindElixirMap';
import CreateStatementModal from '../../createStatementModal/CreateStatementModal';
import { useMindMap } from '../MindMapMV';
import { ALL_LAYERS_VISIBLE } from '../mapHelpers/layerFilter';
import type { LayerVisibility, MapLayer } from '../mapHelpers/layerFilter';
import styles from './ClusterMap.module.scss';

const LAYER_OPTIONS: { value: MapLayer; label: string }[] = [
	{ value: 'raw', label: 'Raw' },
	{ value: 'synth', label: 'Synths' },
	{ value: 'clusters', label: 'Clusters' },
];

/**
 * Standalone, shareable, embeddable cluster board.
 *
 * Reuses the same real-time engine as the in-app mind map (MindElixirMap +
 * useMindMap + Firestore listeners) but renders chrome-less for sharing via a
 * link or an iframe embed. Access is handled by ProtectedLayout (which auto
 * signs-in anonymous visitors for public statements via usePublicAccess), so
 * any participant with access to the statement can co-edit the board.
 */
const ClusterMapInner: FC = () => {
	const { t } = useTranslation();
	const { statementId } = useParams();
	const location = useLocation();
	const [searchParams] = useSearchParams();

	const isEmbed = searchParams.get('embed') === '1' || location.pathname.endsWith('/embed');

	const statement = useSelector(statementSelector(statementId));
	const { results, flat } = useMindMap();
	const { mapContext, setMapContext } = useMapContext();

	// Real-time descendants + root for the board (mirrors useStatementListeners'
	// 'mind-map' branch). The standalone page owns this listener itself.
	useEffect(() => {
		if (!statementId) return;
		const unsubscribe = listenToMindMapData(statementId);

		return () => unsubscribe();
	}, [statementId]);

	// Subscription role: admins keep extra powers (delete), but co-editing
	// (add/edit/regroup) is open to anyone with access on the board.
	const subscription = useAppSelector(
		statementId ? statementSubscriptionSelector(statementId) : () => undefined,
	);
	const rootId = statement?.topParentId ?? statement?.statementId;
	const rootSubscription = useAppSelector(
		rootId && !subscription ? statementSubscriptionSelector(rootId) : () => undefined,
	);
	const role = (subscription || rootSubscription)?.role ?? Role.member;
	const _isAdmin = isAdminRole(role);

	const [layerVisibility, setLayerVisibility] = useState<LayerVisibility>(ALL_LAYERS_VISIBLE);
	const toggleLayer = (layer: MapLayer) =>
		setLayerVisibility((prev) => ({ ...prev, [layer]: !prev[layer] }));
	const hasClusters = !flat;

	const selectedId = mapContext?.selectedId ?? null;
	const current = useSelector(selectedId ? statementSelector(selectedId) : () => undefined);
	const parentForModal = current ?? statement;
	const isOptionAllowed = parentForModal?.statementType === StatementType.question;

	const toggleModal = (show: boolean) => setMapContext((prev) => ({ ...prev, showModal: show }));

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
						{hasClusters && (
							<div className={styles.layerFilter} role="group" aria-label={t('Show map layer')}>
								{LAYER_OPTIONS.map(({ value, label }) => (
									<button
										key={value}
										type="button"
										aria-pressed={layerVisibility[value]}
										className={`${styles.layerButton} ${layerVisibility[value] ? styles.layerButtonActive : ''}`}
										onClick={() => toggleLayer(value)}
									>
										{t(label)}
									</button>
								))}
							</div>
						)}
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
					<MindElixirMap
						descendants={results}
						isAdmin={_isAdmin}
						allowRegroup
						boardMode
						filterBy={FilterType.questionsResultsOptions}
						layerVisibility={layerVisibility}
					/>
				) : (
					<div className={styles.loading}>
						<div className={styles.spinner} />
						<p>{t('Building map...')}</p>
					</div>
				)}
			</div>

			{mapContext.showModal && (
				<Modal>
					<CreateStatementModal
						allowedTypes={[
							...(isOptionAllowed ? [StatementType.option] : []),
							StatementType.question,
						]}
						parentStatement={mapContext.parentStatement}
						isOption={isOptionAllowed}
						setShowModal={toggleModal}
					/>
				</Modal>
			)}
		</div>
	);
};

const ClusterMap: FC = () => (
	<MapProvider>
		<ClusterMapInner />
	</MapProvider>
);

export default ClusterMap;
