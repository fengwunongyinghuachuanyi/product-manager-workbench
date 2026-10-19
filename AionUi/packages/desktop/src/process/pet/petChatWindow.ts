import { app, BrowserWindow, screen } from 'electron';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ipcBridge } from '@/common';
import { initMainAdapterWithWindow } from '@/common/adapter/main';
import i18n from '@process/services/i18n';

let mainWindow: BrowserWindow | null = null;
let chatWindow: BrowserWindow | null = null;
let opening: Promise<void> | null = null;
let createMainWindow: ((conversationId: string) => void) | undefined;
let lastRendererURL: string | undefined;
let mainRendererReady = false;
let pendingConversation: string | undefined;

/** Recreate a closed macOS main window directly on the requested result route. */
export function setPetMainWindowFactory(factory?: (conversationId: string) => void): void {
  createMainWindow = factory;
}

/** Keep the current main window separate from the companion window. */
export function setPetMainWindow(window: BrowserWindow): void {
  mainWindow = window;
  mainRendererReady = false;
}

/** Flush only after the main Layout has installed its navigation listeners. */
export function markPetNavigationReady(senderId: number): void {
  if (!mainWindow || mainWindow.isDestroyed() || mainWindow.webContents.id !== senderId) return;
  mainRendererReady = true;
  if (pendingConversation) {
    mainWindow.webContents.send('tray:navigate-to-conversation', { conversation_id: pendingConversation });
    pendingConversation = undefined;
  }
}

/** Preserve companion focus when macOS activates this application. */
export function focusVisiblePetChat(): boolean {
  if (!chatWindow || chatWindow.isDestroyed() || !chatWindow.isVisible() || chatWindow.isMinimized()) return false;
  chatWindow.focus();
  return true;
}

/** Open a single compact window using the existing assistant and conversation UI. */
export async function openPetChat(): Promise<void> {
  if (opening) return opening;
  if (chatWindow && !chatWindow.isDestroyed()) {
    if (chatWindow.isMinimized()) chatWindow.restore();
    chatWindow.show();
    chatWindow.focus();
    return;
  }
  const main = mainWindow;
  const rendererURL = main && !main.isDestroyed() ? main.webContents.getURL() : lastRendererURL;
  const source = new URL(
    rendererURL ||
      process.env.ELECTRON_RENDERER_URL ||
      pathToFileURL(path.join(app.getAppPath(), 'out', 'renderer', 'index.html')).toString()
  );
  lastRendererURL = source.toString();
  if (source.protocol !== 'file:' && !['http:', 'https:'].includes(source.protocol)) {
    throw new Error('Workbench renderer is unavailable');
  }
  source.searchParams.set('petChat', '1');
  source.hash = '/pet-companion';
  const cursor = screen.getCursorScreenPoint();
  const area = screen.getDisplayNearestPoint(cursor).workArea;
  const width = Math.min(560, area.width);
  const height = Math.min(720, Math.max(480, area.height - 170));
  const window = new BrowserWindow({
    width,
    height,
    minWidth: 400,
    minHeight: 480,
    x: Math.max(area.x, Math.min(cursor.x - width - 20, area.x + area.width - width)),
    y: Math.max(area.y + 150, Math.min(cursor.y - height / 2, area.y + area.height - height)),
    title: i18n.t('pet.chat.title'),
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(app.getAppPath(), 'out', 'preload', 'index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  chatWindow = window;
  initMainAdapterWithWindow(window);
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, url) => {
    const next = new URL(url);
    if (next.origin !== source.origin || next.pathname !== source.pathname) event.preventDefault();
  });
  window.on('closed', () => {
    if (chatWindow === window) chatWindow = null;
  });
  opening = window
    .loadURL(source.toString())
    .then(() => {
      if (!window.isDestroyed()) {
        window.show();
        window.focus();
      }
    })
    .catch((error: unknown) => {
      if (!window.isDestroyed()) window.destroy();
      throw error;
    })
    .finally(() => {
      opening = null;
    });
  return opening;
}

/** Resolve a real conversation before focusing the workbench; never open arbitrary URLs. */
export async function openPetConversation(conversationId: string): Promise<void> {
  if (!/^[\w-]{1,128}$/.test(conversationId)) throw new Error('Invalid conversation identifier');
  await ipcBridge.conversation.get.invoke({ id: conversationId });
  const main = mainWindow;
  chatWindow?.hide();
  if (!main || main.isDestroyed()) {
    if (!createMainWindow) throw new Error('Workbench window is unavailable');
    void app.dock?.show();
    pendingConversation = conversationId;
    createMainWindow(conversationId);
    return;
  }
  if (main.isMinimized()) main.restore();
  void app.dock?.show();
  main.show();
  main.focus();
  if (mainRendererReady) main.webContents.send('tray:navigate-to-conversation', { conversation_id: conversationId });
  else pendingConversation = conversationId;
}

/** Disabling the pet or quitting also disposes its chat window. Conversations stay saved. */
export function destroyPetChat(): void {
  if (chatWindow && !chatWindow.isDestroyed()) chatWindow.destroy();
  chatWindow = null;
}
