import { doc, setDoc, increment } from 'firebase/firestore';
import { DB } from '../../config';
import { MassConsensusStage } from '@/services/analytics/analytics';

interface MassConsensusAnalyticsData {
  statementId: string;
  userId: string;
  sessionId: string;
  startTime: number;
  endTime?: number;
  completedStages: MassConsensusStage[];
  skippedStages: MassConsensusStage[];
  timePerStage: Record<MassConsensusStage, number>;
  totalTimeSpent?: number;
  isCompleted: boolean;
  lastStage: MassConsensusStage;
  submissions: {
    answers: number;
    votes: number;
    feedback: boolean;
  };
  createdAt: number;
  updatedAt: number;
}

/**
 * Save individual user session analytics
 */
export async function saveMassConsensusSession(
  data: Partial<MassConsensusAnalyticsData>
): Promise<void> {
  try {
    if (!data.sessionId || !data.statementId || !data.userId) {
      throw new Error('Missing required fields for analytics session');
    }

    const sessionRef = doc(
      DB,
      'massConsensusAnalytics',
      `${data.statementId}_${data.sessionId}`
    );

    await setDoc(
      sessionRef,
      {
        ...data,
        updatedAt: Date.now(),
        createdAt: data.createdAt || Date.now(),
      },
      { merge: true }
    );
  } catch (error) {
    console.error('Error saving mass consensus analytics session:', error);
  }
}

/**
 * Update aggregate analytics for a statement
 */
export async function updateMassConsensusAggregates(
  statementId: string,
  updates: {
    isNewEntry?: boolean;
    isCompletion?: boolean;
    stageCompleted?: MassConsensusStage;
    stageSkipped?: MassConsensusStage;
    timeSpent?: number;
    stageTime?: { stage: MassConsensusStage; time: number };
  }
): Promise<void> {
  try {
    const aggregateRef = doc(
      DB,
      'massConsensusAggregates',
      statementId
    );

    const updateData: Record<string, unknown> = {
      statementId,
      lastUpdated: Date.now(),
    };

    if (updates.isNewEntry) {
      updateData.totalEntries = increment(1);
    }

    if (updates.isCompletion) {
      updateData.totalCompletions = increment(1);
    }

    if (updates.stageCompleted) {
      updateData[`stageCompletions.${updates.stageCompleted}`] = increment(1);
    }

    if (updates.stageSkipped) {
      updateData[`stageSkips.${updates.stageSkipped}`] = increment(1);
    }

    if (updates.timeSpent) {
      updateData.totalTimeSpent = increment(updates.timeSpent);
    }

    if (updates.stageTime) {
      updateData[`stageTimes.${updates.stageTime.stage}`] = increment(
        updates.stageTime.time
      );
      updateData[`stageTimeCounts.${updates.stageTime.stage}`] = increment(1);
    }

    await setDoc(aggregateRef, updateData, { merge: true });
  } catch (error) {
    console.error('Error updating mass consensus aggregates:', error);
  }
}

/**
 * Track user progression through stages
 */
export async function trackMassConsensusProgression(
  statementId: string,
  userId: string,
  sessionId: string,
  stage: MassConsensusStage,
  action: 'completed' | 'skipped',
  timeSpent?: number
): Promise<void> {
  try {
    // Update individual session
    const sessionData: Partial<MassConsensusAnalyticsData> = {
      statementId,
      userId,
      sessionId,
      lastStage: stage,
    };

    if (action === 'completed') {
      sessionData.completedStages = [stage]; // Will be merged with existing
    } else {
      sessionData.skippedStages = [stage]; // Will be merged with existing
    }

    if (timeSpent) {
      sessionData.timePerStage = { [stage]: timeSpent } as Record<
        MassConsensusStage,
        number
      >;
    }

    await saveMassConsensusSession(sessionData);

    // Update aggregates
    const aggregateUpdates: {
      stageCompleted?: MassConsensusStage;
      stageSkipped?: MassConsensusStage;
      stageTime?: { stage: MassConsensusStage; time: number };
    } = {};
    if (action === 'completed') {
      aggregateUpdates.stageCompleted = stage;
    } else {
      aggregateUpdates.stageSkipped = stage;
    }

    if (timeSpent) {
      aggregateUpdates.stageTime = { stage, time: timeSpent };
    }

    await updateMassConsensusAggregates(statementId, aggregateUpdates);
  } catch (error) {
    console.error('Error tracking mass consensus progression:', error);
  }
}

/**
 * Mark session as completed
 */
export async function completeMassConsensusSession(
  statementId: string,
  userId: string,
  sessionId: string,
  totalTime: number
): Promise<void> {
  try {
    await saveMassConsensusSession({
      statementId,
      userId,
      sessionId,
      endTime: Date.now(),
      totalTimeSpent: totalTime,
      isCompleted: true,
    });

    await updateMassConsensusAggregates(statementId, {
      isCompletion: true,
      timeSpent: totalTime,
    });
  } catch (error) {
    console.error('Error completing mass consensus session:', error);
  }
}