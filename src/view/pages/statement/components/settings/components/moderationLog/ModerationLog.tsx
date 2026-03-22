import { FC, useEffect, useState } from 'react';
import { Statement, ModerationLog as ModerationLogType } from '@freedi/shared-types';
import { getModerationLogs } from '@/controllers/db/moderation/getModerationLogs';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { logError } from '@/utils/errorHandling';
import { RefreshCw } from 'lucide-react';
import styles from './ModerationLog.module.scss';

interface ModerationLogProps {
	statement: Statement;
}

const ModerationLog: FC<ModerationLogProps> = ({ statement }) => {
	const { t, dir } = useTranslation();
	const [logs, setLogs] = useState<ModerationLogType[]>([]);
	const [loading, setLoading] = useState(true);

	const topParentId = statement.topParentId || statement.statementId;

	const fetchLogs = async () => {
		setLoading(true);
		try {
			const moderationLogs = await getModerationLogs(topParentId);
			setLogs(moderationLogs);
		} catch (error) {
			logError(error, {
				operation: 'ModerationLog.fetchLogs',
				statementId: statement.statementId,
			});
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		fetchLogs();
	}, [topParentId]);

	const formatDate = (timestamp: number) => {
		return new Date(timestamp).toLocaleString(dir === 'rtl' ? 'he-IL' : 'en-US', {
			dateStyle: 'short',
			timeStyle: 'short',
		});
	};

	const getCategoryLabel = (category: string): string => {
		const labels: Record<string, string> = {
			profanity: t('Profanity'),
			hate_speech: t('Hate Speech'),
			personal_attack: t('Personal Attack'),
			sexual_content: t('Sexual Content'),
			violence_threats: t('Violence/Threats'),
			spam: t('Spam'),
			other: t('Other'),
		};

		return labels[category] || category;
	};

	if (loading) {
		return <p className={styles.loading}>{t('Loading moderation logs...')}</p>;
	}

	return (
		<div className={`${styles.moderationLog} ${styles[dir]}`}>
			<div className={styles.moderationLog__header}>
				<p className={styles.moderationLog__count}>
					{logs.length === 0
						? t('No content rejections found')
						: `${logs.length} ${t('rejections found')}`}
				</p>
				<button
					className={styles.moderationLog__refresh}
					onClick={fetchLogs}
					title={t('Refresh')}
					type="button"
				>
					<RefreshCw size={16} />
				</button>
			</div>

			{logs.length > 0 && (
				<div className={styles.moderationLog__list}>
					{logs.map((log) => (
						<div key={log.moderationId} className={styles.moderationLog__item}>
							<div className={styles.moderationLog__meta}>
								<span className={styles.moderationLog__date}>{formatDate(log.createdAt)}</span>
								<span className={styles.moderationLog__category}>
									{getCategoryLabel(log.category)}
								</span>
								{log.displayName && (
									<span className={styles.moderationLog__user}>{log.displayName}</span>
								)}
							</div>
							<div className={styles.moderationLog__text}>
								<strong>{t('Original text')}:</strong>
								<p>{log.originalText}</p>
							</div>
							<div className={styles.moderationLog__reason}>
								<strong>{t('Rejection reason')}:</strong>
								<p>{log.reason}</p>
							</div>
						</div>
					))}
				</div>
			)}
		</div>
	);
};

export default ModerationLog;
