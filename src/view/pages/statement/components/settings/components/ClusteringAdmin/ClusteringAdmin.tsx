import { FC, useState, useEffect, useCallback } from 'react';
import { Sparkles, Pencil, Layers, Brain, FileText, Combine } from 'lucide-react';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { Statement } from '@freedi/shared-types';
import { Framing, ClusterAggregatedEvaluation } from '@freedi/shared-types';
import {
	getFramingsForStatement,
	generateMultipleFramings,
	getClusterAggregations,
	triggerSemanticClustering,
	triggerTopicClustering,
	summarizeFramingClusters,
} from '@/controllers/db/framing/framingController';
import { logError } from '@/utils/errorHandling';
import ActionRow from '../advancedSettings/ActionRow';
import styles from './ClusteringAdmin.module.scss';
import FramingList from './FramingList';
import FramingDetail from './FramingDetail';
import RequestFramingModal from './RequestFramingModal';
import SynthesizeIdeasModal from '@/view/components/synthesizeIdeas/SynthesizeIdeasModal';
import Loader from '@/view/components/loaders/Loader';

interface ClusteringAdminProps {
	statement: Statement;
}

const ClusteringAdmin: FC<ClusteringAdminProps> = ({ statement }) => {
	const { t } = useTranslation();

	// State
	const [framings, setFramings] = useState<Framing[]>([]);
	const [selectedFraming, setSelectedFraming] = useState<Framing | null>(null);
	const [aggregations, setAggregations] = useState<ClusterAggregatedEvaluation[]>([]);
	const [isLoading, setIsLoading] = useState(false);
	const [isGenerating, setIsGenerating] = useState(false);
	const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
	const [isSynthesizeModalOpen, setIsSynthesizeModalOpen] = useState(false);
	const [synthesisStatusMessage, setSynthesisStatusMessage] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [isRunningSemantic, setIsRunningSemantic] = useState(false);
	const [isRunningTopic, setIsRunningTopic] = useState(false);
	const [isSummarizing, setIsSummarizing] = useState(false);
	const [statusMessage, setStatusMessage] = useState<string | null>(null);

	// Load framings for statement
	const loadFramings = useCallback(async () => {
		try {
			setIsLoading(true);
			setError(null);
			const loadedFramings = await getFramingsForStatement(statement.statementId);
			setFramings(loadedFramings);

			// Select first framing by default if available
			if (loadedFramings.length > 0 && !selectedFraming) {
				setSelectedFraming(loadedFramings[0]);
			}
		} catch (err) {
			logError(err, {
				operation: 'ClusteringAdmin.loadFramings',
				statementId: statement.statementId,
			});
			setError(t('Failed to load framings'));
		} finally {
			setIsLoading(false);
		}
	}, [statement.statementId, selectedFraming, t]);

	// Load aggregations when framing is selected
	const loadAggregations = useCallback(
		async (framingId: string) => {
			try {
				setIsLoading(true);
				const response = await getClusterAggregations(framingId);
				setAggregations(response.aggregations);
			} catch (err) {
				logError(err, {
					operation: 'ClusteringAdmin.loadAggregations',
					metadata: { framingId },
				});
				setError(t('Failed to load cluster aggregations'));
			} finally {
				setIsLoading(false);
			}
		},
		[t],
	);

	// Generate new AI framings
	const handleGenerateFramings = async () => {
		try {
			setIsGenerating(true);
			setError(null);
			const newFramings = await generateMultipleFramings(statement.statementId, 3);
			setFramings((prev) => [...prev, ...newFramings]);

			if (newFramings.length > 0) {
				setSelectedFraming(newFramings[0]);
			}
		} catch (err) {
			logError(err, {
				operation: 'ClusteringAdmin.handleGenerateFramings',
				statementId: statement.statementId,
			});
			setError(t('Failed to generate framings'));
		} finally {
			setIsGenerating(false);
		}
	};

	// Run the legacy semantic (hybrid k-means) clustering pipeline.
	const handleRunSemantic = async () => {
		try {
			setIsRunningSemantic(true);
			setError(null);
			setStatusMessage(null);
			const result = await triggerSemanticClustering(statement.statementId);
			setStatusMessage(
				t('Semantic clustering done — {count} clusters').replace(
					'{count}',
					String(result.clustersCreated ?? 0),
				),
			);
			await loadFramings();
		} catch (err) {
			logError(err, {
				operation: 'ClusteringAdmin.handleRunSemantic',
				statementId: statement.statementId,
			});
			setError(t('Failed to run semantic clustering'));
		} finally {
			setIsRunningSemantic(false);
		}
	};

	// Run the new topic-cluster pipeline (LLM taxonomy + canonicalization + UMAP/DBSCAN).
	const handleRunTopic = async () => {
		try {
			setIsRunningTopic(true);
			setError(null);
			setStatusMessage(null);
			const result = await triggerTopicClustering(statement.statementId);
			const summary = result.summary as
				| { totals?: { clustersCreated?: number; assignedToCluster?: number } }
				| undefined;
			const clusters = summary?.totals?.clustersCreated ?? 0;
			setStatusMessage(
				t('Topic clustering done — {count} clusters').replace('{count}', String(clusters)),
			);
			await loadFramings();
		} catch (err) {
			logError(err, {
				operation: 'ClusteringAdmin.handleRunTopic',
				statementId: statement.statementId,
			});
			setError(t('Failed to run topic clustering'));
		} finally {
			setIsRunningTopic(false);
		}
	};

	// Summarize all clusters of the currently-selected framing from their
	// above-threshold members. Writes a 2–3 sentence brief to each cluster.
	const handleSummarizeClusters = async () => {
		if (!selectedFraming) {
			setError(t('Select a framing first to summarize its clusters'));

			return;
		}
		try {
			setIsSummarizing(true);
			setError(null);
			setStatusMessage(null);
			const result = await summarizeFramingClusters(
				statement.statementId,
				selectedFraming.framingId,
			);
			const n = result.summary?.clustersSummarized ?? 0;
			setStatusMessage(t('Summarized {count} clusters').replace('{count}', String(n)));
		} catch (err) {
			logError(err, {
				operation: 'ClusteringAdmin.handleSummarizeClusters',
				statementId: statement.statementId,
				metadata: { framingId: selectedFraming.framingId },
			});
			setError(t('Failed to summarize clusters'));
		} finally {
			setIsSummarizing(false);
		}
	};

	// Handle framing selection
	const handleSelectFraming = (framing: Framing) => {
		setSelectedFraming(framing);
	};

	// Handle new custom framing created
	const handleFramingCreated = (newFraming: Framing) => {
		setFramings((prev) => [...prev, newFraming]);
		setSelectedFraming(newFraming);
		setIsRequestModalOpen(false);
	};

	// Handle framing deleted
	const handleFramingDeleted = (framingId: string) => {
		setFramings((prev) => prev.filter((f) => f.framingId !== framingId));
		if (selectedFraming?.framingId === framingId) {
			setSelectedFraming(framings.find((f) => f.framingId !== framingId) || null);
		}
	};

	// Load framings on mount
	useEffect(() => {
		loadFramings();
	}, [loadFramings]);

	// Load aggregations when framing changes
	useEffect(() => {
		if (selectedFraming) {
			loadAggregations(selectedFraming.framingId);
		}
	}, [selectedFraming, loadAggregations]);

	const anyRunning =
		isGenerating || isLoading || isRunningSemantic || isRunningTopic || isSummarizing;

	return (
		<div className={styles.clusteringAdmin}>
			{error && <div className={styles.error}>{error}</div>}
			{statusMessage && <div className={styles.status}>{statusMessage}</div>}

			<ActionRow
				icon={Sparkles}
				label={t('Generate AI Framings')}
				description={t(
					'Ask AI to propose multiple clustering perspectives in one click — each becomes a Framing you can compare.',
				)}
				buttonLabel={t('Generate')}
				loadingLabel={t('Generating...')}
				loading={isGenerating}
				disabled={anyRunning}
				onClick={handleGenerateFramings}
				variant="primary"
			/>
			<ActionRow
				icon={Pencil}
				label={t('Request Custom Framing')}
				description={t('Provide your own clustering prompt to create a tailored Framing.')}
				buttonLabel={t('Open editor')}
				disabled={anyRunning}
				onClick={() => setIsRequestModalOpen(true)}
				variant="secondary"
			/>
			<ActionRow
				icon={Layers}
				label={t('Run Semantic Clustering')}
				description={t('Re-run the legacy hybrid k-means clustering on this question')}
				buttonLabel={t('Run')}
				loadingLabel={t('Running...')}
				loading={isRunningSemantic}
				disabled={anyRunning}
				onClick={handleRunSemantic}
				variant="secondary"
			/>
			<ActionRow
				icon={Brain}
				label={t('Run Topic Clustering')}
				description={t('Run the topic-cluster pipeline (LLM canonicalization + UMAP/DBSCAN)')}
				buttonLabel={t('Run')}
				loadingLabel={t('Running...')}
				loading={isRunningTopic}
				disabled={anyRunning}
				onClick={handleRunTopic}
				badge="new"
				variant="primary"
			/>
			<ActionRow
				icon={FileText}
				label={t('Summarize clusters')}
				description={t(
					'For each cluster in the selected framing, write a short summary from its members above the consensus threshold.',
				)}
				buttonLabel={t('Summarize')}
				loadingLabel={t('Summarizing...')}
				loading={isSummarizing}
				disabled={anyRunning || !selectedFraming}
				onClick={handleSummarizeClusters}
				badge="new"
				variant="secondary"
			/>
			<ActionRow
				icon={Combine}
				label={t('Synthesize ideas')}
				description={t(
					'Find proposals that say the same thing in different words and merge them. Embeddings find candidates; an AI judge confirms each pair before merging (catches "raise" vs "lower" and similar false positives).',
				)}
				buttonLabel={t('Open')}
				disabled={anyRunning}
				onClick={() => {
					setSynthesisStatusMessage(null);
					setIsSynthesizeModalOpen(true);
				}}
				badge="new"
				variant="primary"
			/>
			{synthesisStatusMessage && (
				<div className={styles.status}>{synthesisStatusMessage}</div>
			)}

			{isLoading && framings.length === 0 ? (
				<div className={styles.loaderContainer}>
					<Loader />
				</div>
			) : framings.length === 0 ? (
				<div className={styles.emptyState}>
					<p>{t('No framings available yet')}</p>
					<p className={styles.hint}>
						{t('Click "Generate AI Framings" to create clustering perspectives for your options')}
					</p>
				</div>
			) : (
				<div className={styles.content}>
					<FramingList
						framings={framings}
						selectedFraming={selectedFraming}
						onSelectFraming={handleSelectFraming}
						onDeleteFraming={handleFramingDeleted}
					/>
					{selectedFraming && (
						<FramingDetail
							framing={selectedFraming}
							aggregations={aggregations}
							isLoading={isLoading}
							onRefresh={() => loadAggregations(selectedFraming.framingId)}
						/>
					)}
				</div>
			)}

			{isRequestModalOpen && (
				<RequestFramingModal
					statementId={statement.statementId}
					onClose={() => setIsRequestModalOpen(false)}
					onFramingCreated={handleFramingCreated}
				/>
			)}
			{isSynthesizeModalOpen && (
				<SynthesizeIdeasModal
					parentStatementId={statement.statementId}
					onClose={() => setIsSynthesizeModalOpen(false)}
					onSuccess={(createdCount) => {
						setIsSynthesizeModalOpen(false);
						setSynthesisStatusMessage(
							t('Synthesis created {n} merged statements').replace(
								'{n}',
								String(createdCount),
							),
						);
					}}
				/>
			)}
		</div>
	);
};

export default ClusteringAdmin;
