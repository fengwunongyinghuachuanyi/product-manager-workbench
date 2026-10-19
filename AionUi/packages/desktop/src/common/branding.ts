/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/** The customer-facing name shown throughout the desktop app and WebUI. */
export const APP_DISPLAY_NAME = '产品经理工作台';

/** Compact mark used where the full product name does not fit. */
export const APP_MONOGRAM = 'AI';

/** Display name for the built-in assistant while retaining its compatibility id. */
export const BUTLER_DISPLAY_NAME = '产品经理助手';

/** Custom builds must not replace themselves with an upstream release. */
export const UPSTREAM_UPDATE_ENABLED = false;

/** Personal builds do not expose the original project's feedback service. */
export const UPSTREAM_SUPPORT_ENABLED = false;

/** Neutral logo for the built-in runtime and helper, replacing upstream artwork. */
export const AI_AGENT_LOGO = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><rect width="48" height="48" rx="12" fill="#111"/><text x="24" y="31" text-anchor="middle" fill="white" font-family="Arial,sans-serif" font-weight="700" font-size="23">AI</text></svg>')}`;

const UPSTREAM_BRAND_PATTERN =
  /https?:\/\/[^\s"'<>]+|`[^`]+`|(?:~\/|\/(?:[\w.-]+\/)+)[^\s"'<>]*|(?<![\w-])aion\s?ui\s*(?:管家|butler)(?![\w-])|(?<![\w-])aion\s?cli(?![\w-])|(?<![\w-])aion(?:\s?(?:ui|core|rs|hub|pro))?(?![\w-])/gi;
const UPSTREAM_BUTLER_PATTERN = /^(?:Aion UI|AionUI|AionUi)\s*(?:管家|Butler)$/i;

/**
 * Replace upstream display brands with AI, preserving links, paths and code.
 * Compatibility identifiers such as `aionui-browser` remain unchanged.
 */
export function replaceUpstreamBrand(text: string): string {
  return text.replace(UPSTREAM_BRAND_PATTERN, (match) => {
    if (/^(?:https?:\/\/|`|~\/|\/)/i.test(match)) return match;
    if (UPSTREAM_BUTLER_PATTERN.test(match)) return BUTLER_DISPLAY_NAME;
    return /^aion\s?cli$/i.test(match) ? 'AI CLI' : 'AI';
  });
}

type DisplayMetadata = {
  name: string;
  name_i18n?: Record<string, string>;
  description?: string;
  description_i18n?: Record<string, string>;
};

/** Brand display metadata without changing IDs, commands, rules or settings. */
export function brandDisplayMetadata<T extends DisplayMetadata>(value: T): T {
  const localize = (labels: Record<string, string>) =>
    Object.fromEntries(Object.entries(labels).map(([locale, label]) => [locale, replaceUpstreamBrand(label)]));
  const isBuiltinBrand =
    /^aion\s?cli$/i.test(value.name) ||
    ('id' in value && value.id === 'aionui-assistant') ||
    ('agent_type' in value && value.agent_type === 'aionrs');
  return {
    ...value,
    ...(isBuiltinBrand ? { avatar: AI_AGENT_LOGO, icon: AI_AGENT_LOGO } : {}),
    name: replaceUpstreamBrand(value.name),
    ...(value.name_i18n ? { name_i18n: localize(value.name_i18n) } : {}),
    ...(value.description !== undefined ? { description: replaceUpstreamBrand(value.description) } : {}),
    ...(value.description_i18n ? { description_i18n: localize(value.description_i18n) } : {}),
  };
}

/** Apply the display brand to an imported i18n resource tree. */
const UPSTREAM_ATTRIBUTION_PATHS = new Set([
  'settings.officialAssistantsHint',
  'settings.officialAssistantsHintShort',
  'settings.skillsHub.officialHint',
]);

const shouldPreserveUpstreamAttribution = (path: readonly string[]): boolean => {
  const resourcePath = path.slice(1).join('.');
  return (
    resourcePath === 'update' || resourcePath.startsWith('update.') || UPSTREAM_ATTRIBUTION_PATHS.has(resourcePath)
  );
};

const brandLocaleValue = <T>(value: T, path: readonly string[]): T => {
  if (typeof value === 'string') {
    return (shouldPreserveUpstreamAttribution(path) ? value : replaceUpstreamBrand(value)) as T;
  }

  if (Array.isArray(value)) {
    return value.map((item) => brandLocaleValue(item, path)) as T;
  }

  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, brandLocaleValue(item, [...path, key])])
    ) as T;
  }

  return value;
};

export function brandLocaleResource<T>(value: T): T {
  return brandLocaleValue(value, []);
}
