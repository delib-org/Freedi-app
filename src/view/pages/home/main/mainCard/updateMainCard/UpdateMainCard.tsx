import { FC, useEffect } from 'react';
import { Link } from 'react-router';
import { getStatementFromDB } from '@/controllers/db/statements/getStatement';
import { getTime, truncateString } from '@/controllers/general/helpers';
import { useAppDispatch, useAppSelector } from '@/controllers/hooks/reduxHooks';
import {
	setStatement,
	statementSelectorById,
} from '@/redux/statements/statementsSlice';
import { Statement } from '@/types/statement/Statement';

interface Props {
	statement: Statement;
}

const UpdateMainCard: FC<Props> = ({ statement }) => {
	try {
		if (!statement) throw new Error('No statement');
		if (!statement.parentId) throw new Error('No parent id');
		const dispatch = useAppDispatch();
		const parentStatement = useAppSelector(
			statementSelectorById(statement.parentId)
		);

		useEffect(() => {
			if (!parentStatement) {
				getStatementFromDB(statement.parentId).then((st) => {
					if (st) dispatch(setStatement(st));
				});
			}
		}, [parentStatement]);

		const group = parentStatement
			? getTitle(parentStatement.statement)
			: '';
		const text = statement.statement;

		return (
			<Link to={`/statement/${statement.parentId}/chat`}>
				<p>
					{parentStatement ? (
						<span>{truncateString(group)}: </span>
					) : null}
					<span>{truncateString(text, 32)} </span>
					<span className='time'>
						{getTime(statement.lastUpdate)}
					</span>
				</p>
			</Link>
		);
	} catch (error) {
		console.error(error);

		return null;
	}
};

export default UpdateMainCard;

export function getTitle(text: string): string {
	try {
		const texts = text.split('\n');

		//remove * only if in the start of the lin
		const title = texts[0].replace(/^\*/, '');

		return title;
	} catch (error) {
		console.error(error);

		return '';
	}
}
