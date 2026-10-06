'use client';

import { useCallback, useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Statement } from '@freedi/shared-types';
import { SWIPE } from '@/constants/common';
import { cardImageUpdated } from '@/store/slices/swipeSlice';
import { selectCardStack } from '@/store/slices/swipeSelectors';
import { ImagesURL } from '@/controllers/cardImageController';
import { useCanEditCardImage } from './useCanEditCardImage';

export interface SwipeCardImages {
  /** Defined only for admins — pass straight to SwipeCard. */
  onImageEditClick?: () => void;
  isImageModalOpen: boolean;
  closeImageModal: () => void;
  onImageSaved: (imagesURL: ImagesURL) => void;
}

/**
 * Everything the swipe screen needs for card pictures: warming the browser
 * cache for the cards coming up (so a picture never pops in after its card
 * has already slid in), and the admin's edit sheet.
 */
export function useSwipeCardImages(currentCard: Statement | null, surveyId?: string): SwipeCardImages {
  const dispatch = useDispatch();
  const cardStack = useSelector(selectCardStack);
  const canEdit = useCanEditCardImage(currentCard, surveyId);
  const [isImageModalOpen, setIsImageModalOpen] = useState(false);

  const upcomingUrls = cardStack
    .slice(1, 1 + SWIPE.PRELOAD_AHEAD)
    .map((card) => card.imagesURL?.main)
    .filter((url): url is string => Boolean(url))
    .join('\n');

  useEffect(() => {
    if (!upcomingUrls) return;
    for (const url of upcomingUrls.split('\n')) {
      const image = new Image();
      image.decoding = 'async';
      image.src = url;
    }
  }, [upcomingUrls]);

  const currentCardId = currentCard?.statementId;

  // A swipe moves on to another card; the sheet belonged to the old one
  useEffect(() => {
    setIsImageModalOpen(false);
  }, [currentCardId]);

  const closeImageModal = useCallback(() => setIsImageModalOpen(false), []);

  const onImageSaved = useCallback(
    (imagesURL: ImagesURL) => {
      if (!currentCardId) return;
      dispatch(cardImageUpdated({ statementId: currentCardId, imagesURL }));
    },
    [dispatch, currentCardId]
  );

  return {
    onImageEditClick: canEdit ? () => setIsImageModalOpen(true) : undefined,
    isImageModalOpen,
    closeImageModal,
    onImageSaved,
  };
}
