import { FC, useState, useEffect, useCallback } from 'react';
import { Statement, StatementSettings } from '@freedi/shared-types';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { setStatementSettingToDB } from '@/controllers/db/statementSettings/setStatementSettings';
import {
	getAllOptionsWithMembers,
	OptionWithMembers,
} from '@/controllers/db/joining/splitJoinedOption';
import { logError } from '@/utils/errorHandling';
import { JOINING } from '@/constants/common';
import { Toggle } from '@/view/components/atomic/atoms/Toggle';
import SegmentedControl from '@/view/components/atomic/atoms/SegmentedControl/SegmentedControl';
import JoinFormCard from '../advancedSettings/JoinFormCard';
import SubQuestionJoinFormsCard from '../advancedSettings/SubQuestionJoinFormsCard/SubQuestionJoinFormsCard';
import JoinResolutionSettings from '../QuestionSettings/JoinResolutionSettings/JoinResolutionSettings';
import ActivationThresholdSettings from './ActivationThresholdSettings';
import RoomSizeSettings from './RoomSizeSettings';
import RoomDiversitySettings from './RoomDiversitySettings';
import RoomSplitControls from './RoomSplitControls';
import CreatedRoomsDisplay from './CreatedRoomsDisplay';
import styles from './OptionRooms.module.scss';

interface OptionRoomsProps {
	statement: Statement;
}

type JoinMode = 'one' | 'many';

/**
 * Joining answers & rooms (People #joining, questions only): the master
 * switch, then — only while it is on — how many answers a person joins, the
 * join form, conditional joining, the activation threshold, and the rooms
 * (size, diversity, split, rooms created). One block, so no hint sends the
 * host to another card (IA defect 5). Settings keys are unchanged.
 */
const OptionRooms: FC<OptionRoomsProps> = ({ statement }) => {
	const { t } = useTranslation();
	const settings = statement.statementSettings || {};

	const [joiningEnabled, setJoiningEnabled] = useState(settings.joiningEnabled ?? false);
	const [singleJoinOnly, setSingleJoinOnly] = useState(settings.singleJoinOnly ?? false);
	const [minMembers, setMinMembers] = useState(
		settings.minJoinMembers ?? JOINING.DEFAULT_MIN_MEMBERS,
	);
	const [maxMembers, setMaxMembers] = useState(
		settings.maxJoinMembers ?? JOINING.DEFAULT_ROOM_SIZE,
	);
	const [scrambleByQuestions, setScrambleByQuestions] = useState<string[]>([]);
	const [options, setOptions] = useState<OptionWithMembers[]>([]);

	useEffect(() => {
		setJoiningEnabled(settings.joiningEnabled ?? false);
	}, [settings.joiningEnabled]);

	const topParentId = statement.topParentId || statement.statementId;

	const handleSettingChange = useCallback(
		(property: keyof StatementSettings, newValue: boolean | string | number) => {
			setStatementSettingToDB({
				statement,
				property,
				newValue,
				settingsSection: 'statementSettings',
			});
		},
		[statement],
	);

	function handleJoiningChange(enabled: boolean): void {
		setJoiningEnabled(enabled);
		handleSettingChange('joiningEnabled', enabled);
	}

	function handleJoinModeChange(mode: string): void {
		const singleOnly = (mode as JoinMode) === 'one';
		setSingleJoinOnly(singleOnly);
		handleSettingChange('singleJoinOnly', singleOnly);
	}

	function handleMinMembersChange(value: number): void {
		setMinMembers(value);
		handleSettingChange('minJoinMembers', value);
	}

	function handleMaxMembersChange(value: number): void {
		setMaxMembers(value);
		handleSettingChange('maxJoinMembers', value);
	}

	function handleQuestionToggle(questionId: string): void {
		setScrambleByQuestions((prev) =>
			prev.includes(questionId) ? prev.filter((id) => id !== questionId) : [...prev, questionId],
		);
	}

	const loadOptions = useCallback(async () => {
		try {
			const result = await getAllOptionsWithMembers(statement.statementId);
			setOptions(result.options);
		} catch (error) {
			logError(error, { operation: 'OptionRooms.loadOptions', statementId: statement.statementId });
		}
	}, [statement.statementId]);

	useEffect(() => {
		if (joiningEnabled) void loadOptions();
		else setOptions([]);
	}, [joiningEnabled, loadOptions]);

	return (
		<div className={styles.optionRooms}>
			<Toggle
				checked={joiningEnabled}
				onChange={handleJoiningChange}
				label={t('people.joining')}
				hint={t('people.joining.hint')}
				id={`${statement.statementId}-joining-enabled`}
			/>

			{joiningEnabled && (
				<>
					<div className={styles.optionRooms__group}>
						<span className={styles.optionRooms__inputLabel}>{t('people.joining.each')}</span>
						<SegmentedControl
							segments={[
								{ id: 'one', label: t('people.joining.one') },
								{ id: 'many', label: t('people.joining.many') },
							]}
							activeId={singleJoinOnly ? 'one' : 'many'}
							onChange={handleJoinModeChange}
							ariaLabel={t('people.joining.each')}
						/>
					</div>
					<JoinFormCard statement={statement} />
					<SubQuestionJoinFormsCard statement={statement} />
					<JoinResolutionSettings statement={statement} />
					<ActivationThresholdSettings statement={statement} />

					<h4 className={styles.optionRooms__groupTitle}>{t('Rooms')}</h4>
					<RoomSizeSettings
						minMembers={minMembers}
						maxMembers={maxMembers}
						onMinMembersChange={handleMinMembersChange}
						onMaxMembersChange={handleMaxMembersChange}
					/>
					<RoomDiversitySettings
						statementId={statement.statementId}
						topParentId={topParentId}
						selectedQuestionIds={scrambleByQuestions}
						onQuestionToggle={handleQuestionToggle}
					/>
					<RoomSplitControls
						questionId={statement.statementId}
						options={options}
						roomSize={maxMembers}
						scrambleByQuestions={scrambleByQuestions}
						onSplit={loadOptions}
					/>
					<CreatedRoomsDisplay statementId={statement.statementId} options={options} />
				</>
			)}
		</div>
	);
};

export default OptionRooms;
