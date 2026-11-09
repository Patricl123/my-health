import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import { python } from './python.mjs';
await access('dist/sw.js');
const code = `from pathlib import Path
import zipfile
with zipfile.ZipFile('tiho-site.zip','w',zipfile.ZIP_DEFLATED) as archive:
    for directory in ('server','dist'):
        for file in Path(directory).rglob('*'):
            if file.is_file() and '__pycache__' not in file.parts and file.suffix not in ('.pyc','.sqlite3'):
                archive.write(file,file.as_posix())
    archive.write('deploy/wsgi.example.py','wsgi.py')
print('Готово: tiho-site.zip. Архив содержит сайт и сервер; паролей, базы и локальных настроек в нём нет.')`;
const p = spawn(python(), ['-c', code], { windowsHide: true, stdio: 'inherit', env: { ...process.env, PYTHONUTF8: '1' } });
p.on('exit', code => { process.exitCode = code || 0; });
