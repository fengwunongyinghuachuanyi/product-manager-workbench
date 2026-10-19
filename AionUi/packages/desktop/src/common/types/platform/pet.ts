export const PET_ACTIVITY_STATES = ['thinking', 'running', 'review', 'done', 'failed', 'waiting'] as const;
export type PetActivityState = (typeof PET_ACTIVITY_STATES)[number];
export type PetActivity = { conversationId: string; state: PetActivityState };
export type PetRuntimeStatus = { engine: 'openpets' | 'builtin'; available: boolean; running: boolean; error?: string };

/** Project only coarse activity; never forward prompts, model output, paths or tool arguments. */
export function toPetActivity(name: string, payload: unknown): PetActivity | null {
  if (!payload || typeof payload !== 'object') return null;
  const message = payload as Record<string, unknown>;
  const id = message.conversation_id;
  if (typeof id !== 'string' || !/^[\w-]{1,128}$/.test(id) || message.hidden === true) return null;
  let state: PetActivityState | undefined;
  if (name === 'message.userCreated' && message.status !== 'pending') state = 'thinking';
  if (name === 'turn.completed') {
    const runtime = message.runtime as Record<string, unknown> | undefined;
    state = message.status === 'error' || runtime?.task_status === 'error' ? 'failed' : 'done';
  }
  if (name === 'message.stream') {
    if (message.type === 'thinking' || message.type === 'thought') state = 'thinking';
    if (['text', 'content', 'tool_call', 'tool_group'].includes(String(message.type))) state = 'running';
    if (message.type === 'error') state = 'failed';
    if (message.type === 'confirm' || message.type === 'confirmation') state = 'review';
  }
  return state ? { conversationId: id, state } : null;
}

export function isPetActivity(value: unknown): value is PetActivity {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as PetActivity;
  return (
    typeof candidate.conversationId === 'string' &&
    /^[\w-]{1,128}$/.test(candidate.conversationId) &&
    PET_ACTIVITY_STATES.includes(candidate.state)
  );
}

export type PetHostEvent =
  | { type: 'open-chat' }
  | { type: 'open-result'; conversationId: string }
  | { type: 'pet-action'; action: 'pet' | 'feed' | 'focus' | 'sleep' | 'wake' };

/** Accept only the private host's bounded, structured UI actions. */
export function parsePetHostEvent(line: string): PetHostEvent | null {
  if (line.length > 2048) return null;
  try {
    const event = JSON.parse(line) as Record<string, unknown>;
    if (!event || event.workbenchPet !== true) return null;
    if (event.type === 'open-chat') return { type: 'open-chat' };
    if (event.type === 'pet-action' && ['pet', 'feed', 'focus', 'sleep', 'wake'].includes(String(event.action)))
      return { type: 'pet-action', action: event.action as 'pet' | 'feed' | 'focus' | 'sleep' | 'wake' };
    if (
      event.type === 'open-result' &&
      typeof event.conversationId === 'string' &&
      /^[\w-]{1,128}$/.test(event.conversationId)
    ) {
      return { type: 'open-result', conversationId: event.conversationId };
    }
  } catch {
    /* Native diagnostics are not UI actions. */
  }
  return null;
}

/** Generate an internal action, never a file URL or executable command. */
export function petConversationAction(conversationId: string): string {
  if (!/^[\w-]{1,128}$/.test(conversationId)) throw new Error('Invalid pet conversation identifier');
  return `openpets://action/conversation/${conversationId}`;
}

export const PET_COMPANION_ACTIONS = [
  'pet',
  'feed',
  'sleep',
  'wake',
  'focus',
  'stop-focus',
  'quiet',
  'company',
  'follow',
  'perch',
  'game-start',
  'game-catch',
  'game-stop',
] as const;
export type PetCompanionCommand = {
  action: (typeof PET_COMPANION_ACTIONS)[number];
  minutes?: number;
  enabled?: boolean;
  tokenId?: string;
};
export type PetCompanionState = {
  action: string;
  mode: string;
  fullness: number;
  focusUntil: number;
  focusCount: number;
  sleeping: boolean;
  following: boolean;
  message: string;
  game: { running: boolean; endsAt: number; score: number; best: number; tokenId: string; x: number; y: number };
};

export function isPetCompanionCommand(value: unknown): value is PetCompanionCommand {
  if (!value || typeof value !== 'object') return false;
  const c = value as PetCompanionCommand;
  return (
    PET_COMPANION_ACTIONS.includes(c.action) &&
    (c.minutes === undefined || (Number.isFinite(c.minutes) && c.minutes >= 1 && c.minutes <= 120)) &&
    (c.enabled === undefined || typeof c.enabled === 'boolean') &&
    (c.tokenId === undefined || (typeof c.tokenId === 'string' && /^[\w-]{1,64}$/.test(c.tokenId)))
  );
}
