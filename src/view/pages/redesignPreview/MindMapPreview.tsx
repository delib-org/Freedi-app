import { useLayoutEffect, useRef, useState } from 'react';
import type { MapQuestion } from './PreviewMaps';
import styles from './MindMapPreview.module.scss';

interface Node {
	id: string;
	title: string;
	kind: 'Question' | 'Solution';
	x: number;
	y: number;
	parent?: string;
	questionId: string;
}
export default function MindMapPreview({
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
	const viewport = useRef<HTMLDivElement>(null);
	const [zoom, setZoom] = useState(1);
	const nodes: Node[] = [];
	let row = 0;
	const visit = (id: string, depth: number, parent?: string, seen: string[] = []): number => {
		const q = questions.find((item) => item.id === id);
		if (!q || seen.includes(id)) return row * 124 + 24;
		const node: Node = {
			id: 'q-' + id,
			title: q.title,
			kind: 'Question',
			x: 24 + depth * 320,
			y: 0,
			parent,
			questionId: id,
		};
		nodes.push(node);
		const centers: number[] = [];
		for (const solution of q.proposals) {
			const y = row++ * 124 + 24;
			nodes.push({
				id: solution.id,
				title: solution.text,
				kind: 'Solution',
				x: 24 + (depth + 1) * 320,
				y,
				parent: node.id,
				questionId: id,
			});
			centers.push(y);
		}
		for (const child of questions.filter((item) => item.parentId === id))
			centers.push(visit(child.id, depth + 1, node.id, [...seen, id]));
		node.y = centers.length ? (centers[0] + centers[centers.length - 1]) / 2 : row++ * 124 + 24;

		return node.y;
	};
	visit(questionId, 0);
	const width = Math.max(620, ...nodes.map((node) => node.x + 290));
	const height = Math.max(380, ...nodes.map((node) => node.y + 120));
	const fit = (): void => {
		const element = viewport.current;
		if (element) {
			setZoom(
				Math.min(1, (element.clientWidth - 24) / width, (element.clientHeight - 24) / height),
			);
			element.scrollTo(0, 0);
		}
	};
	useLayoutEffect(() => {
		fit();
		const frame = requestAnimationFrame(() =>
			viewport.current?.scrollIntoView({ block: 'nearest' }),
		);

		return () => cancelAnimationFrame(frame);
	}, [questionId, width, height]);

	return (
		<section className={styles.mind} aria-label="Visual mind map">
			<div className={styles.mind__tools}>
				<div>
					<span>Question</span>
					<span>Solution</span>
				</div>
				<div>
					<button
						onClick={() => setZoom((value) => Math.max(0.2, value - 0.15))}
						aria-label="Zoom out"
					>
						−
					</button>
					<output aria-live="polite">{Math.round(zoom * 100)}%</output>
					<button
						onClick={() => setZoom((value) => Math.min(2, value + 0.15))}
						aria-label="Zoom in"
					>
						+
					</button>
					<button onClick={fit}>Fit map</button>
				</div>
			</div>
			<p>
				Follow the connecting lines. Select a question to explore its branch, or a solution to
				improve it. Scroll to move around when zoomed in.
			</p>
			<div
				ref={viewport}
				className={styles.mind__viewport}
				tabIndex={0}
				aria-label="Scrollable mind map canvas"
			>
				<svg
					width={width * zoom}
					height={height * zoom}
					viewBox={`0 0 ${width} ${height}`}
					aria-label="Connected questions and solutions"
				>
					{nodes
						.filter((node) => node.parent)
						.map((node) => {
							const parent = nodes.find((item) => item.id === node.parent)!;

							return (
								<path
									key={'edge-' + node.id}
									d={`M${parent.x + 260},${parent.y + 46} C${parent.x + 290},${parent.y + 46} ${node.x - 30},${node.y + 46} ${node.x},${node.y + 46}`}
								/>
							);
						})}
					{nodes.map((node) => (
						<foreignObject key={node.id} x={node.x} y={node.y} width={260} height={96}>
							<button
								className={styles.mind__node}
								data-kind={node.kind}
								onClick={() =>
									node.kind === 'Question' || node.questionId !== questionId
										? onQuestion(node.questionId)
										: onSolution(node.id)
								}
								aria-label={`${node.kind}: ${node.title}`}
							>
								<small>
									{node.kind}
									{node.kind === 'Solution' && node.questionId !== questionId
										? ' · open its question'
										: ''}
								</small>
								<span>{node.title}</span>
							</button>
						</foreignObject>
					))}
				</svg>
			</div>
		</section>
	);
}
