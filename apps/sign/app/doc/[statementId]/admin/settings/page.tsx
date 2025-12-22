'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useTranslation } from '@freedi/shared-i18n/next';
import { DemographicSettings } from '@/components/admin/demographics';
import LogoUpload from '@/components/admin/LogoUpload';
import { DemographicMode } from '@/types/demographics';
import { TextDirection, DEFAULT_LOGO_URL, DEFAULT_BRAND_NAME } from '@/types';
import GoogleDocsImport from '@/components/import/GoogleDocsImport';
import { useAdminContext } from '../AdminContext';
import styles from '../admin.module.scss';

interface Settings {
  allowComments: boolean;
  allowApprovals: boolean;
  requireLogin: boolean;
  showHeatMap: boolean;
  showViewCounts: boolean;
  isPublic: boolean;
  demographicMode: DemographicMode;
  demographicRequired: boolean;
  textDirection: TextDirection;
  logoUrl: string;
  brandName: string;
}

export default function AdminSettingsPage() {
  const params = useParams();
  const router = useRouter();
  const statementId = params.statementId as string;
  const { t } = useTranslation();
  const { canManageSettings } = useAdminContext();

  const [settings, setSettings] = useState<Settings>({
    allowComments: true,
    allowApprovals: true,
    requireLogin: false,
    showHeatMap: true,
    showViewCounts: true,
    isPublic: true,
    demographicMode: 'disabled',
    demographicRequired: false,
    textDirection: 'auto',
    logoUrl: DEFAULT_LOGO_URL,
    brandName: DEFAULT_BRAND_NAME,
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

      {/* Text Direction Settings */}
      <section className={styles.settingsSection}>
        <h2 className={styles.settingsSectionTitle}>{t('Text Direction')}</h2>
        <p className={styles.settingDescription} style={{ marginBottom: 'var(--spacing-md)' }}>
          {t('Control the text direction for this document')}
        </p>

        <div className={styles.radioGroup}>
          <label className={styles.radioOption}>
            <input
              type="radio"
              name="textDirection"
              value="auto"
              checked={settings.textDirection === 'auto'}
              onChange={() => {
                setSettings(prev => ({ ...prev, textDirection: 'auto' }));
                setSaved(false);
              }}
            />
            <span className={styles.radioLabel}>
              <strong>{t('Auto')}</strong>
              <span className={styles.radioDescription}>
                {t('Automatically detect direction based on content')}
              </span>
            </span>
          </label>

          <label className={styles.radioOption}>
            <input
              type="radio"
              name="textDirection"
              value="ltr"
              checked={settings.textDirection === 'ltr'}
              onChange={() => {
                setSettings(prev => ({ ...prev, textDirection: 'ltr' }));
                setSaved(false);
              }}
            />
            <span className={styles.radioLabel}>
              <strong>{t('Left to Right (LTR)')}</strong>
              <span className={styles.radioDescription}>
                {t('Force left-to-right direction (English, etc.)')}
              </span>
            </span>
          </label>

          <label className={styles.radioOption}>
            <input
              type="radio"
              name="textDirection"
              value="rtl"
              checked={settings.textDirection === 'rtl'}
              onChange={() => {
                setSettings(prev => ({ ...prev, textDirection: 'rtl' }));
                setSaved(false);
              }}
            />
            <span className={styles.radioLabel}>
              <strong>{t('Right to Left (RTL)')}</strong>
              <span className={styles.radioDescription}>
                {t('Force right-to-left direction (Hebrew, Arabic, etc.)')}
              </span>
            </span>
          </label>
        </div>
      </section>

      {/* Demographics Settings */}
      <section className={styles.settingsSection}>
        <h2 className={styles.settingsSectionTitle}>{t('Demographics Survey')}</h2>
        <DemographicSettings
          documentId={statementId}
          mode={settings.demographicMode}
          required={settings.demographicRequired}
          onModeChange={(mode) => {
            setSettings((prev) => ({ ...prev, demographicMode: mode }));
            setSaved(false);
          }}
          onRequiredChange={(required) => {
            setSettings((prev) => ({ ...prev, demographicRequired: required }));
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
