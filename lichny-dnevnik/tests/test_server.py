import io
import json
import secrets
import sqlite3
import tempfile
import unittest
from contextlib import closing
from pathlib import Path
from unittest.mock import patch

from server.app import create_app
from server.storage import connect, initialize


class ServerTests(unittest.TestCase):
    def setUp(self):
        runtime = Path('.test-runtime').resolve()
        runtime.mkdir(exist_ok=True)
        self.temp = tempfile.TemporaryDirectory(dir=runtime)
        self.data = Path(self.temp.name) / 'persistent-data'
        self.token = initialize(self.data, 'https://diary.example')
        self.app = create_app(self.data)
        self.cookie, self.csrf = '', ''

    def tearDown(self):
        self.temp.cleanup()

    def call(self, path, method='GET', data=None, auth=True, origin='https://diary.example', csrf=True, app=None):
        raw = json.dumps(data).encode() if data is not None else b''
        env = {'PATH_INFO': path, 'REQUEST_METHOD': method, 'wsgi.input': io.BytesIO(raw),
               'wsgi.url_scheme': 'https', 'CONTENT_LENGTH': str(len(raw)), 'CONTENT_TYPE': 'application/json',
               'HTTP_HOST': 'diary.example', 'HTTP_ORIGIN': origin, 'REMOTE_ADDR': '127.0.0.1'}
        if auth:
            env['HTTP_COOKIE'] = self.cookie
        if csrf:
            env['HTTP_X_CSRF_TOKEN'] = self.csrf
        captured = {}
        def start(status, headers):
            captured.update(status=int(status.split()[0]), headers=dict(headers))
        body = b''.join((app or self.app)(env, start))
        value = json.loads(body) if body and 'application/json' in captured['headers'].get('Content-Type', '') else body
        return captured['status'], value, captured['headers']

    def setup_owner(self):
        code, body, headers = self.call('/api/setup', 'POST', {'email': 'owner@example.test', 'password': 'Strong-test-password-2026', 'setupToken': self.token})
        self.assertEqual(code, 200)
        self.cookie = headers['Set-Cookie'].split(';')[0]
        self.csrf = body['csrf']
        return headers

    def entry(self, date='2026-11-09', diary='Личные мысли'):
        return dict(date=date, stress=None, mood='', note='', diary=diary, meals=[])

    def save(self, entry=None, revision=None):
        entry = entry or self.entry()
        code, body, _ = self.call('/api/entries/' + entry['date'], 'PUT', {'entry': entry, 'revision': revision, 'mutationId': secrets.token_hex(16)})
        self.assertEqual(code, 200, body)
        return body['entry']

    def test_owner_setup_is_single_use_and_private_cookie(self):
        self.assertEqual(self.call('/api/setup', 'POST', {'email': 'bad@example.test', 'password': 'Strong-test-password-2026', 'setupToken': 'wrong'})[0], 403)
        headers = self.setup_owner()
        for flag in ['HttpOnly', 'Secure', 'SameSite=Strict']:
            self.assertIn(flag, headers['Set-Cookie'])
        self.assertEqual(self.call('/api/setup', 'POST', {'email': 'other@example.test', 'password': 'Strong-test-password-2026', 'setupToken': self.token})[0], 403)
        with closing(connect(self.data)) as db:
            stored = db.execute('SELECT password_hash FROM owner').fetchone()[0]
            self.assertNotIn('Strong-test-password', stored)
            raw_token = self.cookie.split('=')[1]
            self.assertNotEqual(db.execute('SELECT token_hash FROM sessions').fetchone()[0], raw_token)

    def test_anonymous_csrf_and_cross_site_are_denied(self):
        self.setup_owner()
        for path in ['/api/entries', '/api/entries/2026-11-09', '/api/backup']:
            self.assertEqual(self.call(path, auth=False)[0], 401)
        for path, method in [('/api/entries/2026-11-09', 'PUT'), ('/api/restore', 'POST'), ('/api/restore/preview', 'POST')]:
            self.assertEqual(self.call(path, method, {}, auth=False)[0], 401)
            self.assertEqual(self.call(path, method, {}, csrf=False)[0], 403)
            self.assertEqual(self.call(path, method, {}, origin='https://attacker.example')[0], 403)
        self.assertEqual(self.call('/api/login', 'POST', {'email': 'other@example.test', 'password': 'Strong-test-password-2026'})[0], 401)
        self.assertEqual(self.call('/diary.sqlite3')[0], 404)
        self.assertEqual(self.call('/server/app.py')[0], 404)
        self.assertEqual(self.call('/assets/../../server/app.py')[0], 404)

    def test_restart_and_code_replacement_keep_database_and_sessions(self):
        self.setup_owner()
        record = self.save()
        replacement = Path(self.temp.name) / 'new-release'
        replacement.mkdir()
        replacement.joinpath('index.html').write_text('Обновлённый сайт', encoding='utf-8')
        restarted = create_app(self.data, replacement)
        code, body, _ = self.call('/api/entries/2026-11-09', app=restarted)
        self.assertEqual(code, 200)
        self.assertEqual(body['entry'], record)
        self.assertEqual(self.call('/', app=restarted)[1].decode(), 'Обновлённый сайт')
        self.assertEqual(self.call('/api/session', app=restarted)[1]['user']['email'], 'owner@example.test')
        with self.assertRaises(ValueError):
            initialize(self.data, 'https://diary.example')
        missing = self.data / 'diary.sqlite3'
        moved = self.data / 'original.sqlite3'
        missing.rename(moved)
        with self.assertRaises(sqlite3.OperationalError):
            create_app(self.data)
        self.assertFalse(missing.exists())
        moved.rename(missing)

    def test_validation_conflict_and_retry(self):
        self.setup_owner()
        e = self.entry()
        payload = {'entry': e, 'revision': None, 'mutationId': secrets.token_hex(16)}
        code, first, _ = self.call('/api/entries/' + e['date'], 'PUT', payload)
        self.assertEqual(code, 200)
        self.assertEqual(self.call('/api/entries/' + e['date'], 'PUT', payload)[1], first)
        bad = dict(payload, entry=dict(e, stress=99), mutationId=secrets.token_hex(16))
        self.assertEqual(self.call('/api/entries/' + e['date'], 'PUT', bad)[0], 400)
        self.assertEqual(self.call('/api/entries/' + e['date'], 'PUT', dict(payload, mutationId=secrets.token_hex(16)))[0], 409)
        malformed = dict(payload, entry=dict(e, meals=[{'id': 'a', 'time': '30:99', 'description': 'еда'}]))
        self.assertEqual(self.call('/api/entries/' + e['date'], 'PUT', malformed)[0], 400)

    def test_restore_validation_atomicity_and_stale_preview(self):
        self.setup_owner()
        self.save()
        copy = {'format': 'tiho-backup', 'formatVersion': 1, 'entries': [self.entry('2026-01-08', 'Из копии')]}
        preview = self.call('/api/restore/preview', 'POST', {'backup': copy})[1]
        data = {'backup': copy, 'mode': 'replace', 'expectedGeneration': preview['generation'], 'operationId': secrets.token_hex(16)}
        with patch('server.app.bump', side_effect=sqlite3.OperationalError('injected disk failure')):
            self.assertEqual(self.call('/api/restore', 'POST', data)[0], 503)
        self.assertEqual([e['date'] for e in self.call('/api/entries')[1]['entries']], ['2026-11-09'])
        self.assertEqual(self.call('/api/restore', 'POST', data)[0], 200)
        self.assertEqual(self.call('/api/restore', 'POST', data)[1]['restored'], 1)
        self.assertEqual(self.call('/api/entries')[1]['entries'][0]['diary'], 'Из копии')
        with closing(connect(self.data)) as db:
            snapshot = json.loads(db.execute('SELECT payload FROM recovery_snapshots').fetchone()[0])
            self.assertEqual(snapshot['entries'][0]['date'], '2026-11-09')
        data['operationId'] = secrets.token_hex(16)
        self.assertEqual(self.call('/api/restore', 'POST', data)[0], 409)
        broken = dict(copy, entries=[self.entry(), dict(self.entry('2026-01-01'), stress=-1)])
        self.assertEqual(self.call('/api/restore/preview', 'POST', {'backup': broken})[0], 400)
        self.assertEqual(len(self.call('/api/entries')[1]['entries']), 1)

    def test_logout_revokes_session_and_throttle_survives_restart(self):
        self.setup_owner()
        self.assertEqual(self.call('/api/logout', 'POST', {})[0], 200)
        self.assertEqual(self.call('/api/backup')[0], 401)
        for _ in range(10):
            self.assertEqual(self.call('/api/login', 'POST', {'email': 'owner@example.test', 'password': 'wrong'})[0], 401)
        restarted = create_app(self.data)
        self.assertEqual(self.call('/api/login', 'POST', {'email': 'owner@example.test', 'password': 'wrong'}, app=restarted)[0], 429)


if __name__ == '__main__':
    unittest.main()
