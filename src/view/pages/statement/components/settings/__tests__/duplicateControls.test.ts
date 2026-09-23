/**
 * Guard: no setting key is rendered by two controls on the same page.
 *
 * "Page" = one settings variant: the legacy settings page (form only) or the
 * Host hub (form + Live now card). Keys per component are scanned from the
 * component's source, so a new toggle that repeats an existing one fails here
 * instead of shipping two switches for one flag.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { FORM_COMPOSITION } from '../components/statementSettingsForm/StatementSettingsForm';
import {
	INSTANT_ALLOW_ADD_BY_VARIANT,
	INSTANT_TOGGLES_BY_VARIANT,
} from '../components/instantSettings/InstantSettings';
import { ALLOW_ADD_ANSWERS_KEYS } from '../components/allowAddAnswers/AllowAddAnswersToggle';
import { LIVE_NOW_SETTING_KEYS } from '../../host/hostHubLogic';
import { SettingsVariant } from '../settingsTypeHelpers';

const COMPONENTS = path.resolve(__dirname, '../components');

const FILES: Record<string, string> = {
	ParticipationSettings: 'advancedSettings/ParticipationSettings.tsx',
	EvaluationSettings: 'advancedSettings/EvaluationSettings.tsx',
	VisibilitySettings: 'advancedSettings/VisibilitySettings.tsx',
	NavigationSettings: 'advancedSettings/NavigationSettings.tsx',
	AISettings: 'advancedSettings/AISettings.tsx',
	DiscussionSettings: 'advancedSettings/DiscussionSettings.tsx',
	LocalizationSettings: 'advancedSettings/LocalizationSettings.tsx',
	ExportSettings: 'advancedSettings/ExportSettings.tsx',
	QuestionSettings: 'QuestionSettings/QuestionSettings.tsx',
	ChoseBySettings: 'choseBy/ChoseBySettings.tsx',
	DeadlineSettings: 'QuestionSettings/DeadlineSettings.tsx',
	AnchoredSettings: 'QuestionSettings/AnchoredSettings.tsx',
	ConfidenceIndexSettings: 'QuestionSettings/ConfidenceIndexSettings.tsx',
	SynthesisPanel: 'synthesisPanel/SynthesisPanel.tsx',
	ModerationLog: 'moderationLog/ModerationLog.tsx',
	MembershipSettings: 'membershipSettings/MembershipSettings.tsx',
	MembersSettings: 'membership/MembersSettings.tsx',
	AdminsManagement: 'membership/AdminsManagement/AdminsManagement.tsx',
	MemberValidation: 'memberValidation/MemberValidation.tsx',
	UserDemographicSetting: 'UserDemographicSettings/UserDemographicSetting.tsx',
	EmailNotifications: 'emailNotifications/EmailNotifications.tsx',
	OptionRooms: 'optionRooms/OptionRooms.tsx',
};

/** Handlers that write one fixed field each. */
const HANDLER_KEYS: Record<string, string> = {
	handleHideChange: 'hide',
	handlePowerFollowMeChange: 'powerFollowMe',
	handleIsDocumentChange: 'isDocument',
	handleDefaultLanguageChange: 'defaultLanguage',
	handleForceLanguageChange: 'forceLanguage',
};

function keysInSource(source: string): string[] {
	const keys = new Set<string>();
	for (const m of source.matchAll(/handleSettingChange\(\s*'([A-Za-z]+)'/g)) keys.add(m[1]);
	for (const m of source.matchAll(/property:\s*'([A-Za-z]+)'/g)) keys.add(m[1]);
	for (const m of source.matchAll(/onChange=\{(handle[A-Za-z]+Change)\}/g)) {
		const key = HANDLER_KEYS[m[1]];
		if (key) keys.add(key);
	}

	return [...keys];
}

function keysForVariant(variant: SettingsVariant): Map<string, string[]> {
	const owners = new Map<string, string[]>();
	const add = (key: string, owner: string) => owners.set(key, [...(owners.get(key) ?? []), owner]);

	for (const entry of FORM_COMPOSITION[variant]) {
		if (entry.component === 'InstantSettings') {
			INSTANT_TOGGLES_BY_VARIANT[variant].forEach((key) => add(key, 'InstantSettings'));
			add('ratingMode', 'InstantSettings');
			if (INSTANT_ALLOW_ADD_BY_VARIANT[variant]) {
				ALLOW_ADD_ANSWERS_KEYS.forEach((key) => add(key, 'InstantSettings/AllowAddAnswers'));
			}
			continue;
		}
		const file = FILES[entry.component];
		if (!file) throw new Error(`No source mapped for ${entry.component}`);
		const source = fs.readFileSync(path.join(COMPONENTS, file), 'utf8');
		keysInSource(source)
			.filter((key) => !(entry.omit ?? []).includes(key))
			.forEach((key) => add(key, entry.component));
	}
	if (variant === 'hub') {
		LIVE_NOW_SETTING_KEYS.forEach((key) => add(key, 'LiveNowCard'));
	}

	return owners;
}

describe('settings pages render each setting key once', () => {
	it.each<SettingsVariant>(['legacy', 'hub'])('%s', (variant) => {
		const duplicates = [...keysForVariant(variant)].filter(([, owners]) => owners.length > 1);
		expect(duplicates).toEqual([]);
	});

	it('the scanner actually finds keys (sanity)', () => {
		expect(keysForVariant('legacy').has('joiningEnabled')).toBe(true);
		expect(keysForVariant('hub').get('enableAddVotingOption')).toEqual(['LiveNowCard']);
		expect(keysForVariant('legacy').get('enableAddVotingOption')).toEqual([
			'InstantSettings/AllowAddAnswers',
		]);
	});
});
