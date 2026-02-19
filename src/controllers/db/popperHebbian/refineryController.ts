import { setDoc, getDoc, updateDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../config';
import { Collections } from '@freedi/shared-types';
import { createDocRef } from '@/utils/firebaseUtils';
import {
	RefinementSession,
	IdeaRefinementStatus,
	RefinementMessage,
	FalsifiabilityAnalysis,
} from '@/models/popperHebbian';
import { logger } from '@/services/logger';

interface AnalyzeFalsifiabilityRequest {
	ideaText: string;
	context?: string;
	language?: string;
}

interface AnalyzeFalsifiabilityResponse {
	analysis: FalsifiabilityAnalysis;
	initialMessage: string;
}

interface RefineIdeaRequest {
	sessionId: string;
	userResponse: string;
	conversationHistory: RefinementMessage[];
	originalIdea: string;
	currentRefinedIdea?: string;
	language?: string;
}

interface RefineIdeaResponse {
	aiMessage: string;
	refinedIdea?: string;
	isComplete: boolean;
	testabilityCriteria?: string[];
}

function generateId(): string {
	return `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

export async function startRefinementSession(
	parentStatementId: string,
	originalIdea: string,
	userId: string,
	language?: string,
): Promise<RefinementSession> {
	try {
		// Call Firebase Function to analyze falsifiability
		const analyzeFalsifiability = httpsCallable<
			AnalyzeFalsifiabilityRequest,
			AnalyzeFalsifiabilityResponse
		>(functions, 'analyzeFalsifiability');

		const result = await analyzeFalsifiability({
			ideaText: originalIdea,
			context: undefined,
			language: language || 'en',
		});

		const { analysis, initialMessage } = result.data;

		// Create refinement session
		const sessionId = generateId();
		const session: RefinementSession = {
			sessionId,
			statementId: parentStatementId,
			userId,
			originalIdea,
			refinedIdea: '',
			status: analysis.isTestable
				? IdeaRefinementStatus.readyForDiscussion
				: IdeaRefinementStatus.inRefinement,
			conversationHistory: [
				{
					messageId: generateId(),
					role: 'ai-guide',
					content: initialMessage,
					timestamp: Date.now(),
					messageType: 'question',
				},
			],
			vagueTerms: analysis.vagueTerms,
			testabilityCriteria: [],
			createdAt: Date.now(),
			lastUpdate: Date.now(),
		};

		// Save to Firestore
		await setDoc(createDocRef(Collections.refinementSessions, sessionId), session);

		logger.info('Refinement session started', { sessionId, userId });

		return session;
	} catch (error) {
		logger.error('Failed to start refinement session', error, {
			parentStatementId,
			userId,
		});
		throw error;
	}
}

export async function submitRefinementResponse(
	sessionId: string,
	userResponse: string,
	language?: string,
): Promise<RefinementSession> {
	try {
		// Get current session
		const sessionRef = createDocRef(Collections.refinementSessions, sessionId);
		const sessionSnap = await getDoc(sessionRef);

		if (!sessionSnap.exists()) {
			throw new Error('Session not found');
		}

		const session = sessionSnap.data() as RefinementSession;

		// Add user message to history
		const userMessage: RefinementMessage = {
			messageId: generateId(),
			role: 'user',
			content: userResponse,
			timestamp: Date.now(),
			messageType: 'answer',
		};

		const updatedHistory = [...session.conversationHistory, userMessage];

		// Call Firebase Function to continue dialogue
		const refineIdea = httpsCallable<RefineIdeaRequest, RefineIdeaResponse>(
			functions,
			'refineIdea',
		);

		const result = await refineIdea({
			sessionId,
			userResponse,
			conversationHistory: updatedHistory,
			originalIdea: session.originalIdea,
			currentRefinedIdea: session.refinedIdea,
			language: language || 'en',
		});

		const { aiMessage, refinedIdea, isComplete, testabilityCriteria } = result.data;

		// Add AI message to history
		const aiMessageObj: RefinementMessage = {
			messageId: generateId(),
			role: 'ai-guide',
			content: aiMessage,
			timestamp: Date.now(),
			messageType: isComplete ? 'suggestion' : 'question',
		};

		const finalHistory = [...updatedHistory, aiMessageObj];

		// Update session
		const updatedSession: RefinementSession = {
			...session,
			conversationHistory: finalHistory,
			refinedIdea: refinedIdea || session.refinedIdea,
			status: isComplete
				? IdeaRefinementStatus.readyForDiscussion
				: IdeaRefinementStatus.inRefinement,
			testabilityCriteria: testabilityCriteria || session.testabilityCriteria,
			lastUpdate: Date.now(),
		};

		// Only add completedAt if the session is complete
		if (isComplete) {
			updatedSession.completedAt = Date.now();
		}

		// Remove undefined values before updating Firestore
		const cleanedUpdate = Object.entries(updatedSession).reduce(
			(acc, [key, value]) => {
				if (value !== undefined) {
					acc[key] = value;
				}

				return acc;
			},
			{} as Record<string, unknown>,
		);

		await updateDoc(sessionRef, cleanedUpdate);

		logger.info('Refinement response submitted', { sessionId });

		return updatedSession;
	} catch (error) {
		logger.error('Failed to submit refinement response', error, { sessionId });
		throw error;
	}
}

export async function publishRefinedIdea(sessionId: string): Promise<RefinementSession> {
	try {
		const sessionRef = createDocRef(Collections.refinementSessions, sessionId);
		const sessionSnap = await getDoc(sessionRef);

		if (!sessionSnap.exists()) {
			throw new Error('Session not found');
		}

		const session = sessionSnap.data() as RefinementSession;

		if (session.status !== IdeaRefinementStatus.readyForDiscussion) {
			throw new Error('Session not ready for publication');
		}

		// Mark session as published
		await updateDoc(sessionRef, {
			status: 'published',
			lastUpdate: Date.now(),
		});

		logger.info('Refined idea published', { sessionId });

		return session;
	} catch (error) {
		logger.error('Failed to publish refined idea', error, { sessionId });
		throw error;
	}
}
