import { FC, useCallback, useEffect, useState } from 'react';
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
import { useSummarization } from '@/controllers/hooks/useSummarization';
import ShareButton from '@/view/components/buttons/shareButton/ShareButton';
import Modal from '@/view/components/modal/Modal';
import SummarizeButton from '@/view/pages/statement/components/statementTypes/question/document/MultiStageQuestion/components/SummarizeButton/SummarizeButton';
import SummarizeModal from '@/view/pages/statement/components/statementTypes/question/document/MultiStageQuestion/components/SummarizeModal/SummarizeModal';
import SummaryDisplay from '@/view/pages/statement/components/statementTypes/question/document/MultiStageQuestion/components/SummaryDisplay/SummaryDisplay';
import ClusterBoard from './ClusterBoard';
import MapAdminPanel from './MapAdminPanel';
import { loadLocalFilter, saveLocalFilter, type LocalMapFilter } from './mapLocalFilter';
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
	const isQuestion = statement?.statementType === StatementType.question;
	const canConfigureMap = isAdmin && !isEmbed && isQuestion;
	// Admins get the full panel; permitted viewers get a filter-only panel when
	// the admin has opted in via statementSettings.map.allowViewerFilter.
	const allowViewerFilter = statement?.statementSettings?.map?.allowViewerFilter ?? false;
	const canFilterMap = !isEmbed && isQuestion && (isAdmin || allowViewerFilter);

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

	// Discussion summary — reuses the same mechanism as the question document:
	// admins generate/regenerate it (callable `summarizeDiscussion` writes
	// `summary` + `summaryGeneratedAt` onto the question doc), and anyone with
	// access can open it via "Show summary" since it lives on the shared doc.
	const { generateSummary, isGenerating } = useSummarization();
	const [summarizeModalOpen, setSummarizeModalOpen] = useState(false);
	const [showSummary, setShowSummary] = useState(false);
	const summary = statement?.summary;
	// `summaryGeneratedAt` is written by the summarizeDiscussion CF but not in the
	// shared-types schema — read it via a cast, the same pattern the question
	// document sections (IntroductionSection/SimpleQuestion/StagePage) use.
	const summaryGeneratedAt = (statement as { summaryGeneratedAt?: number } | undefined)
		?.summaryGeneratedAt;

	const handleGenerateSummary = async (customPrompt: string) => {
		if (!statementId) return;
		const ok = await generateSummary(statementId, customPrompt || undefined);
		if (ok) {
			setSummarizeModalOpen(false);
			setShowSummary(true);
		}
	};

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
						{isQuestion && summary && (
							<button
								type="button"
								className="btn btn--secondary"
								onClick={() => setShowSummary(true)}
							>
								{t('Show summary')}
							</button>
						)}
						{isQuestion && (
							<SummarizeButton
								statement={statement}
								onOpenModal={() => setSummarizeModalOpen(true)}
								isLoading={isGenerating}
							/>
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
					<ClusterBoard results={results} localFilter={localFilter} />
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

			<SummarizeModal
				isOpen={summarizeModalOpen}
				onClose={() => setSummarizeModalOpen(false)}
				onGenerate={handleGenerateSummary}
				isLoading={isGenerating}
				questionTitle={statement.statement}
			/>

			{showSummary && summary && (
				<Modal closeModal={() => setShowSummary(false)}>
					<SummaryDisplay summary={summary} generatedAt={summaryGeneratedAt} />
				</Modal>
			)}
		</div>
	);
};

export default ClusterMap;
