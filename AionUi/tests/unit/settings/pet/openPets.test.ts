import { afterEach, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:net';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { toPetActivity, isPetActivity } from '@/common/types/platform/pet';
import { sendPetCommand } from '@process/pet/openPetsRuntime';

describe('Desktop pet event projection', () => {
  it('forwards only a conversation identifier and coarse state', () => {
    expect(
      toPetActivity('message.stream', {
        conversation_id: 'project-1',
        type: 'text',
        data: 'private content',
        path: '/private/file',
      })
    ).toEqual({ conversationId: 'project-1', state: 'running' });
  });

  it('does not report a streaming message finish as whole-turn completion', () => {
    expect(toPetActivity('message.stream', { conversation_id: 'c1', type: 'finish' })).toBeNull();
  });

  it('ignores hidden internal work and queued user messages', () => {
    expect(toPetActivity('message.stream', { conversation_id: 'c1', type: 'text', hidden: true })).toBeNull();
    expect(toPetActivity('message.userCreated', { conversation_id: 'c1', status: 'pending' })).toBeNull();
  });

  it('distinguishes an actual failed turn from a completed one', () => {
    expect(toPetActivity('turn.completed', { conversation_id: 'c1', runtime: { task_status: 'error' } })?.state).toBe(
      'failed'
    );
    expect(toPetActivity('turn.completed', { conversation_id: 'c1', status: 'finished' })?.state).toBe('done');
  });

  it('rejects malformed or unrecognized IPC activities', () => {
    expect(isPetActivity({ conversationId: '../bad', state: 'done' })).toBe(false);
    expect(isPetActivity({ conversationId: 'c1', state: 'execute' })).toBe(false);
    expect(toPetActivity('unrelated', { conversation_id: 'c1' })).toBeNull();
  });
});

describe('OpenPets native protocol', () => {
  let server: Server | undefined;
  let directory: string | undefined;
  afterEach(async () => {
    if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
    if (directory) rmSync(directory, { recursive: true, force: true });
    server = undefined;
  });
  async function serve(reply: string): Promise<string> {
    directory = mkdtempSync(path.join(tmpdir(), 'pm-pet-'));
    const socket = path.join(directory, 'p.sock');
    server = createServer((client) => client.once('data', () => client.end(reply)));
    await new Promise<void>((resolve, reject) => {
      server!.once('error', reject);
      server!.listen(socket, resolve);
    });
    return socket;
  }

  it('decodes the original native response envelope', async () => {
    const socket = await serve('{"ok":true,"message":"pong"}\n');
    await expect(sendPetCommand(socket, { type: 'ping' })).resolves.toMatchObject({ ok: true, message: 'pong' });
  });

  it('surfaces native rejection instead of claiming success', async () => {
    const socket = await serve('{"ok":false,"message":"pet unavailable"}\n');
    await expect(sendPetCommand(socket, { type: 'ping' })).rejects.toThrow('pet unavailable');
  });

  it('rejects a truncated response rather than leaving the settings spinner pending', async () => {
    const socket = await serve('{"ok":true}');
    await expect(sendPetCommand(socket, { type: 'ping' })).rejects.toThrow('closed without a response');
  });
});
