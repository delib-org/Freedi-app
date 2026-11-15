// English strings of the Tables-Class bridge (IA tables-class-bridge): "הרשמה מראש", the Tables step of a
// connected lesson, the personal link and the name gate. Spread into ../en.ts, so they ship in the same locale chunk.

const bridge: Record<string, string> = {
	'console.register_ahead': 'Registration before the lesson',
	'console.register_ahead.prompt': 'Want people to register and get a table before the lesson?',
	'console.register_ahead.effects': 'What connecting changes',
	'console.register_ahead.effect.tables': 'The tables will come from the registration.',
	'console.register_ahead.effect.side':
		'The position question from the registration replaces "Choose a side".',
	'console.register_ahead.choose': 'Which registration belongs to this lesson?',
	'console.register_ahead.connected_lead': 'This registration is connected to the lesson',
	'console.register_ahead.connect': 'Connect to the lesson',
	'console.register_ahead.new': 'New registration',
	'console.register_ahead.empty':
		'You have no registration yet. Open one in Tables and come back here.',
	'console.register_ahead.search': 'Search by name',
	'console.register_ahead.load_failed': 'We could not load your registrations',
	'console.register_ahead.manage': 'Manage the registration',
	'console.register_ahead.status.draft': 'Being prepared',
	'console.register_ahead.status.registrationOpen': 'Registration is open',
	'console.register_ahead.status.registrationClosed': 'Registration is closed',
	'console.register_ahead.status.published': 'The seating is published',
	'console.register_ahead.status.ended': 'Ended',
	'console.register_ahead.arrived': '{{arrived}} of {{registered}} are here',
	'console.register_ahead.gone':
		'The registration was not found. You can remove it from the lesson.',
	'console.register_ahead.side_removed':
		'The registration asks a position, so this lesson has no "Choose a side" step.',
	'console.register_ahead.close': 'Close the registration',
	'console.register_ahead.close_title': 'Close the registration?',
	'console.register_ahead.close_body':
		'After closing nobody can register. When people choose topics, the tables are set at closing.',
	'console.register_ahead.close_yes': 'Yes, close it',
	'console.register_ahead.remove': 'Remove the registration from the lesson',
	'console.register_ahead.remove_title': 'Remove the registration from the lesson?',
	'console.register_ahead.remove_body':
		'The registration and the people registered stay as they are in Tables. Personal links stop working.',
	'console.register_ahead.remove_yes': 'Yes, remove it',
	'console.register_ahead.remove_locked':
		'It cannot be removed after the tables were brought into the lesson.',
	'console.register_ahead.err.not_connected': 'This lesson has no registration connected.',
	'console.register_ahead.err.connected_elsewhere':
		'This registration is already connected to another lesson.',
	'console.register_ahead.err.not_host':
		'Only the account that opened the registration can connect it.',
	'console.register_ahead.err.ended': 'The registration has ended.',
	'console.copy_seating': 'Bring the tables from the registration',
	'console.copy_seating.again': 'Update from the registration',
	'console.copy_seating.again_title': 'Update the tables from the registration?',
	'console.copy_seating.again_body':
		'The tables come again from the registration, and every move made here by hand is undone.',
	'console.copy_seating.again_yes': 'Yes, update',
	'console.copy_seating.result':
		'{{tables}} tables brought · {{arrived}} already here · {{reserved}} not here yet',
	'console.copy_seating.not_ready.ranked': 'First publish the seating',
	'console.copy_seating.not_ready.direct': 'First close the registration',
	'console.copy_seating.not_tables_step': 'The tables can be brought only at the tables step.',
	'console.copy_seating.copied_already':
		'The tables were already brought. You can update from the registration.',
	'console.without_table': '{{count}} without a table',
	'console.table_alone': 'Only one person at the table',
	'console.table_size.from_registration': 'Set in the registration: {{n}}',
	'console.no_device.pick_reserved': 'From those registered who are not here yet',
	'console.no_device.seat_taken': 'That seat is no longer free. Pick again.',
	'console.support_registration_failed': 'We could not work out the support by position.',
	'table.not_arrived': 'Not here yet',
	'seat.invalid.title': 'This link is no longer active',
	'seat.invalid.body': 'You can still come in with the code on the screen and your full name.',
	'seat.moved.title': 'The discussion continues on another device',
	'seat.moved.body':
		'Your seat at the table moved to another device. You can come in again from here and the seat comes back to you.',
	'seat.moved.action': 'Come in again from here',
	'opening.name_prompt.registered': 'Write your full name, as you registered',
	'opening.name_not_found': 'We did not find a registration under this name.',
	'opening.name_not_found.fix': 'Fix the name',
	'opening.name_not_found.join_new': 'Join without registering',
	'opening.name_taken': 'Someone already came in under this name. Is it you, on another device?',
	'opening.name_taken.yes': 'Yes, it is me',
	'opening.name_taken.no': 'No, I am someone else',
	'opening.name_twice': 'Two people registered under this name. Which table is yours?',
	'opening.name_twice.choice': 'Table {{n}} · {{topic}}',
	'opening.name_twice.choice_plain': 'Table {{n}}',
	'opening.name_twice_later':
		'Two people registered under this name. You will pick your table when the tables arrive.',
	'table.pick_mine': 'Pick my table',
	'table.alone':
		'You are alone at the table for now. You can wait for the others, or you may be moved to another table.',
	'table.no_seat_yet': 'You have no table yet',
	'table.topic': 'Topic: {{topic}}',
};

export default bridge;
