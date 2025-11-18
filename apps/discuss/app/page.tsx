import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Freedi Discussion - Fast Crowdsourced Solutions',
  description: 'Participate in discussions and evaluate solutions to important questions',
};

/**
 * Home page
 * For now, shows a welcome message
 * TODO: Add featured questions list
 */
export default function HomePage() {
  return (
    <div className="page">
      <h1>Welcome to Freedi Discussion</h1>
      <p>
        A fast, focused platform for crowdsourcing and evaluating solutions to important questions.
      </p>

      <div style={{ marginTop: '2rem' }}>
        <h2>How it works</h2>
        <ol style={{ lineHeight: 1.8 }}>
          <li>Read the question and explore existing solutions</li>
          <li>Evaluate solutions on a scale from -1 (disagree) to +1 (agree)</li>
          <li>Get a new batch of solutions to evaluate</li>
          <li>Submit your own solution</li>
          <li>View results and get AI-powered feedback on your solutions</li>
        </ol>
      </div>

      <div style={{ marginTop: '2rem', padding: '1.5rem', background: '#f9fafb', borderRadius: '12px' }}>
        <h3>Getting Started</h3>
        <p>To participate in a discussion, navigate to a question URL:</p>
        <code style={{ display: 'block', padding: '0.5rem', background: 'white', borderRadius: '4px', marginTop: '0.5rem' }}>
          /q/[statementId]
        </code>
      </div>
    </div>
  );
}
