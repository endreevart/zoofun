from app.crm.mail import broadcast_parts
from app.mailer import login_code_parts


def test_login_code_mail_matches_garden_template() -> None:
    subject, plain, html = login_code_parts("482917", site="https://zooo.fun")
    assert subject == "Код для входа в волшебный сад ZOOOFUN"
    assert "482917" in plain
    assert "10 минут" in plain
    assert "https://zooo.fun/auth" in plain
    assert "4 8 2 9 1 7" in html
    assert "на ZOOOFUN" in html
    assert "Открыть ZOOOFUN" in html
    assert "https://zooo.fun/mail/zoofun-logo.png" in html
    assert "https://zooo.fun/mail/tree.png" in html
    assert "https://zooo.fun/mail/bush.png" in html
    assert "{{CODE}}" not in html
    assert "<script" not in html.lower()
    assert "10 минут" in html.split("display:none")[1]


def test_broadcast_mail_escapes_body_and_has_unsubscribe() -> None:
    subject, plain, html = broadcast_parts(
        "Скидка <b>",
        "Первый абзац.\n\n<script>x</script>",
        unsub="https://zooo.fun/api/zoo/v1/public/unsubscribe?t=abc",
    )
    assert subject == "Скидка <b>"
    assert "Отписаться:" in plain
    assert "&lt;b&gt;" in html
    assert "&lt;script&gt;" in html
    assert "<script" not in html.lower().replace("&lt;script", "")
    assert "unsubscribe?t=abc" in html
    assert "{{BODY}}" not in html
    assert "{{SUBJECT}}" not in html


def test_broadcast_html_keeps_photo_and_strips_script() -> None:
    image = "/v1/public/mail-images/" + ("ab" * 16)
    subject, _plain, html = broadcast_parts(
        "Фото",
        f'<p>Привет</p><img src="{image}" onerror="alert(1)"><script>x</script>',
        unsub="https://zooo.fun/api/zoo/v1/public/unsubscribe?t=abc",
    )
    assert subject == "Фото"
    assert image.replace("/v1/public/", "https://zooo.fun/api/zoo/v1/public/") in html or (
        "api/zoo/v1/public/mail-images/" in html
    )
    assert "onerror" not in html
    assert "<script" not in html.lower().replace("&lt;script", "")
    assert "Привет" in html
