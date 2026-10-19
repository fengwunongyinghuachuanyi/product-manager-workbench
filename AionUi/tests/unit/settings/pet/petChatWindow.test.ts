import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parsePetHostEvent, petConversationAction } from '@/common/types/platform/pet';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  show: vi.fn(),
  focus: vi.fn(),
  restore: vi.fn(),
  send: vi.fn(),
  load: vi.fn(),
  create: vi.fn(),
  destroy: vi.fn(),
}));

vi.mock('@/common', () => ({ ipcBridge: { conversation: { get: { invoke: mocks.get } } } }));
vi.mock('@/common/adapter/main', () => ({ initMainAdapterWithWindow: vi.fn() }));
vi.mock('@process/services/i18n', () => ({ default: { t: (key: string) => key } }));
vi.mock('electron', () => ({
  app: { getAppPath: () => '/workbench', dock: { show: vi.fn() } },
  screen: {
    getCursorScreenPoint: () => ({ x: 1000, y: 600 }),
    getDisplayNearestPoint: () => ({ workArea: { x: 0, y: 0, width: 1440, height: 900 } }),
  },
  BrowserWindow: class {
    constructor(options: unknown) {
      mocks.create(options);
    }
    isDestroyed = () => false;
    isMinimized = () => false;
    isVisible = () => true;
    hide = vi.fn();
    on = vi.fn();
    webContents = { setWindowOpenHandler: vi.fn(), on: vi.fn() };
    loadURL = mocks.load;
    show = mocks.show;
    focus = mocks.focus;
    destroy = mocks.destroy;
  },
}));

import {
  destroyPetChat,
  focusVisiblePetChat,
  openPetChat,
  openPetConversation,
  setPetMainWindow,
  setPetMainWindowFactory,
  markPetNavigationReady,
} from '@process/pet/petChatWindow';
import type { BrowserWindow } from 'electron';

describe('Companion actions', () => {
  it('accepts only known private host events', () => {
    expect(parsePetHostEvent('{"workbenchPet":true,"type":"open-chat"}')).toEqual({ type: 'open-chat' });
    expect(parsePetHostEvent('{"workbenchPet":true,"type":"open-result","conversationId":"abc-1"}')).toEqual({
      type: 'open-result',
      conversationId: 'abc-1',
    });
  });
  it('rejects path traversal, executable URLs and untrusted diagnostics', () => {
    expect(parsePetHostEvent('{"workbenchPet":true,"type":"open-result","conversationId":"../evil"}')).toBeNull();
    expect(parsePetHostEvent('{"type":"open-chat"}')).toBeNull();
    expect(() => petConversationAction('file:///private')).toThrow();
  });
  it('keeps result actions scoped to their exact conversation', () => {
    expect(petConversationAction('task-1')).toBe('openpets://action/conversation/task-1');
    expect(petConversationAction('task-2')).toBe('openpets://action/conversation/task-2');
  });
  it('ignores truncated and oversized native messages', () => {
    expect(parsePetHostEvent('{')).toBeNull();
    expect(parsePetHostEvent(' '.repeat(2049))).toBeNull();
    expect(parsePetHostEvent('null')).toBeNull();
  });
});

describe('Companion chat and result navigation', () => {
  const main = {
    isDestroyed: () => false,
    isMinimized: () => true,
    restore: mocks.restore,
    show: mocks.show,
    focus: mocks.focus,
    webContents: { id: 7, getURL: () => 'file:///workbench/out/renderer/index.html#/settings/pet', send: mocks.send },
  } as unknown as BrowserWindow;
  beforeEach(() => {
    destroyPetChat();
    vi.clearAllMocks();
    mocks.load.mockResolvedValue(undefined);
    mocks.get.mockResolvedValue({ id: 'result-1' });
    setPetMainWindowFactory();
    setPetMainWindow(main);
    markPetNavigationReady(7);
    mocks.send.mockClear();
  });
  it('opens one compact chat and reuses it on repeated clicks', async () => {
    await openPetChat();
    await openPetChat();
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(mocks.load).toHaveBeenCalledWith('file:///workbench/out/renderer/index.html?petChat=1#/pet-companion');
    expect(mocks.create.mock.calls[0][0]).toMatchObject({
      webPreferences: { contextIsolation: true, nodeIntegration: false },
    });
  });
  it('restores the workbench and routes a result to its original conversation', async () => {
    await openPetConversation('result-1');
    expect(mocks.restore).toHaveBeenCalledOnce();
    expect(mocks.send).toHaveBeenCalledWith('tray:navigate-to-conversation', { conversation_id: 'result-1' });
  });
  it('does not focus or navigate when the conversation has been deleted', async () => {
    mocks.get.mockRejectedValueOnce(new Error('Not found'));
    await expect(openPetConversation('deleted')).rejects.toThrow('Not found');
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.focus).not.toHaveBeenCalled();
  });
  it('recreates a closed main window on the exact result instead of losing a startup event', async () => {
    const factory = vi.fn();
    setPetMainWindow({ isDestroyed: () => true } as unknown as BrowserWindow);
    setPetMainWindowFactory(factory);
    await openPetConversation('result-2');
    expect(factory).toHaveBeenCalledWith('result-2');
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it('can open compact chat even after the main window was closed', async () => {
    setPetMainWindow({ isDestroyed: () => true } as unknown as BrowserWindow);
    await openPetChat();
    expect(mocks.load).toHaveBeenCalledWith('file:///workbench/out/renderer/index.html?petChat=1#/pet-companion');
  });
  it('keeps the newest result queued until the main renderer is ready', async () => {
    setPetMainWindow(main);
    await openPetConversation('result-a');
    await openPetConversation('result-b');
    expect(mocks.send).not.toHaveBeenCalled();
    markPetNavigationReady(7);
    expect(mocks.send).toHaveBeenCalledWith('tray:navigate-to-conversation', { conversation_id: 'result-b' });
  });
  it('rejects external paths before contacting the backend', async () => {
    await expect(openPetConversation('../private')).rejects.toThrow('Invalid');
    expect(mocks.get).not.toHaveBeenCalled();
  });
  it('allows a retry after the chat renderer failed to load', async () => {
    mocks.load.mockRejectedValueOnce(new Error('Load failed'));
    await expect(openPetChat()).rejects.toThrow('Load failed');
    destroyPetChat();
    await expect(openPetChat()).resolves.toBeUndefined();
    expect(mocks.destroy).toHaveBeenCalled();
  });
});

describe('Companion activation focus', () => {
  it('does not intercept activation after its window has been closed', () => {
    destroyPetChat();
    expect(focusVisiblePetChat()).toBe(false);
  });
});
