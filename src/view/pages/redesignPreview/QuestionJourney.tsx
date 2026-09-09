import React, { FormEvent, useState } from 'react';
import QuestionWorkspace from './AgreementPreview';
import { initialWorkflow, Workflow, workflowReducer } from './workflowModel';
import styles from '@/view/components/atomic/organisms/ThinkingSpace/Agreement.module.scss';

interface QuestionNode {
	id: string;
	title: string;
	parentId?: string;
	workflow: Workflow;
}
const emptyWorkflow = (): Workflow => ({
	proposals: [],
	clauses: [],
	versions: [],
	phase: 'draft',
	endorsementTarget: 80,
});
const initialQuestions: QuestionNode[] = [
	{ id: 'courtyard', title: 'What could our courtyard become?', workflow: initialWorkflow },
	{
		id: 'care',
		parentId: 'courtyard',
		title: 'How will we care for the garden?',
		workflow: {
			...emptyWorkflow(),
			proposals: [
				{
					id: 'rota',
					text: 'Use a weekly volunteer rota with a named backup.',
					author: 'Maya',
					theme: 'Shared care',
					votes: {},
					concerns: [],
				},
			],
		},
	},
	{
		id: 'funding',
		parentId: 'courtyard',
		title: 'How should we fund the first month?',
		workflow: emptyWorkflow(),
	},
	{
		id: 'backup',
		parentId: 'care',
		title: 'What happens when a volunteer is away?',
		workflow: emptyWorkflow(),
	},
];
export default function QuestionJourney({ onHome }: { onHome: () => void }) {
	const [questions, setQuestions] = useState(initialQuestions);
	const [activeId, setActiveId] = useState('courtyard');
	const [adding, setAdding] = useState<'root' | 'child' | null>(null);
	const active = questions.find((q) => q.id === activeId)!;
	const path: QuestionNode[] = [];
	let cursor: QuestionNode | undefined = active;
	while (cursor) {
		path.unshift(cursor);
		cursor = questions.find((q) => q.id === cursor?.parentId);
	}
	const openQuestion = (id: string): void => {
		setActiveId(id);
		setAdding(null);
	};
	const addQuestion = (event: FormEvent<HTMLFormElement>): void => {
		event.preventDefault();
		const title = String(new FormData(event.currentTarget).get('question') ?? '').trim();
		if (!title) return;
		const id = crypto.randomUUID();
		setQuestions((prev) => [
			...prev,
			{ id, title, parentId: adding === 'child' ? activeId : undefined, workflow: emptyWorkflow() },
		]);
		openQuestion(id);
	};
	const hierarchy = (
		<section className={styles.journey__section} aria-label="Question hierarchy">
			<div className={styles.journey__title}>
				<div>
					<span className={styles.journey__eyebrow}>Break it down, work it through</span>
					<h3>Sub-questions</h3>
				</div>
				<button onClick={() => setAdding('child')}>Ask a sub-question +</button>
			</div>
			<p>
				What do we need to answer to move this question forward? Every sub-question has its own
				solutions and can branch into further questions.
			</p>
			<div className={styles.journey__grid}>
				{questions
					.filter((q) => q.parentId === activeId)
					.map((q) => (
						<article key={q.id} className={styles.journey__card} data-tone="peach">
							<span className={styles.journey__eyebrow}>Sub-question</span>
							<h3>{q.title}</h3>
							<p>
								{q.workflow.proposals.length} solutions ·{' '}
								{questions.filter((child) => child.parentId === q.id).length} sub-questions
							</p>
							<div className={styles.journey__actions}>
								<button onClick={() => openQuestion(q.id)}>Explore question: {q.title} ↗</button>
							</div>
						</article>
					))}
			</div>
			{!questions.some((q) => q.parentId === activeId) && (
				<p>No sub-questions yet. Break down anything that needs a closer look.</p>
			)}
			{adding && (
				<form onSubmit={addQuestion} className={styles.journey__card}>
					<h3>{adding === 'root' ? 'Start with a question' : 'A question within this question'}</h3>
					<label htmlFor="new-question">What do you want to decide together?</label>
					<input id="new-question" name="question" autoFocus required maxLength={400} />
					<div className={styles.journey__actions}>
						<button type="submit">Open this question</button>
						<button type="button" onClick={() => setAdding(null)}>
							Cancel
						</button>
					</div>
				</form>
			)}
		</section>
	);
	const breadcrumbs = (
		<nav className={styles.journey__actions} aria-label="Question path">
			<select
				aria-label="Choose a starting question"
				value={path[0].id}
				onChange={(event) => openQuestion(event.target.value)}
			>
				{questions
					.filter((q) => !q.parentId)
					.map((q) => (
						<option key={q.id} value={q.id}>
							{q.title}
						</option>
					))}
			</select>
			{path.map((q, i) => (
				<React.Fragment key={q.id}>
					{i > 0 && <span aria-hidden="true">→</span>}
					<button
						aria-current={q.id === activeId ? 'page' : undefined}
						onClick={() => openQuestion(q.id)}
					>
						{q.title}
					</button>
				</React.Fragment>
			))}
		</nav>
	);

	return (
		<QuestionWorkspace
			key={activeId}
			onHome={onHome}
			questionTitle={active.title}
			questionId={activeId}
			mapQuestions={questions.map((q) => ({
				id: q.id,
				title: q.title,
				parentId: q.parentId,
				proposals: q.workflow.proposals,
			}))}
			onMapQuestion={openQuestion}
			state={active.workflow}
			dispatch={(action) =>
				setQuestions((prev) =>
					prev.map((q) =>
						q.id === activeId ? { ...q, workflow: workflowReducer(q.workflow, action) } : q,
					),
				)
			}
			hierarchy={hierarchy}
			breadcrumbs={breadcrumbs}
			onStartQuestion={() => setAdding('root')}
		/>
	);
}
