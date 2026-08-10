import { describe, expect, expectTypeOf, it } from 'vitest';
import type { RpcRequestFor, RpcResponseFor } from './rpc';
import { getRpcMethodSchema, parseRpcFailure, parseRpcRequest, parseRpcResponse } from './rpc';

describe('RPC method registry', () => {
  it('validates registered request payloads', () => {
    expect(parseRpcRequest('readFile', { path: '/repo/file.ts', offset: 0, length: 32 }))
      .toEqual({ path: '/repo/file.ts', offset: 0, length: 32 });
    expect(() => parseRpcRequest('readFile', { path: 42 })).toThrow();
  });

  it('defines a structured non-shell process execution contract', () => {
    expect(getRpcMethodSchema('exec')).toBeDefined();
    expect(parseRpcRequest('exec', {
      executable: 'git',
      args: ['diff', '--', "src/$(touch PWNED).ts"],
      cwd: '/repo',
      timeout: 5_000,
    })).toEqual({
      executable: 'git',
      args: ['diff', '--', "src/$(touch PWNED).ts"],
      cwd: '/repo',
      timeout: 5_000,
    });
    expect(() => parseRpcRequest('exec', { executable: 'git', args: 'status' })).toThrow();
  });

  it('validates registered response payloads', () => {
    expect(parseRpcResponse('readFile', { success: true, content: 'YQ==', bytesRead: 1 }))
      .toEqual({ success: true, content: 'YQ==', bytesRead: 1 });
    expect(() => parseRpcResponse('readFile', { success: 'yes' })).toThrow();
  });

  it('does not silently invent a schema for unknown extension methods', () => {
    expect(getRpcMethodSchema('plugin-specific-method')).toBeUndefined();
  });

  it('recognizes the encrypted RPC failure envelope without confusing business errors', () => {
    expect(parseRpcFailure({ __rpcError: { code: 'INVALID_REQUEST', message: 'bad input' } }))
      .toEqual({ __rpcError: { code: 'INVALID_REQUEST', message: 'bad input' } });
    expect(parseRpcFailure({ success: false, error: 'file not found' })).toBeUndefined();
  });

  it('validates control RPCs and their normalized void responses', () => {
    expect(getRpcMethodSchema('abort')).toBeDefined();
    expect(parseRpcRequest('abort', { reason: 'user cancelled' })).toEqual({ reason: 'user cancelled' });
    expect(parseRpcResponse('abort', null)).toBeNull();
    expect(() => parseRpcRequest('permission', { id: 42, approved: true })).toThrow();
    expect(() => parseRpcResponse('abort', { ok: true })).toThrow();
  });

  it('preserves the structured stop-session lifecycle state', () => {
    expect(parseRpcResponse('stop-session', {
      message: 'Session stop requested',
      state: 'timeout',
    })).toEqual({
      message: 'Session stop requested',
      state: 'timeout',
    });
    expect(() => parseRpcResponse('stop-session', {
      message: 'Session stop requested',
      state: 'unknown',
    })).toThrow();
  });

  it('validates CLI update status and control RPCs', () => {
    const status = {
      phase: 'available',
      currentVersion: '1.1.4',
      latestVersion: '1.2.0',
      updateAvailable: true,
      canUpdate: true,
      checkedAt: 123,
    };

    expect(parseRpcRequest('check-cli-update', {})).toEqual({});
    expect(parseRpcResponse('check-cli-update', status)).toEqual(status);
    expect(parseRpcRequest('update-cli', { version: '1.2.0' })).toEqual({ version: '1.2.0' });
    expect(parseRpcResponse('update-cli', { accepted: true, status })).toEqual({ accepted: true, status });
    expect(parseRpcRequest('rollback-cli', {})).toEqual({});
    expect(() => parseRpcRequest('update-cli', { version: 'latest' })).toThrow();
    expect(() => parseRpcResponse('check-cli-update', { ...status, phase: 'invented' })).toThrow();
  });

  it('validates machine system metrics snapshots', () => {
    const snapshot = {
      sampledAt: 1_725_000_000_000,
      system: {
        platform: 'linux',
        name: 'Ubuntu 24.04.1 LTS',
        release: '6.8.0-40-generic',
        architecture: 'x64',
        hostname: 'workstation',
        uptimeSeconds: 7_200,
      },
      cpu: { usagePercent: 37.4, logicalCores: 16, model: 'Example CPU' },
      memory: { totalBytes: 32_000, usedBytes: 20_000, availableBytes: 12_000, usagePercent: 62.5 },
      network: { receivedBytes: 8_000_000, sentBytes: 2_000_000 },
      disks: [{ name: '/dev/nvme0n1p2', mountPoint: '/', totalBytes: 100_000, usedBytes: 60_000, availableBytes: 40_000, usagePercent: 60 }],
    };

    expect(parseRpcRequest('get-system-metrics', {})).toEqual({});
    expect(parseRpcResponse('get-system-metrics', snapshot)).toEqual(snapshot);
    const { network: _network, ...legacySnapshot } = snapshot;
    expect(parseRpcResponse('get-system-metrics', legacySnapshot)).toMatchObject({
      network: { receivedBytes: 0, sentBytes: 0 },
    });
    expect(() => parseRpcResponse('get-system-metrics', { ...snapshot, cpu: { usagePercent: 140 } })).toThrow();
    expect(() => parseRpcResponse('get-system-metrics', { ...snapshot, network: { receivedBytes: -1, sentBytes: 0 } })).toThrow();
  });

  it('registers every built-in machine lifecycle and official-session RPC', () => {
    const methods = [
      'spawn-agenthub-session',
      'resume-agenthub-session',
      'claude-fork-session',
      'claude-list-rewind-points',
      'claude-duplicate-session',
      'codex-fork-thread',
      'codex-list-rewind-points',
      'codex-duplicate-thread',
      'codex-list-models',
      'codex-list-official-threads',
      'codex-list-official-thread-states',
      'codex-list-ignored-official-threads',
      'codex-ignore-official-thread',
      'codex-unignore-official-thread',
    ];

    for (const method of methods) {
      expect(getRpcMethodSchema(method), method).toBeDefined();
    }
    expect(() => parseRpcRequest('codex-list-official-thread-states', { threadIds: [3] })).toThrow();
    expect(() => parseRpcResponse('claude-list-rewind-points', { type: 'success', points: [{}] })).toThrow();
  });

  it('preserves Codex runtime model capabilities', () => {
    const response = parseRpcResponse('codex-list-models', {
      models: [{
        id: 'gpt-latest',
        model: 'gpt-latest',
        displayName: 'GPT Latest',
        description: 'Runtime catalog entry',
        hidden: false,
        isDefault: true,
        supportedReasoningEfforts: [
          { reasoningEffort: 'medium', description: 'Balanced' },
          { reasoningEffort: 'high', description: 'Deep' },
        ],
        defaultReasoningEffort: 'medium',
        serviceTiers: [{ id: 'fast', name: 'Fast', description: 'Faster responses' }],
      }],
      fetchedAt: 123,
      stale: false,
      cliVersion: '0.144.1',
    }) as RpcResponseFor<'codex-list-models'>;

    expect(response.models[0]).toMatchObject({
      model: 'gpt-latest',
      defaultReasoningEffort: 'medium',
      serviceTiers: [{ id: 'fast', name: 'Fast', description: 'Faster responses' }],
    });
    expect(() => parseRpcResponse('codex-list-models', {
      models: [{ model: 'missing-required-fields' }],
      fetchedAt: 123,
      stale: false,
    })).toThrow();
  });

  it('exposes compile-time request and response types from the registry', () => {
    expectTypeOf<RpcRequestFor<'readFile'>>().toMatchTypeOf<{ path: string }>();
    expectTypeOf<RpcResponseFor<'killSession'>>().toMatchTypeOf<{ success: boolean; message: string }>();
    expectTypeOf<RpcResponseFor<'abort'>>().toEqualTypeOf<null>();
  });
});
