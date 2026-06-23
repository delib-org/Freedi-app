import { FC, useMemo, useRef, useState } from 'react';
import type { Results, Statement } from '@freedi/shared-types';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { createMindMapChild, updateMindMapNodeText } from '../mapHelpers/mindMapStatements';
import { CLUSTER_PALETTE, type ClusterPaletteEntry } from '../mapHelpers/mindElixirTransform';
import styles from './ClusterBoard.module.scss';

interface Props {
	/** Results tree from useMindMap: top = subject, sub = clusters, cluster.sub = members. */
	results: Results;
	/** When true, show add tiles and allow inline editing. */
	canEdit: boolean;
}

// Card + layout geometry (px).
const CARD = 86;
const GAP = 12;
const COLS = 3;
const PILL_RADIUS = 190;
const HUB = 120;

interface ClusterLayout {
	cluster: Results;
	color: ClusterPaletteEntry;
	dir: { x: number; y: number };
	pill: { x: number; y: number };
	grid: { x: number; y: number };
	cols: number;
}

/**
 * Custom radial cluster board: a central "Subject" hub with colored cluster
 * pills around it, each cluster's member statements packed as a grid of
 * sticky-note cards (so many statements fit compactly). Reuses the mind-map
 * data + edit functions; real-time updates flow in via the Redux listener that
 * ClusterMap owns.
 */
const ClusterBoard: FC<Props> = ({ results, canEdit }) => {
	const { t } = useTranslation();
	const subject = results.top;
	const clusters = useMemo(() => results.sub ?? [], [results.sub]);

	const [editingId, setEditingId] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const editRef = useRef<HTMLTextAreaElement>(null);

	// Lay clusters out on a ring; larger clusters sit further out so their card
	// grids don't collide with the hub.
	const layout = useMemo(() => {
		const n = Math.max(clusters.length, 1);

		return clusters.map((cluster, i): ClusterLayout => {
			const color = CLUSTER_PALETTE[i % CLUSTER_PALETTE.length];
			const angle = -Math.PI / 2 + (i * 2 * Math.PI) / n;
			const dir = { x: Math.cos(angle), y: Math.sin(angle) };

			const memberCount = (cluster.sub?.length ?? 0) + (canEdit ? 1 : 0);
			const cols = Math.max(1, Math.min(COLS, memberCount || 1));
			const rows = Math.max(1, Math.ceil((memberCount || 1) / cols));
			const blockH = rows * CARD + (rows - 1) * GAP;
			const gridRadius = PILL_RADIUS + 70 + blockH / 2;

			return {
				cluster,
				color,
				dir,
				pill: { x: dir.x * PILL_RADIUS, y: dir.y * PILL_RADIUS },
				grid: { x: dir.x * gridRadius, y: dir.y * gridRadius },
				cols,
			};
		});
	}, [clusters, canEdit]);

	// Canvas big enough to hold the outermost grids; hub is centered.
	const reach = useMemo(() => {
		let max = PILL_RADIUS + 200;
		for (const l of layout) {
			const memberCount = (l.cluster.sub?.length ?? 0) + (canEdit ? 1 : 0);
			const rows = Math.max(1, Math.ceil((memberCount || 1) / l.cols));
			const blockH = rows * CARD + (rows - 1) * GAP;
			const blockW = l.cols * CARD + (l.cols - 1) * GAP;
			const r = Math.hypot(l.grid.x, l.grid.y) + Math.max(blockH, blockW) / 2 + 40;
			max = Math.max(max, r);
		}

		return max;
	}, [layout, canEdit]);

	const size = reach * 2;
	const cx = reach;
	const cy = reach;

	const saveText = async (statement: Statement, value: string) => {
		setEditingId(null);
		const trimmed = value.trim();
		if (!trimmed || trimmed === statement.statement) return;
		await updateMindMapNodeText({ statement, newText: trimmed });
	};

	const addMember = async (parent: Statement) => {
		if (busy) return;
		setBusy(true);
		try {
			const created = await createMindMapChild({ parentStatement: parent });
			if (created) setEditingId(created.statementId);
		} finally {
			setBusy(false);
		}
	};

	const addCluster = async () => {
		if (busy) return;
		setBusy(true);
		try {
			const created = await createMindMapChild({ parentStatement: subject });
			if (created) setEditingId(created.statementId);
		} finally {
			setBusy(false);
		}
	};

	const renderCard = (member: Statement, color: ClusterPaletteEntry) => {
		const isEditing = editingId === member.statementId;

		return (
			<div
				key={member.statementId}
				className={styles.card}
				style={{ background: color.card, color: color.text }}
				onDoubleClick={canEdit ? () => setEditingId(member.statementId) : undefined}
			>
				{isEditing ? (
					<textarea
						ref={editRef}
						className={styles.cardEdit}
						defaultValue={member.statement}
						autoFocus
						onFocus={(e) => e.currentTarget.select()}
						onBlur={(e) => saveText(member, e.currentTarget.value)}
						onKeyDown={(e) => {
							if (e.key === 'Enter' && !e.shiftKey) {
								e.preventDefault();
								e.currentTarget.blur();
							}
							if (e.key === 'Escape') setEditingId(null);
						}}
					/>
				) : (
					<span className={styles.cardText}>{member.statement}</span>
				)}
			</div>
		);
	};

	return (
		<div className={styles.scroll}>
			<div className={styles.canvas} style={{ width: size, height: size }}>
				{/* Connectors */}
				<svg className={styles.connectors} width={size} height={size} aria-hidden>
					{layout.map((l) => {
						const x2 = cx + l.pill.x;
						const y2 = cy + l.pill.y;
						const c1y = cy + l.pill.y * 0.25;
						const c2x = cx + l.pill.x * 0.75;

						return (
							<path
								key={l.cluster.top.statementId}
								d={`M ${cx} ${cy} C ${cx} ${c1y}, ${c2x} ${y2}, ${x2} ${y2}`}
								fill="none"
								stroke={l.color.line}
								strokeWidth={2}
								opacity={0.7}
							/>
						);
					})}
				</svg>

				{/* Subject hub */}
				<div
					className={styles.hub}
					style={{ left: cx, top: cy, width: HUB, height: HUB }}
					title={subject.statement}
				>
					<span className={styles.hubText}>{subject.statement}</span>
				</div>

				{canEdit && (
					<button
						type="button"
						className={styles.addCluster}
						style={{ left: cx, top: cy + HUB / 2 + 18 }}
						onClick={addCluster}
						disabled={busy}
					>
						+ {t('Add cluster')}
					</button>
				)}

				{/* Cluster pills + card grids */}
				{layout.map((l) => (
					<div key={l.cluster.top.statementId}>
						<div
							className={styles.pill}
							style={{
								left: cx + l.pill.x,
								top: cy + l.pill.y,
								background: l.color.line,
							}}
							onDoubleClick={canEdit ? () => setEditingId(l.cluster.top.statementId) : undefined}
						>
							{editingId === l.cluster.top.statementId ? (
								<textarea
									className={styles.pillEdit}
									defaultValue={l.cluster.top.statement}
									autoFocus
									onFocus={(e) => e.currentTarget.select()}
									onBlur={(e) => saveText(l.cluster.top, e.currentTarget.value)}
									onKeyDown={(e) => {
										if (e.key === 'Enter' && !e.shiftKey) {
											e.preventDefault();
											e.currentTarget.blur();
										}
										if (e.key === 'Escape') setEditingId(null);
									}}
								/>
							) : (
								l.cluster.top.statement
							)}
						</div>

						<div
							className={styles.grid}
							style={{
								left: cx + l.grid.x,
								top: cy + l.grid.y,
								gridTemplateColumns: `repeat(${l.cols}, ${CARD}px)`,
								gap: GAP,
							}}
						>
							{(l.cluster.sub ?? []).map((member) => renderCard(member.top, l.color))}
							{canEdit && (
								<button
									type="button"
									className={styles.addCard}
									style={{ color: l.color.text }}
									onClick={() => addMember(l.cluster.top)}
									disabled={busy}
									aria-label={t('Add statement')}
								>
									+
								</button>
							)}
						</div>
					</div>
				))}
			</div>
		</div>
	);
};

export default ClusterBoard;
