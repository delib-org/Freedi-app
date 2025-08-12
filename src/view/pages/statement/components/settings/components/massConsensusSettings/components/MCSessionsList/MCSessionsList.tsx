import React from 'react';
import { MCSession, MCSessionStatus } from 'delib-npm';
import { 
  publishMCSession, 
  archiveMCSession,
  duplicateMCSession 
} from '@/controllers/db/mcSessions';
import styles from './MCSessionsList.module.scss';

interface Props {
  sessions: MCSession[];
  onEdit: (session: MCSession) => void;
}

const MCSessionsList: React.FC<Props> = ({ sessions, onEdit }) => {
  
  const handlePublish = async (sessionId: string) => {
    if (confirm('Are you sure you want to publish this session? Participants will be able to access it.')) {
      await publishMCSession(sessionId);
    }
  };
  
  const handleArchive = async (sessionId: string) => {
    if (confirm('Are you sure you want to archive this session?')) {
      await archiveMCSession(sessionId);
    }
  };
  
  const handleDuplicate = async (session: MCSession) => {
    const newTitle = prompt('Enter name for duplicated session:', `${session.title} (Copy)`);
    if (newTitle) {
      await duplicateMCSession(session.sessionId, newTitle, session.createdBy);
    }
  };
  
  const getStatusBadge = (status: MCSessionStatus) => {
    const statusClasses = {
      [MCSessionStatus.DRAFT]: styles.draft,
      [MCSessionStatus.ACTIVE]: styles.active,
      [MCSessionStatus.COMPLETED]: styles.completed,
      [MCSessionStatus.ARCHIVED]: styles.archived,
    };
    
    return (
      <span className={`${styles.statusBadge} ${statusClasses[status]}`}>
        {status}
      </span>
    );
  };
  
  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };
  
  return (
    <div className={styles.sessionsList}>
      {sessions.map(session => (
        <div key={session.sessionId} className={styles.sessionCard}>
          <div className={styles.sessionHeader}>
            <div>
              <h4 className={styles.sessionTitle}>{session.title}</h4>
              {session.description && (
                <p className={styles.sessionDescription}>{session.description}</p>
              )}
            </div>
            {getStatusBadge(session.status)}
          </div>
          
          <div className={styles.sessionMeta}>
            <span className={styles.metaItem}>
              {session.questions.length} question{session.questions.length !== 1 ? 's' : ''}
            </span>
            <span className={styles.metaItem}>
              Created: {formatDate(session.createdAt)}
            </span>
          </div>
          
          <div className={styles.sessionActions}>
            <button 
              className={styles.actionButton}
              onClick={() => onEdit(session)}
            >
              Edit
            </button>
            
            {session.status === MCSessionStatus.DRAFT && (
              <button 
                className={`${styles.actionButton} ${styles.publishButton}`}
                onClick={() => handlePublish(session.sessionId)}
              >
                Publish
              </button>
            )}
            
            {session.status === MCSessionStatus.ACTIVE && (
              <button 
                className={`${styles.actionButton} ${styles.archiveButton}`}
                onClick={() => handleArchive(session.sessionId)}
              >
                Archive
              </button>
            )}
            
            <button 
              className={styles.actionButton}
              onClick={() => handleDuplicate(session)}
            >
              Duplicate
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};

export default MCSessionsList;