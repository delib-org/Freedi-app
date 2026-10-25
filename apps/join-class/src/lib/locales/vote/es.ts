// Spanish strings of the vote: the student's ballot screen (voting.*) and
// the teacher's vote controls (console.*_vote). Spread into ../es.ts, so they
// ship in the same locale chunk; split out only to keep each file small.

const vote: Record<string, string> = {
	'console.open_vote': 'Abrir la votación',
	'console.pause_vote': 'Pausar la votación',
	'console.resume_vote': 'Reanudar la votación',
	'console.close_vote': 'Cerrar la votación',
	'voting.title': 'Votación',
	'voting.pick_one': 'Elegid una propuesta',
	'voting.waiting': 'Esperando a que el profesor abra la votación',
	'voting.empty': 'Nada que votar',
	'voting.vote': 'Votar',
	'voting.voted': 'Habéis votado',
	'voting.change': 'Cambiar el voto',
	'voting.saving': 'Guardando…',
	'voting.closed': 'La votación está cerrada',
	'voting.failed': 'No se guardó el voto. Intentad de nuevo',
	'voting.paused': 'La votación está en pausa',
	'voting.paused_hint': 'El docente pausó la votación por ahora. Tu voto se conserva.',
};

export default vote;
