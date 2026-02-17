'use client';

import { useState, useCallback } from 'react';
import { useTranslation } from '@freedi/shared-i18n/next';
import { useRouter } from 'next/navigation';
import Modal from '@/components/shared/Modal';
import styles from './CreateDocumentModal.module.scss';
import type { GroupInfo } from '@/lib/firebase/homeQueries';

interface CreateDocumentModalProps {
  groups: GroupInfo[];
  onClose: () => void;
  onGroupCreated: (group: GroupInfo) => void;
}

type Step = 'selectGroup' | 'createDocument';

export default function CreateDocumentModal({
  groups,
  onClose,
  onGroupCreated,
}: CreateDocumentModalProps) {
  const { t } = useTranslation();
  const router = useRouter();

  const [step, setStep] = useState<Step>('selectGroup');
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [selectedGroupName, setSelectedGroupName] = useState('');
  const [newGroupName, setNewGroupName] = useState('');
  const [docTitle, setDocTitle] = useState('');
  const [docDescription, setDocDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSelectGroup = useCallback((groupId: string, groupName: string) => {
    setSelectedGroupId(groupId);
    setSelectedGroupName(groupName);
    setStep('createDocument');
    setError(null);
  }, []);

  const handleCreateGroup = useCallback(async () => {
    if (!newGroupName.trim()) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch('/api/home/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'createGroup', title: newGroupName.trim() }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to create group');
      }

      const { statementId } = await response.json();

      const newGroup: GroupInfo = {
        statementId,
        statement: newGroupName.trim(),
        createdAt: Date.now(),
      };

      onGroupCreated(newGroup);
      setSelectedGroupId(statementId);
      setSelectedGroupName(newGroupName.trim());
      setNewGroupName('');
      setStep('createDocument');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create group');
    } finally {
      setIsSubmitting(false);
    }
  }, [newGroupName, onGroupCreated]);

  const handleCreateDocument = useCallback(async () => {
    if (!docTitle.trim() || !selectedGroupId) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch('/api/home/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'createDocument',
          title: docTitle.trim(),
          groupId: selectedGroupId,
          description: docDescription.trim() || undefined,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to create document');
      }

      const { statementId } = await response.json();
      router.push(`/doc/${statementId}/admin/editor`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create document');
    } finally {
      setIsSubmitting(false);
    }
  }, [docTitle, docDescription, selectedGroupId, router]);

  const modalTitle = step === 'selectGroup'
    ? t('Select a group')
    : t('Create Document');

  return (
    <Modal title={modalTitle} onClose={onClose} size="medium">
      {/* Step indicator */}
      <div className={styles.stepIndicator}>
        <span className={`${styles.stepDot} ${step === 'selectGroup' ? styles.active : ''}`} />
        <span className={`${styles.stepDot} ${step === 'createDocument' ? styles.active : ''}`} />
        <span className={styles.stepLabel}>
          {step === 'selectGroup' ? t('Step 1 of 2') : t('Step 2 of 2')}
        </span>
      </div>

      {step === 'selectGroup' && (
        <>
          {groups.length > 0 && (
            <div className={styles.groupList}>
              {groups.map((group) => (
                <button
                  key={group.statementId}
                  className={styles.groupItem}
                  onClick={() => handleSelectGroup(group.statementId, group.statement)}
                  type="button"
                >
                  {group.statement}
                </button>
              ))}
            </div>
          )}

          <div className={styles.newGroupRow}>
            <input
              className={styles.input}
              type="text"
              placeholder={t('New group name')}
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleCreateGroup();
                }
              }}
              disabled={isSubmitting}
            />
            <button
              className={styles.addButton}
              onClick={handleCreateGroup}
              disabled={!newGroupName.trim() || isSubmitting}
              type="button"
            >
              {isSubmitting ? t('Creating...') : t('Create Group')}
            </button>
          </div>
        </>
      )}

      {step === 'createDocument' && (
        <>
          <div className={styles.selectedGroupChip}>
            {selectedGroupName}
          </div>

          <div className={styles.formGroup}>
            <label className={styles.label} htmlFor="doc-title">
              {t('Document title')}
            </label>
            <input
              id="doc-title"
              className={styles.input}
              type="text"
              placeholder={t('Enter document title')}
              value={docTitle}
              onChange={(e) => setDocTitle(e.target.value)}
              disabled={isSubmitting}
              autoFocus
            />
          </div>

          <div className={styles.formGroup}>
            <label className={styles.label} htmlFor="doc-description">
              {t('Description')} ({t('optional')})
            </label>
            <textarea
              id="doc-description"
              className={styles.textarea}
              placeholder={t('Enter document description')}
              value={docDescription}
              onChange={(e) => setDocDescription(e.target.value)}
              disabled={isSubmitting}
            />
          </div>

          <div className={styles.actions}>
            <button
              className={styles.cancelButton}
              onClick={() => {
                setStep('selectGroup');
                setError(null);
              }}
              disabled={isSubmitting}
              type="button"
            >
              {t('Back')}
            </button>
            <button
              className={styles.submitButton}
              onClick={handleCreateDocument}
              disabled={!docTitle.trim() || isSubmitting}
              type="button"
            >
              {isSubmitting ? t('Creating...') : t('Create')}
            </button>
          </div>
        </>
      )}

      {error && <p className={styles.error}>{error}</p>}
    </Modal>
  );
}
