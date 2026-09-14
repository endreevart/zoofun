from app.accounts.emailaddr import canonical_email, lookup_keys


def test_gmail_plus_and_dots_collapse() -> None:
    assert canonical_email("John.Smith+zoo@gmail.com") == "johnsmith@gmail.com"
    assert canonical_email("johnsmith@googlemail.com") == "johnsmith@gmail.com"


def test_plain_mail_keeps_dots() -> None:
    assert canonical_email("Parent@example.com") == "parent@example.com"


def test_lookup_keys_include_typed_and_canonical() -> None:
    keys = lookup_keys("Ada+1@Gmail.com")
    assert "ada+1@gmail.com" in keys
    assert "ada@gmail.com" in keys
