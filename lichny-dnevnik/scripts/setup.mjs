import { createInterface } from 'node:readline/promises';
import { readFile, writeFile } from 'node:fs/promises';
const rl = createInterface({ input: process.stdin, output: process.stdout });
try {
  console.log('Настройка бесплатного Firebase Spark. Пароли и платёжные данные не нужны.');
  console.log('Вставьте только объект firebaseConfig из настроек веб-приложения Firebase (можно в несколько строк).');
  console.log('Завершите ввод отдельной строкой КОНЕЦ.');
  const lines = [];
  while (true) { const line = await rl.question(''); if (line.trim() === 'КОНЕЦ') break; lines.push(line); }
  const source = lines.join('\n');
  const pick = key => source.match(new RegExp(`["']?${key}["']?\\s*:\\s*["']([^"']+)["']`))?.[1];
  const config = Object.fromEntries(['apiKey', 'authDomain', 'projectId', 'appId'].map(k => [k, pick(k)]));
  if (Object.values(config).some(v => !v)) throw new Error('Не найдены apiKey, authDomain, projectId или appId. Скопируйте полный объект firebaseConfig.');
  if (!/^[a-z][a-z0-9-]{4,61}[a-z0-9]$/.test(config.projectId)) throw new Error('Неверный projectId.');
  if (config.projectId.startsWith('demo-')) throw new Error('Для публикации нужен настоящий Firebase-проект.');
  const uid = (await rl.question('UID вашего пользователя из Authentication → Users: ')).trim();
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(uid) || uid === 'OWNER_UID') throw new Error('Неверный UID.');
  const plan = (await rl.question('В консоли указан Spark и нет платёжного аккаунта? Введите SPARK: ')).trim();
  if (plan !== 'SPARK') throw new Error('Настройка остановлена. Сначала проверьте бесплатный тариф Spark.');
  const values = { VITE_FIREBASE_API_KEY: config.apiKey, VITE_FIREBASE_AUTH_DOMAIN: config.authDomain, VITE_FIREBASE_PROJECT_ID: config.projectId, VITE_FIREBASE_APP_ID: config.appId, VITE_OWNER_UID: uid };
  if (Object.values(values).some(v => /[\r\n"'\\]/.test(v))) throw new Error('Некорректные символы в конфигурации.');
  const rules = await readFile('firestore.rules', 'utf8');
  const nextRules = rules.replace(/request\.auth\.uid == '[a-zA-Z0-9_-]+'/g, `request.auth.uid == '${uid}'`);
  await writeFile('.env.local', Object.entries(values).map(([k, v]) => `${k}="${v}"`).join('\n') + '\n');
  await writeFile('firestore.rules', nextRules);
  await writeFile('.firebaserc', JSON.stringify({ projects: { default: config.projectId } }, null, 2) + '\n');
  console.log('Готово. Следующие команды: npx.cmd firebase login, затем npm.cmd run deploy');
} catch (e) { console.error(e.message); process.exitCode = 1; } finally { rl.close(); }
