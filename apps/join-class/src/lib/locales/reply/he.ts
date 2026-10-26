// Hebrew strings of the replies on a proposal (IA 22): the reply sheet,
// the author's notice, the push question and the teacher's replies group.
// Spread into ../he.ts, so they ship in the same locale chunk.

const reply: Record<string, string> = {
	'reply.open': 'תגובות · {{n}}',
	'reply.title': 'תגובות להצעה',
	'reply.empty': 'עוד אין תגובות. מה אפשר לשפר?',
	'reply.placeholder': 'כתבו תגובה',
	'reply.send': 'שליחה',
	'reply.sending': 'שולחים…',
	'reply.by_author': 'מי שכתבו את ההצעה',
	'reply.by_teacher': 'המורה',
	'reply.new_n': '{{n}} תגובות חדשות',
	'reply.new_one': 'תגובה חדשה',
	'reply.toast': 'תגובה חדשה להצעה שלכם',
	'reply.toast_open': 'לקריאה',
	'reply.improve': 'לשפר את ההצעה',
	'reply.improve_closed': 'אפשר היה לשפר עד שההצבעה נפתחה',
	'reply.refused': 'נראה שיש בתגובה מילה פוגענית. נסו לנסח אחרת',
	'reply.failed': 'התגובה לא נשלחה. לנסות שוב',
	'reply.too_long': 'עד {{max}} תווים',
	'reply.hidden_mine': 'המורה הסתירו את התגובה',
	'reply.back': 'חזרה',
	'reply.count_left': 'נשארו {{n}} תווים',
	'reply.push_ask': 'רוצים לדעת כשמגיבים להצעה שלכם?',
	'reply.push_yes': 'כן, להודיע לי',
	'reply.push_no': 'לא עכשיו',
	'reply.push_blocked': 'הדפדפן חוסם הודעות. אפשר לראות תגובות כאן באפליקציה',
	'console.replies': 'תגובות ({{n}})',
	'console.reply_placeholder': 'תגובה של המורה',
};

export default reply;
