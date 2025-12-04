'use client';

import { useCallback, useEffect } from 'react';
import { useUIStore } from '@/store/uiStore';
import { SignUser } from '@/lib/utils/user';
import { Signature } from '@/lib/firebase/queries';
import Modal from '../shared/Modal';
import CommentThread from '../comments/CommentThread';

interface DocumentClientProps {
  documentId: string;
  user: SignUser | null;
  userSignature: Signature | null;
  children: React.ReactNode;
}

export default function DocumentClient({
  documentId,
  user,
  userSignature,
  children,
}: DocumentClientProps) {
  const { activeModal, modalContext, closeModal, setSubmitting } = useUIStore();

  // Handle sign/reject button clicks
  const handleSignatureAction = useCallback(
    async (action: 'sign' | 'reject') => {
      if (!user) {
        // Redirect to login
        window.location.href = `/login?redirect=/doc/${documentId}`;

        return;
      }

      setSubmitting(true);

      try {
        const response = await fetch(`/api/signatures/${documentId}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            signed: action === 'sign' ? 'signed' : 'rejected',
          }),
        });

        if (response.ok) {
          // Refresh the page to show updated state
          window.location.reload();
        } else {
          const error = await response.json();
          console.error('Failed to submit signature:', error);
          alert('Failed to submit. Please try again.');
        }
      } catch (error) {
        console.error('Error submitting signature:', error);
        alert('Failed to submit. Please try again.');
      } finally {
        setSubmitting(false);
      }
    },
    [documentId, user, setSubmitting]
  );

  // Set up event listeners for signature buttons
  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      const action = target.closest('[data-action]')?.getAttribute('data-action');

      if (action === 'sign' || action === 'reject') {
        handleSignatureAction(action);
      }
    };

    document.addEventListener('click', handleClick);

    return () => {
      document.removeEventListener('click', handleClick);
    };
  }, [handleSignatureAction]);

  // Track document view
  useEffect(() => {
    if (user && !userSignature) {
      // Mark as viewed if not already signed/rejected
      fetch(`/api/signatures/${documentId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          signed: 'viewed',
        }),
      }).catch(console.error);
    }
  }, [documentId, user, userSignature]);

  return (
    <>
      {children}

      {/* Comments Modal */}
      {activeModal === 'comments' && modalContext?.paragraphId && (
        <Modal title="Comments" onClose={closeModal} size="large">
          <CommentThread
            paragraphId={modalContext.paragraphId}
            documentId={documentId}
            isLoggedIn={!!user}
          />
        </Modal>
      )}

      {/* Signature Confirmation Modal */}
      {activeModal === 'signature' && (
        <Modal title="Confirm Signature" onClose={closeModal}>
          <p>Are you sure you want to sign this document?</p>
          {/* TODO: Add confirmation buttons */}
        </Modal>
      )}
    </>
  );
}
