'use client';

import { useState, useEffect, useCallback } from 'react';
import { Statement } from '@freedi/shared-types';
import { useTranslation } from '@freedi/shared-i18n/next';
import { useAuth } from '@/components/auth/AuthProvider';
import styles from './CreateQuestionModal.module.scss';

interface CreateQuestionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onQuestionCreated: (question: Statement) => void;
}

type Step = 1 | 2 | 3;
type EvaluationType = 'suggestions' | 'voting' | 'checkbox';

interface GroupData {
  statementId: string;
  statement: string;
  createdAt?: number;
}

/**
 * Modal for creating a new question in the Mass Consensus app
 * 3-step wizard: Group Selection -> Question Details -> Initial Solutions
 */
export default function CreateQuestionModal({
  isOpen,
  onClose,
  onQuestionCreated,
}: CreateQuestionModalProps) {
  const { t } = useTranslation();
  const { refreshToken } = useAuth();

  // Step state
  const [currentStep, setCurrentStep] = useState<Step>(1);

  // Step 1: Group Selection
  const [groups, setGroups] = useState<GroupData[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [groupsError, setGroupsError] = useState<string | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [groupSearchQuery, setGroupSearchQuery] = useState('');
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [creatingGroup, setCreatingGroup] = useState(false);

  // Step 2: Question Details
  const [questionText, setQuestionText] = useState('');
  const [evaluationType, setEvaluationType] = useState<EvaluationType>('suggestions');
  const [maxVotes, setMaxVotes] = useState(3);
  const [requireSolutionFirst, setRequireSolutionFirst] = useState(false);

  // Step 3: Solutions
  const [solutionsText, setSolutionsText] = useState('');
  const [skipSolutions, setSkipSolutions] = useState(false);

  // General state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch groups when modal opens
  const fetchGroups = useCallback(async () => {
    setGroupsLoading(true);
    setGroupsError(null);

    try {
      const token = await refreshToken();
      if (!token) {
        setGroupsError(t('sessionExpired') || 'Session expired');
        return;
      }

      const response = await fetch('/api/groups', {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch groups');
      }

      const data = await response.json();
      setGroups(data.groups || []);
    } catch (err) {
      console.error('[CreateQuestionModal] Error fetching groups:', err);
      setGroupsError(t('failedToLoadGroups') || 'Failed to load groups');
    } finally {
      setGroupsLoading(false);
    }
  }, [refreshToken, t]);

  useEffect(() => {
    if (isOpen) {
      fetchGroups();
      // Reset state when modal opens
      setCurrentStep(1);
      setSelectedGroupId(null);
      setQuestionText('');
      setEvaluationType('suggestions');
      setMaxVotes(3);
      setRequireSolutionFirst(false);
      setSolutionsText('');
      setSkipSolutions(false);
      setError(null);
      setIsCreatingGroup(false);
      setNewGroupName('');
    }
  }, [isOpen, fetchGroups]);

  // Filter groups by search query
  const filteredGroups = groups.filter((group) =>
    group.statement.toLowerCase().includes(groupSearchQuery.toLowerCase())
  );

  // Parse solutions from text
  const parsedSolutions = solutionsText
    .split('\n')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  // Create new group
  const handleCreateGroup = async () => {
    if (!newGroupName.trim() || newGroupName.trim().length < 3) return;

    setCreatingGroup(true);
    try {
      const token = await refreshToken();
      if (!token) {
        setError(t('sessionExpired') || 'Session expired');
        return;
      }

      const response = await fetch('/api/groups', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ title: newGroupName.trim() }),
      });

      if (!response.ok) {
        throw new Error('Failed to create group');
      }

      const data = await response.json();
      const newGroup = data.group;

      // Add to groups list and select it
      setGroups((prev) => [newGroup, ...prev]);
      setSelectedGroupId(newGroup.statementId);
      setIsCreatingGroup(false);
      setNewGroupName('');
    } catch (err) {
      console.error('[CreateQuestionModal] Error creating group:', err);
      setError(t('failedToCreateGroup') || 'Failed to create group');
    } finally {
      setCreatingGroup(false);
    }
  };

  // Create question
  const handleCreateQuestion = async () => {
    if (!selectedGroupId || !questionText.trim()) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const token = await refreshToken();
      if (!token) {
        setError(t('sessionExpired') || 'Session expired');
        return;
      }

      const response = await fetch('/api/questions/create', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          statement: questionText.trim(),
          parentId: selectedGroupId,
          evaluationType,
          maxVotesPerUser: evaluationType === 'voting' ? maxVotes : undefined,
          askUserForASolutionBeforeEvaluation: requireSolutionFirst,
          solutions: skipSolutions ? [] : parsedSolutions,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create question');
      }

      const data = await response.json();
      onQuestionCreated(data.question);
    } catch (err) {
      console.error('[CreateQuestionModal] Error creating question:', err);
      setError(
        err instanceof Error
          ? err.message
          : t('failedToCreateQuestion') || 'Failed to create question'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  // Navigation
  const canContinueStep1 = selectedGroupId !== null;
  const canContinueStep2 = questionText.trim().length >= 3;
  const canCreate = canContinueStep1 && canContinueStep2;

  const handleNext = () => {
    if (currentStep === 1 && canContinueStep1) {
      setCurrentStep(2);
    } else if (currentStep === 2 && canContinueStep2) {
      setCurrentStep(3);
    } else if (currentStep === 3 && canCreate) {
      handleCreateQuestion();
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep((currentStep - 1) as Step);
    }
  };

  if (!isOpen) return null;

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>{t('createQuestion') || 'Create Question'}</h2>
          <button
            className={styles.closeButton}
            onClick={onClose}
            aria-label={t('close') || 'Close'}
          >
            &times;
          </button>
        </div>

        {/* Step Indicator */}
        <div className={styles.stepIndicator}>
          <div className={styles.step}>
            <div
              className={`${styles.stepCircle} ${
                currentStep === 1
                  ? styles.active
                  : currentStep > 1
                    ? styles.completed
                    : styles.upcoming
              }`}
            >
              {currentStep > 1 ? '✓' : '1'}
            </div>
            <span
              className={`${styles.stepLabel} ${
                currentStep === 1
                  ? styles.active
                  : currentStep > 1
                    ? styles.completed
                    : ''
              }`}
            >
              {t('group') || 'Group'}
            </span>
          </div>

          <div className={`${styles.stepConnector} ${currentStep > 1 ? styles.completed : ''}`} />

          <div className={styles.step}>
            <div
              className={`${styles.stepCircle} ${
                currentStep === 2
                  ? styles.active
                  : currentStep > 2
                    ? styles.completed
                    : styles.upcoming
              }`}
            >
              {currentStep > 2 ? '✓' : '2'}
            </div>
            <span
              className={`${styles.stepLabel} ${
                currentStep === 2
                  ? styles.active
                  : currentStep > 2
                    ? styles.completed
                    : ''
              }`}
            >
              {t('question') || 'Question'}
            </span>
          </div>

          <div className={`${styles.stepConnector} ${currentStep > 2 ? styles.completed : ''}`} />

          <div className={styles.step}>
            <div
              className={`${styles.stepCircle} ${
                currentStep === 3 ? styles.active : styles.upcoming
              }`}
            >
              3
            </div>
            <span className={`${styles.stepLabel} ${currentStep === 3 ? styles.active : ''}`}>
              {t('solutions') || 'Solutions'}
            </span>
          </div>
        </div>

        {/* Content */}
        <div className={styles.modalContent}>
          {error && <div className={styles.error}>{error}</div>}

          {/* Step 1: Group Selection */}
          {currentStep === 1 && (
            <div>
              <h3 className={styles.stepTitle}>{t('selectParentGroup') || 'Select Parent Group'}</h3>
              <p className={styles.stepDescription}>
                {t('selectGroupDescription') || 'Choose where this question will be created'}
              </p>

              {groupsLoading ? (
                <div className={styles.loading}>
                  <div className={styles.spinner} />
                  <span>{t('loadingGroups') || 'Loading groups...'}</span>
                </div>
              ) : groupsError ? (
                <div className={styles.emptyState}>
                  <p>{groupsError}</p>
                  <button className={styles.createGroupButton} onClick={fetchGroups}>
                    {t('retry') || 'Retry'}
                  </button>
                </div>
              ) : groups.length === 0 && !isCreatingGroup ? (
                <div className={styles.emptyState}>
                  <p>{t('noGroupsFound') || 'No Groups Found'}</p>
                  <p className={styles.hint}>
                    {t('noGroupsDescription') ||
                      'Create your first group to start adding questions.'}
                  </p>
                  <button
                    className={styles.createGroupButton}
                    onClick={() => setIsCreatingGroup(true)}
                  >
                    {t('createFirstGroup') || 'Create Your First Group'}
                  </button>
                </div>
              ) : (
                <>
                  {groups.length > 0 && (
                    <>
                      <input
                        type="text"
                        className={styles.searchInput}
                        placeholder={t('searchGroups') || 'Search groups...'}
                        value={groupSearchQuery}
                        onChange={(e) => setGroupSearchQuery(e.target.value)}
                      />

                      <div className={styles.groupList}>
                        {filteredGroups.map((group) => (
                          <div
                            key={group.statementId}
                            className={`${styles.groupCard} ${
                              selectedGroupId === group.statementId ? styles.selected : ''
                            }`}
                            onClick={() => setSelectedGroupId(group.statementId)}
                          >
                            <input
                              type="radio"
                              className={styles.groupRadio}
                              checked={selectedGroupId === group.statementId}
                              onChange={() => setSelectedGroupId(group.statementId)}
                            />
                            <div className={styles.groupInfo}>
                              <div className={styles.groupName}>{group.statement}</div>
                              {group.createdAt && (
                                <div className={styles.groupMeta}>
                                  {new Date(group.createdAt).toLocaleDateString()}
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}

                  {!isCreatingGroup && (
                    <>
                      <div className={styles.divider}>{t('or') || 'OR'}</div>
                      <button
                        className={styles.createGroupButton}
                        onClick={() => setIsCreatingGroup(true)}
                      >
                        {t('createNewGroup') || '+ Create New Group'}
                      </button>
                    </>
                  )}

                  {isCreatingGroup && (
                    <div className={styles.createGroupForm}>
                      <input
                        type="text"
                        className={styles.createGroupInput}
                        placeholder={t('groupNamePlaceholder') || 'Enter group name...'}
                        value={newGroupName}
                        onChange={(e) => setNewGroupName(e.target.value)}
                        autoFocus
                      />
                      <div className={styles.createGroupActions}>
                        <button
                          className={styles.backButton}
                          onClick={() => {
                            setIsCreatingGroup(false);
                            setNewGroupName('');
                          }}
                          disabled={creatingGroup}
                        >
                          {t('cancel') || 'Cancel'}
                        </button>
                        <button
                          className={styles.continueButton}
                          onClick={handleCreateGroup}
                          disabled={creatingGroup || newGroupName.trim().length < 3}
                        >
                          {creatingGroup ? (
                            <span className={styles.buttonSpinner} />
                          ) : (
                            t('create') || 'Create'
                          )}
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Step 2: Question Details */}
          {currentStep === 2 && (
            <div>
              <h3 className={styles.stepTitle}>{t('questionDetails') || 'Question Details'}</h3>

              <div className={styles.formGroup}>
                <label>{t('questionText') || 'Question Text'} *</label>
                <input
                  type="text"
                  className={`${styles.textInput} ${
                    questionText.length > 0 && questionText.length < 3 ? styles.inputError : ''
                  }`}
                  placeholder={t('questionTextPlaceholder') || 'What should be our top priority?'}
                  value={questionText}
                  onChange={(e) => setQuestionText(e.target.value)}
                  autoFocus
                />
                {questionText.length > 0 && questionText.length < 3 && (
                  <span className={styles.errorText}>
                    {t('questionTextMinLength') || 'Question must be at least 3 characters'}
                  </span>
                )}
              </div>

              <div className={styles.formGroup}>
                <label>{t('evaluationType') || 'Evaluation Type'}</label>
                <div className={styles.evaluationTypePills}>
                  <div
                    className={`${styles.evaluationPill} ${
                      evaluationType === 'suggestions' ? styles.selected : ''
                    }`}
                    onClick={() => setEvaluationType('suggestions')}
                  >
                    <input
                      type="radio"
                      className={styles.pillRadio}
                      checked={evaluationType === 'suggestions'}
                      onChange={() => setEvaluationType('suggestions')}
                    />
                    <div className={styles.pillContent}>
                      <div className={styles.pillTitle}>
                        {t('agreementScale') || 'Agreement Scale'}
                      </div>
                      <div className={styles.pillDescription}>
                        {t('agreementScaleDesc') ||
                          'Participants rate on a scale from strongly disagree to strongly agree'}
                      </div>
                    </div>
                  </div>

                  <div
                    className={`${styles.evaluationPill} ${
                      evaluationType === 'voting' ? styles.selected : ''
                    }`}
                    onClick={() => setEvaluationType('voting')}
                  >
                    <input
                      type="radio"
                      className={styles.pillRadio}
                      checked={evaluationType === 'voting'}
                      onChange={() => setEvaluationType('voting')}
                    />
                    <div className={styles.pillContent}>
                      <div className={styles.pillTitle}>{t('voting') || 'Voting'}</div>
                      <div className={styles.pillDescription}>
                        {t('votingDesc') || 'Participants vote for their preferred options'}
                      </div>
                      {evaluationType === 'voting' && (
                        <div className={styles.maxVotesInput}>
                          <label>{t('maxVotesPerUser') || 'Max votes:'}</label>
                          <input
                            type="number"
                            min={1}
                            max={10}
                            value={maxVotes}
                            onChange={(e) => setMaxVotes(parseInt(e.target.value) || 3)}
                            onClick={(e) => e.stopPropagation()}
                          />
                        </div>
                      )}
                    </div>
                  </div>

                  <div
                    className={`${styles.evaluationPill} ${
                      evaluationType === 'checkbox' ? styles.selected : ''
                    }`}
                    onClick={() => setEvaluationType('checkbox')}
                  >
                    <input
                      type="radio"
                      className={styles.pillRadio}
                      checked={evaluationType === 'checkbox'}
                      onChange={() => setEvaluationType('checkbox')}
                    />
                    <div className={styles.pillContent}>
                      <div className={styles.pillTitle}>{t('checkbox') || 'Checkbox / Approval'}</div>
                      <div className={styles.pillDescription}>
                        {t('checkboxDesc') || 'Participants can approve multiple options'}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className={styles.formGroup}>
                <div className={styles.toggleRow}>
                  <input
                    type="checkbox"
                    id="requireSolution"
                    checked={requireSolutionFirst}
                    onChange={(e) => setRequireSolutionFirst(e.target.checked)}
                  />
                  <label htmlFor="requireSolution" className={styles.toggleContent}>
                    <div className={styles.toggleTitle}>
                      {t('requireSolutionFirst') ||
                        'Require participants to suggest a solution before evaluating others'}
                    </div>
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Initial Solutions */}
          {currentStep === 3 && (
            <div>
              <h3 className={styles.stepTitle}>
                {t('initialSolutions') || 'Add Initial Solutions'}
                <span style={{ fontWeight: 'normal', color: 'var(--text-muted)' }}>
                  {' '}
                  ({t('optional') || 'Optional'})
                </span>
              </h3>
              <p className={styles.stepDescription}>
                {t('initialSolutionsDesc') || 'Paste solutions separated by new lines'}
              </p>

              <textarea
                className={styles.solutionsTextarea}
                placeholder={
                  t('solutionsPlaceholder') ||
                  'Focus on customer retention\nExpand to new markets\nImprove product quality'
                }
                value={solutionsText}
                onChange={(e) => setSolutionsText(e.target.value)}
                disabled={skipSolutions}
              />

              {parsedSolutions.length > 0 && !skipSolutions && (
                <div className={styles.solutionsPreview}>
                  <div className={styles.previewHeader}>
                    <span className={styles.previewTitle}>{t('preview') || 'Preview'}</span>
                    <span className={styles.previewCount}>
                      {parsedSolutions.length}{' '}
                      {parsedSolutions.length === 1
                        ? t('solution') || 'solution'
                        : t('solutions') || 'solutions'}
                    </span>
                  </div>
                  <div className={styles.previewList}>
                    {parsedSolutions.map((solution, index) => (
                      <div key={index} className={styles.previewItem}>
                        <span className={styles.previewNumber}>{index + 1}</span>
                        <span className={styles.previewText}>{solution}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {parsedSolutions.length === 0 && !skipSolutions && (
                <div className={styles.solutionsPreview}>
                  <div className={styles.emptyPreview}>
                    {t('pasteYourSolutions') || 'Paste your solutions above, one per line'}
                  </div>
                </div>
              )}

              <label className={styles.skipOption}>
                <input
                  type="checkbox"
                  checked={skipSolutions}
                  onChange={(e) => setSkipSolutions(e.target.checked)}
                />
                <span>{t('skipSolutions') || "Skip - don't add solutions now"}</span>
              </label>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className={styles.modalFooter}>
          <button
            className={styles.backButton}
            onClick={currentStep === 1 ? onClose : handleBack}
            disabled={isSubmitting}
          >
            {currentStep === 1 ? t('cancel') || 'Cancel' : t('back') || 'Back'}
          </button>

          {currentStep < 3 ? (
            <button
              className={styles.continueButton}
              onClick={handleNext}
              disabled={
                (currentStep === 1 && !canContinueStep1) ||
                (currentStep === 2 && !canContinueStep2)
              }
            >
              {t('continue') || 'Continue'}
            </button>
          ) : (
            <button
              className={styles.createButton}
              onClick={handleCreateQuestion}
              disabled={!canCreate || isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <span className={styles.buttonSpinner} />
                  {t('creating') || 'Creating...'}
                </>
              ) : (
                t('createQuestion') || 'Create Question'
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
