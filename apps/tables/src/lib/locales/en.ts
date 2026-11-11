// English UI strings for Tables. Labels follow docs/ia/shared-table-assignment.md section 3.

const en: Record<string, string> = {
	'tableAssignment.app': 'Tables',
	'tableAssignment.session': 'Table assignment',
	'tableAssignment.table': 'Table',
	'tableAssignment.position': 'My position',
	'tableAssignment.position.unknown': 'Prefer not to answer',
	'tableAssignment.myTable': 'My table',
	'tableAssignment.mode.direct': 'Sit where you like',
	'tableAssignment.mode.ranked': 'Mix',
	'tableAssignment.screen.hostList': 'My table assignments',
	'tableAssignment.screen.participants': 'Registered participants',
	'tableAssignment.screen.preview': 'Assignment preview',
	'tableAssignment.screen.assignment': 'Published assignment',
	'tableAssignment.screen.myTable': 'My table',
	'tableAssignment.placeholder.soon': 'This screen is under construction',
	'tableAssignment.signIn.google': 'Sign in with Google',
	'tableAssignment.signOut': 'Sign out',

	'tableAssignment.back': 'Back',
	'tableAssignment.back.toList': 'Back to my table assignments',
	'tableAssignment.language': 'Language',
	'tableAssignment.retry': 'Try again',
	'tableAssignment.cancel': 'Cancel',
	'tableAssignment.saving': 'Saving…',

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
	'tableAssignment.list.create': 'New assignment',

	'tableAssignment.mode.direct.hint':
		'Everyone picks a table themselves, and whoever comes first takes the seat.',
	'tableAssignment.mode.ranked.hint':
		'People rank topics, and the system builds tables that are each a small picture of the room.',

	'tableAssignment.count.topics': 'Topics',
	'tableAssignment.count.registered': 'Registered',
	'tableAssignment.count.withPreferences': 'Ranked topics',

	'tableAssignment.control.registrationClosed': 'Close registration',
	'tableAssignment.control.ended': 'End the table assignment',

	'tableAssignment.participants.privacy':
		"Only names and counts are shown here. People's positions and choices are not.",
	'tableAssignment.participants.empty': 'Nobody has registered yet. Send the link.',
	'tableAssignment.participants.search': 'Search by name',

	'tableAssignment.topics.empty': 'No topics yet. Add them by hand or import chosen proposals.',

	'tableAssignment.topic.unknown': 'Unknown topic',

	'tableAssignment.import.hint':
		'Paste the id of a question. Its chosen options are imported with title, explanation and consensus.',
	'tableAssignment.import.statementId': 'Question id',
	'tableAssignment.import.button': 'Import',
	'tableAssignment.import.reading': 'Reading…',
	'tableAssignment.import.done': '{{count}} topics were added to the list.',
	'tableAssignment.import.empty': 'This question has no chosen options.',
	'tableAssignment.import.denied': 'You do not have permission to read this question.',
	'tableAssignment.import.failed': 'The import did not work. You can try again.',

	'tableAssignment.preview.compute': 'Compute',
	'tableAssignment.preview.recompute': 'Compute again',
	'tableAssignment.preview.computing': 'Computing…',
	'tableAssignment.preview.empty': 'No assignment has been computed yet.',
	'tableAssignment.preview.closeFirst': 'Close registration first, then compute.',
	'tableAssignment.preview.publish': 'Publish the assignment',
	'tableAssignment.preview.alreadyPublished': 'This assignment is already published.',
	'tableAssignment.preview.directLive':
		'When people choose a table there is no preview. These are the tables as they fill now.',

	'tableAssignment.assignment.empty': 'The assignment has not been published yet.',
	'tableAssignment.assignment.version': 'Version of {{date}}',
	'tableAssignment.assignment.print': 'Print',
	'tableAssignment.assignment.directLive': 'The tables as participants have chosen so far.',

	'tableAssignment.table.number': 'Table {{number}}',
	'tableAssignment.table.sizeOf': '{{count}} of {{capacity}}',
	'tableAssignment.table.empty': 'This table is empty.',
	'tableAssignment.member.unknown': 'Participant',

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
		'Picking another topic replaces number 3. To remove a topic, tap it.',
	'tableAssignment.rank.hint.4': 'To change the order, drag the handle. To remove a topic, tap it.',
	'tableAssignment.rank.picked': '{{topic}} picked, in place {{place}}. The order: {{order}}.',
	'tableAssignment.rank.replaced':
		'{{topic}} picked, in place {{place}}, replacing {{replaced}}, which was removed. The order: {{order}}.',
	'tableAssignment.rank.removed': '{{topic}} removed.',
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
	'tableAssignment.cancelled.bodyClosed':
		'Your details and choices were deleted. Registration has closed. Still want to join? Talk to the host.',
	'tableAssignment.removed.title': 'Your registration was removed',
	'tableAssignment.removed.body':
		'The host removed the registration. If this is a mistake, talk to the host.',
	'tableAssignment.removed.titleMaybeMoved': 'Your registration is no longer here',
	'tableAssignment.removed.bodyMaybeMoved':
		'The registration continued on another device by full name, or the host removed it. If this is a mistake, talk to the host.',
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
	'tableAssignment.setup.title': 'New table assignment',
	'tableAssignment.setup.name': 'What is the gathering called?',
	'tableAssignment.setup.mode': 'Should people mix, or sit where they like?',
	'tableAssignment.setup.topics': 'What will they talk about?',
	'tableAssignment.setup.topic.placeholder': 'Topic name',
	'tableAssignment.setup.topic.label': 'Topic {{number}}',
	'tableAssignment.setup.topic.remove': 'Remove topic {{number}}',
	'tableAssignment.setup.topic.add': 'Add a topic',
	'tableAssignment.setup.list': 'Add a list',
	'tableAssignment.setup.import': 'Import from an existing discussion',
	'tableAssignment.setup.list.label': 'Write or paste several topics, with a comma between them',
	'tableAssignment.setup.list.placeholder': 'Health, education, security',
	'tableAssignment.setup.list.hint': 'You can also put one topic on each line.',
	'tableAssignment.setup.list.addEmpty': 'Add topics',
	'tableAssignment.setup.position.title': 'What do people disagree about?',
	'tableAssignment.setup.position.lead':
		'Everyone answers quietly, and the answer is shown to no one. It helps each table hold all the voices in the room.',
	'tableAssignment.setup.position.ask': 'Ask a question about position',
	'tableAssignment.setup.position.question': 'The question',
	'tableAssignment.setup.position.poleA': 'One end',
	'tableAssignment.setup.position.poleB': 'The other end',
	'tableAssignment.strictness': 'How important is it that each table resembles the room?',
	'tableAssignment.strictness.strict': 'Strict',
	'tableAssignment.strictness.balanced': 'Balanced',
	'tableAssignment.strictness.flexible': 'Flexible',
	'tableAssignment.strictness.strict.text':
		'Each table is very close to the room, but fewer people get a topic they chose.',
	'tableAssignment.strictness.balanced.text':
		'The recommended balance between a mixed table and the topic people asked for.',
	'tableAssignment.strictness.flexible.text':
		'More people get a topic they chose, and the tables resemble the room less.',
	'tableAssignment.strictness.expert': 'For experts: maximum deviation of {{value}}',
	'tableAssignment.setup.return.title': 'Coming back from another browser',
	'tableAssignment.returnByName': 'Allow return by full name',
	'tableAssignment.setup.return.body':
		'Whoever types exactly the same name can answer again, and the new answers replace the old ones. The old answers are not shown.',
	'tableAssignment.setup.return.warning':
		'There is no password here, so someone else can type the same name too. Switch this on only in a group you trust.',
	'tableAssignment.setup.summary.title': 'What will happen at the gathering',
	'tableAssignment.setup.expected': 'How many people are expected?',
	'tableAssignment.setup.seats': 'Seats per table',
	'tableAssignment.setup.open': 'Open registration',
	'tableAssignment.setup.fixLater': 'A mistake in a topic? It can be fixed after opening too.',
	'tableAssignment.autosave.saved': 'Saved automatically',
	'tableAssignment.live.status': 'Registration is open',
	'tableAssignment.live.close': 'Close and split into tables',
	'tableAssignment.live.closeNote': 'Nobody sees the tables before you check and publish them.',
	'tableAssignment.roomScreen': 'Room screen',
	'tableAssignment.roomScreen.show': 'Show on screen',
	'tableAssignment.roomScreen.scan': 'Scan the code and join the tables',
	'tableAssignment.roomScreen.seats': 'Who sits where',
	'tableAssignment.fixDetails': 'Fix details',
	'tableAssignment.fixDetails.name': 'Gathering name',
	'tableAssignment.fixDetails.topics': 'Topics',
	'tableAssignment.fixDetails.note':
		'Whoever has registered sees the corrected name, and their choices are kept.',
	'tableAssignment.preview.notPublic': 'Preview. Nobody can see this yet.',
	'tableAssignment.preview.good.title': 'These tables are good',
	'tableAssignment.preview.good.lead':
		'The tables resemble the whole room, and {{got}} of {{total}} people got a topic they chose.',
	'tableAssignment.choice.first': 'First choice',
	'tableAssignment.choice.second': 'Second choice',
	'tableAssignment.choice.third': 'Third choice',
	'tableAssignment.choice.outside': 'Outside their choices',
	'tableAssignment.closeness.veryClose': 'Very close to the room',
	'tableAssignment.closeness.close': 'Close to the room',
	'tableAssignment.closeness.notEnough': 'Not enough answers',
	'tableAssignment.preview.fullData': 'Full data',
	'tableAssignment.autosave.failed': 'Not saved. Your text stays here, and we will try again.',
	'tableAssignment.strictness.custom.text':
		'A different value is stored here. You can keep it, or pick one of the options.',
	'tableAssignment.setup.problem.name': 'Not saved yet: the gathering has no name.',
	'tableAssignment.setup.problem.topics': 'To open, add at least one topic.',
	'tableAssignment.setup.problem.question':
		'Not saved yet: the position question is missing some text.',
	'tableAssignment.setup.problem.seats':
		'Not saved yet: seats per table must be a number from 2 to 20.',
	'tableAssignment.setup.problem.expected':
		'Not saved yet: the expected number of people must be a whole number.',
	'tableAssignment.setup.summary.unknown': 'How many tables?',
	'tableAssignment.setup.summary.unknownHint':
		'Write how many people are expected, and we will work it out.',
	'tableAssignment.preview.stale.title': 'The data changed since this was computed',
	'tableAssignment.preview.stale.lead':
		'Someone was added or removed, or a setting changed. Compute again before publishing.',
	'tableAssignment.preview.unbalanced.title': 'The tables are not balanced yet',
	'tableAssignment.preview.unbalanced.lead':
		'One table is further from the room than the limit you set. {{got}} of {{total}} people got a topic they chose. You can compute again.',
	'tableAssignment.preview.choicesOnly.title': 'The tables were built from the choices',
	'tableAssignment.preview.choicesOnly.lead':
		'Fewer than three people answered the position question, so we cannot tell how much the tables resemble the room. {{got}} of {{total}} people got a topic they chose.',
	'tableAssignment.choice.none': 'Did not rank',
	'tableAssignment.closeness.far': 'Far from the room',
	'tableAssignment.preview.unusedTopic': 'The topic "{{topic}}" did not get a table.',
	'tableAssignment.roomScreen.previous': 'Previous',
	'tableAssignment.roomScreen.next': 'Next',
	'tableAssignment.roomScreen.pause': 'Pause',
	'tableAssignment.roomScreen.resume': 'Resume',
	'tableAssignment.roomScreen.page': 'Page {{page}} of {{pages}}',
	'tableAssignment.roomScreen.tablesSoon':
		'Registration has closed. The tables will appear here soon.',
	'tableAssignment.list.search': 'Search by gathering name',
	'tableAssignment.remove': 'Remove from the list',
	'tableAssignment.remove.ariaLabel': 'Remove {{name}} from the list',
	'tableAssignment.remove.title': 'Remove {{name}} from the list?',
	'tableAssignment.remove.body':
		'Their details and choices are deleted, and they get no table. They can register again while registration is open.',
	'tableAssignment.remove.confirm': 'Yes, remove',
	'tableAssignment.remove.keep': 'No, keep',
	'tableAssignment.remove.seated':
		'Someone already seated in the published assignment cannot be removed. It is best to talk to them directly.',
	'tableAssignment.setup.list.add.one': 'Add one topic',
	'tableAssignment.setup.list.add.two': 'Add {{count}} topics',
	'tableAssignment.setup.list.add.few': 'Add {{count}} topics',
	'tableAssignment.setup.list.add.many': 'Add {{count}} topics',
	'tableAssignment.setup.list.add.other': 'Add {{count}} topics',
	'tableAssignment.setup.summary.tablesAbout.one': 'About one table',
	'tableAssignment.setup.summary.tablesAbout.two': 'About {{count}} tables',
	'tableAssignment.setup.summary.tablesAbout.few': 'About {{count}} tables',
	'tableAssignment.setup.summary.tablesAbout.many': 'About {{count}} tables',
	'tableAssignment.setup.summary.tablesAbout.other': 'About {{count}} tables',
	'tableAssignment.setup.summary.tables.one': 'One table',
	'tableAssignment.setup.summary.tables.two': '{{count}} tables',
	'tableAssignment.setup.summary.tables.few': '{{count}} tables',
	'tableAssignment.setup.summary.tables.many': '{{count}} tables',
	'tableAssignment.setup.summary.tables.other': '{{count}} tables',
	'tableAssignment.setup.summary.people.one': 'One person, up to {{seats}} at each table',
	'tableAssignment.setup.summary.people.two': '{{count}} people, up to {{seats}} at each table',
	'tableAssignment.setup.summary.people.few': '{{count}} people, up to {{seats}} at each table',
	'tableAssignment.setup.summary.people.many': '{{count}} people, up to {{seats}} at each table',
	'tableAssignment.setup.summary.people.other': '{{count}} people, up to {{seats}} at each table',
	'tableAssignment.setup.summary.capacity.one': 'One seat for {{people}} people',
	'tableAssignment.setup.summary.capacity.two': '{{count}} seats for {{people}} people',
	'tableAssignment.setup.summary.capacity.few': '{{count}} seats for {{people}} people',
	'tableAssignment.setup.summary.capacity.many': '{{count}} seats for {{people}} people',
	'tableAssignment.setup.summary.capacity.other': '{{count}} seats for {{people}} people',
	'tableAssignment.setup.summary.seatsOnly.one': 'One seat',
	'tableAssignment.setup.summary.seatsOnly.two': '{{count}} seats',
	'tableAssignment.setup.summary.seatsOnly.few': '{{count}} seats',
	'tableAssignment.setup.summary.seatsOnly.many': '{{count}} seats',
	'tableAssignment.setup.summary.seatsOnly.other': '{{count}} seats',
	'tableAssignment.setup.summary.missing.one':
		'One seat short. You can add a topic or make the tables bigger.',
	'tableAssignment.setup.summary.missing.two':
		'{{count}} seats short. You can add a topic or make the tables bigger.',
	'tableAssignment.setup.summary.missing.few':
		'{{count}} seats short. You can add a topic or make the tables bigger.',
	'tableAssignment.setup.summary.missing.many':
		'{{count}} seats short. You can add a topic or make the tables bigger.',
	'tableAssignment.setup.summary.missing.other':
		'{{count}} seats short. You can add a topic or make the tables bigger.',
	'tableAssignment.live.registered.one': 'already registered',
	'tableAssignment.live.registered.two': 'already registered',
	'tableAssignment.live.registered.few': 'already registered',
	'tableAssignment.live.registered.many': 'already registered',
	'tableAssignment.live.registered.other': 'already registered',
	'tableAssignment.live.estimate.one': 'So far that is about one table',
	'tableAssignment.live.estimate.two': 'So far that is about {{count}} tables',
	'tableAssignment.live.estimate.few': 'So far that is about {{count}} tables',
	'tableAssignment.live.estimate.many': 'So far that is about {{count}} tables',
	'tableAssignment.live.estimate.other': 'So far that is about {{count}} tables',
	'tableAssignment.error.tooFewRegistrants':
		'Too few people have registered to compute tables. Wait for more people, then compute again.',
	'tableAssignment.error.previewLimit':
		'The limit on computing was reached. The same answers can be computed only a few times, and one assignment has a total limit. Compute again after more answers arrive, or publish the last preview.',
	'tableAssignment.error.registrationFull':
		'This gathering has reached its limit of registered people, so no one else can register.',
	'tableAssignment.error.nameLocked':
		'The tables are published, so a name can no longer be changed. Talk to the host if it is wrong.',
	'tableAssignment.error.nameClaimed':
		'You continued this registration by full name, so the name cannot be changed. Talk to the host if it is wrong.',
	'tableAssignment.delete': 'Delete this assignment',
	'tableAssignment.delete.title': 'Delete this assignment?',
	'tableAssignment.delete.body':
		'This removes the names, the answers and the tables of everyone, permanently. It cannot be undone.',
	'tableAssignment.delete.keep': 'No, keep it',
	'tableAssignment.delete.confirm': 'Yes, delete everything',
	'tableAssignment.participants.claimedByName': 'Continued by name',
	'tableAssignment.waiting.late.lead':
		'The tables are already published. Your choices are saved, and the host will seat you.',
	'tableAssignment.waiting.late.note':
		'The tables were published before you registered. The host will seat you, and your table will appear on this page. You can close it and come back with the link.',
	'tableAssignment.preview.newcomers.one':
		'One person registered after the tables were published. Computing again keeps everyone seated where they are and seats only them.',
	'tableAssignment.preview.newcomers.two':
		'{{count}} people registered after the tables were published. Computing again keeps everyone seated where they are and seats only them.',
	'tableAssignment.preview.newcomers.few':
		'{{count}} people registered after the tables were published. Computing again keeps everyone seated where they are and seats only them.',
	'tableAssignment.preview.newcomers.many':
		'{{count}} people registered after the tables were published. Computing again keeps everyone seated where they are and seats only them.',
	'tableAssignment.preview.newcomers.other':
		'{{count}} people registered after the tables were published. Computing again keeps everyone seated where they are and seats only them.',
	'tableAssignment.participants.unseated': 'Not seated yet',
	'tableAssignment.count.unseated': 'Not seated yet',
	'tableAssignment.error.tableSizeBelowPublished':
		'The table size is now smaller than a table that was already published. Set it back, or raise it, then compute again.',
};

export default en;
