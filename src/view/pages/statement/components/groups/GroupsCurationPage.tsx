import React, { FC, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useSelector } from 'react-redux';
import {
	ArrowLeft,
	Layers,
	Lock,
	Unlock,
	Pencil,
	Plus,
	Trash2,
	Scissors,
	Sparkles,
	Wand2,
	X,
	Check,
} from 'lucide-react';
import { Statement, StatementType } from '@freedi/shared-types';
import ScoreBreakdown from '@/view/components/atomic/molecules/GroupedSuggestionCard/ScoreBreakdown';

import { useTranslation } from '@/controllers/hooks/useTranslation';
import { useAppSelector } from '@/controllers/hooks/reduxHooks';
import { statementSelector } from '@/redux/statements/statementsSlice';
import { createStatementsByParentSelector } from '@/redux/utils/selectorFactories';
import { creatorSelector } from '@/redux/creator/creatorSlice';
import type { RootState } from '@/redux/store';
import {
	createEmptyCluster,
	moveOriginalToCluster,
	resetTitleToAI,
	splitGroupMembers,
	STANDALONE_OVERRIDE,
	suggestClusterTitle,
	toggleTitleLock,
	ungroupCluster,
	updateClusterTitle,
} from '@/controllers/db/statements/condensationCuration';
import {
	listenToStatement,
	listenToSubStatements,
} from '@/controllers/db/statements/listenToStatements';
import { logError } from '@/utils/errorHandling';
import styles from './GroupsCurationPage.module.scss';

type PanelTab = 'list' | 'detail';

interface GroupsViewData {
	clusters: Statement[];
	originalsByCluster: Map<string, Statement[]>;
	ungrouped: Statement[];
}

function buildView(
	parentId: string | undefined,
	statements: Statement[],
	assignments: Record<string, string>,
): GroupsViewData {
	const siblings = statements.filter(
		(s) =>
			s.parentId === parentId &&
			(s.statementType === StatementType.option || s.statementType === StatementType.statement) &&
			s.hide !== true,
	);
	const clusters = siblings.filter((s) => s.isCluster === true);
	const originals = siblings.filter((s) => s.isCluster !== true);
	const clusterIds = new Set(clusters.map((c) => c.statementId));

	// Resolve the EFFECTIVE cluster each original belongs to. The creator
	// override wins over the cluster's `integratedOptions`, so a drag-drop
	// updates the view instantly — before the pipeline next runs and
	// materializes the changes back into integratedOptions.
	const effective = new Map<string, string | '__standalone__' | null>();
	for (const c of clusters) {
		for (const id of c.integratedOptions ?? []) {
			effective.set(id, c.statementId);
		}
	}
	for (const [originalId, target] of Object.entries(assignments ?? {})) {
		if (target === '__standalone__') {
			effective.set(originalId, '__standalone__');
		} else if (clusterIds.has(target)) {
			effective.set(originalId, target);
		}
		// If target points at a placeholder cluster that doesn't exist yet
		// (split-pending), leave the original in its current cluster until
		// the next pipeline run materializes the new cluster.
	}

	const originalsByCluster = new Map<string, Statement[]>();
	for (const c of clusters) originalsByCluster.set(c.statementId, []);
	const ungrouped: Statement[] = [];
	for (const original of originals) {
		const target = effective.get(original.statementId);
		if (target && target !== '__standalone__') {
			originalsByCluster.get(target)?.push(original);
		} else {
			ungrouped.push(original);
		}
	}

	return { clusters, originalsByCluster, ungrouped };
}

const GroupsCurationPage: FC = () => {
	const { t } = useTranslation();
	const { statementId } = useParams<{ statementId: string }>();
	const navigate = useNavigate();

	const parent = useAppSelector(statementSelector(statementId));
	const creator = useSelector(creatorSelector);

	const selectAllChildren = useMemo(
		() => createStatementsByParentSelector((state: RootState) => state.statements.statements),
		[],
	);
	const childStatements = useSelector(selectAllChildren(statementId));
	const allStatements = useAppSelector((s: RootState) => s.statements.statements);

	const assignments = useMemo(
		() =>
			(parent?.creatorOverrides?.assignments as Record<string, string> | undefined) ??
			({} as Record<string, string>),
		[parent?.creatorOverrides?.assignments],
	);

	const view = useMemo(
		() => buildView(statementId, allStatements, assignments),
		[statementId, allStatements, childStatements, assignments],
	);

	// Keep Redux fresh while on this page — curation doesn't share listeners
	// with the statement page, so set up our own subscription to the parent
	// and its children. Writes (override assignments, title edits, etc.) now
	// reflect in the UI within milliseconds.
	useEffect(() => {
		if (!statementId) return;
		const unsubStatement = listenToStatement(statementId);
		const unsubChildren = listenToSubStatements(statementId);

		return () => {
			unsubStatement();
			unsubChildren();
		};
	}, [statementId]);

	const [selectedClusterId, setSelectedClusterId] = useState<string | null>(
		() => view.clusters[0]?.statementId ?? null,
	);
	const [panelTab, setPanelTab] = useState<PanelTab>('list');
	const [editingTitle, setEditingTitle] = useState<string | null>(null);
	const [titleDraft, setTitleDraft] = useState('');
	/** Cluster that just received a drop — triggers a brief flash animation. */
	const [flashClusterId, setFlashClusterId] = useState<string | null>(null);

	/**
	 * AI title-suggestion state. Scoped to a single cluster at a time —
	 * switching selection dismisses any pending suggestion without applying.
	 */
	type SuggestionState =
		| { kind: 'idle' }
		| { kind: 'loading'; clusterId: string }
		| {
				kind: 'ready';
				clusterId: string;
				suggestedTitle: string;
				suggestedDescription: string;
				draftTitle: string;
				draftDescription: string;
				identical: boolean;
		  }
		| { kind: 'error'; clusterId: string; message: string };
	const [suggestion, setSuggestion] = useState<SuggestionState>({ kind: 'idle' });
	const suggestionAbortRef = useRef<AbortController | null>(null);

	/**
	 * Undo banner state — shown for 5s after Apply, so the admin can revert
	 * the applied title + the automatic title-lock.
	 */
	interface UndoState {
		clusterId: string;
		previousTitle: string;
		previousDescription: string;
		previousLocked: boolean;
		visible: boolean;
	}
	const [undoState, setUndoState] = useState<UndoState | null>(null);
	const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	/** Inline "+ New group" form state. */
	const [isCreatingGroup, setIsCreatingGroup] = useState(false);
	const [newGroupTitle, setNewGroupTitle] = useState('');
	const [creatingSubmit, setCreatingSubmit] = useState(false);

	// Clear any in-flight suggestion when switching to a different cluster.
	useEffect(() => {
		setSuggestion({ kind: 'idle' });
		suggestionAbortRef.current?.abort();
		suggestionAbortRef.current = null;
	}, [selectedClusterId]);

	useEffect(() => {
		return () => {
			suggestionAbortRef.current?.abort();
			if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
		};
	}, []);
	const [descriptionDraft, setDescriptionDraft] = useState('');
	const [selectedMemberIds, setSelectedMemberIds] = useState<Set<string>>(new Set());
	const [dragOverClusterId, setDragOverClusterId] = useState<string | null>(null);
	const [isRemovingAll, setIsRemovingAll] = useState(false);

	if (!parent) {
		return (
			<div className={styles['curation-page']}>
				<p className={styles['curation-page__empty']}>{t('Loading…')}</p>
			</div>
		);
	}

	const isAdmin = creator?.uid === parent.creatorId;
	if (!isAdmin) {
		return (
			<div className={styles['curation-page']}>
				<p className={styles['curation-page__empty']}>
					{t('You do not have permission to curate groups for this question.')}
				</p>
			</div>
		);
	}

	const selectedCluster = view.clusters.find((c) => c.statementId === selectedClusterId) ?? null;
	const selectedMembers = selectedCluster
		? (view.originalsByCluster.get(selectedCluster.statementId) ?? [])
		: [];

	// Drag-and-drop handlers (HTML5 native; keyboard equivalent via "Move to…" menu on each row).
	function onDragStart(e: React.DragEvent, originalId: string, fromClusterId: string | null) {
		e.dataTransfer.setData('text/plain', originalId);
		e.dataTransfer.setData('application/x-from-cluster', fromClusterId ?? '');
		e.dataTransfer.effectAllowed = 'move';
	}

	function onDropToCluster(
		e: React.DragEvent,
		targetClusterId: string | typeof STANDALONE_OVERRIDE,
	) {
		e.preventDefault();
		setDragOverClusterId(null);
		const originalId = e.dataTransfer.getData('text/plain');
		const fromClusterId = e.dataTransfer.getData('application/x-from-cluster') || null;
		if (!originalId) return;
		if (fromClusterId === targetClusterId) return; // no-op

		// Flash the drop target so the admin sees the drop was accepted.
		if (targetClusterId !== STANDALONE_OVERRIDE) {
			setFlashClusterId(targetClusterId);
			setTimeout(() => {
				setFlashClusterId((current) => (current === targetClusterId ? null : current));
			}, 600);
		}
		void handleMove(originalId, targetClusterId);
	}

	async function handleMove(
		originalId: string,
		targetClusterId: string | typeof STANDALONE_OVERRIDE,
	) {
		try {
			await moveOriginalToCluster({
				parentStatementId: parent.statementId,
				originalId,
				targetClusterId,
				currentAssignments: assignments,
			});
		} catch (error) {
			logError(error, {
				operation: 'GroupsCurationPage.handleMove',
				statementId: parent.statementId,
				metadata: { originalId, targetClusterId },
			});
		}
	}

	function beginEditTitle(cluster: Statement) {
		setEditingTitle(cluster.statementId);
		setTitleDraft(cluster.statement);
		setDescriptionDraft(cluster.description ?? '');
	}

	async function commitEditTitle(clusterId: string) {
		try {
			await updateClusterTitle({
				clusterId,
				statement: titleDraft.trim() || t('Grouped suggestion'),
				description: descriptionDraft.trim(),
				lockTitle: true,
			});
		} catch (error) {
			logError(error, {
				operation: 'GroupsCurationPage.commitEditTitle',
				statementId: clusterId,
			});
		} finally {
			setEditingTitle(null);
		}
	}

	async function handleToggleLock(cluster: Statement) {
		try {
			await toggleTitleLock(cluster.statementId, !(cluster.titleLockedByCreator ?? false));
		} catch (error) {
			logError(error, {
				operation: 'GroupsCurationPage.handleToggleLock',
				statementId: cluster.statementId,
			});
		}
	}

	async function handleResetTitle(cluster: Statement) {
		try {
			await resetTitleToAI(cluster.statementId);
		} catch (error) {
			logError(error, {
				operation: 'GroupsCurationPage.handleResetTitle',
				statementId: cluster.statementId,
			});
		}
	}

	async function requestSuggestion(cluster: Statement) {
		suggestionAbortRef.current?.abort();
		const controller = new AbortController();
		suggestionAbortRef.current = controller;
		setSuggestion({ kind: 'loading', clusterId: cluster.statementId });
		try {
			const { title, description } = await suggestClusterTitle(
				cluster.statementId,
				controller.signal,
			);
			if (controller.signal.aborted) return;
			const identical =
				title.trim() === (cluster.statement ?? '').trim() &&
				description.trim() === (cluster.description ?? '').trim();
			setSuggestion({
				kind: 'ready',
				clusterId: cluster.statementId,
				suggestedTitle: title,
				suggestedDescription: description,
				draftTitle: title,
				draftDescription: description,
				identical,
			});
		} catch (error) {
			if (controller.signal.aborted) return;
			const message = error instanceof Error ? error.message : String(error);
			if (message === 'throttled') {
				setSuggestion({ kind: 'idle' });

				return;
			}
			logError(error, {
				operation: 'GroupsCurationPage.requestSuggestion',
				statementId: cluster.statementId,
			});
			setSuggestion({ kind: 'error', clusterId: cluster.statementId, message });
		}
	}

	function dismissSuggestion() {
		suggestionAbortRef.current?.abort();
		suggestionAbortRef.current = null;
		setSuggestion({ kind: 'idle' });
	}

	async function applySuggestion(cluster: Statement) {
		if (suggestion.kind !== 'ready' || suggestion.clusterId !== cluster.statementId) return;
		const nextTitle = suggestion.draftTitle.trim();
		if (!nextTitle) return;

		const previous: UndoState = {
			clusterId: cluster.statementId,
			previousTitle: cluster.statement,
			previousDescription: cluster.description ?? '',
			previousLocked: cluster.titleLockedByCreator ?? false,
			visible: true,
		};

		try {
			await updateClusterTitle({
				clusterId: cluster.statementId,
				statement: nextTitle,
				description: suggestion.draftDescription.trim(),
				lockTitle: true,
			});
			setSuggestion({ kind: 'idle' });
			if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
			setUndoState(previous);
			undoTimerRef.current = setTimeout(() => {
				setUndoState(null);
				undoTimerRef.current = null;
			}, 5000);
		} catch (error) {
			logError(error, {
				operation: 'GroupsCurationPage.applySuggestion',
				statementId: cluster.statementId,
			});
			setSuggestion({
				kind: 'error',
				clusterId: cluster.statementId,
				message: error instanceof Error ? error.message : String(error),
			});
		}
	}

	async function handleCreateGroup() {
		const trimmed = newGroupTitle.trim();
		if (!trimmed || !creator) return;
		setCreatingSubmit(true);
		try {
			const newId = await createEmptyCluster({
				parentStatement: parent,
				title: trimmed,
				creator,
			});
			setNewGroupTitle('');
			setIsCreatingGroup(false);
			setSelectedClusterId(newId);
			setPanelTab('detail');
			setSelectedMemberIds(new Set());
		} catch (error) {
			logError(error, {
				operation: 'GroupsCurationPage.handleCreateGroup',
				statementId: parent.statementId,
			});
		} finally {
			setCreatingSubmit(false);
		}
	}

	async function undoLastSuggestion() {
		if (!undoState) return;
		const snapshot = undoState;
		setUndoState(null);
		if (undoTimerRef.current) {
			clearTimeout(undoTimerRef.current);
			undoTimerRef.current = null;
		}
		try {
			await updateClusterTitle({
				clusterId: snapshot.clusterId,
				statement: snapshot.previousTitle,
				description: snapshot.previousDescription,
				lockTitle: snapshot.previousLocked,
			});
		} catch (error) {
			logError(error, {
				operation: 'GroupsCurationPage.undoLastSuggestion',
				statementId: snapshot.clusterId,
			});
		}
	}

	async function handleRemoveAllGroupings() {
		const total = view.clusters.length;
		if (total === 0 || isRemovingAll) return;
		const message = t(
			'Remove all {count} groupings? Each group will be deleted and its originals will reappear as standalone options. This cannot be undone.',
		).replace('{count}', String(total));
		if (!window.confirm(message)) return;

		setIsRemovingAll(true);
		try {
			// Sequential to keep Firestore writes ordered + avoid runaway
			// concurrency on large parents. Each ungroupCluster also trims
			// creatorOverrides, so order preservation matters.
			for (const cluster of view.clusters) {
				try {
					await ungroupCluster({
						parentStatementId: parent.statementId,
						clusterId: cluster.statementId,
						currentAssignments: assignments,
					});
				} catch (error) {
					logError(error, {
						operation: 'GroupsCurationPage.handleRemoveAllGroupings.perCluster',
						statementId: cluster.statementId,
					});
					// Continue with the rest — partial success is better than all-or-nothing.
				}
			}
			setSelectedClusterId(null);
			setSelectedMemberIds(new Set());
			setPanelTab('list');
		} finally {
			setIsRemovingAll(false);
		}
	}

	async function handleUngroup(cluster: Statement) {
		if (
			!window.confirm(t('Ungroup this suggestion? Originals will appear as standalone options.'))
		) {
			return;
		}
		try {
			await ungroupCluster({
				parentStatementId: parent.statementId,
				clusterId: cluster.statementId,
				currentAssignments: assignments,
			});
			if (selectedClusterId === cluster.statementId) {
				setSelectedClusterId(null);
			}
		} catch (error) {
			logError(error, {
				operation: 'GroupsCurationPage.handleUngroup',
				statementId: cluster.statementId,
			});
		}
	}

	async function handleSplit(cluster: Statement) {
		if (selectedMemberIds.size < 2) {
			window.alert(t('Select at least two members to split into a new group.'));

			return;
		}
		try {
			await splitGroupMembers({
				parentStatement: parent,
				sourceClusterId: cluster.statementId,
				memberIdsToSplit: Array.from(selectedMemberIds),
				sourceIntegratedOptions: cluster.integratedOptions ?? [],
				currentAssignments: assignments,
			});
			setSelectedMemberIds(new Set());
		} catch (error) {
			logError(error, {
				operation: 'GroupsCurationPage.handleSplit',
				statementId: cluster.statementId,
			});
		}
	}

	function toggleMemberSelection(id: string) {
		setSelectedMemberIds((prev) => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id);
			else next.add(id);

			return next;
		});
	}

	return (
		<div className={styles['curation-page']}>
			<header className={styles['curation-page__header']}>
				<button
					type="button"
					className={styles['curation-page__back']}
					onClick={() => navigate(`/statement-screen/${parent.statementId}/settings`)}
					aria-label={t('Go back to settings')}
				>
					<ArrowLeft size={18} />
				</button>
				<div className={styles['curation-page__title-block']}>
					<h1 className={styles['curation-page__title']}>
						<Layers size={20} /> {t('Review groups')}
					</h1>
					<p className={styles['curation-page__subtitle']}>{parent.statement}</p>
				</div>
				{view.clusters.length > 0 && (
					<button
						type="button"
						className={styles['curation-page__btn-danger']}
						onClick={() => void handleRemoveAllGroupings()}
						disabled={isRemovingAll}
						aria-label={t('Remove all groupings')}
						title={t('Delete every group and return originals to the ungrouped list.')}
					>
						<Trash2 size={16} aria-hidden />
						{isRemovingAll
							? t('Removing…')
							: t('Remove all ({count})').replace('{count}', String(view.clusters.length))}
					</button>
				)}
			</header>

			{/* Mobile tab switcher */}
			<div className={styles['curation-page__tabs']} role="tablist">
				<button
					type="button"
					role="tab"
					aria-selected={panelTab === 'list'}
					className={`${styles['curation-page__tab']} ${panelTab === 'list' ? styles['curation-page__tab--active'] : ''}`}
					onClick={() => setPanelTab('list')}
				>
					{t('Groups')}
				</button>
				<button
					type="button"
					role="tab"
					aria-selected={panelTab === 'detail'}
					className={`${styles['curation-page__tab']} ${panelTab === 'detail' ? styles['curation-page__tab--active'] : ''}`}
					onClick={() => setPanelTab('detail')}
					disabled={!selectedCluster}
				>
					{t('Detail')}
				</button>
			</div>

			<div className={styles['curation-page__body']}>
				{/* LEFT COLUMN — groups list + ungrouped bucket */}
				<aside
					className={`${styles['curation-page__list']} ${panelTab === 'list' ? styles['curation-page__list--visible'] : ''}`}
					aria-label={t('Groups list')}
				>
					{/* + New group — create an empty cluster the admin can drag into */}
					{isCreatingGroup ? (
						<div className={styles['curation-page__new-group-form']}>
							<input
								type="text"
								className={styles['curation-page__new-group-input']}
								value={newGroupTitle}
								onChange={(e) => setNewGroupTitle(e.target.value)}
								onKeyDown={(e) => {
									if (e.key === 'Enter') {
										e.preventDefault();
										void handleCreateGroup();
									} else if (e.key === 'Escape') {
										e.preventDefault();
										setIsCreatingGroup(false);
										setNewGroupTitle('');
									}
								}}
								placeholder={t('Group title')}
								maxLength={120}
								autoFocus
								aria-label={t('Group title')}
							/>
							<div className={styles['curation-page__new-group-actions']}>
								<button
									type="button"
									className={styles['curation-page__btn-primary']}
									onClick={() => void handleCreateGroup()}
									disabled={!newGroupTitle.trim() || creatingSubmit}
								>
									{creatingSubmit ? t('Creating…') : t('Create')}
								</button>
								<button
									type="button"
									className={styles['curation-page__btn-ghost']}
									onClick={() => {
										setIsCreatingGroup(false);
										setNewGroupTitle('');
									}}
								>
									{t('Cancel')}
								</button>
							</div>
						</div>
					) : (
						<button
							type="button"
							className={styles['curation-page__new-group-trigger']}
							onClick={() => setIsCreatingGroup(true)}
						>
							<Plus size={16} /> {t('New group')}
						</button>
					)}
					{view.clusters.length === 0 && (
						<p className={styles['curation-page__empty']}>
							{t('No groups yet. Run grouping from the question settings to generate some.')}
						</p>
					)}
					{view.clusters.map((cluster) => {
						const members = view.originalsByCluster.get(cluster.statementId) ?? [];
						const isSelected = cluster.statementId === selectedClusterId;
						const isDragOver = cluster.statementId === dragOverClusterId;
						const isFlashing = cluster.statementId === flashClusterId;

						// Role-button div instead of <button>: native <button> is
						// an inconsistent drop target across browsers (often swallows
						// drop events). Div with role+tabIndex gives us keyboard
						// accessibility without breaking drag-and-drop.
						const onActivate = () => {
							setSelectedClusterId(cluster.statementId);
							setPanelTab('detail');
							setSelectedMemberIds(new Set());
						};

						return (
							<div
								key={cluster.statementId}
								role="button"
								tabIndex={0}
								aria-pressed={isSelected}
								className={`${styles['curation-page__group-card']} ${isSelected ? styles['curation-page__group-card--selected'] : ''} ${isDragOver ? styles['curation-page__group-card--drag-over'] : ''} ${isFlashing ? styles['curation-page__group-card--flash'] : ''}`}
								onClick={onActivate}
								onKeyDown={(e) => {
									if (e.key === 'Enter' || e.key === ' ') {
										e.preventDefault();
										onActivate();
									}
								}}
								onDragOver={(e) => {
									e.preventDefault();
									e.dataTransfer.dropEffect = 'move';
									setDragOverClusterId(cluster.statementId);
								}}
								onDragEnter={(e) => {
									e.preventDefault();
									setDragOverClusterId(cluster.statementId);
								}}
								onDragLeave={(e) => {
									// Only clear if we're actually leaving (not entering a child).
									if (!e.currentTarget.contains(e.relatedTarget as Node)) {
										setDragOverClusterId(null);
									}
								}}
								onDrop={(e) => onDropToCluster(e, cluster.statementId)}
							>
								<div className={styles['curation-page__group-card-title']}>
									<Layers size={14} aria-hidden />
									<span>{cluster.statement}</span>
									{cluster.titleLockedByCreator && (
										<Lock size={12} aria-label={t('Title locked')} />
									)}
								</div>
								<div className={styles['curation-page__group-card-meta']}>
									<span>{t('{count} members').replace('{count}', String(members.length))}</span>
									{cluster.evaluation && cluster.evaluation.numberOfEvaluators > 0 && (
										<>
											<span aria-hidden>·</span>
											<span>
												{t('{count} evaluators').replace(
													'{count}',
													String(cluster.evaluation.numberOfEvaluators),
												)}
											</span>
											<span aria-hidden>·</span>
											<span>
												{t('{pct}% agree').replace(
													'{pct}',
													String(Math.round((cluster.evaluation.agreement ?? 0) * 100)),
												)}
											</span>
										</>
									)}
									{cluster.evaluation && cluster.evaluation.numberOfEvaluators === 0 && (
										<>
											<span aria-hidden>·</span>
											<span className={styles['curation-page__group-card-meta-muted']}>
												{t('no evaluations yet')}
											</span>
										</>
									)}
								</div>
							</div>
						);
					})}

					{/* Ungrouped bucket */}
					<div
						className={`${styles['curation-page__ungrouped']} ${dragOverClusterId === '__ungrouped__' ? styles['curation-page__group-card--drag-over'] : ''}`}
						onDragOver={(e) => {
							e.preventDefault();
							e.dataTransfer.dropEffect = 'move';
							setDragOverClusterId('__ungrouped__');
						}}
						onDragEnter={(e) => {
							e.preventDefault();
							setDragOverClusterId('__ungrouped__');
						}}
						onDragLeave={(e) => {
							if (!e.currentTarget.contains(e.relatedTarget as Node)) {
								setDragOverClusterId(null);
							}
						}}
						onDrop={(e) => onDropToCluster(e, STANDALONE_OVERRIDE)}
						role="region"
						aria-label={t('Ungrouped')}
					>
						<h3>{t('Ungrouped')}</h3>
						<p className={styles['curation-page__ungrouped-hint']}>
							{t('Drop an original here to keep it standalone (excluded from grouping).')}
						</p>
						{view.ungrouped.map((original) => (
							<div
								key={original.statementId}
								className={styles['curation-page__ungrouped-item']}
								draggable
								onDragStart={(e) => onDragStart(e, original.statementId, null)}
								onDragEnd={() => setDragOverClusterId(null)}
							>
								<span className={styles['curation-page__ungrouped-item-text']}>
									{original.statement}
								</span>
								<MoveToMenu
									currentClusterId={null}
									allClusters={view.clusters}
									onMove={(target) => handleMove(original.statementId, target)}
								/>
							</div>
						))}
					</div>
				</aside>

				{/* RIGHT COLUMN — selected group detail */}
				<section
					className={`${styles['curation-page__detail']} ${panelTab === 'detail' ? styles['curation-page__detail--visible'] : ''}`}
					aria-label={t('Group detail')}
				>
					<div className={styles['curation-page__aria-live']} aria-live="polite" aria-atomic="true">
						{suggestion.kind === 'loading' && t('Generating title suggestion')}
						{suggestion.kind === 'ready' &&
							`${t('Suggestion ready')}: ${suggestion.suggestedTitle}`}
						{suggestion.kind === 'error' && t("Couldn't generate a suggestion.")}
					</div>
					{undoState && (
						<div className={styles['curation-page__undo-banner']} role="status" aria-live="polite">
							<span className={styles['curation-page__undo-banner-text']}>
								<Check size={14} aria-hidden />{' '}
								{t("Title updated and locked. The AI won't change it automatically.")}
							</span>
							<button
								type="button"
								className={styles['curation-page__undo-banner-action']}
								onClick={undoLastSuggestion}
							>
								{t('Undo')}
							</button>
						</div>
					)}
					{!selectedCluster && (
						<p className={styles['curation-page__empty']}>
							{t('Select a group on the left to review its members.')}
						</p>
					)}
					{selectedCluster && (
						<>
							<div className={styles['curation-page__detail-header']}>
								{editingTitle === selectedCluster.statementId ? (
									<div className={styles['curation-page__detail-edit']}>
										<input
											type="text"
											className={styles['curation-page__detail-title-input']}
											value={titleDraft}
											onChange={(e) => setTitleDraft(e.target.value)}
											aria-label={t('Title')}
										/>
										<textarea
											className={styles['curation-page__detail-description-input']}
											value={descriptionDraft}
											onChange={(e) => setDescriptionDraft(e.target.value)}
											placeholder={t('Description (optional)')}
											rows={2}
											aria-label={t('Description')}
										/>
										<div className={styles['curation-page__detail-edit-actions']}>
											<button
												type="button"
												className={styles['curation-page__btn-primary']}
												onClick={() => commitEditTitle(selectedCluster.statementId)}
											>
												{t('Save')}
											</button>
											<button
												type="button"
												className={styles['curation-page__btn-ghost']}
												onClick={() => setEditingTitle(null)}
											>
												<X size={14} /> {t('Cancel')}
											</button>
										</div>
									</div>
								) : (
									<>
										<h2 className={styles['curation-page__detail-title']}>
											{selectedCluster.statement}
											{!selectedCluster.titleLockedByCreator && (
												<span className={styles['curation-page__ai-badge']}>
													<Sparkles size={12} aria-hidden /> {t('AI-suggested')}
												</span>
											)}
										</h2>
										{selectedCluster.description && (
											<p className={styles['curation-page__detail-description']}>
												{selectedCluster.description}
											</p>
										)}
										<div className={styles['curation-page__score-breakdown']}>
											<ScoreBreakdown
												clusterId={selectedCluster.statementId}
												verbose
												alwaysExpanded
											/>
										</div>
										<div className={styles['curation-page__detail-actions']}>
											<button
												type="button"
												className={styles['curation-page__btn-ghost']}
												onClick={() => beginEditTitle(selectedCluster)}
											>
												<Pencil size={14} /> {t('Edit title')}
											</button>
											<button
												type="button"
												className={styles['curation-page__btn-ghost']}
												onClick={() => requestSuggestion(selectedCluster)}
												disabled={
													(selectedCluster.integratedOptions?.length ?? 0) < 2 ||
													(suggestion.kind === 'loading' &&
														suggestion.clusterId === selectedCluster.statementId)
												}
												title={
													(selectedCluster.integratedOptions?.length ?? 0) < 2
														? t('Add members to get a suggestion')
														: undefined
												}
											>
												<Wand2 size={14} />{' '}
												{suggestion.kind === 'loading' &&
												suggestion.clusterId === selectedCluster.statementId
													? t('Thinking…')
													: t('Suggest better title')}
											</button>
											<button
												type="button"
												className={styles['curation-page__btn-ghost']}
												onClick={() => handleToggleLock(selectedCluster)}
											>
												{selectedCluster.titleLockedByCreator ? (
													<>
														<Unlock size={14} /> {t('Unlock title')}
													</>
												) : (
													<>
														<Lock size={14} /> {t('Lock title')}
													</>
												)}
											</button>
											{selectedCluster.titleLockedByCreator && (
												<button
													type="button"
													className={styles['curation-page__btn-ghost']}
													onClick={() => handleResetTitle(selectedCluster)}
													title={t('Reset to AI suggestion on next run')}
												>
													<Sparkles size={14} /> {t('Reset to AI')}
												</button>
											)}
										</div>

										{(suggestion.kind === 'ready' || suggestion.kind === 'error') &&
											suggestion.clusterId === selectedCluster.statementId && (
												<div
													className={styles['curation-page__suggestion']}
													role="region"
													aria-label={t('AI suggestion')}
												>
													<div className={styles['curation-page__suggestion-header']}>
														<span className={styles['curation-page__suggestion-label']}>
															<Sparkles size={14} aria-hidden /> {t('AI suggestion')}
														</span>
														<button
															type="button"
															className={styles['curation-page__suggestion-close']}
															onClick={dismissSuggestion}
															aria-label={t('Dismiss')}
														>
															<X size={14} />
														</button>
													</div>
													{suggestion.kind === 'error' ? (
														<>
															<p className={styles['curation-page__suggestion-error']}>
																{t("Couldn't generate a suggestion.")}
															</p>
															<div className={styles['curation-page__suggestion-actions']}>
																<button
																	type="button"
																	className={styles['curation-page__btn-primary']}
																	onClick={() => requestSuggestion(selectedCluster)}
																>
																	{t('Try again')}
																</button>
															</div>
														</>
													) : (
														<>
															<input
																type="text"
																className={styles['curation-page__suggestion-title']}
																value={suggestion.draftTitle}
																onChange={(e) =>
																	setSuggestion((prev) =>
																		prev.kind === 'ready'
																			? { ...prev, draftTitle: e.target.value }
																			: prev,
																	)
																}
																onKeyDown={(e) => {
																	if (e.key === 'Enter') {
																		e.preventDefault();
																		applySuggestion(selectedCluster);
																	} else if (e.key === 'Escape') {
																		e.preventDefault();
																		dismissSuggestion();
																	}
																}}
																autoFocus
																aria-label={t('Suggested title')}
															/>
															<textarea
																className={styles['curation-page__suggestion-description']}
																value={suggestion.draftDescription}
																onChange={(e) =>
																	setSuggestion((prev) =>
																		prev.kind === 'ready'
																			? { ...prev, draftDescription: e.target.value }
																			: prev,
																	)
																}
																rows={2}
																placeholder={t('Description (optional)')}
																aria-label={t('Suggested description')}
															/>
															<p className={styles['curation-page__suggestion-hint']}>
																{suggestion.identical
																	? t('This matches the current title. Try editing members first.')
																	: t('Based on the {count} members in this group.').replace(
																			'{count}',
																			String(selectedCluster.integratedOptions?.length ?? 0),
																		)}
															</p>
															<div className={styles['curation-page__suggestion-actions']}>
																<button
																	type="button"
																	className={styles['curation-page__btn-primary']}
																	onClick={() => applySuggestion(selectedCluster)}
																	disabled={!suggestion.draftTitle.trim()}
																>
																	<Check size={14} /> {t('Apply')}
																</button>
																<button
																	type="button"
																	className={styles['curation-page__btn-ghost']}
																	onClick={dismissSuggestion}
																>
																	{t('Dismiss')}
																</button>
															</div>
														</>
													)}
												</div>
											)}
									</>
								)}
							</div>

							<div className={styles['curation-page__members']}>
								<div className={styles['curation-page__members-header']}>
									<h3>{t('Members')}</h3>
									<div className={styles['curation-page__members-bulk']}>
										<button
											type="button"
											className={styles['curation-page__btn-ghost']}
											onClick={() => handleSplit(selectedCluster)}
											disabled={selectedMemberIds.size < 2}
										>
											<Scissors size={14} /> {t('Split selected into new group')}
										</button>
										<button
											type="button"
											className={styles['curation-page__btn-danger']}
											onClick={() => handleUngroup(selectedCluster)}
										>
											<Trash2 size={14} /> {t('Ungroup')}
										</button>
									</div>
								</div>
								{selectedMembers.length === 0 && (
									<p className={styles['curation-page__empty']}>
										{t('This group has no members. It will be removed on the next run.')}
									</p>
								)}
								{selectedMembers.map((member) => {
									const isSelected = selectedMemberIds.has(member.statementId);

									return (
										<div
											key={member.statementId}
											className={`${styles['curation-page__member']} ${isSelected ? styles['curation-page__member--selected'] : ''}`}
											draggable
											onDragStart={(e) =>
												onDragStart(e, member.statementId, selectedCluster.statementId)
											}
											onDragEnd={() => setDragOverClusterId(null)}
										>
											<input
												type="checkbox"
												checked={isSelected}
												onChange={() => toggleMemberSelection(member.statementId)}
												onClick={(e) => e.stopPropagation()}
												aria-label={t('Select for split')}
											/>
											<span
												className={styles['curation-page__member-text']}
												title={member.statement}
											>
												{member.statement || `(${member.statementId.slice(0, 8)})`}
											</span>
											<MoveToMenu
												currentClusterId={selectedCluster.statementId}
												allClusters={view.clusters}
												onMove={(target) => handleMove(member.statementId, target)}
											/>
										</div>
									);
								})}
							</div>
						</>
					)}
				</section>
			</div>
		</div>
	);
};

// Keyboard-accessible fallback for drag-and-drop: a "Move to…" dropdown on
// every member row. Selecting an option issues the same write as dropping
// onto the target group.
const MoveToMenu: FC<{
	currentClusterId: string | null;
	allClusters: Statement[];
	onMove: (target: string | typeof STANDALONE_OVERRIDE) => void;
}> = ({ currentClusterId, allClusters, onMove }) => {
	const { t } = useTranslation();
	const [open, setOpen] = useState(false);

	return (
		<div className={styles['move-menu']}>
			<button
				type="button"
				className={styles['move-menu__trigger']}
				onClick={() => setOpen((v) => !v)}
				aria-haspopup="listbox"
				aria-expanded={open}
			>
				{t('Move to…')}
			</button>
			{open && (
				<ul
					className={styles['move-menu__list']}
					role="listbox"
					onMouseLeave={() => setOpen(false)}
				>
					{allClusters
						.filter((c) => c.statementId !== currentClusterId)
						.map((c) => (
							<li key={c.statementId}>
								<button
									type="button"
									role="option"
									aria-selected={false}
									className={styles['move-menu__item']}
									onClick={() => {
										onMove(c.statementId);
										setOpen(false);
									}}
								>
									{c.statement}
								</button>
							</li>
						))}
					<li className={styles['move-menu__divider']} />
					<li>
						<button
							type="button"
							role="option"
							aria-selected={false}
							className={styles['move-menu__item']}
							onClick={() => {
								onMove(STANDALONE_OVERRIDE);
								setOpen(false);
							}}
						>
							{t('Standalone (exclude from grouping)')}
						</button>
					</li>
				</ul>
			)}
		</div>
	);
};

export default GroupsCurationPage;
