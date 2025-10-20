import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router';
import { ExplanationConfig, PostActionConfig } from 'delib-npm';

interface StageConfiguration {
  id: string;
  enabled: boolean;
  beforeStage?: ExplanationConfig;
  afterAction?: PostActionConfig;
}

interface UseExplanationConfigReturn {
  configurations: StageConfiguration[];
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;
  saveConfigurations: (configs: StageConfiguration[]) => Promise<void>;
  exportConfigurations: () => void;
  importConfigurations: (file: File) => Promise<void>;
}

/**
 * Custom hook for managing Mass Consensus explanation configurations
 * Handles loading, saving, and import/export of stage explanations
 */
export const useExplanationConfig = (): UseExplanationConfigReturn => {
  const { statementId } = useParams<{ statementId: string }>();
  const [configurations, setConfigurations] = useState<StageConfiguration[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load configurations from database
  useEffect(() => {
    const loadConfigurations = async () => {
      if (!statementId) return;

      try {
        setIsLoading(true);
        setError(null);

        // TODO: Replace with actual API call
        // const response = await getExplanationConfigs(statementId);

        // For now, return default configurations
        const defaultConfigs: StageConfiguration[] = [
          {
            id: 'introduction',
            enabled: true,
            beforeStage: {
              enabled: true,
              content: 'Welcome to the Mass Consensus process. We will guide you through several stages to reach a collective decision.',
              displayMode: 'card',
              dismissible: true,
              showOnlyFirstTime: true
            }
          },
          {
            id: 'question',
            enabled: true,
            beforeStage: {
              enabled: true,
              content: 'Please read the question carefully and provide your thoughtful response.',
              displayMode: 'inline',
              dismissible: true
            },
            afterAction: {
              content: '',
              successMessage: 'Thank you for your response!',
              autoAdvance: { enabled: true, delay: 2000 }
            }
          },
          {
            id: 'randomSuggestions',
            enabled: true,
            beforeStage: {
              enabled: true,
              content: 'You will now see random suggestions from other participants. Please vote on each one.',
              displayMode: 'tooltip',
              dismissible: true,
              showOnlyFirstTime: true
            }
          },
          {
            id: 'topSuggestions',
            enabled: true,
            beforeStage: {
              enabled: true,
              content: 'These are the top-rated suggestions. Review them carefully.',
              displayMode: 'card',
              dismissible: true
            }
          },
          {
            id: 'voting',
            enabled: true,
            beforeStage: {
              enabled: true,
              content: 'Cast your final vote for the option you believe is best.',
              displayMode: 'modal',
              dismissible: false
            },
            afterAction: {
              content: '',
              successMessage: 'Your vote has been recorded!',
              autoAdvance: { enabled: true, delay: 3000 }
            }
          },
          {
            id: 'results',
            enabled: true,
            beforeStage: {
              enabled: true,
              content: 'Here are the final results of the Mass Consensus process.',
              displayMode: 'banner',
              dismissible: true
            }
          },
          {
            id: 'completion',
            enabled: true,
            beforeStage: {
              enabled: true,
              content: 'Thank you for participating! Your contribution helps us make better collective decisions.',
              displayMode: 'card',
              dismissible: true
            }
          }
        ];

        setConfigurations(defaultConfigs);
      } catch (err) {
        console.error('Error loading configurations:', err);
        setError('Failed to load explanation configurations');
      } finally {
        setIsLoading(false);
      }
    };

    loadConfigurations();
  }, [statementId]);

  // Save configurations to database
  const saveConfigurations = useCallback(async (configs: StageConfiguration[]) => {
    if (!statementId) return;

    try {
      setIsSaving(true);
      setError(null);

      // TODO: Replace with actual API call
      // await updateExplanationConfigs(statementId, configs);

      // For now, just update local state
      setConfigurations(configs);

      // Simulate API delay
      await new Promise(resolve => setTimeout(resolve, 1000));

      console.info('Configurations saved successfully');
    } catch (err) {
      console.error('Error saving configurations:', err);
      setError('Failed to save explanation configurations');
      throw err;
    } finally {
      setIsSaving(false);
    }
  }, [statementId]);

  // Export configurations to JSON file
  const exportConfigurations = useCallback(() => {
    try {
      const exportData = {
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        statementId,
        configurations
      };

      const blob = new Blob([JSON.stringify(exportData, null, 2)], {
        type: 'application/json'
      });

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `mass-consensus-explanations-${statementId}-${Date.now()}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      console.info('Configurations exported successfully');
    } catch (err) {
      console.error('Error exporting configurations:', err);
      setError('Failed to export configurations');
    }
  }, [statementId, configurations]);

  // Import configurations from JSON file
  const importConfigurations = useCallback(async (file: File) => {
    try {
      const text = await file.text();
      const data = JSON.parse(text);

      // Validate imported data
      if (!data.version || !data.configurations) {
        throw new Error('Invalid configuration file format');
      }

      // Validate each configuration
      const validConfigs = data.configurations.filter((config: any) => {
        return config.id && typeof config.enabled === 'boolean';
      });

      if (validConfigs.length === 0) {
        throw new Error('No valid configurations found in file');
      }

      setConfigurations(validConfigs);
      console.info('Configurations imported successfully');
    } catch (err) {
      console.error('Error importing configurations:', err);
      setError('Failed to import configurations. Please check the file format.');
      throw err;
    }
  }, []);

  return {
    configurations,
    isLoading,
    isSaving,
    error,
    saveConfigurations,
    exportConfigurations,
    importConfigurations
  };
};