import { FC, useContext, useMemo, useRef, useState, useEffect, useCallback } from 'react';
import { useParams, useSearchParams } from 'react-router';
import { Flipper, Flipped } from 'react-flip-toolkit';
import { StatementContext } from '@/view/pages/statement/StatementCont';
import ChatInput from '@/view/pages/statement/components/chat/components/input/ChatInput';
import StatementBottomNav from '@/view/pages/statement/components/nav/bottom/StatementBottomNav';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { useAuthentication } from '@/controllers/hooks/useAuthentication';
import { useAppSelector } from '@/controllers/hooks/reduxHooks';
import { bookmarkedStatementIdsSelector } from '@/redux/statements/statementsSlice';
import { useTreeData, TreeDataOptions } from './hooks/useTreeData';
import { useTreeState } from './hooks/useTreeState';
import { useTreeFilter } from './TreeFilterContext';
import { TreeFilterMode } from './TreeFilterMode';
import {
	useNewSolutionsBuffer,
	useNewSolutionsHighlight,
	MAX_DISPLAY_COUNT,
} from './hooks/useNewSolutionsBuffer';
import NewSolutionsPill from './components/NewSolutionsPill/NewSolutionsPill';
import TreeNode from './components/TreeNode/TreeNode';
import styles from './TreeView.module.scss';
import { Statement, StatementType, SortType } from '@freedi/shared-types';

interface TreeViewProps {
	typeFilter?: readonly StatementType[];
	showSortNav?: boolean;
	onlySelectedOptions?: boolean;
	defaultCollapsed?: boolean;
}

const FLIP_SPRING = { stiffness: 300, damping: 30 };

const TreeView: FC<TreeViewProps> = ({
	typeFilter,
	showSortNav,
	onlySelectedOptions,
	defaultCollapsed,
}) => {
	const { statementId, sort } = useParams();
	const [searchParams] = useSearchParams();
	const { statement } = useContext(StatementContext);
	const { t } = useTranslation();
	const { user } = useAuthentication();
	const bookmarkedIds = useAppSelector(bookmarkedStatementIdsSelector);
	const { filterMode, registerCollapseAll, registerExpandAll } = useTreeFilter();
	const treeViewRef = useRef<HTMLDivElement>(null);
	const prevCountRef = useRef(0);
	const isFirstRenderRef = useRef(true);

	const tParam = searchParams.get('t');
	const randomSeed = tParam ? Number(tParam) : undefined;

	const treeOptions: TreeDataOptions = {
		typeFilter,
		sortType: showSortNav ? (sort as SortType) || SortType.accepted : undefined,
		onlySelectedOptions,
		filterMode,
		userId: user?.uid,
		bookmarkedIds,
		randomSeed,
	};

	const { childrenMap, rootChildren: allRootChildren } = useTreeData(
		statementId || '',
		treeOptions,
	);

	// Buffer new solutions during live events so the list doesn't jump
	const isBufferingActive = !!showSortNav;
	const { visibleChildren, pendingCount, showPending } = useNewSolutionsBuffer(
		allRootChildren,
		isBufferingActive,
		user?.uid,
	);
	const rootChildren = isBufferingActive ? visibleChildren : allRootChildren;

	// Highlight solutions that just appeared (after flush or direct arrival)
	const highlightedIds = useNewSolutionsHighlight(rootChildren, !!showSortNav);

	const { expandedNodes, toggleNode, expandNode, collapseAll, expandAll } = useTreeState(
		childrenMap,
		statementId || '',
		defaultCollapsed,
	);

	const [replyToStatement, setReplyToStatement] = useState<Statement | null>(null);

	const handleClearReply = useCallback(() => {
		if (replyToStatement) {
			expandNode(replyToStatement.statementId);
		}
		setReplyToStatement(null);
	}, [replyToStatement, expandNode]);

	// Register collapse/expand so the header can trigger them
	useEffect(() => {
		registerCollapseAll(collapseAll);
		registerExpandAll(expandAll);
	}, [collapseAll, expandAll, registerCollapseAll, registerExpandAll]);

	const flipKey = useMemo(() => rootChildren.map((c) => c.statementId).join(','), [rootChildren]);

	// Total statement count across the entire tree (root + all nested children)
	const totalStatementCount = useMemo(() => {
		let count = rootChildren.length;
		childrenMap.forEach((children) => {
			count += children.length;
		});

		return count;
	}, [rootChildren, childrenMap]);

	// Find the nearest scrollable ancestor (page__main)
	const getScrollContainer = useCallback((): HTMLElement | null => {
		let el = treeViewRef.current?.parentElement ?? null;
		while (el) {
			const style = window.getComputedStyle(el);
			if (style.overflowY === 'auto' || style.overflowY === 'scroll') {
				return el;
			}
			el = el.parentElement;
		}

		return null;
	}, []);

	// Flush buffer + scroll to top so user sees the new solutions
	const handleShowPending = useCallback(() => {
		showPending();
		const container = getScrollContainer();
		if (container) {
			container.scrollTo({ top: 0, behavior: 'smooth' });
		}
	}, [showPending, getScrollContainer]);

	// Auto-scroll to bottom when new messages or replies are added
	useEffect(() => {
		if (totalStatementCount === 0) return;

		const isNewMessage = totalStatementCount > prevCountRef.current;
		prevCountRef.current = totalStatementCount;

		if (isFirstRenderRef.current) {
			isFirstRenderRef.current = false;
			const container = getScrollContainer();
			if (container) {
				container.scrollTop = container.scrollHeight;
			}

			return;
		}

		if (isNewMessage) {
			setTimeout(() => {
				const container = getScrollContainer();
				if (container) {
					container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
				}
			}, 150);
		}
	}, [totalStatementCount, getScrollContainer]);

	// Reset on statement change
	useEffect(() => {
		isFirstRenderRef.current = true;
		prevCountRef.current = 0;
	}, [statementId]);

	const renderEmptyState = () => {
		if (filterMode === TreeFilterMode.bookmarked) {
			return (
				<div className={styles['tree-view__empty-state']}>
					<span
						className="material-symbols-outlined"
						style={{ fontSize: 48, color: 'var(--text-secondary, #999)' }}
					>
						bookmark
					</span>
					<p className={styles['tree-view__empty-title']}>{t('No bookmarks yet')}</p>
					<p className={styles['tree-view__empty-subtitle']}>
						{t('Tap the bookmark icon on any message to save it for quick access')}
					</p>
				</div>
			);
		}
		if (filterMode === TreeFilterMode.mine) {
			return (
				<div className={styles['tree-view__empty-state']}>
					<span
						className="material-symbols-outlined"
						style={{ fontSize: 48, color: 'var(--text-secondary, #999)' }}
					>
						person
					</span>
					<p className={styles['tree-view__empty-title']}>{t("You haven't posted yet")}</p>
					<p className={styles['tree-view__empty-subtitle']}>
						{t('Join the discussion by typing a message below')}
					</p>
				</div>
			);
		}

		return <div className={styles['tree-view__empty']}>{t('No replies yet')}</div>;
	};

	return (
		<div ref={treeViewRef} className={styles['tree-view']}>
			<div className={styles['tree-view__list']}>
				{pendingCount > 0 && showSortNav && (
					<NewSolutionsPill
						count={pendingCount}
						maxDisplayCount={MAX_DISPLAY_COUNT}
						onClick={handleShowPending}
					/>
				)}
				{rootChildren.length === 0 && pendingCount === 0 ? (
					renderEmptyState()
				) : showSortNav ? (
					<>
						<Flipper flipKey={flipKey} spring={FLIP_SPRING}>
							{rootChildren.map((child) => (
								<Flipped key={child.statementId} flipId={child.statementId}>
									<div>
										<TreeNode
											statement={child}
											parentStatement={statement}
											depth={1}
											childrenMap={childrenMap}
											expandedNodes={expandedNodes}
											toggleNode={toggleNode}
											expandNode={expandNode}
											onReply={setReplyToStatement}
											isNew={highlightedIds.has(child.statementId)}
											animate
										/>
									</div>
								</Flipped>
							))}
						</Flipper>
					</>
				) : (
					<>
						{rootChildren.map((child) => (
							<TreeNode
								key={child.statementId}
								statement={child}
								parentStatement={statement}
								depth={1}
								childrenMap={childrenMap}
								expandedNodes={expandedNodes}
								toggleNode={toggleNode}
								expandNode={expandNode}
								onReply={setReplyToStatement}
							/>
						))}
					</>
				)}
			</div>

			{showSortNav ? (
				<>
					{replyToStatement && statement ? (
						<div className={styles['tree-view__input']}>
							<ChatInput
								statement={statement}
								replyToStatement={replyToStatement}
								onClearReply={handleClearReply}
								replyAsChild
							/>
						</div>
					) : (
						<div className={styles['tree-view__bottom-nav']}>
							<StatementBottomNav />
						</div>
					)}
				</>
			) : (
				statement && (
					<div className={styles['tree-view__input']}>
						<ChatInput
							statement={statement}
							replyToStatement={replyToStatement}
							onClearReply={handleClearReply}
							replyAsChild
						/>
					</div>
				)
			)}
		</div>
	);
};

export default TreeView;
