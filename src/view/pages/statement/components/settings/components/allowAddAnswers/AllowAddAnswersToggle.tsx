import { FC } from 'react';
import { Plus } from 'lucide-react';
import { Statement } from '@freedi/shared-types';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { canParticipantsAddAnswers } from '../../../questionScreen/questionScreenLogic';
import ToggleSwitch from '../advancedSettings/ToggleSwitch';
import { SettingChangeHandler } from '../../settingsTypeHelpers';

/** The two flags one "Allow participants to add answers" toggle writes together. */
export const ALLOW_ADD_ANSWERS_KEYS = [
	'enableAddEvaluationOption',
	'enableAddVotingOption',
] as const;

interface AllowAddAnswersToggleProps {
	statement: Statement;
	handleSettingChange: SettingChangeHandler;
	onSaved?: () => void;
}

/**
 * ONE control for "can participants add answers". The data model keeps a flag
 * per rating UI (evaluation vs voting); hosts think of it as one switch, so
 * this writes both and reads the flag for the UI the question currently runs.
 */
const AllowAddAnswersToggle: FC<AllowAddAnswersToggleProps> = ({
	statement,
	handleSettingChange,
	onSaved,
}) => {
	const { t } = useTranslation();

	function handleChange(checked: boolean) {
		ALLOW_ADD_ANSWERS_KEYS.forEach((key) => handleSettingChange(key, checked));
		onSaved?.();
	}

	return (
		<ToggleSwitch
			isChecked={canParticipantsAddAnswers(statement)}
			onChange={handleChange}
			label={t('host.allowAddAnswers')}
			description={t('host.allowAddAnswersDesc')}
			icon={Plus}
			data-testid="allow-add-answers"
		/>
	);
};

export default AllowAddAnswersToggle;
