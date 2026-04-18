import React, { useMemo, useRef, useState, useCallback } from 'react';
import Modal from '@/view/components/atomic/molecules/Modal/Modal';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import styles from './BreakdownPanel.module.scss';

const MINI_BOARD_SIZE = 320;
const MINI_DOT_RADIUS = 11;
const MINI_PADDING = 4;
const MINI_HIT_THRESHOLD = 36;
const MINI_COLLISION_ITERS = 60;

interface BreakdownGroup {
	option: string;
	color: string;
	mean: number;
	mad: number;
	n: number;
	questionId: string;
	question: string;
}

export interface BreakdownPanelProps {
	isOpen: boolean;
	onClose: () => void;
	title: string;
	verdict: string;
	overallMean: number;
	overallN: number;
	groups: BreakdownGroup[];
}

interface MiniHitTarget {
	x: number;
	y: number;
	group: BreakdownGroup;
}

function agreementPercent(mean: number): number {
	return Math.round(((mean + 1) / 2) * 100);
}

function spreadMiniDots(targets: MiniHitTarget[]): MiniHitTarget[] {
	const minDist = MINI_DOT_RADIUS * 2 + MINI_PADDING;
	const minDistSq = minDist * minDist;
	const positions = targets.map((t) => ({ x: t.x, y: t.y }));

	for (let iter = 0; iter < MINI_COLLISION_ITERS; iter++) {
		let moved = false;
		for (let i = 0; i < positions.length; i++) {
			for (let j = i + 1; j < positions.length; j++) {
				const a = positions[i];
				const b = positions[j];
				const dx = b.x - a.x;
				const dy = b.y - a.y;
				const distSq = dx * dx + dy * dy;
				if (distSq >= minDistSq) continue;

				let nx = dx;
				let ny = dy;
				let dist = Math.sqrt(distSq);
				if (dist < 0.001) {
					const angle = ((i * 31 + j * 17) % 360) * (Math.PI / 180);
					nx = Math.cos(angle);
					ny = Math.sin(angle);
					dist = 0.001;
				} else {
					nx /= dist;
					ny /= dist;
				}
				const overlap = (minDist - dist) / 2;
				a.x -= nx * overlap;
				a.y -= ny * overlap;
				b.x += nx * overlap;
				b.y += ny * overlap;
				moved = true;
			}
		}
		for (const p of positions) {
			p.x = Math.max(MINI_DOT_RADIUS, Math.min(MINI_BOARD_SIZE - MINI_DOT_RADIUS, p.x));
			p.y = Math.max(MINI_DOT_RADIUS, Math.min(MINI_BOARD_SIZE - MINI_DOT_RADIUS, p.y));
		}
		if (!moved) break;
	}

	return targets.map((t, i) => ({ ...t, x: positions[i].x, y: positions[i].y }));
}

const BreakdownPanel: React.FC<BreakdownPanelProps> = ({
	isOpen,
	onClose,
	title,
	verdict,
	overallMean,
	overallN,
	groups,
}) => {
	const { t } = useTranslation();
	const [hovered, setHovered] = useState<MiniHitTarget | null>(null);
	const boardRef = useRef<HTMLDivElement>(null);

	const targets = useMemo<MiniHitTarget[]>(() => {
		const raw = groups.map((g) => ({
			x: ((g.mean + 1) * MINI_BOARD_SIZE) / 2,
			y: (1 - g.mad) * MINI_BOARD_SIZE,
			group: g,
		}));

		return spreadMiniDots(raw);
	}, [groups]);

	const findNearest = useCallback(
		(mx: number, my: number): MiniHitTarget | null => {
			let best: MiniHitTarget | null = null;
			let bestDist = Infinity;
			for (const target of targets) {
				const d = Math.hypot(target.x - mx, target.y - my);
				if (d < bestDist) {
					bestDist = d;
					best = target;
				}
			}

			return best && bestDist <= MINI_HIT_THRESHOLD ? best : null;
		},
		[targets],
	);

	const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
		if (e.pointerType === 'touch') return;
		const rect = e.currentTarget.getBoundingClientRect();
		setHovered(findNearest(e.clientX - rect.left, e.clientY - rect.top));
	};

	const handlePointerLeave = () => setHovered(null);

	const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
		const rect = e.currentTarget.getBoundingClientRect();
		setHovered(findNearest(e.clientX - rect.left, e.clientY - rect.top));
	};

	// Group the listed breakdown by demographic question for the legend below.
	const byQuestion = useMemo(() => {
		const map = new Map<string, { question: string; entries: BreakdownGroup[] }>();
		for (const g of groups) {
			const bucket = map.get(g.questionId) || { question: g.question, entries: [] };
			bucket.entries.push(g);
			map.set(g.questionId, bucket);
		}

		return [...map.values()];
	}, [groups]);

	return (
		<Modal
			isOpen={isOpen}
			onClose={onClose}
			title={title}
			layout="bottom-sheet"
			size="medium"
		>
			<div className={styles.breakdown}>
				<div className={styles.breakdown__summary}>
					<span className={styles.breakdown__verdict}>{t(verdict)}</span>
					<span className={styles.breakdown__sep}>·</span>
					<span className={styles.breakdown__pct}>
						{agreementPercent(overallMean)}% {t('agree')}
					</span>
					<span className={styles.breakdown__sep}>·</span>
					<span>
						{overallN} {t('evaluators')}
					</span>
				</div>

				<div
					className={styles.miniBoard}
					ref={boardRef}
					onPointerMove={handlePointerMove}
					onPointerLeave={handlePointerLeave}
					onClick={handleClick}
					style={{ width: MINI_BOARD_SIZE, height: MINI_BOARD_SIZE }}
				>
					<div className={styles.miniBoard__background} />
					<div className={styles.miniBoard__centerLine} />

					{targets.map((target, i) => {
						const isActive = hovered === target;

						return (
							<div
								key={`${target.group.questionId}--${target.group.option}--${i}`}
								className={`${styles.miniDot} ${isActive ? styles['miniDot--active'] : ''}`}
								style={{
									left: target.x,
									top: target.y,
									backgroundColor: target.group.color,
								}}
							/>
						);
					})}

					{hovered && (
						<div
							className={styles.miniTip}
							style={{ left: hovered.x, top: hovered.y }}
						>
							<div className={styles.miniTip__bubble}>
								<div className={styles.miniTip__title}>{hovered.group.option}</div>
								<div className={styles.miniTip__sub}>{hovered.group.question}</div>
								<div className={styles.miniTip__meta}>
									<span>
										{agreementPercent(hovered.group.mean)}% {t('agree')}
									</span>
									<span className={styles.miniTip__sep}>·</span>
									<span>
										{hovered.group.n} {t('evaluators')}
									</span>
								</div>
							</div>
						</div>
					)}
				</div>

				{byQuestion.map((q) => (
					<div className={styles.demoSection} key={q.question}>
						<h4 className={styles.demoSection__title}>{q.question}</h4>
						<ul className={styles.demoSection__list}>
							{q.entries
								.slice()
								.sort((a, b) => b.mean - a.mean)
								.map((g) => (
									<li className={styles.demoRow} key={g.option}>
										<span
											className={styles.demoRow__swatch}
											style={{ backgroundColor: g.color }}
											aria-hidden="true"
										/>
										<span className={styles.demoRow__label}>{g.option}</span>
										<span className={styles.demoRow__pct}>
											{agreementPercent(g.mean)}%
										</span>
										<span className={styles.demoRow__n}>
											({g.n})
										</span>
									</li>
								))}
						</ul>
					</div>
				))}
			</div>
		</Modal>
	);
};

export default BreakdownPanel;
