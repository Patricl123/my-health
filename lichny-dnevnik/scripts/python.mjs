import { spawnSync } from 'node:child_process';
import path from 'node:path';
export function python() {
  const candidates = [process.env.PYTHON_EXE,
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Python/pythoncore-3.14-64/python.exe'),
    'python3', 'python'].filter(Boolean);
  for (const executable of candidates) {
    const p = spawnSync(executable, ['-c', 'import sys; sys.exit(0 if sys.version_info >= (3, 11) else 1)'], { windowsHide: true, stdio: 'ignore', timeout: 5000 });
    if (p.status === 0) return executable;
  }
  throw new Error('Нужен Python 3.11 или новее. Задайте PYTHON_EXE с путём к python.exe.');
}
