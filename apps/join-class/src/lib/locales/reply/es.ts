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
	'reply.toast': 'Nuevo comentario a vuestra propuesta',
	'reply.toast_open': 'Leer',
	'reply.improve': 'Mejorar mi propuesta',
	'reply.improve_closed': 'Las propuestas se podían mejorar hasta que se abrió la votación',
	'reply.refused':
		'Parece que tu comentario tiene palabras hirientes. Intenta decirlo de otra forma.',
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
};

export default reply;
