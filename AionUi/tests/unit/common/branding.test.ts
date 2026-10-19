/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  APP_MONOGRAM,
  BUTLER_DISPLAY_NAME,
  UPSTREAM_UPDATE_ENABLED,
  brandLocaleResource,
  brandDisplayMetadata,
  replaceUpstreamBrand,
} from '@/common/branding';

describe('product-manager workbench branding', () => {
  it('uses the AI monogram for compact brand surfaces', () => {
    expect(APP_MONOGRAM).toBe('AI');
  });

  it('does not let the custom build install upstream releases', () => {
    expect(UPSTREAM_UPDATE_ENABLED).toBe(false);
  });

  it('replaces supported upstream display-name variants', () => {
    expect(replaceUpstreamBrand('AionUi / AionUI / Aion UI')).toBe('AI / AI / AI');
  });

  it('normalizes mixed-case brands and CLI labels', () => {
    expect(replaceUpstreamBrand('AION / aion / AionCore / AionRS / Aion CLI / AionCLI / AionHub')).toBe(
      'AI / AI / AI / AI / AI CLI / AI CLI / AI'
    );
  });

  it('keeps links, commands, paths and unrelated names usable', () => {
    const source = 'https://aionui.com/AionUi ~/.aionui /opt/AionCore/bin aionui-browser AIONUI_BACKEND_BIN Companion';
    expect(replaceUpstreamBrand(source)).toBe(source);
  });

  it('brands fetched names and descriptions without changing executable metadata', () => {
    const source = {
      id: 'aionrs',
      name: 'Aion CLI',
      name_i18n: { 'zh-CN': 'Aion CLI' },
      description: 'Built into AionUi',
      command: 'aioncore',
      rules: 'Use aionui-browser',
    };
    const result = brandDisplayMetadata(source);
    expect([result.name, result.name_i18n?.['zh-CN'], result.description]).toEqual([
      'AI CLI',
      'AI CLI',
      'Built into AI',
    ]);
    expect([result.id, result.command, result.rules]).toEqual(['aionrs', 'aioncore', 'Use aionui-browser']);
    expect(source.name).toBe('Aion CLI');
  });

  it('uses the product-manager name for the built-in butler', () => {
    expect(replaceUpstreamBrand('AionUi管家 / AionUI Butler')).toBe(`${BUTLER_DISPLAY_NAME} / ${BUTLER_DISPLAY_NAME}`);
  });

  it('brands nested locale resources without changing their shape', () => {
    expect(
      brandLocaleResource({
        title: 'AionUi',
        notices: ['Restart AionUI', { description: 'About Aion UI' }],
      })
    ).toEqual({
      title: 'AI',
      notices: ['Restart AI', { description: 'About AI' }],
    });
  });

  it('preserves upstream links and lowercase compatibility identifiers', () => {
    const source = 'See https://github.com/iOfficeAI/AionUi and restart aionui-browser.';
    expect(replaceUpstreamBrand(source)).toBe(source);
  });

  it('preserves upstream update and official-content attribution', () => {
    const resources = brandLocaleResource({
      'zh-CN': {
        update: { migration: { signature: 'AionUi 团队' } },
        settings: {
          officialAssistantsHint: '官方助手由 AionUi 持续维护',
          skillsHub: { officialHint: 'AionUi 官方内置的技能' },
        },
      },
    });

    expect(resources['zh-CN'].update.migration.signature).toBe('AionUi 团队');
    expect(resources['zh-CN'].settings.officialAssistantsHint).toContain('AionUi');
    expect(resources['zh-CN'].settings.skillsHub.officialHint).toContain('AionUi');
  });
});
