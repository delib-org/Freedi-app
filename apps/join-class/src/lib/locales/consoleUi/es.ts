// es strings of the teacher console redesign (one next button, quiet screen, decision panel). Spread into ../es.ts.

const consoleUi: Record<string, string> = {
	'console.step.waiting': 'Los estudiantes están entrando',
	'console.settings_scope': 'Solo para esta clase',
	'console.blocked.no_students': 'Aún no hay estudiantes que dividir',
	'console.blocked.no_proposals': 'Aún no hay propuestas para votar',
	'console.busy_closing': 'Cerrando…',
	'console.busy_showing': 'Mostrando…',
	'console.busy_splitting': 'Dividiendo…',
	'console.busy_copying': 'Trayendo…',
	'console.close_vote_title': 'Faltan {{n}} por votar. ¿Cerrar la votación?',
	'console.close_vote_yes': 'Cerrar',
	'console.vote_skip': 'Pasar al resumen sin votación',
	'console.vote_skip_title': 'La votación nunca se abrió. ¿Pasar al resumen sin votación?',
	'console.vote_skip_body': 'El resumen mostrará la propuesta con más acuerdo.',
	'console.vote_skip_yes': 'Pasar al resumen',
	'console.resplit_title': '¿Dividir la clase de nuevo?',
	'console.resplit_body': 'Se perderá la distribución actual. No se puede deshacer.',
	'console.all_steps': 'Todos los pasos',
	'console.step_now': 'Ahora',
	'console.step_back_hint': 'Volver a este paso',
	'console.step_back_tag': 'Volver',
	'console.steps_forward_note': 'Se avanza solo con el botón grande, paso a paso.',
	'console.next_action_label': 'La siguiente acción',
};

export default consoleUi;
