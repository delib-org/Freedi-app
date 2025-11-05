import React, { FC, useState, useCallback, useEffect } from "react";
import { useTranslation } from "@/controllers/hooks/useTranslation";
import {
  ExplanationConfig,
  PostActionConfig,
  ExplanationDisplayMode,
} from "delib-npm";
import { useExplanationConfig } from "./hooks/useExplanationConfig";
import GlobalExplanationSettings from "./components/GlobalExplanationSettings";
import StageExplanationEditor from "./components/StageExplanationEditor";
import PreviewPanel from "./components/PreviewPanel";
import ManagementControls from "./components/ManagementControls";
import styles from "./ExplanationsAdmin.module.scss";
import Button, { ButtonType } from "@/view/components/buttons/button/Button";

// Mass Consensus stages configuration
const MASS_CONSENSUS_STAGES = [
  { id: "introduction", label: "Introduction", icon: "📋" },
  { id: "question", label: "Question Phase", icon: "❓" },
  { id: "randomSuggestions", label: "Random Suggestions", icon: "🎲" },
  { id: "topSuggestions", label: "Top Suggestions", icon: "⭐" },
  { id: "voting", label: "Voting", icon: "🗳️" },
  { id: "results", label: "Results", icon: "📊" },
  { id: "completion", label: "Completion", icon: "✅" },
];

interface StageConfiguration {
  id: string;
  enabled: boolean;
  beforeStage?: ExplanationConfig;
  afterAction?: PostActionConfig;
}

interface ExplanationsAdminProps {
  onSave?: (config: StageConfiguration[]) => void;
  initialConfig?: StageConfiguration[];
}

const ExplanationsAdmin: FC<ExplanationsAdminProps> = ({
  onSave,
  initialConfig,
}) => {
  const { t, dir, currentLanguage } = useTranslation();

  // Use the custom hook for configuration management
  const {
    configurations: loadedConfigurations,
    isLoading,
    isSaving,
    error,
    saveConfigurations: saveToDatabase,
    exportConfigurations,
    importConfigurations,
  } = useExplanationConfig();

  // State management
  const [globalSettings, setGlobalSettings] = useState({
    enabled: true,
    defaultDisplayMode: "card" as ExplanationDisplayMode,
    showProgressIndicator: true,
    allowUserDismiss: true,
  });

  const [stageConfigurations, setStageConfigurations] = useState<
    StageConfiguration[]
  >([]);

  const [activeStageId, setActiveStageId] = useState<string>("introduction");
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(["global"])
  );

  // Initialize configurations from loaded data
  useEffect(() => {
    if (loadedConfigurations.length > 0 && !initialConfig) {
      setStageConfigurations(loadedConfigurations);
    } else if (initialConfig) {
      setStageConfigurations(initialConfig);
    }
  }, [loadedConfigurations, initialConfig]);

  // Get active stage configuration
  const activeStageConfig = stageConfigurations.find(
    (s) => s.id === activeStageId
  );
  const activeStageInfo = MASS_CONSENSUS_STAGES.find(
    (s) => s.id === activeStageId
  );

  // Handle global settings update
  const handleGlobalSettingsChange = useCallback(
    (updates: Partial<typeof globalSettings>) => {
      setGlobalSettings((prev) => ({ ...prev, ...updates }));
      setHasUnsavedChanges(true);
    },
    []
  );

  // Handle stage configuration update
  const handleStageConfigChange = useCallback(
    (stageId: string, updates: Partial<StageConfiguration>) => {
      setStageConfigurations((prev) =>
        prev.map((stage) =>
          stage.id === stageId ? { ...stage, ...updates } : stage
        )
      );
      setHasUnsavedChanges(true);
    },
    []
  );

  // Handle save
  const handleSave = useCallback(async () => {
    try {
      await saveToDatabase(stageConfigurations);
      if (onSave) {
        onSave(stageConfigurations);
      }
      setHasUnsavedChanges(false);
    } catch (err) {
      console.error("Failed to save configurations:", err);
    }
  }, [stageConfigurations, onSave, saveToDatabase]);

  // Handle reset to defaults
  const handleResetToDefaults = useCallback(() => {
    const confirmReset = globalThis.confirm(
      t("Are you sure you want to reset all explanation settings to defaults?")
    );
    if (confirmReset) {
      setStageConfigurations(
        MASS_CONSENSUS_STAGES.map((stage) => ({
          id: stage.id,
          enabled: true,
          beforeStage: {
            enabled: true,
            content: "",
            displayMode: "card",
            dismissible: true,
            showOnlyFirstTime: true,
          },
        }))
      );
      setGlobalSettings({
        enabled: true,
        defaultDisplayMode: "card",
        showProgressIndicator: true,
        allowUserDismiss: true,
      });
      setHasUnsavedChanges(false);
    }
  }, [t]);

  // Toggle section expansion
  const toggleSection = useCallback((sectionId: string) => {
    setExpandedSections((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(sectionId)) {
        newSet.delete(sectionId);
      } else {
        newSet.add(sectionId);
      }

      return newSet;
    });
  }, []);

  // Show loading state
  if (isLoading) {
    return (
      <div className={styles.explanationsAdmin} dir={dir}>
        <div className={styles.loadingState}>
          <div className={styles.spinner}></div>
          <p>{t("Loading explanation configurations...")}</p>
        </div>
      </div>
    );
  }

  // Show error state
  if (error && !stageConfigurations.length) {
    return (
      <div className={styles.explanationsAdmin} dir={dir}>
        <div className={styles.errorState}>
          <span className={styles.errorIcon}>⚠️</span>
          <h3>{t("Error Loading Configurations")}</h3>
          <p>{error}</p>
          <button
            onClick={() => globalThis.location.reload()}
            className={styles.retryButton}
          >
            {t("Retry")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.explanationsAdmin} dir={dir}>
      {/* Show inline error if there's an error but configurations are loaded */}
      {error && (
        <div className={styles.inlineError}>
          <span className={styles.errorIcon}>⚠️</span>
          <span>{error}</span>
        </div>
      )}

      {/* Header with title and main controls */}
      <div className={styles.adminHeader}>
        <div className={styles.headerContent}>
          <h2 className={styles.title}>{t("Mass Consensus Explanations")}</h2>
          <p className={styles.subtitle}>
            {t(
              "Configure help text and feedback messages for each stage of the Mass Consensus process"
            )}
          </p>
        </div>

        {/* Save/Cancel controls */}
        <div className={styles.headerActions}>
          {hasUnsavedChanges && (
            <span className={styles.unsavedIndicator}>
              {t("Unsaved changes")}
            </span>
          )}
          <Button
            text={isPreviewMode ? t("Exit Preview") : t("Preview")}
            buttonType={ButtonType.PRIMARY}
            className={styles.previewButton}
            onClick={() => setIsPreviewMode(!isPreviewMode)}
          ></Button>
          <Button
            text={t("Cancel")}
            className={styles.cancelButton}
            onClick={() => globalThis.location.reload()}
            disabled={!hasUnsavedChanges}
          ></Button>
          <Button
            text={isSaving ? t("Saving...") : t("Save Changes")}
            className={styles.saveButton}
            onClick={handleSave}
            disabled={!hasUnsavedChanges || isSaving}
          ></Button>
        </div>
      </div>

      {/* Main content area */}
      <div className={styles.adminContent}>
        {/* Left sidebar - Navigation and global settings */}
        <div className={styles.sidebar}>
          {/* Global Settings Section */}
          <div
            className={`${styles.sidebarSection} ${expandedSections.has("global") ? styles.expanded : ""}`}
          >
            <button
              className={styles.sectionHeader}
              onClick={() => toggleSection("global")}
            >
              <span className={styles.sectionIcon}>⚙️</span>
              <span className={styles.sectionTitle}>
                {t("Global Settings")}
              </span>
              <span className={styles.expandIcon}>
                {expandedSections.has("global") ? "▼" : "▶"}
              </span>
            </button>

            {expandedSections.has("global") && (
              <div className={styles.sectionContent}>
                <GlobalExplanationSettings
                  settings={globalSettings}
                  onChange={handleGlobalSettingsChange}
                />
              </div>
            )}
          </div>

          {/* Stage Navigation */}
          <div
            className={`${styles.sidebarSection} ${expandedSections.has("stages") ? styles.expanded : ""}`}
          >
            <button
              className={styles.sectionHeader}
              onClick={() => toggleSection("stages")}
            >
              <span className={styles.sectionIcon}>📝</span>
              <span className={styles.sectionTitle}>{t("Process Stages")}</span>
              <span className={styles.expandIcon}>
                {expandedSections.has("stages") ? "▼" : "▶"}
              </span>
            </button>

            {expandedSections.has("stages") && (
              <div className={styles.stagesList}>
                {MASS_CONSENSUS_STAGES.map((stage) => {
                  const config = stageConfigurations.find(
                    (s) => s.id === stage.id
                  );

                  return (
                    <button
                      key={stage.id}
                      className={`${styles.stageItem} ${activeStageId === stage.id ? styles.active : ""}`}
                      onClick={() => setActiveStageId(stage.id)}
                    >
                      <span className={styles.stageIcon}>{stage.icon}</span>
                      <span className={styles.stageLabel}>
                        {t(stage.label)}
                      </span>
                      <span
                        className={`${styles.stageStatus} ${config?.enabled ? styles.enabled : styles.disabled}`}
                      >
                        {config?.enabled ? "✓" : "–"}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Management Tools */}
          <div className={styles.sidebarSection}>
            <ManagementControls
              onReset={handleResetToDefaults}
              onExport={exportConfigurations}
              onImport={async () => {
                const input = document.createElement("input");
                input.type = "file";
                input.accept = ".json";
                input.onchange = async (e: Event) => {
                  const target = e.target as HTMLInputElement; 
                  const file = target.files?.[0];
                  if (file) {
                    try {
                      await importConfigurations(file);
                      setHasUnsavedChanges(true);
                    } catch (err) {
                      console.error("Import failed:", err);
                    }
                  }
                };
                input.click();
              }}
              onBulkToggle={(enabled) => {
                setStageConfigurations((prev) =>
                  prev.map((stage) => ({ ...stage, enabled }))
                );
                setHasUnsavedChanges(true);
              }}
            />
          </div>
        </div>

        {/* Main editor area */}
        <div className={styles.mainEditor}>
          {isPreviewMode ? (
            <PreviewPanel
              stageConfig={activeStageConfig}
              stageInfo={activeStageInfo}
              globalSettings={globalSettings}
            />
          ) : (
            activeStageConfig &&
            activeStageInfo && (
              <StageExplanationEditor
                stageId={activeStageId}
                stageInfo={activeStageInfo}
                config={activeStageConfig}
                globalSettings={globalSettings}
                language={currentLanguage}
                onChange={(updates) =>
                  handleStageConfigChange(activeStageId, updates)
                }
              />
            )
          )}
        </div>

        {/* Right panel - Help and tips */}
        <div className={styles.helpPanel}>
          <div className={styles.helpContent}>
            <h3>{t("Tips")}</h3>
            <ul className={styles.tipsList}>
              <li>{t("Keep explanations concise and clear")}</li>
              <li>
                {t(
                  "Use variables like {{participantCount}} for dynamic content"
                )}
              </li>
              <li>
                {t("Test different display modes to find what works best")}
              </li>
              <li>{t("Consider mobile users when writing text")}</li>
              <li>
                {t('Use "Show only first time" for introductory content')}
              </li>
            </ul>

            <h3>{t("Available Variables")}</h3>
            <div className={styles.variablesList}>
              <code>{"{{participantCount}}"}</code>
              <code>{"{{votesNeeded}}"}</code>
              <code>{"{{timeRemaining}}"}</code>
              <code>{"{{currentStage}}"}</code>
              <code>{"{{totalStages}}"}</code>
            </div>
          </div>
        </div>
      </div>

      {/* Status bar */}
      <div className={styles.statusBar}>
        <div className={styles.statusInfo}>
          <span>
            {t("Editing")}: {activeStageInfo?.label}
          </span>
          <span className={styles.separator}>•</span>
          <span>
            {t("Language")}: {currentLanguage}
          </span>
          <span className={styles.separator}>•</span>
          <span>
            {stageConfigurations.filter((s) => s.enabled).length} /{" "}
            {MASS_CONSENSUS_STAGES.length} {t("stages enabled")}
          </span>
        </div>
      </div>
    </div>
  );
};

export default ExplanationsAdmin;
