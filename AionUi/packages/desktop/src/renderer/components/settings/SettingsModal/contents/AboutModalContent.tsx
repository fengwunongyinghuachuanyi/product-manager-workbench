/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Typography } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';
import { APP_DISPLAY_NAME, APP_MONOGRAM } from '@/common/branding';

declare const __APP_VERSION__: string;

const AboutModalContent: React.FC = () => {
  const { t } = useTranslation();
  return (
    <div className='flex flex-col items-center gap-16px py-48px px-24px text-center'>
      <div className='size-64px rd-16px bg-[var(--text-primary)] text-[var(--bg-base)] flex items-center justify-center text-24px font-bold'>
        {APP_MONOGRAM}
      </div>
      <Typography.Title heading={2} className='!m-0 text-t-primary'>
        {APP_DISPLAY_NAME}
      </Typography.Title>
      <Typography.Paragraph className='!m-0 text-t-secondary'>{t('settings.appDescription')}</Typography.Paragraph>
      <span className='px-10px py-4px rd-6px text-13px bg-fill-2 text-t-secondary'>v{__APP_VERSION__}</span>
    </div>
  );
};

export default AboutModalContent;
