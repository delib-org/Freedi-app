import { FC } from 'react';
import { Statement } from '@freedi/shared-types';
import SuggestionCard from '@/view/pages/statement/components/evaluations/components/suggestionCards/suggestionCard/SuggestionCard';
import styles from './TreeOptionNode.module.scss';

interface TreeOptionNodeProps {
	statement: Statement;
	parentStatement: Statement | undefined;
}

const TreeOptionNode: FC<TreeOptionNodeProps> = ({ statement, parentStatement }) => {
	return (
		<div className={styles['tree-option-node']}>
			<SuggestionCard statement={statement} parentStatement={parentStatement} />
		</div>
	);
};

export default TreeOptionNode;
