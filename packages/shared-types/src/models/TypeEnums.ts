export enum StatementType {
	statement = 'statement',
	option = 'option',
	question = 'question',
	document = 'document',
	group = 'group',
	comment = 'comment',
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
	/**
	 * Completely unrestricted access - users can join instantly without 
	 * providing any information, authentication, or approval
	 */
	public = 'public',

	/**
	 * @deprecated Will be removed in June 2025. Use 'openToAll' instead.
	 * Legacy permission level maintained for backward compatibility
	 */
	open = 'open',

	/**
	 * Open to everyone including anonymous users - no authentication required
	 * but users may need to provide basic information (e.g., display name)
	 */
	openToAll = 'openToAll',

	/**
	 * Requires user authentication - only logged-in users can join
	 * No admin approval needed after authentication
	 */
	openForRegistered = 'openForRegistered',

	/**
	 * Requires admin approval - authenticated users can request to join
	 * but must be explicitly approved by an administrator
	 */
	moderated = 'moderated',

	/**
	 * Invitation-only - users cannot request access and must be 
	 * directly invited by an administrator to join
	 */
	secret = 'secret',
}

export enum membersAllowed {
	all = 'all',
	nonAnonymous = 'nonAnonymous',
}

export enum QuestionType {
	simple = 'simple',
	massConsensus = 'mass-consensus',
	multiStage = 'multi-stage',
	questionnaire = 'questionnaire',
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

export enum Screen {
	team = 'team',
	doc = 'doc',
	home = 'home',
	statement = 'statement',
	chat = 'chat',
	options = 'options',
	settings = 'settings',
	mindMap = 'mind-map',
	agreementMap = 'agreement-map',
	polarizationIndex = 'polarization-index',
}

export enum SortType {
	newest = 'newest',
	mostUpdated = 'mostUpdated',
	random = 'random',
	accepted = 'accepted',
	backendOrder = 'backend-order',
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
