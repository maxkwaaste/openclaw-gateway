import { execFile } from 'node:child_process';

const CLAUDE_PATH = process.env.CLAUDE_PATH || '/opt/homebrew/bin/claude';
let running = false;

export async function runClaude(prompt, timeoutMs = 120000) {
  if (running) {
    return { success: false, error: 'Claude session already running, try again shortly' };
  }

  running = true;
  try {
    const output = await new Promise((resolve, reject) => {
      execFile(CLAUDE_PATH, ['-p', prompt, '--output-format', 'text'], {
        maxBuffer: 10 * 1024 * 1024,
        timeout: timeoutMs,
      }, (err, stdout) => {
        if (err) reject(err);
        else resolve(stdout);
      });
    });
    return { success: true, output };
  } catch (err) {
    console.error('runClaude failed:', err.message);
    return { success: false, error: err.message };
  } finally {
    running = false;
  }
}
