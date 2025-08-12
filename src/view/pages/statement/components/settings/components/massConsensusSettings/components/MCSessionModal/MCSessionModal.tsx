import React, { useState, useEffect } from 'react';
import { 
  MCSession, 
  MCQuestion,
  MCSessionSettings
} from 'delib-npm';
import { 
  createMCSession,
  updateMCSession,
  getMCSession,
  createDefaultMCSessionSettings,
  createDefaultMCQuestion
} from '@/controllers/db/mcSessions';
import { useAuthentication } from '@/controllers/hooks/useAuthentication';
import MCQuestionList from '../MCQuestionList/MCQuestionList';
import Modal from '@/view/components/modal/Modal';
import styles from './MCSessionModal.module.scss';

interface Props {
  session: MCSession | null;
  statementId: string;
  onClose: () => void;
}

const MCSessionModal: React.FC<Props> = ({ session, statementId, onClose }) => {
  const { user } = useAuthentication();
  const [title, setTitle] = useState(session?.title || '');
  const [description, setDescription] = useState(session?.description || '');
  const [questions, setQuestions] = useState<MCQuestion[]>(session?.questions || []);
  const [settings, setSettings] = useState<MCSessionSettings>(
    session?.settings || createDefaultMCSessionSettings()
  );
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'details' | 'questions' | 'settings'>('details');
  
  useEffect(() => {
    if (session) {
      setTitle(session.title);
      setDescription(session.description || '');
      setQuestions(session.questions);
      setSettings(session.settings);
    }
  }, [session]);
  
  const handleSave = async () => {
    if (!title.trim()) {
      alert('Please enter a session title');
      return;
    }
    
    if (!user) {
      alert('You must be logged in to save sessions');
      return;
    }
    
    setSaving(true);
    
    try {
      if (session) {
        // Update existing session
        await updateMCSession(session.sessionId, {
          title,
          description,
          settings
        });
        // Questions are updated separately through the question list
      } else {
        // Create new session
        const sessionData = {
          statementId,
          title,
          description,
          createdBy: user.uid,
          questions: [],
          settings,
          status: 'draft' as const
        };
        await createMCSession(sessionData, questions);
      }
      
      onClose();
    } catch (error) {
      console.error('Error saving session:', error);
      alert('Failed to save session');
    } finally {
      setSaving(false);
    }
  };
  
  const handleAddQuestion = () => {
    const newQuestion = createDefaultMCQuestion(
      session?.sessionId || '',
      questions.length
    );
    // Need to add a questionId for the local state
    const questionWithId = {
      ...newQuestion,
      questionId: `q_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    } as MCQuestion;
    setQuestions([...questions, questionWithId]);
  };
  
  const handleQuestionsReorder = (newQuestions: MCQuestion[]) => {
    setQuestions(newQuestions);
  };
  
  return (
    <Modal isOpen={true} onClose={onClose}>
      <div className={styles.modalContent}>
        <div className={styles.modalHeader}>
          <h2>{session ? 'Edit Session' : 'Create New Session'}</h2>
        </div>
        
        <div className={styles.tabs}>
          <button 
            className={`${styles.tab} ${activeTab === 'details' ? styles.active : ''}`}
            onClick={() => setActiveTab('details')}
          >
            Details
          </button>
          <button 
            className={`${styles.tab} ${activeTab === 'questions' ? styles.active : ''}`}
            onClick={() => setActiveTab('questions')}
          >
            Questions ({questions.length})
          </button>
          <button 
            className={`${styles.tab} ${activeTab === 'settings' ? styles.active : ''}`}
            onClick={() => setActiveTab('settings')}
          >
            Settings
          </button>
        </div>
        
        <div className={styles.tabContent}>
          {activeTab === 'details' && (
            <div className={styles.detailsTab}>
              <div className={styles.formGroup}>
                <label htmlFor="title">Session Title *</label>
                <input
                  id="title"
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Enter session title"
                  className={styles.input}
                />
              </div>
              
              <div className={styles.formGroup}>
                <label htmlFor="description">Description</label>
                <textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Optional description for this session"
                  className={styles.textarea}
                  rows={4}
                />
              </div>
            </div>
          )}
          
          {activeTab === 'questions' && (
            <div className={styles.questionsTab}>
              {questions.length === 0 ? (
                <div className={styles.emptyQuestions}>
                  <p>No questions added yet.</p>
                  <button 
                    className="btn btn--primary"
                    onClick={handleAddQuestion}
                  >
                    + Add First Question
                  </button>
                </div>
              ) : (
                <>
                  <MCQuestionList
                    sessionId={session?.sessionId || ''}
                    questions={questions}
                    onReorder={handleQuestionsReorder}
                  />
                  <button 
                    className="btn btn--add"
                    onClick={handleAddQuestion}
                  >
                    + Add Question
                  </button>
                </>
              )}
            </div>
          )}
          
          {activeTab === 'settings' && (
            <div className={styles.settingsTab}>
              <div className={styles.settingGroup}>
                <h4>Shared Steps</h4>
                <p className={styles.settingDescription}>
                  These steps will appear once for the entire session
                </p>
                
                <label className={styles.checkbox}>
                  <input
                    type="checkbox"
                    checked={settings.sharedSteps.introduction}
                    onChange={(e) => setSettings({
                      ...settings,
                      sharedSteps: {
                        ...settings.sharedSteps,
                        introduction: e.target.checked
                      }
                    })}
                  />
                  <span>Show Introduction</span>
                </label>
                
                <label className={styles.checkbox}>
                  <input
                    type="checkbox"
                    checked={settings.sharedSteps.userDemographics}
                    onChange={(e) => setSettings({
                      ...settings,
                      sharedSteps: {
                        ...settings.sharedSteps,
                        userDemographics: e.target.checked
                      }
                    })}
                  />
                  <span>Collect Demographics</span>
                </label>
                
                <label className={styles.checkbox}>
                  <input
                    type="checkbox"
                    checked={settings.sharedSteps.feedback}
                    onChange={(e) => setSettings({
                      ...settings,
                      sharedSteps: {
                        ...settings.sharedSteps,
                        feedback: e.target.checked
                      }
                    })}
                  />
                  <span>Collect Feedback</span>
                </label>
                
                <label className={styles.checkbox}>
                  <input
                    type="checkbox"
                    checked={settings.sharedSteps.thankYou}
                    onChange={(e) => setSettings({
                      ...settings,
                      sharedSteps: {
                        ...settings.sharedSteps,
                        thankYou: e.target.checked
                      }
                    })}
                  />
                  <span>Show Thank You</span>
                </label>
              </div>
              
              <div className={styles.settingGroup}>
                <h4>Participant Options</h4>
                
                <label className={styles.checkbox}>
                  <input
                    type="checkbox"
                    checked={settings.allowSkipping}
                    onChange={(e) => setSettings({
                      ...settings,
                      allowSkipping: e.target.checked
                    })}
                  />
                  <span>Allow Skipping Questions</span>
                </label>
                
                <label className={styles.checkbox}>
                  <input
                    type="checkbox"
                    checked={settings.showProgressBar}
                    onChange={(e) => setSettings({
                      ...settings,
                      showProgressBar: e.target.checked
                    })}
                  />
                  <span>Show Progress Bar</span>
                </label>
                
                <label className={styles.checkbox}>
                  <input
                    type="checkbox"
                    checked={settings.showIntermediateResults}
                    onChange={(e) => setSettings({
                      ...settings,
                      showIntermediateResults: e.target.checked
                    })}
                  />
                  <span>Show Results Between Questions</span>
                </label>
                
                <label className={styles.checkbox}>
                  <input
                    type="checkbox"
                    checked={settings.randomizeQuestions}
                    onChange={(e) => setSettings({
                      ...settings,
                      randomizeQuestions: e.target.checked
                    })}
                  />
                  <span>Randomize Question Order</span>
                </label>
              </div>
            </div>
          )}
        </div>
        
        <div className={styles.modalFooter}>
          <button 
            className="btn btn--secondary"
            onClick={onClose}
            disabled={saving}
          >
            Cancel
          </button>
          <button 
            className={saving ? "btn btn--disabled" : "btn btn--primary"}
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? 'Saving...' : session ? 'Update Session' : 'Create Session'}
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default MCSessionModal;