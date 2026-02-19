import { SurveyLogo } from '@freedi/shared-types';
import { Survey } from '@/types/survey';
import { getSurveyById, updateSurvey } from './surveyCrud';

/**
 * Update survey opening slide content and visibility
 */
export async function updateSurveyOpeningSlide(
  surveyId: string,
  content: string,
  show: boolean
): Promise<Survey | null> {
  return updateSurvey(surveyId, {
    openingSlideContent: content,
    showOpeningSlide: show,
  });
}

/**
 * Add a logo to survey
 */
export async function addLogoToSurvey(
  surveyId: string,
  logo: SurveyLogo
): Promise<Survey | null> {
  const survey = await getSurveyById(surveyId);
  if (!survey) {
    return null;
  }

  const currentLogos = survey.logos || [];
  const updatedLogos = [...currentLogos, logo];

  return updateSurvey(surveyId, { logos: updatedLogos });
}

/**
 * Remove a logo from survey
 */
export async function removeLogoFromSurvey(
  surveyId: string,
  logoId: string
): Promise<Survey | null> {
  const survey = await getSurveyById(surveyId);
  if (!survey) {
    return null;
  }

  const currentLogos = survey.logos || [];
  const updatedLogos = currentLogos.filter((logo) => logo.logoId !== logoId);

  return updateSurvey(surveyId, { logos: updatedLogos });
}

/**
 * Update logo metadata (alt text, order, dimensions)
 */
export async function updateLogoInSurvey(
  surveyId: string,
  logoId: string,
  updates: {
    altText?: string;
    order?: number;
    width?: number;
    height?: number;
  }
): Promise<Survey | null> {
  const survey = await getSurveyById(surveyId);
  if (!survey) {
    return null;
  }

  const currentLogos = survey.logos || [];
  const updatedLogos = currentLogos.map((logo) => {
    if (logo.logoId === logoId) {
      return {
        ...logo,
        ...(updates.altText !== undefined && { altText: updates.altText }),
        ...(updates.order !== undefined && { order: updates.order }),
        ...(updates.width !== undefined && { width: updates.width }),
        ...(updates.height !== undefined && { height: updates.height }),
      };
    }

    return logo;
  });

  return updateSurvey(surveyId, { logos: updatedLogos });
}

/**
 * Reorder logos in survey
 */
export async function reorderSurveyLogos(
  surveyId: string,
  logoOrder: string[]
): Promise<Survey | null> {
  const survey = await getSurveyById(surveyId);
  if (!survey) {
    return null;
  }

  const currentLogos = survey.logos || [];
  const updatedLogos = currentLogos.map((logo) => {
    const newOrder = logoOrder.indexOf(logo.logoId);

    return {
      ...logo,
      order: newOrder >= 0 ? newOrder : logo.order,
    };
  });

  // Sort by new order
  updatedLogos.sort((a, b) => a.order - b.order);

  return updateSurvey(surveyId, { logos: updatedLogos });
}
