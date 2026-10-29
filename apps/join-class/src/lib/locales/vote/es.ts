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
	'voting.saving': 'Guardando…',
	'voting.counted': 'Vuestro voto se ha contado',
	'voting.closed': 'La votación está cerrada',
	'voting.failed': 'No se guardó el voto. Intentad de nuevo',
	'voting.paused': 'La votación está en pausa',
	'voting.paused_hint': 'El docente pausó la votación por ahora. Tu voto se conserva.',
	'voting.closed_hint': 'La votación está cerrada. Esperamos el resumen',
	'console.vote_settings': 'La votación',
	'console.vote_live_results': 'Los estudiantes ven los resultados en vivo',
	'console.vote_live_results_help': 'Cuántos votos tiene cada propuesta. Nunca quién votó qué.',
	'voting.result_votes': '{{percent}} % · {{n}} votos',
	'voting.result_one_vote': '{{percent}} % · 1 voto',
	// >>> voteSummary BEGIN
	'summary.vote_results': 'Resultados de la votación',
	'summary.turnout': '{{n}} de {{m}} han votado',
	'summary.leading': 'Va ganando',
	'summary.vote_open': 'La votación sigue abierta',
	'summary.wait_close': 'El profesor cerrará la votación',
	'summary.no_vote': 'No hubo votación',
	'summary.most_agreed': 'La propuesta con más acuerdo',
	'summary.tie_by_ratings': 'Empate, decidido por las valoraciones',
	'summary.by_side_explain':
		'Cuánto apoya cada lado la decisión, según el lado que elegisteis al empezar la clase',
	'summary.winner': 'La propuesta elegida',
	'console.close_and_go_title': 'La votación sigue abierta. ¿Cerrarla e ir al resumen?',
	'console.close_and_go_body': 'Después de cerrar, ya no se pueden cambiar los votos.',
	'console.close_and_go_yes': 'Cerrar e ir',
	'console.all_voted': 'Todos han votado',
	'console.vote_order': 'Orden de las propuestas',
	'console.vote_order_consensus': 'Por las valoraciones',
	'console.vote_order_votes': 'Por número de votos',
	'console.vote_order_random': 'Orden aleatorio',
	'console.vote_scope': 'Propuestas en la votación',
	'console.vote_scope_all': 'Todas las propuestas',
	'console.vote_scope_above': 'Solo las que superan la meta',
	'console.vote_scope_count': '{{above}} de {{total}} superan la meta',
	'console.vote_scope_none':
		'Menos de dos propuestas superan la meta, así que la votación incluirá las mejores',
	'console.vote_scope_locked': 'Se define antes de abrir la votación',
	'console.vote_status_not_open': 'Aún no abierta',
	'console.vote_status_open': 'Votación abierta',
	'console.vote_status_paused': 'Votación en pausa',
	'console.vote_status_closed': 'Votación cerrada',
	'console.vote_progress': '{{voted}} de {{present}} han votado',
	'console.vote_reset_hint': 'Cierra o pausa la votación primero',
	// >>> voteSummary END
};

export default vote;
