import { readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
async function files(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  return (await Promise.all(entries.map(e => e.isDirectory() ? files(`${dir}/${e.name}`) : [`${dir}/${e.name}`]))).flat();
}
const directory = process.argv[2] || 'dist';
const paths = (await files(directory)).filter(p => !p.endsWith('/sw.js')).sort();
const hash = createHash('sha256');
for (const p of paths) hash.update(await readFile(p));
const name = `tiho-shell-${hash.digest('hex').slice(0, 12)}`;
const urls = paths.map(p => p.slice(directory.length));
await writeFile(`${directory}/sw.js`, `const CACHE=${JSON.stringify(name)};
const FILES=${JSON.stringify(urls)};
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('tiho-shell-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',e=>{
  const u=new URL(e.request.url);
  if(e.request.method!=='GET'||u.origin!==self.location.origin) return;
  if(e.request.mode==='navigate') {e.respondWith(fetch(e.request).catch(()=>caches.match('/index.html')));return;}
  if(FILES.includes(u.pathname)) e.respondWith(caches.open(CACHE).then(c=>c.match(u.pathname,{ignoreVary:true})).then(r=>r||fetch(e.request)));
});
`);
console.log('Офлайн-оболочка готова. Запросы к базе не кэшируются.');
