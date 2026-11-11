"""Small WSGI application. All record operations require a server-side session."""
import hmac
import json
import mimetypes
from pathlib import Path
import re
import secrets
import sqlite3
import sys
import time
from contextlib import closing
from http import HTTPStatus
from http.cookies import SimpleCookie
from urllib.parse import parse_qs, urlsplit

from .storage import (Problem, all_records, backup, bump, connect, data_directory, digest,
                      generation, get_helpers, json_text, migrate, now, password_hash, put_helpers, row_record, transaction,
                      validate_backup, validate_entry, validate_helpers, valid_date)

MAX_BODY = 32 * 1024 * 1024
COOKIE = 'tiho_session'
SESSION_SECONDS = 30 * 24 * 3600
TOKEN_RE = re.compile(r'^[a-zA-Z0-9_-]{16,128}$')


class App:
    def __init__(self, directory=None, static=None):
        self.directory = Path(directory or data_directory()).resolve()
        self.config = json.loads((self.directory / 'config.json').read_text(encoding='utf-8'))
        self.static = Path(static or Path(__file__).resolve().parents[1] / 'dist').resolve()
        self.origin = self.config['origin']
        self.host = urlsplit(self.origin).netloc
        self.secure = self.origin.startswith('https://')
        # Verify the data file exists. Deploying/restarting never creates a replacement DB.
        with closing(connect(self.directory)) as db:
            migrate(db)

    def __call__(self, env, start_response):
        status, headers = 200, []
        try:
            if env.get('HTTP_HOST', '') != self.host:
                raise Problem(400, 'Неверный адрес сайта.')
            if self.secure and env.get('wsgi.url_scheme') != 'https' and env.get('HTTP_X_FORWARDED_PROTO') != 'https':
                start_response('308 Permanent Redirect', [('Location', self.origin + '/'), ('Content-Length', '0'), ('Cache-Control', 'no-store')])
                return [b'']
            path = env.get('PATH_INFO', '/')
            if path.startswith('/api/'):
                with closing(connect(self.directory)) as db:
                    value, status, extra = self.api(db, env, path)
                body = json_text(value).encode('utf-8')
                headers = [('Content-Type', 'application/json; charset=utf-8'), ('Cache-Control', 'no-store'), *extra]
            else:
                body, mime = self.asset(path, env.get('REQUEST_METHOD'))
                headers = [('Content-Type', mime), ('Cache-Control', 'no-cache')]
        except Problem as e:
            status = e.status
            body = json_text({'error': e.message}).encode('utf-8')
            headers = [('Content-Type', 'application/json; charset=utf-8'), ('Cache-Control', 'no-store')]
        except (sqlite3.Error, OSError) as e:
            print(f'Tiho storage failure: {type(e).__name__}', file=sys.stderr)
            status = 503
            body = json_text({'error': 'Хранилище временно недоступно. Сервер не подтвердил сохранение.'}).encode()
            headers = [('Content-Type', 'application/json; charset=utf-8'), ('Cache-Control', 'no-store')]
        except Exception as e:
            print(f'Tiho request failure: {type(e).__name__}', file=sys.stderr)
            status = 500
            body = json_text({'error': 'Операция не выполнена. Повторите позже.'}).encode()
            headers = [('Content-Type', 'application/json; charset=utf-8'), ('Cache-Control', 'no-store')]
        headers += [('Content-Length', str(len(body))), ('X-Content-Type-Options', 'nosniff'),
                    ('Referrer-Policy', 'no-referrer'), ('X-Frame-Options', 'DENY'),
                    ('Permissions-Policy', 'camera=(), microphone=(), geolocation=()'),
                    ('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'")]
        if self.secure:
            headers.append(('Strict-Transport-Security', 'max-age=31536000'))
        start_response(f'{status} {HTTPStatus(status).phrase}', headers)
        return [body]

    def asset(self, path, method):
        if method != 'GET':
            raise Problem(405, 'Метод не поддерживается.')
        if path == '/':
            path = '/index.html'
        if path not in ('/index.html', '/favicon.svg', '/sw.js') and not path.startswith('/assets/'):
            raise Problem(404, 'Страница не найдена.')
        file = (self.static / path.lstrip('/')).resolve()
        if not file.is_relative_to(self.static) or not file.is_file():
            raise Problem(404, 'Файл не найден.')
        mime = mimetypes.guess_type(file.name)[0] or 'application/octet-stream'
        if file.suffix == '.js':
            mime = 'application/javascript'
        return file.read_bytes(), mime

    def body(self, env):
        try:
            length = int(env.get('CONTENT_LENGTH') or 0)
        except ValueError:
            raise Problem(400, 'Неверный размер запроса.')
        if length <= 0 or length > MAX_BODY:
            raise Problem(413, 'Файл или запрос слишком велик. Максимум — 32 МБ.')
        if env.get('CONTENT_TYPE', '').split(';')[0] != 'application/json':
            raise Problem(415, 'Поддерживается только JSON.')
        try:
            def reject(_):
                raise ValueError()
            value = json.loads(env['wsgi.input'].read(length), parse_constant=reject)
            if not isinstance(value, dict):
                raise ValueError()
            return value
        except (ValueError, UnicodeError, RecursionError):
            raise Problem(400, 'Не удалось прочитать JSON. Данные не изменены.')

    def session(self, db, env):
        cookie = SimpleCookie()
        try:
            cookie.load(env.get('HTTP_COOKIE', ''))
            token = cookie[COOKIE].value if COOKIE in cookie else ''
        except Exception:
            return None
        if not TOKEN_RE.fullmatch(token):
            return None
        return db.execute('SELECT * FROM sessions WHERE token_hash=? AND expires>?', (digest(token), int(time.time()))).fetchone()

    def cookie(self, token, age=SESSION_SECONDS):
        return ('Set-Cookie', f'{COOKIE}={token}; Path=/; Max-Age={age}; HttpOnly; SameSite=Strict' + ('; Secure' if self.secure else ''))

    def new_session(self, db, owner):
        token, csrf = secrets.token_urlsafe(32), secrets.token_urlsafe(32)
        db.execute('DELETE FROM sessions WHERE expires<=?', (int(time.time()),))
        db.execute('INSERT INTO sessions VALUES(?,?,?)', (digest(token), csrf, int(time.time()) + SESSION_SECONDS))
        return {'user': {'uid': self.config['siteId'], 'email': owner['email']}, 'siteId': self.config['siteId'], 'csrf': csrf, 'setupRequired': False}, 200, [self.cookie(token)]

    def throttle(self, db, env):
        key, t = digest(env.get('REMOTE_ADDR', 'unknown')), int(time.time())
        with transaction(db):
            row = db.execute('SELECT * FROM attempts WHERE key=?', (key,)).fetchone()
            if row and row['since'] > t - 900 and row['count'] >= 10:
                raise Problem(429, 'Слишком много попыток входа. Подождите 15 минут.')
            db.execute('INSERT OR REPLACE INTO attempts VALUES(?,?,?)', (key, (row['count'] + 1) if row and row['since'] > t - 900 else 1, row['since'] if row and row['since'] > t - 900 else t))
            db.execute('DELETE FROM attempts WHERE since<?', (t - 900,))

    def api(self, db, env, path):
        method = env.get('REQUEST_METHOD', 'GET')
        if method not in ('GET', 'POST', 'PUT', 'DELETE'):
            raise Problem(405, 'Метод не поддерживается.')
        if method != 'GET' and (env.get('HTTP_ORIGIN') != self.origin or env.get('HTTP_SEC_FETCH_SITE') == 'cross-site'):
            raise Problem(403, 'Запрос с другого сайта отклонён.')
        owner = db.execute('SELECT * FROM owner WHERE id=1').fetchone()
        session = self.session(db, env)
        if path == '/api/session' and method == 'GET':
            return {'user': {'uid': self.config['siteId'], 'email': owner['email']} if session and owner else None,
                    'siteId': self.config['siteId'], 'csrf': session['csrf'] if session else None, 'setupRequired': not bool(owner)}, 200, []
        if path in ('/api/login', '/api/setup') and method == 'POST':
            self.throttle(db, env)
            data = self.body(env)
            email, password = data.get('email'), data.get('password')
            if not isinstance(email, str) or not isinstance(password, str) or len(email) > 254 or len(password) > 256:
                raise Problem(400, 'Проверьте почту и пароль.')
            email = email.strip().casefold()
            if path == '/api/setup':
                if owner:
                    raise Problem(403, 'Личный вход уже создан. Регистрация закрыта.')
                token = data.get('setupToken', '')
                current_setup_hash = json.loads((self.directory / 'config.json').read_text(encoding='utf-8'))['bootstrapHash']
                if not isinstance(token, str) or not hmac.compare_digest(digest(token), current_setup_hash):
                    raise Problem(403, 'Неверный одноразовый код настройки.')
                if not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+', email) or len(password) < 12:
                    raise Problem(400, 'Введите почту и пароль длиной от 12 символов.')
                salt = secrets.token_hex(32)
                hashed = password_hash(password, salt)
                with transaction(db):
                    if db.execute('SELECT id FROM owner').fetchone():
                        raise Problem(403, 'Личный вход уже создан.')
                    current_setup_hash = json.loads((self.directory / 'config.json').read_text(encoding='utf-8'))['bootstrapHash']
                    if not hmac.compare_digest(digest(token), current_setup_hash):
                        raise Problem(403, 'Код настройки изменился. Используйте последний код из терминала.')
                    db.execute('INSERT INTO owner VALUES(1,?,?,?)', (email, salt, hashed))
                    db.execute('DELETE FROM attempts WHERE key=?', (digest(env.get('REMOTE_ADDR', 'unknown')),))
                    result = self.new_session(db, {'email': email})
                return result
            if not owner:
                raise Problem(401, 'Сначала создайте личный вход.')
            hashed = password_hash(password, owner['salt'])
            if not hmac.compare_digest(hashed, owner['password_hash']) or email != owner['email']:
                raise Problem(401, 'Не удалось войти. Проверьте почту и пароль.')
            with transaction(db):
                db.execute('DELETE FROM attempts WHERE key=?', (digest(env.get('REMOTE_ADDR', 'unknown')),))
                result = self.new_session(db, owner)
            return result
        if not session or not owner:
            raise Problem(401, 'Войдите в личный аккаунт.')
        if method != 'GET' and not hmac.compare_digest(env.get('HTTP_X_CSRF_TOKEN', ''), session['csrf']):
            raise Problem(403, 'Сессия изменилась. Обновите страницу и повторите.')
        if path == '/api/logout' and method == 'POST':
            db.execute('DELETE FROM sessions WHERE token_hash=?', (session['token_hash'],))
            return {'ok': True}, 200, [self.cookie('', 0)]
        if path == '/api/entries' and method == 'GET':
            return {'entries': all_records(db)}, 200, []
        if path == '/api/helpers':
            if method == 'GET':
                return {'helpers': get_helpers(db)}, 200, []
            if method == 'PUT':
                data = self.body(env)
                items = validate_helpers(data.get('items'))
                mutation = data.get('mutationId', '')
                if not isinstance(mutation, str) or not TOKEN_RE.fullmatch(mutation):
                    raise Problem(400, 'Неверный идентификатор операции.')
                with transaction(db):
                    old = get_helpers(db)
                    if old and old['mutationId'] == mutation:
                        return {'helpers': old}, 200, []
                    if (old['revision'] if old else None) != data.get('revision'):
                        raise Problem(409, 'На другом устройстве список уже изменён. Ваш черновик сохранён здесь.')
                    result = put_helpers(db, items, mutation)
                    bump(db)
                return {'helpers': result}, 200, []
        if path.startswith('/api/entries/'):
            date = path.removeprefix('/api/entries/')
            if not valid_date(date):
                raise Problem(400, 'Неверная дата.')
            if method == 'GET':
                row = db.execute('SELECT * FROM entries WHERE date=?', (date,)).fetchone()
                return {'entry': row_record(row) if row else None}, 200, []
            if method in ('PUT', 'DELETE'):
                data = self.body(env)
                if method == 'PUT':
                    entry = validate_entry(data.get('entry'))
                    mutation = data.get('mutationId', '')
                    if entry['date'] != date or not isinstance(mutation, str) or not TOKEN_RE.fullmatch(mutation):
                        raise Problem(400, 'Неверная дата или идентификатор операции.')
                with transaction(db):
                    old = db.execute('SELECT * FROM entries WHERE date=?', (date,)).fetchone()
                    if method == 'PUT' and old and old['mutation_id'] == mutation:
                        return {'entry': row_record(old)}, 200, []
                    if method == 'DELETE' and not old:
                        return {'ok': True}, 200, []
                    if (old['revision'] if old else None) != data.get('revision'):
                        raise Problem(409, 'На другом устройстве есть более новая запись. Ваш черновик сохранён здесь.')
                    if method == 'DELETE':
                        db.execute('DELETE FROM entries WHERE date=?', (date,))
                        bump(db)
                        return {'ok': True}, 200, []
                    db.execute('INSERT OR REPLACE INTO entries VALUES(?,?,?,?,?,?)',
                               (date, json_text(entry), old['version'] + 1 if old else 1, secrets.token_hex(16), mutation, now()))
                    bump(db)
                    result = row_record(db.execute('SELECT * FROM entries WHERE date=?', (date,)).fetchone())
                return {'entry': result}, 200, []
        if path == '/api/backup' and method == 'GET':
            with transaction(db):
                result = backup(db)
            return result, 200, [('Content-Disposition', 'attachment; filename="tiho-backup.json"')]
        if path in ('/api/restore/preview', '/api/restore') and method == 'POST':
            data = self.body(env)
            checked = validate_backup(data.get('backup'))
            entries, helpers = checked['entries'], checked['helpers']
            if path.endswith('/preview'):
                with transaction(db):
                    dates = {r[0] for r in db.execute('SELECT date FROM entries')}
                    matching = sum(e['date'] in dates for e in entries)
                    current_helpers = (get_helpers(db) or {}).get('items', [])
                    result = {'total': len(entries), 'existing': matching, 'new': len(entries) - matching,
                              'current': len(dates), 'generation': generation(db),
                              'hasHelpers': helpers is not None, 'helperCount': len(helpers or []),
                              'mergedHelperCount': len(dict.fromkeys(current_helpers + (helpers or []))),
                              'hasOldDrafts': bool(data['backup'].get('deviceDrafts'))}
                return result, 200, []
            mode, operation = data.get('mode'), data.get('operationId', '')
            if mode not in ('merge', 'replace') or not isinstance(operation, str) or not TOKEN_RE.fullmatch(operation):
                raise Problem(400, 'Неверный способ восстановления.')
            fingerprint = digest(json_text({'mode': mode, 'entries': entries, 'helpers': helpers}))
            with transaction(db):
                prior = db.execute('SELECT * FROM restores WHERE id=?', (operation,)).fetchone()
                if prior:
                    if prior['fingerprint'] != fingerprint:
                        raise Problem(409, 'Идентификатор восстановления уже использован.')
                    return json.loads(prior['result']), 200, []
                if type(data.get('expectedGeneration')) is not int or data['expectedGeneration'] != generation(db):
                    raise Problem(409, 'История изменилась после выбора файла. Выберите копию заново.')
                helper_items = helpers
                if helpers is not None and mode == 'merge':
                    helper_items = list(dict.fromkeys((get_helpers(db) or {}).get('items', []) + helpers))
                    validate_helpers(helper_items)
                # The safety snapshot and replacement commit atomically with the restored entries.
                db.execute('INSERT INTO recovery_snapshots(created_at,payload) VALUES(?,?)', (now(), json_text(backup(db))))
                db.execute('DELETE FROM recovery_snapshots WHERE id NOT IN (SELECT id FROM recovery_snapshots ORDER BY id DESC LIMIT 3)')
                if mode == 'replace':
                    db.execute('DELETE FROM entries')
                restored = skipped = 0
                for entry in entries:
                    old = db.execute('SELECT date FROM entries WHERE date=?', (entry['date'],)).fetchone()
                    if old:
                        skipped += 1
                        continue
                    db.execute('INSERT INTO entries VALUES(?,?,?,?,?,?)',
                               (entry['date'], json_text(entry), 1, secrets.token_hex(16), secrets.token_hex(16), now()))
                    restored += 1
                if helper_items is not None:
                    put_helpers(db, helper_items, secrets.token_hex(16))
                bump(db)
                result = {'restored': restored, 'skipped': skipped, 'generation': generation(db),
                          'helpersRestored': len(helper_items) if helper_items is not None else None}
                db.execute('INSERT INTO restores VALUES(?,?,?)', (operation, fingerprint, json_text(result)))
                db.execute('DELETE FROM restores WHERE id NOT IN (SELECT id FROM restores ORDER BY rowid DESC LIMIT 100)')
            return result, 200, []
        raise Problem(404, 'Операция не найдена.')


def create_app(directory=None, static=None):
    return App(directory, static)
