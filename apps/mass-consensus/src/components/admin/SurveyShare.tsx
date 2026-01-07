'use client';

import { useState } from 'react';
import Link from 'next/link';
import { QRCodeSVG } from 'qrcode.react';
import { useTranslation } from '@freedi/shared-i18n/next';
import { Survey, SurveyStatus } from '@/types/survey';
import { trackSurveyLinkShared, trackQrCodeDownloaded } from '@/lib/analytics';
import styles from './Admin.module.scss';

interface SurveyShareProps {
  survey: Survey;
}

/**
 * Panel for sharing survey link and QR code
 */
export default function SurveyShare({ survey }: SurveyShareProps) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  // Check if survey is active (shareable)
  const isActive = survey.status === SurveyStatus.active;

  // Generate the survey URL
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
  const surveyUrl = `${baseUrl}/s/${survey.surveyId}`;

  const handleCopy = async () => {
    if (!isActive) return;
    try {
      await navigator.clipboard.writeText(surveyUrl);
      setCopied(true);
      trackSurveyLinkShared(survey.surveyId);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('[SurveyShare] Copy failed:', err);
    }
  };

  const handleDownloadQR = () => {
    const svg = document.getElementById('survey-qr-code');
    if (!svg) return;

    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();

    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx?.drawImage(img, 0, 0);
      const pngFile = canvas.toDataURL('image/png');

      const downloadLink = document.createElement('a');
      downloadLink.download = `survey-${survey.surveyId}-qr.png`;
      downloadLink.href = pngFile;
      downloadLink.click();
      trackQrCodeDownloaded(survey.surveyId);
    };

    img.src = 'data:image/svg+xml;base64,' + btoa(svgData);
  };

  return (
    <div className={styles.formSection}>
      <h2 className={styles.sectionTitle}>{survey.title}</h2>

      {survey.description && (
        <p style={{ color: 'var(--text-body)', marginBottom: '1.5rem' }}>
          {survey.description}
        </p>
      )}

      <div style={{ marginBottom: '1rem' }}>
        <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
          {survey.questionIds.length} {t('questions')} •{' '}
          <span style={{ color: survey.status === SurveyStatus.active ? 'var(--agree)' : 'var(--text-muted)' }}>
            {t(survey.status || 'draft')}
          </span>
        </span>
      </div>

      {/* Warning when survey is not active */}
      {!isActive && (
        <div style={{
          padding: '1rem',
          background: 'var(--bg-muted)',
          borderRadius: '8px',
          marginBottom: '1.5rem',
          border: '1px solid var(--border)',
        }}>
          <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.875rem' }}>
            ⚠️ {t('surveyNotActiveWarning') || 'Survey must be activated before sharing. Go to the Status tab to activate.'}
          </p>
        </div>
      )}

      <div className={styles.sharePanel} style={{ opacity: isActive ? 1 : 0.5, pointerEvents: isActive ? 'auto' : 'none' }}>
        {/* Survey Link */}
        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>
            {t('surveyLink')}
          </label>
          <div className={styles.shareLink}>
            <input
              type="text"
              className={styles.linkInput}
              value={surveyUrl}
              readOnly
              disabled={!isActive}
            />
            <button
              className={`${styles.copyButton} ${copied ? styles.copied : ''}`}
              onClick={handleCopy}
              disabled={!isActive}
            >
              {copied ? t('copied') : t('copy')}
            </button>
          </div>
        </div>

        {/* QR Code */}
        <div className={styles.qrCode}>
          <QRCodeSVG
            id="survey-qr-code"
            value={surveyUrl}
            size={200}
            level="M"
            includeMargin
          />
          <p className={styles.qrLabel}>{t('scanToParticipate')}</p>
          <button
            onClick={handleDownloadQR}
            disabled={!isActive}
            style={{
              marginTop: '0.5rem',
              padding: '0.5rem 1rem',
              background: 'var(--bg-muted)',
              border: 'none',
              borderRadius: '6px',
              cursor: isActive ? 'pointer' : 'not-allowed',
              fontSize: '0.875rem',
            }}
          >
            {t('downloadQR')}
          </button>
        </div>

        {/* Preview Link */}
        <div style={{ textAlign: 'center' }}>
          <Link
            href={`/s/${survey.surveyId}`}
            target="_blank"
            style={{
              display: 'inline-block',
              padding: '0.75rem 1.5rem',
              background: 'var(--btn-primary)',
              color: 'white',
              borderRadius: '50px',
              textDecoration: 'none',
              fontWeight: 600,
            }}
          >
            {t('previewSurvey')}
          </Link>
        </div>
      </div>
    </div>
  );
}
