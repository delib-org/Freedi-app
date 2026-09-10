import m from 'mithril';
import {
	AgoraStage,
	AgoraMessageKind,
	AgoraSuggestionStatus,
	AGORA_POINTS,
	StatementType,
	createAgoraThreadKey,
	type AgoraSession,
	type AgoraStagePlanItem,
} from '@freedi/shared-types';
import type { AgoraProposal } from '../src/lib/proposals';
import type { VillageCommunitySource } from '../src/components/VillageCommunity';
import { VillageShell } from '../src/components/VillageShell';
import { villagePlace } from '../src/lib/flows/villageRoute';
import { initI18n, setLang } from '../src/lib/i18n';
import '@fontsource/assistant/400.css';
import '@fontsource/assistant/700.css';
import '../src/styles/global.scss';
import '../src/styles/components.scss';
import '../src/styles/theme-civic.scss';
initI18n();
setLang('he');
const uid = new URLSearchParams(location.search).get('student') === 'noam' ? 'noam' : 'maya';
const names: Record<string, string> = { maya: 'מאיה', noam: 'נועם' };
const key = 'agora-village-community-demo-v1';
const plan: AgoraStagePlanItem[] = [
	{
		itemId: 'story',
		stage: AgoraStage.question,
		kind: 'story',
		statementId: 'story-q',
		title: 'הסיפור האישי',
	},
	{
		itemId: 'needs',
		stage: AgoraStage.question,
		kind: 'needs',
		statementId: 'needs-q',
		title: 'מה חשוב לנו',
	},
	{ itemId: 'solution', stage: AgoraStage.deliberation, title: 'סדנת הפתרונות' },
];
interface DemoState {
	notes: AgoraProposal[];
	messages: AgoraProposal[];
	points: Record<string, number>;
	seen: Record<string, number>;
}
function note(id: string, creatorId: string, text: string, parentId = 'solution'): AgoraProposal {
	return {
		statementId: id,
		creatorId,
		statement: text,
		parentId,
		anonName: names[creatorId],
		statementType: StatementType.option,
		createdAt: Date.now(),
		lastUpdate: Date.now(),
	};
}
function read(): DemoState {
	const raw = localStorage.getItem(key);
	return raw
		? JSON.parse(raw)
		: {
				notes: [
					note('maya-solution', 'maya', 'נקים מועצה שבה לכל קבוצה יהיה קול שווה.'),
					note('noam-solution', 'noam', 'נחלק את נטל המס לפי היכולת של כל משפחה.'),
					note('noam-story', 'noam', 'חשוב לי שגם אנשים שלא רגילים לדבר יישמעו.', 'story-q'),
					note('maya-needs', 'maya', 'אני צריכה להרגיש שההחלטה הוגנת לכולם.', 'needs-q'),
				],
				messages: [],
				points: { maya: 0, noam: 0 },
				seen: {},
			};
}
function write(change: (state: DemoState) => void) {
	const state = read();
	change(state);
	localStorage.setItem(key, JSON.stringify(state));
	m.redraw();
}
if (!localStorage.getItem(key)) write(() => {});
window.addEventListener('storage', () => m.redraw());
let viewingIndex = 2,
	draft = '',
	messageDraft = '';
const session = { sessionId: 'local-community-demo' } as AgoraSession;
const source: VillageCommunitySource = {
	notes: (item) => read().notes.filter((n) => n.parentId === (item.statementId ?? 'solution')),
	threads: (id) => {
		const result = new Map<string, AgoraProposal[]>();
		for (const msg of read().messages.filter((n) => n.parentId === id)) {
			const helper = msg.agoraThreadUserId!;
			result.set(helper, [...(result.get(helper) ?? []), msg]);
		}
		return result;
	},
	messages: (id, helper) =>
		read().messages.filter((n) => n.parentId === id && n.agoraThreadUserId === helper),
	unread: (id, messages, user) =>
		messages.filter((n) => n.creatorId !== user && n.createdAt > (read().seen[user + id] ?? 0))
			.length,
	renderThread: (a) => {
		const messages = source.messages(a.proposal.statementId, a.helperUid);
		const seenKey = uid + createAgoraThreadKey(a.proposal.statementId, a.helperUid);
		const newest = messages.reduce((n, r) => Math.max(n, r.createdAt), 0);
		if (newest > (read().seen[seenKey] ?? 0)) {
			const state = read();
			state.seen[seenKey] = newest;
			localStorage.setItem(key, JSON.stringify(state));
		}
		return m('.stack', [
			m('button.btn.btn--secondary', { onclick: a.onBack }, 'חזרה ללוח'),
			m('h3', a.proposal.statement),
			...messages.map((msg) =>
				m('.village-note', [
					m('strong', names[msg.creatorId]),
					m('p', msg.statement),
					msg.suggestionStatus === AgoraSuggestionStatus.thanked
						? m('small', 'נאמרה תודה · המטבע הוענק')
						: a.role === 'owner' && msg.creatorId !== uid
							? m(
									'button.btn.btn--primary',
									{
										onclick: () =>
											write((state) => {
												const current = state.messages.find(
													(r) => r.statementId === msg.statementId,
												);
												if (
													!current ||
													current.suggestionStatus === AgoraSuggestionStatus.thanked ||
													a.proposal.creatorId !== uid
												)
													return;
												current.suggestionStatus = AgoraSuggestionStatus.thanked;
												state.points[current.creatorId] =
													(state.points[current.creatorId] ?? 0) + AGORA_POINTS.SUGGESTION_THANKED;
											}),
									},
									'תודה על השיפור',
								)
							: null,
				]),
			),
			m('textarea.text-input', {
				placeholder: a.role === 'owner' ? 'כתבו תשובה' : 'איך אפשר לשפר את ההצעה?',
				value: messageDraft,
				oninput: (e: InputEvent) => {
					messageDraft = (e.target as HTMLTextAreaElement).value;
				},
			}),
			m(
				'button.btn.btn--primary',
				{
					disabled: !messageDraft.trim(),
					onclick: () => {
						const text = messageDraft.trim();
						messageDraft = '';
						write((state) =>
							state.messages.push({
								...note(crypto.randomUUID(), uid, text, a.proposal.statementId),
								statementType: StatementType.suggestion,
								agoraThreadUserId: a.helperUid,
								agoraMessageKind:
									a.role === 'owner' ? AgoraMessageKind.chat : AgoraMessageKind.suggestion,
							}),
						);
					},
				},
				'שליחת תגובה',
			),
		]);
	},
};
m.mount(document.getElementById('demo')!, {
	view: () =>
		m('main', { dir: 'rtl' }, [
			m(
				'header',
				{
					style: {
						padding: '12px',
						background: '#233f35',
						color: 'white',
						display: 'flex',
						gap: '16px',
						alignItems: 'center',
						flexWrap: 'wrap',
					},
				},
				[
					m('strong', `הדגמה מקומית · ${names[uid]} · המטבעות כאן הם להדגמה`),
					m(
						'a',
						{
							href: `?student=${uid === 'maya' ? 'noam' : 'maya'}`,
							target: '_blank',
							style: { color: '#ffe694' },
						},
						`פתיחת ${uid === 'maya' ? 'נועם' : 'מאיה'} בחלון נוסף`,
					),
				],
			),
			m(
				VillageShell,
				{
					plan,
					currentIndex: 2,
					viewingIndex,
					onSelectBook: (id: string) => {
						viewingIndex = plan.findIndex((p) => p.itemId === id);
					},
					papers: source
						.notes(plan[viewingIndex])
						.map((n) => ({ text: n.statement, own: n.creatorId === uid })),
					stationPapers: plan.map((p) => ({
						itemId: p.itemId,
						place: villagePlace(p),
						papers: source.notes(p).map((n) => ({ text: n.statement, own: n.creatorId === uid })),
					})),
					community: {
						session,
						userId: uid,
						anonName: names[uid],
						points: read().points[uid],
						source,
					},
				},
				[
					m('h2', plan[viewingIndex].title),
					m('textarea.text-input', {
						placeholder: 'כתבו את הפתק שלכם',
						value: draft,
						oninput: (e: InputEvent) => {
							draft = (e.target as HTMLTextAreaElement).value;
						},
					}),
					m(
						'button.btn.btn--primary',
						{
							disabled: !draft.trim(),
							onclick: () => {
								write((state) => {
									const parent = plan[viewingIndex].statementId ?? 'solution';
									const existing = state.notes.find(
										(n) => n.creatorId === uid && n.parentId === parent,
									);
									if (existing) existing.statement = draft.trim();
									else state.notes.push(note(crypto.randomUUID(), uid, draft.trim(), parent));
								});
								draft = '';
							},
						},
						'פרסום הפתק',
					),
				],
			),
		]),
});
