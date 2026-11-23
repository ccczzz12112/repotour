"""LLM 客户端：OpenAI 兼容 API + 严格 JSON 解析 + 失败重试 + SQLite 缓存 + mock/降级。
任何一步 LLM 失败都会降级到确定性构造器，流水线绝不中途崩溃。"""
import hashlib
import json
import re
import threading
import httpx
from . import config, db

FENCE = chr(96) * 3  # markdown 代码围栏


class LLMError(Exception):
    pass


_stats_lock = threading.Lock()

SYSTEM = ("你是资深代码考古学家。只输出合法 JSON，不要输出任何额外文本。"
          "所有结论必须附证据（文件路径+行号），禁止编造不存在的文件或符号。")


def _extract_json(text: str):
    text = text.strip()
    text = re.sub("^" + FENCE + r"(?:json)?\s*|\s*" + FENCE + "$", "", text, flags=re.S)
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    for a, b in (("{", "}"), ("[", "]")):
        i, j = text.find(a), text.rfind(b)
        if i != -1 and j > i:
            try:
                return json.loads(text[i:j + 1])
            except json.JSONDecodeError:
                continue
    raise LLMError("LLM 输出不是合法 JSON")


def _post(model, messages):
    if not config.LLM_API_KEY:
        raise LLMError("未配置 LLM_API_KEY（复制 .env.example 为 .env 并填入）")
    r = httpx.post(config.LLM_BASE_URL + "/chat/completions",
                   headers={"Authorization": f"Bearer {config.LLM_API_KEY}"},
                   json={"model": model, "messages": messages, "temperature": 0.2},
                   timeout=config.LLM_TIMEOUT)
    if r.status_code != 200:
        raise LLMError(f"LLM HTTP {r.status_code}: {r.text[:200]}")
    return r.json()["choices"][0]["message"]["content"]


def call_json(step, prompt, payload, mock_builder, strong=False, stats=None):
    """统一入口：mock 模式直接走构造器；live 模式 缓存→调用→重试→降级。"""
    def bump(k):
        if stats is not None:
            with _stats_lock:
                stats[k] = stats.get(k, 0) + 1

    if config.LLM_MODE == "mock":
        return mock_builder(payload)
    model = config.LLM_MODEL_STRONG if strong else config.LLM_MODEL_MAP
    key = hashlib.sha256(f"{model}|{prompt}".encode("utf-8")).hexdigest()
    cached = db.cache_get(key)
    if cached:
        bump("cache_hits")
        try:
            return json.loads(cached)
        except json.JSONDecodeError:
            pass
    messages = [{"role": "system", "content": SYSTEM}, {"role": "user", "content": prompt}]
    try:
        bump("llm_calls")
        data = _extract_json(_post(model, messages))
    except LLMError:
        try:
            bump("llm_calls")
            messages.append({"role": "user", "content": "输出不是合法 JSON，请重新只输出合法 JSON。"})
            data = _extract_json(_post(model, messages))
        except (LLMError, httpx.HTTPError, KeyError, IndexError):
            bump("fallbacks")
            return mock_builder(payload)
    except (httpx.HTTPError, KeyError, IndexError):
        bump("fallbacks")
        return mock_builder(payload)
    db.cache_put(key, model, json.dumps(data, ensure_ascii=False))
    return data
