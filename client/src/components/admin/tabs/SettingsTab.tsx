import React, { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { adminApi } from '../../../utils/api/admin';
import { useToast } from '../../../hooks/useToast';

type ToggleValue = 'ON' | 'OFF';
type RegistrationMode = 'OPEN' | 'APPROVAL' | 'CLOSED';

export const SettingsTab: React.FC = () => {
  const { addToast } = useToast();
  const [dirty, setDirty] = useState(false);
  const [formState, setFormState] = useState<any>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['admin', 'settings'],
    queryFn: () => adminApi.getSettings(),
  });

  const settingsMap = useMemo(() => {
    if (!data?.settings) {
      return {};
    }
    return Object.fromEntries(
      data.settings.map((setting: any) => [setting.key, setting.value])
    );
  }, [data]);

  React.useEffect(() => {
    if (!data || formState) {
      return;
    }

    const initialFeatureFlags: Record<string, boolean> = {};
    (data.featureFlags || []).forEach((flag: any) => {
      initialFeatureFlags[flag.key] = !!flag.enabled;
    });

    setFormState({
      registrationMode: (settingsMap['registration.mode'] || 'OPEN') as RegistrationMode,
      communityMode: (settingsMap['community.mode'] || 'OFF') as ToggleValue,
      maintenanceMode: (settingsMap['maintenance.mode'] || 'OFF') as ToggleValue,
      lockoutMaxAttempts: Number(settingsMap['security.lockout.max_attempts'] || 5),
      lockoutDurationMinutes: Number(
        settingsMap['security.lockout.duration_minutes'] || 15
      ),
      rateLimitWindowMs: Number(settingsMap['security.rate_limit.window_ms'] || 60000),
      authRateLimit: Number(settingsMap['security.rate_limit.auth_max'] || 20),
      publicRateLimit: Number(settingsMap['security.rate_limit.public_max'] || 120),
      generalRateLimit: Number(settingsMap['security.rate_limit.general_max'] || 300),
      featureFlags: initialFeatureFlags,
    });
  }, [data, settingsMap, formState]);

  const updateMutation = useMutation({
    mutationFn: (payload: any) => adminApi.updateSettings(payload),
    onSuccess: async () => {
      setDirty(false);
      addToast('Settings updated successfully', 'success');
      await refetch();
    },
    onError: (error: any) => {
      addToast(error?.message || 'Failed to update settings', 'error');
    },
  });

  const onFieldChange = (key: string, value: any) => {
    setFormState((prev: any) => ({ ...prev, [key]: value }));
    setDirty(true);
  };

  const onFlagChange = (key: string, value: boolean) => {
    setFormState((prev: any) => ({
      ...prev,
      featureFlags: {
        ...(prev?.featureFlags || {}),
        [key]: value,
      },
    }));
    setDirty(true);
  };

  if (isLoading || !formState) {
    return (
      <div className="text-light-text-secondary dark:text-dark-text-secondary">
        Loading settings...
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="bg-light-bg dark:bg-dark-bg border border-light-border dark:border-dark-border rounded-lg p-4 space-y-4">
        <h3 className="text-lg font-semibold">System Modes</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <label className="flex flex-col gap-2">
            <span className="text-sm">Registration Mode</span>
            <select
              value={formState.registrationMode}
              onChange={(e) =>
                onFieldChange('registrationMode', e.target.value as RegistrationMode)
              }
              className="px-3 py-2 rounded-md bg-light-surface dark:bg-dark-surface border border-light-border dark:border-dark-border"
            >
              <option value="OPEN">OPEN</option>
              <option value="APPROVAL">APPROVAL</option>
              <option value="CLOSED">CLOSED</option>
            </select>
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-sm">Community Mode</span>
            <select
              value={formState.communityMode}
              onChange={(e) => onFieldChange('communityMode', e.target.value as ToggleValue)}
              className="px-3 py-2 rounded-md bg-light-surface dark:bg-dark-surface border border-light-border dark:border-dark-border"
            >
              <option value="ON">ON</option>
              <option value="OFF">OFF</option>
            </select>
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-sm">Maintenance Mode</span>
            <select
              value={formState.maintenanceMode}
              onChange={(e) => onFieldChange('maintenanceMode', e.target.value as ToggleValue)}
              className="px-3 py-2 rounded-md bg-light-surface dark:bg-dark-surface border border-light-border dark:border-dark-border"
            >
              <option value="ON">ON</option>
              <option value="OFF">OFF</option>
            </select>
          </label>
        </div>
      </div>

      <div className="bg-light-bg dark:bg-dark-bg border border-light-border dark:border-dark-border rounded-lg p-4 space-y-4">
        <h3 className="text-lg font-semibold">Security Controls</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="flex flex-col gap-2">
            <span className="text-sm">Lockout max attempts</span>
            <input
              type="number"
              min={1}
              value={formState.lockoutMaxAttempts}
              onChange={(e) => onFieldChange('lockoutMaxAttempts', Number(e.target.value))}
              className="px-3 py-2 rounded-md bg-light-surface dark:bg-dark-surface border border-light-border dark:border-dark-border"
            />
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-sm">Lockout duration (minutes)</span>
            <input
              type="number"
              min={1}
              value={formState.lockoutDurationMinutes}
              onChange={(e) => onFieldChange('lockoutDurationMinutes', Number(e.target.value))}
              className="px-3 py-2 rounded-md bg-light-surface dark:bg-dark-surface border border-light-border dark:border-dark-border"
            />
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-sm">Rate limit window (ms)</span>
            <input
              type="number"
              min={1000}
              step={1000}
              value={formState.rateLimitWindowMs}
              onChange={(e) => onFieldChange('rateLimitWindowMs', Number(e.target.value))}
              className="px-3 py-2 rounded-md bg-light-surface dark:bg-dark-surface border border-light-border dark:border-dark-border"
            />
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-sm">Auth requests / window</span>
            <input
              type="number"
              min={1}
              value={formState.authRateLimit}
              onChange={(e) => onFieldChange('authRateLimit', Number(e.target.value))}
              className="px-3 py-2 rounded-md bg-light-surface dark:bg-dark-surface border border-light-border dark:border-dark-border"
            />
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-sm">Public requests / window</span>
            <input
              type="number"
              min={1}
              value={formState.publicRateLimit}
              onChange={(e) => onFieldChange('publicRateLimit', Number(e.target.value))}
              className="px-3 py-2 rounded-md bg-light-surface dark:bg-dark-surface border border-light-border dark:border-dark-border"
            />
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-sm">General requests / window</span>
            <input
              type="number"
              min={1}
              value={formState.generalRateLimit}
              onChange={(e) => onFieldChange('generalRateLimit', Number(e.target.value))}
              className="px-3 py-2 rounded-md bg-light-surface dark:bg-dark-surface border border-light-border dark:border-dark-border"
            />
          </label>
        </div>
      </div>

      <div className="bg-light-bg dark:bg-dark-bg border border-light-border dark:border-dark-border rounded-lg p-4 space-y-4">
        <h3 className="text-lg font-semibold">Feature Flags</h3>
        <div className="space-y-2">
          {(data.featureFlags || []).map((flag: any) => (
            <label
              key={flag.key}
              className="flex items-start justify-between gap-4 border border-light-border dark:border-dark-border rounded-md p-3"
            >
              <div>
                <p className="font-medium">{flag.key}</p>
                <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary">
                  {flag.description || 'No description'}
                </p>
              </div>
              <input
                type="checkbox"
                checked={!!formState.featureFlags?.[flag.key]}
                onChange={(e) => onFlagChange(flag.key, e.target.checked)}
                className="mt-1"
              />
            </label>
          ))}
        </div>
      </div>

      <div className="flex justify-end">
        <button
          onClick={() => updateMutation.mutate(formState)}
          disabled={!dirty || updateMutation.isPending}
          className="px-4 py-2 rounded-md bg-light-primary dark:bg-dark-primary text-white disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {updateMutation.isPending ? 'Saving...' : 'Save Settings'}
        </button>
      </div>
    </div>
  );
};
