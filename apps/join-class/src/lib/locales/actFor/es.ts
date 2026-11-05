// Spanish strings of the proposal limit and of acting for a student without a device.
// Spread into ../es.ts, so they ship in the same locale chunk; split out only to keep each file small.

const actFor: Record<string, string> = {
	'console.proposal_limit': 'Propuestas por persona',
	'console.proposal_limit_one': 'Una',
	'console.proposal_limit_unlimited': 'Sin límite',
	'console.proposal_limit_help':
		'Volver a una no borra nada: las propuestas enviadas se quedan, y quien ya tiene una no puede añadir otra',
	'proposal.limit_reached': 'Puedes enviar una propuesta',
};

export default actFor;
