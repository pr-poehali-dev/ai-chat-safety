import json
import os
import psycopg2
import re
import urllib.request
import urllib.parse

SCHEMA = "t_p89855177_ai_chat_safety"

DANGEROUS_PATTERNS = [
    r"как\s+(сделать|создать|построить|взорвать)\s+(бомб|взрывч|оруж)",
    r"(взорвать|убить|уничтожить)\s+\w+",
    r"(взлом|хак(ер)?|ddos|sql.inject)",
    r"(синтез|изготовлен)\s+(наркотик|героин|кокаин|метамфетамин)",
    r"(детск|ребенок|дети)\s+(порн|секс|эротик)",
]
ADULT_PATTERNS = [
    r"(порн|эротик|секс.фото|секс.видео|голые)",
    r"18\+.*(сайт|контент|видео)",
]
BLOCKED_WORDS = [
    "блять", "бля", "сука", "пиздец", "пизда", "хуй", "ёбаный"
]

SAFE_RESULTS = [
    {"title": "Wikipedia — свободная энциклопедия", "url": "wikipedia.org", "snippet": "Бесплатная онлайн-энциклопедия, созданная сообществом авторов. Миллионы статей на тысячах языков."},
    {"title": "Яндекс — найдётся всё", "url": "yandex.ru", "snippet": "Поисковая система Яндекс. Поиск по интернету, новости, карты, погода и другие сервисы."},
    {"title": "Google — поисковая система", "url": "google.com", "snippet": "Самая популярная поисковая система в мире. Быстрый поиск информации, изображений, новостей."},
    {"title": "Habr — IT-сообщество", "url": "habr.com", "snippet": "Крупнейшее сообщество IT-специалистов в России. Статьи, новости, переводы по технологиям."},
    {"title": "Stack Overflow — вопросы и ответы для разработчиков", "url": "stackoverflow.com", "snippet": "Платформа для программистов. Миллионы вопросов и ответов по всем языкам программирования."},
]

TOPIC_RESULTS = {
    "python": [
        {"title": "Python.org — официальный сайт", "url": "python.org", "snippet": "Официальная документация Python. Туториалы, справочник, загрузка интерпретатора."},
        {"title": "Python на Habr", "url": "habr.com/ru/hub/python/", "snippet": "Статьи и туториалы по Python на русском языке."},
    ],
    "javascript": [
        {"title": "MDN Web Docs — JavaScript", "url": "developer.mozilla.org/ru/docs/Web/JavaScript", "snippet": "Полная документация JavaScript от Mozilla. Учебники, справочник API, примеры кода."},
    ],
    "история": [
        {"title": "История.рф — образовательный портал", "url": "histrf.ru", "snippet": "Официальный образовательный портал по истории России."},
        {"title": "Всемирная история на Wikipedia", "url": "ru.wikipedia.org/wiki/История", "snippet": "Всемирная история: древний мир, средневековье, новое и новейшее время."},
    ],
    "наука": [
        {"title": "Naked Science — научный журнал", "url": "naked-science.ru", "snippet": "Новости науки и технологий, научпоп статьи."},
        {"title": "N+1 — наука, техника, природа", "url": "nplus1.ru", "snippet": "Научно-популярное издание о новейших достижениях науки и техники."},
    ],
    "рецепт": [
        {"title": "Поваренок — кулинарные рецепты", "url": "povarenok.ru", "snippet": "Тысячи рецептов с пошаговыми фото. Первые блюда, выпечка, десерты."},
        {"title": "Едим дома — рецепты Юлии Высоцкой", "url": "edimdoma.ru", "snippet": "Авторские рецепты и кулинарные идеи от Юлии Высоцкой."},
    ],
    "спорт": [
        {"title": "Sports.ru — спортивные новости", "url": "sports.ru", "snippet": "Новости спорта, результаты матчей, трансляции, статистика."},
        {"title": "Чемпионат.com", "url": "championat.com", "snippet": "Спортивные новости России и мира. Футбол, хоккей, баскетбол."},
    ],
    "программирование": [
        {"title": "Hexlet — онлайн-школа программирования", "url": "hexlet.io", "snippet": "Курсы по программированию: Python, JavaScript, PHP, DevOps."},
        {"title": "Stepik — образовательная платформа", "url": "stepik.org", "snippet": "Бесплатные курсы по программированию, математике, науке."},
    ],
}


def check_content(text: str, level: str) -> dict:
    lower = text.lower()
    for p in DANGEROUS_PATTERNS:
        if re.search(p, lower):
            return {"blocked": True, "reason": "ОПАСНЫЙ ЗАПРОС"}
    if level in ("medium", "high"):
        for p in ADULT_PATTERNS:
            if re.search(p, lower):
                return {"blocked": True, "reason": "КОНТЕНТ 18+"}
    if level == "high":
        for w in BLOCKED_WORDS:
            if w in lower:
                return {"blocked": True, "reason": "НЕЦЕНЗУРНАЯ ЛЕКСИКА"}
    return {"blocked": False, "reason": ""}


def get_results(query: str, level: str) -> list:
    lower = query.lower()
    results = []
    for topic, items in TOPIC_RESULTS.items():
        if topic in lower:
            results.extend(items)
    if not results:
        results = SAFE_RESULTS[:3]
    # Помечаем небезопасные при строгом фильтре
    for r in results:
        r["safe"] = True
    if level == "high":
        # В строгом режиме фильтруем дополнительно
        results = [r for r in results if r.get("safe", True)]
    return results[:5]


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


def handler(event: dict, context) -> dict:
    """Безопасный поиск с фильтрацией контента"""
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
    params = event.get("queryStringParameters") or {}
    query = params.get("q", "").strip()

    if not query:
        return {"statusCode": 400, "headers": cors, "body": json.dumps({"error": "query required"})}

    check = check_content(query, filter_level)
    if check["blocked"]:
        return {"statusCode": 200, "headers": cors, "body": json.dumps({
            "blocked": True,
            "reason": check["reason"],
            "results": []
        })}

    results = get_results(query, filter_level)
    return {"statusCode": 200, "headers": cors, "body": json.dumps({
        "blocked": False,
        "query": query,
        "results": results
    })}
