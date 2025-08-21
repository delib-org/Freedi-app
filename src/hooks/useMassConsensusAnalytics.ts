import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useLocation } from 'react-router';
import { useAuthentication } from '@/controllers/hooks/useAuthentication';
import { analyticsService, MassConsensusStage } from '@/services/analytics/analytics';
import { v4 as uuidv4 } from 'uuid';

interface MassConsensusSession {
  sessionId: string;
  startTime: number;
  completedStages: MassConsensusStage[];
  currentStage: MassConsensusStage | null;
  stageStartTime: number | null;
}

const getStageFromPath = (pathname: string): MassConsensusStage | null => {
  if (pathname.includes('/introduction')) return 'introduction';
  if (pathname.includes('/question')) return 'question';
  if (pathname.includes('/random-suggestions')) return 'random_suggestions';
  if (pathname.includes('/top-suggestions')) return 'top_suggestions';
  if (pathname.includes('/voting')) return 'voting';
  if (pathname.includes('/leave-feedback')) return 'feedback';
  
  // Check for similar suggestions path pattern
  if (pathname.includes('/mass-consensus/') && pathname.includes('/similar')) {
    return 'similar_suggestions';
  }
  
  return null;
};

export const useMassConsensusAnalytics = () => {
  const { statementId } = useParams<{ statementId: string }>();
  const location = useLocation();
  const { user } = useAuthentication();
  const [session, setSession] = useState<MassConsensusSession | null>(null);
  const sessionRef = useRef<MassConsensusSession | null>(null);
  const previousStageRef = useRef<MassConsensusStage | null>(null);

  // Initialize session
  useEffect(() => {
    if (!statementId || !user?.uid) return;

    if (!session) {
      const newSession: MassConsensusSession = {
        sessionId: uuidv4(),
        startTime: Date.now(),
        completedStages: [],
        currentStage: null,
        stageStartTime: null,
      };
      setSession(newSession);
      sessionRef.current = newSession;

      // Track entry to mass consensus
      analyticsService.trackMassConsensusEntered({
        statementId,
        questionId: statementId, // In this case, statementId is the questionId
        userId: user.uid,
        sessionId: newSession.sessionId,
      });
    }
  }, [statementId, user, session]);

  // Track stage changes
  useEffect(() => {
    if (!session || !statementId || !user?.uid) return;

    const currentStage = getStageFromPath(location.pathname);
    
    if (currentStage && currentStage !== session.currentStage) {
      // Track time spent on previous stage
      if (session.currentStage && session.stageStartTime) {
        const timeSpent = Math.round((Date.now() - session.stageStartTime) / 1000); // in seconds
        
        analyticsService.trackMassConsensusTimeSpent({
          statementId,
          questionId: statementId,
          userId: user.uid,
          sessionId: session.sessionId,
          stage: session.currentStage,
          timeSpent,
        });
      }

      // Update session with new stage
      const updatedSession = {
        ...session,
        currentStage,
        stageStartTime: Date.now(),
      };
      
      setSession(updatedSession);
      sessionRef.current = updatedSession;
      previousStageRef.current = session.currentStage;
    }
  }, [location.pathname, session, statementId, user]);

  // Track stage completion
  const trackStageCompleted = useCallback((stage: MassConsensusStage) => {
    if (!session || !statementId || !user?.uid) return;

    const timeOnStage = session.stageStartTime 
      ? Math.round((Date.now() - session.stageStartTime) / 1000)
      : 0;

    analyticsService.trackMassConsensusStageCompleted({
      statementId,
      questionId: statementId,
      userId: user.uid,
      sessionId: session.sessionId,
      stage,
      previousStage: previousStageRef.current || undefined,
      timeOnStage,
    });

    // Update completed stages
    const updatedSession = {
      ...session,
      completedStages: [...session.completedStages, stage],
    };
    setSession(updatedSession);
    sessionRef.current = updatedSession;
  }, [session, statementId, user]);

  // Track stage skip
  const trackStageSkipped = useCallback((stage: MassConsensusStage) => {
    if (!session || !statementId || !user?.uid) return;

    const timeOnStage = session.stageStartTime 
      ? Math.round((Date.now() - session.stageStartTime) / 1000)
      : 0;

    analyticsService.trackMassConsensusSkipped({
      statementId,
      questionId: statementId,
      userId: user.uid,
      sessionId: session.sessionId,
      stage,
      previousStage: previousStageRef.current || undefined,
      timeOnStage,
    });
  }, [session, statementId, user]);

  // Track submission
  const trackSubmission = useCallback((
    submissionType: 'answer' | 'vote' | 'feedback',
    content?: string
  ) => {
    if (!session || !statementId || !user?.uid || !session.currentStage) return;

    analyticsService.trackMassConsensusSubmission({
      statementId,
      questionId: statementId,
      userId: user.uid,
      sessionId: session.sessionId,
      stage: session.currentStage,
      submissionType,
      content,
    });
  }, [session, statementId, user]);

  // Track vote
  const trackVote = useCallback((
    suggestionId: string,
    voteValue: number,
    voteType: 'similar' | 'random' | 'top'
  ) => {
    if (!session || !statementId || !user?.uid || !session.currentStage) return;

    analyticsService.trackMassConsensusVote({
      statementId,
      questionId: statementId,
      userId: user.uid,
      sessionId: session.sessionId,
      stage: session.currentStage,
      suggestionId,
      voteValue,
      voteType,
    });
  }, [session, statementId, user]);

  // Track process completion
  const trackProcessCompleted = useCallback(() => {
    if (!session || !statementId || !user?.uid) return;

    const totalTime = Math.round((Date.now() - session.startTime) / 1000); // in seconds

    analyticsService.trackMassConsensusCompleted({
      statementId,
      questionId: statementId,
      userId: user.uid,
      sessionId: session.sessionId,
      totalTime,
      completedStages: session.completedStages,
    });
  }, [session, statementId, user]);

  // Track process abandonment (on unmount if not completed)
  useEffect(() => {
    return () => {
      const currentSession = sessionRef.current;
      if (!currentSession || !statementId || !user?.uid) return;
      
      // Check if process was completed
      const isCompleted = currentSession.completedStages.includes('voting') || 
                         currentSession.completedStages.includes('feedback');
      
      if (!isCompleted && currentSession.currentStage) {
        const totalTime = Math.round((Date.now() - currentSession.startTime) / 1000);
        
        analyticsService.trackMassConsensusAbandoned({
          statementId,
          questionId: statementId,
          userId: user.uid,
          sessionId: currentSession.sessionId,
          lastStage: currentSession.currentStage,
          totalTime,
        });
      }
    };
  }, [statementId, user]);

  return {
    sessionId: session?.sessionId,
    currentStage: session?.currentStage,
    trackStageCompleted,
    trackStageSkipped,
    trackSubmission,
    trackVote,
    trackProcessCompleted,
  };
};