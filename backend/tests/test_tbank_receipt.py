from app.providers.tbank import receipt_for_pack, sign


def test_receipt_totals_match_pack_price() -> None:
    receipt = receipt_for_pack(
        email="parent@example.com",
        description="Zooofun: 5 животных",
        amount_rub=1990,
        taxation="usn_income",
        item_tax="none",
        company_email="cio@example.com",
    )
    item = receipt["Items"][0]
    assert receipt["Taxation"] == "usn_income"
    assert receipt["Email"] == "parent@example.com"
    assert receipt["EmailCompany"] == "cio@example.com"
    assert item["Price"] == 199000
    assert item["Amount"] == 199000
    assert item["PaymentObject"] == "service"


def test_token_ignores_receipt_object() -> None:
    base = {"TerminalKey": "term", "Amount": 100, "OrderId": "pay_1"}
    with_receipt = {
        **base,
        "Receipt": receipt_for_pack(
            email="a@b.c",
            description="pack",
            amount_rub=1,
            taxation="usn_income",
            item_tax="none",
        ),
    }
    assert sign(base, "secret") == sign(with_receipt, "secret")
