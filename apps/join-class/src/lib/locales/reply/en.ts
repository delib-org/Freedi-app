// English strings of the replies on a proposal (IA 22): the reply sheet,
// the author's notice, the push question and the teacher's replies group.
// Spread into ../en.ts, so they ship in the same locale chunk.

const reply: Record<string, string> = {
	'reply.open': 'Replies · {{n}}',
	'reply.title': 'Replies to the proposal',
	'reply.empty': 'No replies yet. What could be better?',
	'reply.placeholder': 'Write a reply',
	'reply.send': 'Send',
	'reply.sending': 'Sending…',
	'reply.by_author': "The proposal's author",
	'reply.by_teacher': 'Teacher',
	'reply.new_n': '{{n}} new replies',
	'reply.new_one': '1 new reply',
	'reply.toast': 'New reply to your proposal',
	'reply.toast_open': 'Read',
	'reply.improve': 'Improve my proposal',
	'reply.improve_closed': 'Proposals could be improved until the vote opened',
	'reply.refused': 'Your reply seems to contain hurtful words. Try rephrasing.',
	'reply.failed': 'The reply was not sent. Try again',
	'reply.too_long': 'Up to {{max}} characters',
	'reply.hidden_mine': 'The teacher hid this reply',
	'reply.back': 'Back',
	'reply.count_left': '{{n}} characters left',
	'reply.push_ask': 'Want to know when someone replies to your proposal?',
	'reply.push_yes': 'Yes, tell me',
	'reply.push_no': 'Not now',
	'reply.push_blocked': 'The browser blocks notifications. Replies still show here in the app',
	'console.replies': 'Replies ({{n}})',
	'console.reply_placeholder': "The teacher's reply",
};

export default reply;
