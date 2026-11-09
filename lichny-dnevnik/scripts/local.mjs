import { spawn } from 'node:child_process';
import path from 'node:path';
import { python } from './python.mjs';
const command = process.argv[2];
const directory = process.env.TIHO_DATA_DIR || path.resolve('server-data');
const args = ['-m', 'server.manage', command, '--data-dir', directory];
if (command === 'init') args.push('--origin', process.env.TIHO_ORIGIN || 'http://127.0.0.1:8000');
const p = spawn(python(), args, { windowsHide: true, stdio: 'inherit' });
p.on('exit', code => { process.exitCode = code || 0; });
