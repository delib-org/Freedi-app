import React, { FC } from 'react';
import { useNavigate } from 'react-router';
import { Statement, StatementType } from '@freedi/shared-types';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { MAX_TREE_DEPTH } from '@/constants/treeView';
import TreeMessageNode from '../TreeMessageNode/TreeMessageNode';
import TreeOptionNode from '../TreeOptionNode/TreeOptionNode';
import CollapseToggle from '../CollapseToggle/CollapseToggle';
import TreeThreadLine from '../TreeThreadLine/TreeThreadLine';
import styles from './TreeNode.module.scss';

interface TreeNodeProps {
	statement: Statement;
	parentStatement: Statement | undefined;
	depth: number;
	childrenMap: Map<string, Statement[]>;
	expandedNodes: Set<string>;
	toggleNode: (id: string) => void;
	expandNode: (id: string) => void;
}

const TreeNode: FC<TreeNodeProps> = ({
	statement,
	parentStatement,
	depth,
	childrenMap,
	expandedNodes,
	toggleNode,
	expandNode,
}) => {
	const children = childrenMap.get(statement.statementId) || [];
	const hasChildren = children.length > 0;
	const isExpanded = expandedNodes.has(statement.statementId);
	const isAtMaxDepth = depth >= MAX_TREE_DEPTH;

	const isOption = depth === 1 && statement.statementType === StatementType.option;

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
					<TreeOptionNode statement={statement} parentStatement={parentStatement} />
				) : (
					<TreeMessageNode
						statement={statement}
						hasChildren={hasChildren}
						onReplySubmitted={() => expandNode(statement.statementId)}
					/>
				)}
			</div>

			{hasChildren && isAtMaxDepth && (
				<div
					className={styles['tree-node__dive-in']}
					style={{ '--depth': depth } as React.CSSProperties}
				>
					<DiveInPrompt statement={statement} childCount={children.length} />
				</div>
			)}

			{hasChildren && isExpanded && !isAtMaxDepth && (
				<div className={styles['tree-node__children']}>
					<TreeThreadLine />
					{children.map((child) => (
						<TreeNode
							key={child.statementId}
							statement={child}
							parentStatement={statement}
							depth={depth + 1}
							childrenMap={childrenMap}
							expandedNodes={expandedNodes}
							toggleNode={toggleNode}
							expandNode={expandNode}
						/>
					))}
				</div>
			)}
		</div>
	);
};

interface DiveInPromptProps {
	statement: Statement;
	childCount: number;
}

const DiveInPrompt: FC<DiveInPromptProps> = ({ statement, childCount }) => {
	const navigate = useNavigate();
	const { t } = useTranslation();

	return (
		<button
			className={styles['tree-node__dive-in-btn']}
			onClick={() => navigate(`/statement/${statement.statementId}`)}
		>
			&#8618; {childCount} {childCount === 1 ? t('reply') : t('replies')} &mdash; {t('Drill down')}
		</button>
	);
};

export default TreeNode;
