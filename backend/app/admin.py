"""SQLAdmin on /staff. Labels are Russian; this is the operator console."""

from __future__ import annotations

from sqladmin import Admin, ModelView
from sqladmin.authentication import AuthenticationBackend
from sqladmin.i18n import I18nConfig
from starlette.requests import Request

from app.accounts.passwords import hash_password, looks_hashed
from app.persistence.db import get_engine
from app.persistence.models import (
    AnalyticsEventRow,
    AnalyticsSessionRow,
    ChildRow,
    CreatureRow,
    OperatorSessionRow,
    OpsLogRow,
    PackRow,
    ParentRow,
    ParentSessionRow,
    PaymentRow,
)
from app.settings import get_settings


class AdminAuth(AuthenticationBackend):
    async def login(self, request: Request) -> bool:
        form = await request.form()
        username = str(form.get("username") or "")
        password = str(form.get("password") or "")
        settings = get_settings()
        expected_login = settings.operator_login.strip()
        expected_password = settings.operator_password
        if not expected_login or not expected_password:
            return False
        if username != expected_login or password != expected_password:
            return False
        request.session.update({"staff": expected_login})
        return True

    async def logout(self, request: Request) -> bool:
        request.session.clear()
        return True

    async def authenticate(self, request: Request) -> bool:
        return bool(request.session.get("staff"))


class ParentAdmin(ModelView, model=ParentRow):
    name = "Родитель"
    name_plural = "Родители"
    icon = "fa-solid fa-user"
    category = "Семьи"
    category_icon = "fa-solid fa-house"
    column_list = [
        ParentRow.email,
        ParentRow.quota_total,
        ParentRow.generation_used,
        ParentRow.last_login_at,
        ParentRow.created_at,
        ParentRow.id,
    ]
    column_searchable_list = [ParentRow.email, ParentRow.id]
    column_sortable_list = [
        ParentRow.email,
        ParentRow.quota_total,
        ParentRow.generation_used,
        ParentRow.last_login_at,
        ParentRow.created_at,
    ]
    column_labels = {
        ParentRow.id: "ID",
        ParentRow.email: "Почта",
        ParentRow.password_hash: "Пароль (новый текст будет захеширован)",
        ParentRow.quota_total: "Лимит генераций",
        ParentRow.generation_used: "Использовано",
        ParentRow.created_at: "Создан",
        ParentRow.updated_at: "Изменён",
        ParentRow.last_login_at: "Последний вход",
        ParentRow.children: "Дети",
        ParentRow.payments: "Платежи",
    }
    form_include_pk = True
    can_export = True

    async def on_model_change(self, data, model, is_created, request) -> None:
        raw = data.get("password_hash") or ""
        if raw and not looks_hashed(str(raw)):
            data["password_hash"] = hash_password(str(raw))


class ChildAdmin(ModelView, model=ChildRow):
    name = "Ребёнок"
    name_plural = "Дети"
    icon = "fa-solid fa-child"
    category = "Семьи"
    column_list = [ChildRow.nickname, ChildRow.parent, ChildRow.created_at, ChildRow.id]
    column_searchable_list = [ChildRow.nickname, ChildRow.id]
    column_labels = {
        ChildRow.id: "ID",
        ChildRow.parent_id: "Родитель",
        ChildRow.nickname: "Кличка",
        ChildRow.created_at: "Создан",
        ChildRow.parent: "Родитель",
        ChildRow.creatures: "Животные",
    }
    form_include_pk = True
    can_export = True


class CreatureAdmin(ModelView, model=CreatureRow):
    name = "Животное"
    name_plural = "Животные"
    icon = "fa-solid fa-paw"
    category = "Зоопарк"
    category_icon = "fa-solid fa-tree"
    column_list = [
        CreatureRow.name,
        CreatureRow.spec_id,
        CreatureRow.child,
        CreatureRow.created_at,
        CreatureRow.updated_at,
    ]
    column_searchable_list = [CreatureRow.name, CreatureRow.spec_id]
    column_labels = {
        CreatureRow.child_id: "Ребёнок",
        CreatureRow.spec_id: "ID существа",
        CreatureRow.name: "Имя",
        CreatureRow.payload: "Данные",
        CreatureRow.created_at: "Создан",
        CreatureRow.updated_at: "Изменён",
        CreatureRow.child: "Ребёнок",
    }
    form_include_pk = True
    can_export = True


class PackAdmin(ModelView, model=PackRow):
    name = "Пакет"
    name_plural = "Пакеты генераций"
    icon = "fa-solid fa-box"
    category = "Коммерция"
    category_icon = "fa-solid fa-ruble-sign"
    column_list = [PackRow.id, PackRow.animals, PackRow.price_rub, PackRow.list_price_rub, PackRow.featured]
    column_sortable_list = [PackRow.animals, PackRow.price_rub, PackRow.list_price_rub]
    column_labels = {
        PackRow.id: "Код",
        PackRow.animals: "Животных",
        PackRow.price_rub: "Цена со скидкой, ₽",
        PackRow.list_price_rub: "Цена без скидки, ₽",
        PackRow.featured: "Отмечен",
    }
    form_include_pk = True
    can_export = True


class PaymentAdmin(ModelView, model=PaymentRow):
    name = "Платёж"
    name_plural = "Платежи"
    icon = "fa-solid fa-receipt"
    category = "Коммерция"
    column_list = [
        PaymentRow.id,
        PaymentRow.tbank_payment_id,
        PaymentRow.parent,
        PaymentRow.pack_id,
        PaymentRow.amount_rub,
        PaymentRow.status,
        PaymentRow.tbank_status,
        PaymentRow.error_code,
        PaymentRow.created_at,
    ]
    column_searchable_list = [
        PaymentRow.id,
        PaymentRow.tbank_payment_id,
        PaymentRow.pack_id,
        PaymentRow.status,
        PaymentRow.error_code,
    ]
    column_labels = {
        PaymentRow.id: "Заказ",
        PaymentRow.parent_id: "Родитель",
        PaymentRow.parent: "Родитель",
        PaymentRow.pack_id: "Пакет",
        PaymentRow.animals: "Животных",
        PaymentRow.amount_rub: "Сумма, ₽",
        PaymentRow.status: "Статус",
        PaymentRow.created_at: "Создан",
        PaymentRow.tbank_payment_id: "PaymentId Т-Банка",
        PaymentRow.payment_url: "Ссылка на оплату",
        PaymentRow.tbank_status: "Статус Т-Банка",
        PaymentRow.error_code: "Код ошибки",
        PaymentRow.error_message: "Ошибка",
        PaymentRow.last_notify_at: "Последнее уведомление",
        PaymentRow.refunded_at: "Возврат",
    }
    form_include_pk = True
    can_export = True


class ParentSessionAdmin(ModelView, model=ParentSessionRow):
    name = "Сессия родителя"
    name_plural = "Сессии родителей"
    icon = "fa-solid fa-key"
    category = "Доступ"
    category_icon = "fa-solid fa-shield"
    column_list = [
        ParentSessionRow.parent_id,
        ParentSessionRow.child_id,
        ParentSessionRow.created_at,
        ParentSessionRow.expires_at,
    ]
    column_labels = {
        ParentSessionRow.token: "Токен",
        ParentSessionRow.parent_id: "Родитель",
        ParentSessionRow.child_id: "Ребёнок",
        ParentSessionRow.created_at: "Создана",
        ParentSessionRow.expires_at: "Истекает",
    }
    can_create = False
    can_export = True


class OperatorSessionAdmin(ModelView, model=OperatorSessionRow):
    name = "Сессия оператора"
    name_plural = "Сессии оператора"
    icon = "fa-solid fa-user-shield"
    category = "Доступ"
    column_list = [OperatorSessionRow.expires_at]
    column_labels = {
        OperatorSessionRow.token: "Токен",
        OperatorSessionRow.expires_at: "Истекает",
    }
    can_create = False
    can_export = True


class AnalyticsSessionAdmin(ModelView, model=AnalyticsSessionRow):
    name = "Сессия"
    name_plural = "Сессии"
    icon = "fa-solid fa-clock"
    category = "Аналитика"
    category_icon = "fa-solid fa-chart-line"
    column_list = [
        AnalyticsSessionRow.id,
        AnalyticsSessionRow.parent_id,
        AnalyticsSessionRow.child_id,
        AnalyticsSessionRow.source,
        AnalyticsSessionRow.device_type,
        AnalyticsSessionRow.os,
        AnalyticsSessionRow.browser,
        AnalyticsSessionRow.started_at,
        AnalyticsSessionRow.duration_sec,
    ]
    column_searchable_list = [
        AnalyticsSessionRow.id,
        AnalyticsSessionRow.parent_id,
        AnalyticsSessionRow.child_id,
        AnalyticsSessionRow.source,
    ]
    column_sortable_list = [
        AnalyticsSessionRow.started_at,
        AnalyticsSessionRow.duration_sec,
        AnalyticsSessionRow.source,
    ]
    column_labels = {
        AnalyticsSessionRow.id: "ID сессии",
        AnalyticsSessionRow.parent_id: "Родитель",
        AnalyticsSessionRow.child_id: "Ребёнок",
        AnalyticsSessionRow.source: "Источник",
        AnalyticsSessionRow.device_type: "Устройство",
        AnalyticsSessionRow.os: "ОС",
        AnalyticsSessionRow.browser: "Браузер",
        AnalyticsSessionRow.screen_w: "Ширина экрана",
        AnalyticsSessionRow.screen_h: "Высота экрана",
        AnalyticsSessionRow.user_agent: "User-Agent",
        AnalyticsSessionRow.locale: "Локаль",
        AnalyticsSessionRow.ip_hash: "IP (хеш)",
        AnalyticsSessionRow.started_at: "Начало",
        AnalyticsSessionRow.ended_at: "Конец",
        AnalyticsSessionRow.duration_sec: "Длительность, с",
        AnalyticsSessionRow.is_parent_gate: "За parent gate",
    }
    column_default_sort = (AnalyticsSessionRow.started_at, True)
    can_create = False
    can_edit = False
    can_export = True
    page_size = 50


class AnalyticsEventAdmin(ModelView, model=AnalyticsEventRow):
    name = "Событие"
    name_plural = "События"
    icon = "fa-solid fa-bolt"
    category = "Аналитика"
    column_list = [
        AnalyticsEventRow.id,
        AnalyticsEventRow.event,
        AnalyticsEventRow.session_id,
        AnalyticsEventRow.parent_id,
        AnalyticsEventRow.child_id,
        AnalyticsEventRow.created_at,
    ]
    column_searchable_list = [
        AnalyticsEventRow.event,
        AnalyticsEventRow.session_id,
        AnalyticsEventRow.parent_id,
        AnalyticsEventRow.child_id,
    ]
    column_sortable_list = [
        AnalyticsEventRow.created_at,
        AnalyticsEventRow.event,
    ]
    column_labels = {
        AnalyticsEventRow.id: "ID",
        AnalyticsEventRow.session_id: "Сессия",
        AnalyticsEventRow.parent_id: "Родитель",
        AnalyticsEventRow.child_id: "Ребёнок",
        AnalyticsEventRow.event: "Событие",
        AnalyticsEventRow.payload: "Данные",
        AnalyticsEventRow.created_at: "Время",
    }
    column_default_sort = (AnalyticsEventRow.created_at, True)
    can_create = False
    can_edit = False
    can_export = True
    page_size = 100


class OpsLogAdmin(ModelView, model=OpsLogRow):
    name = "Лог"
    name_plural = "Логи"
    icon = "fa-solid fa-clipboard-list"
    category = "Аналитика"
    column_list = [
        OpsLogRow.created_at,
        OpsLogRow.level,
        OpsLogRow.kind,
        OpsLogRow.payment_id,
        OpsLogRow.parent_id,
        OpsLogRow.child_id,
        OpsLogRow.message,
    ]
    column_searchable_list = [
        OpsLogRow.kind,
        OpsLogRow.payment_id,
        OpsLogRow.parent_id,
        OpsLogRow.child_id,
        OpsLogRow.message,
    ]
    column_sortable_list = [OpsLogRow.created_at, OpsLogRow.kind]
    column_labels = {
        OpsLogRow.id: "ID",
        OpsLogRow.created_at: "Время",
        OpsLogRow.level: "Уровень",
        OpsLogRow.kind: "Тип",
        OpsLogRow.payment_id: "Заказ",
        OpsLogRow.parent_id: "Родитель",
        OpsLogRow.child_id: "Ребёнок",
        OpsLogRow.message: "Сообщение",
        OpsLogRow.payload: "Данные",
    }
    column_default_sort = (OpsLogRow.created_at, True)
    can_create = False
    can_edit = False
    can_export = True
    page_size = 100


def mount_admin(app) -> Admin:
    settings = get_settings()
    admin = Admin(
        app,
        get_engine(),
        title="Админка Zooofun",
        base_url="/staff",
        authentication_backend=AdminAuth(secret_key=settings.admin_secret_key),
        i18n_config=I18nConfig(default_locale="ru", language_header_name=None),
    )
    admin.add_view(ParentAdmin)
    admin.add_view(ChildAdmin)
    admin.add_view(CreatureAdmin)
    admin.add_view(PackAdmin)
    admin.add_view(PaymentAdmin)
    admin.add_view(ParentSessionAdmin)
    admin.add_view(OperatorSessionAdmin)
    admin.add_view(AnalyticsSessionAdmin)
    admin.add_view(AnalyticsEventAdmin)
    admin.add_view(OpsLogAdmin)
    return admin
