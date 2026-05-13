import json
import os
import hashlib
import hmac
import secrets
import psycopg2
import random
import time

SCHEMA = "t_p89855177_ai_chat_safety"


def get_db():
    return psycopg2.connect(os.environ["DATABASE_URL"])


def verify_telegram_auth(data: dict) -> bool:
    """Проверяем подпись Telegram Login Widget"""
    bot_token = os.environ.get("TELEGRAM_BOT_TOKEN", "")
    check_hash = data.pop("hash", "")
    data_check_string = "\n".join(f"{k}={v}" for k, v in sorted(data.items()))
    secret_key = hashlib.sha256(bot_token.encode()).digest()
    computed = hmac.new(secret_key, data_check_string.encode(), hashlib.sha256).hexdigest()
    return computed == check_hash


def send_telegram_message(chat_id: int, text: str):
    """Отправляем сообщение пользователю через бота"""
    import urllib.request
    token = os.environ.get("TELEGRAM_BOT_TOKEN", "")
    url = f"https://api.telegram.org/bot{token}/sendMessage"
    payload = json.dumps({"chat_id": chat_id, "text": text, "parse_mode": "HTML"}).encode()
    req = urllib.request.Request(url, data=payload, headers={"Content-Type": "application/json"})
    try:
        urllib.request.urlopen(req, timeout=5)
    except Exception:
        pass


def get_telegram_updates(offset: int = 0):
    """Получаем обновления от бота"""
    import urllib.request
    token = os.environ.get("TELEGRAM_BOT_TOKEN", "")
    url = f"https://api.telegram.org/bot{token}/getUpdates?offset={offset}&limit=50&timeout=0"
    try:
        with urllib.request.urlopen(url, timeout=8) as r:
            return json.loads(r.read())
    except Exception:
        return {"ok": False, "result": []}


def handler(event: dict, context) -> dict:
    """Авторизация: GET /me, POST /login (tg_data или code), POST /request-code, GET /check-code"""
    cors = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, X-Session-Token",
    }

    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": cors, "body": ""}

    method = event.get("httpMethod", "GET")
    params = event.get("queryStringParameters") or {}
    path = event.get("path", "/")

    # GET /auth/me — получить текущего пользователя по токену
    if method == "GET" and not params.get("action"):
        token = event.get("headers", {}).get("x-session-token", "")
        if not token:
            return {"statusCode": 401, "headers": cors, "body": json.dumps({"error": "no token"})}
        conn = get_db()
        cur = conn.cursor()
        cur.execute(
            f"SELECT u.id, u.telegram_id, u.username, u.first_name, u.last_name, u.photo_url, u.filter_level "
            f"FROM {SCHEMA}.sessions s JOIN {SCHEMA}.users u ON s.user_id = u.id "
            f"WHERE s.token = %s AND s.expires_at > NOW()",
            (token,)
        )
        row = cur.fetchone()
        conn.close()
        if not row:
            return {"statusCode": 401, "headers": cors, "body": json.dumps({"error": "invalid token"})}
        return {
            "statusCode": 200, "headers": cors,
            "body": json.dumps({"id": row[0], "telegram_id": row[1], "username": row[2],
                                "first_name": row[3], "last_name": row[4], "photo_url": row[5],
                                "filter_level": row[6]})
        }

    # GET ?action=check_code&code=123456 — проверяем, подтверждён ли код
    if method == "GET" and params.get("action") == "check_code":
        code = params.get("code", "")
        if not code:
            return {"statusCode": 400, "headers": cors, "body": json.dumps({"error": "code required"})}
        conn = get_db()
        cur = conn.cursor()
        # Ищем подтверждённый код в pending_auth
        cur.execute(
            f"SELECT telegram_id, username, first_name, last_name, photo_url FROM {SCHEMA}.pending_auth "
            f"WHERE code = %s AND confirmed = TRUE AND expires_at > NOW()",
            (code,)
        )
        row = cur.fetchone()
        if not row:
            conn.close()
            return {"statusCode": 200, "headers": cors, "body": json.dumps({"confirmed": False})}

        telegram_id, username, first_name, last_name, photo_url = row

        # Upsert user
        cur.execute(
            f"INSERT INTO {SCHEMA}.users (telegram_id, username, first_name, last_name, photo_url, auth_date, updated_at) "
            f"VALUES (%s, %s, %s, %s, %s, %s, NOW()) "
            f"ON CONFLICT (telegram_id) DO UPDATE SET username=%s, first_name=%s, last_name=%s, updated_at=NOW() "
            f"RETURNING id, filter_level",
            (telegram_id, username, first_name, last_name, photo_url, int(time.time()),
             username, first_name, last_name)
        )
        user_id, filter_level = cur.fetchone()
        session_token = secrets.token_hex(32)
        cur.execute(
            f"INSERT INTO {SCHEMA}.sessions (user_id, token) VALUES (%s, %s)",
            (user_id, session_token)
        )
        # Удаляем использованный код
        cur.execute(f"UPDATE {SCHEMA}.pending_auth SET confirmed = FALSE WHERE code = %s", (code,))
        conn.commit()
        conn.close()

        return {"statusCode": 200, "headers": cors, "body": json.dumps({
            "confirmed": True,
            "token": session_token,
            "user": {"id": user_id, "telegram_id": telegram_id, "username": username,
                     "first_name": first_name, "last_name": last_name,
                     "photo_url": photo_url or "", "filter_level": filter_level}
        })}

    if method == "POST":
        body = json.loads(event.get("body") or "{}")
        action = body.get("action", "")

        # POST action=request_code — генерируем код и сохраняем pending
        if action == "request_code":
            code = str(random.randint(100000, 999999))
            conn = get_db()
            cur = conn.cursor()
            cur.execute(
                f"INSERT INTO {SCHEMA}.pending_auth (code, confirmed, expires_at) "
                f"VALUES (%s, FALSE, NOW() + INTERVAL '10 minutes') RETURNING id",
                (code,)
            )
            conn.commit()
            conn.close()
            return {"statusCode": 200, "headers": cors, "body": json.dumps({"code": code})}

        # POST action=telegram_webhook — вебхук от бота (пользователь отправил /start CODE)
        if action == "telegram_webhook":
            update = body.get("update", {})
            message = update.get("message", {})
            text = message.get("text", "")
            from_user = message.get("from", {})
            chat_id = message.get("chat", {}).get("id")

            if text.startswith("/start "):
                code = text.split(" ", 1)[1].strip()
                telegram_id = from_user.get("id")
                username = from_user.get("username", "")
                first_name = from_user.get("first_name", "")
                last_name = from_user.get("last_name", "")
                photo_url = ""

                conn = get_db()
                cur = conn.cursor()
                cur.execute(
                    f"UPDATE {SCHEMA}.pending_auth SET confirmed=TRUE, telegram_id=%s, username=%s, first_name=%s, last_name=%s, photo_url=%s "
                    f"WHERE code=%s AND confirmed=FALSE AND expires_at > NOW() RETURNING id",
                    (telegram_id, username, first_name, last_name, photo_url, code)
                )
                updated = cur.fetchone()
                conn.commit()
                conn.close()

                if updated and chat_id:
                    send_telegram_message(chat_id,
                        f"✅ <b>Авторизация подтверждена!</b>\n\nВернись на сайт — вход выполнен автоматически.")
                elif chat_id:
                    send_telegram_message(chat_id, "❌ Код не найден или устарел. Запроси новый код на сайте.")

            return {"statusCode": 200, "headers": cors, "body": json.dumps({"ok": True})}

        # POST action=login_tg — авторизация через Telegram Login Widget (если виджет работает)
        if action == "login_tg":
            tg_data = body.get("tg_data", {})
            if not tg_data:
                return {"statusCode": 400, "headers": cors, "body": json.dumps({"error": "no tg_data"})}
            data_copy = dict(tg_data)
            if not verify_telegram_auth(data_copy):
                return {"statusCode": 401, "headers": cors, "body": json.dumps({"error": "invalid signature"})}
            telegram_id = int(tg_data.get("id", 0))
            username = tg_data.get("username", "")
            first_name = tg_data.get("first_name", "")
            last_name = tg_data.get("last_name", "")
            photo_url = tg_data.get("photo_url", "")
            conn = get_db()
            cur = conn.cursor()
            cur.execute(
                f"INSERT INTO {SCHEMA}.users (telegram_id, username, first_name, last_name, photo_url, auth_date, updated_at) "
                f"VALUES (%s, %s, %s, %s, %s, %s, NOW()) "
                f"ON CONFLICT (telegram_id) DO UPDATE SET username=%s, first_name=%s, last_name=%s, updated_at=NOW() "
                f"RETURNING id, filter_level",
                (telegram_id, username, first_name, last_name, photo_url, int(time.time()),
                 username, first_name, last_name)
            )
            user_id, filter_level = cur.fetchone()
            session_token = secrets.token_hex(32)
            cur.execute(f"INSERT INTO {SCHEMA}.sessions (user_id, token) VALUES (%s, %s)", (user_id, session_token))
            conn.commit()
            conn.close()
            return {"statusCode": 200, "headers": cors, "body": json.dumps({
                "token": session_token,
                "user": {"id": user_id, "telegram_id": telegram_id, "username": username,
                         "first_name": first_name, "last_name": last_name,
                         "photo_url": photo_url, "filter_level": filter_level}
            })}

    # PUT — обновить настройки
    if method == "PUT":
        token = event.get("headers", {}).get("x-session-token", "")
        body = json.loads(event.get("body") or "{}")
        filter_level = body.get("filter_level", "medium")
        if filter_level not in ("low", "medium", "high"):
            filter_level = "medium"
        conn = get_db()
        cur = conn.cursor()
        cur.execute(
            f"UPDATE {SCHEMA}.users u SET filter_level=%s FROM {SCHEMA}.sessions s "
            f"WHERE s.token=%s AND s.user_id=u.id",
            (filter_level, token)
        )
        conn.commit()
        conn.close()
        return {"statusCode": 200, "headers": cors, "body": json.dumps({"ok": True})}

    return {"statusCode": 405, "headers": cors, "body": json.dumps({"error": "method not allowed"})}
