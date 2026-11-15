// Dutch strings of the Tables-Class bridge (IA tables-class-bridge): "הרשמה מראש", the Tables step of a
// connected lesson, the personal link and the name gate. Spread into ../nl.ts, so they ship in the same locale chunk.

const bridge: Record<string, string> = {
	'console.register_ahead': 'Vooraf aanmelden',
	'console.register_ahead.prompt':
		'Willen jullie dat mensen zich vooraf aanmelden en al een tafel krijgen?',
	'console.register_ahead.effects': 'Wat er verandert door te koppelen',
	'console.register_ahead.effect.tables': 'De tafels komen uit de aanmelding.',
	'console.register_ahead.effect.side':
		'De positievraag uit de aanmelding vervangt „Kies een kant”.',
	'console.register_ahead.choose': 'Welke aanmelding hoort bij deze les?',
	'console.register_ahead.connected_lead': 'Deze aanmelding is gekoppeld aan de les',
	'console.register_ahead.connect': 'Aan de les koppelen',
	'console.register_ahead.new': 'Nieuwe aanmelding',
	'console.register_ahead.empty':
		'Jullie hebben nog geen aanmelding. Open er een in Tables en kom hier terug.',
	'console.register_ahead.search': 'Zoeken op naam',
	'console.register_ahead.load_failed': 'Jullie aanmeldingen konden niet worden geladen',
	'console.register_ahead.manage': 'Aanmelding beheren',
	'console.register_ahead.status.draft': 'In voorbereiding',
	'console.register_ahead.status.registrationOpen': 'De aanmelding is open',
	'console.register_ahead.status.registrationClosed': 'De aanmelding is gesloten',
	'console.register_ahead.status.published': 'De indeling is gepubliceerd',
	'console.register_ahead.status.ended': 'Afgelopen',
	'console.register_ahead.arrived': '{{arrived}} van {{registered}} zijn er',
	'console.register_ahead.gone': 'De aanmelding is niet gevonden. Je kunt hem uit de les halen.',
	'console.register_ahead.side_removed':
		'De aanmelding vraagt een positie, daarom heeft de les geen stap „Kies een kant”.',
	'console.register_ahead.close': 'Aanmelding sluiten',
	'console.register_ahead.close_title': 'De aanmelding sluiten?',
	'console.register_ahead.close_body':
		'Na het sluiten kan niemand zich meer aanmelden. Als mensen een onderwerp kiezen, liggen de tafels bij het sluiten vast.',
	'console.register_ahead.close_yes': 'Ja, sluiten',
	'console.register_ahead.remove': 'Aanmelding uit de les halen',
	'console.register_ahead.remove_title': 'De aanmelding uit de les halen?',
	'console.register_ahead.remove_body':
		'De aanmelding en de aangemelde mensen blijven in Tables zoals ze zijn. Persoonlijke links werken niet meer.',
	'console.register_ahead.remove_yes': 'Ja, verwijderen',
	'console.register_ahead.remove_locked':
		'Na het overnemen van de tafels in de les kan het niet meer worden verwijderd.',
	'console.register_ahead.err.not_connected': 'Aan deze les is geen aanmelding gekoppeld.',
	'console.register_ahead.err.connected_elsewhere':
		'Deze aanmelding is al aan een andere les gekoppeld.',
	'console.register_ahead.err.not_host':
		'Alleen het account dat de aanmelding opende, kan hem koppelen.',
	'console.register_ahead.err.ended': 'De aanmelding is afgelopen.',
	'console.copy_seating': 'Tafels uit de aanmelding overnemen',
	'console.copy_seating.again': 'Bijwerken vanuit de aanmelding',
	'console.copy_seating.again_title': 'De tafels bijwerken vanuit de aanmelding?',
	'console.copy_seating.again_body':
		'De tafels komen opnieuw uit de aanmelding en elke hier met de hand gedane verplaatsing wordt ongedaan gemaakt.',
	'console.copy_seating.again_yes': 'Ja, bijwerken',
	'console.copy_seating.result':
		'{{tables}} tafels overgenomen · {{arrived}} al hier · {{reserved}} nog niet hier',
	'console.copy_seating.not_ready.ranked': 'Publiceer eerst de indeling',
	'console.copy_seating.not_ready.direct': 'Sluit eerst de aanmelding',
	'console.copy_seating.not_tables_step':
		'De tafels kunnen alleen in de tafelstap worden overgenomen.',
	'console.copy_seating.copied_already':
		'De tafels zijn al overgenomen. Je kunt bijwerken vanuit de aanmelding.',
	'console.without_table': '{{count}} zonder tafel',
	'console.table_alone': 'Maar één persoon aan tafel',
	'console.table_size.from_registration': 'Bepaald in de aanmelding: {{n}}',
	'console.no_device.pick_reserved': 'Uit de aangemelde mensen die er nog niet zijn',
	'console.no_device.seat_taken': 'Die plek is niet meer vrij. Kies opnieuw.',
	'console.support_registration_failed': 'De steun per positie kon niet worden berekend.',
	'table.not_arrived': 'Nog niet hier',
	'seat.invalid.title': 'Deze link is niet meer actief',
	'seat.invalid.body':
		'Je kunt nog steeds binnenkomen met de code op het scherm en je volledige naam.',
	'seat.moved.title': 'Het gesprek gaat verder op een ander apparaat',
	'seat.moved.body':
		'Je plek aan tafel is naar een ander apparaat gegaan. Je kunt hier opnieuw binnenkomen, dan komt de plek weer bij je terug.',
	'seat.moved.action': 'Hier opnieuw binnenkomen',
	'opening.name_prompt.registered': 'Schrijf je volledige naam, zoals bij het aanmelden',
	'opening.name_not_found': 'We vonden geen aanmelding onder deze naam.',
	'opening.name_not_found.fix': 'Naam verbeteren',
	'opening.name_not_found.join_new': 'Meedoen zonder aanmelding',
	'opening.name_taken':
		'Er is al iemand binnen onder deze naam. Ben jij dat, op een ander apparaat?',
	'opening.name_taken.yes': 'Ja, dat ben ik',
	'opening.name_taken.no': 'Nee, ik ben iemand anders',
	'opening.name_twice': 'Twee mensen meldden zich aan onder deze naam. Welke tafel is van jou?',
	'opening.name_twice.choice': 'Tafel {{n}} · {{topic}}',
	'opening.name_twice.choice_plain': 'Tafel {{n}}',
	'opening.name_twice_later':
		'Twee mensen meldden zich aan onder deze naam. Je kiest je tafel zodra de tafels er zijn.',
	'table.pick_mine': 'Mijn tafel kiezen',
	'table.alone':
		'Je zit nu alleen aan tafel. Je kunt op de anderen wachten of aan een andere tafel worden gezet.',
	'table.no_seat_yet': 'Je hebt nog geen tafel',
	'table.topic': 'Onderwerp: {{topic}}',
};

export default bridge;
