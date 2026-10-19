import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { IProvider } from '@/common/config/storage';
import PreparedPlatforms from '@/renderer/components/settings/SettingsModal/contents/ModelModalContent/PreparedPlatforms';
import { MODEL_PLATFORMS } from '@/renderer/utils/model/modelPlatforms';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, string | number>) =>
      values?.name ? `${key} ${values.name}` : values?.count ? `${key} ${values.count}` : key,
  }),
}));

afterEach(cleanup);

function openPrepared(): void {
  fireEvent.click(screen.getByRole('button', { name: /settings.preparedPlatforms.title/ }));
}

describe('Prepared model platforms', () => {
  it('starts collapsed and supports opening and closing the template list', () => {
    render(<PreparedPlatforms providers={[]} onConfigure={vi.fn()} />);
    const toggle = screen.getByRole('button', { name: /settings.preparedPlatforms.title/ });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('textbox')).toBeNull();
    fireEvent.click(toggle);
    expect(screen.getByRole('textbox', { name: 'settings.preparedPlatforms.search' })).toBeTruthy();
    fireEvent.click(toggle);
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('shows pending templates without creating an active provider or fabricating credentials', () => {
    const configure = vi.fn();
    render(<PreparedPlatforms providers={[]} onConfigure={configure} />);
    openPrepared();
    expect(screen.getAllByRole('button', { name: /configureNamed/ })).toHaveLength(MODEL_PLATFORMS.length - 1);
    expect(configure).not.toHaveBeenCalled();
    expect(screen.queryByRole('textbox', { name: 'API Key' })).toBeNull();
  });

  it('opens the exact provider preset when selected', () => {
    const configure = vi.fn();
    render(<PreparedPlatforms providers={[]} onConfigure={configure} />);
    openPrepared();
    fireEvent.click(screen.getByRole('button', { name: 'settings.preparedPlatforms.configureNamed DeepSeek' }));
    expect(configure).toHaveBeenCalledWith(
      expect.objectContaining({ value: 'DeepSeek', base_url: 'https://api.deepseek.com/v1' })
    );
  });

  it('keeps endpoint-less presets selectable without inventing an endpoint', () => {
    const configure = vi.fn();
    render(<PreparedPlatforms providers={[]} onConfigure={configure} />);
    openPrepared();
    fireEvent.click(screen.getByRole('button', { name: 'settings.preparedPlatforms.configureNamed AWS Bedrock' }));
    expect(configure).toHaveBeenCalledWith(expect.objectContaining({ value: 'AWS-Bedrock', platform: 'bedrock' }));
    expect(configure.mock.calls[0][0].base_url).toBeUndefined();
  });

  it('filters by platform name and handles an unmatched query', () => {
    render(<PreparedPlatforms providers={[]} onConfigure={vi.fn()} />);
    openPrepared();
    const search = screen.getByRole('textbox', { name: 'settings.preparedPlatforms.search' });
    fireEvent.change(search, { target: { value: 'DeepSeek' } });
    expect(screen.getAllByRole('button', { name: /configureNamed/ })).toHaveLength(1);
    fireEvent.change(search, { target: { value: 'no-such-provider-123' } });
    expect(screen.queryByRole('button', { name: /configureNamed/ })).toBeNull();
    expect(screen.getByText('settings.preparedPlatforms.noMatch')).toBeTruthy();
  });

  it('removes a configured preset from the pending list', () => {
    const provider = { name: 'DeepSeek' } as IProvider;
    render(<PreparedPlatforms providers={[provider]} onConfigure={vi.fn()} />);
    openPrepared();
    expect(screen.queryByRole('button', { name: 'settings.preparedPlatforms.configureNamed DeepSeek' })).toBeNull();
    expect(screen.getByRole('button', { name: 'settings.preparedPlatforms.configureNamed OpenAI' })).toBeTruthy();
  });
});
