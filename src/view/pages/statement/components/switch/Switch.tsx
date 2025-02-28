import { useContext } from 'react';

import { StatementContext } from '../../StatementCont';
import FollowMeToast from '../followMeToast/FollowMeToast';
import styles from './Switch.module.scss';
import { useSwitchMV } from './SwitchMV';
import { StatementType } from '@/types/TypeEnums';

import SwitchScreen from './SwitchScreen';

const Switch = () => {
	const { statement, role } = useContext(StatementContext);
	const { parentStatement } = useSwitchMV();

	return (
		<main className='page__main'>

			<FollowMeToast />

			<div className={styles.header}>
				<h1>
					{parentStatement?.statementType === StatementType.question && statement?.statementType === StatementType.question
						? parentStatement?.statement
						: statement?.statement}
				</h1>
			</div>

			<SwitchScreen statement={statement} role={role} />

		</main>
	);
};

export default Switch;
