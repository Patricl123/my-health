import { createInterface } from 'node:readline/promises';
import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
const run = (file, args) => new Promise((resolve, reject) => {
  const p = spawn(process.execPath, [file, ...args], { stdio: 'inherit', windowsHide: true });
  p.on('error', reject); p.on('exit', c => c === 0 ? resolve() : reject(new Error(`Команда завершилась с кодом ${c}.`)));
});
try {
  const env = await readFile('.env.local', 'utf8');
  const rules = await readFile('firestore.rules', 'utf8');
  const uid = env.match(/^VITE_OWNER_UID="?([\w-]+)/m)?.[1];
  const project = env.match(/^VITE_FIREBASE_PROJECT_ID="?([\w-]+)/m)?.[1];
  if (!uid || !project || rules.includes('OWNER_UID') || !rules.includes(`request.auth.uid == '${uid}'`) || /VITE_.*EMULATOR/.test(env)) throw new Error('Сначала выполните npm.cmd run setup. Правила и аккаунт должны совпадать.');
  const firebase = JSON.parse(await readFile('firebase.json', 'utf8'));
  if (firebase.functions || firebase.apphosting || firebase.storage || firebase.extensions) throw new Error('Публикация остановлена: в конфигурации найдены дополнительные сервисы.');
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(`Проверьте в Firebase Console проект ${project}: тариф Spark, Billing не подключён. Введите SPARK для публикации: `); rl.close();
  if (answer.trim() !== 'SPARK') throw new Error('Публикация отменена.');
  await run('node_modules/typescript/bin/tsc', ['-b']);
  await run('node_modules/vite/bin/vite.js', ['build', '--mode', 'production']);
  await run('scripts/service-worker.mjs', []);
  await run('node_modules/firebase-tools/lib/bin/firebase.js', ['deploy', '--project', project, '--only', 'firestore:rules,firestore:indexes,hosting']);
  console.log(`Дневник опубликован: https://${project}.web.app`);
} catch (e) { console.error(e.message); process.exitCode = 1; }
