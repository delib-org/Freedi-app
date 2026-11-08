/**
 * The settings components the People section composes. Read by the
 * duplicate-control guard (settings/__tests__/duplicateControls.test.ts) so
 * every key People writes is checked against the rest of the page. Waiting
 * and Members are not listed: they change roles, not statement settings.
 * Joining answers & rooms (phase 7) brought joiningEnabled, singleJoinOnly,
 * the room sizes and the activation threshold in from Participation rules.
 */
export const PEOPLE_SECTION_COMPONENTS = [
	'MembershipSettings',
	'MemberValidation',
	'UserDemographicSetting',
	'OptionRooms',
	'ActivationThresholdSettings',
	'ConfidenceIndexSettings',
] as const;

/**
 * Where those components are rendered, relative to `host/`: PeopleSection
 * itself and the subsections it composes. The guard checks every component
 * above is rendered in one of these, and never by the settings form.
 */
export const PEOPLE_SECTION_SOURCES = [
	'PeopleSection.tsx',
	'people/JoiningSubsection.tsx',
	'../settings/components/optionRooms/OptionRooms.tsx',
] as const;
