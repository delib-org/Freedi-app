'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/auth/AuthProvider';
import { establishServerSession } from '@/lib/firebase/serverSession';

interface SessionBootstrapProps {
  /** Where to go when no session can be created. */
  fallbackHref: string;
}

/**
 * Rendered by a server page that found no valid session. Creates one from the
 * browser's Firebase sign-in and reloads, so a returning user does not lose the
 * page. Reloads only after a new session was really created, so it cannot loop.
 */
export default function SessionBootstrap({ fallbackHref }: SessionBootstrapProps) {
  const router = useRouter();
  const { user, isLoading } = useAuth();

  useEffect(() => {
    if (isLoading) return;

    if (!user) {
      router.replace(fallbackHref);

      return;
    }

    let cancelled = false;
    void establishServerSession(user).then((created) => {
      if (cancelled) return;

      if (created) {
        window.location.reload();
      } else {
        router.replace(fallbackHref);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [user, isLoading, router, fallbackHref]);

  return null;
}
