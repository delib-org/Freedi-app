import { FC, useState } from 'react';
import { Statement } from '@freedi/shared-types';
import { Download, Users } from 'lucide-react';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { exportStatementData } from '@/utils/exportUtils';
import { exportPrivacyPreservingData } from '@/utils/privacyExportUtils';
import { logError } from '@/utils/errorHandling';
import type { ExportFormat } from '@/types/export';
import styles from './EnhancedAdvancedSettings.module.scss';

interface ExportSettingsProps {
	statement: Statement;
	subStatements: Statement[];
}

const ExportSettings: FC<ExportSettingsProps> = ({ statement, subStatements }) => {
	const { t } = useTranslation();

	const [isExporting, setIsExporting] = useState<{ json: boolean; csv: boolean }>({
		json: false,
		csv: false,
	});

	const [isUserDataExporting, setIsUserDataExporting] = useState<{ json: boolean; csv: boolean }>({
		json: false,
		csv: false,
	});

	async function handleExport(format: ExportFormat) {
		setIsExporting((prev) => ({ ...prev, [format]: true }));
		try {
			await exportStatementData(statement, subStatements, format);
		} catch (error) {
			logError(error, {
				operation: 'ExportSettings.handleExport',
				statementId: statement.statementId,
				metadata: { format },
			});
		} finally {
			setIsExporting((prev) => ({ ...prev, [format]: false }));
		}
	}

	async function handleUserDataExport(format: ExportFormat) {
		setIsUserDataExporting((prev) => ({ ...prev, [format]: true }));
		try {
			await exportPrivacyPreservingData(statement, subStatements, format);
		} catch (error) {
			logError(error, {
				operation: 'ExportSettings.handleUserDataExport',
				statementId: statement.statementId,
				metadata: { format },
			});
		} finally {
			setIsUserDataExporting((prev) => ({ ...prev, [format]: false }));
		}
	}

	return (
		<div className={styles.dataExportSection}>
			<h4 className={styles.sectionTitle}>
				<Download size={18} />
				{t('Export Statement Data')}
			</h4>
			<p className={styles.sectionDescription}>
				{t('Download this statement and its direct sub-statements with full metadata')}
			</p>
			<div className={styles.exportButtons}>
				<button
					className={styles.exportButton}
					onClick={() => handleExport('json')}
					disabled={isExporting.json}
				>
					<Download size={18} />
					{isExporting.json ? t('Exporting...') : t('Export JSON')}
				</button>
				<button
					className={styles.exportButton}
					onClick={() => handleExport('csv')}
					disabled={isExporting.csv}
				>
					<Download size={18} />
					{isExporting.csv ? t('Exporting...') : t('Export CSV')}
				</button>
			</div>
			<p className={styles.exportInfo}>
				{t('Includes {{count}} sub-statements').replace('{{count}}', String(subStatements.length))}
			</p>

			{/* Divider */}
			<div className={styles.exportDivider} />

			{/* User Data Export */}
			<h4 className={styles.sectionTitle}>
				<Users size={18} />
				{t('Export User Evaluation Data')}
			</h4>
			<p className={styles.sectionDescription}>
				{t(
					'Export evaluation data with demographic breakdowns. Privacy is protected using k-anonymity - demographic details are only shown when 3+ users share the same characteristic.',
				)}
			</p>
			<div className={styles.exportButtons}>
				<button
					className={styles.exportButton}
					onClick={() => handleUserDataExport('json')}
					disabled={isUserDataExporting.json}
				>
					<Download size={18} />
					{isUserDataExporting.json ? t('Exporting...') : t('Export JSON')}
				</button>
				<button
					className={styles.exportButton}
					onClick={() => handleUserDataExport('csv')}
					disabled={isUserDataExporting.csv}
				>
					<Download size={18} />
					{isUserDataExporting.csv ? t('Exporting...') : t('Export CSV')}
				</button>
			</div>
			<p className={styles.exportInfo}>
				{t('Includes evaluation counts, demographic breakdowns, and anonymized data')}
			</p>
		</div>
	);
};

export default ExportSettings;
