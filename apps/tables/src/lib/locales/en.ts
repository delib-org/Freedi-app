// English UI strings for Tables. Labels follow docs/ia/shared-table-assignment.md section 3.

const en: Record<string, string> = {
	'tableAssignment.app': 'Tables',
	'tableAssignment.session': 'Table assignment',
	'tableAssignment.host': 'Host',
	'tableAssignment.topic': 'Topic',
	'tableAssignment.table': 'Table',
	'tableAssignment.participants': 'Registered participants',
	'tableAssignment.position': 'My position',
	'tableAssignment.position.unknown': 'Prefer not to answer',
	'tableAssignment.preview': 'Assignment preview',
	'tableAssignment.published': 'Published assignment',
	'tableAssignment.myTable': 'My table',
	'tableAssignment.mode.direct': 'Choose a table',
	'tableAssignment.mode.ranked': 'Rank topics',
	'tableAssignment.screen.hostList': 'My table assignments',
	'tableAssignment.screen.hostHome': 'Host home',
	'tableAssignment.screen.topics': 'Topics',
	'tableAssignment.screen.settings': 'Settings',
	'tableAssignment.screen.participants': 'Registered participants',
	'tableAssignment.screen.preview': 'Assignment preview',
	'tableAssignment.screen.assignment': 'Published assignment',
	'tableAssignment.screen.myTable': 'My table',
	'tableAssignment.placeholder.soon': 'This screen is under construction',
	'tableAssignment.signIn.google': 'Sign in with Google',

	'tableAssignment.back': 'Back',
	'tableAssignment.back.toHome': 'Back to the table assignment',
	'tableAssignment.back.toList': 'Back to my table assignments',
	'tableAssignment.language': 'Language',
	'tableAssignment.retry': 'Try again',
	'tableAssignment.cancel': 'Cancel',
	'tableAssignment.saving': 'Saving…',
	'tableAssignment.saved': 'Saved',
	'tableAssignment.create': 'Create',
	'tableAssignment.composition': 'Table composition',

	'tableAssignment.status.draft': 'Draft',
	'tableAssignment.status.registrationOpen': 'Registration open',
	'tableAssignment.status.registrationClosed': 'Registration closed',
	'tableAssignment.status.published': 'Assignment published',
	'tableAssignment.status.ended': 'Ended',

	'tableAssignment.state.loading': 'Loading…',
	'tableAssignment.state.error': 'Something went wrong while loading.',
	'tableAssignment.state.denied': 'You do not have permission to see this screen.',
	'tableAssignment.state.empty': 'Nothing here yet.',
	'tableAssignment.state.notFound': 'This table assignment was not found.',
	'tableAssignment.state.notHost': 'Only the host of this table assignment can manage it.',

	'tableAssignment.host.signInIntro':
		'Sign in with your Google account to create and manage table assignments.',
	'tableAssignment.host.signInFailed': 'Sign-in did not work. You can try again.',

	'tableAssignment.list.empty': 'You have no table assignments yet.',
	'tableAssignment.list.createFirst': 'Create your first table assignment',
	'tableAssignment.list.create': 'New table assignment',

	'tableAssignment.field.title': 'Name of the table assignment',
	'tableAssignment.field.mode': 'How people choose',
	'tableAssignment.field.topicTitle': 'Topic title',
	'tableAssignment.field.description': 'Explanation',
	'tableAssignment.field.maxTables': 'Most tables for this topic (optional)',
	'tableAssignment.field.maxTables.hint':
		'You can leave it empty. When people choose a table, empty means one table for the topic.',
	'tableAssignment.field.tableSize': 'Seats per table',
	'tableAssignment.field.balanceTolerance': 'How strictly each table must mirror the whole crowd',
	'tableAssignment.field.positionLabel': 'Position question',
	'tableAssignment.field.poleA': 'First pole',
	'tableAssignment.field.poleB': 'Second pole',

	'tableAssignment.mode.direct.hint':
		'Each participant picks a table and the seat is kept at once. Mixed tables cannot be guaranteed.',
	'tableAssignment.mode.ranked.hint':
		'Each participant ranks up to three topics and the system seats everyone so every table mirrors the crowd.',

	'tableAssignment.home.next': 'Next step',
	'tableAssignment.home.participantLink': 'Link for participants',
	'tableAssignment.home.participantLinkHint':
		'Send the link or show the QR code. The link carries only the id of the table assignment.',
	'tableAssignment.home.sections': 'Screens of this table assignment',

	'tableAssignment.count.topics': 'Topics',
	'tableAssignment.count.registered': 'Registered',
	'tableAssignment.count.withPreferences': 'With preferences',

	'tableAssignment.next.addTopics': 'Add the topics people will discuss.',
	'tableAssignment.next.addTopics.button': 'Add topics',
	'tableAssignment.next.openRegistration': 'The topics are ready. You can open registration.',
	'tableAssignment.next.openRegistration.button': 'Open registration',
	'tableAssignment.next.closeRegistration':
		'Registration is open. Close it when everyone has registered.',
	'tableAssignment.next.closeRegistration.button': 'Close registration',
	'tableAssignment.next.preview': 'Registration is closed. Compute an assignment and check it.',
	'tableAssignment.next.preview.button': 'Go to the preview',
	'tableAssignment.next.endSession':
		'Tables fill as participants choose. End the table assignment when you are done.',
	'tableAssignment.next.endSession.button': 'End the table assignment',
	'tableAssignment.next.viewAssignment': 'The assignment is published.',
	'tableAssignment.next.viewAssignment.button': 'See the published assignment',
	'tableAssignment.next.done': 'This table assignment has ended.',
	'tableAssignment.next.done.button': 'Ended',

	'tableAssignment.control.registrationOpen': 'Open registration',
	'tableAssignment.control.registrationClosed': 'Close registration',
	'tableAssignment.control.ended': 'End the table assignment',

	'tableAssignment.participants.controls': 'Registration status',
	'tableAssignment.participants.privacy':
		'The host sees only counts and names. Positions and preferences are never shown person by person.',
	'tableAssignment.participants.empty': 'Nobody has registered yet. Send the link.',
	'tableAssignment.participants.search': 'Search by name',

	'tableAssignment.topics.empty': 'No topics yet. Add them by hand or import chosen proposals.',
	'tableAssignment.topics.locked': 'Registration has opened, so the topic list is locked.',
	'tableAssignment.topics.save': 'Save topics',
	'tableAssignment.topics.unsaved': 'You have changes that are not saved.',

	'tableAssignment.topic.add': 'Add a topic',
	'tableAssignment.topic.edit': 'Edit',
	'tableAssignment.topic.delete': 'Delete',
	'tableAssignment.topic.keep': 'Done',
	'tableAssignment.topic.moveUp': 'Move up',
	'tableAssignment.topic.moveDown': 'Move down',
	'tableAssignment.topic.consensus': 'Consensus {{value}}',
	'tableAssignment.topic.maxTablesBadge': 'Up to {{count}} tables',
	'tableAssignment.topic.unknown': 'Unknown topic',
	'tableAssignment.topic.error.titleRequired': 'A title is missing.',
	'tableAssignment.topic.error.titleTooLong': 'The title is too long.',
	'tableAssignment.topic.error.descriptionTooLong': 'The explanation is too long.',
	'tableAssignment.topic.error.maxTablesInvalid':
		'The number of tables must be a positive whole number.',

	'tableAssignment.import.title': 'Import chosen proposals',
	'tableAssignment.import.hint':
		'Paste the id of a question. Its chosen options are imported with title, explanation and consensus.',
	'tableAssignment.import.statementId': 'Question id',
	'tableAssignment.import.button': 'Import',
	'tableAssignment.import.reading': 'Reading…',
	'tableAssignment.import.done': '{{count}} topics were added to the list. Remember to save.',
	'tableAssignment.import.empty': 'This question has no chosen options.',
	'tableAssignment.import.denied': 'You do not have permission to read this question.',
	'tableAssignment.import.failed': 'The import did not work. You can try again.',

	'tableAssignment.settings.mode': 'How people choose',
	'tableAssignment.settings.modeFixed':
		'This is set when the table assignment is created and cannot be changed later.',
	'tableAssignment.settings.tables': 'Tables',
	'tableAssignment.settings.toleranceHelp':
		'Every table should look like the whole crowd. A small number is strict: the table must be very close to the crowd. A larger number is looser. 0.3 suits most cases.',
	'tableAssignment.settings.directNoBalance':
		'When people choose a table there is no balancing: everyone picks for themselves.',
	'tableAssignment.settings.positionTitle': 'Position question (optional)',
	'tableAssignment.settings.positionOn': 'Ask registrants for their position',
	'tableAssignment.settings.positionHelp':
		'A position is one axis from 0 to 100 between two poles. Someone who does not answer stays "Not specified", never the middle.',
	'tableAssignment.settings.preview': 'This is how participants will see it',
	'tableAssignment.settings.save': 'Save settings',
	'tableAssignment.settings.invalid': 'This value is not valid.',
	'tableAssignment.settings.tableSizeInvalid': 'A whole number from {{min}} to {{max}}.',

	'tableAssignment.position.nearA': 'Close to {{a}}',
	'tableAssignment.position.nearB': 'Close to {{b}}',
	'tableAssignment.position.between': 'Between {{a}} and {{b}}',
	'tableAssignment.position.clear': 'Do not specify',
	'tableAssignment.position.aria': 'Position between {{a}} and {{b}}',

	'tableAssignment.preview.compute': 'Compute',
	'tableAssignment.preview.recompute': 'Compute again',
	'tableAssignment.preview.computing': 'Computing…',
	'tableAssignment.preview.empty': 'No assignment has been computed yet.',
	'tableAssignment.preview.closeFirst': 'Close registration first, then compute.',
	'tableAssignment.preview.stale':
		'The input changed since this draft was computed. Compute again before publishing.',
	'tableAssignment.preview.publish': 'Publish the assignment',
	'tableAssignment.preview.alreadyPublished': 'This assignment is already published.',
	'tableAssignment.preview.directLive':
		'When people choose a table there is no preview. These are the tables as they fill now.',

	'tableAssignment.assignment.empty': 'The assignment has not been published yet.',
	'tableAssignment.assignment.version': 'Version of {{date}}',
	'tableAssignment.assignment.print': 'Print',
	'tableAssignment.assignment.directLive': 'The tables as participants have chosen so far.',

	'tableAssignment.metrics.choices': 'How the choices were met',
	'tableAssignment.metrics.rank': 'Choice number {{rank}}',
	'tableAssignment.metrics.outside': 'Outside their choices',
	'tableAssignment.metrics.noPreference': 'Without preferences',
	'tableAssignment.metrics.balanceMax': 'Largest deviation of a table from the crowd',
	'tableAssignment.metrics.balanceMean': 'Average deviation',
	'tableAssignment.metrics.tolerance': 'Tolerance you set',
	'tableAssignment.metrics.within': 'The composition is within the tolerance.',
	'tableAssignment.metrics.outsideTolerance':
		'The composition is outside the tolerance. This is the best assignment that was found.',
	'tableAssignment.balance.explain':
		'Every table should look like the whole crowd. The deviation measures how far a table is from that, and the tolerance is the limit you set.',

	'tableAssignment.table.number': 'Table {{number}}',
	'tableAssignment.table.size': 'Participants: {{count}}',
	'tableAssignment.table.sizeOf': '{{count}} of {{capacity}}',
	'tableAssignment.table.empty': 'This table is empty.',
	'tableAssignment.member.unknown': 'Participant',

	'tableAssignment.link.label': 'Link',
	'tableAssignment.link.copy': 'Copy the link',
	'tableAssignment.link.copied': 'Copied',
	'tableAssignment.link.copyFailed': 'Copying did not work. Select the link and copy it by hand.',
	'tableAssignment.link.qrAlt': 'QR code of the participant link',

	'tableAssignment.error.generic': 'Something went wrong. You can try again.',
	'tableAssignment.error.network': 'Network problem. You can try again.',
	'tableAssignment.error.noPermission': 'You do not have permission to do this.',
	'tableAssignment.error.notFound': 'Not found.',
	'tableAssignment.error.invalid': 'The data is not valid.',
	'tableAssignment.error.statusRefused': 'The registration status cannot be changed right now.',
	'tableAssignment.error.topicsLocked':
		'Registration has already opened, so topics can no longer change.',
	'tableAssignment.error.computeRefused':
		'Cannot compute right now. Check that registration is closed and that there are topics and registrants.',
	'tableAssignment.error.publishStale': 'The input changed since the computation. Compute again.',

	'tableAssignment.stage.closedNotRegistered': 'Registration is closed.',
	'tableAssignment.stage.ended': 'This table assignment has ended.',
	'tableAssignment.stage.act.direct.button': 'Choose a table',
	'tableAssignment.stage.seeMyTable': 'Go to my table',
	'tableAssignment.topics.search': 'Search topics',
	'tableAssignment.topics.notOpen': 'The topics have not opened yet.',
	'tableAssignment.direct.sit': 'Sit here',
	'tableAssignment.direct.free': '{{count}} seats free',
	'tableAssignment.direct.full': 'This table is full',
	'tableAssignment.direct.yours': 'Your table',
	'tableAssignment.direct.seatsUnknown':
		'Free seats are checked on the server: if a table is full you will be told.',
	'tableAssignment.myTable.waiting':
		'Waiting for the assignment to be published. Your table will show here once it is.',
	'tableAssignment.myTable.notSeated':
		'No table was found for you in the published assignment. Talk to the host.',
	'tableAssignment.myTable.chooseFirst': 'You have not chosen a table yet.',
	'tableAssignment.error.tableFull': 'That table just filled up. You can choose another table.',
	'tableAssignment.error.preferencesClosed': 'Registration has closed, so this cannot be saved.',
	'tableAssignment.error.registrationClosed': 'Registration is not open.',
	'tableAssignment.rank': 'Rank topics',
	'tableAssignment.chooseTable': 'Choose a table',
	'tableAssignment.editDetails': 'Edit my details',
	'tableAssignment.cancelParticipation': 'Cancel participation',
	'tableAssignment.continue': 'Continue',
	'tableAssignment.save': 'Save',
	'tableAssignment.steps.label': 'Step {{current}} of {{total}}',
	'tableAssignment.a11y.title': 'Accessibility',
	'tableAssignment.a11y.close': 'Close',
	'tableAssignment.a11y.theme': 'Colour theme',
	'tableAssignment.a11y.theme.system': 'Device',
	'tableAssignment.a11y.theme.light': 'Light',
	'tableAssignment.a11y.theme.dark': 'Dark',
	'tableAssignment.a11y.contrast': 'High contrast',
	'tableAssignment.a11y.textSize': 'Text size',
	'tableAssignment.a11y.smaller': 'Smaller text',
	'tableAssignment.a11y.larger': 'Larger text',
	'tableAssignment.a11y.smallerMark': 'A−',
	'tableAssignment.a11y.largerMark': 'A+',
	'tableAssignment.a11y.reset': 'Reset',
	'tableAssignment.home.count.one': '1 person is already here',
	'tableAssignment.home.count.two': '{{count}} people are already here',
	'tableAssignment.home.count.few': '{{count}} people are already here',
	'tableAssignment.home.count.many': '{{count}} people are already here',
	'tableAssignment.home.count.other': '{{count}} people are already here',
	'tableAssignment.home.intro.ranked':
		'Today we will sit at small tables. Each table will be a small picture of the whole room, so that we also hear people who think differently.',
	'tableAssignment.home.intro.direct':
		'Today we will sit at small tables. Choose a table and your seat is held at once.',
	'tableAssignment.home.fullName': 'Your full name',
	'tableAssignment.home.fullName.hint': 'No password and no account.',
	'tableAssignment.home.start': "Let's start",
	'tableAssignment.home.stepsHint.2': 'Two short steps, about a minute',
	'tableAssignment.home.stepsHint.3': 'Three short steps, about a minute',
	'tableAssignment.notOpen.title': 'Registration has not opened yet',
	'tableAssignment.notOpen.thanks':
		'Thanks for coming early. The host will open registration soon.',
	'tableAssignment.notOpen.keepOpen':
		'You can leave this page open and it will update by itself. You can also close it and come back with the same link.',
	'tableAssignment.rank.title': 'What would you most like to talk about?',
	'tableAssignment.rank.lead': 'Tap up to three topics. What you pick rises to the top, in order.',
	'tableAssignment.rank.hint.0': 'You can pick up to three.',
	'tableAssignment.rank.hint.1': 'You can add two more.',
	'tableAssignment.rank.hint.2': 'You can add one more. To change the order, drag the handle.',
	'tableAssignment.rank.hint.3':
		'To change the order, drag the handle. To replace a topic, tap it.',
	'tableAssignment.rank.handle': 'Change the place of {{topic}}. Drag it, or use the arrow keys.',
	'tableAssignment.rank.note':
		'We will try to seat you at a topic you picked. Sometimes you will sit at another topic, so that each table stays a small picture of the whole room.',
	'tableAssignment.rank.pickOne': 'Pick at least one topic',
	'tableAssignment.rank.explain': 'About {{topic}}',
	'tableAssignment.rank.place': 'Place {{place}}',
	'tableAssignment.rank.moved': '{{topic}} is now in place {{place}}. The order: {{order}}.',
	'tableAssignment.choices.keptLocally':
		'Your choices are kept on this device. You can press save again.',
	'tableAssignment.position.eyebrow': 'Last question',
	'tableAssignment.position.why':
		'This lets us build tables that include people who think differently.',
	'tableAssignment.position.privacy':
		'Your answer is private. It will not be shown to anyone, not to the host and not to the people at your table.',
	'tableAssignment.position.leaning': 'Leaning toward: {{pole}}',
	'tableAssignment.position.middle': 'Between the two sides',
	'tableAssignment.position.chosen': 'You chose: {{label}}',
	'tableAssignment.position.declined': 'That is fine. You will get a table anyway.',
	'tableAssignment.position.pickOne': 'Choose an answer to save',
	'tableAssignment.waiting.title': 'Saved. Thank you, {{name}}',
	'tableAssignment.waiting.registeredTitle': 'You are registered. Thank you, {{name}}',
	'tableAssignment.waiting.lead':
		'You can close this page and come back with the link. Your table will appear here.',
	'tableAssignment.waiting.details': 'Your details',
	'tableAssignment.waiting.positionAnswered': 'Position question: answered',
	'tableAssignment.waiting.positionDeclined': 'Position question: you preferred not to answer',
	'tableAssignment.waiting.next': 'What happens now',
	'tableAssignment.waiting.step.registered': 'You registered',
	'tableAssignment.waiting.step.closing': 'The host closes registration',
	'tableAssignment.waiting.step.closed': 'Registration has closed',
	'tableAssignment.waiting.step.published': 'The tables are published',
	'tableAssignment.waiting.closedNote':
		'Registration has closed, so details can no longer be changed. To cancel your participation, talk to the host.',
	'tableAssignment.waiting.unfinished.title': 'Almost done, {{name}}',
	'tableAssignment.waiting.unfinished.lead.ranked':
		'All that is left is to pick what you would like to talk about.',
	'tableAssignment.waiting.unfinished.lead.direct': 'All that is left is to choose a table.',
	'tableAssignment.waiting.unfinished.button.ranked': 'Rank the topics',
	'tableAssignment.waiting.unfinished.button.direct': 'Choose a table',
	'tableAssignment.cancel.title': 'Cancel your participation?',
	'tableAssignment.cancel.body':
		'Your details and choices will be deleted, and you will not get a table. You can register again as long as registration is open.',
	'tableAssignment.cancel.stay': 'No, stay registered',
	'tableAssignment.cancel.confirm': 'Yes, cancel',
	'tableAssignment.cancel.claimed':
		'A registration continued by full name cannot be cancelled. Talk to the host.',
	'tableAssignment.cancelled.title': 'Your participation was cancelled',
	'tableAssignment.cancelled.body':
		'Your details and choices were deleted. Change of plans? You can register again as long as registration is open.',
	'tableAssignment.cancelled.again': 'Register again',
	'tableAssignment.returnByName.title':
		'Someone named {{name}} has already registered. Is that you?',
	'tableAssignment.returnByName.body':
		'If that is you, you will answer again and the new answers will replace the old ones. The old answers will not be shown, to protect privacy.',
	'tableAssignment.returnByName.yes': 'Yes, that is me',
	'tableAssignment.returnByName.no': 'No, I am someone else',
	'tableAssignment.myTable.me': 'Me',
	'tableAssignment.myTable.aria': 'Table number {{number}}',
	'tableAssignment.myTable.pill.1': 'Your first choice',
	'tableAssignment.myTable.pill.2': 'Your second choice',
	'tableAssignment.myTable.pill.3': 'Your third choice',
	'tableAssignment.myTable.pill.outside': 'A topic you did not pick',
	'tableAssignment.myTable.outsideNote':
		'This time it was not a topic you picked. Your seat here helps the table be a picture of the whole room. Thank you for being flexible.',
	'tableAssignment.myTable.mates': 'Sitting with you',
	'tableAssignment.myTable.chooseAnother': 'Choose another table',
};

export default en;
