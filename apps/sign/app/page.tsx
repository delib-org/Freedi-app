import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getUserFromCookies, isAnonymousUser } from '@/lib/utils/user';
import { getUserHomeDocuments } from '@/lib/firebase/homeQueries';
import HomeClient from '@/components/home/HomeClient';

export default async function HomePage() {
  const cookieStore = await cookies();
  const user = getUserFromCookies(cookieStore);

  // Redirect to login if not logged in or anonymous
  if (!user || isAnonymousUser(user.uid)) {
    redirect('/login');
  }

  // Get email from cookies for invitation queries
  const userEmail = cookieStore.get('userEmail')?.value || undefined;

  // Fetch user's documents
  const { documents, groups } = await getUserHomeDocuments(user.uid, userEmail);

  // Serialize for client component (Next.js RSC can't serialize some Firestore types)
  const serializedDocuments = JSON.parse(JSON.stringify(documents));
  const serializedGroups = JSON.parse(JSON.stringify(groups));
  const serializedUser = JSON.parse(JSON.stringify(user));

  return (
    <HomeClient
      documents={serializedDocuments}
      groups={serializedGroups}
      user={serializedUser}
    />
  );
}
