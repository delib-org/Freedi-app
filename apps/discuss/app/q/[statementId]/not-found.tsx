/**
 * 404 page for question not found
 */
export default function NotFound() {
  return (
    <div className="page">
      <h1>Question Not Found</h1>
      <p>The discussion you're looking for doesn't exist or has been removed.</p>
      <div style={{ marginTop: '2rem' }}>
        <a href="/" style={{ color: 'var(--btn-primary)', textDecoration: 'underline' }}>
          ← Back to home
        </a>
      </div>
    </div>
  );
}
