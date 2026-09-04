#!/usr/bin/env python3
"""Собрать публичные HTML юридических страниц Zooofun из ru/*.txt."""

from __future__ import annotations

import html
import re
from pathlib import Path

LEGAL = Path(__file__).resolve().parent
RU = LEGAL / "ru"

PAGES = [
    ("politika-konfidencialnosti.txt", "privacy.html", "Политика конфиденциальности Zooofun"),
    ("polzovatelskoe-soglashenie.txt", "terms.html", "Пользовательское соглашение Zooofun"),
    ("usloviya-pokupok.txt", "purchases.html", "Условия покупок Zooofun"),
    ("konfidencialnost-detey.txt", "children-privacy.html", "Конфиденциальность детей Zooofun"),
    ("podderzhka.txt", "support.html", "Поддержка Zooofun"),
    ("soglasie-rassylka.txt", "marketing-consent.html", "Согласие на рассылку Zooofun"),
    ("soglasie-polzovatelya.txt", "consent-user.html", "Согласие пользователя Zooofun"),
    ("soglasie-roditelya.txt", "consent-parent.html", "Согласие родителя Zooofun"),
    ("soglasie-risunok-ii.txt", "consent-drawing.html", "Согласие на рисунок и ИИ Zooofun"),
]

NAV = """    <nav class="legal-nav">
      <a href="/privacy">Политика</a>
      <a href="/terms">Соглашение</a>
      <a href="/purchases">Покупки</a>
      <a href="/children-privacy">Детям</a>
      <a href="/support">Поддержка</a>
    </nav>"""


def to_html_body(text: str) -> str:
    chunks: list[str] = []
    paragraph: list[str] = []
    first_heading = True

    def flush() -> None:
        nonlocal paragraph
        if not paragraph:
            return
        block = "\n".join(paragraph).strip()
        paragraph = []
        if not block:
            return
        if re.fullmatch(r"=+", block):
            return
        if block.startswith("☐"):
            chunks.append(f"<p><strong>{html.escape(block)}</strong></p>")
            return
        compact = re.sub(r"\s+", " ", block)
        if len(compact) >= 6 and compact == compact.upper() and re.fullmatch(
            r"[0-9А-ЯA-ZЁ .«»\"'\-/(),:]+", compact
        ):
            nonlocal first_heading
            tag = "h1" if first_heading else "h2"
            first_heading = False
            chunks.append(f"<{tag}>{html.escape(compact)}</{tag}>")
            return
        if "\n" not in block and re.fullmatch(r"\d+\.\s+.+", compact) and len(compact) < 100:
            chunks.append(f"<h2>{html.escape(compact)}</h2>")
            return
        lines = block.split("\n")
        if all(line.strip().startswith("•") or not line.strip() for line in lines):
            items = "".join(
                f"<li>{html.escape(line.strip()[1:].strip())}</li>"
                for line in lines
                if line.strip()
            )
            chunks.append(f"<ul>{items}</ul>")
            return
        if "|" in block and "\n" in block:
            rows = [line for line in lines if line.strip()]
            if len(rows) >= 2 and rows[0].count("|") >= 2:
                table = ["<table>"]
                header_done = False
                for row in rows:
                    if re.fullmatch(r"[\-|\s]+", row):
                        continue
                    parts = [html.escape(c.strip()) for c in row.split("|")]
                    cells = [c for c in parts if c]
                    tag = "th" if not header_done else "td"
                    header_done = True
                    table.append("<tr>" + "".join(f"<{tag}>{c}</{tag}>" for c in cells) + "</tr>")
                table.append("</table>")
                chunks.append("".join(table))
                return
        escaped = "<br>\n".join(html.escape(line) for line in lines)
        chunks.append(f"<p>{escaped}</p>")

    for raw in text.splitlines():
        line = raw.rstrip()
        if not line.strip():
            flush()
            continue
        if re.fullmatch(r"=+", line.strip()):
            flush()
            continue
        paragraph.append(line)
    flush()
    return "\n".join(chunks)


def page(title: str, body: str) -> str:
    return f"""<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{html.escape(title)}</title>
  <link rel="stylesheet" href="/legal/styles.css">
</head>
<body>
  <div class="wrap">
{NAV}
    <article class="card">
{body}
    </article>
  </div>
  <script src="/legal/cookie-consent.js"></script>
</body>
</html>
"""


def main() -> None:
    LEGAL.mkdir(parents=True, exist_ok=True)
    for src_name, dest_name, title in PAGES:
        src = RU / src_name
        text = src.read_text(encoding="utf-8")
        body = to_html_body(text)
        (LEGAL / dest_name).write_text(page(title, body), encoding="utf-8")
        print(f"wrote {dest_name}")


if __name__ == "__main__":
    main()
