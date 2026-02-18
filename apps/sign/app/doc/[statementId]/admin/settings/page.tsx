'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useTranslation } from '@freedi/shared-i18n/next';
import { isRTL, LanguagesEnum } from '@freedi/shared-i18n';
import { DemographicSettings } from '@/components/admin/demographics';
import LogoUpload from '@/components/admin/LogoUpload';
import LanguageSelector from '@/components/admin/LanguageSelector';
import { DemographicMode, SurveyTriggerMode } from '@/types/demographics';
import { TextDirection, TocPosition, ExplanationVideoMode, DEFAULT_LOGO_URL, DEFAULT_BRAND_NAME, HeaderColors, DEFAULT_HEADER_COLORS } from '@/types';
import GoogleDocsImport from '@/components/import/GoogleDocsImport';
import { useAdminContext } from '../AdminContext';
import styles from '../admin.module.scss';

/**
 * Extract YouTube video ID and return embed URL
 */
function getYouTubeEmbedUrl(url: string): string {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) {
      return `https://www.youtube.com/embed/${match[1]}`;
    }
  }

  return '';
}

interface Settings {
  allowComments: boolean;
  allowApprovals: boolean;
  enableSuggestions: boolean;
  requireGoogleLogin: boolean;
  hideUserIdentity: boolean;
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
  /** When true, shows interaction buttons as ghosted hints always (for elderly users) */
  enhancedVisibility: boolean;
  /** YouTube video URL for explanation video */
  explanationVideoUrl: string;
  /** Video display mode: 'optional' = button only, 'before_viewing' = must watch before viewing */
  explanationVideoMode: ExplanationVideoMode;
  /** When true, headers (h1-h6) will show interaction buttons like other paragraphs */
  allowHeaderReactions: boolean;
  /** Custom colors for each heading level */
  headerColors: HeaderColors;
  /** When true, non-interactive elements use normal text color instead of dimmed styling */
  nonInteractiveNormalStyle: boolean;
  /** When true, automatically numbers headings hierarchically (1, 1.1, 1.1.1, etc.) */
  enableHeadingNumbering: boolean;
  /** When true, shows signed/rejected counts to all users in the document footer */
  showSignatureCounts: boolean;
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
    requireGoogleLogin: false,
    hideUserIdentity: true,
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
    enhancedVisibility: false,
    explanationVideoUrl: '',
    explanationVideoMode: 'optional',
    allowHeaderReactions: false,
    headerColors: DEFAULT_HEADER_COLORS,
    nonInteractiveNormalStyle: false,
    enableHeadingNumbering: false,
    showSignatureCounts: true,
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
            <p className={styles.settingLabel}>{t('Require Google Login')}</p>
            <p className={styles.settingDescription}>
              {t('Users must sign in with Google to comment, suggest, or approve')}
            </p>
          </div>
          <button
            type="button"
            className={`${styles.toggle} ${settings.requireGoogleLogin ? styles.active : ''}`}
            onClick={() => handleToggle('requireGoogleLogin')}
            aria-pressed={settings.requireGoogleLogin}
          />
        </div>

        <div className={styles.settingRow}>
          <div className={styles.settingInfo}>
            <p className={styles.settingLabel}>{t('Hide User Identity')}</p>
            <p className={styles.settingDescription}>
              {t('Hide display names in comments, suggestions, and interactions')}
            </p>
          </div>
          <button
            type="button"
            className={`${styles.toggle} ${settings.hideUserIdentity ? styles.active : ''}`}
            onClick={() => handleToggle('hideUserIdentity')}
            aria-pressed={settings.hideUserIdentity}
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

        <div className={styles.settingRow}>
          <div className={styles.settingInfo}>
            <p className={styles.settingLabel}>{t('Allow Header Reactions')}</p>
            <p className={styles.settingDescription}>
              {t('Enable users to react (approve/reject) to headings')}
            </p>
          </div>
          <button
            type="button"
            className={`${styles.toggle} ${settings.allowHeaderReactions ? styles.active : ''}`}
            onClick={() => handleToggle('allowHeaderReactions')}
            aria-pressed={settings.allowHeaderReactions}
          />
        </div>
      </section>

      {/* Header Styling Settings */}
      <section className={styles.settingsSection}>
        <h2 className={styles.settingsSectionTitle}>{t('Header Styling')}</h2>
        <p className={styles.settingDescription} style={{ marginBottom: 'var(--spacing-md)' }}>
          {t('Customize header colors')}
        </p>

        {(['h1', 'h2', 'h3', 'h4', 'h5', 'h6'] as const).map((level) => (
          <div key={level} className={styles.settingRow}>
            <div className={styles.settingInfo}>
              <p className={styles.settingLabel}>{level.toUpperCase()} {t('Color')}</p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input
                type="color"
                value={settings.headerColors[level] || DEFAULT_HEADER_COLORS[level]}
                onChange={(e) => {
                  setSettings(prev => ({
                    ...prev,
                    headerColors: {
                      ...prev.headerColors,
                      [level]: e.target.value,
                    },
                  }));
                  setSaved(false);
                }}
                style={{ width: '40px', height: '32px', cursor: 'pointer', border: '1px solid var(--border-color)', borderRadius: '4px' }}
              />
              <button
                type="button"
                onClick={() => {
                  setSettings(prev => ({
                    ...prev,
                    headerColors: {
                      ...prev.headerColors,
                      [level]: DEFAULT_HEADER_COLORS[level],
                    },
                  }));
                  setSaved(false);
                }}
                style={{ padding: '4px 8px', fontSize: '12px', cursor: 'pointer', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '4px' }}
                title={t('Reset to default')}
              >
                {t('Reset')}
              </button>
            </div>
          </div>
        ))}
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

        <div className={styles.settingRow}>
          <div className={styles.settingInfo}>
            <p className={styles.settingLabel}>{t('Show Signature Counts')}</p>
            <p className={styles.settingDescription}>
              {t('Show signed and rejected counts to all users')}
            </p>
          </div>
          <button
            type="button"
            className={`${styles.toggle} ${settings.showSignatureCounts ? styles.active : ''}`}
            onClick={() => handleToggle('showSignatureCounts')}
            aria-pressed={settings.showSignatureCounts}
          />
        </div>

        <div className={styles.settingRow}>
          <div className={styles.settingInfo}>
            <p className={styles.settingLabel}>{t('Non-Interactive Normal Style')}</p>
            <p className={styles.settingDescription}>
              {t('Display non-interactive paragraphs with normal text color instead of dimmed/disabled styling')}
            </p>
          </div>
          <button
            type="button"
            className={`${styles.toggle} ${settings.nonInteractiveNormalStyle ? styles.active : ''}`}
            onClick={() => handleToggle('nonInteractiveNormalStyle')}
            aria-pressed={settings.nonInteractiveNormalStyle}
          />
        </div>
      </section>

      {/* Accessibility Settings */}
      <section className={styles.settingsSection}>
        <h2 className={styles.settingsSectionTitle}>{t('Accessibility')}</h2>

        <div className={styles.settingRow}>
          <div className={styles.settingInfo}>
            <p className={styles.settingLabel}>{t('Enhanced Visibility')}</p>
            <p className={styles.settingDescription}>
              {t('Show interaction buttons as visible hints at all times. Helpful for elderly users who may not discover hover/tap interactions.')}
            </p>
          </div>
          <button
            type="button"
            className={`${styles.toggle} ${settings.enhancedVisibility ? styles.active : ''}`}
            onClick={() => handleToggle('enhancedVisibility')}
            aria-pressed={settings.enhancedVisibility}
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

        {/* Enable Heading Numbering */}
        <div className={styles.settingRow}>
          <div className={styles.settingInfo}>
            <label htmlFor="enableHeadingNumbering" className={styles.settingLabel}>
              {t('settings.enableHeadingNumbering.label') || 'Enable Heading Numbering'}
            </label>
            <p className={styles.settingDescription}>
              {t('settings.enableHeadingNumbering.description') ||
               'Automatically number headings hierarchically (1, 1.1, 1.1.1, etc.)'}
            </p>
          </div>
          <button
            type="button"
            id="enableHeadingNumbering"
            className={`${styles.toggle} ${settings.enableHeadingNumbering ? styles.active : ''}`}
            onClick={() => handleToggle('enableHeadingNumbering')}
            aria-pressed={settings.enableHeadingNumbering}
            aria-label={t('settings.enableHeadingNumbering.label') || 'Enable Heading Numbering'}
          >
            <span className={styles.toggleSlider} />
          </button>
        </div>
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

      {/* Explanation Video Settings */}
      <section className={styles.settingsSection}>
        <h2 className={styles.settingsSectionTitle}>{t('Explanation Video')}</h2>
        <p className={styles.settingDescription} style={{ marginBottom: 'var(--spacing-md)' }}>
          {t('Add a YouTube video to help users understand the document. Users can access it via the Explanation button.')}
        </p>

        <div className={styles.settingRow}>
          <div className={styles.settingInfo}>
            <p className={styles.settingLabel}>{t('YouTube Video URL')}</p>
            <p className={styles.settingDescription}>
              {t('Paste a YouTube video URL (e.g., https://youtube.com/watch?v=...)')}
            </p>
          </div>
          <input
            type="url"
            className={styles.textInput}
            value={settings.explanationVideoUrl}
            onChange={(e) => {
              setSettings((prev) => ({ ...prev, explanationVideoUrl: e.target.value }));
              setSaved(false);
            }}
            placeholder="https://youtube.com/watch?v=..."
          />
        </div>

        {settings.explanationVideoUrl && (
          <>
            <div className={styles.videoPreviewRow}>
              <p className={styles.settingLabel}>{t('Preview')}</p>
              <div className={styles.videoPreview}>
                <iframe
                  width="300"
                  height="170"
                  src={getYouTubeEmbedUrl(settings.explanationVideoUrl)}
                  title={t('Video Preview')}
                  frameBorder="0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              </div>
            </div>

            {/* Video Display Mode Toggle */}
            <div className={styles.settingRow}>
              <div className={styles.settingInfo}>
                <p className={styles.settingLabel}>{t('Require Video Before Viewing')}</p>
                <p className={styles.settingDescription}>
                  {t('When enabled, users must watch the video before they can view the document')}
                </p>
              </div>
              <button
                type="button"
                className={`${styles.toggle} ${settings.explanationVideoMode === 'before_viewing' ? styles.active : ''}`}
                onClick={() => {
                  setSettings((prev) => ({
                    ...prev,
                    explanationVideoMode: prev.explanationVideoMode === 'before_viewing' ? 'optional' : 'before_viewing',
                  }));
                  setSaved(false);
                }}
                aria-pressed={settings.explanationVideoMode === 'before_viewing'}
              />
            </div>
          </>
        )}
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
