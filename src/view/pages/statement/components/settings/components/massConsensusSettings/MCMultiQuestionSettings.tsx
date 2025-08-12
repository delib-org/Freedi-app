import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router';
import { 
  MCSession, 
  MCSessionStatus,
  MCQuestion
} from 'delib-npm';
import { useAppSelector } from '@/controllers/hooks/reduxHooks';
import { useAuthentication } from '@/controllers/hooks/useAuthentication';
import { statementSelector } from '@/redux/statements/statementsSlice';
import { selectActiveSessionsByStatement } from '@/redux/mcSessions/mcSessionsSlice';
import { 
  getMCSessionsByStatement,
  createDraftMCSession,
  listenToStatementMCSessions 
} from '@/controllers/db/mcSessions';
import MCSessionsList from './components/MCSessionsList/MCSessionsList';
import MCSessionModal from './components/MCSessionModal/MCSessionModal';
import styles from './MCMultiQuestionSettings.module.scss';

const MCMultiQuestionSettings: React.FC = () => {
  const { statementId } = useParams();
  const { user } = useAuthentication();
  const statement = useAppSelector(statementSelector(statementId));
  const sessions = useAppSelector(selectActiveSessionsByStatement(statementId || ''));
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSession, setEditingSession] = useState<MCSession | null>(null);
  const [loading, setLoading] = useState(false);
  
  // Load sessions on mount
  useEffect(() => {
    if (!statementId) return;
    
    setLoading(true);
    getMCSessionsByStatement(statementId).finally(() => {
      setLoading(false);
    });
    
    // Listen to real-time updates
    const unsubscribe = listenToStatementMCSessions(statementId);
    return () => unsubscribe();
  }, [statementId]);
  
  const handleCreateSession = async () => {
    console.log('Creating session with:', { statementId, userId: user?.uid });
    
    if (!statementId || !user) {
      console.error('Missing required data:', { 
        statementId, 
        hasUser: !!user,
        userId: user?.uid 
      });
      alert('Missing required data to create session');
      return;
    }
    
    try {
      const session = await createDraftMCSession(
        statementId,
        'New Multi-Question Session',
        user.uid
      );
      
      if (session) {
        console.log('Session created successfully:', session);
        setEditingSession(session);
        setIsModalOpen(true);
      } else {
        console.error('No session returned from createDraftMCSession');
        alert('Failed to create session - no session returned');
      }
    } catch (error) {
      console.error('Error creating session - full error:', error);
      if (error instanceof Error) {
        console.error('Error message:', error.message);
        console.error('Error stack:', error.stack);
        alert(`Failed to create session: ${error.message}`);
      } else {
        alert('Failed to create session. Please check console for details.');
      }
    }
  };
  
  const handleEditSession = (session: MCSession) => {
    setEditingSession(session);
    setIsModalOpen(true);
  };
  
  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingSession(null);
  };
  
  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h3>Multi-Question Sessions</h3>
        <p className={styles.description}>
          Create and manage multi-question consensus sessions. Each session can have multiple questions 
          with different step configurations.
        </p>
      </div>
      
      <div className={styles.actions}>
        <button 
          className="btn btn--primary"
          onClick={handleCreateSession}
        >
          + Create New Session
        </button>
      </div>
      
      {loading ? (
        <div className={styles.loading}>Loading sessions...</div>
      ) : sessions.length === 0 ? (
        <div className={styles.empty}>
          <p>No sessions created yet.</p>
          <p>Create your first multi-question session to get started.</p>
        </div>
      ) : (
        <MCSessionsList 
          sessions={sessions}
          onEdit={handleEditSession}
        />
      )}
      
      {isModalOpen && (
        <MCSessionModal
          session={editingSession}
          statementId={statementId || ''}
          onClose={handleCloseModal}
        />
      )}
    </div>
  );
};

export default MCMultiQuestionSettings;