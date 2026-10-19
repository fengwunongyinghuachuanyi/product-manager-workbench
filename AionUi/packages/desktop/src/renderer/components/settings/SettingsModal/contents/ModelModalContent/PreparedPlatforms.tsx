import React, { useId, useState } from 'react';
import { Button, Input, Tag } from '@arco-design/web-react';
import { Down, Right } from '@icon-park/react';
import { useTranslation } from 'react-i18next';
import type { IProvider } from '@/common/config/storage';
import { MODEL_PLATFORMS, type PlatformConfig } from '@/renderer/utils/model/modelPlatforms';

type Props = {
  providers: IProvider[];
  onConfigure: (platform: PlatformConfig) => void;
};

/** Local setup templates contain no credentials and never register active providers. */
export default function PreparedPlatforms({ providers, onConfigure }: Props): React.ReactElement {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState(false);
  const panelId = useId();
  const prepared = MODEL_PLATFORMS.filter(
    (platform) => platform.value !== 'custom' && !providers.some((provider) => provider.name === platform.name)
  );
  const visible = prepared.filter((platform) =>
    `${platform.name} ${platform.value} ${platform.base_url ?? ''}`.toLowerCase().includes(query.trim().toLowerCase())
  );
  return (
    <section className='border border-solid border-b-base rd-12px p-12px bg-2'>
      <Button
        type='text'
        long
        className='!justify-between !px-4px !text-t-primary'
        aria-expanded={expanded}
        aria-controls={panelId}
        onClick={() => setExpanded((value) => !value)}
      >
        <strong className='text-16px'>{t('settings.preparedPlatforms.title', { count: prepared.length })}</strong>
        {expanded ? <Down size={16} aria-hidden /> : <Right size={16} aria-hidden />}
      </Button>
      {expanded && (
        <div id={panelId} className='pt-12px'>
          <div className='flex items-center justify-end mb-8px'>
            <Input.Search
              aria-label={t('settings.preparedPlatforms.search')}
              placeholder={t('settings.preparedPlatforms.search')}
              value={query}
              onChange={setQuery}
              allowClear
              className='!w-220px'
            />
          </div>
          <p className='text-12px text-t-secondary leading-5 mb-12px'>{t('settings.preparedPlatforms.description')}</p>
          <div className='max-h-320px overflow-y-auto space-y-8px'>
            {visible.map((platform) => (
              <div
                key={platform.value}
                className='flex items-center justify-between gap-12px border-b border-solid border-b-base py-10px'
              >
                <div className='min-w-0'>
                  <div className='flex flex-wrap items-center gap-8px'>
                    <span className='text-14px text-t-primary'>{platform.name}</span>
                    <Tag>{t('settings.preparedPlatforms.pending')}</Tag>
                  </div>
                  <div className='text-12px text-t-secondary break-all mt-4px'>
                    {platform.base_url ||
                      t(
                        platform.platform === 'bedrock'
                          ? 'settings.preparedPlatforms.awsHint'
                          : 'settings.preparedPlatforms.endpointHint'
                      )}
                  </div>
                </div>
                <Button
                  size='small'
                  aria-label={t('settings.preparedPlatforms.configureNamed', { name: platform.name })}
                  onClick={() => onConfigure(platform)}
                >
                  {t('settings.preparedPlatforms.configure')}
                </Button>
              </div>
            ))}
            {visible.length === 0 && (
              <p className='text-12px text-t-secondary'>{t('settings.preparedPlatforms.noMatch')}</p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
