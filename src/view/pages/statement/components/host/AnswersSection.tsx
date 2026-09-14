import { FC, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useSelector } from 'react-redux';
import { Eye, EyeOff, FileInput, Layers } from 'lucide-react';
import { Statement, StatementType } from '@freedi/shared-types';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { useShowHiddenCards } from '@/controllers/hooks/useShowHiddenCards';
import { statementSubsSelector } from '@/redux/statements/statementsSlice';
import GoogleDocsImportModal from '@/view/components/googleDocsImport/GoogleDocsImportModal';
import AnchoredSettings from '../settings/components/QuestionSettings/AnchoredSettings';
import BulkAddOptions from '../settings/components/BulkAddOptions/BulkAddOptions';
import ToggleSwitch from '../settings/components/advancedSettings/ToggleSwitch';
import advStyles from '../settings/components/advancedSettings/EnhancedAdvancedSettings.module.scss';
import { countHidden } from './hostHubLogic';
import styles from './HostHub.module.scss';

const groupWrapClass = `${advStyles.enhancedSettings} ${advStyles.flatGroup}`;

interface AnswersSectionProps {
	statement: Statement;
}

/** Hidden answers, pinned answers, bulk add, Google Docs import, curate groups. */
const AnswersSection: FC<AnswersSectionProps> = ({ statement }) => {
	const { t } = useTranslation();
	const { showHiddenCards, setShowHiddenCards } = useShowHiddenCards();
	const [importOpen, setImportOpen] = useState(false);
	const subsSelect = useMemo(
		() => statementSubsSelector(statement.statementId),
		[statement.statementId],
	);
	const subStatements = useSelector(subsSelect);
	const hiddenCount = countHidden(subStatements);
	const isQuestion = statement.statementType === StatementType.question;

	return (
		<div className={styles.liveGrid} data-testid="host-answers">
			<div className={groupWrapClass}>
				<ToggleSwitch
					isChecked={showHiddenCards}
					onChange={setShowHiddenCards}
					label={t('host.showHiddenAnswers')}
					description={t('host.hiddenCount').replace('{{count}}', String(hiddenCount))}
					icon={showHiddenCards ? Eye : EyeOff}
					data-testid="show-hidden-answers"
				/>
			</div>
			{isQuestion && <AnchoredSettings statement={statement} />}
			<BulkAddOptions statement={statement} />
			<div className={styles.row}>
				<button type="button" className={styles.linkButton} onClick={() => setImportOpen(true)}>
					<FileInput size={16} aria-hidden="true" />
					{t('host.importGoogleDocs')}
				</button>
				<Link className={styles.linkButton} to={`/statement/${statement.statementId}/groups`}>
					<Layers size={16} aria-hidden="true" />
					{t('host.curateGroups')}
				</Link>
			</div>
			<GoogleDocsImportModal
				statement={statement}
				isOpen={importOpen}
				onClose={() => setImportOpen(false)}
			/>
		</div>
	);
};

export default AnswersSection;
