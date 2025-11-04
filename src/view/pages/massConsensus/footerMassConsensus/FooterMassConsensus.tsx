import { useNavigate, useParams } from 'react-router';
import styles from './FooterMassConsensus.module.scss';
import { useUserConfig } from '@/controllers/hooks/useUserConfig';
import { useStageNavigation } from '../MassConsensusVM';
import { useState } from 'react';

const FooterMassConsensus = ({
    isIntro,
    isNextActive,
    isFeedback,
    onNext,
    onSkip,
    blockNavigation,
    evaluationsLeft,
    canSkip = true
}: {
    isIntro?: boolean;
    isNextActive?: boolean;
    isFeedback?: boolean;
    onNext?: () => void;
    onSkip?: () => void;
    blockNavigation?: boolean;
    evaluationsLeft?: number;
    canSkip?: boolean;
}) => {
    const { statementId } = useParams<{ statementId: string }>();
    const navigate = useNavigate();
    const { t, dir } = useUserConfig();
    const { nextStage: goTo, previousStage } = useStageNavigation();
    const [isButtonClicked, setIsButtonClicked] = useState(false);

    const handleClick = (callback?: () => void) => {
        if (!goTo) return;
        if (callback) callback();
        if (!blockNavigation) {
            setIsButtonClicked(true);
            navigate(`/mass-consensus/${statementId}/${goTo}`);
        }
    };
    const handleSkip = () => {
        if (!goTo) return;
        if (onSkip) onSkip();
        setIsButtonClicked(true);

        navigate(`/mass-consensus/${statementId}/${goTo}`);
    };

    const handleBack = () => {
        if (!previousStage) return;
        setIsButtonClicked(true);
        navigate(`/mass-consensus/${statementId}/${previousStage}`);
    };
    const renderButton = () => {
        if (isIntro) {
            return (
                <button
                    className='btn btn--massConsensus btn--primary'
                    onClick={() => handleClick()}
                    disabled={isButtonClicked}
                >
                    {isFeedback ? t('Send') : t('Start')}
                </button>
            );
        }

        return (
            <div className={styles.btns}>

                {evaluationsLeft > 0 && evaluationsLeft !== undefined && <p>{t('You have')} {evaluationsLeft} {t('evaluations left')}</p>}

                <div className="btns">
                    {previousStage && (
                        <button
                            className='btn btn--massConsensus btn--secondary'
                            disabled={isButtonClicked}
                            onClick={() => handleBack()}
                        >
                            {t('Back')}
                        </button>
                    )}

                    {canSkip && (
                        <button
                            className='btn btn--massConsensus btn--secondary'
                            disabled={isButtonClicked}
                            onClick={() => handleSkip()}
                        >
                            {t('Skip')}
                        </button>
                    )}

                    <button
                        className={`btn btn--massConsensus btn--primary ${!isNextActive ? 'btn--disabled' : ''}`}
                        onClick={() => handleClick(onNext)}
                        disabled={isButtonClicked || !isNextActive}
                    >
                        {t(isFeedback ? 'Send' : 'Next')}
                    </button>
                </div>
            </div>
        );

    };

    return (
        <div
            className={styles.footerMC}
            style={{ direction: dir}}
        >
            {renderButton()}
        </div>
    );
};

export default FooterMassConsensus;
