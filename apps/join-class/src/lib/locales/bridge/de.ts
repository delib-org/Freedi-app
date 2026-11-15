// German strings of the Tables-Class bridge (IA tables-class-bridge): "הרשמה מראש", the Tables step of a
// connected lesson, the personal link and the name gate. Spread into ../de.ts, so they ship in the same locale chunk.

const bridge: Record<string, string> = {
	'console.register_ahead': 'Anmeldung vorab',
	'console.register_ahead.prompt':
		'Sollen sich alle vorab anmelden und schon einen Tisch bekommen?',
	'console.register_ahead.effects': 'Was sich durch die Verbindung ändert',
	'console.register_ahead.effect.tables': 'Die Tische kommen aus der Anmeldung.',
	'console.register_ahead.effect.side': 'Die Positionsfrage der Anmeldung ersetzt „Seite wählen“.',
	'console.register_ahead.choose': 'Welche Anmeldung gehört zu dieser Stunde?',
	'console.register_ahead.connected_lead': 'Diese Anmeldung ist mit der Stunde verbunden',
	'console.register_ahead.connect': 'Mit der Stunde verbinden',
	'console.register_ahead.new': 'Neue Anmeldung',
	'console.register_ahead.empty':
		'Ihr habt noch keine Anmeldung. Öffnet eine in Tables und kommt hierher zurück.',
	'console.register_ahead.search': 'Nach Namen suchen',
	'console.register_ahead.load_failed': 'Eure Anmeldungen konnten nicht geladen werden',
	'console.register_ahead.manage': 'Anmeldung verwalten',
	'console.register_ahead.status.draft': 'In Vorbereitung',
	'console.register_ahead.status.registrationOpen': 'Die Anmeldung ist offen',
	'console.register_ahead.status.registrationClosed': 'Die Anmeldung ist geschlossen',
	'console.register_ahead.status.published': 'Die Sitzordnung ist veröffentlicht',
	'console.register_ahead.status.ended': 'Beendet',
	'console.register_ahead.arrived': '{{arrived}} von {{registered}} sind da',
	'console.register_ahead.gone':
		'Die Anmeldung wurde nicht gefunden. Ihr könnt sie aus der Stunde entfernen.',
	'console.register_ahead.side_removed':
		'Die Anmeldung fragt nach einer Position, deshalb hat die Stunde keinen Schritt „Seite wählen“.',
	'console.register_ahead.close': 'Anmeldung schließen',
	'console.register_ahead.close_title': 'Anmeldung schließen?',
	'console.register_ahead.close_body':
		'Nach dem Schließen kann sich niemand mehr anmelden. Wenn Themen gewählt werden, stehen die Tische beim Schließen fest.',
	'console.register_ahead.close_yes': 'Ja, schließen',
	'console.register_ahead.remove': 'Anmeldung aus der Stunde entfernen',
	'console.register_ahead.remove_title': 'Anmeldung aus der Stunde entfernen?',
	'console.register_ahead.remove_body':
		'Anmeldung und Angemeldete bleiben in Tables, wie sie sind. Persönliche Links funktionieren nicht mehr.',
	'console.register_ahead.remove_yes': 'Ja, entfernen',
	'console.register_ahead.remove_locked':
		'Nach dem Übernehmen der Tische in die Stunde ist das Entfernen nicht mehr möglich.',
	'console.register_ahead.err.not_connected': 'Mit dieser Stunde ist keine Anmeldung verbunden.',
	'console.register_ahead.err.connected_elsewhere':
		'Diese Anmeldung ist schon mit einer anderen Stunde verbunden.',
	'console.register_ahead.err.not_host':
		'Nur das Konto, das die Anmeldung geöffnet hat, kann sie verbinden.',
	'console.register_ahead.err.ended': 'Die Anmeldung ist beendet.',
	'console.copy_seating': 'Tische aus der Anmeldung übernehmen',
	'console.copy_seating.again': 'Aus der Anmeldung aktualisieren',
	'console.copy_seating.again_title': 'Tische aus der Anmeldung aktualisieren?',
	'console.copy_seating.again_body':
		'Die Tische kommen erneut aus der Anmeldung, und alle hier von Hand gemachten Verschiebungen gehen verloren.',
	'console.copy_seating.again_yes': 'Ja, aktualisieren',
	'console.copy_seating.result':
		'{{tables}} Tische übernommen · {{arrived}} schon da · {{reserved}} noch nicht da',
	'console.copy_seating.not_ready.ranked': 'Zuerst die Sitzordnung veröffentlichen',
	'console.copy_seating.not_ready.direct': 'Zuerst die Anmeldung schließen',
	'console.copy_seating.not_tables_step':
		'Die Tische können nur im Schritt „Tische“ übernommen werden.',
	'console.copy_seating.copied_already':
		'Die Tische wurden schon übernommen. Ihr könnt aus der Anmeldung aktualisieren.',
	'console.without_table': '{{count}} ohne Tisch',
	'console.table_alone': 'Nur eine Person am Tisch',
	'console.table_size.from_registration': 'In der Anmeldung festgelegt: {{n}}',
	'console.no_device.pick_reserved': 'Aus den Angemeldeten, die noch nicht da sind',
	'console.no_device.seat_taken': 'Dieser Platz ist nicht mehr frei. Bitte neu wählen.',
	'console.support_registration_failed':
		'Die Unterstützung nach Position konnte nicht berechnet werden.',
	'table.not_arrived': 'Noch nicht da',
	'seat.invalid.title': 'Dieser Link ist nicht mehr aktiv',
	'seat.invalid.body': 'Du kannst mit dem Code auf dem Bildschirm und deinem vollen Namen hinein.',
	'seat.moved.title': 'Die Diskussion läuft auf einem anderen Gerät weiter',
	'seat.moved.body':
		'Dein Platz am Tisch ist auf ein anderes Gerät gewechselt. Du kannst von hier erneut hinein, dann kommt der Platz zu dir zurück.',
	'seat.moved.action': 'Von hier erneut hineingehen',
	'opening.name_prompt.registered': 'Schreib deinen vollen Namen, wie bei der Anmeldung',
	'opening.name_not_found': 'Wir haben keine Anmeldung unter diesem Namen gefunden.',
	'opening.name_not_found.fix': 'Namen korrigieren',
	'opening.name_not_found.join_new': 'Ohne Anmeldung beitreten',
	'opening.name_taken':
		'Unter diesem Namen ist schon jemand drin. Bist du das, auf einem anderen Gerät?',
	'opening.name_taken.yes': 'Ja, das bin ich',
	'opening.name_taken.no': 'Nein, ich bin jemand anderes',
	'opening.name_twice':
		'Zwei Personen haben sich unter diesem Namen angemeldet. Welcher Tisch ist deiner?',
	'opening.name_twice.choice': 'Tisch {{n}} · {{topic}}',
	'opening.name_twice.choice_plain': 'Tisch {{n}}',
	'opening.name_twice_later':
		'Zwei Personen haben sich unter diesem Namen angemeldet. Du wählst deinen Tisch, sobald die Tische da sind.',
	'table.pick_mine': 'Meinen Tisch wählen',
	'table.alone':
		'Du bist gerade allein am Tisch. Du kannst auf die anderen warten oder wirst an einen anderen Tisch gesetzt.',
	'table.no_seat_yet': 'Du hast noch keinen Tisch',
	'table.topic': 'Thema: {{topic}}',
};

export default bridge;
