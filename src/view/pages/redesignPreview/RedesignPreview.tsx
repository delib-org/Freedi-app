import AgreementPreview from './QuestionJourney';
import React, { FormEvent, useRef, useState } from 'react';
import {
	ArrowLeft,
	ArrowUpRight,
	Check,
	ChevronRight,
	HelpCircle,
	Lightbulb,
	MessageCircle,
	Moon,
	Plus,
	Send,
	Sun,
	Users,
	X,
} from 'lucide-react';
import ThinkingSpace from '@/view/components/atomic/organisms/ThinkingSpace/ThinkingSpace';
import ConversationHome, {
	ConversationSummary,
} from '@/view/components/atomic/organisms/ThinkingSpace/ConversationHome';
import ConversationWelcome from '@/view/components/atomic/organisms/ThinkingSpace/ConversationWelcome';
import DecisionBoard, {
	EmergingIdea,
} from '@/view/components/atomic/organisms/ThinkingSpace/DecisionBoard';
import styles from './RedesignPreview.module.scss';

const t = (text: string): string => text;
const initialConversations: ConversationSummary[] = [
	{
		id: 'courtyard',
		title: 'What could our shared courtyard become?',
		description:
			'A little more green, a place to meet, a space for everyone. Let’s imagine it together.',
		isGroup: false,
		recentAuthor: 'Maya',
		recentText: 'What if we tried it for one month first?',
	},
	{
		id: 'neighborhood',
		title: 'Our neighborhood, a little better',
		description: 'Neighbors sharing small ideas that could make a big difference.',
		isGroup: true,
		recentAuthor: 'Amir',
		recentText: 'I love the idea of a Sunday swap table.',
	},
	{
		id: 'work',
		title: 'Making room for focused work',
		description: 'How can we balance time together and time to think?',
		isGroup: false,
		recentAuthor: 'Noa',
		recentText: 'Could we keep Wednesday mornings meeting-free?',
	},
	{
		id: 'weekend',
		title: 'Let’s make a weekend of it',
		description: 'Find a plan that works for the whole group. All possibilities welcome.',
		isGroup: true,
		recentAuthor: 'Daniel',
		recentText: 'Somewhere we can get to by train would be great.',
	},
];
const initialIdeas: EmergingIdea[] = [
	{
		id: 'garden',
		title: 'A shared garden, with a place to sit',
		evaluators: 18,
		mean: 0.72,
		synthesisSources: 3,
	},
	{ id: 'dinner', title: 'A monthly bring-a-dish evening', evaluators: 12, mean: 0.58 },
	{ id: 'trial', title: 'Try a small garden corner for a month', evaluators: 2, mean: 0.8 },
];
interface ExampleMessage {
	id: string;
	author: string;
	text: string;
	time: string;
	tone: number;
}
const initialMessages: ExampleMessage[] = [
	{
		id: 'm1',
		author: 'Maya',
		text: 'I’d love somewhere to sit with a coffee and actually get to know our neighbors. Maybe a few raised planters and a shared table?',
		time: '10:24',
		tone: 0,
	},
	{
		id: 'm2',
		author: 'Amir',
		text: 'Yes to more green 🌱 My only concern is who will look after it when people are away. Could we keep the first version really small?',
		time: '10:27',
		tone: 1,
	},
	{
		id: 'm3',
		author: 'Noa',
		text: 'What if we tried one corner for a month? We could learn what works before committing to the whole courtyard.',
		time: '10:31',
		tone: 2,
	},
];

export default function RedesignPreview() {
	const [view, setView] = useState(
		new URLSearchParams(location.search).get('view') === 'home' ? 'home' : 'courtyard',
	);
	const [conversations, setConversations] = useState(initialConversations);
	const [messages, setMessages] = useState(initialMessages);
	const [ideas, setIdeas] = useState(initialIdeas);
	const [tab, setTab] = useState('chat');
	const [draft, setDraft] = useState('');
	const [dialog, setDialog] = useState<
		'create' | 'proposal' | 'profile' | 'map' | 'sources' | null
	>(null);
	const [selectedIdea, setSelectedIdea] = useState<EmergingIdea | null>(null);
	const [reply, setReply] = useState('');
	const [rating, setRating] = useState<Record<string, number>>({});
	const [dark, setDark] = useState(false);
	const [rtl, setRtl] = useState(false);
	const [notice, setNotice] = useState('');
	const input = useRef<HTMLTextAreaElement>(null);
	const modal = useRef<HTMLDialogElement>(null);
	const active = conversations.find((item) => item.id === view);
	const isCourtyard = view === 'courtyard';
	const currentIdeas = isCourtyard ? ideas : [];
	const openDialog = (next: typeof dialog): void => {
		setDialog(next);
		modal.current?.showModal();
	};
	const closeDialog = (): void => {
		modal.current?.close();
		setDialog(null);
		setSelectedIdea(null);
	};
	const openSpace = (id: string): void => {
		setView(id);
		setTab('chat');
		setReply('');
		setDraft('');
	};
	const submit = (event: FormEvent): void => {
		event.preventDefault();
		if (!draft.trim()) return;
		setMessages((previous) => [
			...previous,
			{
				id: crypto.randomUUID(),
				author: 'You',
				text: `${reply ? `↳ ${reply}\n` : ''}${draft.trim()}`,
				time: 'Now',
				tone: 2,
			},
		]);
		setDraft('');
		setReply('');
		setNotice('Your thought has a place here.');
	};
	const create = (event: FormEvent<HTMLFormElement>): void => {
		event.preventDefault();
		const data = new FormData(event.currentTarget);
		const title = String(data.get('title') || '').trim();
		if (!title) return;
		if (dialog === 'proposal') {
			setIdeas((previous) => [{ id: crypto.randomUUID(), title, evaluators: 0 }, ...previous]);
			setTab('options');
		} else {
			const id = crypto.randomUUID();
			setConversations((previous) => [{ id, title, isGroup: false }, ...previous]);
			openSpace(id);
		}
		closeDialog();
	};
	const weighIn = (idea: EmergingIdea, value: number): void => {
		const old = rating[idea.id];
		setRating((previous) => ({ ...previous, [idea.id]: value }));
		setIdeas((previous) =>
			previous.map((item) =>
				item.id === idea.id
					? {
							...item,
							evaluators: item.evaluators + (old === undefined ? 1 : 0),
							mean:
								((item.mean ?? 0) * item.evaluators - (old ?? 0) + value) /
								(item.evaluators + (old === undefined ? 1 : 0)),
						}
					: item,
			),
		);
		setNotice('Your perspective is included. You can change it any time.');
	};

	if (view === 'courtyard') return <AgreementPreview onHome={() => openSpace('home')} />;

	return (
		<div data-theme={dark ? 'dark' : 'light'}>
			<ThinkingSpace
				t={t}
				dir={rtl ? 'rtl' : 'ltr'}
				spaces={conversations.filter((item) => item.isGroup)}
				activeId={view === 'home' ? undefined : view}
				userName="Alex Morgan"
				onHome={() => openSpace('home')}
				onProfile={() => openDialog('profile')}
				onOpen={openSpace}
				onCreate={() => openDialog('create')}
				tools={
					<div className={styles.preview__tools}>
						<span>
							<span className={styles.preview__dot} />
							Example space <span className={styles.preview__local}>· local preview</span>
						</span>
						<div>
							<button onClick={() => openSpace(view === 'home' ? 'courtyard' : 'home')}>
								{view === 'home' ? 'Open conversation' : 'Home'}
								<ArrowUpRight size={13} />
							</button>
							<button aria-pressed={rtl} onClick={() => setRtl(!rtl)}>
								RTL
							</button>
							<button
								onClick={() => setDark(!dark)}
								aria-label={dark ? 'Light theme' : 'Dark theme'}
							>
								{dark ? <Sun size={16} /> : <Moon size={16} />}
							</button>
						</div>
					</div>
				}
				aside={
					view !== 'home' ? (
						<DecisionBoard
							t={t}
							ideas={currentIdeas}
							showResults
							onOpen={(id) => {
								setSelectedIdea(currentIdeas.find((idea) => idea.id === id) || null);
								openDialog('sources');
							}}
							onExplore={() => setTab('options')}
							onContribute={isCourtyard ? () => openDialog('proposal') : undefined}
							onMap={() => openDialog('map')}
						/>
					) : undefined
				}
			>
				{view === 'home' ? (
					<ConversationHome
						t={t}
						conversations={conversations}
						userName="Alex"
						onOpen={openSpace}
						onCreate={() => openDialog('create')}
					/>
				) : (
					<>
						<header className={styles.preview__header}>
							<button className={styles.preview__breadcrumb} onClick={() => openSpace('home')}>
								<ArrowLeft size={15} />
								Your conversations
								<ChevronRight size={13} />
								<span>Shared courtyard</span>
							</button>
							<div className={styles.preview__title}>
								<h1>{active?.title || 'A new conversation'}</h1>
								<span className={styles.preview__titleFlower} aria-hidden="true">
									✳
								</span>
							</div>
							<p>A space to listen, imagine, and find a way forward.</p>
							<div className={styles.preview__headerBottom}>
								<div className={styles.preview__tabs} role="group" aria-label="Conversation views">
									{[
										{ id: 'chat', label: 'Conversation', icon: MessageCircle },
										{ id: 'options', label: 'Proposals', icon: Lightbulb },
										{ id: 'questions', label: 'Questions', icon: HelpCircle },
									].map(({ id, label, icon: Icon }) => (
										<button key={id} aria-pressed={tab === id} onClick={() => setTab(id)}>
											<Icon size={16} />
											{label}
											{id === 'options' && <span>{currentIdeas.length}</span>}
										</button>
									))}
								</div>
								{isCourtyard && (
									<span className={styles.preview__people}>
										<span>M</span>
										<span>A</span>
										<span>N</span>
										<small>Thinking together</small>
									</span>
								)}
							</div>
						</header>
						<main className={styles.preview__main}>
							{tab === 'chat' ? (
								<>
									<ConversationWelcome t={t} compact />
									<div className={styles.preview__day}>
										<span />
										Today
										<span />
									</div>
									{isCourtyard ? (
										messages.map((message) => (
											<article key={message.id} className={styles.preview__message}>
												<div className={styles.preview__avatar} data-tone={message.tone}>
													{message.author.charAt(0)}
												</div>
												<div className={styles.preview__messageBody}>
													<div className={styles.preview__messageMeta}>
														<strong>{message.author}</strong>
														<time>{message.time}</time>
														{message.author === 'You' && <Check size={13} />}
													</div>
													<p>{message.text}</p>
													<div className={styles.preview__messageActions}>
														<button
															onClick={() => {
																setReply(message.text);
																input.current?.focus();
															}}
														>
															<MessageCircle size={13} />
															Reply
														</button>
														{message.author === 'You' && (
															<button
																onClick={() => {
																	setDraft('');
																	openDialog('proposal');
																}}
															>
																<Lightbulb size={13} />
																Build a proposal
															</button>
														)}
													</div>
												</div>
											</article>
										))
									) : (
										<div className={styles.preview__empty}>
											<MessageCircle size={30} />
											<h2>A fresh conversation.</h2>
											<p>Bring a question. Leave room for possibility.</p>
										</div>
									)}
									{isCourtyard && (
										<div className={styles.preview__bridge}>
											<span className={styles.preview__bridgeIcon}>
												<Lightbulb size={20} />
											</span>
											<div>
												<strong>A possibility is taking shape</strong>
												<p>“Try a small garden corner for a month”</p>
											</div>
											<button onClick={() => setTab('options')} aria-label="Explore the proposal">
												<ArrowUpRight size={20} />
											</button>
										</div>
									)}
								</>
							) : tab === 'options' ? (
								<div className={styles.preview__proposals}>
									<div className={styles.preview__sectionHeading}>
										<div>
											<h2>What could work for us?</h2>
											<p>Explore an idea. Say how you feel. Make it better.</p>
										</div>
										{isCourtyard && (
											<button onClick={() => openDialog('proposal')}>
												<Plus size={16} />
												Add an idea
											</button>
										)}
									</div>
									{currentIdeas.map((idea) => (
										<article className={styles.preview__proposal} key={idea.id}>
											<span className={styles.preview__proposalLabel}>
												{idea.synthesisSources ? 'SYNTHESIZED PROPOSAL' : 'INDIVIDUAL PROPOSAL'}
											</span>
											<h3>{idea.title}</h3>
											<p>
												{idea.evaluators} people evaluated ·{' '}
												{idea.mean === undefined
													? 'Not evaluated yet'
													: `${Math.round(idea.mean * 100)}% average sentiment`}
											</p>
											{idea.synthesisSources && (
												<button
													className={styles.preview__sourceButton}
													onClick={() => {
														setSelectedIdea(idea);
														openDialog('sources');
													}}
												>
													See {idea.synthesisSources} original contributions{' '}
													<ArrowUpRight size={13} />
												</button>
											)}
											<div
												className={styles.preview__rating}
												role="group"
												aria-label={`Evaluate: ${idea.title}`}
											>
												{[
													{ value: -1, icon: '☹', label: 'Strongly oppose' },
													{ value: -0.5, icon: '◔', label: 'Lean against' },
													{ value: 0, icon: '−', label: 'Neutral' },
													{ value: 0.5, icon: '◕', label: 'Lean toward' },
													{ value: 1, icon: '☺', label: 'Strongly support' },
												].map((option) => (
													<button
														key={option.value}
														aria-pressed={rating[idea.id] === option.value}
														aria-label={option.label}
														title={option.label}
														onClick={() => weighIn(idea, option.value)}
													>
														{option.icon}
													</button>
												))}
											</div>
											<div className={styles.preview__scaleLabels}>
												<span>Strongly oppose</span>
												<span>Strongly support</span>
											</div>
										</article>
									))}
								</div>
							) : (
								<div className={styles.preview__questions}>
									<HelpCircle size={28} />
									<h2>Good questions open new doors.</h2>
									<p>What do we need to understand before deciding?</p>
									{isCourtyard && (
										<button
											onClick={() => {
												setTab('chat');
												setReply('Who would care for the garden when people are away?');
												input.current?.focus();
											}}
										>
											Who would care for the garden when people are away?{' '}
											<MessageCircle size={16} />
										</button>
									)}
								</div>
							)}
						</main>
						{tab === 'chat' && (
							<div className={styles.preview__composer}>
								{reply && (
									<div className={styles.preview__reply}>
										Replying to: {reply.slice(0, 75)}
										<button onClick={() => setReply('')} aria-label="Cancel reply">
											<X size={15} />
										</button>
									</div>
								)}
								<form onSubmit={submit}>
									<textarea
										ref={input}
										value={draft}
										onChange={(event) => setDraft(event.target.value)}
										aria-label="Share a thought"
										placeholder="Share a thought, a question, a possibility…"
										rows={2}
									/>
									<button
										type="submit"
										disabled={!draft.trim() || !isCourtyard}
										aria-label="Send message"
									>
										<Send size={19} />
									</button>
								</form>
								<span>
									{isCourtyard
										? 'Different perspectives belong here.'
										: 'Open the courtyard example to try messaging.'}
								</span>
							</div>
						)}
					</>
				)}
				<div className={styles.preview__notice} role="status">
					{notice}
				</div>
				<dialog
					ref={modal}
					className={styles.preview__dialog}
					onCancel={() => {
						setDialog(null);
						setSelectedIdea(null);
					}}
				>
					<button className={styles.preview__close} onClick={closeDialog} aria-label="Close">
						<X size={20} />
					</button>
					{dialog === 'create' || dialog === 'proposal' ? (
						<form onSubmit={create}>
							<span className={styles.preview__modalFlower} aria-hidden="true">
								✳
							</span>
							<h2>{dialog === 'proposal' ? 'A new possibility' : 'What shall we think about?'}</h2>
							<p>
								{dialog === 'proposal'
									? 'Keep the idea specific. Leave space to develop it together.'
									: 'Start with a question that invites different perspectives.'}
							</p>
							<label htmlFor="new-title">
								{dialog === 'proposal' ? 'Your proposal' : 'Your question'}
							</label>
							<textarea
								id="new-title"
								name="title"
								required
								autoFocus
								rows={3}
								placeholder={dialog === 'proposal' ? 'We could…' : 'How might we…'}
							/>
							<button className={styles.preview__primary} type="submit">
								{dialog === 'proposal' ? 'Add proposal' : 'Start conversation'}
								<ArrowUpRight size={17} />
							</button>
							<small>Example content stays in this preview until you refresh.</small>
						</form>
					) : dialog === 'sources' ? (
						<>
							<span className={styles.preview__modalFlower} aria-hidden="true">
								✳
							</span>
							<h2>{selectedIdea?.title}</h2>
							<p>
								{selectedIdea?.synthesisSources
									? 'Different words, the same proposal. The originals remain visible.'
									: 'An individual proposal, with room to develop.'}
							</p>
							{selectedIdea?.id === 'garden' ? (
								[
									'Let’s add a shared garden with seating in the courtyard.',
									'I’d like communal garden beds and somewhere for neighbors to sit.',
									'Create a garden and seating area we can all share.',
								].map((text, index) => (
									<blockquote key={text}>
										<span>Original contribution {index + 1}</span>
										{text}
									</blockquote>
								))
							) : (
								<blockquote>{selectedIdea?.title}</blockquote>
							)}
							<button
								className={styles.preview__primary}
								onClick={() => {
									closeDialog();
									setTab('options');
								}}
							>
								Explore and evaluate
								<ArrowUpRight size={16} />
							</button>
						</>
					) : dialog === 'map' ? (
						<>
							<h2>Different possibilities. Shared context.</h2>
							<p>A theme helps us explore. It does not imply agreement.</p>
							<div className={styles.preview__map}>
								<span>
									<Users size={18} />
									Shared courtyard
								</span>
								{currentIdeas.map((idea) => (
									<button
										key={idea.id}
										onClick={() => {
											setSelectedIdea(idea);
											setDialog('sources');
										}}
									>
										<Lightbulb size={16} />
										{idea.title}
									</button>
								))}
							</div>
						</>
					) : (
						<>
							<h2>Your corner of Freedi</h2>
							<p>
								This interactive example demonstrates the new home, conversation, proposal
								exploration, and evaluation experience.
							</p>
							<p>
								In the main app, your existing profile, notifications, and memberships remain
								connected.
							</p>
						</>
					)}
				</dialog>
			</ThinkingSpace>
		</div>
	);
}
