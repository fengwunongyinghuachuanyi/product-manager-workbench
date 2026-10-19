/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Button, Message, Radio, Switch, Tag } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';
import { systemSettings } from '@/common/adapter/ipcBridge';
import { configService } from '@/common/config/configService';
import { isElectronDesktop } from '@/renderer/utils/platform';
import SettingsPageWrapper from './components/SettingsPageWrapper';
import PreferenceRow from '@/renderer/components/settings/SettingsModal/contents/SystemModalContent/PreferenceRow';
import AionScrollArea from '@/renderer/components/base/AionScrollArea';
import { useSettingsViewMode } from '@/renderer/components/settings/SettingsModal/settingsViewContext';
import type { PetRuntimeStatus } from '@/common/types/platform/pet';

const PetSettings: React.FC = () => {
  const [enabled, setEnabled] = useState(false);
  const [enabledResolved, setEnabledResolved] = useState(false);
  const [size, setSize] = useState(280);
  const [dnd, setDnd] = useState(false);
  const [confirmEnabled, setConfirmEnabled] = useState(true);
  const [runtime, setRuntime] = useState<PetRuntimeStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const { t } = useTranslation();
  const viewMode = useSettingsViewMode();
  const isPageMode = viewMode === 'page';
  const isDesktop = isElectronDesktop();

  const refreshRuntime = useCallback(async () => {
    try {
      setRuntime(await systemSettings.getPetStatus.invoke());
    } catch {
      setRuntime(null);
    }
  }, []);

  useEffect(() => {
    if (!isDesktop) return;
    let active = true;
    const refresh = async (): Promise<void> => {
      try {
        const status = await systemSettings.getPetStatus.invoke();
        if (active) setRuntime(status);
      } catch {
        /* Do not infer that a missing runtime is running. */
      }
    };
    void refresh();
    const timer = setInterval(() => {
      void refresh();
    }, 3000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [isDesktop]);

  useEffect(() => {
    let active = true;
    setSize(configService.get('pet.size') ?? 280);
    setDnd(configService.get('pet.dnd') ?? false);
    setConfirmEnabled(configService.get('pet.confirmEnabled') ?? true);
    void Promise.all([
      systemSettings.getPetSize.invoke(),
      systemSettings.getPetDnd.invoke(),
      systemSettings.getPetConfirmEnabled.invoke(),
    ])
      .then(([savedSize, savedDnd, savedConfirm]) => {
        if (!active) return;
        setSize(savedSize);
        setDnd(savedDnd);
        setConfirmEnabled(savedConfirm);
      })
      .catch(() => {
        /* Retain cached preferences if IPC is unavailable. */
      });
    systemSettings.getPetEnabled
      .invoke()
      .then((value) => {
        if (!active) return;
        setEnabled(value);
        setEnabledResolved(true);
      })
      .catch(() => {
        // IPC failure: fall back to the locked default (OFF); never fall back to ON,
        // which would reintroduce the "UI lies" state this fix eliminates.
        if (!active) return;
        setEnabled(false);
        setEnabledResolved(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const handleEnabledChange = useCallback(
    async (checked: boolean) => {
      setBusy(true);
      try {
        await systemSettings.setPetEnabled.invoke({ enabled: checked });
        setEnabled(checked);
        configService.setLocal('pet.enabled', checked);
      } catch {
        Message.error(t('pet.actionFailed'));
      } finally {
        await refreshRuntime();
        setBusy(false);
      }
    },
    [refreshRuntime, t]
  );

  const handleSizeChange = useCallback(
    async (val: number) => {
      const prevSize = size;
      setBusy(true);
      setSize(val);
      configService.setLocal('pet.size', val);
      try {
        await systemSettings.setPetSize.invoke({ size: val });
      } catch {
        setSize(prevSize);
        configService.setLocal('pet.size', prevSize);
        Message.error(t('pet.actionFailed'));
      } finally {
        await refreshRuntime();
        setBusy(false);
      }
    },
    [size, refreshRuntime, t]
  );

  const handleDndChange = useCallback((checked: boolean) => {
    setDnd(checked);
    configService.setLocal('pet.dnd', checked);
    systemSettings.setPetDnd.invoke({ dnd: checked }).catch(() => {
      setDnd(!checked);
      configService.setLocal('pet.dnd', !checked);
    });
  }, []);

  const handleConfirmEnabledChange = useCallback((checked: boolean) => {
    setConfirmEnabled(checked);
    configService.setLocal('pet.confirmEnabled', checked);
    systemSettings.setPetConfirmEnabled.invoke({ enabled: checked }).catch(() => {
      setConfirmEnabled(!checked);
      configService.setLocal('pet.confirmEnabled', !checked);
    });
  }, []);

  if (!isDesktop) {
    return (
      <SettingsPageWrapper>
        <AionScrollArea className='flex-1 min-h-0 pb-16px' disableOverflow={isPageMode}>
          <div className='space-y-16px'>
            <div className='px-[12px] md:px-[32px] py-16px bg-2 rd-16px'>
              <p className='m-0 text-13px text-t-secondary'>{t('pet.desktopOnly')}</p>
            </div>
          </div>
        </AionScrollArea>
      </SettingsPageWrapper>
    );
  }

  const preferenceItems = [
    {
      key: 'enabled',
      label: t('pet.enable'),
      component: (
        <Switch
          checked={enabled}
          loading={!enabledResolved || busy}
          disabled={!enabledResolved || busy || (!enabled && runtime?.available === false)}
          onChange={handleEnabledChange}
        />
      ),
    },
    {
      key: 'size',
      label: t('pet.size'),
      component: (
        <Radio.Group value={size} onChange={handleSizeChange} disabled={!enabled || busy}>
          <Radio value={120}>{t('pet.sizeMini', { px: 120 })}</Radio>
          <Radio value={200}>{t('pet.sizeSmall', { px: 200 })}</Radio>
          <Radio value={280}>{t('pet.sizeMedium', { px: 280 })}</Radio>
          <Radio value={360}>{t('pet.sizeLarge', { px: 360 })}</Radio>
        </Radio.Group>
      ),
    },
    {
      key: 'dnd',
      label: t('pet.dnd'),
      description: t('pet.dndDescription'),
      component: <Switch checked={dnd} onChange={handleDndChange} disabled={!enabled || busy} />,
    },
    {
      key: 'confirmBubble',
      label: t('pet.confirmBubble'),
      description: t('pet.confirmBubbleDescription'),
      component: <Switch checked={confirmEnabled} onChange={handleConfirmEnabledChange} disabled={!enabled} />,
    },
  ];

  return (
    <SettingsPageWrapper>
      <AionScrollArea className='flex-1 min-h-0 pb-16px' disableOverflow={isPageMode}>
        <div className='space-y-16px'>
          {runtime?.engine === 'openpets' && (
            <div className='px-[12px] md:px-[32px] py-16px bg-2 rd-16px space-y-12px'>
              <div className='flex items-center gap-12px'>
                <span className='text-18px font-semibold'>{t('pet.openPetsTitle')}</span>
                <Tag>{runtime.running ? t('pet.running') : t('pet.stopped')}</Tag>
              </div>
              <p className='m-0 text-13px text-t-secondary'>{t('pet.openPetsDescription')}</p>
              <p className='m-0 text-13px text-t-secondary'>{t('pet.openPetsPermissions')}</p>
              {(!runtime.available || runtime.error) && (
                <p className='m-0 text-13px text-t-secondary'>{t('pet.runtimeUnavailable')}</p>
              )}
              <Button
                disabled={!runtime.running || busy}
                onClick={() => {
                  void systemSettings.previewPet.invoke().catch(() => Message.error(t('pet.actionFailed')));
                }}
              >
                {t('pet.sayHello')}
              </Button>
            </div>
          )}
          <div className='px-[12px] md:px-[32px] py-16px bg-2 rd-16px space-y-12px'>
            <div className='w-full flex flex-col divide-y divide-border-2'>
              {preferenceItems
                .filter((item) => item.key !== 'confirmBubble' || runtime?.engine !== 'openpets')
                .map((item) => (
                  <PreferenceRow key={item.key} label={item.label} description={item.description}>
                    {item.component}
                  </PreferenceRow>
                ))}
            </div>
          </div>
        </div>
      </AionScrollArea>
    </SettingsPageWrapper>
  );
};

export default PetSettings;
