import { FC, useContext } from 'react';
import { useParams } from 'react-router';
import { StatementContext } from '@/view/pages/statement/StatementCont';
import ChatInput from '@/view/pages/statement/components/chat/components/input/ChatInput';
import StatementBottomNav from '@/view/pages/statement/components/nav/bottom/StatementBottomNav';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { useTreeData, TreeDataOptions } from './hooks/useTreeData';
import { useTreeState } from './hooks/useTreeState';
import TreeNode from './components/TreeNode/TreeNode';
import styles from './TreeView.module.scss';
import { StatementType, SortType } from '@freedi/shared-types';

interface TreeViewProps {
	typeFilter?: readonly StatementType[];
	showSortNav?: boolean;
	onlySelectedOptions?: boolean;
}

const TreeView: FC<TreeViewProps> = ({ typeFilter, showSortNav, onlySelectedOptions }) => {
	const { statementId, sort } = useParams();
	const { statement } = useContext(StatementContext);
	const { t } = useTranslation();

	const treeOptions: TreeDataOptions = {
		typeFilter,
		sortType: showSortNav ? (sort as SortType) || undefined : undefined,
		onlySelectedOptions,
	};

	const { childrenMap, rootChildren } = useTreeData(statementId || '', treeOptions);
	const { expandedNodes, toggleNode, expandNode } = useTreeState(childrenMap, statementId || '');

	return (
		<div className={styles['tree-view']}>
			<div className={styles['tree-view__list']}>
				{rootChildren.length === 0 ? (
					<div className={styles['tree-view__empty']}>{t('No replies yet')}</div>
				) : (
					rootChildren.map((child) => (
						<TreeNode
							key={child.statementId}
							statement={child}
							parentStatement={statement}
							depth={1}
							childrenMap={childrenMap}
							expandedNodes={expandedNodes}
							toggleNode={toggleNode}
							expandNode={expandNode}
						/>
					))
				)}
			</div>

			{showSortNav ? (
				<div className={styles['tree-view__bottom-nav']}>
					<StatementBottomNav />
				</div>
			) : (
				statement && (
					<div className={styles['tree-view__input']}>
						<ChatInput statement={statement} />
					</div>
				)
			)}
		</div>
	);
};

export default TreeView;
