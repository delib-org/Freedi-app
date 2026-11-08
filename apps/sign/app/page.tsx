import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getServerUser } from '@/lib/auth/requestIdentity';
import { getUserHomeDocuments } from '@/lib/firebase/homeQueries';
import HomeClient from '@/components/home/HomeClient';

export default async function HomePage() {
  const cookieStore = await cookies();
  const user = await getServerUser(cookieStore);

  // Redirect to login if not logged in or anonymous. The redirect param lets
  // the login page send back a signed-in user whose session was just created.
  if (!user || user.isAnonymous) {
    redirect('/login?redirect=/');
  }

  // Email from the verified session, for invitation queries
  const userEmail = user.email ?? undefined;

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
