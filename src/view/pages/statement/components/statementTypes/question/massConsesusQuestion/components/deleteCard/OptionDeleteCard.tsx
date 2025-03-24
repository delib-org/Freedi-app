import { Statement } from 'delib-npm';
import styles from './OptionDeleteCard.module.scss'
import { FC } from 'react';
import DeleteIcon from '@/assets/icons/delete.svg?react';
import { deleteStatementFromDB } from '@/controllers/db/statements/deleteStatements';
import { useSelector } from 'react-redux';
import { statementSubscriptionSelector } from '@/redux/statements/statementsSlice';

interface Props {
    statement: Statement;
}

const OptionDeleteCard: FC<Props> = ({ statement }) => {
    const role = useSelector(statementSubscriptionSelector(statement.statementId))?.role;
    const isAdmin = role === 'admin';
    
    function handleDelete() {
        deleteStatementFromDB(statement, isAdmin);
    }
    
    return (
        <div className={styles.deleteCard}>
            <div className={styles.deleteCardTexts}>
                <p><b>{statement.statement}</b></p>
                {statement.description && <p className={styles.description}>{statement.description}</p>}

            </div>
            <div className={styles.deleteCardBtns}>
                {isAdmin && <button className={styles.deleteCardBtn} onClick={handleDelete}><DeleteIcon /></button>}
                <span className={styles.consensus}> {(Math.round(statement.consensus * 100) / 100).toFixed(2)}</span>
            </div>
        </div>
    )
}

export default OptionDeleteCard