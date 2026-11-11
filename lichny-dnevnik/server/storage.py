import datetime as dt
import hashlib
import json
import math
import os
from pathlib import Path
import secrets
import sqlite3
import tempfile
from contextlib import contextmanager, closing
from urllib.parse import urlsplit

ITERATIONS = 600_000
ENTRY_KEYS = ('date', 'stress', 'mood', 'note', 'diary', 'meals')
HELPERS_SCHEMA = '''CREATE TABLE IF NOT EXISTS helpers (
  id INTEGER PRIMARY KEY CHECK(id=1), items TEXT NOT NULL, version INTEGER NOT NULL,
  revision TEXT NOT NULL, mutation_id TEXT NOT NULL, updated_at TEXT NOT NULL
);'''


class Problem(Exception):
    def __init__(self, status, message):
        self.status, self.message = status, message


def json_text(value):
    return json.dumps(value, ensure_ascii=False, separators=(',', ':'), allow_nan=False)


def now():
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec='milliseconds')


def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()


def password_hash(password, salt):
    return hashlib.pbkdf2_hmac('sha256', password.encode(), bytes.fromhex(salt), ITERATIONS).hex()


def data_directory():
    return Path(os.environ.get('TIHO_DATA_DIR', str(Path.home() / 'tiho-data'))).resolve()


def validate_origin(origin):
    parts = urlsplit(origin)
    if parts.username or parts.password or parts.query or parts.fragment or parts.path not in ('', '/'):
        raise ValueError('Укажите только адрес сайта, без пути и параметров.')
    if parts.scheme != 'https' and not (parts.scheme == 'http' and parts.hostname in ('127.0.0.1', 'localhost')):
        raise ValueError('Нужен HTTPS. HTTP разрешён только для локальной разработки.')
    if not parts.hostname:
        raise ValueError('Не указан адрес сайта.')
    return f'{parts.scheme}://{parts.netloc}'.rstrip('/')


SCHEMA = '''
CREATE TABLE IF NOT EXISTS owner (
  id INTEGER PRIMARY KEY CHECK(id=1), email TEXT NOT NULL,
  salt TEXT NOT NULL, password_hash TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS entries (
  date TEXT PRIMARY KEY, payload TEXT NOT NULL, version INTEGER NOT NULL,
  revision TEXT NOT NULL, mutation_id TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY, csrf TEXT NOT NULL, expires INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS attempts (key TEXT PRIMARY KEY, count INTEGER NOT NULL, since INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS meta (id INTEGER PRIMARY KEY CHECK(id=1), generation INTEGER NOT NULL);
INSERT OR IGNORE INTO meta(id,generation) VALUES(1,0);
CREATE TABLE IF NOT EXISTS recovery_snapshots (id INTEGER PRIMARY KEY, created_at TEXT NOT NULL, payload TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS restores (id TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, result TEXT NOT NULL);
PRAGMA user_version=2;
''' + HELPERS_SCHEMA


def initialize(directory, origin):
    directory = Path(directory).resolve()
    # A separate directory protects the database from replacement of the release.
    origin = validate_origin(origin)
    directory.mkdir(parents=True, exist_ok=True, mode=0o700)
    config_path = directory / 'config.json'
    if config_path.exists() or (directory / 'diary.sqlite3').exists():
        raise ValueError('Данные уже существуют. Инициализация не изменяет существующий дневник.')
    token = secrets.token_urlsafe(32)
    config = {'siteId': secrets.token_hex(16), 'origin': origin, 'bootstrapHash': digest(token), 'schema': 1}
    with closing(sqlite3.connect(directory / 'diary.sqlite3')) as db:
        db.executescript(SCHEMA)
    with config_path.open('x', encoding='utf-8') as f:
        json.dump(config, f)
    for p in (directory, config_path, directory / 'diary.sqlite3'):
        try:
            p.chmod(0o700 if p.is_dir() else 0o600)
        except OSError:
            pass
    return token


def connect(directory):
    # mode=rw refuses to silently replace a missing disk/database with an empty one.
    path = (Path(directory) / 'diary.sqlite3').resolve()
    db = sqlite3.connect(path.as_uri() + '?mode=rw', uri=True, timeout=10, isolation_level=None)
    db.row_factory = sqlite3.Row
    db.execute('PRAGMA busy_timeout=10000')
    db.execute('PRAGMA synchronous=FULL')
    db.execute('PRAGMA foreign_keys=ON')
    # Use a rollback journal on the persistent local filesystem, with full sync.
    return db


def prepare_setup(directory, origin):
    """Initialize once, or resume onboarding without replacing the data file."""
    directory = Path(directory).resolve()
    config_path = directory / 'config.json'
    database_path = directory / 'diary.sqlite3'
    if not config_path.exists() and not database_path.exists():
        token = initialize(directory, origin)
        return {'token': token, 'origin': validate_origin(origin), 'existing': False, 'account_created': False}
    if not config_path.is_file() or not database_path.is_file():
        raise ValueError('Найдены неполные данные настройки. Файлы оставлены без изменений; требуется проверить папку данных.')
    config = json.loads(config_path.read_text(encoding='utf-8'))
    with closing(connect(directory)) as db, transaction(db):
        if db.execute('PRAGMA user_version').fetchone()[0] not in (1, 2):
            raise ValueError('Неподдерживаемая версия базы. Данные оставлены без изменений.')
        if db.execute('SELECT id FROM owner WHERE id=1').fetchone():
            return {'token': None, 'origin': config['origin'], 'existing': True, 'account_created': True}
        token = secrets.token_urlsafe(32)
        config['bootstrapHash'] = digest(token)
        temporary_path = None
        try:
            with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8', dir=directory, prefix='.setup-', suffix='.tmp', delete=False) as f:
                temporary_path = Path(f.name)
                json.dump(config, f)
                f.flush()
                os.fsync(f.fileno())
            os.replace(temporary_path, config_path)
        finally:
            if temporary_path is not None:
                temporary_path.unlink(missing_ok=True)
        db.execute('DELETE FROM attempts')
    return {'token': token, 'origin': config['origin'], 'existing': True, 'account_created': False}


@contextmanager
def transaction(db):
    db.execute('BEGIN IMMEDIATE')
    try:
        yield
        db.commit()
    except BaseException:
        db.rollback()
        raise


def migrate(db):
    # Upgrade in place, in a single transaction, without replacing any diary data.
    with transaction(db):
        version = db.execute('PRAGMA user_version').fetchone()[0]
        if version not in (1, 2):
            raise RuntimeError('Неподдерживаемая версия базы. Нужна миграция.')
        if version == 1:
            db.execute(HELPERS_SCHEMA)
            db.execute('PRAGMA user_version=2')


def valid_date(value):
    try:
        return isinstance(value, str) and len(value) == 10 and dt.date.fromisoformat(value).isoformat() == value
    except ValueError:
        return False


def validate_entry(value):
    if not isinstance(value, dict) or not all(k in value for k in ENTRY_KEYS):
        raise Problem(400, 'В записи отсутствуют обязательные поля формата.')
    e = {k: value[k] for k in ENTRY_KEYS}
    e.update(tags=value.get('tags', []), sleepHours=value.get('sleepHours'), energy=value.get('energy'))
    if not valid_date(e['date']):
        raise Problem(400, 'Неверная дата записи.')
    if e['stress'] is not None and (type(e['stress']) is not int or not 0 <= e['stress'] <= 10):
        raise Problem(400, 'Стресс должен быть от 0 до 10 или не отмечен.')
    if e['mood'] not in ('', 'great', 'good', 'neutral', 'sad', 'hard'):
        raise Problem(400, 'Неверное настроение.')
    sleep = e['sleepHours']
    if sleep is not None and (type(sleep) not in (int, float) or not math.isfinite(sleep) or not 0 <= sleep <= 24 or sleep * 2 != round(sleep * 2)):
        raise Problem(400, 'Сон: от 0 до 24 часов с шагом полчаса, либо оставьте поле пустым.')
    if e['energy'] is not None and (type(e['energy']) is not int or not 0 <= e['energy'] <= 10):
        raise Problem(400, 'Энергия должна быть от 0 до 10 или не отмечена.')
    if not isinstance(e['tags'], list) or len(e['tags']) > 10 or any(not isinstance(t, str) or not 1 <= len(t.strip()) <= 32 for t in e['tags']):
        raise Problem(400, 'Можно добавить до 10 меток по 32 символа.')
    e['tags'] = [t.strip() for t in e['tags']]
    if len({t.casefold() for t in e['tags']}) != len(e['tags']):
        raise Problem(400, 'Метки не должны повторяться.')
    for name, limit in [('note', 5000), ('diary', 50000)]:
        if not isinstance(e[name], str) or len(e[name]) > limit:
            raise Problem(400, 'Текст записи превышает допустимый размер.')
    if not isinstance(e['meals'], list) or len(e['meals']) > 40:
        raise Problem(400, 'Допустимо до 40 приёмов пищи в день.')
    ids = set()
    for meal in e['meals']:
        if not isinstance(meal, dict) or set(meal) != {'id', 'time', 'description'}:
            raise Problem(400, 'Некорректный формат приёма пищи.')
        if not isinstance(meal['id'], str) or not 1 <= len(meal['id']) <= 128 or meal['id'] in ids:
            raise Problem(400, 'Некорректный идентификатор приёма пищи.')
        ids.add(meal['id'])
        try:
            t = dt.time.fromisoformat(meal['time'])
            if len(meal['time']) != 5 or t.second:
                raise ValueError()
        except (ValueError, TypeError):
            raise Problem(400, 'Укажите время приёма пищи в формате ЧЧ:ММ.')
        if not isinstance(meal['description'], str) or not 1 <= len(meal['description'].strip()) <= 2000:
            raise Problem(400, 'Описание приёма пищи должно содержать от 1 до 2000 символов.')
    return e


def row_record(row):
    payload = json.loads(row['payload'])
    return dict(payload, tags=payload.get('tags', []), sleepHours=payload.get('sleepHours'), energy=payload.get('energy'),
                version=row['version'], revision=row['revision'],
                mutationId=row['mutation_id'], updatedAt=row['updated_at'])


def all_records(db):
    return [row_record(row) for row in db.execute('SELECT * FROM entries ORDER BY date DESC')]


def generation(db):
    return db.execute('SELECT generation FROM meta WHERE id=1').fetchone()[0]


def bump(db):
    db.execute('UPDATE meta SET generation=generation+1 WHERE id=1')


def backup(db):
    helpers = get_helpers(db)
    return {'format': 'tiho-backup', 'formatVersion': 3, 'exportedAt': now(), 'entries': all_records(db),
            'helpers': helpers['items'] if helpers else []}


def validate_helpers(items):
    if not isinstance(items, list) or len(items) > 30 or any(not isinstance(t, str) or not 1 <= len(t.strip()) <= 200 for t in items):
        raise Problem(400, 'В личном списке допустимо до 30 пунктов по 200 символов.')
    return [t.strip() for t in items]


def get_helpers(db):
    row = db.execute('SELECT * FROM helpers WHERE id=1').fetchone()
    return {'items': json.loads(row['items']), 'version': row['version'], 'revision': row['revision'],
            'mutationId': row['mutation_id'], 'updatedAt': row['updated_at']} if row else None


def put_helpers(db, items, mutation):
    old = get_helpers(db)
    db.execute('INSERT OR REPLACE INTO helpers VALUES(1,?,?,?,?,?)',
               (json_text(items), old['version'] + 1 if old else 1, secrets.token_hex(16), mutation, now()))
    return get_helpers(db)


def validate_backup(value):
    if not isinstance(value, dict) or value.get('format') != 'tiho-backup' or type(value.get('formatVersion')) is not int or value['formatVersion'] not in (1, 2, 3):
        raise Problem(400, 'Это не резервная копия «Тихо» поддерживаемого формата JSON.')
    entries = value.get('entries')
    if not isinstance(entries, list) or len(entries) > 10000:
        raise Problem(400, 'В копии должно быть не более 10 000 дневных записей.')
    result, dates = [], set()
    for raw in entries:
        entry = validate_entry(raw)
        if entry['date'] in dates:
            raise Problem(400, 'В копии есть повторяющиеся даты. Восстановление отменено.')
        dates.add(entry['date'])
        result.append(entry)
    return {'entries': result, 'helpers': validate_helpers(value.get('helpers')) if value['formatVersion'] == 3 else None}
