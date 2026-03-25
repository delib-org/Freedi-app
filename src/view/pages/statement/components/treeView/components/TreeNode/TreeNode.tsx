import React, { FC, useMemo } from 'react';
import { useNavigate } from 'react-router';
import { Flipper, Flipped } from 'react-flip-toolkit';
import { Statement, StatementType } from '@freedi/shared-types';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { MAX_TREE_DEPTH } from '@/constants/treeView';
import TreeMessageNode from '../TreeMessageNode/TreeMessageNode';
import TreeOptionNode from '../TreeOptionNode/TreeOptionNode';
import CollapseToggle from '../CollapseToggle/CollapseToggle';
import styles from './TreeNode.module.scss';

const FLIP_SPRING = { stiffness: 300, damping: 30 };

interface TreeNodeProps {
	statement: Statement;
	parentStatement: Statement | undefined;
	depth: number;
	childrenMap: Map<string, Statement[]>;
	expandedNodes: Set<string>;
	toggleNode: (id: string) => void;
	expandNode: (id: string) => void;
	animate?: boolean;
}

const TreeNode: FC<TreeNodeProps> = ({
	statement,
	parentStatement,
	depth,
	childrenMap,
	expandedNodes,
	toggleNode,
	expandNode,
	animate,
}) => {
	const children = childrenMap.get(statement.statementId) || [];
	const hasChildren = children.length > 0;
	const isExpanded = expandedNodes.has(statement.statementId);
	const isAtMaxDepth = depth >= MAX_TREE_DEPTH;

	const isOption = statement.statementType === StatementType.option;
	const isQuestion = statement.statementType === StatementType.question;

	const childFlipKey = useMemo(
		() => (animate ? children.map((c) => c.statementId).join(',') : ''),
		[animate, children],
	);

	const childNodes = children.map((child) => (
		<TreeNode
			key={child.statementId}
			statement={child}
			parentStatement={statement}
			depth={depth + 1}
			childrenMap={childrenMap}
			expandedNodes={expandedNodes}
			toggleNode={toggleNode}
			expandNode={expandNode}
			animate={animate}
		/>
	));

	return (
		<div className={styles['tree-node']}>
			<div
				className={styles['tree-node__content']}
				style={{ '--depth': depth } as React.CSSProperties}
			>
				{hasChildren && !isAtMaxDepth && (
					<div className={styles['tree-node__toggle']}>
						<CollapseToggle
							childCount={children.length}
							isExpanded={isExpanded}
							onToggle={() => toggleNode(statement.statementId)}
						/>
					</div>
				)}
				{isOption ? (
					<TreeOptionNode
						statement={statement}
						parentStatement={parentStatement}
						onReplySubmitted={() => expandNode(statement.statementId)}
					/>
				) : (
					<TreeMessageNode
						statement={statement}
						parentStatement={parentStatement}
						hasChildren={hasChildren}
						onReplySubmitted={() => expandNode(statement.statementId)}
					/>
				)}
			</div>

			{(hasChildren && isAtMaxDepth) || isQuestion ? (
				<div
					className={styles['tree-node__dive-in']}
					style={{ '--depth': depth } as React.CSSProperties}
				>
					{isQuestion ? (
						<DiveInPrompt statement={statement} />
					) : (
						<DiveInPrompt statement={statement} childCount={children.length} />
					)}
				</div>
			) : null}

			{hasChildren && isExpanded && !isAtMaxDepth && (
				<div className={styles['tree-node__children']}>
					{animate ? (
						<Flipper flipKey={childFlipKey} spring={FLIP_SPRING}>
							{children.map((child) => (
								<Flipped key={child.statementId} flipId={child.statementId}>
									<div>
										<TreeNode
											statement={child}
											parentStatement={statement}
											depth={depth + 1}
											childrenMap={childrenMap}
											expandedNodes={expandedNodes}
											toggleNode={toggleNode}
											expandNode={expandNode}
											animate
										/>
									</div>
								</Flipped>
							))}
						</Flipper>
					) : (
						childNodes
					)}
				</div>
			)}
		</div>
	);
};

interface DiveInPromptProps {
	statement: Statement;
	childCount?: number;
}

const DiveInPrompt: FC<DiveInPromptProps> = ({ statement, childCount }) => {
	const navigate = useNavigate();
	const { t } = useTranslation();

	return (
		<button
			className={styles['tree-node__dive-in-btn']}
			onClick={() => navigate(`/statement/${statement.statementId}`)}
		>
			&#8618;{' '}
			{childCount !== undefined
				? `${childCount} ${childCount === 1 ? t('reply') : t('replies')} — `
				: ''}
			{t('Drill down')}
		</button>
	);
};

export default TreeNode;
