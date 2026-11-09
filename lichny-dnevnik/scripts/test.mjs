import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { openSync, closeSync } from 'node:fs';
const root = process.cwd(); const children = [];
const env = { ...process.env, XDG_CONFIG_HOME: path.join(root, '.cache/firebase-config'), FIREBASE_EMULATORS_PATH: path.join(root, '.cache/firebase/emulators'), FIREBASE_CLI_DISABLE_TELEMETRY: 'true', CI: 'true' };
const start = (file, args, quiet = false) => {
  const fd = quiet ? openSync('.test-runtime/emulators.log', 'w') : null;
  const p = spawn(process.execPath, [file, ...args], { stdio: fd === null ? 'inherit' : ['ignore', fd, fd], windowsHide: true, env });
  if (fd !== null) closeSync(fd);
  children.push(p); return p;
};
const run = async (file, args) => { const p = start(file, args); const code = await new Promise(r => p.on('exit', r)); if (code !== 0) throw new Error(`Сборка тестового сайта завершилась с кодом ${code}`); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(url, child) {
  for (let i = 0; i < 240; i++) {
    if (child.exitCode !== null) throw new Error('Сервер завершился до запуска.');
    try { const r = await fetch(url); if (r.status < 500) return; } catch {}
    await sleep(500);
  }
  throw new Error(`Сервер не запустился: ${url}`);
}
try {
  await mkdir('.test-runtime', { recursive: true }); await mkdir('.cache/firebase/emulators', { recursive: true });
  for (const port of [9099, 8080, 5173]) {
    let occupied = false;
    try { await fetch(`http://127.0.0.1:${port}`, { signal: AbortSignal.timeout(500) }); occupied = true; } catch {}
    if (occupied) throw new Error(`Порт ${port} уже занят. Остановите предыдущий локальный сервер перед тестами.`);
  }
  const original = await readFile('firestore.rules', 'utf8');
  const rules = original.replace(/request\.auth\.uid == '[a-zA-Z0-9_-]+'/g, "request.auth.uid == 'test-owner'");
  await writeFile('.test-runtime/firestore.rules', rules);
  await writeFile('.test-runtime/firebase.json', JSON.stringify({ firestore: { rules: 'firestore.rules' }, emulators: { auth: { host: '127.0.0.1', port: 9099 }, firestore: { host: '127.0.0.1', port: 8080 }, ui: { enabled: false }, hub: { host: '127.0.0.1', port: 4400 }, logging: { host: '127.0.0.1', port: 4500 }, singleProjectMode: true } }));
  console.log('Запуск локальных Authentication и Firestore. Журнал: .test-runtime/emulators.log');
  const emulators = start('node_modules/firebase-tools/lib/bin/firebase.js', ['emulators:start', '--only', 'auth,firestore', '--project', 'demo-tiho', '--config', '.test-runtime/firebase.json', '--non-interactive'], true);
  await waitFor('http://127.0.0.1:9099', emulators); await waitFor('http://127.0.0.1:8080', emulators);
  for (const [localId, email] of [['test-owner', 'owner@example.test'], ['test-other', 'other@example.test']]) {
    const res = await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/projects/demo-tiho/accounts', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' }, body: JSON.stringify({ localId, email, password: 'Test-only-password-2026', emailVerified: true }) });
    if (!res.ok) throw new Error(`Не удалось создать тестовый аккаунт: ${await res.text()}`);
  }
  await writeFile('.env.emulator', 'VITE_FIREBASE_API_KEY=demo-key\nVITE_FIREBASE_PROJECT_ID=demo-tiho\nVITE_FIREBASE_AUTH_DOMAIN=demo-tiho.firebaseapp.com\nVITE_FIREBASE_APP_ID=demo-app\nVITE_OWNER_UID=test-owner\n');
  await run('node_modules/vite/bin/vite.js', ['build', '--mode', 'emulator', '--outDir', '.test-runtime/dist']);
  await run('scripts/service-worker.mjs', ['.test-runtime/dist']);
  const vite = start('node_modules/vite/bin/vite.js', ['preview', '--outDir', '.test-runtime/dist', '--host', '127.0.0.1', '--port', '5173', '--strictPort']);
  await waitFor('http://127.0.0.1:5173', vite);
  const tests = start('node_modules/@playwright/test/cli.js', ['test']);
  const exit = await new Promise(r => tests.on('exit', r));
  if (exit !== 0) throw new Error('Проверки не пройдены. См. test-results.');
} catch (e) { console.error(e); process.exitCode = 1; }
finally {
  for (const p of children.reverse()) {
    if (p.exitCode !== null) continue;
    if (process.platform === 'win32') await new Promise(resolve => {
      const killer = spawn('taskkill', ['/pid', String(p.pid), '/t', '/f'], { windowsHide: true, stdio: 'ignore' });
      killer.on('exit', resolve); killer.on('error', resolve);
    });
    else p.kill('SIGTERM');
  }
}
