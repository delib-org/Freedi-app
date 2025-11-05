import React, { useState, useEffect } from 'react';
import styles from './ProcessSettings.module.scss';
import { defaultMassConsensusProcess } from '@/model/massConsensus/massConsensusModel';
import { MassConsensusPageUrls, MassConsensusStage, MassConsensusStageType } from 'delib-npm';
import { removeMassConsensusStage, reorderMassConsensusProcessToDB } from '@/controllers/db/massConsensus/setMassConsensus';
import { useParams } from 'react-router';
import DeleteIcon from '@/assets/icons/delete.svg?react';
import PlusIcon from '@/assets/icons/plusIcon.svg?react';
import CloseIcon from '@/assets/icons/close.svg?react';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { v4 as uuidv4 } from 'uuid';

interface Props {
    processName: string;
    stages: MassConsensusStage[];
}

const ALL_STAGES: MassConsensusPageUrls[] = Object.values(MassConsensusPageUrls);

const STAGE_DISPLAY_NAMES: Record<MassConsensusPageUrls, string> = {
    [MassConsensusPageUrls.introduction]: 'Introduction',
    [MassConsensusPageUrls.userDemographics]: 'User Demographics',
    [MassConsensusPageUrls.question]: 'Question',
    [MassConsensusPageUrls.randomSuggestions]: 'Random Suggestions',
    [MassConsensusPageUrls.topSuggestions]: 'Top Suggestions',
    [MassConsensusPageUrls.mySuggestions]: 'My Suggestions',
    [MassConsensusPageUrls.voting]: 'Voting',
    [MassConsensusPageUrls.results]: 'Results Summary',
    [MassConsensusPageUrls.leaveFeedback]: 'Leave Feedback',
    [MassConsensusPageUrls.thankYou]: 'Thank You',
    [MassConsensusPageUrls.initialQuestion]: 'Initial Question',
};

const ProcessSettingNative = ({ processName, stages: _stages }: Props) => {
    const { statementId } = useParams<{ statementId: string }>();
    const { t } = useTranslation();

    const [stages, setStages] = useState<MassConsensusStage[]>(_stages || defaultMassConsensusProcess);
    const [showAddStage, setShowAddStage] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [draggedItem, setDraggedItem] = useState<string | null>(null);
    const [draggedOverItem, setDraggedOverItem] = useState<string | null>(null);

    useEffect(() => {
        if (_stages && _stages.length > 0) {
            setStages(_stages);
        }
    }, [_stages]);

    const currentStageUrls = stages.map(s => s.url);
    const availableStages = ALL_STAGES.filter(
        stage => !currentStageUrls.includes(stage)
    );

    const handleDragStart = (e: React.DragEvent, url: string) => {
        setDraggedItem(url);
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', url);
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    };

    const handleDragEnter = (e: React.DragEvent, url: string) => {
        e.preventDefault();
        setDraggedOverItem(url);
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        const relatedTarget = e.relatedTarget as HTMLElement;
        if (!relatedTarget || !e.currentTarget.contains(relatedTarget)) {
            setDraggedOverItem(null);
        }
    };

    const handleDrop = async (e: React.DragEvent, dropTargetUrl: string) => {
        e.preventDefault();

        if (draggedItem && draggedItem !== dropTargetUrl) {
            const oldIndex = stages.findIndex(stage => stage.url === draggedItem);
            const newIndex = stages.findIndex(stage => stage.url === dropTargetUrl);

            if (oldIndex !== -1 && newIndex !== -1) {
                const newStages = [...stages];
                const [movedItem] = newStages.splice(oldIndex, 1);
                newStages.splice(newIndex, 0, movedItem);

                // Re-order
                const reorderedStages = newStages.map((stage, index) => ({ ...stage, order: index + 1 }));

                setStages(reorderedStages);

                if (statementId) {
                    try {
                        await reorderMassConsensusProcessToDB({
                            stages: reorderedStages,
                            statementId,
                        });
                    } catch (error) {
                        console.error('Failed to save stage order:', error);
                        setStages(stages); // Revert on error
                    }
                }
            }
        }

        setDraggedItem(null);
        setDraggedOverItem(null);
    };

    const handleDragEnd = () => {
        setDraggedItem(null);
        setDraggedOverItem(null);
    };

    function handleDelete(url: MassConsensusPageUrls) {
        if (!statementId) return;

        try {
            removeMassConsensusStage(statementId, url);
        } catch (error) {
            console.error('Failed to delete stage:', error);
        }
    }

    const handleAddStage = async (url: MassConsensusPageUrls) => {
        if (!statementId) return;

        setIsLoading(true);

        try {
            const newStage: MassConsensusStage = {
                id: uuidv4(),
                url,
                title: STAGE_DISPLAY_NAMES[url] || url,
                type: MassConsensusStageType.introduction, // Default type
                order: stages.length + 1,
                skipable: true, // Default value
            };
            const updatedStages = [...stages, newStage];
            setStages(updatedStages);

            await reorderMassConsensusProcessToDB({
                stages: updatedStages,
                statementId,
            });

            setShowAddStage(false);
        } catch (error) {
            console.error('Failed to add stage:', error);
            setStages(stages); // Revert on error
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className={styles['process-setting']}>
            <h4>{processName}</h4>
            <div className={styles['process-items-container']}>
                {stages.map((stage, index) => {
                    const isDragging = draggedItem === stage.url;
                    const isDraggedOver = draggedOverItem === stage.url;

                    return (
                        <div
                            key={stage.url}
                            draggable
                            onDragStart={(e) => handleDragStart(e, stage.url!)}
                            onDragOver={handleDragOver}
                            onDragEnter={(e) => handleDragEnter(e, stage.url!)}
                            onDragLeave={handleDragLeave}
                            onDrop={(e) => handleDrop(e, stage.url!)}
                            onDragEnd={handleDragEnd}
                            className={styles['process-item']}
                            style={{
                                opacity: isDragging ? 0.5 : 1,
                                backgroundColor: isDraggedOver ? 'var(--background-hover, #f0f0f0)' : undefined,
                                transform: isDraggedOver ? 'scale(1.02)' : undefined,
                                transition: 'all 0.2s ease',
                            }}
                        >
                            <div className={styles['process-item__drag-area']}>
                                <span className={styles['process-item__content']}>
                                    {index + 1}: {t(stage.title || stage.url)}
                                </span>
                            </div>
                            <button
                                onClick={() => handleDelete(stage.url! as MassConsensusPageUrls)}
                                className={styles['process-item__delete']}
                                aria-label={`Delete ${stage.title || stage.url}`}
                                type="button"
                            >
                                <DeleteIcon />
                            </button>
                        </div>
                    );
                })}
            </div>

            {!showAddStage ? (
                <button
                    className={styles['add-step-button']}
                    onClick={() => setShowAddStage(true)}
                    aria-label="Add new stage to process"
                    aria-expanded={showAddStage}
                    disabled={availableStages.length === 0 || isLoading || !statementId}
                >
                    <PlusIcon className={styles['add-step-button__icon']} />
                    <span className={styles['add-step-button__text']}>
                        {isLoading
                            ? t('Adding...')
                            : availableStages.length === 0
                                ? t('All stages added')
                                : !statementId
                                    ? t('Statement ID required')
                                    : t('Add Stage')}
                    </span>
                </button>
            ) : (
                <div className={styles['add-step-dropdown']}>
                    <div className={styles['add-step-dropdown__header']}>
                        <span>{t('Select a stage to add')}</span>
                        <button
                            onClick={() => setShowAddStage(false)}
                            aria-label="Close add stage menu"
                            className={styles['add-step-dropdown__close']}
                        >
                            <CloseIcon />
                        </button>
                    </div>
                    <div className={styles['add-step-dropdown__list']}>
                        {availableStages.length > 0 ? (
                            availableStages.map(stage => (
                                <button
                                    key={stage}
                                    className={styles['add-step-dropdown__item']}
                                    onClick={() => handleAddStage(stage)}
                                    aria-label={`Add ${STAGE_DISPLAY_NAMES[stage]} to process`}
                                    disabled={isLoading}
                                >
                                    {t(STAGE_DISPLAY_NAMES[stage] || stage)}
                                </button>
                            ))
                        ) : (
                            <div className={styles['add-step-dropdown__empty']}>
                                {t('All stages have been added to this process')}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default ProcessSettingNative;