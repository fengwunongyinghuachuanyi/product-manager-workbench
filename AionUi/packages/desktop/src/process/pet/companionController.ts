import { mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { PetCompanionCommand, PetCompanionState } from '@/common/types/platform/pet';

type OriginalSnapshot = {
  action: string;
  message: string;
  started: number;
  until: number;
  revision: number;
  mode: string;
  focusUntil: number;
  fullness: number;
  focusCount: number;
};
export type OriginalCompanion = {
  action: string;
  mode: string;
  focusUntil: number;
  focusCount: number;
  fullness: number;
  until: number;
  away: boolean;
  chatBusy: boolean;
  tick(): OriginalSnapshot;
  snapshot(): OriginalSnapshot;
  interact(kind: string): boolean;
  setMode(mode: string, minutes?: number): boolean;
  play(action: string, message?: string, duration?: number, priority?: number): boolean;
  context(context: { idleSeconds: number }): void;
};
export type CompanionConstructor = new (options: { now: () => number; random: () => number }) => OriginalCompanion;

/** Adapter around the original, unmodified BigFish behavior state machine. */
export class CompanionController {
  private original: OriginalCompanion;
  private timer?: ReturnType<typeof setInterval>;
  private following = true;
  private sleeping = false;
  private dnd = false;
  private lastRevision = -1;
  private lastSave = 0;
  private lastCatch = 0;
  private game: PetCompanionState['game'] = {
    running: false,
    endsAt: 0,
    score: 0,
    best: 0,
    tokenId: '',
    x: 0.5,
    y: 0.5,
  };
  private busyConversations = new Set<string>();

  constructor(
    Behavior: CompanionConstructor,
    private dataDirectory: string,
    private reaction: (name: string, message: string) => void,
    private idleSeconds: () => number = () => 0,
    private now: () => number = Date.now,
    private random: () => number = Math.random
  ) {
    this.original = new Behavior({ now, random });
    try {
      const saved = JSON.parse(
        readFileSync(path.join(dataDirectory, 'companion.json'), 'utf8')
      ) as Partial<PetCompanionState>;
      if (Number.isFinite(saved.fullness)) this.original.fullness = Math.max(0, Math.min(100, saved.fullness!));
      if (Number.isFinite(saved.focusCount)) this.original.focusCount = Math.max(0, Math.floor(saved.focusCount!));
      if (Number.isFinite(saved.focusUntil) && saved.focusUntil! > now() - 120 * 60000) {
        this.original.focusUntil = saved.focusUntil!;
        this.original.mode = saved.focusUntil ? 'focus' : 'company';
      }
      this.following = saved.following !== false;
      this.game.best = Math.max(0, Math.floor(saved.game?.best ?? 0));
      if (saved.sleeping) this.command({ action: 'sleep' });
    } catch {
      /* Missing or invalid local preferences use safe defaults. */
    }
  }

  start(): void {
    if (this.timer) return;
    this.reaction(this.following ? '__follow_on' : '__follow_off', '');
    this.lastRevision = -1;
    this.timer = setInterval(() => this.tick(), 400);
    this.timer.unref?.();
    this.tick();
  }
  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    this.save();
  }
  setDnd(enabled: boolean): void {
    this.dnd = enabled;
  }
  activity(id: string, busy: boolean): void {
    if (busy) this.busyConversations.add(id);
    else this.busyConversations.delete(id);
    this.original.chatBusy = this.busyConversations.size > 0;
  }
  snapshot(): PetCompanionState {
    const state = this.original.snapshot();
    return {
      action: state.action,
      mode: state.mode,
      fullness: state.fullness,
      focusUntil: state.focusUntil,
      focusCount: state.focusCount,
      sleeping: this.sleeping || state.action === 'sleep',
      following: this.following,
      message: state.message,
      game: { ...this.game },
    };
  }
  command(command: PetCompanionCommand): PetCompanionState {
    const { action } = command;
    if (action === 'perch') {
      this.following = true;
      this.reaction('__follow_on', '');
      this.reaction('__perch', '');
    } else if (action === 'follow') {
      this.following = command.enabled === true;
      this.reaction(this.following ? '__follow_on' : '__follow_off', '');
    } else if (action === 'sleep') {
      this.sleeping = true;
      this.original.away = true;
      this.original.until = 0;
      this.original.play('sleep', '', 24 * 3600000, 90);
    } else if (action === 'wake') {
      this.sleeping = false;
      this.original.away = false;
      this.original.until = 0;
      this.original.play('wake', '', 2500, 90);
    } else if (action === 'focus') {
      this.sleeping = false;
      this.original.away = false;
      this.original.setMode('focus', command.minutes ?? 25);
    } else if (action === 'stop-focus' || action === 'company' || action === 'quiet') {
      this.original.setMode(action === 'quiet' ? 'quiet' : 'company');
    } else if (action === 'game-start') {
      if (!this.game.running) {
        this.game = { ...this.game, running: true, endsAt: this.now() + 30000, score: 0 };
        this.moveToken();
      }
    } else if (action === 'game-catch') {
      if (
        this.game.running &&
        this.now() < this.game.endsAt &&
        command.tokenId === this.game.tokenId &&
        this.now() - this.lastCatch >= 80
      ) {
        this.game.score++;
        this.lastCatch = this.now();
        this.moveToken();
      }
    } else if (action === 'game-stop') this.endGame();
    else {
      if (this.sleeping) {
        this.sleeping = false;
        this.original.away = false;
        this.original.until = 0;
      }
      this.original.interact(action);
    }
    this.tick(true);
    this.save();
    return this.snapshot();
  }
  private moveToken(): void {
    this.game.tokenId = randomUUID();
    this.game.x = 0.08 + this.random() * 0.73;
    this.game.y = 0.08 + this.random() * 0.68;
  }
  private endGame(): void {
    if (!this.game.running) return;
    this.game.running = false;
    this.game.best = Math.max(this.game.best, this.game.score);
    this.original.interact(this.game.score > 5 ? 'celebrate' : 'feed');
    this.save();
  }
  private tick(manual = false): void {
    if (!this.sleeping) this.original.context({ idleSeconds: this.idleSeconds() });
    if (this.game.running && this.now() >= this.game.endsAt) this.endGame();
    const beforeFocus = this.original.focusUntil;
    const state = this.original.tick();
    if (state.revision !== this.lastRevision && (manual || (!this.dnd && !this.original.chatBusy))) {
      this.lastRevision = state.revision;
      this.reaction(state.action, state.message);
    }
    if (beforeFocus && !state.focusUntil) this.reaction('focus-complete', '');
    if (this.now() - this.lastSave > 5000) this.save();
  }
  private save(): void {
    mkdirSync(this.dataDirectory, { recursive: true });
    const file = path.join(this.dataDirectory, 'companion.json');
    try {
      writeFileSync(file + '.tmp', JSON.stringify(this.snapshot()), { mode: 0o600 });
      renameSync(file + '.tmp', file);
      this.lastSave = this.now();
    } catch (error) {
      console.warn('[Companion] Could not save preferences:', error);
    }
  }
}
