'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useTranslation } from '@freedi/shared-i18n/next';
import { isRTL, LanguagesEnum } from '@freedi/shared-i18n';
import { DemographicSettings } from '@/components/admin/demographics';
import LogoUpload from '@/components/admin/LogoUpload';
import LanguageSelector from '@/components/admin/LanguageSelector';
import { DemographicMode, SurveyTriggerMode } from '@/types/demographics';
import { TextDirection, TocPosition, DEFAULT_LOGO_URL, DEFAULT_BRAND_NAME } from '@/types';
import GoogleDocsImport from '@/components/import/GoogleDocsImport';
import { useAdminContext } from '../AdminContext';
import styles from '../admin.module.scss';

interface Settings {
  allowComments: boolean;
  allowApprovals: boolean;
  enableSuggestions: boolean;
  requireLogin: boolean;
  showHeatMap: boolean;
  showViewCounts: boolean;
  isPublic: boolean;
  demographicMode: DemographicMode;
  demographicRequired: boolean;
  surveyTrigger: SurveyTriggerMode;
  textDirection: TextDirection;
  defaultLanguage: string;
  forceLanguage: boolean;
  logoUrl: string;
  brandName: string;
  tocEnabled: boolean;
  tocMaxLevel: number;
  tocPosition: TocPosition;
}

export default function AdminSettingsPage() {
  const params = useParams();
  const router = useRouter();
  const statementId = params.statementId as string;
  const { t, changeLanguage } = useTranslation();
  const { canManageSettings } = useAdminContext();

  const [settings, setSettings] = useState<Settings>({
    allowComments: true,
    allowApprovals: true,
    enableSuggestions: false,
    requireLogin: false,
    showHeatMap: true,
    showViewCounts: true,
    isPublic: true,
    demographicMode: 'disabled',
    demographicRequired: false,
    surveyTrigger: 'on_interaction',
    textDirection: 'auto',
    defaultLanguage: '',
    forceLanguage: true,
    logoUrl: DEFAULT_LOGO_URL,
    brandName: DEFAULT_BRAND_NAME,
    tocEnabled: false,
    tocMaxLevel: 2,
    tocPosition: 'auto',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const fetchSettings = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/admin/settings/${statementId}`);
      if (response.ok) {
        const data = await response.json();
        setSettings(data);
      }
    } catch (error) {
      console.error('Failed to fetch settings:', error);
    } finally {
      setLoading(false);
    }
  }, [statementId]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  // Redirect viewers to dashboard - they cannot access settings
  useEffect(() => {
    if (!canManageSettings) {
      router.replace(`/doc/${statementId}/admin`);
    }
  }, [canManageSettings, router, statementId]);

  // Don't render anything while redirecting
  if (!canManageSettings) {
    return null;
  }

  const handleToggle = (key: keyof Settings) => {
    setSettings(prev => ({
      ...prev,
      [key]: !prev[key],
    }));
    setSaved(false);
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const response = await fetch(`/api/admin/settings/${statementId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(settings),
      });

      if (response.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      }
    } catch (error) {
      console.error('Failed to save settings:', error);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className={styles.settingsPage}>
        <p style={{ textAlign: 'center', padding: 'var(--spacing-xl)', color: 'var(--text-secondary)' }}>
          {t('Loading...')}
        </p>
      </div>
    );
  }

  return (
    <div className={styles.settingsPage}>
      <header className={styles.dashboardHeader}>
        <h1 className={styles.dashboardTitle}>{t('Settings')}</h1>
        <p className={styles.dashboardSubtitle}>
          {t('Configure document visibility and interactions')}
        </p>
      </header>

      {/* Import from Google Docs */}
      <section className={styles.settingsSection}>
        <h2 className={styles.settingsSectionTitle}>{t('Import Content')}</h2>
        <GoogleDocsImport
          statementId={statementId}
          onImportComplete={() => router.refresh()}
        />
      </section>

      {/* Visibility Settings */}
      <section className={styles.settingsSection}>
        <h2 className={styles.settingsSectionTitle}>{t('Visibility')}</h2>

        <div className={styles.settingRow}>
          <div className={styles.settingInfo}>
            <p className={styles.settingLabel}>{t('Public Document')}</p>
            <p className={styles.settingDescription}>
              {t('Allow anyone with the link to view this document')}
            </p>
          </div>
          <button
            type="button"
            className={`${styles.toggle} ${settings.isPublic ? styles.active : ''}`}
            onClick={() => handleToggle('isPublic')}
            aria-pressed={settings.isPublic}
          />
        </div>

        <div className={styles.settingRow}>
          <div className={styles.settingInfo}>
            <p className={styles.settingLabel}>{t('Require Login')}</p>
            <p className={styles.settingDescription}>
              {t('Users must be logged in to view and interact')}
            </p>
          </div>
          <button
            type="button"
            className={`${styles.toggle} ${settings.requireLogin ? styles.active : ''}`}
            onClick={() => handleToggle('requireLogin')}
            aria-pressed={settings.requireLogin}
          />
        </div>
      </section>

      {/* Interaction Settings */}
      <section className={styles.settingsSection}>
        <h2 className={styles.settingsSectionTitle}>{t('Interactions')}</h2>

        <div className={styles.settingRow}>
          <div className={styles.settingInfo}>
            <p className={styles.settingLabel}>{t('Allow Comments')}</p>
            <p className={styles.settingDescription}>
              {t('Users can add comments to paragraphs')}
            </p>
          </div>
          <button
            type="button"
            className={`${styles.toggle} ${settings.allowComments ? styles.active : ''}`}
            onClick={() => handleToggle('allowComments')}
            aria-pressed={settings.allowComments}
          />
        </div>

        <div className={styles.settingRow}>
          <div className={styles.settingInfo}>
            <p className={styles.settingLabel}>{t('Allow Approvals')}</p>
            <p className={styles.settingDescription}>
              {t('Users can approve or disapprove paragraphs')}
            </p>
          </div>
          <button
            type="button"
            className={`${styles.toggle} ${settings.allowApprovals ? styles.active : ''}`}
            onClick={() => handleToggle('allowApprovals')}
            aria-pressed={settings.allowApprovals}
          />
        </div>

        <div className={styles.settingRow}>
          <div className={styles.settingInfo}>
            <p className={styles.settingLabel}>{t('Enable Suggestions')}</p>
            <p className={styles.settingDescription}>
              {t('Allow users to suggest alternative text for paragraphs')}
            </p>
          </div>
          <button
            type="button"
            className={`${styles.toggle} ${settings.enableSuggestions ? styles.active : ''}`}
            onClick={() => handleToggle('enableSuggestions')}
            aria-pressed={settings.enableSuggestions}
          />
        </div>
      </section>

      {/* Display Settings */}
      <section className={styles.settingsSection}>
        <h2 className={styles.settingsSectionTitle}>{t('Display')}</h2>

        <div className={styles.settingRow}>
          <div className={styles.settingInfo}>
            <p className={styles.settingLabel}>{t('Show Heat Map')}</p>
            <p className={styles.settingDescription}>
              {t('Display approval ratings as color indicators')}
            </p>
          </div>
          <button
            type="button"
            className={`${styles.toggle} ${settings.showHeatMap ? styles.active : ''}`}
            onClick={() => handleToggle('showHeatMap')}
            aria-pressed={settings.showHeatMap}
          />
        </div>

        <div className={styles.settingRow}>
          <div className={styles.settingInfo}>
            <p className={styles.settingLabel}>{t('Show View Counts')}</p>
            <p className={styles.settingDescription}>
              {t('Display how many users have viewed each section')}
            </p>
          </div>
          <button
            type="button"
            className={`${styles.toggle} ${settings.showViewCounts ? styles.active : ''}`}
            onClick={() => handleToggle('showViewCounts')}
            aria-pressed={settings.showViewCounts}
          />
        </div>
      </section>

      {/* Table of Contents Settings */}
      <section className={styles.settingsSection}>
        <h2 className={styles.settingsSectionTitle}>{t('Table of Contents')}</h2>

        <div className={styles.settingRow}>
          <div className={styles.settingInfo}>
            <p className={styles.settingLabel}>{t('Enable Table of Contents')}</p>
            <p className={styles.settingDescription}>
              {t('Show a navigation menu for document sections')}
            </p>
          </div>
          <button
            type="button"
            className={`${styles.toggle} ${settings.tocEnabled ? styles.active : ''}`}
            onClick={() => handleToggle('tocEnabled')}
            aria-pressed={settings.tocEnabled}
          />
        </div>

        {settings.tocEnabled && (
          <div className={styles.settingRow}>
            <div className={styles.settingInfo}>
              <p className={styles.settingLabel}>{t('Maximum Heading Level')}</p>
              <p className={styles.settingDescription}>
                {t('Select which heading levels to include in the table of contents')}
              </p>
            </div>
            <select
              className={styles.select}
              value={settings.tocMaxLevel}
              onChange={(e) => {
                setSettings(prev => ({ ...prev, tocMaxLevel: parseInt(e.target.value, 10) }));
                setSaved(false);
              }}
            >
              <option value={1}>{t('H1 only')}</option>
              <option value={2}>{t('Up to H2')}</option>
              <option value={3}>{t('Up to H3')}</option>
              <option value={4}>{t('Up to H4')}</option>
              <option value={5}>{t('Up to H5')}</option>
              <option value={6}>{t('Up to H6')}</option>
            </select>
          </div>
        )}
      </section>

      {/* Language Settings */}
      <section className={styles.settingsSection}>
        <h2 className={styles.settingsSectionTitle}>{t('Language')}</h2>
        <p className={styles.settingDescription} style={{ marginBottom: 'var(--spacing-md)' }}>
          {t('Set the default language for this document. RTL languages (Hebrew, Arabic) will automatically switch text direction.')}
        </p>

        <LanguageSelector
          selectedLanguage={settings.defaultLanguage}
          onChange={(language) => {
            // When language changes, also update textDirection based on RTL
            const newDirection = language ? (isRTL(language as LanguagesEnum) ? 'rtl' : 'ltr') : 'auto';
            setSettings(prev => ({
              ...prev,
              defaultLanguage: language,
              textDirection: newDirection
            }));
            setSaved(false);

            // Also change the admin interface language and refresh server components
            if (language) {
              changeLanguage(language as LanguagesEnum);
              // Refresh to update server components (sidebar) with new language
              router.refresh();
            }
          }}
        />

        <div className={styles.settingRow} style={{ marginTop: 'var(--spacing-md)' }}>
          <div className={styles.settingInfo}>
            <p className={styles.settingLabel}>{t('Force Document Language')}</p>
            <p className={styles.settingDescription}>
              {t('When enabled, all viewers will see the document in the default language regardless of their browser settings')}
            </p>
          </div>
          <button
            type="button"
            className={`${styles.toggle} ${settings.forceLanguage ? styles.active : ''}`}
            onClick={() => {
              setSettings(prev => ({ ...prev, forceLanguage: !prev.forceLanguage }));
              setSaved(false);
            }}
            aria-pressed={settings.forceLanguage}
            disabled={!settings.defaultLanguage}
          />
        </div>
      </section>

      {/* Demographics Settings */}
      <section className={styles.settingsSection}>
        <h2 className={styles.settingsSectionTitle}>{t('Demographics Survey')}</h2>
        <DemographicSettings
          documentId={statementId}
          mode={settings.demographicMode}
          required={settings.demographicRequired}
          surveyTrigger={settings.surveyTrigger}
          onModeChange={(mode) => {
            setSettings((prev) => ({ ...prev, demographicMode: mode }));
            setSaved(false);
          }}
          onRequiredChange={(required) => {
            setSettings((prev) => ({ ...prev, demographicRequired: required }));
            setSaved(false);
          }}
          onSurveyTriggerChange={(trigger) => {
            setSettings((prev) => ({ ...prev, surveyTrigger: trigger }));
            setSaved(false);
          }}
        />
      </section>

      {/* Branding Settings */}
      <section className={styles.settingsSection}>
        <h2 className={styles.settingsSectionTitle}>{t('Branding')}</h2>
        <p className={styles.settingDescription} style={{ marginBottom: 'var(--spacing-md)' }}>
          {t('Customize the logo and brand name displayed on your document')}
        </p>

        <div className={styles.settingRow}>
          <div className={styles.settingInfo}>
            <p className={styles.settingLabel}>{t('Brand Name')}</p>
            <p className={styles.settingDescription}>
              {t('The name displayed in the header')}
            </p>
          </div>
          <input
            type="text"
            className={styles.textInput}
            value={settings.brandName}
            onChange={(e) => {
              setSettings((prev) => ({ ...prev, brandName: e.target.value }));
              setSaved(false);
            }}
            placeholder={DEFAULT_BRAND_NAME}
          />
        </div>

        <div className={styles.logoUploadRow}>
          <div className={styles.settingInfo}>
            <p className={styles.settingLabel}>{t('Logo')}</p>
            <p className={styles.settingDescription}>
              {t('Upload your organization logo (SVG, PNG, JPG, or WebP)')}
            </p>
          </div>
          <LogoUpload
            documentId={statementId}
            currentLogoUrl={settings.logoUrl}
            onLogoChange={(url) => {
              setSettings((prev) => ({ ...prev, logoUrl: url }));
              setSaved(false);
            }}
          />
        </div>
      </section>

      {/* Save Button */}
      <button
        className={styles.saveButton}
        onClick={handleSave}
        disabled={saving}
      >
        {saving ? t('Saving...') : saved ? t('Saved!') : t('Save Settings')}
      </button>
    </div>
  );
}
