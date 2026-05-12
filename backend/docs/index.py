import json
import os
import psycopg2
import base64
import re

SCHEMA = "t_p89855177_ai_chat_safety"

BLOCKED_WORDS = [
    "блять", "бля", "сука", "пиздец", "хуй", "ёбаный"
]
DANGEROUS_PATTERNS = [
    r"(взорвать|убить|уничтожить|сделать\s+бомб)",
    r"(синтез|изготовлен)\s+(наркотик|героин|кокаин)",
    r"(детск|ребенок)\s+(порн|секс)",
]
ADULT_PATTERNS = [
    r"(порн|эротик|контент\s*18\+)",
]


def get_db():
    return psycopg2.connect(os.environ["DATABASE_URL"])


def get_user_from_token(token: str):
    conn = get_db()
    cur = conn.cursor()
    cur.execute(
        f"SELECT u.id, u.filter_level FROM {SCHEMA}.sessions s "
        f"JOIN {SCHEMA}.users u ON s.user_id = u.id "
        f"WHERE s.token = %s AND s.expires_at > NOW()",
        (token,)
    )
    row = cur.fetchone()
    conn.close()
    return row


def analyze_text(text: str, filter_level: str) -> dict:
    """Анализируем текст документа на безопасность"""
    lower = text.lower()
    issues = []
    blocked = False

    for p in DANGEROUS_PATTERNS:
        if re.search(p, lower):
            issues.append("ОПАСНЫЙ КОНТЕНТ")
            blocked = True
            break

    if filter_level in ("medium", "high"):
        for p in ADULT_PATTERNS:
            if re.search(p, lower):
                issues.append("КОНТЕНТ 18+")
                blocked = True
                break

    if filter_level == "high":
        for w in BLOCKED_WORDS:
            if w in lower:
                issues.append("НЕЦЕНЗУРНАЯ ЛЕКСИКА")
                blocked = True
                break

    words = len(text.split())
    chars = len(text)
    sentences = len(re.findall(r'[.!?]+', text)) or 1

    lang = "РУССКИЙ" if re.search(r'[а-яёА-ЯЁ]', text) else "АНГЛИЙСКИЙ"

    return {
        "safe": not blocked,
        "issues": issues,
        "stats": {
            "words": words,
            "chars": chars,
            "sentences": sentences,
            "lang": lang,
        }
    }


def handler(event: dict, context) -> dict:
    """Загрузка и анализ текстовых документов"""
    cors = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, X-Session-Token",
    }

    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": cors, "body": ""}

    token = event.get("headers", {}).get("x-session-token", "")
    user = get_user_from_token(token)
    if not user:
        return {"statusCode": 401, "headers": cors, "body": json.dumps({"error": "unauthorized"})}

    user_id, filter_level = user
    method = event.get("httpMethod", "GET")

    conn = get_db()
    cur = conn.cursor()

    try:
        # GET — список документов пользователя
        if method == "GET":
            cur.execute(
                f"SELECT id, filename, file_size, status, safe, content_preview, created_at "
                f"FROM {SCHEMA}.documents WHERE user_id=%s ORDER BY created_at DESC",
                (user_id,)
            )
            rows = cur.fetchall()
            docs = [{"id": r[0], "filename": r[1], "file_size": r[2],
                     "status": r[3], "safe": r[4], "preview": r[5],
                     "created_at": r[6].isoformat()} for r in rows]
            return {"statusCode": 200, "headers": cors, "body": json.dumps({"documents": docs})}

        # POST — загрузить и проанализировать документ
        if method == "POST":
            body = json.loads(event.get("body") or "{}")
            filename = body.get("filename", "document.txt")
            file_size = body.get("file_size", 0)
            content_b64 = body.get("content", "")

            # Декодируем base64
            try:
                content_bytes = base64.b64decode(content_b64)
                content_text = content_bytes.decode("utf-8", errors="ignore")
            except Exception:
                content_text = content_b64[:5000]

            # Анализируем
            analysis = analyze_text(content_text, filter_level)
            preview = content_text[:300] + ("..." if len(content_text) > 300 else "")

            # Сохраняем в БД
            cur.execute(
                f"INSERT INTO {SCHEMA}.documents (user_id, filename, file_size, content_preview, status, safe) "
                f"VALUES (%s, %s, %s, %s, 'done', %s) RETURNING id, created_at",
                (user_id, filename, file_size, preview, analysis["safe"])
            )
            row = cur.fetchone()
            conn.commit()

            return {"statusCode": 200, "headers": cors, "body": json.dumps({
                "id": row[0],
                "filename": filename,
                "file_size": file_size,
                "safe": analysis["safe"],
                "issues": analysis["issues"],
                "stats": analysis["stats"],
                "preview": preview,
                "created_at": row[1].isoformat()
            })}

    finally:
        conn.close()

    return {"statusCode": 405, "headers": cors, "body": json.dumps({"error": "method not allowed"})}
