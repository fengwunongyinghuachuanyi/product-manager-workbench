import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { CompanionController, type CompanionConstructor } from '@process/pet/companionController';
import { isPetCompanionCommand } from '@/common/types/platform/pet';
const { Companion } = createRequire(import.meta.url)(
  path.resolve('..', 'integrations/openpets/independent-source/src/main/behavior.cjs')
) as { Companion: CompanionConstructor };

describe('BigFish companion integration', () => {
  let directory: string;
  let controller: CompanionController;
  const reaction = vi.fn();
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-19T04:00:00Z'));
    directory = mkdtempSync(path.join(tmpdir(), 'companion-test-'));
    reaction.mockClear();
    controller = new CompanionController(Companion, directory, reaction);
  });
  afterEach(() => {
    controller.stop();
    rmSync(directory, { recursive: true, force: true });
    vi.useRealTimers();
  });
  it('feeding raises fullness with a real eating action and caps it at 100', () => {
    controller.command({ action: 'feed' });
    expect(controller.snapshot().fullness).toBe(67);
    expect(reaction).toHaveBeenCalledWith('eat', expect.any(String));
    for (let i = 0; i < 8; i++) controller.command({ action: 'feed' });
    expect(controller.snapshot().fullness).toBe(100);
  });
  it('manual sleep remains asleep until explicitly awakened', () => {
    controller.start();
    controller.command({ action: 'sleep' });
    vi.advanceTimersByTime(20000);
    expect(controller.snapshot()).toMatchObject({ sleeping: true, action: 'sleep' });
    controller.command({ action: 'wake' });
    expect(controller.snapshot().sleeping).toBe(false);
  });
  it('focus completes once in the background and sends a break reminder', () => {
    controller.start();
    controller.command({ action: 'focus', minutes: 1 });
    vi.advanceTimersByTime(60500);
    expect(controller.snapshot()).toMatchObject({ focusUntil: 0, focusCount: 1 });
    expect(reaction.mock.calls.filter(([name]) => name === 'focus-complete')).toHaveLength(1);
    vi.advanceTimersByTime(10000);
    expect(controller.snapshot().focusCount).toBe(1);
  });
  it('a cancelled focus session is not counted as completed', () => {
    controller.start();
    controller.command({ action: 'focus', minutes: 1 });
    controller.command({ action: 'stop-focus' });
    vi.advanceTimersByTime(65000);
    expect(controller.snapshot().focusCount).toBe(0);
  });
  it('random actions respect quiet mode and running AI work', () => {
    controller.start();
    controller.command({ action: 'quiet' });
    reaction.mockClear();
    vi.advanceTimersByTime(20000);
    expect(
      reaction.mock.calls.filter(([name]) => ['hum', 'dance', 'meal-break', 'token-game'].includes(name))
    ).toHaveLength(0);
    controller.command({ action: 'company' });
    controller.activity('task-1', true);
    reaction.mockClear();
    vi.advanceTimersByTime(20000);
    expect(reaction).not.toHaveBeenCalled();
  });
  it('only current snack targets count and a round ends after 30 seconds', () => {
    controller.start();
    const first = controller.command({ action: 'game-start' }).game.tokenId;
    controller.command({ action: 'game-catch', tokenId: first });
    vi.advanceTimersByTime(100);
    controller.command({ action: 'game-catch', tokenId: first });
    expect(controller.snapshot().game.score).toBe(1);
    vi.advanceTimersByTime(30500);
    expect(controller.snapshot().game).toMatchObject({ running: false, score: 1, best: 1 });
  });
  it('focus deadline, fullness and window-follow preference survive a restart', () => {
    controller.command({ action: 'feed' });
    controller.command({ action: 'focus', minutes: 25 });
    controller.command({ action: 'follow', enabled: false });
    controller.stop();
    const restored = new CompanionController(Companion, directory, reaction);
    expect(restored.snapshot()).toMatchObject({
      fullness: 67,
      following: false,
      mode: 'focus',
      focusUntil: Date.now() + 25 * 60000,
    });
    restored.stop();
  });
  it('enables following before placing the pet on a visible window', () => {
    controller.command({ action: 'follow', enabled: false }); reaction.mockClear();
    controller.command({ action: 'perch' });
    expect(controller.snapshot().following).toBe(true);
    expect(reaction.mock.calls.slice(0, 2).map(([name]) => name)).toEqual(['__follow_on', '__perch']);
  });
  it('corrupt local preferences do not prevent the companion from starting', () => {
    writeFileSync(path.join(directory, 'companion.json'), '{');
    const restored = new CompanionController(Companion, directory, reaction);
    expect(restored.snapshot().fullness).toBe(55);
    restored.stop();
  });
  it('rejects unknown IPC actions and invalid timing or target input', () => {
    expect(isPetCompanionCommand({ action: 'execute', command: 'shell' })).toBe(false);
    expect(isPetCompanionCommand({ action: 'focus', minutes: -1 })).toBe(false);
    expect(isPetCompanionCommand({ action: 'game-catch', tokenId: '../private' })).toBe(false);
  });
});
