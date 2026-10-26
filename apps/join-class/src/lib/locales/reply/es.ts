// Spanish strings of the replies on a proposal (IA 22): the reply sheet,
// the author's notice, the push question and the teacher's replies group.
// Spread into ../es.ts, so they ship in the same locale chunk.

const reply: Record<string, string> = {
	'reply.open': 'Comentarios · {{n}}',
	'reply.title': 'Comentarios a la propuesta',
	'reply.empty': 'Aún no hay comentarios. ¿Qué se podría mejorar?',
	'reply.placeholder': 'Escribe un comentario',
	'reply.send': 'Enviar',
	'reply.sending': 'Enviando…',
	'reply.by_author': 'Quienes escribieron la propuesta',
	'reply.by_teacher': 'Docente',
	'reply.new_n': '{{n}} comentarios nuevos',
	'reply.new_one': '1 comentario nuevo',
	'reply.improve': 'Mejorar mi propuesta',
	'reply.improve_closed': 'Las propuestas se podían mejorar hasta que se abrió la votación',
	'reply.refused':
		'El comentario no se envió: tiene palabras que podrían herir. Escribidlo de nuevo, con otras palabras.',
	'reply.failed': 'El comentario no se envió. Inténtalo de nuevo',
	'reply.too_long': 'Hasta {{max}} caracteres',
	'reply.hidden_mine': 'El docente ocultó este comentario',
	'reply.back': 'Volver',
	'reply.count_left': 'Quedan {{n}} caracteres',
	'reply.push_ask': '¿Quieres saber cuándo alguien comenta tu propuesta?',
	'reply.push_yes': 'Sí, avisadme',
	'reply.push_no': 'Ahora no',
	'reply.push_blocked':
		'El navegador bloquea las notificaciones. Los comentarios siguen apareciendo aquí en la app',
	'console.replies': 'Comentarios ({{n}})',
	'console.reply_placeholder': 'Comentario del docente',
	'reply.notice_one': 'Hay un comentario nuevo a vuestra propuesta · Leer',
	'reply.notice_n': '{{n}} comentarios nuevos a vuestra propuesta · Leer',
	'reply.new_tag': 'Nuevo',
	'reply.author_hint': 'Podéis responder o mejorar vuestra propuesta',
	'console.proposal_label': 'Propuesta',
	'console.reply_label': 'Comentario',
	'console.replies_n': '{{n}} comentarios',
	'console.replies_one': '1 comentario',
	'console.flags_n': '{{n}} intentos de publicar palabras hirientes',
	'console.flags_one': '1 intento de publicar palabras hirientes',
	'console.flag_count': '{{n}} intentos',
	'console.flag_count_one': '1 intento',
	'console.flag_show': 'Mostrar el texto',
	'console.flag_hide_text': 'Ocultar el texto',
	'console.flag_seen': 'Visto',
	'console.flag_target': 'Sobre la propuesta: {{text}}',
	'proposal.refused':
		'La propuesta no se envió: tiene palabras que podrían herir. Escribidla de nuevo, con otras palabras.',
	'text.checking': 'Comprobando…',
};

export default reply;
