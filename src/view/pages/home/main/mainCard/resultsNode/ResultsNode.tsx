import { FC } from 'react';
import { Link } from 'react-router';
import Text from '@/view/components/text/Text';
import StatementChatMore from '@/view/pages/statement/components/chat/components/StatementChatMore';
import './ResultsNode.scss';
import { Statement } from '@/types/statement/Statement';
import { styleSwitch } from './ResultsNodeCont';

interface Props {
	statement: Statement;
}
export const ResultsNode: FC<Props> = ({ statement }) => {
	return (
		<div className={styleSwitch(statement)}>
			<Link
				state={{
					from: window.location.pathname,
				}}
				to={`/statement/${statement.statementId}/chat`}
			>
				<Text statement={statement.statement} />

				<StatementChatMore statement={statement} />
			</Link>
		</div>
	);
};
