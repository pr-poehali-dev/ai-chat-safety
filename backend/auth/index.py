import json
import os
import hashlib
import hmac
import secrets
import psycopg2
from urllib.parse import parse_qs

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


def handler(event: dict, context) -> dict:
    """Авторизация через Telegram Login Widget"""
    cors = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, X-Session-Token",
    }

    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": cors, "body": ""}

    method = event.get("httpMethod", "GET")

    # GET /auth/me — получить текущего пользователя по токену
    if method == "GET":
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

    # POST /auth — авторизация через Telegram данные
    if method == "POST":
        body = json.loads(event.get("body") or "{}")
        tg_data = body.get("tg_data", {})

        if not tg_data or not isinstance(tg_data, dict):
            return {"statusCode": 400, "headers": cors, "body": json.dumps({"error": "no tg_data"})}

        data_copy = dict(tg_data)
        if not verify_telegram_auth(data_copy):
            return {"statusCode": 401, "headers": cors, "body": json.dumps({"error": "invalid signature"})}

        telegram_id = int(tg_data.get("id", 0))
        username = tg_data.get("username", "")
        first_name = tg_data.get("first_name", "")
        last_name = tg_data.get("last_name", "")
        photo_url = tg_data.get("photo_url", "")
        auth_date = int(tg_data.get("auth_date", 0))

        conn = get_db()
        cur = conn.cursor()

        cur.execute(
            f"INSERT INTO {SCHEMA}.users (telegram_id, username, first_name, last_name, photo_url, auth_date, updated_at) "
            f"VALUES (%s, %s, %s, %s, %s, %s, NOW()) "
            f"ON CONFLICT (telegram_id) DO UPDATE SET username=%s, first_name=%s, last_name=%s, photo_url=%s, updated_at=NOW() "
            f"RETURNING id, filter_level",
            (telegram_id, username, first_name, last_name, photo_url, auth_date,
             username, first_name, last_name, photo_url)
        )
        user_id, filter_level = cur.fetchone()

        token = secrets.token_hex(32)
        cur.execute(
            f"INSERT INTO {SCHEMA}.sessions (user_id, token) VALUES (%s, %s)",
            (user_id, token)
        )
        conn.commit()
        conn.close()

        return {
            "statusCode": 200, "headers": cors,
            "body": json.dumps({
                "token": token,
                "user": {"id": user_id, "telegram_id": telegram_id, "username": username,
                         "first_name": first_name, "last_name": last_name,
                         "photo_url": photo_url, "filter_level": filter_level}
            })
        }

    # POST /auth/settings — обновить настройки пользователя
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
