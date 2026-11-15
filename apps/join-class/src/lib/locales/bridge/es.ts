// Spanish strings of the Tables-Class bridge (IA tables-class-bridge): "הרשמה מראש", the Tables step of a
// connected lesson, the personal link and the name gate. Spread into ../es.ts, so they ship in the same locale chunk.

const bridge: Record<string, string> = {
	'console.register_ahead': 'Inscripción previa',
	'console.register_ahead.prompt':
		'¿Quieren que se inscriban y reciban una mesa antes de la clase?',
	'console.register_ahead.effects': 'Qué cambia al conectar',
	'console.register_ahead.effect.tables': 'Las mesas vendrán de la inscripción.',
	'console.register_ahead.effect.side':
		'La pregunta de posición de la inscripción reemplaza «Elegir un lado».',
	'console.register_ahead.choose': '¿Qué inscripción corresponde a esta clase?',
	'console.register_ahead.connected_lead': 'Esta inscripción está conectada a la clase',
	'console.register_ahead.connect': 'Conectar a la clase',
	'console.register_ahead.new': 'Nueva inscripción',
	'console.register_ahead.empty':
		'Aún no tienen una inscripción. Abran una en Tables y vuelvan aquí.',
	'console.register_ahead.search': 'Buscar por nombre',
	'console.register_ahead.load_failed': 'No pudimos cargar sus inscripciones',
	'console.register_ahead.manage': 'Gestionar la inscripción',
	'console.register_ahead.status.draft': 'En preparación',
	'console.register_ahead.status.registrationOpen': 'La inscripción está abierta',
	'console.register_ahead.status.registrationClosed': 'La inscripción está cerrada',
	'console.register_ahead.status.published': 'La distribución está publicada',
	'console.register_ahead.status.ended': 'Terminada',
	'console.register_ahead.arrived': '{{arrived}} de {{registered}} han llegado',
	'console.register_ahead.gone': 'No se encontró la inscripción. Pueden quitarla de la clase.',
	'console.register_ahead.side_removed':
		'La inscripción pregunta una posición, así que la clase no tiene el paso «Elegir un lado».',
	'console.register_ahead.close': 'Cerrar la inscripción',
	'console.register_ahead.close_title': '¿Cerrar la inscripción?',
	'console.register_ahead.close_body':
		'Después de cerrar nadie puede inscribirse. Cuando eligen temas, las mesas se fijan al cerrar.',
	'console.register_ahead.close_yes': 'Sí, cerrar',
	'console.register_ahead.remove': 'Quitar la inscripción de la clase',
	'console.register_ahead.remove_title': '¿Quitar la inscripción de la clase?',
	'console.register_ahead.remove_body':
		'La inscripción y las personas inscritas se quedan como están en Tables. Los enlaces personales dejan de funcionar.',
	'console.register_ahead.remove_yes': 'Sí, quitar',
	'console.register_ahead.remove_locked':
		'No se puede quitar después de traer las mesas a la clase.',
	'console.register_ahead.err.not_connected': 'Esta clase no tiene una inscripción conectada.',
	'console.register_ahead.err.connected_elsewhere':
		'Esta inscripción ya está conectada a otra clase.',
	'console.register_ahead.err.not_host':
		'Solo la cuenta que abrió la inscripción puede conectarla.',
	'console.register_ahead.err.ended': 'La inscripción ha terminado.',
	'console.copy_seating': 'Traer las mesas de la inscripción',
	'console.copy_seating.again': 'Actualizar desde la inscripción',
	'console.copy_seating.again_title': '¿Actualizar las mesas desde la inscripción?',
	'console.copy_seating.again_body':
		'Las mesas vuelven a venir de la inscripción y se deshace cualquier cambio hecho aquí a mano.',
	'console.copy_seating.again_yes': 'Sí, actualizar',
	'console.copy_seating.result':
		'{{tables}} mesas traídas · {{arrived}} ya están · {{reserved}} aún no llegan',
	'console.copy_seating.not_ready.ranked': 'Primero se publica la distribución',
	'console.copy_seating.not_ready.direct': 'Primero se cierra la inscripción',
	'console.copy_seating.not_tables_step': 'Las mesas solo se pueden traer en el paso de las mesas.',
	'console.copy_seating.copied_already':
		'Las mesas ya se trajeron. Pueden actualizar desde la inscripción.',
	'console.without_table': '{{count}} sin mesa',
	'console.table_alone': 'Solo una persona en la mesa',
	'console.table_size.from_registration': 'Definido en la inscripción: {{n}}',
	'console.no_device.pick_reserved': 'De las personas inscritas que aún no llegan',
	'console.no_device.seat_taken': 'Ese lugar ya no está libre. Elijan de nuevo.',
	'console.support_registration_failed': 'No pudimos calcular el apoyo por posición.',
	'table.not_arrived': 'Aún no llegan',
	'seat.invalid.title': 'Este enlace ya no está activo',
	'seat.invalid.body': 'Puedes entrar con el código de la pantalla y tu nombre completo.',
	'seat.moved.title': 'La conversación continúa en otro dispositivo',
	'seat.moved.body':
		'Tu lugar en la mesa pasó a otro dispositivo. Puedes entrar de nuevo desde aquí y el lugar vuelve a ti.',
	'seat.moved.action': 'Entrar de nuevo desde aquí',
	'opening.name_prompt.registered': 'Escribe tu nombre completo, como en la inscripción',
	'opening.name_not_found': 'No encontramos una inscripción con este nombre.',
	'opening.name_not_found.fix': 'Corregir el nombre',
	'opening.name_not_found.join_new': 'Unirme sin inscripción',
	'opening.name_taken': 'Alguien ya entró con este nombre. ¿Eres tú, en otro dispositivo?',
	'opening.name_taken.yes': 'Sí, soy yo',
	'opening.name_taken.no': 'No, soy otra persona',
	'opening.name_twice': 'Dos personas se inscribieron con este nombre. ¿Cuál es tu mesa?',
	'opening.name_twice.choice': 'Mesa {{n}} · {{topic}}',
	'opening.name_twice.choice_plain': 'Mesa {{n}}',
	'opening.name_twice_later':
		'Dos personas se inscribieron con este nombre. Elegirás tu mesa cuando lleguen las mesas.',
	'table.pick_mine': 'Elegir mi mesa',
	'table.alone':
		'Por ahora estás solo en la mesa. Puedes esperar a los demás o te pasarán a otra mesa.',
	'table.no_seat_yet': 'Aún no tienes mesa',
	'table.topic': 'Tema: {{topic}}',
};

export default bridge;
