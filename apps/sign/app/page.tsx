import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';

export default async function HomePage() {
  // Check if user is logged in via cookie
  const cookieStore = await cookies();
  const userId = cookieStore.get('userId')?.value;

  // If not logged in, redirect to login
  if (!userId) {
    redirect('/login');
  }

  // User is logged in - show welcome page
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      padding: '2rem',
      textAlign: 'center'
    }}>
      <h1 style={{ marginBottom: '1rem' }}>Welcome to Freedi Sign</h1>
      <p style={{ marginBottom: '2rem', color: '#666' }}>
        You are logged in. Open a document link to view and sign documents.
      </p>
      <Link
        href="/login"
        style={{
          padding: '0.75rem 1.5rem',
          background: '#e0e0e0',
          borderRadius: '8px',
          textDecoration: 'none',
          color: '#333'
        }}
      >
        Back to Login
      </Link>
    </div>
  );
}
