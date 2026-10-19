/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AboutModalContent from '@/renderer/components/settings/SettingsModal/contents/AboutModalContent';
import FeedbackButton from '@/renderer/components/base/FeedbackButton';
import { APP_DISPLAY_NAME } from '@/common/branding';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: () => '集中管理你的 AI 对话、项目文件与自动化任务。' }),
}));

beforeEach(() => vi.stubGlobal('__APP_VERSION__', '2.2.2'));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('personal workbench About page', () => {
  it('keeps the application name and local version', () => {
    render(<AboutModalContent />);
    expect(screen.getByRole('heading', { name: APP_DISPLAY_NAME })).toBeTruthy();
    expect(screen.getByText('v2.2.2')).toBeTruthy();
  });

  it('has no original-author contact, promotion or update actions', () => {
    const { container } = render(<AboutModalContent />);
    expect(container.querySelectorAll('a, button')).toHaveLength(0);
    expect(container.textContent).not.toMatch(/Aion|Waili|周承健|iOfficeAI|github|官网|联系我|反馈|更新日志/i);
  });

  it('does not expose the original feedback service on error surfaces', () => {
    const { container } = render(<FeedbackButton module='conversation-session' />);
    expect(container.querySelector('button')).toBeNull();
  });
});
