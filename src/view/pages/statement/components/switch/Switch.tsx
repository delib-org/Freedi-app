import { useContext, useState } from 'react';

import { StatementContext } from '../../StatementCont';
import FollowMeToast from '../followMeToast/FollowMeToast';
import styles from './Switch.module.scss';
import { useSwitchMV } from './SwitchMV';
import { StatementType } from 'delib-npm';

import SwitchScreen from './SwitchScreen';
import { updateStatementText } from '@/controllers/db/statements/setStatements';
import { useAuthentication } from '@/controllers/hooks/useAuthentication';

const Switch = () => {
	const { statement, role } = useContext(StatementContext);
	const { parentStatement } = useSwitchMV();
	const { user } = useAuthentication();
	const isCreator = statement?.creator.uid === user?.uid;

	const [edit, setEdit] = useState(false);

	function handleUpdateStatement(e) {
		if (e.key === 'Enter') {
			const title = e.target.value;
			updateStatementText(statement, title);
			setEdit(false);
		}
	}

	function handleStartEdit() {
		if (isCreator)
			setEdit(true);
	}

	return (
		<main className='page__main'>

			<FollowMeToast />

			<button className={styles.header} onClick={handleStartEdit}>
				{!edit ? <h1>
					{parentStatement?.statementType === StatementType.question && statement?.statementType === StatementType.question
						? parentStatement?.statement
						: statement?.statement}
				</h1> : <h1><input type="text" defaultValue={statement?.statement} onBlur={() => setEdit(false)} onKeyUp={handleUpdateStatement} /></h1>}
			</button>

			<SwitchScreen statement={statement} role={role} />

		</main>
	);
};

export default Switch;
