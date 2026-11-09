// English UI strings for Tables. Labels follow docs/ia/shared-table-assignment.md section 3.

const en: Record<string, string> = {
	'tableAssignment.app': 'Tables',
	'tableAssignment.session': 'Table assignment',
	'tableAssignment.host': 'Host',
	'tableAssignment.topic': 'Topic',
	'tableAssignment.table': 'Table',
	'tableAssignment.participants': 'Registered participants',
	'tableAssignment.preferences': 'My preferences',
	'tableAssignment.position': 'My position',
	'tableAssignment.position.unknown': 'Not specified',
	'tableAssignment.preview': 'Assignment preview',
	'tableAssignment.published': 'Published assignment',
	'tableAssignment.myTable': 'My table',
	'tableAssignment.mode.direct': 'Choose a table',
	'tableAssignment.mode.ranked': 'Rank topics',
	'tableAssignment.screen.hostList': 'My table assignments',
	'tableAssignment.screen.hostHome': 'Host home',
	'tableAssignment.screen.topics': 'Topics',
	'tableAssignment.screen.topic': 'Topic',
	'tableAssignment.screen.settings': 'Settings',
	'tableAssignment.screen.participants': 'Registered participants',
	'tableAssignment.screen.preview': 'Assignment preview',
	'tableAssignment.screen.assignment': 'Published assignment',
	'tableAssignment.screen.participantHome': 'Participant home',
	'tableAssignment.screen.preferences': 'My preferences',
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
	'tableAssignment.count.withPosition': 'With a position',
	'tableAssignment.count.notSpecified': 'Not specified',

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

	'tableAssignment.back.toTopics': 'Back to the topics',
	'tableAssignment.field.fullName': 'Full name',
	'tableAssignment.field.fullName.hint':
		'Your full name as it will appear on the table list. No password needed.',
	'tableAssignment.home.registerTitle': 'Register',
	'tableAssignment.home.register': 'Register',
	'tableAssignment.home.registeredAs': 'You are registered as {{name}}.',
	'tableAssignment.stage.notOpen': 'Registration has not opened yet. Please come back later.',
	'tableAssignment.stage.closedNotRegistered': 'Registration is closed.',
	'tableAssignment.stage.ended': 'This table assignment has ended.',
	'tableAssignment.stage.act.ranked': 'Rank topics',
	'tableAssignment.stage.act.ranked.hint':
		'Pick up to three topics in order. The make-up of the tables comes before preferences, so you may be seated outside your three choices.',
	'tableAssignment.stage.act.ranked.button': 'Rank topics',
	'tableAssignment.stage.act.direct': 'Choose a table',
	'tableAssignment.stage.act.direct.hint': 'Pick a table that has room. Your seat is kept at once.',
	'tableAssignment.stage.act.direct.button': 'Choose a table',
	'tableAssignment.stage.prefsSaved':
		'Your preferences are saved. You can edit them until registration closes.',
	'tableAssignment.stage.prefsMissing': 'You have not ranked yet.',
	'tableAssignment.stage.waiting': 'Waiting for the assignment',
	'tableAssignment.stage.waiting.hint':
		'Registration is closed and the assignment will be published soon.',
	'tableAssignment.stage.seeMyTable': 'Go to my table',
	'tableAssignment.stage.readTopics': 'Read the topics',
	'tableAssignment.topics.search': 'Search topics',
	'tableAssignment.topics.noMatch': 'No matching topics.',
	'tableAssignment.topics.notOpen': 'The topics have not opened yet.',
	'tableAssignment.topic.consensusMeaning':
		'The number describes the proposal itself, not a personal score.',
	'tableAssignment.topic.noDescription': 'This topic has no explanation yet.',
	'tableAssignment.topic.unavailable': 'This topic is not available.',
	'tableAssignment.preferences.pickTitle': 'Rank {{count}} topics',
	'tableAssignment.preferences.pickHint':
		'Tap a topic to add it to your ranking, tap again to remove it. The number is your order of preference.',
	'tableAssignment.preferences.outsideChoices':
		'Please note: you may be seated at a topic you did not choose, so that every table is balanced and everyone has a seat.',
	'tableAssignment.preferences.closed': 'Registration is closed, so nothing can be changed.',
	'tableAssignment.preferences.myOrder': 'My order',
	'tableAssignment.preferences.rankedAs': 'Rank {{rank}}',
	'tableAssignment.preferences.remove': 'Remove from my ranking',
	'tableAssignment.preferences.save': 'Save my preferences',
	'tableAssignment.preferences.saved': 'Your preferences are saved. Waiting for the assignment.',
	'tableAssignment.preferences.keptLocally':
		'Your choices are kept on this device. You can press save again.',
	'tableAssignment.preferences.notRegistered': 'Register first to rank topics.',
	'tableAssignment.position.optionalHint':
		'Optional. If you do not choose, your position stays "Not specified".',
	'tableAssignment.direct.sit': 'Sit here',
	'tableAssignment.direct.free': '{{count}} seats free',
	'tableAssignment.direct.full': 'This table is full',
	'tableAssignment.direct.yours': 'Your table',
	'tableAssignment.direct.seatsUnknown':
		'Free seats are checked on the server: if a table is full you will be told.',
	'tableAssignment.myTable.numberLabel': 'Table number',
	'tableAssignment.myTable.topic': 'Topic: {{topic}}',
	'tableAssignment.myTable.version': 'Version of {{date}}',
	'tableAssignment.myTable.waiting':
		'Waiting for the assignment to be published. Your table will show here once it is.',
	'tableAssignment.myTable.notRegistered': 'Register to see your table.',
	'tableAssignment.myTable.notSeated': 'No table was found for you in the published assignment.',
	'tableAssignment.myTable.chooseFirst': 'You have not chosen a table yet.',
	'tableAssignment.myTable.outsideChoices':
		'You were seated at a topic you did not rank. This keeps the tables balanced.',
	'tableAssignment.error.tableFull': 'That table just filled up. You can choose another table.',
	'tableAssignment.error.preferencesClosed': 'Registration has closed, so this cannot be saved.',
	'tableAssignment.error.registrationClosed': 'Registration is not open.',
};

export default en;
