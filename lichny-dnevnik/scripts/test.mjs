import { spawn } from 'node:child_process';
import { readFile, mkdir, cp } from 'node:fs/promises';
import path from 'node:path';
import { openSync, closeSync } from 'node:fs';
import assert from 'node:assert/strict';
import { python } from './python.mjs';
const root = process.cwd(); const children = []; const pythonExe = python();
const runtime = path.join(root, '.test-runtime', `sqlite-${Date.now()}`); const dataDir = path.join(runtime, 'persistent-data');
const env = { ...process.env, PYTHON_EXE: pythonExe, PYTHONUTF8: '1', CI: 'true', TEST_DATA_DIR: dataDir };
const start = (exe, args, quiet = false) => {
  const fd = quiet ? openSync(path.join(runtime, 'server.log'), 'a') : null;
  const p = spawn(exe, args, { stdio: fd === null ? 'inherit' : ['ignore', fd, fd], windowsHide: true, env });
  if (fd !== null) closeSync(fd); children.push(p); return p;
};
const run = async (exe, args) => { const p = start(exe, args); const code = await new Promise(r => p.on('exit', r)); if (code !== 0) throw new Error(`Проверка/сборка завершилась с кодом ${code}`); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(child) {
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null) throw new Error('Сервер завершился до запуска.');
    try { if ((await fetch('http://127.0.0.1:5173/api/session')).ok) return; } catch {}
    await sleep(200);
  }
  throw new Error('Сервер не запустился.');
}
async function stop(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const done = new Promise(resolve => child.once('exit', resolve)); child.kill('SIGTERM'); await done;
}
try {
  await mkdir(runtime, { recursive: true });
  let occupied = false;
  try { await fetch('http://127.0.0.1:5173', { signal: AbortSignal.timeout(500) }); occupied = true; } catch {}
  if (occupied) throw new Error('Порт 5173 занят. Остановите предыдущий сервер.');
  await run(pythonExe, ['-m', 'unittest', 'discover', '-s', 'tests', '-p', 'test_server.py']);
  await run(process.execPath, ['node_modules/typescript/bin/tsc', '-b']);
  await run(process.execPath, ['node_modules/vite/bin/vite.js', 'build']);
  await run(process.execPath, ['scripts/service-worker.mjs']);
  const initializer = spawn(pythonExe, ['-m', 'server.manage', 'init', '--data-dir', dataDir, '--origin', 'http://127.0.0.1:5173'], { windowsHide: true, env, stdio: ['ignore', 'pipe', 'inherit'] });
  let output = ''; initializer.stdout.on('data', chunk => { output += chunk.toString('utf8'); });
  const initialized = await new Promise(r => initializer.on('exit', r));
  if (initialized !== 0) throw new Error('Не удалось создать тестовую SQLite.');
  env.TEST_SETUP_TOKEN = output.split(/\r?\n/).find(line => /^[\w-]{43}$/.test(line));
  if (!env.TEST_SETUP_TOKEN) throw new Error('Нет тестового одноразового кода.');
  let server = start(pythonExe, ['-m', 'server.manage', 'serve', '--data-dir', dataDir, '--port', '5173'], true);
  await waitFor(server);
  await run(process.execPath, ['node_modules/@playwright/test/cli.js', 'test']);
  // A real process restart, same data file, and a new directory containing the release.
  const login = await fetch('http://127.0.0.1:5173/api/login', { method: 'POST', headers: { Origin: 'http://127.0.0.1:5173', 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'owner@example.test', password: 'Test-only-password-2026' }) });
  assert.equal(login.status, 200); const session = await login.json(); const cookie = login.headers.get('set-cookie').split(';')[0];
  const before = await (await fetch('http://127.0.0.1:5173/api/entries', { headers: { Cookie: cookie } })).json();
  const helpersBefore = await (await fetch('http://127.0.0.1:5173/api/helpers', { headers: { Cookie: cookie } })).json();
  await stop(server);
  const newRelease = path.join(runtime, 'updated-release'); await cp('dist', newRelease, { recursive: true });
  server = start(pythonExe, ['-m', 'server.manage', 'serve', '--data-dir', dataDir, '--port', '5173', '--static', newRelease], true);
  await waitFor(server);
  const after = await (await fetch('http://127.0.0.1:5173/api/entries', { headers: { Cookie: cookie } })).json();
  assert.deepEqual(after, before);
  const helpersAfter = await (await fetch('http://127.0.0.1:5173/api/helpers', { headers: { Cookie: cookie } })).json();
  assert.deepEqual(helpersAfter, helpersBefore);
  const active = await (await fetch('http://127.0.0.1:5173/api/session', { headers: { Cookie: cookie } })).json();
  assert.equal(active.user.email, session.user.email);
  console.log('OK: реальный перезапуск сервера и замена папки сайта сохранили записи и личный вход.');
} catch (e) { console.error(e); process.exitCode = 1; }
finally { for (const child of children.reverse()) await stop(child); }
