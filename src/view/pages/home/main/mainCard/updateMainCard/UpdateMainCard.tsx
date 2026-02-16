import { FC, useEffect } from 'react';
import { Link } from 'react-router';
import { getStatementFromDB } from '@/controllers/db/statements/getStatement';
import { getTime, truncateString } from '@/controllers/general/helpers';
import styles from './updateMainCard.module.scss';

import { setStatement, statementSelectorById } from '@/redux/statements/statementsSlice';
import { Statement, SimpleStatement } from '@freedi/shared-types';
import { useDispatch, useSelector } from 'react-redux';

interface Props {
	statement: Statement | SimpleStatement;
}

const UpdateMainCard: FC<Props> = ({ statement }) => {
	if (!statement) throw new Error('No statement');
	if (!statement.parentId) throw new Error('No parent id');
	const dispatch = useDispatch();
	const parentStatement = useSelector(statementSelectorById(statement.parentId));

	useEffect(() => {
		if (!parentStatement) {
			getStatementFromDB(statement.parentId).then((st) => {
				if (st) dispatch(setStatement(st));
			});
		}
	}, [parentStatement]);

	try {
		const group = parentStatement ? getTitle(parentStatement.statement) : '';
		const text = statement.statement;

		return (
			<Link
				className={styles.updates}
				to={`/statement/${statement.parentId}`}
				state={{ from: window.location.pathname }}
			>
				<div className={styles.updatesGroup}>{parentStatement ? <span>{group} </span> : null}</div>
				<div className={styles.updatesText}>
					<span>{truncateString(text, 120)} </span>
					<span className={styles.updatesTime}>{getTime(statement.lastUpdate)}</span>
				</div>
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
