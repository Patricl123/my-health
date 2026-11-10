import argparse
import getpass
import json
from pathlib import Path
import secrets
from contextlib import closing
from wsgiref.simple_server import make_server

from .app import create_app
from .storage import connect, data_directory, password_hash, prepare_setup, transaction


def main():
    parser = argparse.ArgumentParser(description='Дневник «Тихо»: SQLite на постоянном диске')
    parser.add_argument('command', choices=['init', 'serve', 'reset-password', 'export-recovery'])
    parser.add_argument('--data-dir', type=Path, default=data_directory())
    parser.add_argument('--origin', default=None)
    parser.add_argument('--port', type=int, default=8000)
    parser.add_argument('--static', type=Path, default=None)
    args = parser.parse_args()
    if args.command == 'init':
        if not args.origin:
            parser.error('Нужен --origin https://имя.alwaysdata.net')
        try:
            setup = prepare_setup(args.data_dir, args.origin)
        except (ValueError, OSError) as error:
            parser.exit(1, f'Настройка не выполнена: {error}\n')
        if setup['account_created']:
            print('Личный вход уже создан. Существующие записи и пароль сохранены.')
            print(f"Запустите сайт командой npm.cmd start и откройте {setup['origin']}")
            print('Войдите с ранее заданной почтой и паролем.')
            return
        print('Дневник уже подготовлен. Данные сохранены; выдан новый код настройки.' if setup['existing'] else 'Дневник подготовлен. SQLite создан автоматически вне папки кода.')
        print('Откройте сайт и создайте личный вход. Одноразовый код настройки:')
        print(setup['token'])
        print(f"Адрес сайта: {setup['origin']}")
        if setup['existing']:
            print('Предыдущий одноразовый код больше не действует.')
        print('После создания входа код больше не работает. Сохраните свой пароль.')
    elif args.command == 'serve':
        app = create_app(args.data_dir, args.static)
        print(f'Локальный дневник: http://127.0.0.1:{args.port}/', flush=True)
        with make_server('127.0.0.1', args.port, app) as httpd:
            httpd.serve_forever()
    elif args.command == 'reset-password':
        password = getpass.getpass('Новый пароль (от 12 символов): ')
        if not 12 <= len(password) <= 256 or password != getpass.getpass('Повторите пароль: '):
            parser.error('Пароли не совпали или имеют неверную длину.')
        salt = secrets.token_hex(32)
        hashed = password_hash(password, salt)
        with closing(connect(args.data_dir)) as db, transaction(db):
            if not db.execute('SELECT id FROM owner WHERE id=1').fetchone():
                parser.error('Сначала создайте личный вход на сайте.')
            db.execute('UPDATE owner SET salt=?,password_hash=? WHERE id=1', (salt, hashed))
            db.execute('DELETE FROM sessions')
        print('Пароль изменён. Все старые сессии завершены. Записи сохранены.')
    else:
        with closing(connect(args.data_dir)) as db:
            row = db.execute('SELECT payload FROM recovery_snapshots ORDER BY id DESC LIMIT 1').fetchone()
            if not row:
                parser.error('Нет страховочной копии.')
            print(row[0])


if __name__ == '__main__':
    main()
