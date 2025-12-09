import { redirect } from 'next/navigation';

export default function HomePage() {
  // For now, redirect to login or show a landing page
  // In production, this could show recent documents or a landing page
  redirect('/login');
}
