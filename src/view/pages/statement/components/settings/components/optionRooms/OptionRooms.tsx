import { FC, useState, useEffect, useCallback } from 'react';
import { Users } from 'lucide-react';
import { Statement, StatementSettings } from '@freedi/shared-types';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { setStatementSettingToDB } from '@/controllers/db/statementSettings/setStatementSettings';
import { getOptionsExceedingMax, splitJoinedOption, SplitResult } from '@/controllers/db/joining/splitJoinedOption';
import { logError } from '@/utils/errorHandling';
import { JOINING } from '@/constants/common';
import { SettingsSection } from '../settingsSection';
import JoinBehaviorSettings from './JoinBehaviorSettings';
import RoomSizeSettings from './RoomSizeSettings';
import RoomDiversitySettings from './RoomDiversitySettings';
import OptionsStatusList, { OptionStatus } from './OptionsStatusList';
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
	const [minMembers, setMinMembers] = useState(settings.minJoinMembers ?? JOINING.DEFAULT_MIN_MEMBERS);
	const [maxMembers, setMaxMembers] = useState(settings.maxJoinMembers ?? 7); // Default to 7 for optimal group size
	const [scrambleByQuestions, setScrambleByQuestions] = useState<string[]>([]);
	const [options, setOptions] = useState<OptionStatus[]>([]);
	const [isLoadingOptions, setIsLoadingOptions] = useState(false);
	const [isSplitting, setIsSplitting] = useState(false);
	const [splittingOptionId, setSplittingOptionId] = useState<string | undefined>();
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
		[statement]
	);

	// Handlers for join behavior
	const handleJoiningEnabledChange = useCallback(
		(enabled: boolean) => {
			setJoiningEnabled(enabled);
			handleSettingChange('joiningEnabled', enabled);
		},
		[handleSettingChange]
	);

	const handleSingleJoinOnlyChange = useCallback(
		(singleOnly: boolean) => {
			setSingleJoinOnly(singleOnly);
			handleSettingChange('singleJoinOnly', singleOnly);
		},
		[handleSettingChange]
	);

	// Handlers for room size
	const handleMinMembersChange = useCallback(
		(value: number) => {
			setMinMembers(value);
			handleSettingChange('minJoinMembers', value);
		},
		[handleSettingChange]
	);

	const handleMaxMembersChange = useCallback(
		(value: number) => {
			setMaxMembers(value);
			handleSettingChange('maxJoinMembers', value);
		},
		[handleSettingChange]
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

	// Load options that need attention
	const loadOptions = useCallback(async () => {
		if (!joiningEnabled) {
			setOptions([]);

			return;
		}

		setIsLoadingOptions(true);
		try {
			const result = await getOptionsExceedingMax(statement.statementId);

			// Transform to OptionStatus format with local minMembers/maxMembers
			const optionStatuses: OptionStatus[] = result.options.map((opt) => ({
				statementId: opt.statementId,
				statement: opt.statement,
				joinedCount: opt.joinedCount,
				minMembers,
				maxMembers,
			}));

			setOptions(optionStatuses);
		} catch (error) {
			logError(error, {
				operation: 'OptionRooms.loadOptions',
				statementId: statement.statementId,
			});
		} finally {
			setIsLoadingOptions(false);
		}
	}, [statement.statementId, joiningEnabled, minMembers, maxMembers]);

	// Load options when joining is enabled
	useEffect(() => {
		if (joiningEnabled) {
			loadOptions();
		}
	}, [joiningEnabled, loadOptions]);

	// Handler for splitting an option
	const handleSplitOption = useCallback(
		async (optionStatementId: string) => {
			setIsSplitting(true);
			setSplittingOptionId(optionStatementId);
			setSplitResult(null);

			try {
				const result = await splitJoinedOption({
					optionStatementId,
					parentStatementId: statement.statementId,
					roomSize: maxMembers,
					scrambleByQuestions,
				});

				setSplitResult(result);
				// Refresh options list
				await loadOptions();
			} catch (error) {
				logError(error, {
					operation: 'OptionRooms.handleSplitOption',
					statementId: statement.statementId,
					metadata: { optionStatementId },
				});
			} finally {
				setIsSplitting(false);
				setSplittingOptionId(undefined);
			}
		},
		[statement.statementId, maxMembers, scrambleByQuestions, loadOptions]
	);

	return (
		<SettingsSection
			title={t('Option Rooms')}
			description={t('Configure how participants group around options')}
			icon={Users}
			priority="medium"
			defaultExpanded={false}
			tooltip={t('Help users join options and form optimal-sized, diverse groups for better deliberation')}
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
							onSplitOption={handleSplitOption}
							isSplitting={isSplitting}
							splittingOptionId={splittingOptionId}
						/>

						{splitResult && (
							<div className={styles.optionRooms__splitResult}>
								<p className={styles.optionRooms__splitResultText}>
									{t('Successfully split')} "{splitResult.optionTitle}" {t('into')}{' '}
									{splitResult.totalRooms} {t('rooms')} {t('with')}{' '}
									{splitResult.totalParticipants} {t('participants')}.
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
