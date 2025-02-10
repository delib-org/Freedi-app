export enum StatementType {
	statement = 'statement',
	option = 'option',
	question = 'question',
	document = 'document',
	group = 'group',
	stage = 'stage',
}

export enum DeliberativeElement {
	explanation = 'explanation',
	needs = 'needs',
	resource = 'resource',
	consideration = 'consideration',
	research = 'research',
	option = 'option',
	general = 'general',
}

export enum QuestionStage {
	explanation = 'explanation',
	suggestion = 'suggestion',
	firstEvaluation = 'firstEvaluation',
	secondEvaluation = 'secondEvaluation',
	voting = 'voting',
	finished = 'finished',
}

export enum Access {
	open = 'open',
	close = 'close',
}

export enum membersAllowed {
	all = 'all',
	nonAnonymous = 'nonAnonymous',
}

export enum QuestionType {
	singleStep = 'single-step', //deprecated
	multipleSteps = 'multiple-steps', //deprecated
	massConsensus = 'mass-consensus',
	multiStage = 'multi-stage',
}

export enum QuestionStagesType {
	singleStage = 'singleStage',
	document = 'document',
}

export enum DocumentType {
	paragraph = 'paragraph',
	section = 'section',
	comment = 'comment',
}

export enum DeliberationType {
	chat = 'chat',
	options = 'options',
	voting = 'voting',
}

export enum StepType {
	chat = 'chat',
	options = 'options',
	addOptions = 'addOptions',
	randomOptions = 'randomOptions',
	topOptions = 'topOptions',
	voting = 'voting',
}

/** All delib's collections */
export enum Collections {
	statements = 'statements',
	statementsSettings = 'statementsSettings',
	statementsMetaData = 'statementsMeta',
	statementsPasswords = 'statementsPasswords',
	statementsSubscribe = 'statementsSubscribe',
	massConsensus = 'massConsensus',
	choseBy = 'choseBy',
	participants = 'participants',
	rooms = 'rooms',
	roomsSettings = 'roomsSettings',
	evaluations = 'evaluations',
	votes = 'votes',
	users = 'usersV2',
	usersData = 'usersData',
	usersSettings = 'usersSettings',
	resultsTriggers = 'resultsTriggers',
	results = 'results',
	maps = 'maps',
	agreements = 'agreements',
	timers = 'timers-settings',
	timersRooms = 'timers-rooms',
	invitations = 'invitations',
	evaluators = 'evaluators',
	documents = 'documents',
	importance = 'importance',
	approval = 'approval',
	awaitingUsers = 'awaitingUsers',
	agrees = 'agrees',
	documentsSigns = 'documentsSigns',
	signatures = 'signatures',
	stages = 'stages',
	steps = 'steps',
	signUsers = 'signUsers',
	statementViews = 'statementViews',
	statementSegments = 'statementSegments',
	inAppNotifications = 'inAppNotifications',
}

export enum Screen {
	TEAM = 'team',
	DOC = 'doc',
	HOME = 'home',
	STATEMENT = 'statement',
	CHAT = 'chat',
	OPTIONS = 'options',
	VOTE = 'vote',
	GROUPS = 'groups',
	SETTINGS = 'settings',
	MASS_QUESTIONS = 'mass-questions',
	QUESTIONS_MASS = 'questions-mass',
	OPTIONS_CONSENSUS = 'options-consensus',
	OPTIONS_NEW = 'options-new',
	OPTIONS_RANDOM = 'options-random',
	OPTIONS_UPDATED = 'options-updated',
	VOTES_CONSENSUS = 'votes-consensus',
	VOTESֹֹֹ_VOTED = 'votes-voted',
	VOTES_NEW = 'votes-new',
	VOTES_RANDOM = 'votes-random',
	VOTES_UPDATED = 'votes-updated',
	ADMIN_CHOOSE = 'admin-choose',
	ADMIN_DIVIDE = 'admin-divide',
	QUESTIONS = 'questions',
	QUESTIONS_NEW = 'questions-new',
	QUESTIONS_RANDOM = 'questions-random',
	QUESTIONS_UPDATED = 'questions-updated',
	QUESTIONS_CONSENSUS = 'questions-consensus',
	INFO = 'info',
	PROCESS = 'process',
	EXPLANATION = 'explanation',
}

export enum SortType {
	newest = 'newest',
	mostUpdated = 'mostUpdated',
	random = 'random',
	accepted = 'accepted',
}

export enum MassConsensusPageUrls {
	introduction = "introduction",
	initialQuestion = "initial-question",
	similarSuggestions = "similar-suggestions",
	randomSuggestions = "random-suggestions",
	topSuggestions = "top-suggestions",
	voting = "voting",
	leaveFeedback = "leave-feedback",
}

export enum QuestionStep {
	explanation = 'explanation',
	suggestion = 'suggestion',
	randomEvaluation = 'random-evaluation',
	topEvaluation = 'top-evaluation',
	voting = 'voting',
	finished = 'finished',
	other = 'other',
}
