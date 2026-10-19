import { spawn } from 'node:child_process';

export const EGO_CLI = '/Users/mima1234/.local/bin/ego-browser';
export const activeChildren = new Set();

/** Execute the installed Ego CLI directly; never invoke a shell or another browser. */
export function runEgo(script, { executable = EGO_CLI, timeout = 120000, maxBytes = 1000000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, ['nodejs'], { stdio: ['pipe', 'pipe', 'pipe'] });
    activeChildren.add(child);
    let stdout = '', stderr = '', failure;
    const fail = (message) => {
      failure ??= new Error(message);
      child.kill('SIGTERM');
    };
    const timer = setTimeout(() => fail('Ego 操作超时；可能已有部分操作生效。先检查同一任务空间，禁止自动重试或切换 Chrome。'), timeout);
    const forceTimer = setTimeout(() => child.kill('SIGKILL'), timeout + 3000);
    child.stdout.on('data', chunk => {
      stdout += chunk;
      if (Buffer.byteLength(stdout) > maxBytes) fail('Ego 输出过大；请缩小读取范围，先确认操作状态再继续。');
    });
    child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-10000); });
    child.stdin.on('error', () => {});
    child.on('error', error => { failure = error; });
    child.on('close', code => {
      clearTimeout(timer);
      clearTimeout(forceTimer);
      activeChildren.delete(child);
      if (failure || code !== 0) {
        reject(new Error([failure?.message, stderr, stdout].filter(Boolean).join('\n') || `Ego exited ${code}`));
      } else {
        resolve({ stdout, stderr });
      }
    });
    child.stdin.end(script);
  });
}

export function stopChildren() {
  for (const child of activeChildren) child.kill('SIGTERM');
}
