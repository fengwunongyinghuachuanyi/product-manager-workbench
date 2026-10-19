import { describe, expect, it } from 'vitest';
import i18next from 'i18next';
import { readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import zh from '@/renderer/services/i18n/locales/zh-CN/settings.json';
import en from '@/renderer/services/i18n/locales/en-US/settings.json';
import {
  getOfficialSkillDescription,
  OFFICIAL_DESCRIPTION_KEYS,
} from '@/renderer/pages/settings/SkillsSettings/skillDescriptions';

async function translator(language = 'zh-CN') {
  const instance = i18next.createInstance();
  await instance.init({
    lng: language,
    fallbackLng: 'en-US',
    resources: {
      'zh-CN': { translation: { settings: zh } },
      'en-US': { translation: { settings: en } },
    },
  });
  return instance.t;
}

describe('official skill description translations', () => {
  it('covers all 27 bundled skills including auto-injected ones', () => {
    const root = path.resolve('../AionCore/crates/aionui-app/assets/builtin-skills');
    const names = readdirSync(root).filter((name) => existsSync(path.join(root, name, 'SKILL.md')));
    names.push(
      ...readdirSync(path.join(root, 'auto-inject')).filter((name) =>
        existsSync(path.join(root, 'auto-inject', name, 'SKILL.md'))
      )
    );
    expect(names).toHaveLength(27);
    expect(Object.keys(OFFICIAL_DESCRIPTION_KEYS).sort()).toEqual(names.sort());
  });

  it('provides readable Chinese for every official introduction', async () => {
    const t = await translator();
    for (const name of Object.keys(OFFICIAL_DESCRIPTION_KEYS)) {
      const text = getOfficialSkillDescription({ name, description: 'Original English', source: 'builtin' }, t);
      expect(text, name).toMatch(/[\u4e00-\u9fff]/);
      expect(text, name).not.toContain('settings.skillsHub.officialDescriptions');
    }
  });

  it('keeps imported skills with an official name unchanged', async () => {
    const t = await translator();
    expect(getOfficialSkillDescription({ name: 'cron', description: 'My own task rules', source: 'custom' }, t)).toBe(
      'My own task rules'
    );
  });

  it.each(['new-upstream-skill', 'constructor', '__proto__'])('keeps unknown skill %s intact', async (name) => {
    const t = await translator();
    expect(getOfficialSkillDescription({ name, description: 'Original fallback', source: 'builtin' }, t)).toBe(
      'Original fallback'
    );
  });

  it('preserves English descriptions when the interface uses English', async () => {
    const t = await translator('en-US');
    expect(getOfficialSkillDescription({ name: 'cron', description: 'fallback', source: 'builtin' }, t)).toContain(
      'Scheduled task management'
    );
  });
});
