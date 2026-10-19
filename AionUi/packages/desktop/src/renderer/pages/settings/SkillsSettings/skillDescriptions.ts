import type { TFunction } from 'i18next';

type SkillDescription = { name: string; description: string; source?: string };

/** Display-only translations; executable skill metadata and custom descriptions stay intact. */
export const OFFICIAL_DESCRIPTION_KEYS = {
  'story-roleplay': 'settings.skillsHub.officialDescriptions.storyRoleplay',
  'weixin-file-send': 'settings.skillsHub.officialDescriptions.weixinFileSend',
  'x-recruiter': 'settings.skillsHub.officialDescriptions.xRecruiter',
  'xiaohongshu-recruiter': 'settings.skillsHub.officialDescriptions.xiaohongshuRecruiter',
  'officecli-word-form': 'settings.skillsHub.officialDescriptions.officecliWordForm',
  'officecli-xlsx': 'settings.skillsHub.officialDescriptions.officecliXlsx',
  'officecli-financial-model': 'settings.skillsHub.officialDescriptions.officecliFinancialModel',
  'officecli-pptx': 'settings.skillsHub.officialDescriptions.officecliPptx',
  'openclaw-setup': 'settings.skillsHub.officialDescriptions.openclawSetup',
  pdf: 'settings.skillsHub.officialDescriptions.pdf',
  'officecli-academic-paper': 'settings.skillsHub.officialDescriptions.officecliAcademicPaper',
  'officecli-data-dashboard': 'settings.skillsHub.officialDescriptions.officecliDataDashboard',
  'officecli-docx': 'settings.skillsHub.officialDescriptions.officecliDocx',
  'officecli-pitch-deck': 'settings.skillsHub.officialDescriptions.officecliPitchDeck',
  mermaid: 'settings.skillsHub.officialDescriptions.mermaid',
  moltbook: 'settings.skillsHub.officialDescriptions.moltbook',
  'morph-ppt': 'settings.skillsHub.officialDescriptions.morphPpt',
  'morph-ppt-3d': 'settings.skillsHub.officialDescriptions.morphPpt-3d',
  'aionui-webui-public': 'settings.skillsHub.officialDescriptions.aionuiWebuiPublic',
  'aionui-webui-setup': 'settings.skillsHub.officialDescriptions.aionuiWebuiSetup',
  'aionui-troubleshooting': 'settings.skillsHub.officialDescriptions.aionuiTroubleshooting',
  'skill-creator': 'settings.skillsHub.officialDescriptions.skillCreator',
  'aionui-config': 'settings.skillsHub.officialDescriptions.aionuiConfig',
  'conversation-create': 'settings.skillsHub.officialDescriptions.conversationCreate',
  cron: 'settings.skillsHub.officialDescriptions.cron',
  officecli: 'settings.skillsHub.officialDescriptions.officecli',
  'session-message': 'settings.skillsHub.officialDescriptions.sessionMessage',
} as const;

export function getOfficialSkillDescription(skill: SkillDescription, t: TFunction): string {
  if (skill.source !== 'builtin') return skill.description;
  if (!Object.hasOwn(OFFICIAL_DESCRIPTION_KEYS, skill.name)) return skill.description;
  const key = OFFICIAL_DESCRIPTION_KEYS[skill.name as keyof typeof OFFICIAL_DESCRIPTION_KEYS];
  return key ? t(key, { defaultValue: skill.description }) : skill.description;
}
