(function () {
  var KEY = "zooofun-cookie-consent";
  var METRIKA_ID = 112277307;

  function storageGet() {
    try {
      return localStorage.getItem(KEY);
    } catch (e) {
      return null;
    }
  }

  function storageSet(value) {
    try {
      localStorage.setItem(KEY, value);
    } catch (e) {}
  }

  function isChildPlayPath() {
    var path = location.pathname || "";
    return path.indexOf("/play") === 0 || path.indexOf("/zoo") === 0 || path.indexOf("/island") === 0;
  }

  function loadMetrika() {
    if (!METRIKA_ID || window.ym || isChildPlayPath()) return;
    (function (m, e, t, r, i, k, a) {
      m[i] =
        m[i] ||
        function () {
          (m[i].a = m[i].a || []).push(arguments);
        };
      m[i].l = 1 * new Date();
      for (var j = 0; j < document.scripts.length; j++) {
        if (document.scripts[j].src === r) return;
      }
      k = e.createElement(t);
      a = e.getElementsByTagName("head")[0] || document.documentElement;
      k.async = 1;
      k.src = r;
      a.appendChild(k);
    })(window, document, "script", "https://mc.yandex.ru/metrika/tag.js?id=" + METRIKA_ID, "ym");
    window.ym(METRIKA_ID, "init", {
      ssr: true,
      webvisor: true,
      clickmap: true,
      ecommerce: "dataLayer",
      referrer: document.referrer,
      url: location.href,
      accurateTrackBounce: true,
      trackLinks: true,
    });
  }

  if (isChildPlayPath()) return;

  var saved = storageGet();
  if (saved === "accepted" || saved === "analytics") {
    loadMetrika();
    return;
  }
  if (saved === "necessary") return;

  var root = document.createElement("div");
  root.className = "cookie-consent";
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-live", "polite");
  root.setAttribute("aria-label", "Уведомление о cookie");
  root.innerHTML =
    '<div class="cookie-consent__inner">' +
    '<p class="cookie-consent__text">' +
    "На сайте используются cookie, своя аналитика посещений и Яндекс.Метрика. На детском экране игры счётчик не загружается. Подробнее в " +
    '<a class="cookie-consent__link" href="/privacy">Политике конфиденциальности</a>.</p>' +
    '<div class="cookie-consent__actions">' +
    '<button type="button" class="cookie-consent__accept" data-choice="analytics">Принять аналитические</button>' +
    '<button type="button" class="cookie-consent__secondary" data-choice="necessary">Только необходимые</button>' +
    "</div></div>";

  document.body.appendChild(root);
  document.documentElement.classList.add("cookie-consent-open");

  root.addEventListener("click", function (event) {
    var button = event.target.closest("button[data-choice]");
    if (!button) return;
    var choice = button.getAttribute("data-choice");
    storageSet(choice === "analytics" ? "analytics" : "necessary");
    if (choice === "analytics") loadMetrika();
    root.remove();
    document.documentElement.classList.remove("cookie-consent-open");
  });
})();
