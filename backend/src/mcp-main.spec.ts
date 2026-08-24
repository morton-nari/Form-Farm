import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

describe('Form Farm MCP stdio entry', () => {
  it('keeps startup failures and credential material off stdout', () => {
    const rawCredential = 'ffmcp_v1_11111111-1111-4111-8111-111111111111_secret-material';
    const result = spawnSync(process.execPath, ['--import', 'tsx', 'src/mcp-main.ts'], {
      cwd: fileURLToPath(new URL('..', import.meta.url)),
      env: { ...process.env, APP_ENV: 'preview', FORM_FARM_DEVELOPER_CREDENTIAL: rawCredential },
      encoding: 'utf8',
      timeout: 10_000,
    });

    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('Form Farm MCP failed to start.');
    expect(result.stderr).not.toContain(rawCredential);
  });
});
