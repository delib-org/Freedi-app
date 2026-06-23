import { DragEvent, FC, useCallback, useEffect, useMemo, useState } from 'react';
import type { Results, Statement } from '@freedi/shared-types';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { useAuthentication } from '@/controllers/hooks/useAuthentication';
import { useAppSelector } from '@/controllers/hooks/reduxHooks';
import { isAdmin as isAdminRole } from '@/controllers/general/helpers';
import { statementSubscriptionSelector } from '@/redux/statements/statementsSlice';
import { setStatement } from '@/redux/statements/statementsSlice';
import { store } from '@/redux/store';
import { createMindMapChild, updateMindMapNodeText } from '../mapHelpers/mindMapStatements';
import {
	saveStatementToDB,
	updateStatementParents,
} from '@/controllers/db/statements/setStatements';
import { deleteStatementFromDB } from '@/controllers/db/statements/deleteStatements';
import { listenToEvaluations } from '@/controllers/db/evaluation/getEvaluation';
import { logError } from '@/utils/errorHandling';
import { CLUSTER_PALETTE, type ClusterPaletteEntry } from '../mapHelpers/mindElixirTransform';
import ClusterCard from './ClusterCard';
import styles from './ClusterBoard.module.scss';

interface Props {
	/** Results tree from useMindMap: top = subject, sub = clusters, cluster.sub = members. */
	results: Results;
}

// Card + layout geometry (px).
const CARD = 120;
const GAP = 12;
const COLS = 3;
const PILL_RADIUS = 210;
const HUB = 120;

interface ClusterLayout {
	cluster: Results;
	color: ClusterPaletteEntry;
	pill: { x: number; y: number };
	grid: { x: number; y: number };
	cols: number;
}

const DRAG_MIME = 'application/x-freedi-statement-id';

/**
 * Custom radial cluster board: a central "Subject" hub with colored cluster
 * pills around it, each cluster's member statements packed as a grid of
 * sticky-note cards. Admins manage every card; authors manage their own.
 * Anyone with access can add cards and evaluate them. Reuses the mind-map data
 * + edit functions; real-time updates flow in via the listener ClusterMap owns.
 */
const ClusterBoard: FC<Props> = ({ results }) => {
	const { t } = useTranslation();
	const { user } = useAuthentication();
	const subject = results.top;
	const clusters = useMemo(() => results.sub ?? [], [results.sub]);

	const subscription = useAppSelector(
		statementSubscriptionSelector(subject.topParentId ?? subject.statementId),
	);
	const isAdmin = isAdminRole(subscription?.role);
	const showEval = subject.statementSettings?.showEvaluation ?? false;
	const canContribute = !!user;

	const [editingId, setEditingId] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);

	const canManage = useCallback(
		(statement: Statement) => isAdmin || (!!user && statement.creatorId === user.uid),
		[isAdmin, user],
	);

	// Listen to the current user's evaluations under the subject and each cluster
	// so cast votes show their selected state (aggregate stats arrive with the
	// statement docs via ClusterMap's mind-map listener).
	useEffect(() => {
		if (!user) return;
		const parentIds = [subject.statementId, ...clusters.map((c) => c.top.statementId)];
		const unsubscribers = parentIds.map((id) => listenToEvaluations(id, undefined, user.uid));

		return () => unsubscribers.forEach((unsubscribe) => unsubscribe?.());
	}, [user, subject.statementId, clusters]);

	// Lay clusters out on a ring; larger clusters sit further out so their card
	// grids don't collide with the hub.
	const layout = useMemo(() => {
		const n = Math.max(clusters.length, 1);

		return clusters.map((cluster, i): ClusterLayout => {
			const color = CLUSTER_PALETTE[i % CLUSTER_PALETTE.length];
			const angle = -Math.PI / 2 + (i * 2 * Math.PI) / n;
			const dir = { x: Math.cos(angle), y: Math.sin(angle) };

			const memberCount = (cluster.sub?.length ?? 0) + (canContribute ? 1 : 0);
			const cols = Math.max(1, Math.min(COLS, memberCount || 1));
			const rows = Math.max(1, Math.ceil((memberCount || 1) / cols));
			const blockH = rows * CARD + (rows - 1) * GAP;
			const gridRadius = PILL_RADIUS + 80 + blockH / 2;

			return {
				cluster,
				color,
				pill: { x: dir.x * PILL_RADIUS, y: dir.y * PILL_RADIUS },
				grid: { x: dir.x * gridRadius, y: dir.y * gridRadius },
				cols,
			};
		});
	}, [clusters, canContribute]);

	// Canvas big enough to hold the outermost grids; hub is centered.
	const reach = useMemo(() => {
		let max = PILL_RADIUS + 240;
		for (const l of layout) {
			const memberCount = (l.cluster.sub?.length ?? 0) + (canContribute ? 1 : 0);
			const rows = Math.max(1, Math.ceil((memberCount || 1) / l.cols));
			const blockH = rows * CARD + (rows - 1) * GAP;
			const blockW = l.cols * CARD + (l.cols - 1) * GAP;
			const r = Math.hypot(l.grid.x, l.grid.y) + Math.max(blockH, blockW) / 2 + 40;
			max = Math.max(max, r);
		}

		return max;
	}, [layout, canContribute]);

	const size = reach * 2;
	const cx = reach;
	const cy = reach;

	// id → member Statement, for resolving drag-and-drop targets.
	const membersById = useMemo(() => {
		const map = new Map<string, Statement>();
		for (const cluster of clusters) {
			for (const member of cluster.sub ?? []) {
				map.set(member.top.statementId, member.top);
			}
		}

		return map;
	}, [clusters]);

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

	const duplicate = async (member: Statement, parent: Statement) => {
		if (busy) return;
		setBusy(true);
		try {
			const created = await saveStatementToDB({
				text: member.statement,
				parentStatement: parent,
				statementType: member.statementType,
			});
			if (created) store.dispatch(setStatement(created));
		} catch (error) {
			logError(error, { operation: 'ClusterBoard.duplicate', statementId: member.statementId });
		} finally {
			setBusy(false);
		}
	};

	const remove = async (member: Statement) => {
		await deleteStatementFromDB(member, canManage(member), t);
	};

	const handleDrop = async (e: DragEvent, targetCluster: Statement) => {
		e.preventDefault();
		const draggedId = e.dataTransfer.getData(DRAG_MIME);
		const dragged = draggedId ? membersById.get(draggedId) : undefined;
		if (!dragged || !canManage(dragged)) return;
		if (dragged.parentId === targetCluster.statementId) return;
		try {
			await updateStatementParents(dragged, targetCluster);
		} catch (error) {
			logError(error, {
				operation: 'ClusterBoard.moveCard',
				statementId: dragged.statementId,
				metadata: { targetCluster: targetCluster.statementId },
			});
		}
	};

	const handleDragStart = (e: DragEvent, member: Statement) => {
		e.dataTransfer.setData(DRAG_MIME, member.statementId);
		e.dataTransfer.effectAllowed = 'move';
	};

	return (
		<div className={styles.scroll}>
			<div className={styles.canvas} style={{ width: size, height: size }}>
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

				<div
					className={styles.hub}
					style={{ left: cx, top: cy, width: HUB, height: HUB }}
					title={subject.statement}
				>
					<span className={styles.hubText}>{subject.statement}</span>
				</div>

				{canContribute && (
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

				{layout.map((l) => (
					<div key={l.cluster.top.statementId}>
						<div
							className={styles.pill}
							style={{ left: cx + l.pill.x, top: cy + l.pill.y, background: l.color.line }}
							onDoubleClick={
								canManage(l.cluster.top) ? () => setEditingId(l.cluster.top.statementId) : undefined
							}
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
							onDragOver={(e) => e.preventDefault()}
							onDrop={(e) => handleDrop(e, l.cluster.top)}
						>
							{(l.cluster.sub ?? []).map((member) => (
								<ClusterCard
									key={member.top.statementId}
									statement={member.top}
									color={l.color}
									canManage={canManage(member.top)}
									showEval={showEval}
									isEditing={editingId === member.top.statementId}
									onRequestEdit={() => setEditingId(member.top.statementId)}
									onSaveText={(value) => saveText(member.top, value)}
									onCancelEdit={() => setEditingId(null)}
									onDuplicate={() => duplicate(member.top, l.cluster.top)}
									onDelete={() => remove(member.top)}
									onDragStart={(e) => handleDragStart(e, member.top)}
								/>
							))}
							{canContribute && (
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
