'use client';

import { useState, useMemo, useCallback } from 'react';
import { useTranslation } from '@freedi/shared-i18n/next';
import { useRouter } from 'next/navigation';
import styles from './HomeClient.module.scss';
import DocumentCard from './DocumentCard';
import EmptyState from './EmptyState';
import CreateDocumentModal from './CreateDocumentModal';
import type { HomeDocument, GroupInfo } from '@/lib/firebase/homeQueries';
import type { SignUser } from '@/lib/utils/user';
import { UI } from '@/constants/common';

type FilterType = 'all' | 'created' | 'collaborating' | 'signed';

interface HomeClientProps {
  documents: HomeDocument[];
  groups: GroupInfo[];
  user: SignUser;
}

export default function HomeClient({ documents, groups: initialGroups, user }: HomeClientProps) {
  const { t } = useTranslation();
  const router = useRouter();

  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<FilterType>('all');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [groups, setGroups] = useState<GroupInfo[]>(initialGroups);
  const [debounceTimer, setDebounceTimer] = useState<NodeJS.Timeout | null>(null);

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setSearchQuery(value);

      if (debounceTimer) clearTimeout(debounceTimer);

      const timer = setTimeout(() => {
        setDebouncedSearch(value);
      }, UI.DEBOUNCE_DELAY);

      setDebounceTimer(timer);
    },
    [debounceTimer]
  );

  const handleClearSearch = useCallback(() => {
    setSearchQuery('');
    setDebouncedSearch('');
  }, []);

  const handleSignOut = useCallback(() => {
    // Clear cookies
    document.cookie = 'userId=; path=/; max-age=0';
    document.cookie = 'userDisplayName=; path=/; max-age=0';
    document.cookie = 'userEmail=; path=/; max-age=0';
    localStorage.removeItem('signUserId');
    localStorage.removeItem('firebaseUser');
    router.push('/login');
  }, [router]);

  const handleGroupCreated = useCallback((newGroup: GroupInfo) => {
    setGroups((prev) => [newGroup, ...prev]);
  }, []);

  // Counts per filter
  const counts = useMemo(() => {
    const created = documents.filter((d) => d.relationship === 'created').length;
    const collaborating = documents.filter(
      (d) => d.relationship === 'collaborator' || d.relationship === 'invited'
    ).length;
    const signed = documents.filter((d) => d.relationship === 'signed').length;

    return { all: documents.length, created, collaborating, signed };
  }, [documents]);

  // Filtered documents
  const filteredDocuments = useMemo(() => {
    let result = documents;

    // Apply filter
    if (activeFilter === 'created') {
      result = result.filter((d) => d.relationship === 'created');
    } else if (activeFilter === 'collaborating') {
      result = result.filter(
        (d) => d.relationship === 'collaborator' || d.relationship === 'invited'
      );
    } else if (activeFilter === 'signed') {
      result = result.filter((d) => d.relationship === 'signed');
    }

    // Apply search
    if (debouncedSearch.trim()) {
      const query = debouncedSearch.toLowerCase();
      result = result.filter(
        (d) =>
          d.statement.toLowerCase().includes(query) ||
          (d.description && d.description.toLowerCase().includes(query)) ||
          (d.groupName && d.groupName.toLowerCase().includes(query))
      );
    }

    return result;
  }, [documents, activeFilter, debouncedSearch]);

  // Determine empty state variant
  const emptyStateVariant = useMemo(() => {
    if (debouncedSearch.trim()) return 'noResults' as const;
    if (documents.length === 0) return 'noDocuments' as const;

    switch (activeFilter) {
      case 'created':
        return 'emptyCreated' as const;
      case 'collaborating':
        return 'emptyCollaborating' as const;
      case 'signed':
        return 'emptySigned' as const;
      default:
        return 'noDocuments' as const;
    }
  }, [documents.length, activeFilter, debouncedSearch]);

  const filters: { key: FilterType; label: string; count: number }[] = [
    { key: 'all', label: t('All'), count: counts.all },
    { key: 'created', label: t('Created'), count: counts.created },
    { key: 'collaborating', label: t('Collaborating'), count: counts.collaborating },
    { key: 'signed', label: t('Signed'), count: counts.signed },
  ];

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <h1 className={styles.greeting}>
          {user.displayName ? `${t('My Documents')} — ${user.displayName}` : t('My Documents')}
        </h1>
        <button
          className={styles.signOutButton}
          onClick={handleSignOut}
          type="button"
        >
          {t('Sign out')}
        </button>
      </div>

      {/* Search */}
      <input
        className={styles.searchBar}
        type="search"
        placeholder={t('Search documents...')}
        value={searchQuery}
        onChange={handleSearchChange}
        aria-label={t('Search documents...')}
      />

      {/* Filter tabs */}
      {documents.length > 0 && (
        <div className={styles.filters} role="tablist" aria-label={t('Filter documents')}>
          {filters.map((filter) => (
            <button
              key={filter.key}
              className={`${styles.filterTab} ${activeFilter === filter.key ? styles.active : ''}`}
              onClick={() => setActiveFilter(filter.key)}
              role="tab"
              aria-selected={activeFilter === filter.key}
              type="button"
            >
              {filter.label}
              <span className={styles.filterCount}>({filter.count})</span>
            </button>
          ))}
        </div>
      )}

      {/* Document list */}
      {filteredDocuments.length > 0 ? (
        <div className={styles.documentList}>
          {filteredDocuments.map((doc) => (
            <DocumentCard key={doc.statementId} document={doc} />
          ))}
        </div>
      ) : (
        <EmptyState
          variant={emptyStateVariant}
          onAction={() => setShowCreateModal(true)}
          onClearSearch={handleClearSearch}
        />
      )}

      {/* FAB */}
      <button
        className={styles.fab}
        onClick={() => setShowCreateModal(true)}
        aria-label={t('Create Document')}
        type="button"
      >
        <span aria-hidden="true">+</span>
        <span className={styles.fabLabel}>{t('Create Document')}</span>
      </button>

      {/* Create document modal */}
      {showCreateModal && (
        <CreateDocumentModal
          groups={groups}
          onClose={() => setShowCreateModal(false)}
          onGroupCreated={handleGroupCreated}
        />
      )}
    </div>
  );
}
