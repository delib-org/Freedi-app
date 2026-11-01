/**
 * The settings components PeopleSection composes, in render order. Read by
 * the duplicate-control guard (settings/__tests__/duplicateControls.test.ts)
 * so every key People writes is checked against the rest of the page. Waiting
 * and Members are not listed: they change roles, not statement settings.
 */
export const PEOPLE_SECTION_COMPONENTS = [
	'MembershipSettings',
	'MemberValidation',
	'UserDemographicSetting',
	'OptionRooms',
	'ConfidenceIndexSettings',
] as const;
