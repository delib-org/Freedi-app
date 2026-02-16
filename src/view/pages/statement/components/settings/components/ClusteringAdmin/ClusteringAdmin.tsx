import { FC, useState, useEffect, useCallback } from 'react';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { Statement } from '@freedi/shared-types';
import { Framing, ClusterAggregatedEvaluation } from '@freedi/shared-types';
import {
	getFramingsForStatement,
	generateMultipleFramings,
	getClusterAggregations,
} from '@/controllers/db/framing/framingController';
import { logError } from '@/utils/errorHandling';
import styles from './ClusteringAdmin.module.scss';
import FramingList from './FramingList';
import FramingDetail from './FramingDetail';
import RequestFramingModal from './RequestFramingModal';
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
	const [error, setError] = useState<string | null>(null);

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

	return (
		<div className={styles.clusteringAdmin}>
			<div className={styles.header}>
				<h3 className={styles.title}>{t('Clustering & Framings')}</h3>
				<p className={styles.description}>
					{t('Generate AI-powered clustering perspectives and view aggregated evaluation results')}
				</p>
			</div>

			{error && <div className={styles.error}>{error}</div>}

			<div className={styles.actions}>
				<button
					className={`btn btn--primary ${styles.generateBtn}`}
					onClick={handleGenerateFramings}
					disabled={isGenerating || isLoading}
				>
					{isGenerating ? (
						<>
							<Loader />
							<span>{t('Generating...')}</span>
						</>
					) : (
						t('Generate AI Framings')
					)}
				</button>
				<button
					className={`btn btn--secondary ${styles.customBtn}`}
					onClick={() => setIsRequestModalOpen(true)}
					disabled={isGenerating || isLoading}
				>
					{t('Request Custom Framing')}
				</button>
			</div>

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
		</div>
	);
};

export default ClusteringAdmin;
