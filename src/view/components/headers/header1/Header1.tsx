import { FC, useContext } from 'react';
import EditableStatement from '../../edit/EditableStatement';
import styles from './Header1.module.scss';
import { StatementContext } from '@/view/pages/statement/StatementCont';

const Header1: FC = () => {
	const { statement } = useContext(StatementContext);

	return (
		<div className={`wrapper ${styles.wrapper}`}>
			<div className={styles.header1}>
				{statement ? (
					<h1>
						<EditableStatement
							statement={statement}
							variant="statement"
							showDescription={false}
							className={styles.editableHeader}
							textClassName={styles.headerText}
							inputClassName={styles.headerInput}
						/>
					</h1>
				) : (
					<h1>loading...</h1>
				)}
			</div>
		</div>
	);
};

export default Header1;
