/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const { getClientBusinessSettingMock, mcpServiceMock } = vi.hoisted(() => ({
  getClientBusinessSettingMock: vi.fn(),
  mcpServiceMock: {
    listServers: { invoke: vi.fn() },
  },
}));

vi.mock('@/renderer/services/clientBusinessSettings', () => ({
  getClientBusinessSetting: getClientBusinessSettingMock,
}));

vi.mock('@/common/adapter/ipcBridge', () => ({
  mcpService: mcpServiceMock,
}));

import { ensureBackendMcpCatalog } from '@/renderer/hooks/mcp/catalog';

describe('ensureBackendMcpCatalog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getClientBusinessSettingMock.mockResolvedValue([]);
    mcpServiceMock.listServers.invoke.mockResolvedValue([
      {
        id: 'user-1',
        name: 'user one',
        enabled: true,
        transport: { type: 'stdio', command: 'user', args: [] },
        created_at: 2,
        updated_at: 2,
        original_json: '{}',
        builtin: false,
      },
    ]);
  });

  it('reads MCP catalog from backend settings without falling back to configService', async () => {
    getClientBusinessSettingMock.mockResolvedValue([
      {
        id: 'builtin-1',
        name: 'builtin one',
        enabled: true,
        transport: { type: 'stdio', command: 'builtin', args: [] },
        created_at: 1,
        updated_at: 1,
        original_json: '{}',
        builtin: true,
      },
    ]);

    const result = await ensureBackendMcpCatalog();

    expect(result.userServers).toHaveLength(1);
    expect(result.builtinServers).toHaveLength(1);
    expect(result.allServers).toHaveLength(2);
  });

  it('does not re-import legacy user MCP rows from backend client settings at runtime', async () => {
    getClientBusinessSettingMock.mockResolvedValue([
      {
        id: 'legacy-user-1',
        name: 'legacy user server',
        enabled: true,
        transport: { type: 'stdio', command: 'legacy-user', args: [] },
        created_at: 1,
        updated_at: 1,
        original_json: '{}',
        builtin: false,
      },
    ]);
    mcpServiceMock.listServers.invoke.mockResolvedValue([]);

    const result = await ensureBackendMcpCatalog();

    expect(result.userServers).toEqual([]);
    expect(result.builtinServers).toEqual([]);
    expect(result.allServers).toEqual([]);
  });

  it('replaces both Chrome entries with Ego without hiding other MCP tools', async () => {
    const row = (name: string) => ({
      id: name,
      name,
      enabled: true,
      transport: { type: 'stdio', command: 'node' },
      builtin: false,
    });
    mcpServiceMock.listServers.invoke.mockResolvedValue(
      ['ego-browser', 'chrome-devtools', 'aionui-browser', 'chaichai'].map(row)
    );
    const result = await ensureBackendMcpCatalog();
    expect(result.allServers.map((server) => server.name)).toEqual(['ego-browser', 'chaichai']);
    expect(result.userServers.map((server) => server.name)).toEqual(['ego-browser', 'chaichai']);
  });

  it('surfaces catalog failures instead of silently choosing another browser', async () => {
    mcpServiceMock.listServers.invoke.mockRejectedValueOnce(new Error('backend unavailable'));
    await expect(ensureBackendMcpCatalog()).rejects.toThrow('backend unavailable');
  });
});
