import { FC, useMemo } from 'react';
import { shallowEqual } from 'react-redux';
import { UserDemographicQuestionType } from '@freedi/shared-types';
import { useAppSelector } from '@/controllers/hooks/reduxHooks';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { selectUserDemographicQuestionsByStatementId } from '@/redux/userDemographic/userDemographicSlice';
import QuestionSelector from '../roomAssignment/components/QuestionSelector';
import styles from './OptionRooms.module.scss';

interface RoomDiversitySettingsProps {
	statementId: string;
	topParentId: string;
	selectedQuestionIds: string[];
	onQuestionToggle: (questionId: string) => void;
	disabled?: boolean;
}

const RoomDiversitySettings: FC<RoomDiversitySettingsProps> = ({
	statementId,
	topParentId,
	selectedQuestionIds,
	onQuestionToggle,
	disabled = false,
}) => {
	const { t } = useTranslation();

	// Get demographic questions from Redux
	const questionsByStatement = useAppSelector(
		selectUserDemographicQuestionsByStatementId(statementId),
		shallowEqual
	);
	const questionsByTopParent = useAppSelector(
		selectUserDemographicQuestionsByStatementId(topParentId || ''),
		shallowEqual
	);

	// Combine and deduplicate by userQuestionId
	const demographicQuestions = useMemo(() => {
		const combined = [...questionsByStatement, ...questionsByTopParent];
		const uniqueMap = new Map(combined.map(q => [q.userQuestionId, q]));

		return Array.from(uniqueMap.values());
	}, [questionsByStatement, questionsByTopParent]);

	// Filter to only radio and checkbox questions (selectable for scrambling)
	const selectableQuestions = useMemo(() => {
		return demographicQuestions.filter(
			(q) =>
				q.type === UserDemographicQuestionType.radio ||
				q.type === UserDemographicQuestionType.checkbox
		);
	}, [demographicQuestions]);

	return (
		<div className={styles.optionRooms__subsection}>
			<h3 className={styles.optionRooms__subsectionTitle}>
				{t('Room Diversity')}
			</h3>
			<p className={styles.optionRooms__subsectionDescription}>
				{t('When splitting, rooms will be composed for maximum demographic diversity')}
			</p>

			<div className={disabled ? styles['optionRooms__disabled'] : ''}>
				<QuestionSelector
					questions={selectableQuestions}
					selectedQuestionIds={selectedQuestionIds}
					onToggle={onQuestionToggle}
				/>
			</div>
		</div>
	);
};

export default RoomDiversitySettings;
