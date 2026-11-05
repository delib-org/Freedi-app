// Spanish strings of the proposal limit and of acting for a student without a device.
// Spread into ../es.ts, so they ship in the same locale chunk; split out only to keep each file small.

const actFor: Record<string, string> = {
	'console.proposal_limit': 'Propuestas por persona',
	'console.proposal_limit_one': 'Una',
	'console.proposal_limit_unlimited': 'Sin límite',
	'console.proposal_limit_help':
		'Volver a una no borra nada: las propuestas enviadas se quedan, y quien ya tiene una no puede añadir otra',
	'proposal.limit_reached': 'Puedes enviar una propuesta',
	'console.propose_for': 'Proponer en nombre de {{name}}',
	'console.vote_for': 'Votar en nombre de {{name}}',
	'console.save_for': 'Guardar en nombre de {{name}}',
	'console.entered_by_teacher': 'Introducido por el docente',
	'console.proposal_sent_for': 'Se envió la propuesta en nombre de {{name}}',
	'console.proposal_saved_for': 'Se guardó la propuesta en nombre de {{name}}',
	'console.vote_counted_for': 'Se contó el voto de {{name}}',
	'console.act_for_next': 'Siguiente: {{name}}',
	'console.act_for_limit': 'Ya hay una propuesta en nombre de {{name}}. Se puede editar',
	'console.act_for_closed': 'La votación está abierta: las propuestas ya no pueden cambiar',
	'console.act_for_held': 'La clase está detenida: ahora no se puede cambiar nada',
	'console.act_for_vote_not_open': 'La votación aún no está abierta',
	'console.act_for_empty': 'Aún no hay nadie sin dispositivo. Puedes añadir a alguien',
	'console.act_for_pick': 'Elige un nombre de la lista',
	'console.act_for_done': 'hecho',
	'console.act_for_not_done': 'aún sin hacer',
	'console.act_for_table': 'Mesa',
	'console.act_for_text': 'La propuesta',
};

export default actFor;
