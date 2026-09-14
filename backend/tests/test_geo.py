from app.analytics.geo import country_label, lookup_country


def test_header_country_wins_over_cidr() -> None:
    assert lookup_country("8.8.8.8", "KZ") == "KZ"
    assert lookup_country("8.8.8.8", "xx") == "US"
    assert lookup_country("8.8.8.8") == "US"


def test_yandex_and_private_ips() -> None:
    assert lookup_country("77.88.8.8") == "RU"
    assert lookup_country("127.0.0.1") == ""
    assert lookup_country("10.1.2.3") == ""
    assert lookup_country("") == ""


def test_country_label_in_russian() -> None:
    assert country_label("RU") == "Россия"
    assert country_label("") == "неизвестно"
    assert country_label("ZZ") == "ZZ"
