import PreviewMaps, { MapQuestion } from './PreviewMaps';
import React, { FormEvent, useRef, useState } from 'react';
import {
	ArrowLeft,
	ArrowUpRight,
	FileText,
	Lightbulb,
	Map,
	MessageCircle,
	Moon,
	Plus,
	Sparkles,
	Sun,
	X,
} from 'lucide-react';
import ThinkingSpace from '@/view/components/atomic/organisms/ThinkingSpace/ThinkingSpace';
import styles from '@/view/components/atomic/organisms/ThinkingSpace/Agreement.module.scss';
import {
	evidence,
	exportCovenant,
	Workflow,
	WorkflowAction,
	Proposal,
	rankProposals,
	reviewReadiness,
} from './workflowModel';

type View = 'overview' | 'options' | 'covenant' | 'summary' | 'maps' | 'chat' | 'option';
type FormKind = 'add' | 'revise' | 'concern' | 'amend' | 'comment' | null;
const navigation: { id: View; label: string; icon: typeof Lightbulb }[] = [
	{ id: 'overview', label: 'Question', icon: Sparkles },
	{ id: 'options', label: 'Solutions', icon: Lightbulb },
	{ id: 'covenant', label: 'Our אמנה', icon: FileText },
	{ id: 'chat', label: 'Conversation', icon: MessageCircle },
	{ id: 'summary', label: 'Summary', icon: FileText },
	{ id: 'maps', label: 'Maps', icon: Map },
];
const percent = (n?: number): string => (n === undefined ? '—' : `${Math.round(n * 100)}%`);

function Evidence({ proposal }: { proposal: Proposal }) {
	const e = evidence(proposal.votes);

	return (
		<>
			<div className={styles.journey__stats}>
				<span>
					<strong>{percent(e.score)}</strong>Consensus score
				</span>
				<span>
					<strong>{percent(e.mean)}</strong>Average sentiment
				</span>
				<span>
					<strong>{e.n}</strong>People evaluated
				</span>
			</div>
			<div className={styles.journey__evidence}>
				<span>{e.support} support</span>
				<span>{e.neutral} neutral</span>
				<span>{e.oppose} oppose</span>
				{e.n < 3 && <span>Needs more evaluation</span>}
			</div>
		</>
	);
}

export default function AgreementPreview({
	onHome,
	questionTitle,
	state,
	dispatch,
	hierarchy,
	breadcrumbs,
	onStartQuestion,
	mapQuestions,
	questionId,
	onMapQuestion,
}: {
	onHome: () => void;
	questionTitle: string;
	state: Workflow;
	dispatch: (action: WorkflowAction) => void;
	hierarchy: React.ReactNode;
	breadcrumbs: React.ReactNode;
	onStartQuestion: () => void;
	mapQuestions: MapQuestion[];
	questionId: string;
	onMapQuestion: (id: string) => void;
}) {
	const [view, setView] = useState<View>(
		new URLSearchParams(location.search).get('tab') === 'maps' ? 'maps' : 'overview',
	);
	const [selected, setSelected] = useState('trial');
	const [filter, setFilter] = useState('ranked');
	const [formKind, setFormKind] = useState<FormKind>(null);
	const [clauseId, setClauseId] = useState('');
	const [dark, setDark] = useState(false);
	const [rtl, setRtl] = useState(false);
	const [notice, setNotice] = useState('');
	const [messages, setMessages] = useState(
		questionTitle === 'What could our courtyard become?'
			? [
					{
						author: 'Amir',
						text: 'I like the garden idea. Who will care for it when people are away?',
					},
					{
						author: 'Noa',
						text: 'I proposed a small trial with a care rota. Could that address the maintenance concern?',
					},
				]
			: [],
	);
	const modal = useRef<HTMLDialogElement>(null);
	const body = useRef<HTMLDivElement>(null);
	const ranked = rankProposals(state.proposals);
	const proposal = state.proposals.find((p) => p.id === selected) ?? state.proposals[0];
	const latest = state.versions.at(-1);
	const concerns = state.proposals.flatMap((p) =>
		p.concerns.filter((c) => !c.resolved).map((c) => ({ ...c, proposalId: p.id })),
	);
	const themes = state.proposals.length
		? [...new Set(state.proposals.map((p) => p.theme))]
		: ['Ideas'];
	const go = (next: View): void => {
		setView(next);
		body.current?.scrollTo({ top: 0 });
	};
	const open = (id: string): void => {
		setSelected(id);
		go('option');
	};
	const showForm = (kind: FormKind, id?: string): void => {
		setClauseId(id ?? '');
		setFormKind(kind);
		modal.current?.showModal();
	};
	const close = (): void => {
		modal.current?.close();
		setFormKind(null);
	};
	const submitForm = (event: FormEvent<HTMLFormElement>): void => {
		event.preventDefault();
		const data = new FormData(event.currentTarget);
		const text = String(data.get('text') ?? '').trim();
		const reason = String(data.get('reason') ?? '').trim();
		if (!text) return;
		if (formKind === 'add' || formKind === 'revise') {
			const id = crypto.randomUUID();
			dispatch({
				type: 'add',
				proposal: {
					id,
					text,
					theme:
						formKind === 'revise'
							? proposal.theme
							: String(data.get('theme') ?? themes[0] ?? 'Ideas'),
					author: 'You',
					votes: {},
					concerns: [],
					...(formKind === 'revise' ? { previousId: proposal.id } : {}),
				},
			});
			setSelected(id);
			go('option');
			setNotice('New wording, fresh evaluation. Previous evaluations stay with the original.');
		} else if (formKind === 'concern') {
			dispatch({
				type: 'concern',
				id: proposal.id,
				concern: { id: crypto.randomUUID(), author: 'You', text, resolved: false },
			});
			setNotice('Your concern is recorded. You decide whether it has been addressed.');
		} else if (formKind === 'amend') {
			dispatch({ type: 'amend', id: clauseId, text, reason });
			setNotice('Draft amended. The previous wording and your reason are recorded.');
		} else if (formKind === 'comment') {
			dispatch({ type: 'comment', id: clauseId, text });
			setNotice('Comment added to this clause.');
		}
		close();
	};
	const exportDocument = (): void => {
		const blob = new Blob([exportCovenant(state, questionTitle)], {
			type: 'text/markdown;charset=utf-8',
		});
		const url = URL.createObjectURL(blob);
		const anchor = document.createElement('a');
		anchor.href = url;
		anchor.download = 'question-covenant-example.md';
		anchor.click();
		window.setTimeout(() => URL.revokeObjectURL(url), 1000);
	};
	const card = (p: Proposal, index = 0): React.ReactNode => (
		<article className={styles.journey__card} data-tone={index % 2 ? 'peach' : 'mint'} key={p.id}>
			<span className={styles.journey__eyebrow}>
				{p.theme} ·{' '}
				{p.sources
					? 'Equivalent proposals synthesized'
					: p.previousId
						? 'Improved wording'
						: 'Original proposal'}
			</span>
			<h3>{p.text}</h3>
			<Evidence proposal={p} />
			<div className={styles.journey__actions}>
				<button onClick={() => open(p.id)}>
					Explore & improve <ArrowUpRight size={16} />
				</button>
			</div>
		</article>
	);

	return (
		<div data-theme={dark ? 'dark' : 'light'}>
			<ThinkingSpace
				t={(text) => text}
				dir={rtl ? 'rtl' : 'ltr'}
				spaces={[{ id: 'courtyard', title: questionTitle }]}
				activeId="courtyard"
				userName="Alex · example participant"
				onHome={onHome}
				onProfile={() => {
					go('overview');
					setNotice(
						'Local design example: you can explore participant actions and facilitator review controls. No shared records are changed.',
					);
				}}
				onOpen={() => go('overview')}
				onCreate={() => {
					go('overview');
					onStartQuestion();
				}}
				tools={
					<div className={`${styles.journey} ${styles.journey__tools}`}>
						<span>Local example · temporary changes</span>
						<div>
							<button onClick={onHome}>Home</button>
							<button aria-pressed={rtl} onClick={() => setRtl(!rtl)}>
								RTL
							</button>
							<button
								aria-label={dark ? 'Light theme' : 'Dark theme'}
								onClick={() => setDark(!dark)}
							>
								{dark ? <Sun size={16} /> : <Moon size={16} />}
							</button>
						</div>
					</div>
				}
				aside={
					view !== 'maps' && (
						<aside className={`${styles.journey} ${styles.journey__aside}`}>
							<span className={styles.journey__eyebrow}>What we are building</span>
							<h2>
								Our shared
								<br />
								אמנה
							</h2>
							<p className={styles.journey__muted}>A shared commitment, shaped by everyone.</p>
							<div className={styles.journey__card} data-tone="yellow">
								<h3>
									{state.clauses.length
										? `${state.clauses.length} ${state.clauses.length === 1 ? 'clause' : 'clauses'} taking shape`
										: 'Our first clause starts here'}
								</h3>
								<p>
									{state.phase !== 'draft'
										? `Version ${latest?.number} ${state.phase === 'adopted' ? 'is adopted in this example.' : 'is open for review.'}`
										: 'Explore options, work through concerns, then bring the wording together.'}
								</p>
								<div className={styles.journey__actions}>
									<button onClick={() => go('covenant')}>
										Open our אמנה <ArrowUpRight size={16} />
									</button>
								</div>
							</div>
							<div className={styles.journey__section}>
								<span className={styles.journey__eyebrow}>Make room for concerns</span>
								<div className={styles.journey__list}>
									{concerns.slice(0, 3).map((c) => (
										<button key={c.id} onClick={() => open(c.proposalId)}>
											<span>{c.text}</span>
											<ArrowUpRight size={18} />
										</button>
									))}
								</div>
							</div>
							<div className={styles.journey__actions}>
								<button onClick={() => go('summary')}>Where we stand</button>
								<button onClick={() => go('maps')}>Explore the maps</button>
							</div>
							<p className={styles.journey__muted}>
								All people, evaluations, and positions here are example data. Silence is never
								counted as consent.
							</p>
						</aside>
					)
				}
			>
				<header className={`${styles.journey} ${styles.journey__header}`}>
					{breadcrumbs}
					<div className={styles.journey__title}>
						<h1>{questionTitle}</h1>
						<span aria-hidden="true">✳</span>
					</div>
					<nav className={styles.journey__nav} aria-label="Agreement workspaces">
						{navigation.map(({ id, label, icon: Icon }) => (
							<button
								key={id}
								aria-pressed={view === id || (view === 'option' && id === 'options')}
								onClick={() => go(id)}
							>
								<Icon size={16} />
								{label}
							</button>
						))}
					</nav>
				</header>
				<div className={`${styles.journey} ${styles.journey__body}`} ref={body}>
					{view !== 'maps' && (
						<ol className={styles.journey__steps} aria-label="Path to an agreement">
							{[
								'Answer this question',
								'Improve solutions',
								'Draft the אמנה',
								'Review & adopt',
							].map((label, i) => (
								<li
									key={label}
									aria-current={
										(state.phase !== 'draft'
											? 3
											: state.clauses.length
												? 2
												: state.proposals.length
													? 1
													: 0) === i
											? 'step'
											: undefined
									}
								>
									<span>{i + 1}</span>
									{label}
									{i < 3 && ' →'}
								</li>
							))}
						</ol>
					)}

					{view === 'overview' && (
						<>
							<div className={styles.journey__hero}>
								<div>
									<span className={styles.journey__eyebrow}>Our starting question</span>
									<h2>{questionTitle}</h2>
									<p>
										Propose a solution, or open a sub-question when something needs more thought.
										Work through each branch, then use what you learn to improve the answer here.
									</p>
									<div className={styles.journey__actions}>
										<button className={styles.journey__primary} onClick={() => showForm('add')}>
											Propose a solution +
										</button>
										<button onClick={() => go('chat')}>Discuss this question</button>
									</div>
								</div>
								<span className={styles.journey__flower} aria-hidden="true">
									?
								</span>
							</div>
							{hierarchy}
							<section className={styles.journey__section}>
								<h3>Solutions to this question · {state.proposals.length}</h3>
								<p>
									Evaluate and improve these answers. A sub-question’s support does not
									automatically become support for its parent.
								</p>
								{!state.proposals.length && <p>No solutions yet. Start with a possibility.</p>}
							</section>
							<div className={styles.journey__grid}>
								<div className={styles.journey__card} data-tone="yellow">
									<span className={styles.journey__eyebrow}>A useful next step</span>
									<h3>Give a new idea a fair hearing</h3>
									<p>
										{state.proposals.filter((p) => evidence(p.votes).n < 3).length} options still
										need more perspectives. A small sample is not broad agreement.
									</p>
									<div className={styles.journey__actions}>
										<button
											onClick={() => {
												setFilter('needs');
												go('options');
											}}
										>
											Evaluate an under-heard idea
										</button>
									</div>
								</div>
								<div className={styles.journey__card} data-tone="peach">
									<span className={styles.journey__eyebrow}>The work still ahead</span>
									<h3>{concerns.length} concerns to explore</h3>
									<p>
										Work through the concerns about these solutions. Better wording can make room
										for everyone.
									</p>
									<div className={styles.journey__actions}>
										<button
											onClick={() => {
												setFilter('concerns');
												go('options');
											}}
										>
											Work through concerns
										</button>
									</div>
								</div>
							</div>
							<section className={styles.journey__section}>
								<h3>Strongest common ground so far</h3>
								<p className={styles.journey__muted}>
									Ranked by the existing confidence-adjusted consensus formula. These are candidates
									to develop, not adopted decisions.
								</p>
								<div className={styles.journey__grid}>{ranked.slice(0, 2).map(card)}</div>
							</section>
						</>
					)}
					{view === 'options' && (
						<>
							<div className={styles.journey__title}>
								<div>
									<h2>
										Find the possibilities
										<br />
										<strong>we can build on.</strong>
									</h2>
									<p className={styles.journey__muted}>The whole range of views belongs here.</p>
								</div>
								<button className={styles.journey__primary} onClick={() => showForm('add')}>
									<Plus size={16} /> Add option
								</button>
							</div>
							<div className={styles.journey__nav} role="group" aria-label="Filter options">
								{[
									['ranked', 'Common ground'],
									['needs', 'Needs evaluation'],
									['concerns', 'With concerns'],
									['new', 'Newest'],
								].map(([id, label]) => (
									<button key={id} aria-pressed={filter === id} onClick={() => setFilter(id)}>
										{label}
									</button>
								))}
							</div>
							{(filter === 'new'
								? [...state.proposals].reverse()
								: filter === 'needs'
									? [...state.proposals]
											.sort((a, b) => evidence(a.votes).n - evidence(b.votes).n)
											.filter((p) => evidence(p.votes).n < 3)
									: filter === 'concerns'
										? ranked.filter((p) => p.concerns.some((c) => !c.resolved))
										: ranked
							).map(card)}
							<details className={styles.journey__section}>
								<summary>How to read the ranking</summary>
								<p>
									Consensus score is a cautious estimate that accounts for sample size and
									variation. Average sentiment describes the evaluations received. Neither number
									means that everyone consents, and strong opposition stays visible.
								</p>
							</details>
						</>
					)}
					{view === 'option' && proposal && (
						<>
							<button onClick={() => go('options')}>
								<ArrowLeft size={15} /> All options
							</button>
							<article className={styles.journey__card} data-tone="mint">
								<span className={styles.journey__eyebrow}>
									{proposal.theme} · {proposal.author}
								</span>
								<h2>{proposal.text}</h2>
								<Evidence proposal={proposal} />
								<h3 className={styles.journey__section}>How does this wording work for you?</h3>
								<div
									className={styles.journey__rating}
									role="group"
									aria-label="Evaluate this wording"
								>
									{[
										[-1, 'Oppose'],
										[-0.5, 'Lean against'],
										[0, 'Neutral'],
										[0.5, 'Lean toward'],
										[1, 'Support'],
									].map(([value, label]) => (
										<button
											key={value}
											aria-pressed={proposal.votes.you === value}
											onClick={() => {
												dispatch({ type: 'rate', id: proposal.id, value: Number(value) });
												setNotice(
													'Your evaluation is recorded for this option. You can change it.',
												);
											}}
										>
											<b>
												{Number(value) > 0 ? '+' : ''}
												{value}
											</b>
											{label}
										</button>
									))}
								</div>
								<div className={styles.journey__actions}>
									<button onClick={() => showForm('concern')}>Explain a concern</button>
									<button onClick={() => showForm('revise')}>Propose improved wording</button>
									<button
										className={styles.journey__primary}
										disabled={
											state.phase !== 'draft' ||
											state.clauses.some((c) => c.sourceId === proposal.id)
										}
										onClick={() => {
											dispatch({ type: 'clause', id: proposal.id, clauseId: crypto.randomUUID() });
											setNotice('Added as a draft clause, not an approved agreement.');
											go('covenant');
										}}
									>
										Bring into the draft אמנה
									</button>
								</div>
							</article>
							{proposal.previousId && (
								<section className={styles.journey__card}>
									<h3>What changed?</h3>
									<p>{state.proposals.find((p) => p.id === proposal.previousId)?.text}</p>
									<p className={styles.journey__muted}>
										Above is the earlier wording. Its evaluations remain attached to it.
									</p>
									<div className={styles.journey__actions}>
										<button onClick={() => open(proposal.previousId!)}>Compare the original</button>
									</div>
								</section>
							)}
							<section className={styles.journey__section}>
								<h3>Concerns & improvements</h3>
								{!proposal.concerns.length && (
									<p>
										No concerns have been recorded for this wording. This does not establish
										non-objection.
									</p>
								)}
								{proposal.concerns.map((c) => (
									<div className={styles.journey__concern} key={c.id}>
										<strong>
											{c.author} · {c.resolved ? 'Addressed for me' : 'Open concern'}
										</strong>
										<p>{c.text}</p>
										{c.author === 'You' && (
											<button
												onClick={() =>
													dispatch({ type: 'resolve', id: proposal.id, concernId: c.id })
												}
											>
												{c.resolved ? 'Reopen my concern' : 'This is addressed for me'}
											</button>
										)}
									</div>
								))}
								{state.proposals
									.filter((p) => p.previousId === proposal.id)
									.map((p) => (
										<div className={styles.journey__actions} key={p.id}>
											<button onClick={() => open(p.id)}>Explore a revised option: {p.text}</button>
										</div>
									))}
							</section>
							{proposal.sources && (
								<details className={styles.journey__section}>
									<summary>
										Inspect synthesis · {proposal.sources.length} original proposals
									</summary>
									<p>
										Example of equivalent positions combined into one statement. Related or opposing
										positions stay separate. This demonstration uses one evaluation per example
										person.
									</p>
									{proposal.sources.map((source, i) => (
										<blockquote key={source}>
											Original {i + 1}: {source}
										</blockquote>
									))}
								</details>
							)}
						</>
					)}
					{view === 'covenant' && (
						<>
							<div className={styles.journey__title}>
								<div>
									<span className={styles.journey__eyebrow}>
										{state.phase !== 'draft'
											? `${state.phase === 'adopted' ? 'Adopted example' : 'Review'} version ${latest?.number} · wording locked`
											: 'Working draft · open to improvement'}
									</span>
									<h2>Our אמנה</h2>
								</div>
								<button disabled={!state.clauses.length} onClick={exportDocument}>
									Export document
								</button>
							</div>
							<p>
								Bring our strongest options into a document. Work on the exact words together before
								asking anyone to endorse them.
							</p>
							<details className={styles.journey__section}>
								<summary>Our agreement rule · illustrative, facilitator-configurable</summary>
								<label htmlFor="endorsement-target">
									Minimum endorsement among all 24 example participants (%)
								</label>
								<input
									id="endorsement-target"
									type="number"
									min="1"
									max="100"
									value={state.endorsementTarget}
									disabled={state.versions.length > 0}
									onChange={(e) => dispatch({ type: 'target', value: Number(e.target.value) })}
								/>
								<p>
									Every remaining participant must explicitly state no objection. A non-response is
									not consent. This rule is fixed once review starts; no automatic adoption occurs
									in this example.
								</p>
							</details>
							{!state.clauses.length ? (
								<div className={styles.journey__empty}>
									<FileText size={36} />
									<h3>Let’s write the first clause.</h3>
									<p>
										Open an option and bring its wording into this draft. No option is silently
										added or treated as approved.
									</p>
									<div className={styles.journey__actions}>
										<button className={styles.journey__primary} onClick={() => go('options')}>
											Explore the options
										</button>
									</div>
								</div>
							) : (
								<div className={`${styles.journey__document} ${styles.journey__section}`}>
									<span className={styles.journey__eyebrow}>A shared commitment / אמנה משותפת</span>
									<h2>Our shared answer.</h2>
									<p className={styles.journey__muted}>
										{state.phase === 'draft'
											? 'Draft for comment and improvement. Not yet approved.'
											: `Exact wording ${state.phase === 'adopted' ? 'adopted in this example' : 'under review'} · version ${latest?.number}`}
									</p>
									{state.clauses.map((c, i) => (
										<section className={styles.journey__clause} key={c.id}>
											<span className={styles.journey__eyebrow}>Clause {i + 1}</span>
											<p>{c.text}</p>
											<div className={styles.journey__actions}>
												<button onClick={() => open(c.sourceId)}>
													Source option & evaluations ↗
												</button>
												{state.phase === 'draft' && (
													<>
														<button onClick={() => showForm('comment', c.id)}>Comment</button>
														<button onClick={() => showForm('amend', c.id)}>Amend wording</button>
														<button onClick={() => dispatch({ type: 'remove', id: c.id })}>
															Remove from draft
														</button>
													</>
												)}
											</div>
											<details>
												<summary>{c.comments.length} review notes & changes</summary>
												{c.comments.map((comment, j) => (
													<p key={j}>{comment}</p>
												))}
											</details>
										</section>
									))}
								</div>
							)}
							{state.clauses.length > 0 && (
								<div className={styles.journey__card} data-tone="yellow">
									{state.phase === 'draft' ? (
										<>
											<h3>Ready for everyone to review?</h3>
											<p>
												Facilitator action in this example: consolidate the current wording into an
												immutable review version. Opening review is not adoption.
											</p>
											<div className={styles.journey__actions}>
												<button
													className={styles.journey__primary}
													onClick={() => {
														dispatch({ type: 'review' });
														setNotice('Review opened. Positions apply only to this exact version.');
													}}
												>
													Open review of version {state.versions.length + 1}
												</button>
											</div>
										</>
									) : (
										<>
											<h3>Your position on version {latest?.number}</h3>
											<p>
												Read the complete document, then choose. These choices carry equal weight
												and can be changed during review.
											</p>
											<div
												className={styles.journey__rating}
												role="group"
												aria-label="Position on the covenant"
											>
												{(['endorse', 'no-objection', 'object'] as const).map((position, i) => (
													<button
														key={position}
														disabled={state.phase === 'adopted'}
														aria-pressed={latest?.positions.you === position}
														onClick={() => dispatch({ type: 'position', position })}
													>
														{['I endorse this', 'I do not object', 'I object'][i]}
													</button>
												))}
											</div>
											<p>
												{
													Object.values(latest?.positions ?? {}).filter((p) => p === 'endorse')
														.length
												}{' '}
												endorse ·{' '}
												{
													Object.values(latest?.positions ?? {}).filter((p) => p === 'no-objection')
														.length
												}{' '}
												do not object ·{' '}
												{
													Object.values(latest?.positions ?? {}).filter((p) => p === 'object')
														.length
												}{' '}
												object · {24 - Object.keys(latest?.positions ?? {}).length} have not
												responded
											</p>
											<strong>
												{state.phase === 'adopted'
													? 'Adopted in this local example · the exact wording and positions are recorded.'
													: reviewReadiness(state)
														? 'The example agreement rule is met. A facilitator can record adoption.'
														: 'Not adopted · wider review or further improvement is still needed.'}
											</strong>
											{state.phase === 'review' && (
												<div className={styles.journey__actions}>
													<button onClick={() => dispatch({ type: 'example-responses' })}>
														Load example community responses
													</button>
													<button
														className={styles.journey__primary}
														disabled={!reviewReadiness(state)}
														onClick={() => {
															dispatch({ type: 'adopt' });
															setNotice(
																'Example adoption recorded. Export the document and its review history. No real signatures were collected.',
															);
														}}
													>
														Record adoption in this example
													</button>
													<p className={styles.journey__muted}>
														Simulation only: adds 20 endorsements and 3 explicit non-objections from
														fictional neighbors. Your own position remains yours.
													</p>
												</div>
											)}
											<div className={styles.journey__actions}>
												<button
													onClick={() => {
														dispatch({ type: 'reopen' });
														setNotice(
															'Drafting reopened. Earlier positions remain in version history; a new review starts with no positions.',
														);
													}}
												>
													Reopen drafting for amendments
												</button>
											</div>
										</>
									)}
								</div>
							)}
							{state.versions.length > 0 && (
								<details className={styles.journey__section}>
									<summary>Version history · {state.versions.length} snapshots</summary>
									{state.versions.map((v) => (
										<section className={styles.journey__card} key={v.number}>
											<h3>
												Version {v.number}
												{v.adopted ? ' · adopted in this example' : ''}
											</h3>
											{v.clauses.map((c) => (
												<p key={c.id}>{c.text}</p>
											))}
											<p>Your position: {v.positions.you ?? 'Not yet responded'}</p>
										</section>
									))}
								</details>
							)}
						</>
					)}
					{view === 'summary' && (
						<>
							<h2>
								Where we stand,
								<br />
								<strong>without losing the differences.</strong>
							</h2>
							<p className={styles.journey__muted}>
								Live example summary from the options, concerns and document below. No AI inference
								or adoption claim.
							</p>
							<section className={styles.journey__section}>
								<h3>Leading candidates for common ground</h3>
								<div className={styles.journey__list}>
									{ranked.slice(0, 3).map((p) => (
										<button key={p.id} onClick={() => open(p.id)}>
											{p.text} · {percent(evidence(p.votes).score)} consensus score{' '}
											<ArrowUpRight size={16} />
										</button>
									))}
								</div>
							</section>
							<section className={styles.journey__section}>
								<h3>Remaining concerns</h3>
								{concerns.map((c) => (
									<div className={styles.journey__concern} key={c.id}>
										<p>{c.text}</p>
										<button onClick={() => open(c.proposalId)}>Open the source discussion</button>
									</div>
								))}
							</section>
							<section className={styles.journey__card} data-tone="lilac">
								<h3>What is actually decided?</h3>
								<p>
									{state.phase === 'adopted'
										? 'Adoption is recorded in this local example only.'
										: 'No covenant has been adopted.'}{' '}
									{state.clauses.length} clauses are{' '}
									{state.phase === 'adopted'
										? 'in the recorded example document'
										: state.phase === 'review'
											? 'under review'
											: 'in the working draft'}
									.
								</p>
								<div className={styles.journey__actions}>
									<button onClick={() => go('covenant')}>Read the exact wording</button>
								</div>
							</section>
						</>
					)}
					{view === 'maps' && (
						<PreviewMaps
							questions={mapQuestions}
							questionId={questionId}
							onQuestion={onMapQuestion}
							onSolution={open}
						/>
					)}
					{view === 'chat' && (
						<>
							<h2>Think it through, together.</h2>
							<p>Bring a concern, a question, or the seed of a better option.</p>
							<div className={styles.journey__section}>
								{messages.map((m, i) => (
									<article
										className={styles.journey__card}
										data-tone={i % 2 ? 'mint' : 'peach'}
										key={i}
									>
										<strong>{m.author}</strong>
										<p>{m.text}</p>
									</article>
								))}
							</div>
							<form
								className={styles.journey__section}
								onSubmit={(e) => {
									e.preventDefault();
									const form = e.currentTarget;
									const text = String(new FormData(form).get('message') ?? '').trim();
									if (!text) return;
									setMessages([...messages, { author: 'You', text }]);
									form.reset();
								}}
							>
								<label htmlFor="conversation-message">Share a thought</label>
								<textarea id="conversation-message" name="message" required />
								<div className={styles.journey__actions}>
									<button className={styles.journey__primary}>Send message</button>
									<button type="button" onClick={() => showForm('add')}>
										Turn an idea into an option
									</button>
								</div>
							</form>
						</>
					)}
				</div>
				{notice && (
					<div className={styles.journey__status} role="status">
						{notice}
					</div>
				)}
				<dialog
					ref={modal}
					className={`${styles.journey} ${styles.journey__dialog}`}
					onCancel={() => setFormKind(null)}
				>
					<button className={styles.journey__close} onClick={close} aria-label="Close">
						<X size={20} />
					</button>
					{formKind && (
						<form key={`${formKind}-${selected}-${clauseId}`} onSubmit={submitForm}>
							<h2>
								{
									{
										add: 'A new possibility',
										revise: 'Make room for more of us',
										concern: 'What needs attention?',
										amend: 'Improve this clause',
										comment: 'A thought on this clause',
									}[formKind]
								}
							</h2>
							<p>
								{formKind === 'revise'
									? 'Keep the original. Offer new wording that people can evaluate afresh.'
									: formKind === 'amend'
										? 'The wording changes only in the draft. Earlier review versions remain intact.'
										: 'Be specific. Help others understand what would make this work.'}
							</p>
							<label htmlFor="workflow-text">
								{formKind === 'concern'
									? 'Your concern'
									: formKind === 'comment'
										? 'Your comment'
										: 'Proposed wording'}
							</label>
							<textarea
								autoFocus
								id="workflow-text"
								name="text"
								required
								defaultValue={
									formKind === 'revise'
										? proposal.text
										: formKind === 'amend'
											? state.clauses.find((c) => c.id === clauseId)?.text
											: ''
								}
							/>
							{formKind === 'add' && (
								<>
									<label htmlFor="workflow-theme">Theme</label>
									<select id="workflow-theme" name="theme">
										{themes.map((t) => (
											<option key={t}>{t}</option>
										))}
									</select>
								</>
							)}
							{formKind === 'amend' && (
								<>
									<label htmlFor="workflow-reason">Why this change?</label>
									<textarea id="workflow-reason" name="reason" required />
								</>
							)}
							<div className={styles.journey__actions}>
								<button className={styles.journey__primary}>
									Save{' '}
									{formKind === 'concern'
										? 'concern'
										: formKind === 'comment'
											? 'comment'
											: formKind === 'amend'
												? 'amendment'
												: 'option'}
								</button>
								<button type="button" onClick={close}>
									Cancel
								</button>
							</div>
						</form>
					)}
				</dialog>
			</ThinkingSpace>
		</div>
	);
}
