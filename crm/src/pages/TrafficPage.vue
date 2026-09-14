<template>
  <div class="flex flex-col gap-6">
    <CrmPageHeader
      title="Посещаемость"
      subtitle="Остров и сайт отдельно. Сырой IP не показываем — уникальные адреса часто один край."
      help="Сайт считает Метрику (с баннером cookies). Сад и страница «играть» — только наши цифры."
    />
    <CrmBusy :loading="loading && !data" />
    <template v-if="data">
      <div class="crm-grid-bento-3">
        <StatCard highlight label="Сессии" :value="data.sessions" help="Все заходы за эти дни: сайт и сад вместе." />
        <StatCard label="Просмотры" :value="data.pageviews" help="Сколько страниц открыли. Одна сессия может дать несколько просмотров." />
        <StatCard label="Средняя сессия, сек" :value="data.avg_duration_sec" help="Средняя длина захода. Короткий визит тоже считается." />
        <StatCard label="Родители" :value="data.unique_parents ?? 0" hint="вошли в аккаунт" help="Заходы, где мы знаем семью. Гость без входа сюда не попадает." />
        <StatCard label="Уникальные адреса" :value="data.unique_ips" :hint="data.ip_note || 'не люди'" help="Адреса, не люди. За одним офисом почти все с одним адресом." />
        <StatCard label="Открыли с сайта" :value="data.play_opens ?? 0" hint="кнопка «играть», не сад" help="С сайта нажали «играть». Это ещё не заход в сад." />
      </div>
      <LineChart title="Сессии по дням" help="Сайт и сад вместе, по дням Москвы." :points="data.charts.sessions" />
      <div class="crm-grid-charts-2">
        <LineChart title="Сайт" help="Только сайт. Маркетинговые визиты, не сад." :points="data.charts.site ?? []" />
        <LineChart title="Остров" help="Только сад." :points="data.charts.island ?? []" />
      </div>
      <div class="crm-grid-charts-2">
        <DonutChart title="Источник" help="Сайт или сад. Других продуктов нет." :slices="sourceSlices" />
        <DonutChart title="Устройство" help="Телефон, планшет или компьютер. Планшет часто выглядит как телефон." :slices="deviceSlices" />
      </div>
      <div class="crm-grid-charts-2">
        <CrmPanel title="Страна по IP" help="Страна при заходе. Сырой адрес не храним. За одним офисом страна часто одна.">
          <table class="w-full text-sm">
            <thead>
              <tr class="text-left text-muted">
                <th class="py-2">Страна</th>
                <th>Сессии</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in data.by_country" :key="item.key || 'unknown'">
                <td class="py-2">{{ item.label || item.key || "неизвестно" }}</td>
                <td>{{ item.count }}</td>
              </tr>
            </tbody>
          </table>
          <p v-if="!data.by_country.length" class="text-sm text-muted m-0">Пока нет сессий.</p>
        </CrmPanel>
        <CrmPanel title="Язык браузера" help="Язык браузера, не язык ребёнка и не страна оплаты.">
          <table class="w-full text-sm">
            <thead>
              <tr class="text-left text-muted">
                <th class="py-2">Язык</th>
                <th>Сессии</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in data.by_locale" :key="item.key">
                <td class="py-2">{{ item.key }}</td>
                <td>{{ item.count }}</td>
              </tr>
            </tbody>
          </table>
        </CrmPanel>
      </div>
      <CrmPanel title="События острова" help="Клики в саду: мир, магазин, рисовалка, уход. Не рисунки и не имена. Полный список — вкладка «События» у островов.">
        <table class="w-full text-sm">
          <thead>
            <tr class="text-left text-muted">
              <th class="py-2">Событие</th>
              <th>Раз</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in data.island_events ?? []" :key="item.event">
              <td class="py-2">{{ eventLabel(item.event) }}</td>
              <td>{{ item.count }}</td>
            </tr>
          </tbody>
        </table>
        <p v-if="!(data.island_events ?? []).length" class="text-sm text-muted m-0">Пока нет событий острова.</p>
      </CrmPanel>
      <div class="crm-grid-charts-2">
        <CrmPanel title="Ролик / utm_source" help="Первая метка с объявления. Не перезаписывается следующим роликом. Пусто — зашли без метки.">
          <table class="w-full text-sm">
            <thead>
              <tr class="text-left text-muted">
                <th class="py-2">Источник</th>
                <th>Сессии</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in data.by_utm_source ?? []" :key="`src-${item.key || 'none'}`">
                <td class="py-2">{{ item.label || item.key || "без метки" }}</td>
                <td>{{ item.count }}</td>
              </tr>
            </tbody>
          </table>
          <p v-if="!(data.by_utm_source ?? []).length" class="text-sm text-muted m-0">Пока нет меток.</p>
        </CrmPanel>
        <CrmPanel title="Кампания / utm_campaign" help="Первая кампания визита. Смотрите рядом оплаты пакетов, не просмотры.">
          <table class="w-full text-sm">
            <thead>
              <tr class="text-left text-muted">
                <th class="py-2">Кампания</th>
                <th>Сессии</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in data.by_utm_campaign ?? []" :key="`camp-${item.key || 'none'}`">
                <td class="py-2">{{ item.label || item.key || "без метки" }}</td>
                <td>{{ item.count }}</td>
              </tr>
            </tbody>
          </table>
          <p v-if="!(data.by_utm_campaign ?? []).length" class="text-sm text-muted m-0">Пока нет кампаний.</p>
        </CrmPanel>
      </div>
      <div class="crm-grid-charts-2">
        <CrmPanel title="Пакеты по источнику" help="Подтверждённые пакеты зверей с первой меткой семьи. Острова сюда не входят.">
          <table class="w-full text-sm">
            <thead>
              <tr class="text-left text-muted">
                <th class="py-2">Источник</th>
                <th>Оплаты</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in data.paid_by_utm_source ?? []" :key="`paid-src-${item.key || 'none'}`">
                <td class="py-2">{{ item.label || item.key || "без метки" }}</td>
                <td>{{ item.count }}</td>
              </tr>
            </tbody>
          </table>
          <p v-if="!(data.paid_by_utm_source ?? []).length" class="text-sm text-muted m-0">Пока нет оплат пакетов с меткой.</p>
        </CrmPanel>
        <CrmPanel title="Пакеты по кампании" help="Какой ролик принёс оплату пакета, а не только просмотр.">
          <table class="w-full text-sm">
            <thead>
              <tr class="text-left text-muted">
                <th class="py-2">Кампания</th>
                <th>Оплаты</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in data.paid_by_utm_campaign ?? []" :key="`paid-camp-${item.key || 'none'}`">
                <td class="py-2">{{ item.label || item.key || "без метки" }}</td>
                <td>{{ item.count }}</td>
              </tr>
            </tbody>
          </table>
          <p v-if="!(data.paid_by_utm_campaign ?? []).length" class="text-sm text-muted m-0">Пока нет оплат пакетов с кампанией.</p>
        </CrmPanel>
      </div>
      <CrmPanel title="Страницы" help="Страницы маркетингового сайта. Страница «играть» тоже может попасть сюда.">
        <table class="w-full text-sm">
          <thead>
            <tr class="text-left text-muted">
              <th class="py-2">Путь</th>
              <th>Просмотры</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="page in data.top_pages" :key="page.path">
              <td class="py-2">{{ page.path }}</td>
              <td>{{ page.views }}</td>
            </tr>
          </tbody>
        </table>
      </CrmPanel>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import CrmBusy from "@/components/crm/CrmBusy.vue";
import CrmPageHeader from "@/components/crm/CrmPageHeader.vue";
import CrmPanel from "@/components/crm/CrmPanel.vue";
import StatCard from "@/components/dashboard/StatCard.vue";
import LineChart from "@/components/dashboard/LineChart.vue";
import DonutChart from "@/components/dashboard/DonutChart.vue";
import { crmApi, type Traffic } from "@/lib/api";
import { eventLabel } from "@/lib/islandEvents";
import { usePeriodStore } from "@/stores/period";

const SOURCE_LABEL: Record<string, string> = { site: "Сайт", island: "Остров" };

const period = usePeriodStore();
const data = ref<Traffic | null>(null);
const loading = ref(true);
const sourceSlices = computed(() =>
  (data.value?.by_source ?? []).map((item) => ({ label: SOURCE_LABEL[item.key] || item.key, value: item.count })),
);
const deviceSlices = computed(() => (data.value?.by_device ?? []).map((item) => ({ label: item.key, value: item.count })));

onMounted(async () => {
  loading.value = true;
  try {
    data.value = await crmApi.traffic(period.query);
  } finally {
    loading.value = false;
  }
});
</script>
