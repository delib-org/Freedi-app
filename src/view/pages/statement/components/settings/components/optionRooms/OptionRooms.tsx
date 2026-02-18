import { FC, useState, useEffect, useCallback } from 'react';
import { Users } from 'lucide-react';
import { Statement, StatementSettings } from '@freedi/shared-types';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { setStatementSettingToDB } from '@/controllers/db/statementSettings/setStatementSettings';
import {
	getAllOptionsWithMembers,
	splitJoinedOption,
	clearAllRoomsForParent,
	SplitResult,
	OptionWithMembers,
} from '@/controllers/db/joining/splitJoinedOption';
import { logError } from '@/utils/errorHandling';
import { JOINING } from '@/constants/common';
import { SettingsSection } from '../settingsSection';
import JoinBehaviorSettings from './JoinBehaviorSettings';
import RoomSizeSettings from './RoomSizeSettings';
import RoomDiversitySettings from './RoomDiversitySettings';
import OptionsStatusList from './OptionsStatusList';
import CreatedRoomsDisplay from './CreatedRoomsDisplay';
import styles from './OptionRooms.module.scss';

interface OptionRoomsProps {
	statement: Statement;
}

const OptionRooms: FC<OptionRoomsProps> = ({ statement }) => {
	const { t } = useTranslation();
	const settings = statement.statementSettings || {};

	// State
	const [joiningEnabled, setJoiningEnabled] = useState(settings.joiningEnabled ?? false);
	const [singleJoinOnly, setSingleJoinOnly] = useState(settings.singleJoinOnly ?? false);
	const [minMembers, setMinMembers] = useState(
		settings.minJoinMembers ?? JOINING.DEFAULT_MIN_MEMBERS,
	);
	const [maxMembers, setMaxMembers] = useState(settings.maxJoinMembers ?? 7); // Default to 7 for optimal group size
	const [scrambleByQuestions, setScrambleByQuestions] = useState<string[]>([]);
	const [options, setOptions] = useState<OptionWithMembers[]>([]);
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	const [isLoadingOptions, setIsLoadingOptions] = useState(false);
	const [isSplitting, setIsSplitting] = useState(false);
	const [splitResult, setSplitResult] = useState<SplitResult | null>(null);

	const topParentId = statement.topParentId || statement.statementId;

	// Handler for updating settings in DB
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

	// Handlers for join behavior
	const handleJoiningEnabledChange = useCallback(
		(enabled: boolean) => {
			setJoiningEnabled(enabled);
			handleSettingChange('joiningEnabled', enabled);
		},
		[handleSettingChange],
	);

	const handleSingleJoinOnlyChange = useCallback(
		(singleOnly: boolean) => {
			setSingleJoinOnly(singleOnly);
			handleSettingChange('singleJoinOnly', singleOnly);
		},
		[handleSettingChange],
	);

	// Handlers for room size
	const handleMinMembersChange = useCallback(
		(value: number) => {
			setMinMembers(value);
			handleSettingChange('minJoinMembers', value);
		},
		[handleSettingChange],
	);

	const handleMaxMembersChange = useCallback(
		(value: number) => {
			setMaxMembers(value);
			handleSettingChange('maxJoinMembers', value);
		},
		[handleSettingChange],
	);

	// Handler for scramble questions toggle
	const handleQuestionToggle = useCallback((questionId: string) => {
		setScrambleByQuestions((prev) => {
			if (prev.includes(questionId)) {
				return prev.filter((id) => id !== questionId);
			}

			return [...prev, questionId];
		});
	}, []);

	// Load all options with members
	const loadOptions = useCallback(async () => {
		if (!joiningEnabled) {
			setOptions([]);

			return;
		}

		setIsLoadingOptions(true);
		try {
			const result = await getAllOptionsWithMembers(statement.statementId);
			setOptions(result.options);
		} catch (error) {
			logError(error, {
				operation: 'OptionRooms.loadOptions',
				statementId: statement.statementId,
			});
		} finally {
			setIsLoadingOptions(false);
		}
	}, [statement.statementId, joiningEnabled]);

	// Load options when joining is enabled
	useEffect(() => {
		if (joiningEnabled) {
			loadOptions();
		}
	}, [joiningEnabled, loadOptions]);

	// Handler for assigning rooms to ALL options at once
	const handleAssignAllRooms = useCallback(async () => {
		if (options.length === 0) return;

		setIsSplitting(true);
		setSplitResult(null);

		try {
			// First, clear all existing rooms to start fresh with Room 1
			await clearAllRoomsForParent(statement.statementId);

			let totalRoomsCreated = 0;
			let totalParticipantsAssigned = 0;

			// Sort options by joined count (descending) so topics with most participants get lower room numbers
			const sortedOptions = [...options].sort((a, b) => b.joinedCount - a.joinedCount);

			// Process each option sequentially to ensure proper global room numbering
			for (const option of sortedOptions) {
				const result = await splitJoinedOption({
					optionStatementId: option.statementId,
					parentStatementId: statement.statementId,
					roomSize: maxMembers,
					scrambleByQuestions,
				});

				totalRoomsCreated += result.totalRooms;
				totalParticipantsAssigned += result.totalParticipants;
			}

			// Set a summary result
			setSplitResult({
				success: true,
				settingsId: '',
				optionTitle: `${options.length} options`,
				totalRooms: totalRoomsCreated,
				totalParticipants: totalParticipantsAssigned,
				balanceScore: 0,
				rooms: [],
			});

			// Refresh options list
			await loadOptions();
		} catch (error) {
			logError(error, {
				operation: 'OptionRooms.handleAssignAllRooms',
				statementId: statement.statementId,
			});
		} finally {
			setIsSplitting(false);
		}
	}, [options, statement.statementId, maxMembers, scrambleByQuestions, loadOptions]);

	return (
		<SettingsSection
			title={t('Option Rooms')}
			description={t('Configure how participants group around options')}
			icon={Users}
			priority="medium"
			defaultExpanded={false}
			tooltip={t(
				'Help users join options and form optimal-sized, diverse groups for better deliberation',
			)}
		>
			<div className={styles.optionRooms}>
				<JoinBehaviorSettings
					joiningEnabled={joiningEnabled}
					singleJoinOnly={singleJoinOnly}
					onJoiningEnabledChange={handleJoiningEnabledChange}
					onSingleJoinOnlyChange={handleSingleJoinOnlyChange}
				/>

				{joiningEnabled && (
					<>
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

						<OptionsStatusList
							options={options}
							onAssignAllRooms={handleAssignAllRooms}
							isAssigning={isSplitting}
						/>

						<CreatedRoomsDisplay statementId={statement.statementId} options={options} />

						{splitResult && (
							<div className={styles.optionRooms__splitResult}>
								<p className={styles.optionRooms__splitResultText}>
									{t('Successfully assigned')} {splitResult.totalParticipants} {t('participants')}{' '}
									{t('into')} {splitResult.totalRooms} {t('rooms')}.
								</p>
							</div>
						)}
					</>
				)}
			</div>
		</SettingsSection>
	);
};

export default OptionRooms;
