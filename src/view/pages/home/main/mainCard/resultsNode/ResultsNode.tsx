import { FC } from 'react';
import { Link } from 'react-router';
import Text from '@/view/components/text/Text';
import StatementChatMore from '@/view/pages/statement/components/chat/components/statementChatMore/StatementChatMore';
import { Statement } from '@freedi/shared-types';
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

				<div onClick={(e) => e.stopPropagation()}>
					<StatementChatMore statement={statement} />
				</div>
			</Link>
		</div>
	);
};
