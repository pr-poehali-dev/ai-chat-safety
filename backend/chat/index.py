import json
import os
import psycopg2
import re
from datetime import datetime

SCHEMA = "t_p89855177_ai_chat_safety"

BLOCKED_WORDS_HIGH = [
    "блять", "бля", "сука", "пиздец", "пизда", "хуй", "хуйня", "ёбаный", "ёб", "еб",
    "залупа", "мудак", "мудила", "ёблан", "пидор", "пидорас", "гандон", "шлюха", "проститутка"
]
BLOCKED_WORDS_MEDIUM = ["нахуй", "нахрен", "блин", "блять"]
DANGEROUS_PATTERNS = [
    r"как\s+(сделать|создать|построить|взорвать)\s+(бомб|взрывч|оруж)",
    r"(взорвать|убить|уничтожить)\s+\w+",
    r"(взлом|хак(ер)?|ddos|sql.inject)",
    r"(синтез|изготовлен)\s+(наркотик|героин|кокаин|метамфетамин)",
    r"(детск|ребенок|дети)\s+(порн|секс|эротик)",
    r"(суицид|самоубийств).*(как|способ|метод)",
]
ADULT_PATTERNS = [
    r"(порн|эротик|секс.фото|секс.видео|голые)",
    r"18\+.*(сайт|контент|видео)",
]

AI_KNOWLEDGE = {
    "приветствие": ["привет", "здравствуй", "добрый", "hello", "hi", "хай", "салют"],
    "прощание": ["пока", "до свидания", "досвидания", "bye", "goodbye", "счастливо"],
    "имя": ["как тебя зовут", "твоё имя", "кто ты", "что ты такое", "кто ты"],
    "погода": ["погода", "температура", "дождь", "снег", "солнечно", "облачно"],
    "время": ["сколько времени", "который час", "дата", "день недели", "какой сегодня"],
    "математика": ["+", "-", "*", "/", "сколько будет", "посчитай", "вычисли", "плюс", "минус", "умножить", "разделить"],
    "программирование": ["python", "javascript", "код", "программа", "алгоритм", "функция", "переменная", "цикл"],
    "ии": ["искусственный интеллект", "нейронная сеть", "машинное обучение", "chatgpt", "gpt", "нейросеть"],
    "помощь": ["помоги", "помощь", "что умеешь", "что ты умеешь", "возможности", "функции"],
    "история": ["история", "исторический", "когда был", "кто такой", "кем был"],
    "наука": ["наука", "физика", "химия", "биология", "математика", "астрономия", "космос"],
    "спорт": ["футбол", "хоккей", "баскетбол", "спорт", "олимпиада", "чемпионат"],
    "еда": ["рецепт", "приготовить", "блюдо", "еда", "готовить", "кухня", "ингредиент"],
    "перевод": ["переведи", "перевод", "на английском", "на русском", "translate"],
    "совет": ["посоветуй", "рекомендуй", "что лучше", "как выбрать", "совет"],
}

AI_RESPONSES = {
    "приветствие": [
        "ПРИВЕТСТВУЮ. Система RM-XXXX_BETA активирована. Готов к работе.",
        "ИНИЦИАЛИЗАЦИЯ КОНТАКТА. Здравствуй, пользователь. Чем могу помочь?",
        "СОЕДИНЕНИЕ УСТАНОВЛЕНО. Привет! Все системы в норме.",
    ],
    "прощание": [
        "СЕАНС ЗАВЕРШЁН. До следующего подключения.",
        "ОТКЛЮЧЕНИЕ. Удачи, пользователь. Сеанс сохранён в архиве.",
        "ЗАВЕРШЕНИЕ СЕССИИ. Буду здесь, когда понадоблюсь.",
    ],
    "имя": [
        "Я — RM-XXXX_BETA. Защищённый ИИ-ассистент с встроенной системой фильтрации контента. Создан для безопасного взаимодействия.",
        "Моё обозначение: RM-XXXX_BETA. Автономная система обработки запросов с модулем безопасности.",
    ],
    "погода": [
        "МОДУЛЬ ПОГОДЫ: Для точного прогноза требуется доступ к геолокации. Укажи свой город — найду информацию.",
        "СТАТУС МЕТЕОСИСТЕМЫ: Подключение к внешним данным погоды недоступно в текущей конфигурации. Рекомендую Яндекс.Погоду или weather.com.",
    ],
    "время": [
        f"СИСТЕМНОЕ ВРЕМЯ: {datetime.now().strftime('%H:%M:%S')}. Дата: {datetime.now().strftime('%d.%m.%Y')}.",
        f"ХРОНОМЕТР: {datetime.now().strftime('%d %B %Y, %H:%M')}.",
    ],
    "математика": [
        "ВЫЧИСЛИТЕЛЬНЫЙ МОДУЛЬ АКТИВИРОВАН. Для подсчёта уточни задачу в формате: '2 + 2' или 'сколько будет 15 * 7'?",
        "РЕЖИМ КАЛЬКУЛЯТОРА. Укажи пример — произведу расчёт.",
    ],
    "программирование": [
        "МОДУЛЬ РАЗРАБОТКИ. Знаю Python, JavaScript, TypeScript, SQL и другие языки. Что нужно написать или объяснить?",
        "ТЕХНИЧЕСКИЙ РЕЖИМ. Могу помочь с кодом, объяснить алгоритм или найти ошибку. Опиши задачу подробнее.",
    ],
    "ии": [
        "САМОАНАЛИЗ. Искусственный интеллект — это системы, имитирующие когнитивные функции человека. Нейронные сети обучаются на данных методом градиентного спуска. Я являюсь экспертной системой с базой знаний и модулем безопасности.",
        "ИНФОРМАЦИЯ О ТЕХНОЛОГИИ: ИИ включает ML, нейросети, NLP. GPT — трансформерная архитектура от OpenAI. Я — RM-XXXX_BETA, автономная защищённая система.",
    ],
    "помощь": [
        "СПИСОК ВОЗМОЖНОСТЕЙ RM-XXXX_BETA:\n▸ Ответы на вопросы\n▸ Анализ документов\n▸ Безопасный поиск\n▸ Математические расчёты\n▸ Помощь с программированием\n▸ Сохранение диалогов в архиве\n▸ Многоуровневая фильтрация контента",
    ],
    "история": [
        "ИСТОРИЧЕСКИЙ МОДУЛЬ. Готов рассказать о событиях, личностях и периодах истории. Уточни запрос — дам подробный ответ.",
        "АРХИВ ЗНАНИЙ. Какой исторический период или личность тебя интересует?",
    ],
    "наука": [
        "НАУЧНЫЙ МОДУЛЬ АКТИВИРОВАН. Физика, химия, биология, математика, астрономия — задавай вопросы. Объясню понятным языком.",
        "БАЗА ЗНАНИЙ: НАУКА. Уточни тему — дам структурированный ответ.",
    ],
    "спорт": [
        "СПОРТИВНЫЙ МОДУЛЬ. Для актуальных результатов матчей рекомендую sports.ru или официальные сайты лиг. Могу рассказать о правилах, истории вида спорта.",
    ],
    "еда": [
        "КУЛИНАРНЫЙ МОДУЛЬ. Укажи блюдо или доступные ингредиенты — подберу рецепт.",
        "РЕЖИМ РЕЦЕПТОВ. Что хочешь приготовить? Или есть ингредиенты, из которых нужно что-то сделать?",
    ],
    "перевод": [
        "МОДУЛЬ ПЕРЕВОДА. Укажи текст и целевой язык — переведу.",
        "ЯЗЫКОВОЙ МОДУЛЬ АКТИВИРОВАН. Могу переводить между русским, английским, немецким, французским и другими языками.",
    ],
    "совет": [
        "РЕЖИМ РЕКОМЕНДАЦИЙ. Опиши ситуацию подробнее — дам взвешенный совет.",
        "АНАЛИТИЧЕСКИЙ МОДУЛЬ. Расскажи детали — помогу принять решение.",
    ],
}

DEFAULT_RESPONSES = [
    "ОБРАБОТКА ЗАПРОСА. Интересный вопрос. Уточни детали — дам более точный ответ.",
    "АНАЛИЗ ЗАВЕРШЁН. Для полноценного ответа нужно больше контекста. Что именно тебя интересует?",
    "РЕЖИМ ДИАЛОГА. Понял запрос. Можешь развернуть вопрос — тогда отвечу детальнее.",
    "СИСТЕМА ОБРАБАТЫВАЕТ. Запрос принят. Задай вопрос точнее или используй раздел поиска для нахождения информации.",
    "ОТВЕТ СФОРМИРОВАН. По данной теме могу предоставить общую информацию. Уточни, что именно нужно?",
]


def check_content(text: str, level: str) -> dict:
    lower = text.lower()
    for p in DANGEROUS_PATTERNS:
        if re.search(p, lower):
            return {"blocked": True, "reason": "ОПАСНЫЙ ЗАПРОС"}
    if level == "high":
        for p in ADULT_PATTERNS:
            if re.search(p, lower):
                return {"blocked": True, "reason": "КОНТЕНТ 18+"}
        for w in BLOCKED_WORDS_HIGH + BLOCKED_WORDS_MEDIUM:
            if w in lower:
                return {"blocked": True, "reason": "НЕЦЕНЗУРНАЯ ЛЕКСИКА"}
    if level == "medium":
        for w in BLOCKED_WORDS_HIGH:
            if w in lower:
                return {"blocked": True, "reason": "НЕЦЕНЗУРНАЯ ЛЕКСИКА"}
    return {"blocked": False, "reason": ""}


def generate_response(text: str, history: list) -> str:
    lower = text.lower()

    # Математика — считаем простые выражения
    math_match = re.search(r"(\d+[\.,]?\d*)\s*([\+\-\*\/])\s*(\d+[\.,]?\d*)", text)
    if math_match:
        try:
            a = float(math_match.group(1).replace(",", "."))
            op = math_match.group(2)
            b = float(math_match.group(3).replace(",", "."))
            ops = {"+": a + b, "-": a - b, "*": a * b, "/": a / b if b != 0 else None}
            result = ops.get(op)
            if result is not None:
                r = int(result) if result == int(result) else round(result, 4)
                return f"ВЫЧИСЛЕНИЕ: {a} {op} {b} = {r}"
        except Exception:
            pass

    # Перевод
    if any(k in lower for k in ["переведи", "перевод", "как по-английски", "как по-русски"]):
        en_ru = {"hello": "привет", "world": "мир", "cat": "кот", "dog": "собака",
                 "love": "любовь", "house": "дом", "car": "машина", "water": "вода"}
        ru_en = {v: k for k, v in en_ru.items()}
        for word, trans in {**en_ru, **ru_en}.items():
            if f'"{word}"' in lower or f' {word} ' in lower or lower.endswith(f" {word}") or lower.startswith(f"{word} "):
                return f"ПЕРЕВОД: «{word}» → «{trans}»"
        return "ЯЗЫКОВОЙ МОДУЛЬ. Укажи слово или фразу в кавычках для перевода. Пример: переведи «hello»."

    # Ищем категорию
    import random
    for category, keywords in AI_KNOWLEDGE.items():
        if any(kw in lower for kw in keywords):
            responses = AI_RESPONSES.get(category, DEFAULT_RESPONSES)
            return random.choice(responses)

    # Вопрос о конкретной теме
    if "?" in text or text.lower().startswith(("что ", "как ", "где ", "когда ", "кто ", "зачем ", "почему ", "можно ")):
        topic = text[:50].strip("?").strip()
        return f"АНАЛИЗ ЗАПРОСА: «{topic}». Это интересная тема. Могу рассказать подробнее — задай уточняющий вопрос или используй поиск для актуальной информации."

    return random.choice(DEFAULT_RESPONSES)


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
    """Чат с ИИ: создание чатов, отправка сообщений, получение истории"""
    cors = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
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
    path = event.get("path", "/")
    params = event.get("queryStringParameters") or {}

    conn = get_db()
    cur = conn.cursor()

    try:
        # GET /chat — список чатов
        if method == "GET" and not params.get("chat_id"):
            cur.execute(
                f"SELECT id, title, created_at, updated_at FROM {SCHEMA}.chats "
                f"WHERE user_id = %s ORDER BY updated_at DESC",
                (user_id,)
            )
            rows = cur.fetchall()
            chats = [{"id": r[0], "title": r[1],
                      "created_at": r[2].isoformat(), "updated_at": r[3].isoformat()} for r in rows]
            return {"statusCode": 200, "headers": cors, "body": json.dumps({"chats": chats})}

        # GET /chat?chat_id=X — сообщения чата
        if method == "GET" and params.get("chat_id"):
            chat_id = int(params["chat_id"])
            cur.execute(f"SELECT id FROM {SCHEMA}.chats WHERE id=%s AND user_id=%s", (chat_id, user_id))
            if not cur.fetchone():
                return {"statusCode": 404, "headers": cors, "body": json.dumps({"error": "not found"})}
            cur.execute(
                f"SELECT id, role, content, blocked, block_reason, created_at FROM {SCHEMA}.messages "
                f"WHERE chat_id = %s ORDER BY created_at ASC",
                (chat_id,)
            )
            rows = cur.fetchall()
            messages = [{"id": r[0], "role": r[1], "content": r[2],
                         "blocked": r[3], "block_reason": r[4],
                         "created_at": r[5].isoformat()} for r in rows]
            return {"statusCode": 200, "headers": cors, "body": json.dumps({"messages": messages})}

        # POST /chat — создать новый чат
        if method == "POST":
            body = json.loads(event.get("body") or "{}")
            action = body.get("action", "create")

            if action == "create":
                title = body.get("title", "Новый диалог")
                cur.execute(
                    f"INSERT INTO {SCHEMA}.chats (user_id, title) VALUES (%s, %s) RETURNING id, title, created_at",
                    (user_id, title)
                )
                row = cur.fetchone()
                # Приветственное сообщение
                cur.execute(
                    f"INSERT INTO {SCHEMA}.messages (chat_id, role, content) VALUES (%s, 'ai', %s)",
                    (row[0], "НОВЫЙ СЕАНС ИНИЦИАЛИЗИРОВАН. Система RM-XXXX_BETA активна. Введите запрос.")
                )
                conn.commit()
                return {"statusCode": 200, "headers": cors, "body": json.dumps(
                    {"id": row[0], "title": row[1], "created_at": row[2].isoformat()}
                )}

            if action == "send":
                chat_id = body.get("chat_id")
                text = body.get("text", "").strip()
                if not chat_id or not text:
                    return {"statusCode": 400, "headers": cors, "body": json.dumps({"error": "chat_id and text required"})}

                cur.execute(f"SELECT id FROM {SCHEMA}.chats WHERE id=%s AND user_id=%s", (chat_id, user_id))
                if not cur.fetchone():
                    return {"statusCode": 404, "headers": cors, "body": json.dumps({"error": "chat not found"})}

                check = check_content(text, filter_level)

                cur.execute(
                    f"INSERT INTO {SCHEMA}.messages (chat_id, role, content, blocked, block_reason) "
                    f"VALUES (%s, 'user', %s, %s, %s) RETURNING id, created_at",
                    (chat_id, text, check["blocked"], check["reason"] if check["blocked"] else None)
                )
                user_msg = cur.fetchone()

                if check["blocked"]:
                    ai_text = f"[{check['reason']}] ЗАПРОС ЗАБЛОКИРОВАН СИСТЕМОЙ ФИЛЬТРАЦИИ."
                    ai_blocked = True
                else:
                    # Получаем историю для контекста
                    cur.execute(
                        f"SELECT role, content FROM {SCHEMA}.messages WHERE chat_id=%s ORDER BY created_at DESC LIMIT 10",
                        (chat_id,)
                    )
                    history = [{"role": r[0], "content": r[1]} for r in cur.fetchall()]
                    ai_text = generate_response(text, history)
                    ai_blocked = False

                cur.execute(
                    f"INSERT INTO {SCHEMA}.messages (chat_id, role, content, blocked) "
                    f"VALUES (%s, 'ai', %s, %s) RETURNING id, created_at",
                    (chat_id, ai_text, ai_blocked)
                )
                ai_msg = cur.fetchone()

                # Обновляем updated_at чата
                cur.execute(
                    f"UPDATE {SCHEMA}.chats SET updated_at=NOW(), title=CASE WHEN title='Новый диалог' THEN %s ELSE title END WHERE id=%s",
                    (text[:40] + ("..." if len(text) > 40 else ""), chat_id)
                )
                conn.commit()

                return {"statusCode": 200, "headers": cors, "body": json.dumps({
                    "user_message": {"id": user_msg[0], "role": "user", "content": text,
                                     "blocked": check["blocked"], "block_reason": check["reason"],
                                     "created_at": user_msg[1].isoformat()},
                    "ai_message": {"id": ai_msg[0], "role": "ai", "content": ai_text,
                                   "blocked": ai_blocked, "created_at": ai_msg[1].isoformat()}
                })}

        # DELETE /chat?chat_id=X — удалить чат
        if method == "DELETE" and params.get("chat_id"):
            chat_id = int(params["chat_id"])
            cur.execute(f"SELECT id FROM {SCHEMA}.chats WHERE id=%s AND user_id=%s", (chat_id, user_id))
            if not cur.fetchone():
                return {"statusCode": 404, "headers": cors, "body": json.dumps({"error": "not found"})}
            cur.execute(f"UPDATE {SCHEMA}.messages SET content='[УДАЛЕНО]' WHERE chat_id=%s", (chat_id,))
            cur.execute(f"UPDATE {SCHEMA}.chats SET title='[УДАЛЕНО]' WHERE id=%s", (chat_id,))
            conn.commit()
            return {"statusCode": 200, "headers": cors, "body": json.dumps({"ok": True})}

    finally:
        conn.close()

    return {"statusCode": 405, "headers": cors, "body": json.dumps({"error": "method not allowed"})}
