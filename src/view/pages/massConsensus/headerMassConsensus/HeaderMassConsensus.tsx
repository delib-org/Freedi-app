// Third-party Libraries
import { Link, useParams } from 'react-router';
import { useSelector } from 'react-redux';

// NPM Packages
import { Role } from 'delib-npm';

// Redux Store
import { statementSubscriptionSelector, userSuggestionsSelector } from '@/redux/statements/statementsSlice';

// App Hooks
import { useTranslation } from '@/controllers/hooks/useTranslation';

// Icons
import BackIcon from '@/assets/icons/chevronLeftIcon.svg?react';
import HomeIcon from '@/assets/icons/homeIcon.svg?react';
import SmileIcon from '@/assets/icons/smile.svg?react';

// Local Imports - Hooks
import { useHeader } from './HeaderContext';
import { useStageNavigation } from '../MassConsensusVM';

import styles from './HeaderMassConsensus.module.scss';
import { creatorSelector } from '@/redux/creator/creatorSlice';

interface Props{
    showMySuggestions?: boolean;
}

const HeaderMassConsensus = ({ showMySuggestions = true }: Props) => {
    const { statementId } = useParams<{ statementId: string }>();
    const { dir} = useTranslation();
    const userId = useSelector(creatorSelector)?.uid
    const { backToApp } = useHeader();
    const role = useSelector(statementSubscriptionSelector(statementId))?.role;
    const { previousStage } = useStageNavigation();
    const doesUserHaveSuggestions = useSelector(userSuggestionsSelector(statementId, userId)).length > 0;
    const shouldShowMySuggestions = showMySuggestions && doesUserHaveSuggestions;

    return (
        <div className={`app-header app-header--sticky app-header--shadow ${styles.headerMC}`} style={{ direction: dir }}>
            <div className={`app-header-wrapper ${styles.headerMC__wrapper}`}>
                {previousStage && (
                    <Link
                        className={
                            dir === 'rtl'
                                ? `${styles.icon} ${styles['icon--rtl']}`
                                : styles.icon
                        }
                        to={
                            backToApp
                                ? `/statement/${statementId}`
                                : `/mass-consensus/${statementId}/${previousStage}`
                        }
                    >
                        <BackIcon />
                    </Link>
                )}

                <div className={styles.rightIcons}>
                    <Link
                        className={styles.icon}
                        to={role === Role.admin ? `/statement/${statementId}` : `/home`}
                    >
                        <HomeIcon />
                    </Link>
                    {shouldShowMySuggestions && (

                        <Link
                            className={styles.icon}
                            to={`/my-suggestions/statement/${statementId}`}
                            title="My Suggestions"
                        >
                            <SmileIcon />
                        </Link>
                    )}
                    
                </div>
            </div>
        </div>
    );
};

export default HeaderMassConsensus;
