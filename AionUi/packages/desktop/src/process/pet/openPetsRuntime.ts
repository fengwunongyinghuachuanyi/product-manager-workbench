import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, createWriteStream } from 'node:fs';
import { createConnection } from 'node:net';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import {
  parsePetHostEvent,
  petConversationAction,
  type PetHostEvent,
  type PetActivity,
  type PetRuntimeStatus,
} from '@/common/types/platform/pet';
import type { PetSize } from './petTypes';

type PetResponse = { ok: boolean; message?: string; threadId?: string };

/** Speak the original OpenPetsKit newline-delimited Unix socket protocol. */
export function sendPetCommand(socketPath: string, command: Record<string, unknown>): Promise<PetResponse> {
  return new Promise((resolve, reject) => {
    const socket = createConnection(socketPath);
    let response = '';
    const fail = (error: Error): void => {
      socket.destroy();
      reject(error);
    };
    socket.setTimeout(2000, () => fail(new Error('OpenPets response timed out')));
    socket.once('error', fail);
    socket.once('connect', () => socket.write(`${JSON.stringify(command)}\n`));
    socket.on('data', (chunk) => {
      response += chunk.toString();
      if (response.length > 8192) return fail(new Error('Invalid OpenPets response size'));
      if (!response.includes('\n')) return;
      socket.destroy();
      try {
        const result = JSON.parse(response.split('\n')[0]) as PetResponse;
        if (result.ok !== true) return reject(new Error(result.message || 'OpenPets rejected command'));
        resolve(result);
      } catch (error) {
        reject(error);
      }
    });
    socket.once('end', () => {
      if (!response.includes('\n')) fail(new Error('OpenPets closed without a response'));
    });
  });
}

/** Own one native host for this workbench process; never touch the user's shared OpenPets session. */
export class OpenPetsRuntime {
  private child: ChildProcess | null = null;
  private error: string | undefined;
  private operation: Promise<void> = Promise.resolve();
  private ready = false;
  private dnd = false;
  private threads = new Map<string, { id: string; state: PetActivity['state'] }>();
  readonly socketPath = `/tmp/pm-workbench-pet-${process.getuid?.() ?? 0}-${process.pid}.sock`;

  constructor(
    private runtimeDirectory: string,
    private dataDirectory: string,
    private onHostEvent: (event: PetHostEvent) => void = () => {}
  ) {}

  private get executable(): string {
    return path.join(this.runtimeDirectory, 'WorkbenchPet.app', 'Contents', 'MacOS', 'workbench-pet');
  }

  status(): PetRuntimeStatus {
    return {
      engine: 'openpets',
      available: process.platform === 'darwin' && existsSync(this.executable),
      running: this.ready && this.child !== null && this.child.exitCode === null,
      error: this.error,
    };
  }

  private enqueue(action: () => Promise<void>): Promise<void> {
    const result = this.operation.then(action);
    this.operation = result.catch(() => {});
    return result;
  }

  start(size: PetSize): Promise<void> {
    return this.enqueue(async () => {
      if (!this.status().running) await this.launch(size);
    });
  }

  private async launch(size: PetSize): Promise<void> {
    if (!this.status().available) throw new Error('Bundled OpenPets runtime is unavailable');
    this.error = undefined;
    mkdirSync(this.dataDirectory, { recursive: true });
    const log = createWriteStream(path.join(this.dataDirectory, 'host.log'), { flags: 'a' });
    const child = spawn(
      this.executable,
      [this.socketPath, path.join(this.dataDirectory, 'positions.json'), String(size), String(process.pid)],
      { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env }, detached: false }
    );
    this.child = child;
    let eventBuffer = '';
    child.stdout?.on('data', (chunk: Buffer) => {
      eventBuffer += chunk.toString('utf8');
      if (eventBuffer.length > 8192) {
        eventBuffer = '';
        return;
      }
      const lines = eventBuffer.split('\n');
      eventBuffer = lines.pop() ?? '';
      for (const line of lines) {
        const event = parsePetHostEvent(line);
        if (event && this.child === child && this.ready) this.onHostEvent(event);
      }
    });
    child.stdout?.pipe(log, { end: false });
    child.stderr?.pipe(log, { end: false });
    child.once('error', (error) => {
      this.error = error.message;
    });
    child.once('exit', (code, signal) => {
      if (this.child === child) {
        this.child = null;
        this.ready = false;
      }
      if (code && !this.error) this.error = `OpenPets exited (${code}, ${signal ?? 'no signal'})`;
      log.end();
    });
    try {
      for (let attempt = 0; attempt < 80; attempt++) {
        if (this.error || child.exitCode !== null) throw new Error(this.error || 'OpenPets exited during startup');
        try {
          await sendPetCommand(this.socketPath, { type: 'ping' });
          this.ready = true;
          return;
        } catch {
          await delay(150);
        }
      }
      throw new Error('OpenPets startup timed out');
    } catch (error) {
      this.error = error instanceof Error ? error.message : String(error);
      child.kill();
      throw error;
    }
  }

  stop(): Promise<void> {
    return this.enqueue(() => this.terminate());
  }

  private async terminate(): Promise<void> {
    const child = this.child;
    this.ready = false;
    this.threads.clear();
    if (!child) return;
    const exited = new Promise<void>((resolve) => {
      child.once('exit', () => resolve());
    });
    await sendPetCommand(this.socketPath, { type: 'shutdown' }).catch(() => {
      child.kill();
    });
    await Promise.race([exited, delay(2000)]);
    if (child.exitCode === null && child.signalCode === null) child.kill();
    if (this.child === child) this.child = null;
  }

  resize(size: PetSize): Promise<void> {
    return this.enqueue(async () => {
      if (!this.status().running) return;
      await this.terminate();
      await this.launch(size);
    });
  }

  setDnd(enabled: boolean): void {
    this.dnd = enabled;
    if (enabled && this.status().running) {
      void sendPetCommand(this.socketPath, { type: 'clearMessages' }).catch(() => {});
      void sendPetCommand(this.socketPath, { type: 'stopAnimation' }).catch(() => {});
    }
  }

  companion(name: string, text = '', title = 'Companion'): Promise<void> {
    return this.enqueue(async () => {
      if (!this.status().running) return;
      if (text)
        await sendPetCommand(this.socketPath, {
          type: 'notify',
          notification: { title, text, status: 'message', threadId: 'companion', ttlSeconds: 4 },
        });
      await sendPetCommand(this.socketPath, { type: 'companion', name });
    });
  }

  async preview(title: string, text: string): Promise<void> {
    if (!this.status().running) throw new Error('OpenPets is not running');
    await sendPetCommand(this.socketPath, {
      type: 'notify',
      notification: { title, text, status: 'message', ttlSeconds: 6 },
    });
  }

  async activity(activity: PetActivity, title: string, text: string, actionLabel = 'Open conversation'): Promise<void> {
    if (this.dnd || !this.status().running) return;
    const previous = this.threads.get(activity.conversationId);
    if (previous?.state === activity.state || (previous?.state === 'failed' && activity.state === 'done')) return;
    const thread = { id: previous?.id ?? randomUUID(), state: activity.state };
    this.threads.set(activity.conversationId, thread);
    if (this.threads.size > 200) this.threads.delete(this.threads.keys().next().value!);
    const status = activity.state === 'thinking' ? 'running' : activity.state;
    try {
      await sendPetCommand(this.socketPath, {
        type: 'notify',
        notification: {
          title,
          text,
          status,
          threadId: thread.id,
          ttlSeconds: activity.state === 'done' || activity.state === 'failed' ? 120 : 8,
          url: petConversationAction(activity.conversationId),
          buttonLabel: actionLabel,
        },
      });
      console.info(`[OpenPets] Activity ${activity.conversationId}: ${activity.state}`);
    } catch (error) {
      this.threads.delete(activity.conversationId);
      console.warn('[OpenPets] Activity update failed:', error);
    }
  }
}
