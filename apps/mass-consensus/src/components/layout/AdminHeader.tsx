'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useTranslation } from '@freedi/shared-i18n/next';
import { useAuth } from '@/components/auth/AuthProvider';
import LanguageSwitcher from './LanguageSwitcher';
import styles from './Layout.module.scss';

/**
 * Admin header with navigation and user menu
 */
export default function AdminHeader() {
  const { t } = useTranslation();
  const pathname = usePathname();
  const { user, signOut } = useAuth();
  const [showUserMenu, setShowUserMenu] = useState(false);

  const handleSignOut = async () => {
    try {
      await signOut();
      window.location.href = '/';
    } catch (error) {
      console.error('Sign out error:', error);
    }
  };

  const isActive = (path: string) => {
    if (path === '/admin/surveys') {
      return pathname === '/admin/surveys' || pathname === '/admin';
    }
    return pathname.startsWith(path);
  };

  return (
    <header className={styles.adminHeader}>
      <div className={styles.headerLeft}>
        <Link href="/" className={styles.logo}>
          Mass Consensus
        </Link>

        <nav className={styles.nav}>
          <Link
            href="/admin/surveys"
            className={`${styles.navLink} ${isActive('/admin/surveys') ? styles.active : ''}`}
          >
            {t('mySurveys') || 'My Surveys'}
          </Link>
          <Link
            href="/admin/surveys/new"
            className={`${styles.navLink} ${isActive('/admin/surveys/new') ? styles.active : ''}`}
          >
            {t('createSurvey') || 'Create Survey'}
          </Link>
        </nav>
      </div>

      <div className={styles.headerRight}>
        <LanguageSwitcher />
        <div className={styles.userMenu}>
          <button
            className={styles.userButton}
            onClick={() => setShowUserMenu(!showUserMenu)}
          >
            {user?.photoURL ? (
              <Image
                src={user.photoURL}
                alt={user.displayName || 'User'}
                width={32}
                height={32}
                className={styles.userAvatar}
                unoptimized
              />
            ) : (
              <div className={styles.userAvatarPlaceholder}>
                {(user?.displayName?.[0] || user?.email?.[0] || 'U').toUpperCase()}
              </div>
            )}
            <span className={styles.userName}>
              {user?.displayName || user?.email?.split('@')[0] || 'User'}
            </span>
            <svg
              className={`${styles.chevron} ${showUserMenu ? styles.open : ''}`}
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>

          {showUserMenu && (
            <>
              <div
                className={styles.menuOverlay}
                onClick={() => setShowUserMenu(false)}
              />
              <div className={styles.dropdown}>
                <div className={styles.dropdownHeader}>
                  <p className={styles.dropdownEmail}>{user?.email}</p>
                </div>
                <div className={styles.dropdownDivider} />
                <button
                  className={styles.dropdownItem}
                  onClick={handleSignOut}
                >
                  {t('signOut') || 'Sign Out'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
