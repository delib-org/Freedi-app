import MindMapPreview from './MindMapPreview';
import { ReactNode, useState } from 'react';
import MapExplorer, {
	MapViewId,
} from '@/view/components/atomic/organisms/ThinkingSpace/MapExplorer';
import styles from '@/view/components/atomic/organisms/ThinkingSpace/Agreement.module.scss';
import mapStyles from './PreviewMaps.module.scss';
import { Proposal, evidence } from './workflowModel';

export interface MapQuestion {
	id: string;
	title: string;
	parentId?: string;
	proposals: Proposal[];
}
const translate = (text: string): string => text;
export function mapEvidence(proposal: Proposal) {
	const values = Object.values(proposal.votes);
	const { mean, n } = evidence(proposal.votes);

	return {
		n,
		mean: mean ?? 0,
		pro: values.reduce((sum, v) => sum + Math.max(v, 0), 0),
		con: values.reduce((sum, v) => sum + Math.max(-v, 0), 0),
		mad: n ? values.reduce((sum, v) => sum + Math.abs(v - (mean ?? 0)), 0) / n : 0,
	};
}
export default function PreviewMaps({
	questions,
	questionId,
	onQuestion,
	onSolution,
}: {
	questions: MapQuestion[];
	questionId: string;
	onQuestion: (id: string) => void;
	onSolution: (id: string) => void;
}) {
	const [active, setActive] = useState<MapViewId>('mindMap');
	const question = questions.find((q) => q.id === questionId)!;
	const solutions = question.proposals;
	const groups = [...new Set(solutions.map((p) => p.theme))];
	const evaluated = solutions.filter((p) => mapEvidence(p).n > 0);
	const maxN = Math.max(1, ...evaluated.map((p) => mapEvidence(p).n));
	const solution = (p: Proposal) => (
		<div key={p.id} className={mapStyles.maps__solution}>
			<button onClick={() => onSolution(p.id)}>{p.text} ↗</button>
			{p.sources && (
				<details>
					<summary>Synthesis · {p.sources.length} equivalent originals</summary>
					<p>Different words, the same solution. Related alternatives stay separate.</p>
					<ul>
						{p.sources.map((text, i) => (
							<li key={i}>{text}</li>
						))}
					</ul>
				</details>
			)}
		</div>
	);
	const branch = (node: MapQuestion, visited: string[] = []): ReactNode => {
		if (visited.includes(node.id)) return null;
		const children = questions.filter((q) => q.parentId === node.id);

		return (
			<li key={node.id}>
				<details open>
					<summary>
						<span>Question · {node.title}</span>
					</summary>
					<button onClick={() => onQuestion(node.id)}>Work on this question ↗</button>
					{active === 'mindMap' && node.id === questionId && (
						<div className={mapStyles.maps__solutions}>
							<strong>Solutions · {node.proposals.length}</strong>
							{node.proposals.map(solution)}
						</div>
					)}
					{active === 'mindMap' && node.id !== questionId && (
						<p>{node.proposals.length} solutions · open this question to explore them</p>
					)}
					{children.length > 0 && (
						<ul>{children.map((child) => branch(child, [...visited, node.id]))}</ul>
					)}
				</details>
			</li>
		);
	};

	return (
		<MapExplorer active={active} onSelect={setActive} t={translate}>
			<p className={styles.journey__muted}>Local example · this question’s data</p>
			{active === 'mindMap' && (
				<MindMapPreview
					questions={questions}
					questionId={questionId}
					onQuestion={onQuestion}
					onSolution={onSolution}
				/>
			)}
			{active === 'subQuestionsMap' && (
				<div className={mapStyles.maps__tree}>
					<ul aria-label={'Recursive sub-question tree'}>{branch(question)}</ul>
				</div>
			)}
			{active === 'clusterBoard' && (
				<div className={styles.journey__grid}>
					{groups.map((theme, i) => (
						<section
							key={theme}
							className={styles.journey__card}
							data-tone={i % 2 ? 'peach' : 'mint'}
						>
							<span className={styles.journey__eyebrow}>Topic</span>
							<h3>{theme}</h3>
							{solutions.filter((p) => p.theme === theme).map(solution)}
						</section>
					))}
					{!solutions.length && (
						<p>No solutions to group yet. Propose a solution in this question.</p>
					)}
				</div>
			)}
			{(active === 'agreementMap' || active === 'polarizationIndex') && (
				<>
					<details>
						<summary>How to read this map</summary>
						<p>
							{active === 'agreementMap'
								? 'Further right means more support; higher means more opposition. Coordinates use the rating weights and the largest evaluation count for this question.'
								: 'Further right means more positive evaluations. Higher means greater disagreement between evaluations, measured by mean absolute deviation (MAD).'}
						</p>
						<p>
							Each numbered point opens its solution. Unanswered evaluations are never counted as
							neutral or consent.
						</p>
					</details>

					{evaluated.length > 0 ? (
						<svg
							className={mapStyles.maps__chart}
							viewBox="0 0 640 350"
							role="img"
							aria-label={
								active === 'agreementMap'
									? 'Agreement triangle: support and opposition weights'
									: 'Polarization: sentiment and mean absolute deviation'
							}
						>
							{active === 'agreementMap' ? (
								<path d="M65 285 L575 285 L65 35 Z" />
							) : (
								<path d="M65 35 L65 285 L575 285 M320 35 L320 285" />
							)}
							<text x="65" y="20">
								{active === 'agreementMap' ? 'Opposition ↑' : 'More disagreement ↑'}
							</text>
							<text x="65" y="315">
								{active === 'agreementMap' ? 'No expressed weight' : '−1 · rejection'}
							</text>
							<text x="470" y="315">
								{active === 'agreementMap' ? 'Support →' : '+1 · support'}
							</text>
							{evaluated.map((p, i) => {
								const e = mapEvidence(p);
								const x = 65 + (active === 'agreementMap' ? e.pro / maxN : (e.mean + 1) / 2) * 510;
								const y = 285 - (active === 'agreementMap' ? e.con / maxN : e.mad) * 250;

								return (
									<g
										key={p.id}
										role="button"
										tabIndex={0}
										aria-label={`Open solution ${i + 1}: ${p.text}`}
										onClick={() => onSolution(p.id)}
										onKeyDown={(event) => {
											if (event.key === 'Enter' || event.key === ' ') {
												event.preventDefault();
												onSolution(p.id);
											}
										}}
									>
										<title>
											{p.text} · {e.n} evaluations
										</title>
										<circle cx={x} cy={y} r={15} />
										<text x={x} y={y + 5} textAnchor="middle">
											{i + 1}
										</text>
									</g>
								);
							})}
						</svg>
					) : (
						<p>No evaluations yet. Evaluate solutions to see them on this map.</p>
					)}
					<div className={styles.journey__list}>
						{evaluated.map((p, i) => {
							const e = mapEvidence(p);

							return (
								<div key={p.id} className={styles.journey__card} data-tone="mint">
									<button onClick={() => onSolution(p.id)}>
										{i + 1}. {p.text} ↗
									</button>
									<p>
										{e.n} evaluations ·{' '}
										{active === 'agreementMap'
											? `support weight ${e.pro} · opposition weight ${e.con}`
											: `mean ${e.mean.toFixed(2)} · MAD ${e.mad.toFixed(2)}`}
									</p>
								</div>
							);
						})}
					</div>
					{solutions.some((p) => !mapEvidence(p).n) && (
						<section>
							<h3>Not yet evaluated</h3>
							{solutions.filter((p) => !mapEvidence(p).n).map(solution)}
						</section>
					)}
				</>
			)}
		</MapExplorer>
	);
}
