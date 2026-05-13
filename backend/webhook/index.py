import json
import os
import psycopg2
import urllib.request

SCHEMA = "t_p89855177_ai_chat_safety"


def get_db():
    return psycopg2.connect(os.environ["DATABASE_URL"])


def send_message(chat_id: int, text: str):
    token = os.environ.get("TELEGRAM_BOT_TOKEN", "")
    url = f"https://api.telegram.org/bot{token}/sendMessage"
    payload = json.dumps({"chat_id": chat_id, "text": text, "parse_mode": "HTML"}).encode()
    req = urllib.request.Request(url, data=payload, headers={"Content-Type": "application/json"})
    try:
        urllib.request.urlopen(req, timeout=5)
    except Exception:
        pass


def set_webhook(webhook_url: str):
    """Устанавливаем вебхук для бота"""
    token = os.environ.get("TELEGRAM_BOT_TOKEN", "")
    url = f"https://api.telegram.org/bot{token}/setWebhook"
    payload = json.dumps({"url": webhook_url}).encode()
    req = urllib.request.Request(url, data=payload, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=8) as r:
            return json.loads(r.read())
    except Exception as e:
        return {"ok": False, "error": str(e)}


def handler(event: dict, context) -> dict:
    """Вебхук Telegram бота — обрабатывает команды /start CODE для авторизации"""
    cors = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
    }

    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": cors, "body": ""}

    method = event.get("httpMethod", "GET")
    params = event.get("queryStringParameters") or {}

    # GET ?setup=1 — установить вебхук (вызвать один раз)
    if method == "GET" and params.get("setup"):
        # URL этой же функции — берём из заголовков или строим вручную
        host = event.get("headers", {}).get("host", "")
        path = event.get("path", "/")
        # Строим URL вебхука
        function_url = f"https://functions.poehali.dev/{context.function_id if hasattr(context, 'function_id') else ''}"
        # Используем текущий URL функции из func2url
        webhook_url = params.get("url", "")
        if not webhook_url:
            return {"statusCode": 400, "headers": cors, "body": json.dumps({"error": "Pass ?setup=1&url=YOUR_FUNCTION_URL"})}
        result = set_webhook(webhook_url)
        return {"statusCode": 200, "headers": cors, "body": json.dumps(result)}

    # POST — получаем апдейт от Telegram
    if method == "POST":
        try:
            update = json.loads(event.get("body") or "{}")
        except Exception:
            return {"statusCode": 200, "headers": cors, "body": "ok"}

        message = update.get("message", {})
        text = (message.get("text") or "").strip()
        from_user = message.get("from", {})
        chat = message.get("chat", {})
        chat_id = chat.get("id")

        if not chat_id:
            return {"statusCode": 200, "headers": cors, "body": "ok"}

        # /start CODE
        if text.startswith("/start"):
            parts = text.split(" ", 1)
            code = parts[1].strip() if len(parts) > 1 else ""

            if not code:
                first_name = from_user.get("first_name", "")
                send_message(chat_id,
                    f"👋 Привет, {first_name}!\n\n"
                    f"Я — авторизационный бот системы RM-XXXX_BETA.\n\n"
                    f"Чтобы войти на сайт:\n"
                    f"1. Нажми <b>«Войти через Telegram»</b> на сайте\n"
                    f"2. Получи код входа\n"
                    f"3. Отправь мне: <code>/start КОД</code>"
                )
                return {"statusCode": 200, "headers": cors, "body": "ok"}

            # Проверяем код в pending_auth
            conn = get_db()
            cur = conn.cursor()
            cur.execute(
                f"SELECT id FROM {SCHEMA}.pending_auth "
                f"WHERE code=%s AND confirmed=FALSE AND expires_at > NOW()",
                (code,)
            )
            row = cur.fetchone()

            if not row:
                conn.close()
                send_message(chat_id, "❌ Код не найден или уже устарел.\n\nЗапроси новый код на сайте.")
                return {"statusCode": 200, "headers": cors, "body": "ok"}

            # Подтверждаем авторизацию
            telegram_id = from_user.get("id")
            username = from_user.get("username", "")
            first_name = from_user.get("first_name", "")
            last_name = from_user.get("last_name", "")

            cur.execute(
                f"UPDATE {SCHEMA}.pending_auth "
                f"SET confirmed=TRUE, telegram_id=%s, username=%s, first_name=%s, last_name=%s "
                f"WHERE code=%s",
                (telegram_id, username, first_name, last_name, code)
            )
            conn.commit()
            conn.close()

            send_message(chat_id,
                f"✅ <b>Готово, {first_name}!</b>\n\n"
                f"Авторизация подтверждена. Вернись на сайт — вход выполнится автоматически."
            )

        # /help
        elif text in ("/help", "помощь", "help"):
            send_message(chat_id,
                "ℹ️ <b>RM-XXXX_BETA Bot</b>\n\n"
                "Команды:\n"
                "/start КОД — подтвердить вход на сайте\n"
                "/help — эта справка"
            )

        return {"statusCode": 200, "headers": cors, "body": "ok"}

    return {"statusCode": 200, "headers": cors, "body": "ok"}
