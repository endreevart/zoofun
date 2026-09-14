"""Country at ingest from an edge header or a local prefix table.

Never stores the raw IP. Never calls a third-party geo API.
"""

from __future__ import annotations

from functools import lru_cache
from ipaddress import AddressValueError, IPv4Address, IPv6Address, ip_address, ip_network

# Cloudflare / Tor / anonymous placeholders are not countries.
_SKIP_HEADERS = frozenset({"", "XX", "T1", "A1", "A2"})

COUNTRY_NAMES: dict[str, str] = {
    "AM": "Армения",
    "AZ": "Азербайджан",
    "BY": "Беларусь",
    "CN": "Китай",
    "DE": "Германия",
    "EE": "Эстония",
    "FI": "Финляндия",
    "FR": "Франция",
    "GE": "Грузия",
    "IL": "Израиль",
    "IN": "Индия",
    "IT": "Италия",
    "KG": "Кыргызстан",
    "KZ": "Казахстан",
    "LT": "Литва",
    "LV": "Латвия",
    "NL": "Нидерланды",
    "PL": "Польша",
    "RU": "Россия",
    "TJ": "Таджикистан",
    "TM": "Туркменистан",
    "TR": "Турция",
    "UA": "Украина",
    "US": "США",
    "UZ": "Узбекистан",
    "GB": "Великобритания",
}

# Local-only prefixes: office, Docker, the API host itself.
_PRIVATE = (
    "0.0.0.0/8",
    "10.0.0.0/8",
    "127.0.0.0/8",
    "169.254.0.0/16",
    "172.16.0.0/12",
    "192.168.0.0/16",
    "::1/128",
    "fc00::/7",
    "fe80::/10",
)

# Compact consumer prefixes we actually see. Header from the edge wins when present.
# 2.16.0.0/13 is Akamai anycast — do not map it to a country.
_NETWORKS: tuple[tuple[str, str], ...] = (
    ("8.8.4.0/24", "US"),
    ("8.8.8.0/24", "US"),
    ("9.9.9.0/24", "US"),
    ("77.88.0.0/18", "RU"),
    ("87.250.224.0/19", "RU"),
    ("93.158.128.0/18", "RU"),
    ("5.255.192.0/18", "RU"),
    ("37.9.64.0/18", "RU"),
    ("37.140.128.0/18", "RU"),
    ("5.16.0.0/13", "RU"),
    ("5.136.0.0/13", "RU"),
    ("5.228.0.0/16", "RU"),
    ("31.173.0.0/16", "RU"),
    ("37.19.0.0/16", "RU"),
    ("37.110.0.0/16", "RU"),
    ("46.42.0.0/16", "RU"),
    ("46.48.0.0/16", "RU"),
    ("46.138.0.0/16", "RU"),
    ("46.148.0.0/16", "RU"),
    ("46.188.0.0/16", "RU"),
    ("62.105.0.0/16", "RU"),
    ("77.37.0.0/16", "RU"),
    ("77.41.0.0/16", "RU"),
    ("78.29.0.0/16", "RU"),
    ("78.85.0.0/16", "RU"),
    ("78.106.0.0/16", "RU"),
    ("79.111.0.0/16", "RU"),
    ("80.246.0.0/16", "RU"),
    ("81.177.0.0/16", "RU"),
    ("83.149.0.0/16", "RU"),
    ("83.220.0.0/16", "RU"),
    ("84.52.0.0/16", "RU"),
    ("85.26.0.0/16", "RU"),
    ("87.117.0.0/16", "RU"),
    ("89.178.0.0/16", "RU"),
    ("90.154.0.0/16", "RU"),
    ("91.76.0.0/16", "RU"),
    ("91.122.0.0/16", "RU"),
    ("92.100.0.0/16", "RU"),
    ("94.25.0.0/16", "RU"),
    ("95.24.0.0/13", "RU"),
    ("95.32.0.0/16", "RU"),
    ("95.52.0.0/16", "RU"),
    ("95.84.0.0/16", "RU"),
    ("95.153.0.0/16", "RU"),
    ("109.61.0.0/16", "RU"),
    ("109.194.0.0/16", "RU"),
    ("109.252.0.0/16", "RU"),
    ("128.72.0.0/16", "RU"),
    ("176.14.0.0/16", "RU"),
    ("176.59.0.0/16", "RU"),
    ("178.34.0.0/16", "RU"),
    ("178.140.0.0/16", "RU"),
    ("178.176.0.0/16", "RU"),
    ("185.15.0.0/16", "RU"),
    ("188.32.0.0/16", "RU"),
    ("188.162.0.0/16", "RU"),
    ("188.170.0.0/16", "RU"),
    ("188.187.0.0/16", "RU"),
    ("188.242.0.0/16", "RU"),
    ("193.232.0.0/16", "RU"),
    ("195.34.0.0/16", "RU"),
    ("212.13.0.0/16", "RU"),
    ("213.87.0.0/16", "RU"),
    ("217.118.0.0/16", "RU"),
    ("2a00:1fa0::/32", "RU"),
    ("2a02:6b8::/32", "RU"),
    ("2a03:6f00::/32", "RU"),
    ("2.132.0.0/14", "KZ"),
    ("5.34.0.0/16", "KZ"),
    ("5.250.0.0/16", "KZ"),
    ("37.99.0.0/16", "KZ"),
    ("37.150.0.0/15", "KZ"),
    ("89.218.0.0/16", "KZ"),
    ("92.47.0.0/16", "KZ"),
    ("95.56.0.0/16", "KZ"),
    ("178.88.0.0/16", "KZ"),
    ("185.48.0.0/16", "KZ"),
    ("37.17.0.0/16", "BY"),
    ("37.212.0.0/16", "BY"),
    ("86.57.0.0/16", "BY"),
    ("93.84.0.0/15", "BY"),
    ("178.120.0.0/14", "BY"),
    ("37.110.128.0/17", "UZ"),
    ("84.54.0.0/16", "UZ"),
    ("89.236.0.0/16", "UZ"),
    ("213.230.0.0/16", "UZ"),
    ("31.42.0.0/16", "UA"),
    ("37.52.0.0/16", "UA"),
    ("46.118.0.0/16", "UA"),
    ("176.36.0.0/16", "UA"),
    ("46.16.0.0/16", "AM"),
    ("5.63.0.0/16", "AZ"),
    ("5.44.0.0/16", "GE"),
)


def country_label(code: str) -> str:
    value = (code or "").strip().upper()
    if not value:
        return "неизвестно"
    return COUNTRY_NAMES.get(value, value)


def header_country(header: str) -> str:
    raw = (header or "").strip().upper()
    if raw in _SKIP_HEADERS:
        return ""
    if len(raw) == 2 and raw.isalpha():
        return raw
    return ""


def lookup_country(ip: str, header: str = "") -> str:
    code = header_country(header)
    if code:
        return code
    return _cidr_country(ip)


@lru_cache(maxsize=1)
def _parsed_networks() -> tuple[tuple[object, str], ...]:
    private = tuple((ip_network(item, strict=False), "") for item in _PRIVATE)
    public = tuple((ip_network(cidr, strict=False), cc) for cidr, cc in _NETWORKS)
    return (*private, *public)


def _cidr_country(ip: str) -> str:
    text = (ip or "").strip()
    if not text:
        return ""
    try:
        address = ip_address(text)
    except (AddressValueError, ValueError):
        return ""
    if isinstance(address, (IPv4Address, IPv6Address)) and address.is_private:
        return ""
    for network, code in _parsed_networks():
        if address in network:
            return code
    return ""
