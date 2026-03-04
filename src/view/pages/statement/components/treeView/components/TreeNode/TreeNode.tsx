import React, { FC } from 'react';
import { Statement, StatementType } from '@freedi/shared-types';
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
}

const TreeNode: FC<TreeNodeProps> = ({
	statement,
	parentStatement,
	depth,
	childrenMap,
	expandedNodes,
	toggleNode,
}) => {
	if (depth > MAX_TREE_DEPTH) return null;

	const children = childrenMap.get(statement.statementId) || [];
	const hasChildren = children.length > 0;
	const isExpanded = expandedNodes.has(statement.statementId);

	const isOption = depth === 1 && statement.statementType === StatementType.option;

	return (
		<div className={styles['tree-node']}>
			<div
				className={styles['tree-node__content']}
				style={{ '--depth': depth } as React.CSSProperties}
			>
				{isOption ? (
					<TreeOptionNode statement={statement} parentStatement={parentStatement} />
				) : (
					<TreeMessageNode statement={statement} hasChildren={hasChildren} />
				)}
			</div>

			{hasChildren && !isExpanded && (
				<div
					className={styles['tree-node__collapse']}
					style={{ '--depth': depth } as React.CSSProperties}
				>
					<CollapseToggle
						childCount={children.length}
						isExpanded={false}
						onToggle={() => toggleNode(statement.statementId)}
					/>
				</div>
			)}

			{hasChildren && isExpanded && (
				<>
					<div
						className={styles['tree-node__collapse']}
						style={{ '--depth': depth } as React.CSSProperties}
					>
						<CollapseToggle
							childCount={children.length}
							isExpanded={true}
							onToggle={() => toggleNode(statement.statementId)}
						/>
					</div>
					<div className={styles['tree-node__children']}>
						{depth < MAX_TREE_DEPTH && <TreeThreadLine />}
						{children.map((child) => (
							<TreeNode
								key={child.statementId}
								statement={child}
								parentStatement={statement}
								depth={depth + 1}
								childrenMap={childrenMap}
								expandedNodes={expandedNodes}
								toggleNode={toggleNode}
							/>
						))}
					</div>
				</>
			)}
		</div>
	);
};

export default TreeNode;
