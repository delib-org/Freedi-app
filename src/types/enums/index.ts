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
	singleStep = 'single-step',
	multipleSteps = 'multiple-steps',
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
	inAppNotifications = 'inAppNotifications',
	statementsMetaData = 'statementsMeta',
	statementsPasswords = 'statementsPasswords',
	statementsSubscribe = 'statementsSubscribe',
	statementsNotifications = 'statementsNotifications',
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
}

export enum StageType {
	explanation = 'explanation',
	questions = 'questions',
	needs = 'needs',
	suggestions = 'suggestions',
	hypothesis = 'hypothesis',
	voting = 'voting',
	conclusion = 'conclusion',
	summary = 'summary',
	other = 'other',
}
