import { doc, getDoc, collection, query, where, getDocs, orderBy, limit } from 'firebase/firestore';
import { DB } from '../../config';
import { MassConsensusStage } from '@/services/analytics/analytics';

interface MassConsensusAnalyticsSummary {
  statementId: string;
  totalEntries: number;
  totalCompletions: number;
  completionRate: number;
  averageTimeToComplete: number;
  stageMetrics: {
    [key in MassConsensusStage]?: {
      completions: number;
      skips: number;
      averageTime: number;
      dropOffRate: number;
    };
  };
  funnelData: {
    stage: MassConsensusStage;
    count: number;
    percentage: number;
  }[];
}

/**
 * Get analytics summary for a specific mass consensus question
 */
export async function getMassConsensusAnalytics(
  statementId: string
): Promise<MassConsensusAnalyticsSummary | null> {
  try {
    // Get aggregate data
    const aggregateRef = doc(DB, 'massConsensusAggregates', statementId);
    const aggregateDoc = await getDoc(aggregateRef);
    
    if (!aggregateDoc.exists()) {
      return null;
    }

    const data = aggregateDoc.data();
    
    const totalEntries = data.totalEntries || 0;
    const totalCompletions = data.totalCompletions || 0;
    const completionRate = totalEntries > 0 ? (totalCompletions / totalEntries) * 100 : 0;
    const averageTimeToComplete = totalCompletions > 0 
      ? (data.totalTimeSpent || 0) / totalCompletions 
      : 0;

    // Calculate stage metrics
    const stages: MassConsensusStage[] = [
      'introduction',
      'question',
      'similar_suggestions',
      'random_suggestions',
      'top_suggestions',
      'voting',
      'feedback'
    ];

    const stageMetrics: MassConsensusAnalyticsSummary['stageMetrics'] = {};
    
    for (const stage of stages) {
      const completions = data.stageCompletions?.[stage] || 0;
      const skips = data.stageSkips?.[stage] || 0;
      const totalTime = data.stageTimes?.[stage] || 0;
      const timeCount = data.stageTimeCounts?.[stage] || 0;
      const averageTime = timeCount > 0 ? totalTime / timeCount : 0;
      const total = completions + skips;
      const dropOffRate = total > 0 ? (skips / total) * 100 : 0;

      stageMetrics[stage] = {
        completions,
        skips,
        averageTime,
        dropOffRate
      };
    }

    // Calculate funnel data
    const funnelData = stages.map(stage => ({
      stage,
      count: stageMetrics[stage]?.completions || 0,
      percentage: totalEntries > 0 
        ? ((stageMetrics[stage]?.completions || 0) / totalEntries) * 100 
        : 0
    }));

    return {
      statementId,
      totalEntries,
      totalCompletions,
      completionRate,
      averageTimeToComplete,
      stageMetrics,
      funnelData
    };
  } catch (error) {
    console.error('Error getting mass consensus analytics:', error);
    
return null;
  }
}

/**
 * Get detailed session data for a specific user
 */
interface MassConsensusSessionData {
  id: string;
  statementId: string;
  userId: string;
  sessionId: string;
  [key: string]: unknown;
}

export async function getUserMassConsensusHistory(
  userId: string,
  statementId?: string
): Promise<MassConsensusSessionData[]> {
  try {
    const analyticsCollection = collection(DB, 'massConsensusAnalytics');
    
    let q;
    if (statementId) {
      q = query(
        analyticsCollection,
        where('userId', '==', userId),
        where('statementId', '==', statementId),
        orderBy('createdAt', 'desc'),
        limit(10)
      );
    } else {
      q = query(
        analyticsCollection,
        where('userId', '==', userId),
        orderBy('createdAt', 'desc'),
        limit(20)
      );
    }

    const querySnapshot = await getDocs(q);
    const sessions: MassConsensusSessionData[] = [];

    querySnapshot.forEach((doc) => {
      sessions.push({
        id: doc.id,
        ...(doc.data() as MassConsensusSessionData)
      });
    });

    return sessions;
  } catch (error) {
    console.error('Error getting user mass consensus history:', error);
    
return [];
  }
}

/**
 * Get conversion funnel data for visualization
 */
export async function getMassConsensusFunnelData(
  statementId: string
): Promise<{ stage: string; users: number; percentage: number }[]> {
  try {
    const analytics = await getMassConsensusAnalytics(statementId);
    
    if (!analytics) {
      return [];
    }

    return analytics.funnelData.map(item => ({
      stage: item.stage.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
      users: item.count,
      percentage: item.percentage
    }));
  } catch (error) {
    console.error('Error getting funnel data:', error);
    
return [];
  }
}

/**
 * Get recent sessions for monitoring
 */
export async function getRecentMassConsensusSessions(
  statementId: string,
  limitCount: number = 50
): Promise<MassConsensusSessionData[]> {
  try {
    const analyticsCollection = collection(DB, 'massConsensusAnalytics');
    
    const q = query(
      analyticsCollection,
      where('statementId', '==', statementId),
      orderBy('createdAt', 'desc'),
      limit(limitCount)
    );

    const querySnapshot = await getDocs(q);
    const sessions: MassConsensusSessionData[] = [];

    querySnapshot.forEach((doc) => {
      sessions.push({
        id: doc.id,
        ...(doc.data() as MassConsensusSessionData)
      });
    });

    return sessions;
  } catch (error) {
    console.error('Error getting recent sessions:', error);
    
return [];
  }
}