interface ColorMappings {
	[key: string]: string;
}

export const colorMappings: ColorMappings = {
	// Community Voice gray scale
	'--gray0-1': '--gray0-1-high-contrast',
	'--gray0-1-border': '--gray0-1-border-high-contrast',
	'--gray0-1-text': '--gray0-1-text-high-contrast',
	'--gray0-125': '--gray0-125-high-contrast',
	'--gray0-125-border': '--gray0-125-border-high-contrast',
	'--gray0-125-text': '--gray0-125-text-high-contrast',
	'--gray0-15': '--gray0-15-high-contrast',
	'--gray0-15-border': '--gray0-15-border-high-contrast',
	'--gray0-15-text': '--gray0-15-text-high-contrast',
	'--gray0-2': '--gray0-2-high-contrast',
	'--gray0-2-border': '--gray0-2-border-high-contrast',
	'--gray0-2-text': '--gray0-2-text-high-contrast',

	// Community Voice agree scale (selected states)
	'--agree0': '--agree0-high-contrast',
	'--agree0-border': '--agree0-border-high-contrast',
	'--agree0-text': '--agree0-text-high-contrast',
	'--agree1': '--agree1-high-contrast',
	'--agree1-border': '--agree1-border-high-contrast',
	'--agree1-text': '--agree1-text-high-contrast',
	'--agree2': '--agree2-high-contrast',
	'--agree2-border': '--agree2-border-high-contrast',
	'--agree2-text': '--agree2-text-high-contrast',
	'--agree3': '--agree3-high-contrast',
	'--agree3-border': '--agree3-border-high-contrast',
	'--agree3-text': '--agree3-text-high-contrast',

	// Agreement range
	'--range-positive-100': '--range-positive-100-contrast',
	'--range-positive-60': '--range-positive-60-contrast',
	'--range-positive-30': '--range-positive-30-contrast',

	// Conflict range
	'--range-conflict-100': '--range-conflict-100-contrast',
	'--range-conflict-60': '--range-conflict-60-contrast',
	'--range-conflict-30': '--range-conflict-30-contrast',

	// objections range
	'--range-objections-100': '--range-objections-100-contrast',
	'--range-objections-60': '--range-objections-60-contrast',
	'--range-objections-30': '--range-objections-30-contrast',

	// Hover agreement range
	'--range-hover-positive-100': '--range-hover-positive-100-contrast',
	'--range-hover-positive-60': '--range-hover-positive-60-contrast',
	'--range-hover-positive-30': '--range-hover-positive-30-contrast',

	// Hover conflict range
	'--range-hover-conflict-100': '--range-conflict-100-contrast',
	'--range-hover-conflict-60': '--range-conflict-60-contrast',
	'--range-hover-conflict-30': '--range-conflict-30-contrast',

	// Hover objections range
	'--range-hover-objections-100': '--range-objections-100-contrast',
	'--range-hover-objections-60': '--range-objections-60-contrast',
	'--range-hover-objections-30': '--range-objections-30-contrast',

	// Base
	'--bg-screen': '--bg-screen-contrast',
	'--bg-overlay': '--bg-overlay-contrast',

	// Buttons
	'--btn-primary': '--btn-primary-contrast',
	'--btn-secondary': '--btn-secondary-contrast',
	'--btn-tertiary': '--btn-tertiary-contrast',
	'--btn-follow-me': '--btn-follow-me-contrast',
	'--btn-fab': '--btn-fab-contrast',
	'--btn-primary-blue': '--btn-primary-blue-contrast',
	'--btn-secondary-blue': '--btn-secondary-blue-contrast',
	'--btn-tertiary-blue': '--btn-tertiary-blue-contrast',
	'--btn-tertiary-red': '--btn-tertiary-red-contrast',
	'--add-btn': '--add-btn-contrast',
	'--btn-disabled': '--btn-disabled-contrast',
	'--btn-purple-default': '--btn-purple-default-contrast',
	'--btn-purple-hover': '--btn-purple-hover-contrast',
	'--btn-purple-disable': '--btn-purple-disable-contrast',
	'--btn-purple-selected': '--btn-purple-selected-contrast',

	// accessibility buttons
	'--btn-accessibility-icons': '--btn-accessibility-icons-contrast',
	'--btn-accessibility-light-contrast': '--btn-accessibility-light-contrast-contrast',
	'--btn-accessibility-light-contrast-text': '--btn-accessibility-light-contrast-text-contrast',
	'--btn-accessibility-light-contrast-icons': '--btn-accessibility-light-contrast-icons-contrast',
	'--btn-accessibility-light-contrast-text-contrast': '--btn-accessibility-light-contrast-text',

	// Card menu
	'--card-menu': '--card-menu-contrast',
	'--card-menu-stroke': '--card-menu-stroke-contrast',
	'--menu-chosen': '--menu-chosen-contrast',
	'--added-option': '--added-option-contrast',
	'--added-question': '--added-question-contrast',
	'--drag-drop-bg': '--drag-drop-bg-contrast',

	// Emojis
	'--emoji-happy': '--emoji-happy-contrast',
	'--emoji-smiley': '--emoji-smiley-contrast',
	'--emoji-neutral': '--emoji-neutral-contrast',
	'--emoji-thinking': '--emoji-thinking-contrast',
	'--emoji-sad': '--emoji-sad-contrast',

	// group
	'--group': '--group-contrast',

	// Headers
	'--question-header': '--question-header-contrast',
	'--header-bg-color': '--header-bg-color-contrast',
	'--header-question': '--header-question-contrast',
	'--header-group': '--header-group-contrast',
	'--header-chosen': '--header-chosen-contrast',
	'--header-option-chosen': '--header-option-chosen-contrast',
	'--header-option-non-chosen': '--header-option-non-chosen-contrast',
	'--header-home': '--header-home-contrast',
	'--header-search-chips': '--header-search-chips-contrast',

	// Icons
	'--icons-white': '--icons-white-contrast',
	'--icons-blue': '--icons-blue-contrast',
	'--icons-blue-light': '--icons-blue-light-contrast',
	'--icons-red': '--icons-red-contrast',
	'--icons-green': '--icons-green-contrast',
	'--icons-disabled-outline': '--icons-disabled-outline-contrast',
	'--icons-disabled-filled': '--icons-disabled-filled-contrast',
	'--icons-disabled-dark': '--icons-disabled-dark-contrast',

	// Info
	'--info-snackbar': '--info-snackbar-contrast',
	'--info-massage-counter': '--info-massage-counter-contrast',
	'--info-tooltip': '--info-tooltip-contrast',

	// Maps
	'--map-question': '--map-question-contrast',
	'--map-option': '--map-option-contrast',
	'--map-option-chosen': '--map-option-chosen-contrast',
	'--map-option-current': '--map-option-current-contrast',
	'--map-question-current': '--map-question-current-contrast',

	// Multisteps
	'--step-vote-inactive': '--step-vote-inactive-contrast',
	'--step-vote-active': '--step-vote-active-contrast',
	'--step-evaluate-inactive': '--step-evaluate-inactive-contrast',
	'--step-evaluate-active': '--step-evaluate-active-contrast',
	'--step-explanation-inactive': '--step-explanation-inactive-contrast',
	'--step-explanation-active': '--step-explanation-active-contrast',
	'--step-option-inactive': '--step-option-inactive-contrast',
	'--step-option-active': '--step-option-active-contrast',
	'--step-top-rank-inactive': '--step-top-rank-inactive-contrast',
	'--step-top-rank-active': '--step-top-rank-active-contrast',
	'--step-joined-members-active': '--step-joined-members-active-contrast',
	'--step-summary-active': '--step-summary-active-contrast',

	// Question
	'--question': '--question-contrast',

	// Settings
	'--member-chip': '--member-chip-contrast',
	'--member-voter': '--member-voter-contrast',
	'--member-evaluators': '--member-evaluators-contrast',
	'--member-non-voter': '--member-non-voter-contrast',
	'--member-blocked': '--member-blocked-contrast',
	'--section-tab': '--section-tab-contrast',

	// Toggles
	'--toggle-blue-active': '--toggle-blue-active-contrast',
	'--toggle-green-active': '--toggle-green-active-contrast',
	'--toggle-crimson-active': '--toggle-crimson-active-contrast',
	'--toggle-inactive': '--toggle-inactive-contrast',
	'--toggle-inactive-icon': '--toggle-inactive-icon-contrast',

	// Triangle dots
	'--dot-agreement-100': '--dot-agreement-100-contrast',
	'--dot-agreement-50': '--dot-agreement-50-contrast',
	'--dot-agreement-0': '--dot-agreement-0-contrast',
	'--dot-taboo-50': '--dot-taboo-50-contrast',
	'--dot-taboo-100': '--dot-taboo-100-contrast',
	'--dot-disinterest': '--dot-disinterest-contrast',

	// Text
	'--text-body': '--text-body-contrast',
	'--text-headline': '--text-headline-contrast',
	'--text-paragraph': '--text-paragraph-contrast',
	'--text-paragraph-light': '--text-paragraph-light-contrast',
	'--text-paragraph-lightest': '--text-paragraph-lightest-contrast',
	'--text-white': '--text-white-contrast',
	'--text-blue': '--text-blue-contrast',
	'--text-green': '--text-green-contrast',
	'--text-red': '--text-red-contrast',
	'--text-caption': '--text-caption-contrast',
	'--text-crimson': '--text-crimson-contrast',
	'--text-emphasis': '--text-emphasis-contrast',
	'--text-dark-btn': '--text-dark-btn-contrast',
	'--text-light-btn': '--text-light-btn-contrast',
	'--text-disabled': '--text-disabled-contrast',
	'--text-disabled-light': '--text-disabled-light-contrast',
	'--text-disabled-digit': '--text-disabled-digit-contrast',
	'--text-triangle-taboo': '--text-triangle-taboo-contrast',

	//voting palette
	'--voting-palette-pair-1-light': '--voting-palette-pair-1-light-contrast',
	'--voting-palette-pair-1-dark': '--voting-palette-pair-1-dark-contrast',
	'--voting-palette-pair-2-light': '--voting-palette-pair-2-light-contrast',
	'--voting-palette-pair-2-dark': '--voting-palette-pair-2-dark-contrast',
	'--voting-palette-pair-3-light': '--voting-palette-pair-3-light-contrast',
	'--voting-palette-pair-3-dark': '--voting-palette-pair-3-dark-contrast',
	'--voting-palette-pair-4-light': '--voting-palette-pair-4-light-contrast',
	'--voting-palette-pair-4-dark': '--voting-palette-pair-4-dark-contrast',
	'--voting-palette-pair-5-light': '--voting-palette-pair-5-light-contrast',
	'--voting-palette-pair-5-dark': '--voting-palette-pair-5-dark-contrast',
	'--voting-palette-pair-6-light': '--voting-palette-pair-6-light-contrast',
	'--voting-palette-pair-6-dark': '--voting-palette-pair-6-dark-contrast',
	'--voting-palette-pair-7-light': '--voting-palette-pair-7-light-contrast',
	'--voting-palette-pair-7-dark': '--voting-palette-pair-7-dark-contrast',
	'--voting-palette-pair-8-light': '--voting-palette-pair-8-light-contrast',
	'--voting-palette-pair-8-dark': '--voting-palette-pair-8-dark-contrast',
	'--voting-palette-pair-9-light': '--voting-palette-pair-9-light-contrast',
	'--voting-palette-pair-9-dark': '--voting-palette-pair-9-dark-contrast',
	'--voting-palette-pair-10-light': '--voting-palette-pair-10-light-contrast',
	'--voting-palette-pair-10-dark': '--voting-palette-pair-10-dark-contrast',
	'--voting-palette-pair-11-light': '--voting-palette-pair-11-light-contrast',
	'--voting-palette-pair-11-dark': '--voting-palette-pair-11-dark-contrast',
	'--voting-palette-pair-12-light': '--voting-palette-pair-12-light-contrast',
	'--voting-palette-pair-12-dark': '--voting-palette-pair-12-dark-contrast',
	'--voting-palette-pair-13-light': '--voting-palette-pair-13-light-contrast',
	'--voting-palette-pair-13-dark': '--voting-palette-pair-13-dark-contrast',
	'--voting-palette-pair-14-light': '--voting-palette-pair-14-light-contrast',
	'--voting-palette-pair-14-dark': '--voting-palette-pair-14-dark-contrast',
	'--voting-palette-pair-15-light': '--voting-palette-pair-15-light-contrast',
	'--voting-palette-pair-15-dark': '--voting-palette-pair-15-dark-contrast',
	'--voting-palette-pair-16-light': '--voting-palette-pair-16-light-contrast',
	'--voting-palette-pair-16-dark': '--voting-palette-pair-16-dark-contrast',
	'--voting-palette-pair-17-light': '--voting-palette-pair-17-light-contrast',
	'--voting-palette-pair-17-dark': '--voting-palette-pair-17-dark-contrast',
	'--voting-palette-pair-18-light': '--voting-palette-pair-18-light-contrast',
	'--voting-palette-pair-18-dark': '--voting-palette-pair-18-dark-contrast',
	'--voting-palette-pair-19-light': '--voting-palette-pair-19-light-contrast',
	'--voting-palette-pair-19-dark': '--voting-palette-pair-19-dark-contrast',
};
