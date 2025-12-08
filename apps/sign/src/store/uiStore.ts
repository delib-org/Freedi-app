/**
 * Zustand UI state store for Sign app
 * Minimal client-side state for UI interactions only
 */

import { create } from 'zustand';

export type ModalType = 'comments' | 'signature' | 'settings' | null;
export type ViewMode = 'default' | 'views' | 'support' | 'importance';
export type SigningAnimationState = 'idle' | 'signing' | 'success' | 'error';

interface ModalContext {
  paragraphId?: string;
  documentId?: string;
}

interface UIState {
  // Modal state
  activeModal: ModalType;
  modalContext: ModalContext | null;
  openModal: (modal: ModalType, context?: ModalContext) => void;
  closeModal: () => void;

  // Edit mode (admin only)
  isEditMode: boolean;
  setEditMode: (value: boolean) => void;

  // View mode for heat maps (admin only)
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;

  // Table of contents
  isTocExpanded: boolean;
  toggleToc: () => void;
  setTocExpanded: (value: boolean) => void;

  // Active paragraph (for TOC scrolling)
  activeParagraphId: string | null;
  setActiveParagraphId: (id: string | null) => void;

  // Loading states
  isSubmitting: boolean;
  setSubmitting: (value: boolean) => void;

  // Signing animation state
  signingAnimationState: SigningAnimationState;
  setSigningAnimationState: (state: SigningAnimationState) => void;
  resetSigningAnimation: () => void;

  // Paragraph approvals (for real-time progress tracking)
  approvals: Record<string, boolean>;
  totalParagraphs: number;
  initializeApprovals: (approvals: Record<string, boolean>, total: number) => void;
  setApproval: (paragraphId: string, approved: boolean) => void;
}

export const useUIStore = create<UIState>((set) => ({
  // Modal state
  activeModal: null,
  modalContext: null,
  openModal: (modal, context) =>
    set({ activeModal: modal, modalContext: context ?? null }),
  closeModal: () => set({ activeModal: null, modalContext: null }),

  // Edit mode
  isEditMode: false,
  setEditMode: (value) => set({ isEditMode: value }),

  // View mode
  viewMode: 'default',
  setViewMode: (mode) => set({ viewMode: mode }),

  // Table of contents
  isTocExpanded: false,
  toggleToc: () => set((state) => ({ isTocExpanded: !state.isTocExpanded })),
  setTocExpanded: (value) => set({ isTocExpanded: value }),

  // Active paragraph
  activeParagraphId: null,
  setActiveParagraphId: (id) => set({ activeParagraphId: id }),

  // Loading states
  isSubmitting: false,
  setSubmitting: (value) => set({ isSubmitting: value }),

  // Signing animation state
  signingAnimationState: 'idle',
  setSigningAnimationState: (state) => set({ signingAnimationState: state }),
  resetSigningAnimation: () => set({ signingAnimationState: 'idle' }),

  // Paragraph approvals
  approvals: {},
  totalParagraphs: 0,
  initializeApprovals: (approvals, total) => set({ approvals, totalParagraphs: total }),
  setApproval: (paragraphId, approved) =>
    set((state) => ({
      approvals: { ...state.approvals, [paragraphId]: approved },
    })),
}));

// Selectors for common patterns
export const selectIsModalOpen = (modal: ModalType) => (state: UIState) =>
  state.activeModal === modal;

export const selectModalContext = (state: UIState) => state.modalContext;

export const selectIsEditMode = (state: UIState) => state.isEditMode;

export const selectViewMode = (state: UIState) => state.viewMode;

export const selectIsTocExpanded = (state: UIState) => state.isTocExpanded;

export const selectSigningAnimationState = (state: UIState) =>
  state.signingAnimationState;
