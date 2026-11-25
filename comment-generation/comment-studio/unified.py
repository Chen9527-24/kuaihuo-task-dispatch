"""Mount the publisher's account and dispatch APIs on the studio origin."""
import importlib.util
import json
import os
import re
import sys
from collections import Counter
from contextlib import closing
from pathlib import Path
from types import SimpleNamespace
from urllib.parse import urlsplit

PREFIX = '/studio-dispatch'
GROUP = re.compile(r'/api/tasks/([\w-]{1,128})/batches/([\w-]{1,128})/platforms/([^/]{1,32})(/heatstart)?', re.ASCII)


def public_origin(value):
    url = urlsplit(value)
    if (not url.hostname or url.username is not None or url.query or url.fragment
            or url.path not in ('', '/') or url.scheme not in ('https', 'http')
            or (url.scheme == 'http' and url.hostname not in ('localhost', '127.0.0.1', '::1'))):
        raise ValueError('领取站域名无效。')
    return url.scheme + '://' + url.netloc


class Unified:
    def __init__(self, studio, studio_origin):
        from heatbridge import initialize
        self.studio = studio
        self.root = Path(os.environ.get('COMMENT_DISPATCH_ROOT') or
                         Path(__file__).resolve().parents[1] / 'dispatch').resolve()
        if not (self.root / 'server.py').is_file():
            raise RuntimeError('找不到热启动程序目录，请检查 COMMENT_DISPATCH_ROOT。')
        # The dispatch service uses top-level imports for its own accounts and domain modules.
        sys.path.insert(0, str(self.root))
        try:
            spec = importlib.util.spec_from_file_location('studio_dispatch_server', self.root / 'server.py')
            dispatch = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(dispatch)
        finally:
            sys.path.remove(str(self.root))
        self.dispatch = dispatch
        self.origin = studio_origin
        self.share_origin = public_origin(os.getenv('COMMENT_DISPATCH_PUBLIC_ORIGIN') or 'http://127.0.0.1:8780')
        self.cookie = '__Host-kh_account' if studio_origin.startswith('https://') else 'studio_kh_account'
        self.context = SimpleNamespace(public_origin=studio_origin or 'local', account_cookie=self.cookie,
                                       account_rate=dispatch.AccountRateLimit())
        self.error = dispatch.domain.DomainError
        with self.open() as db:
            dispatch.domain.initialize(db)
            initialize(db)

        class Mount(dispatch.Handler):
            """Use the original dispatch login, account management and cookie semantics."""
            def __init__(mount, request):
                mount.server = self.context
                mount.command = request.command
                mount.client_address = request.client_address
                mount.headers = request.headers
                mount.request = request

            def set_cookie(mount, name, value, lifetime):
                secure = '; Secure' if self.cookie.startswith('__Host-') else ''
                mount.request.extra_cookies.append(
                    f'{name}={value}; HttpOnly; SameSite=Strict; Path=/; Max-Age={lifetime}{secure}')
        self.mount = Mount

    def open(self):
        return closing(self.dispatch.connect(self.studio.database, self.dispatch.PUBLIC_DB_LIMIT_BYTES))

    def actor(self, request, required=True):
        adapter = self.mount(request)
        with self.open() as db:
            user = self.dispatch.accounts.checked_owner(db, adapter.read_cookie(self.cookie), adapter.expected_owner())
        if required and user is None:
            raise self.error(401, '请先登录统一工作台。')
        return user

    def membership(self, request, route, query):
        adapter = self.mount(request)
        if route.startswith('/api/'):
            if request.command not in ('GET', 'POST'):
                raise self.error(405, '请求方式有误。')
            account = route == '/api/account' or route.startswith('/api/account/')
            admin = route.startswith('/api/admin/')
            tasks = route == '/api/tasks' or route.startswith('/api/tasks/')
            if not (account or admin or tasks):
                raise self.error(404, '分发接口不存在。')
            body = request.json_body(4096 if account else 8*1024*1024) if request.command == 'POST' else {}
            with self.open() as db:
                if account:
                    result = adapter.account(db, route, body)
                    result.update(publicOrigin=self.share_origin, manageOrigin='')
                elif admin:
                    result = adapter.admin_api(db, route, query, body)
                else:
                    result = self.dispatch.domain.handle(db, request.command, route, body,
                        account_token=adapter.read_cookie(self.cookie), expected_owner=adapter.expected_owner())
            return request.send_json(result)
        if request.command not in ('GET','HEAD'):
            raise self.error(405, '请求方式有误。')
        assets = self.dispatch.STATIC
        if route == '/static/collection.css':
            item = ('collection.css', 'text/css')
        else:
            item = assets.get(route or '/')
        if not item:
            raise self.error(404, '页面不存在。')
        name, mime = item
        if mime.startswith('text/'):
            mime += '; charset=utf-8'
        return request.send_file(self.root / 'static' / name, mime)

    def owner(self, actor, task_id=None):
        owner = 'publisher:' + str(actor['id'])
        if task_id and actor['role'] == 'admin':
            with self.open() as db:
                row = db.execute('SELECT owner FROM studio_tasks WHERE id=?', (task_id,)).fetchone()
                if row:
                    return row['owner']
        return owner

    def history(self, actor):
        from heatbridge import collection_counts, task_links
        query = """SELECT g.id,g.data,a.id owner_id,a.username FROM studio_tasks g
                   LEFT JOIN accounts a ON g.owner=('publisher:' || a.id)"""
        args = ()
        if actor['role'] != 'admin':
            query += ' WHERE g.owner=?'
            args = (self.owner(actor),)
        with self.open() as db:
            records = db.execute(query+' ORDER BY g.rowid DESC', args).fetchall()
            ids = [row['id'] for row in records]
            links = task_links(db, ids)
            edits = collection_counts(db, ids)
        result = []
        for row in records:
            t = json.loads(row['data'])
            brief = {k:t.get(k) for k in ('id','mode','title','platform','accountId','status','stage','createdAt','source','error')}
            brief['title'] = brief['title'] or (t.get('options') or {}).get('title', '')
            batches = t.get('batches') or []
            count = 0
            if batches:
                batch = batches[-1]
                counts = Counter(r['platform'] for r in batch.get('rows', []))
                for platform in (batch.get('options') or {}).get('platforms', {}):
                    counts.setdefault(platform, 0)
                count = sum(edits.get((t['id'], batch['id'], platform), total)
                            for platform, total in counts.items())
            brief.update(ownerId=row['owner_id'], ownerLabel=row['username'] or ('游客' if row['owner_id'] else '待认领'),
                         commentCount=count, heatstarts=links.get(t['id'], []))
            result.append(brief)
        return result

    def group(self, request, match):
        from heatbridge import handle
        task,batch,platform,heat = match.groups()
        action = {('GET',False):'read', ('PUT',False):'save', ('POST',True):'create'}.get((request.command, bool(heat)))
        if not action:
            raise self.error(405, '请求方式有误。')
        actor = self.actor(request)
        body = request.json_body(8*1024*1024) if action != 'read' else None
        adapter = self.mount(request)
        token = adapter.read_cookie(self.cookie)
        def authorize(db):
            return self.dispatch.accounts.checked_owner(db, token, actor['id'])
        with self.open() as db:
            value = handle(db, actor, task, batch, platform, action, body,
                           dispatch=self.dispatch.domain, authorize=authorize)
        return request.send_json(value)
