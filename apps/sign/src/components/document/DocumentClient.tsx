'use client';

import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { useTranslation } from '@freedi/shared-i18n/next';
import { useUIStore } from '@/store/uiStore';
import { useDemographicStore, selectIsInteractionBlocked, selectIsViewBlocked } from '@/store/demographicStore';
import { SignUser, getOrCreateAnonymousUser } from '@/lib/utils/user';
import { Signature } from '@/lib/firebase/queries';
import { trackDocumentSign, trackDocumentReject, trackDocumentView } from '@/lib/analytics';
import { Paragraph } from '@/types';
import Modal from '../shared/Modal';
import MinimizedModalIndicator from '../shared/MinimizedModalIndicator';
import CommentThread from '../comments/CommentThread';
import SuggestionThread from '../suggestions/SuggestionThread';
import LoginModal from '../shared/LoginModal';
import RejectionFeedbackModal from './RejectionFeedbackModal';
import { DemographicSurveyModal } from '../demographics';
import { HeatMapProvider, HeatMapToolbar, HeatMapLegend, DemographicFilter } from '../heatMap';

// Animation timing constants
const ANIMATION_DURATION = {
  SIGNING: 600, // Time to show signing spinner
  SUCCESS: 1200, // Time to show success state before reload
  CONFETTI: 800, // Confetti animation duration
  REJECTING: 500, // Time to show rejecting spinner
  REJECTED: 1000, // Time to show rejected state before reload
} as const;

interface DocumentClientProps {
  documentId: string;
  user: SignUser | null;
  userSignature: Signature | null;
  commentCounts: Record<string, number>;
  suggestionCounts?: Record<string, number>;
  userInteractions?: string[];
  isAdmin?: boolean;
  enableSuggestions?: boolean;
  paragraphs?: Paragraph[];
  textDirection?: 'ltr' | 'rtl';
  children: React.ReactNode;
}

export default function DocumentClient({
  documentId,
  user,
  userSignature,
  commentCounts,
  suggestionCounts = {},
  userInteractions = [],
  isAdmin,
  enableSuggestions = false,
  paragraphs = [],
  textDirection = 'ltr',
  children,
}: DocumentClientProps) {
  const { t } = useTranslation();
  const {
    activeModal,
    modalContext,
    closeModal,
    openModal,
    setSubmitting,
    setSigningAnimationState,
    resetSigningAnimation,
    initializeCommentCounts,
    initializeSuggestionCounts,
    initializeUserInteractions,
    isModalMinimized,
    minimizeModal,
    restoreModal,
  } = useUIStore();

  // State for rejection feedback modal
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);

  // Demographics store
  const {
    fetchStatus,
    isSurveyModalOpen,
    openSurveyModal,
  } = useDemographicStore();
  const isInteractionBlocked = useDemographicStore(selectIsInteractionBlocked);
  const isViewBlocked = useDemographicStore(selectIsViewBlocked);

  const confettiTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Helper to create confetti particles
  const triggerConfetti = useCallback(() => {
    // Create confetti container
    const container = document.createElement('div');
    container.className = 'confetti-container';
    container.setAttribute('aria-hidden', 'true');
    container.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 1000;
      overflow: hidden;
    `;

    // Confetti colors matching design system
    const colors = [
      'var(--agree)',
      'var(--agree-light)',
      '#FFD700',
      '#FF6B6B',
      '#4ECDC4',
      '#45B7D1',
      '#96CEB4',
      '#FFEAA7',
    ];

    // Create 30 confetti particles
    for (let i = 0; i < 30; i++) {
      const particle = document.createElement('div');
      const color = colors[i % colors.length];
      const startX = 40 + Math.random() * 20; // Center around footer area
      const size = 6 + Math.random() * 8;
      const delay = i * 30;
      const duration = 800 + Math.random() * 400;
      const rotation = Math.random() * 720;
      const horizontalDrift = (Math.random() - 0.5) * 100;

      particle.style.cssText = `
        position: absolute;
        left: ${startX}%;
        bottom: 80px;
        width: ${size}px;
        height: ${size}px;
        background: ${color};
        border-radius: ${Math.random() > 0.5 ? '50%' : '2px'};
        opacity: 0;
        animation: confetti-rise ${duration}ms ease-out ${delay}ms forwards;
      `;

      // Add keyframes if not already added
      if (!document.getElementById('confetti-keyframes')) {
        const style = document.createElement('style');
        style.id = 'confetti-keyframes';
        style.textContent = `
          @keyframes confetti-rise {
            0% {
              opacity: 1;
              transform: translateY(0) translateX(0) rotate(0deg) scale(1);
            }
            100% {
              opacity: 0;
              transform: translateY(-300px) translateX(var(--drift, 0px)) rotate(${rotation}deg) scale(0.5);
            }
          }
        `;
        document.head.appendChild(style);
      }

      particle.style.setProperty('--drift', `${horizontalDrift}px`);
      container.appendChild(particle);
    }

    document.body.appendChild(container);

    // Clean up after animation
    confettiTimeoutRef.current = setTimeout(() => {
      container.remove();
    }, ANIMATION_DURATION.CONFETTI + 500);
  }, []);

  // Handle sign/reject button clicks with animation
  const handleSignatureAction = useCallback(
    async (action: 'sign' | 'reject') => {
      // Check if blocked by demographic survey
      if (isInteractionBlocked) {
        openSurveyModal();

        return;
      }

      // Ensure user has an ID (create anonymous user if needed)
      if (!user) {
        getOrCreateAnonymousUser();
      }

      setSubmitting(true);

      // Animate both signing and rejecting with appropriate states
      if (action === 'sign') {
        setSigningAnimationState('signing');
      } else {
        setSigningAnimationState('rejecting');
      }

      try {
        // Add slight delay for animation
        if (action === 'sign') {
          await new Promise((resolve) =>
            setTimeout(resolve, ANIMATION_DURATION.SIGNING)
          );
        } else {
          await new Promise((resolve) =>
            setTimeout(resolve, ANIMATION_DURATION.REJECTING)
          );
        }

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
          if (action === 'sign') {
            // Track sign event
            trackDocumentSign(documentId, user?.uid);
            // Show success animation with confetti
            setSigningAnimationState('success');
            triggerConfetti();

            // Wait for success animation before reload
            await new Promise((resolve) =>
              setTimeout(resolve, ANIMATION_DURATION.SUCCESS)
            );
          } else {
            // Track reject event
            trackDocumentReject(documentId, user?.uid);
            // Show rejected confirmation animation
            setSigningAnimationState('rejected');

            // Wait for rejected animation before showing feedback modal
            await new Promise((resolve) =>
              setTimeout(resolve, ANIMATION_DURATION.REJECTED)
            );

            // Show feedback modal instead of immediate reload
            setShowFeedbackModal(true);

            return; // Don't reload - the modal will handle it
          }

          // Refresh the page to show updated state (only for sign action)
          window.location.reload();
        } else {
          const error = await response.json();
          console.error('Failed to submit signature:', error);
          setSigningAnimationState('error');
          alert('Failed to submit. Please try again.');
          resetSigningAnimation();
        }
      } catch (error) {
        console.error('Error submitting signature:', error);
        setSigningAnimationState('error');
        alert('Failed to submit. Please try again.');
        resetSigningAnimation();
      } finally {
        setSubmitting(false);
      }
    },
    [
      documentId,
      user,
      setSubmitting,
      setSigningAnimationState,
      resetSigningAnimation,
      triggerConfetti,
      isInteractionBlocked,
      openSurveyModal,
    ]
  );

  // Initialize comment counts from server data
  useEffect(() => {
    initializeCommentCounts(commentCounts);
  }, [commentCounts, initializeCommentCounts]);

  // Initialize suggestion counts from server data
  useEffect(() => {
    if (enableSuggestions && Object.keys(suggestionCounts).length > 0) {
      initializeSuggestionCounts(suggestionCounts);
    }
  }, [suggestionCounts, enableSuggestions, initializeSuggestionCounts]);

  // Get current paragraph content for suggestions modal
  const currentParagraph = useMemo(() => {
    if (!modalContext?.paragraphId) return null;

    return paragraphs.find((p) => p.paragraphId === modalContext.paragraphId) || null;
  }, [modalContext?.paragraphId, paragraphs]);

  // Handler to open suggestions modal from comments
  const handleOpenSuggestions = useCallback(() => {
    if (modalContext?.paragraphId) {
      openModal('suggestions', { paragraphId: modalContext.paragraphId });
    }
  }, [modalContext?.paragraphId, openModal]);

  // Initialize user interactions from server data
  useEffect(() => {
    initializeUserInteractions(userInteractions);
  }, [userInteractions, initializeUserInteractions]);

  // Ensure user has ID and fetch demographic status on mount
  useEffect(() => {
    if (documentId) {
      // Create anonymous user if none exists (sets cookie for API calls)
      if (!user) {
        getOrCreateAnonymousUser();
      }
      // Fetch demographic status (cookie is already set synchronously)
      fetchStatus(documentId);
    }
  }, [documentId, user, fetchStatus]);

  // Auto-open survey modal only if viewing is blocked (before_viewing mode)
  // For on_interaction mode, modal opens when user attempts to interact
  useEffect(() => {
    if (isViewBlocked && !isSurveyModalOpen) {
      openSurveyModal();
    }
  }, [isViewBlocked, isSurveyModalOpen, openSurveyModal]);

  // Cleanup confetti timeout on unmount
  useEffect(() => {
    return () => {
      if (confettiTimeoutRef.current) {
        clearTimeout(confettiTimeoutRef.current);
      }
    };
  }, []);

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
      // Track view in GA
      trackDocumentView(documentId, user.uid);
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
    <HeatMapProvider documentId={documentId}>
      {children}

      {/* Heat Map Controls - visible to admins only */}
      {isAdmin && (
        <>
          <HeatMapToolbar />
          <HeatMapLegend />
          <DemographicFilter documentId={documentId} />
        </>
      )}

      {/* Comments Modal */}
      {activeModal === 'comments' && modalContext?.paragraphId && !isModalMinimized && (
        <Modal
          title={t('Comments')}
          onClose={closeModal}
          size="large"
          canMinimize={true}
          onMinimize={minimizeModal}
          direction={textDirection}
        >
          <CommentThread
            paragraphId={modalContext.paragraphId}
            documentId={documentId}
            isLoggedIn={!!user}
            userId={user?.uid || null}
            enableSuggestions={enableSuggestions}
            originalContent={currentParagraph?.content || ''}
            onOpenSuggestions={handleOpenSuggestions}
          />
        </Modal>
      )}

      {/* Suggestions Modal */}
      {activeModal === 'suggestions' && modalContext?.paragraphId && !isModalMinimized && (
        <Modal
          title={t('Suggestions')}
          onClose={closeModal}
          size="large"
          canMinimize={true}
          onMinimize={minimizeModal}
          direction={textDirection}
        >
          <SuggestionThread
            paragraphId={modalContext.paragraphId}
            documentId={documentId}
            originalContent={currentParagraph?.content || ''}
            userId={user?.uid || null}
            onClose={closeModal}
          />
        </Modal>
      )}

      {/* Minimized Comments Indicator */}
      {activeModal === 'comments' && isModalMinimized && (
        <MinimizedModalIndicator onClick={restoreModal} />
      )}

      {/* Minimized Suggestions Indicator */}
      {activeModal === 'suggestions' && isModalMinimized && (
        <MinimizedModalIndicator onClick={restoreModal} />
      )}

      {/* Signature Confirmation Modal */}
      {activeModal === 'signature' && (
        <Modal title="Confirm Signature" onClose={closeModal}>
          <p>Are you sure you want to sign this document?</p>
          {/* TODO: Add confirmation buttons */}
        </Modal>
      )}

      {/* Login Modal */}
      {activeModal === 'login' && (
        <Modal title="Sign In" onClose={closeModal}>
          <LoginModal onClose={closeModal} />
        </Modal>
      )}

      {/* Demographic Survey Modal */}
      <DemographicSurveyModal documentId={documentId} isAdmin={isAdmin} />

      {/* Rejection Feedback Modal */}
      {showFeedbackModal && (
        <RejectionFeedbackModal
          documentId={documentId}
          onClose={() => setShowFeedbackModal(false)}
        />
      )}
    </HeatMapProvider>
  );
}
