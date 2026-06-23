import {
	DragEvent,
	FC,
	useCallback,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from 'react';
import { arrayRemove, arrayUnion, updateDoc } from 'firebase/firestore';
import type { Results, Statement } from '@freedi/shared-types';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { useAuthentication } from '@/controllers/hooks/useAuthentication';
import { useAppSelector } from '@/controllers/hooks/reduxHooks';
import { isAdmin as isAdminRole } from '@/controllers/general/helpers';
import { setStatement, statementSubscriptionSelector } from '@/redux/statements/statementsSlice';
import { store } from '@/redux/store';
import { createMindMapChild, updateMindMapNodeText } from '../mapHelpers/mindMapStatements';
import { saveStatementToDB } from '@/controllers/db/statements/setStatements';
import { deleteStatementFromDB } from '@/controllers/db/statements/deleteStatements';
import { listenToEvaluations } from '@/controllers/db/evaluation/getEvaluation';
import {
	createEmptyCluster,
	setGroupOverride,
	STANDALONE_OVERRIDE,
} from '@/controllers/db/statements/condensationCuration';
import { createStatementRef, getCurrentTimestamp } from '@/utils/firebaseUtils';
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

const UNGROUPED_ID = '__ungrouped__';
const UNGROUPED_COLOR: ClusterPaletteEntry = { line: '#9aa3b2', card: '#e7eaf0', text: '#3d4d71' };
const DRAG_MIME = 'application/x-freedi-statement-id';

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
	const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
	if (!match) return null;
	const value = parseInt(match[1], 16);

	return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 };
}

function toHex(r: number, g: number, b: number): string {
	return (
		'#' +
		[r, g, b]
			.map((v) =>
				Math.max(0, Math.min(255, Math.round(v)))
					.toString(16)
					.padStart(2, '0'),
			)
			.join('')
	);
}

/** Build a full cluster palette (pill line, light card tint, readable text) from one chosen color. */
function deriveClusterPalette(hex: string): ClusterPaletteEntry {
	const rgb = hexToRgb(hex);
	if (!rgb) return UNGROUPED_COLOR;
	const { r, g, b } = rgb;

	return {
		line: hex,
		card: toHex(r + (255 - r) * 0.82, g + (255 - g) * 0.82, b + (255 - b) * 0.82),
		text: toHex(r * 0.4, g * 0.4, b * 0.4),
	};
}

/** A cluster's color: its saved `color`, else the default palette slot by index. */
function resolveClusterColor(hex: string | undefined, index: number): ClusterPaletteEntry {
	if (!hex) return CLUSTER_PALETTE[index % CLUSTER_PALETTE.length];
	const preset = CLUSTER_PALETTE.find((entry) => entry.line.toLowerCase() === hex.toLowerCase());

	return preset ?? deriveClusterPalette(hex);
}

/**
 * A normalized cluster ready to render. Clusters and their members all live
 * FLAT under the question; membership is the cluster's `integratedOptions[]`
 * (resolved into `members` by resultsByParentId), so notes stay visible in the
 * main app's option list. The synthetic "Ungrouped" group holds options not in
 * any cluster.
 */
interface BoardCluster {
	id: string;
	label: string;
	color: ClusterPaletteEntry;
	members: Results[];
	/** The cluster statement (isCluster option) — null for the synthetic "Ungrouped" group. */
	clusterStatement: Statement | null;
}

interface PlacedCluster extends BoardCluster {
	pill: { x: number; y: number };
	grid: { x: number; y: number };
	cols: number;
}

/**
 * Custom radial cluster board: a central "Subject" hub with colored cluster
 * pills around it, each cluster's member statements packed as a grid of
 * sticky-note cards. Clusters are isCluster options under the question and
 * notes are options under the question — the same model as the app's grouped
 * suggestions — so everything stays consistent with the main app. Admins manage
 * every card; authors manage their own; anyone with access can add and
 * evaluate. Real-time updates flow in via ClusterMap's mind-map listener.
 */
const ClusterBoard: FC<Props> = ({ results }) => {
	const { t } = useTranslation();
	const { user, creator } = useAuthentication();
	const subject = results.top;
	const children = useMemo(() => results.sub ?? [], [results.sub]);

	const subscription = useAppSelector(
		statementSubscriptionSelector(subject.topParentId ?? subject.statementId),
	);
	// The board owner (subject creator) is always an admin of the board, even
	// before their subscription role loads — mirrors StatementTopNav.
	const isAdmin = isAdminRole(subscription?.role) || (!!user && subject.creatorId === user.uid);
	const showEval = subject.statementSettings?.showEvaluation ?? false;
	const canContribute = !!user;

	const [editingId, setEditingId] = useState<string | null>(null);
	const [colorPickerId, setColorPickerId] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const canvasRef = useRef<HTMLDivElement>(null);
	const prevRectsRef = useRef<Map<string, { x: number; y: number }>>(new Map());

	const canManage = useCallback(
		(statement: Statement) => isAdmin || (!!user && statement.creatorId === user.uid),
		[isAdmin, user],
	);

	// Split the question's children into clusters (isCluster) and loose options
	// (rendered in an "Ungrouped" block). resultsByParentId already nested each
	// cluster's members under it via integratedOptions.
	const boardClusters = useMemo(() => {
		const containers: BoardCluster[] = [];
		const loose: Results[] = [];

		children.forEach((child, i) => {
			if (child.top.isCluster) {
				containers.push({
					id: child.top.statementId,
					label: child.top.statement,
					color: resolveClusterColor(child.top.color, i),
					members: child.sub ?? [],
					clusterStatement: child.top,
				});
			} else {
				loose.push(child);
			}
		});

		if (loose.length > 0) {
			containers.push({
				id: UNGROUPED_ID,
				label: t('Ungrouped'),
				color: UNGROUPED_COLOR,
				members: loose,
				clusterStatement: null,
			});
		}

		return containers;
	}, [children, t]);

	// Place clusters on a ring; larger clusters sit further out so their card
	// grids don't collide with the hub.
	const layout = useMemo(() => {
		const n = Math.max(boardClusters.length, 1);

		return boardClusters.map((cluster, i): PlacedCluster => {
			const angle = -Math.PI / 2 + (i * 2 * Math.PI) / n;
			const dir = { x: Math.cos(angle), y: Math.sin(angle) };

			const memberCount = cluster.members.length + (canContribute ? 1 : 0);
			const cols = Math.max(1, Math.min(COLS, memberCount || 1));
			const rows = Math.max(1, Math.ceil((memberCount || 1) / cols));
			const blockH = rows * CARD + (rows - 1) * GAP;
			const gridRadius = PILL_RADIUS + 80 + blockH / 2;

			return {
				...cluster,
				pill: { x: dir.x * PILL_RADIUS, y: dir.y * PILL_RADIUS },
				grid: { x: dir.x * gridRadius, y: dir.y * gridRadius },
				cols,
			};
		});
	}, [boardClusters, canContribute]);

	// Canvas big enough to hold the outermost grids; hub is centered.
	const reach = useMemo(() => {
		let max = PILL_RADIUS + 240;
		for (const l of layout) {
			const memberCount = l.members.length + (canContribute ? 1 : 0);
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

	// memberId → the cluster statement it currently belongs to (for moves).
	const sourceClusterByMember = useMemo(() => {
		const map = new Map<string, Statement>();
		for (const cluster of boardClusters) {
			if (!cluster.clusterStatement) continue;
			for (const member of cluster.members) {
				map.set(member.top.statementId, cluster.clusterStatement);
			}
		}

		return map;
	}, [boardClusters]);

	const membersById = useMemo(() => {
		const map = new Map<string, Statement>();
		for (const cluster of boardClusters) {
			for (const member of cluster.members) {
				map.set(member.top.statementId, member.top);
			}
		}

		return map;
	}, [boardClusters]);

	const clusterById = useMemo(() => {
		const map = new Map<string, Statement | null>();
		for (const cluster of boardClusters) {
			map.set(cluster.id, cluster.clusterStatement);
		}

		return map;
	}, [boardClusters]);

	// FLIP: when a card's position changes between renders — including when a
	// move by another participant arrives via the real-time listener — animate
	// it gliding from its previous position to the new one.
	useLayoutEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
		const canvasRect = canvas.getBoundingClientRect();
		const cards = canvas.querySelectorAll<HTMLElement>('[data-flip-id]');
		const nextRects = new Map<string, { x: number; y: number }>();

		cards.forEach((el) => {
			const id = el.getAttribute('data-flip-id');
			if (!id) return;
			const rect = el.getBoundingClientRect();
			const pos = { x: rect.left - canvasRect.left, y: rect.top - canvasRect.top };
			nextRects.set(id, pos);

			if (reduceMotion) return;
			const prev = prevRectsRef.current.get(id);
			if (!prev) return;
			const dx = prev.x - pos.x;
			const dy = prev.y - pos.y;
			if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;

			// Invert: jump back to the old position with no transition…
			el.style.transition = 'none';
			el.style.transform = `translate(${dx}px, ${dy}px)`;
			// …then play: animate to the natural new position on the next frame.
			requestAnimationFrame(() => {
				el.style.transition = 'transform 600ms cubic-bezier(0.2, 0.8, 0.2, 1)';
				el.style.transform = '';
				const onEnd = () => {
					el.style.transition = '';
					el.removeEventListener('transitionend', onEnd);
				};
				el.addEventListener('transitionend', onEnd);
			});
		});

		prevRectsRef.current = nextRects;
	});

	// Listen to the current user's evaluations under the subject and each cluster
	// so cast votes show their selected state.
	useEffect(() => {
		if (!user) return;
		const parentIds = [subject.statementId, ...children.map((c) => c.top.statementId)];
		const unsubscribers = parentIds.map((id) => listenToEvaluations(id, undefined, user.uid));

		return () => unsubscribers.forEach((unsubscribe) => unsubscribe?.());
	}, [user, subject.statementId, children]);

	const saveText = async (statement: Statement, value: string) => {
		setEditingId(null);
		const trimmed = value.trim();
		if (!trimmed || trimmed === statement.statement) return;
		await updateMindMapNodeText({ statement, newText: trimmed });
	};

	const setClusterColor = async (clusterStatement: Statement, hex: string) => {
		setColorPickerId(null);
		if (clusterStatement.color === hex) return;
		try {
			await updateDoc(createStatementRef(clusterStatement.statementId), {
				color: hex,
				lastUpdate: getCurrentTimestamp(),
			});
		} catch (error) {
			logError(error, {
				operation: 'ClusterBoard.setClusterColor',
				statementId: clusterStatement.statementId,
			});
		}
	};

	// Update membership: members and clusters all stay parented to the question;
	// only the clusters' integratedOptions and the parent's override map change.
	const assignMember = async (memberId: string, from: Statement | null, to: Statement | null) => {
		const ts = getCurrentTimestamp();
		const ops: Promise<void>[] = [];
		if (from) {
			ops.push(
				updateDoc(createStatementRef(from.statementId), {
					integratedOptions: arrayRemove(memberId),
					lastUpdate: ts,
				}),
			);
		}
		if (to) {
			ops.push(
				updateDoc(createStatementRef(to.statementId), {
					integratedOptions: arrayUnion(memberId),
					lastUpdate: ts,
				}),
			);
		}
		await Promise.all(ops);
		// Mirror the change into the parent's creator overrides so the
		// condensation pipeline and the grouped view stay consistent.
		await setGroupOverride({
			parentStatementId: subject.statementId,
			originalId: memberId,
			targetClusterId: to ? to.statementId : STANDALONE_OVERRIDE,
			currentAssignments: subject.creatorOverrides?.assignments ?? {},
		}).catch(() => {
			// best-effort; integratedOptions is the source of truth for display
		});
	};

	// New notes are options under the question; if added to a cluster, also join
	// that cluster's integratedOptions.
	const addMember = async (cluster: BoardCluster) => {
		if (busy) return;
		setBusy(true);
		try {
			const created = await createMindMapChild({ parentStatement: subject });
			if (created) {
				if (cluster.clusterStatement) {
					await assignMember(created.statementId, null, cluster.clusterStatement);
				}
				setEditingId(created.statementId);
			}
		} catch (error) {
			logError(error, { operation: 'ClusterBoard.addMember', statementId: subject.statementId });
		} finally {
			setBusy(false);
		}
	};

	// A cluster is an isCluster option under the question (same as the app's
	// grouped suggestions), so it stays consistent with the main app.
	const addCluster = async () => {
		if (busy || !creator) return;
		setBusy(true);
		try {
			await createEmptyCluster({ parentStatement: subject, title: t('New cluster'), creator });
		} catch (error) {
			logError(error, { operation: 'ClusterBoard.addCluster', statementId: subject.statementId });
		} finally {
			setBusy(false);
		}
	};

	const duplicate = async (member: Statement, cluster: BoardCluster) => {
		if (busy) return;
		setBusy(true);
		try {
			const created = await saveStatementToDB({
				text: member.statement,
				parentStatement: subject,
				statementType: member.statementType,
			});
			if (created) {
				store.dispatch(setStatement(created));
				if (cluster.clusterStatement) {
					await assignMember(created.statementId, null, cluster.clusterStatement);
				}
			}
		} catch (error) {
			logError(error, { operation: 'ClusterBoard.duplicate', statementId: member.statementId });
		} finally {
			setBusy(false);
		}
	};

	const remove = async (member: Statement) => {
		await deleteStatementFromDB(member, canManage(member), t);
	};

	const moveMember = async (member: Statement, targetClusterId: string) => {
		if (!canManage(member)) return;
		const from = sourceClusterByMember.get(member.statementId) ?? null;
		const to = clusterById.get(targetClusterId) ?? null;
		if (from?.statementId === to?.statementId) return;
		try {
			await assignMember(member.statementId, from, to);
		} catch (error) {
			logError(error, {
				operation: 'ClusterBoard.moveMember',
				statementId: member.statementId,
				metadata: { targetClusterId },
			});
		}
	};

	const handleDrop = (e: DragEvent, targetClusterId: string) => {
		e.preventDefault();
		const draggedId = e.dataTransfer.getData(DRAG_MIME);
		const dragged = draggedId ? membersById.get(draggedId) : undefined;
		if (dragged) moveMember(dragged, targetClusterId);
	};

	const handleDragStart = (e: DragEvent, member: Statement) => {
		e.dataTransfer.setData(DRAG_MIME, member.statementId);
		e.dataTransfer.effectAllowed = 'move';
	};

	return (
		<div className={styles.scroll}>
			<div className={styles.canvas} ref={canvasRef} style={{ width: size, height: size }}>
				<svg className={styles.connectors} width={size} height={size} aria-hidden>
					{layout.map((l) => {
						const x2 = cx + l.pill.x;
						const y2 = cy + l.pill.y;
						const c1y = cy + l.pill.y * 0.25;
						const c2x = cx + l.pill.x * 0.75;

						return (
							<path
								key={l.id}
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

				{layout.map((l) => {
					const canEditPill = !!l.clusterStatement && canManage(l.clusterStatement);
					const moveTargets = boardClusters
						.filter((c) => c.id !== l.id)
						.map((c) => ({ id: c.id, label: c.label }));

					return (
						<div key={l.id}>
							<div
								className={styles.pill}
								style={{ left: cx + l.pill.x, top: cy + l.pill.y, background: l.color.line }}
								onDoubleClick={canEditPill ? () => setEditingId(l.id) : undefined}
							>
								{editingId === l.id && l.clusterStatement ? (
									<textarea
										className={styles.pillEdit}
										defaultValue={l.clusterStatement.statement}
										autoFocus
										onFocus={(e) => e.currentTarget.select()}
										onBlur={(e) => saveText(l.clusterStatement as Statement, e.currentTarget.value)}
										onKeyDown={(e) => {
											if (e.key === 'Enter' && !e.shiftKey) {
												e.preventDefault();
												e.currentTarget.blur();
											}
											if (e.key === 'Escape') setEditingId(null);
										}}
									/>
								) : (
									l.label
								)}

								{canEditPill && editingId !== l.id && (
									<button
										type="button"
										className={styles.colorDot}
										aria-label={t('Change color')}
										title={t('Change color')}
										onClick={(e) => {
											e.stopPropagation();
											setColorPickerId((id) => (id === l.id ? null : l.id));
										}}
									/>
								)}

								{colorPickerId === l.id && l.clusterStatement && (
									<div className={styles.colorPopover} onMouseLeave={() => setColorPickerId(null)}>
										{CLUSTER_PALETTE.map((entry) => (
											<button
												key={entry.line}
												type="button"
												className={styles.swatch}
												style={{ background: entry.line }}
												aria-label={entry.line}
												onClick={() => setClusterColor(l.clusterStatement as Statement, entry.line)}
											/>
										))}
										<input
											type="color"
											className={styles.colorInput}
											defaultValue={l.color.line}
											aria-label={t('Custom color')}
											onChange={(e) =>
												setClusterColor(l.clusterStatement as Statement, e.target.value)
											}
										/>
									</div>
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
								onDrop={(e) => handleDrop(e, l.id)}
							>
								{l.members.map((member) => (
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
										onDuplicate={() => duplicate(member.top, l)}
										onDelete={() => remove(member.top)}
										onDragStart={(e) => handleDragStart(e, member.top)}
										moveTargets={moveTargets}
										onMove={(targetId) => moveMember(member.top, targetId)}
									/>
								))}
								{canContribute && (
									<button
										type="button"
										className={styles.addCard}
										style={{ color: l.color.text }}
										onClick={() => addMember(l)}
										disabled={busy}
										aria-label={t('Add statement')}
									>
										+
									</button>
								)}
							</div>
						</div>
					);
				})}
			</div>
		</div>
	);
};

export default ClusterBoard;
