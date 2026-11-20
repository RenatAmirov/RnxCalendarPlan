"use strict";

import {
  dateKey as zonedDateKey,
  keyDate,
  addDays,
  monday,
  shiftMonth,
  moveMonth,
  dayEvents,
  plural,
} from "./calendar-utils.mjs";

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const icon = (name) =>
  `<svg class="icon" aria-hidden="true"><use href="#i-${name}"/></svg>`;
const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ],
  );
const tracks = {
  csharp: "C#",
  dotnet: ".NET / ASP.NET",
  data: "Базы данных",
  ai: "ChatGPT / Codex",
};
const kinds = {
  theory: "Теория",
  practice: "Практика",
  review: "Повторение",
  mock: "Пробное интервью",
};
const statuses = {
  planned: "В плане",
  inProgress: "В работе",
  completed: "Выполнено",
};
const masteryLabels = [
  "Не изучено",
  "Знакомо",
  "Могу объяснить",
  "Решаю на практике",
];
const pageTitles = {
  overview: "Обзор",
  calendar: "Календарь",
  topics: "База знаний",
  ai: "AI-практика",
  progress: "Мой прогресс",
};
const weekdays = ["пн", "вт", "ср", "чт", "пт", "сб", "вс"];
const storage = {
  get(key, fallback) {
    try {
      return JSON.parse(localStorage.getItem(`rnx:${key}`)) ?? fallback;
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(`rnx:${key}`, JSON.stringify(value));
    } catch {
      /* Private browsing can disable storage. */
    }
  },
};
const state = {
  page: pageTitles[location.hash.slice(1)]
    ? location.hash.slice(1)
    : "overview",
  zone: storage.get("timezone", "Europe/Moscow"),
  data: null,
  prompts: [],
  selected: null,
  month: null,
  calendarView: "month",
  filter: "all",
  topicTrack: "all",
  topicQuery: "",
  timer: storage.get("timer", { remaining: 1500, endAt: null, sessionId: "" }),
};
if (!["Europe/Moscow", "Europe/Samara"].includes(state.zone))
  state.zone = "Europe/Moscow";
if (
  !state.timer ||
  !Number.isFinite(state.timer.remaining) ||
  state.timer.remaining < 0 ||
  state.timer.remaining > 1500
)
  state.timer = { remaining: 1500, endAt: null, sessionId: "" };

const fmt = (date, options = {}) =>
  new Intl.DateTimeFormat("ru-RU", { timeZone: state.zone, ...options }).format(
    new Date(date),
  );
function dateKey(date) {
  return zonedDateKey(date, state.zone);
}
function selectDate(key) {
  state.selected = key;
  state.month = key.slice(0, 7);
}
const eventsOn = (key, sessions = state.data.sessions) =>
  dayEvents(sessions, state.data.goal, key, state.zone);
const dayRows = (key, sessions = state.data.sessions) =>
  eventsOn(key, sessions)
    .map((event) => (event.isGoal ? goalRow() : sessionRow(event)))
    .join("");
const time = (date) => fmt(date, { hour: "2-digit", minute: "2-digit" });
const dateLabel = (key) => fmt(keyDate(key), { day: "numeric", month: "long" });
const zoneLabel = () => (state.zone === "Europe/Moscow" ? "МСК" : "САМ");
const today = () => dateKey(new Date());
const duration = (minutes) =>
  minutes >= 60
    ? `${Math.floor(minutes / 60)} ч${minutes % 60 ? ` ${minutes % 60} мин` : ""}`
    : `${minutes} мин`;
const sessionDay = (session) => dateKey(session.startsAt);
const sessionsOn = (key) =>
  state.data.sessions.filter((s) => sessionDay(s) === key);
const trackTag = (track) =>
  `<span class="track-tag ${esc(track)}">${esc(tracks[track] || track)}</span>`;
function safeLink(url) {
  try {
    const link = new URL(url);
    return link.protocol === "https:" ? esc(link.href) : "#";
  } catch {
    return "#";
  }
}
function options(values, selected) {
  return Object.entries(values)
    .map(
      ([key, label]) =>
        `<option value="${esc(key)}"${key === selected ? " selected" : ""}>${esc(label)}</option>`,
    )
    .join("");
}

async function api(path, method = "GET", body) {
  let response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      headers: {
        Accept: "application/json",
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error(
      "Нет связи с сервером. Проверьте, что приложение запущено, и повторите действие.",
    );
  }
  if (!response.ok) {
    const problem = await response.json().catch(() => ({}));
    const message = problem.errors
      ? Object.values(problem.errors).flat().join(" ")
      : problem.detail ||
        problem.title ||
        `Не удалось выполнить действие (${response.status}).`;
    throw new Error(message);
  }
  return response.status === 204 ? null : response.json();
}
async function loadPlan() {
  state.data = await api("/plan");
}
async function init() {
  $("#timezone").value = state.zone;
  try {
    await loadPlan();
    state.selected = today();
    state.month = state.selected.slice(0, 7);
    render();
    state.prompts = await api("/prompts");
    if (state.page === "ai") render();
  } catch (error) {
    if (state.data) {
      toast(error.message, true);
      return;
    }
    $("#main").innerHTML =
      `<div class="error-state">${icon("info")}<h2>Не удалось загрузить план</h2><p>${esc(error.message)}</p><button class="btn btn-primary" data-action="retry">Повторить</button></div>`;
  }
}
function toast(message, error = false) {
  const element = $("#toast");
  element.textContent = message;
  element.className = `toast visible${error ? " error" : ""}`;
  clearTimeout(toast.timeout);
  toast.timeout = setTimeout(
    () => element.classList.remove("visible"),
    error ? 8000 : 3500,
  );
}
function heading(title, subtitle, action = true) {
  return `<div class="page-heading"><div><p class="overline">${esc(fmt(new Date(), { weekday: "long", day: "numeric", month: "long", year: "numeric" }).replace(" г.", ""))}</p><h1>${esc(title)}</h1>${subtitle ? `<p class="subtitle">${esc(subtitle)}</p>` : ""}</div>${action ? `<div class="heading-actions">${state.page === "calendar" ? `<a class="btn btn-secondary" href="/api/export/calendar.ics" download>${icon("download")}<span>Экспорт .ics</span></a>` : ""}<button class="btn btn-primary" data-action="new">${icon("plus")}Добавить занятие</button></div>` : ""}</div>`;
}
function metrics() {
  const sessions = state.data.sessions;
  const done = sessions.filter((s) => s.status === "completed");
  const mastered = state.data.topics.filter((t) => t.mastery >= 2).length;
  return `<div class="stats">
    <div class="stat"><div><span class="stat-label">Занятия выполнены</span><strong class="stat-value">${done.length} <small>/ ${sessions.length}</small></strong><span class="stat-note">${sessions.length ? Math.round((done.length / sessions.length) * 100) : 0}% учебного плана</span></div><span class="stat-icon">${icon("check")}</span></div>
    <div class="stat"><div><span class="stat-label">Время на обучение</span><strong class="stat-value">${duration(done.reduce((sum, s) => sum + s.durationMinutes, 0))}</strong><span class="stat-note">из ${duration(sessions.reduce((sum, s) => sum + s.durationMinutes, 0))} в плане</span></div><span class="stat-icon">${icon("clock")}</span></div>
    <div class="stat"><div><span class="stat-label">Уверенные темы</span><strong class="stat-value">${mastered} <small>/ ${state.data.topics.length}</small></strong><span class="stat-note">могу объяснить или применить</span></div><span class="stat-icon">${icon("book")}</span></div>
  </div>`;
}
function hero() {
  const goal = state.data.goal;
  return `<section class="hero" aria-label="Ближайшее собеседование"><div><span class="eyebrow">СЛЕДУЮЩАЯ БОЛЬШАЯ ЦЕЛЬ</span><div class="hero-title-row"><span class="bank-logo">${esc(goal.company.slice(0, 1))}</span><div><h2>Собеседование · ${esc(goal.company)}</h2><p class="hero-subtitle">${esc(goal.title)}</p></div></div><div class="hero-meta"><span>${icon("calendar")}${esc(fmt(goal.startsAt, { day: "numeric", month: "long" }))}</span><span class="separator">·</span><span>${icon("clock")}${time(goal.startsAt)} ${zoneLabel()}</span><span class="separator">·</span><button class="hero-edit" data-action="goal">Детали встречи</button></div></div><div class="countdown-wrap"><div class="countdown-title" id="countdown-title">ДО СОБЕСЕДОВАНИЯ</div><div class="countdown" aria-label="Оставшееся время"><div class="count-part"><b id="count-days">—</b><span>дней</span></div><div class="count-part"><b id="count-hours">—</b><span>часов</span></div><div class="count-part"><b id="count-minutes">—</b><span>минут</span></div></div><div class="countdown-note">Каждое занятие приближает к цели</div></div></section>`;
}
function weekStrip() {
  const start = monday(state.selected);
  return `<div class="week-toolbar"><span>${dateLabel(start)} — ${dateLabel(addDays(start, 6))}</span><div class="week-nav"><button class="icon-button" data-action="week-prev" aria-label="Предыдущая неделя">${icon("chevron-left")}</button><button class="icon-button" data-action="week-next" aria-label="Следующая неделя">${icon("chevron-right")}</button></div></div><div class="week-strip">${Array.from(
    { length: 7 },
    (_, i) => {
      const key = addDays(start, i);
      const hasEvents =
        sessionsOn(key).length || dateKey(state.data.goal.startsAt) === key;
      return `<button class="day-pill${state.selected === key ? " selected" : ""}${today() === key ? " today" : ""}${hasEvents ? " has-events" : ""}" data-action="select-day" data-date="${key}" aria-pressed="${state.selected === key}" aria-label="${esc(dateLabel(key))}"><span>${weekdays[i]}</span><b>${Number(key.slice(-2))}</b><i class="day-dot"></i></button>`;
    },
  ).join("")}</div>`;
}
function sessionRow(session, showDate = false) {
  return `<div class="session-row"><button class="check-button ${session.status === "completed" ? "completed" : ""}" data-action="complete" data-id="${session.id}" aria-label="${session.status === "completed" ? "Вернуть в план" : "Отметить выполненным"}: ${esc(session.title)}" aria-pressed="${session.status === "completed"}">${session.status === "completed" ? icon("check") : ""}</button><span class="session-time">${time(session.startsAt)}</span><button class="session-main ${session.status === "completed" ? "completed" : ""}" data-action="session" data-id="${session.id}"><strong>${esc(session.title)}</strong><span class="session-detail">${trackTag(session.track)}<span>${esc(kinds[session.kind])}</span><span>·</span><span>${duration(session.durationMinutes)}</span>${showDate ? `<span>· ${dateLabel(sessionDay(session))}</span>` : ""}${session.status === "inProgress" ? '<span class="inline-status">В работе</span>' : ""}</span></button><button class="session-open" data-action="session" data-id="${session.id}" aria-label="Редактировать ${esc(session.title)}">${icon("edit")}</button></div>`;
}
function goalRow() {
  const goal = state.data.goal;
  return `<div class="session-row"><span class="bank-mini">${esc(goal.company.slice(0, 1))}</span><span class="session-time">${time(goal.startsAt)}</span><button class="session-main" data-action="goal"><strong>Собеседование · ${esc(goal.company)}</strong><span class="session-detail">${esc(goal.title)} · ${zoneLabel()}</span></button></div>`;
}
function emptyDay() {
  return `<div class="empty-state">${icon("calendar")}<p>На этот день пока нет занятий.<br>Оставьте время для отдыха или добавьте тему.</p><button class="btn btn-soft btn-small" data-action="new" data-date="${state.selected}">${icon("plus")}Запланировать занятие</button></div>`;
}
function progressTracks() {
  return Object.entries(tracks)
    .map(([track, label]) => {
      const topics = state.data.topics.filter((t) => t.track === track);
      const score = topics.reduce((sum, t) => sum + t.mastery, 0);
      return `<div class="track-progress"><div class="track-progress-label"><span>${label}</span><b>${topics.filter((t) => t.mastery >= 2).length} / ${topics.length}</b></div><div class="bar" role="progressbar" aria-label="Самооценка: ${label}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round((score / (topics.length * 3 || 1)) * 100)}"><div class="bar-fill ${track}" data-width="${(score / (topics.length * 3 || 1)) * 100}"></div></div></div>`;
    })
    .join("");
}
function overview() {
  const sessions = sessionsOn(state.selected);
  const hasGoal = dateKey(state.data.goal.startsAt) === state.selected;
  const total = sessions.reduce((sum, s) => sum + s.durationMinutes, 0);
  return `${heading("Новый день. Ближе к цели.", "Ваш план подготовки к следующему шагу в карьере.")}${hero()}${metrics()}<div class="dashboard-grid"><section class="panel"><div class="panel-head"><h2>План на неделю</h2><a href="#calendar" class="text-button">Весь календарь ${icon("calendar")}</a></div>${weekStrip()}<div class="schedule-day"><span>${state.selected === today() ? "Сегодня" : dateLabel(state.selected)} · ${fmt(keyDate(state.selected), { weekday: "long" })}</span><span>${sessions.length} ${plural(sessions.length, "занятие", "занятия", "занятий")} · ${duration(total)}</span></div>${dayRows(state.selected)}${!sessions.length && !hasGoal ? emptyDay() : ""}<div class="panel-bottom">${icon("info")}Время занятий указано по ${state.zone === "Europe/Moscow" ? "Москве (UTC+3)" : "Самаре (UTC+4)"}</div></section><aside class="right-column"><section class="panel progress-panel"><div class="section-title"><h2>Карта подготовки</h2><span class="tiny-badge">САМООЦЕНКА</span></div>${progressTracks()}<p class="progress-foot">Оцените понимание тем в <a href="#topics" class="text-button">базе знаний</a>. Это поможет выбрать следующий фокус.</p></section><section class="ai-teaser">${icon("spark")}<h3>Ваш AI-напарник</h3><p>Отрепетируйте интервью с ChatGPT<br>или разберите код вместе с Codex.</p><a href="#ai" class="btn">Перейти к практике</a></section>${focusPanel()}</aside></div>`;
}
function focusPanel() {
  return `<section class="panel focus-panel"><div class="focus-head"><h3>Время для фокуса</h3><span class="badge">25 минут</span></div><div class="focus-time" id="focus-time">25:00</div><div class="focus-caption" id="focus-caption">Одна задача. Без переключений.</div><select class="focus-select" id="focus-session" aria-label="Занятие для фокуса"><option value="">Свободная сессия</option>${state.data.sessions
    .filter((s) => s.status !== "completed")
    .map(
      (s) =>
        `<option value="${s.id}"${state.timer.sessionId === s.id ? " selected" : ""}>${esc(s.title)}</option>`,
    )
    .join(
      "",
    )}</select><div class="focus-controls"><button class="btn btn-soft btn-small" id="focus-toggle" data-action="timer-toggle">${icon("play")}Начать</button><button class="icon-button" data-action="timer-reset" aria-label="Сбросить таймер">${icon("reset")}</button></div></section>`;
}
function filteredSessions() {
  return state.data.sessions.filter(
    (s) => state.filter === "all" || s.track === state.filter,
  );
}
function eventButton(session, week = false) {
  if (session.isGoal)
    return `<button class="calendar-event interview${week ? " week-event" : ""}" data-action="goal"><span>${time(session.startsAt)}</span> Собеседование · ${esc(session.company)}</button>`;
  return `<button class="calendar-event ${esc(session.track)}${week ? " week-event" : ""}${session.status === "completed" ? " completed" : ""}" data-action="session" data-id="${session.id}" title="${esc(session.title)} · ${time(session.startsAt)}"><span>${time(session.startsAt)}</span> ${esc(session.title)}</button>`;
}
function calendar() {
  const monthName = fmt(keyDate(`${state.month}-15`), {
    month: "long",
    year: "numeric",
  }).replace(" г.", "");
  const start = monday(state.selected);
  return `${heading("Календарь обучения", "Дайте важным темам своё время. Остальное подождёт.")}<div class="toolbar"><div class="toolbar-left"><h2>${state.calendarView === "week" ? `${dateLabel(start)} — ${dateLabel(addDays(start, 6))}` : esc(monthName[0].toUpperCase() + monthName.slice(1))}</h2><button class="icon-button" data-action="cal-prev" aria-label="Назад">${icon("chevron-left")}</button><button class="icon-button" data-action="cal-next" aria-label="Вперёд">${icon("chevron-right")}</button><button class="btn btn-secondary btn-small" data-action="today">Сегодня</button></div><div class="toolbar-right"><select class="filter-select" id="calendar-filter" aria-label="Фильтр по направлению">${options({ all: "Все направления", ...tracks }, state.filter)}</select><div class="segmented" aria-label="Вид календаря">${Object.entries(
    { month: "Месяц", week: "Неделя", list: "Список" },
  )
    .map(
      ([key, label]) =>
        `<button data-action="calendar-view" data-view="${key}" class="${state.calendarView === key ? "active" : ""}" aria-pressed="${state.calendarView === key}">${label}</button>`,
    )
    .join(
      "",
    )}</div></div></div>${state.calendarView === "month" ? monthCalendar() : state.calendarView === "week" ? weekCalendar() : agendaCalendar()}<div class="calendar-legend">${Object.entries(
    { ...tracks, interview: "Собеседование" },
  )
    .map(
      ([key, label]) =>
        `<span class="legend-item"><i class="legend-dot ${key}"></i>${label}</span>`,
    )
    .join(
      "",
    )}</div><p class="page-note">Нажмите на занятие, чтобы изменить план или записать результат. Экспорт .ics включает все занятия и собеседование.</p>`;
}
function monthCalendar() {
  const first = `${state.month}-01`;
  const start = monday(first);
  const next = `${shiftMonth(state.month, 1)}-01`;
  const dayCount =
    Math.ceil(Math.round((keyDate(next) - keyDate(start)) / 86400000) / 7) * 7;
  const sessions = filteredSessions();
  return `<div class="month-grid">${weekdays.map((day) => `<div class="month-day-name">${day.toUpperCase()}</div>`).join("")}${Array.from(
    { length: dayCount },
    (_, i) => {
      const key = addDays(start, i);
      const events = eventsOn(key, sessions);
      // Keep the interview visible, even on a day with many study sessions.
      const shown = events.filter((item, index) => index < 3 || item.isGoal);
      return `<div class="month-cell${key.slice(0, 7) !== state.month ? " outside" : ""}${today() === key ? " is-today" : ""}"><button class="month-date" data-action="day-agenda" data-date="${key}" aria-label="План на ${esc(dateLabel(key))}">${Number(key.slice(-2))}</button>${shown
        .map((s) => eventButton(s))
        .join(
          "",
        )}${events.length > shown.length ? `<button class="more-events" data-action="day-agenda" data-date="${key}">Ещё ${events.length - shown.length}</button>` : ""}</div>`;
    },
  ).join("")}</div>`;
}
function weekCalendar() {
  const start = monday(state.selected);
  return `<div class="week-calendar">${Array.from({ length: 7 }, (_, i) => {
    const key = addDays(start, i);
    return `<div class="week-column"><div class="week-column-title"><strong>${Number(key.slice(-2))}</strong>${weekdays[i]}</div>${eventsOn(
      key,
      filteredSessions(),
    )
      .map((s) => eventButton(s, true))
      .join(
        "",
      )}<button class="text-button" data-action="new" data-date="${key}">${icon("plus")}Занятие</button></div>`;
  }).join("")}</div>`;
}
function agendaCalendar() {
  const sessions = filteredSessions().filter((s) =>
    sessionDay(s).startsWith(state.month),
  );
  const hasGoal = dateKey(state.data.goal.startsAt).startsWith(state.month);
  const keys = [
    ...new Set([
      ...sessions.map(sessionDay),
      ...(hasGoal ? [dateKey(state.data.goal.startsAt)] : []),
    ]),
  ].sort();
  return `<div class="panel agenda-panel">${
    keys.length
      ? keys
          .map(
            (key) =>
              `<div class="agenda-date">${dateLabel(key)} · ${fmt(keyDate(key), { weekday: "long" })}</div>${dayRows(key, sessions)}`,
          )
          .join("")
      : '<div class="empty-state">На этот месяц занятия пока не запланированы.</div>'
  }</div>`;
}
function topicsPage() {
  return `${heading("Знания, которые работают.", "Повторяйте основы, проверяйте понимание и отмечайте уверенные темы.")}<div class="toolbar topic-toolbar"><div class="toolbar-left"><input class="search-input" id="topic-search" type="search" placeholder="Найти тему или вопрос…" aria-label="Найти тему" value="${esc(state.topicQuery)}"></div><div class="toolbar-right"><select class="filter-select" id="topic-filter" aria-label="Направление тем">${options({ all: "Все направления", ...tracks }, state.topicTrack)}</select><span class="badge">${state.data.topics.length} тем для развития</span></div></div><div class="topic-grid" id="topic-grid">${topicCards()}</div><p class="page-note">Учебный список охватывает типовые темы .NET. Он не является официальной программой интервью Т-Банка.</p>`;
}
function topicCards() {
  const query = state.topicQuery.toLocaleLowerCase("ru");
  const topics = state.data.topics.filter(
    (t) =>
      (state.topicTrack === "all" || t.track === state.topicTrack) &&
      `${t.title} ${t.summary} ${t.questions.join(" ")}`
        .toLocaleLowerCase("ru")
        .includes(query),
  );
  return topics.length
    ? topics
        .map(
          (t) =>
            `<button class="topic-card" data-action="topic" data-id="${t.id}">${trackTag(t.track)}<h3>${esc(t.title)}</h3><p>${esc(t.summary)}</p><div class="topic-card-foot"><span>${masteryLabels[t.mastery]}</span><span class="mastery-dots" aria-label="Уровень ${t.mastery} из 3">${[1, 2, 3].map((i) => `<span class="${t.mastery >= i ? "filled" : ""}"></span>`).join("")}</span></div></button>`,
        )
        .join("")
    : '<div class="empty-state no-results">Темы не найдены. Попробуйте другой запрос.</div>';
}
function aiPage() {
  return `${heading("Учитесь вместе с AI.", "ChatGPT — для диалога. Codex — для практики на коде.")}<div class="ai-intro">${icon("spark")}<p>Выберите сценарий, скопируйте промпт и используйте его в ChatGPT или Codex. Сначала попробуйте ответить сами, затем проверьте результат и сохраните выводы в заметках занятия.</p></div><div class="prompt-grid">${state.prompts.length ? state.prompts.map((p) => `<article class="prompt-card"><div class="prompt-top"><span class="tool-badge ${p.tool === "Codex" ? "codex" : ""}">${icon(p.tool === "Codex" ? "code" : "spark")} ${esc(p.tool)}</span><span class="prompt-duration">${esc(p.duration)}</span></div><h2>${esc(p.title)}</h2><p>${esc(p.description)}</p><button class="btn btn-secondary" data-action="prompt" data-id="${p.id}">${icon("copy")}Открыть промпт</button></article>`).join("") : '<div class="empty-state no-results">Загружаем сценарии… <button class="text-button" data-action="reload-prompts">Повторить</button></div>'}</div><p class="page-note">Промпты работают в ваших приложениях ChatGPT/Codex. Автоматическая отправка запросов и платные API не подключены.</p>`;
}
function progressPage() {
  const start = monday(state.selected);
  const days = Array.from({ length: 7 }, (_, i) => {
    const key = addDays(start, i);
    const items = sessionsOn(key);
    return {
      key,
      planned: items.reduce((n, s) => n + s.durationMinutes, 0),
      done: items
        .filter((s) => s.status === "completed")
        .reduce((n, s) => n + s.durationMinutes, 0),
    };
  });
  const max = Math.max(...days.map((d) => d.planned), 60);
  const completed = state.data.sessions.filter((s) => s.status === "completed");
  const weak = state.data.topics.filter((t) => t.mastery < 2);
  return `${heading("Видеть путь — легче идти.", "Выполненные занятия и ваша самооценка помогают отслеживать движение.")}${metrics()}<div class="progress-layout"><section class="panel progress-chart"><div class="section-title"><h2>Обучение по дням</h2><div class="week-nav"><button class="icon-button" data-action="week-prev" aria-label="Предыдущая неделя">${icon("chevron-left")}</button><button class="icon-button" data-action="week-next" aria-label="Следующая неделя">${icon("chevron-right")}</button></div></div><p class="subtitle">${dateLabel(start)} — ${dateLabel(addDays(start, 6))}</p><div class="chart-bars">${days.map((day, i) => `<div class="chart-day"><small>${day.done ? duration(day.done) : "—"}</small><div class="chart-pair" aria-label="${dateLabel(day.key)}: в плане ${day.planned} мин, выполнено ${day.done} мин"><div class="chart-bar" data-height="${(day.planned / max) * 100}"></div><div class="chart-bar done" data-height="${(day.done / max) * 100}"></div></div><span>${weekdays[i]} ${Number(day.key.slice(-2))}</span></div>`).join("")}</div><div class="calendar-legend"><span class="legend-item"><i class="legend-dot"></i>Выполнено</span><span>Светлые столбцы — в плане</span></div></section><section class="panel progress-list"><h2>Уверенность по направлениям</h2><p>На основе вашей самооценки тем</p>${progressTracks()}<a href="#topics" class="text-button">Обновить самооценку ${icon("book")}</a></section></div><div class="insight">${icon("target")}<p>${weak.length ? `Ещё ${weak.length} тем можно укрепить. Начните с «${esc(weak[0].title)}»: попробуйте ответить на вопросы без подсказок и оцените результат.` : "По вашей самооценке все темы освоены. Попробное интервью поможет проверить, насколько уверенно вы применяете знания."}</p></div><section class="panel completed-list"><div class="panel-head"><h2>Завершённые занятия</h2><span class="badge">${completed.length}</span></div>${completed.length ? completed.map((s) => sessionRow(s, true)).join("") : '<div class="empty-state">Здесь появятся ваши выполненные занятия.<br>Начните с одного небольшого шага.</div>'}</section>`;
}
function render() {
  if (!state.data) return;
  $("#page-crumb").textContent = pageTitles[state.page];
  $$("nav a").forEach((link) => {
    link.classList.toggle("active", link.dataset.page === state.page);
    if (link.dataset.page === state.page)
      link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
  $("#sidebar-goal-date").textContent =
    `${fmt(state.data.goal.startsAt, { day: "numeric", month: "long" })} · ${time(state.data.goal.startsAt)} ${zoneLabel()}`;
  $(".nav-count").textContent = state.data.topics.length;
  document.title = `${pageTitles[state.page]} · RNX План развития`;
  $("#main").innerHTML = {
    overview,
    calendar,
    topics: topicsPage,
    ai: aiPage,
    progress: progressPage,
  }[state.page]();
  // Set numeric visual properties through CSSOM; no HTML or inline event code is executed.
  $$("[data-width]").forEach((el) => {
    el.style.width = `${Math.max(0, Math.min(100, Number(el.dataset.width)))}%`;
  });
  $$("[data-height]").forEach((el) => {
    el.style.height = `${Math.max(0, Math.min(100, Number(el.dataset.height)))}%`;
  });
  tick();
}
function closeDialog() {
  $("#dialog").close();
}
function openDialog(title, subtitle, content, actions = "") {
  $("#dialog-content").innerHTML =
    `<div class="dialog-header"><div><h2 id="dialog-title">${esc(title)}</h2>${subtitle ? `<p>${esc(subtitle)}</p>` : ""}</div><button class="icon-button" data-action="close" aria-label="Закрыть">${icon("close")}</button></div>${content}${actions ? `<div class="dialog-actions">${actions}</div>` : ""}`;
  if (!$("#dialog").open) $("#dialog").showModal();
}
function inputDate(iso) {
  return `${dateKey(iso)}T${time(iso)}`;
}
function toIso(date, clock) {
  return new Date(
    `${date}T${clock}:00${state.zone === "Europe/Moscow" ? "+03:00" : "+04:00"}`,
  ).toISOString();
}
function openSession(id, day = state.selected, topicId = "") {
  const session = id ? state.data.sessions.find((s) => s.id === id) : null;
  if (id && !session) {
    toast("Занятие уже удалено. Обновите план.", true);
    return;
  }
  const topic = state.data.topics.find((t) => t.id === topicId);
  const value = session || {
    title: topic ? topic.title : "",
    track: topic?.track || "csharp",
    kind: "practice",
    durationMinutes: 60,
    status: "planned",
    notes: "",
    outcome: "",
    topicId,
    version: 0,
  };
  const parts = session
    ? inputDate(session.startsAt).split("T")
    : [day, "10:00"];
  openDialog(
    session ? "Детали занятия" : "Новое занятие",
    `Время по ${state.zone === "Europe/Moscow" ? "Москве · UTC+3" : "Самаре · UTC+4"}`,
    `<form id="session-form" data-id="${esc(id || "")}"><div class="dialog-body"><div class="form-error" id="form-error" role="alert"></div><div class="form-grid"><label class="form-field full">Название занятия<input name="title" required maxlength="160" placeholder="Например, разобраться с async/await" value="${esc(value.title)}"></label><label class="form-field">Дата<input name="date" type="date" required min="2000-01-01" max="2100-12-31" value="${parts[0]}"></label><label class="form-field">Начало · ${zoneLabel()}<input name="time" type="time" required value="${parts[1]}"></label><label class="form-field">Длительность, минут<input name="durationMinutes" type="number" required min="5" max="480" value="${value.durationMinutes}"></label><label class="form-field">Направление<select name="track">${options(tracks, value.track)}</select></label><label class="form-field">Формат<select name="kind">${options(kinds, value.kind)}</select></label><label class="form-field">Статус<select name="status">${options(statuses, value.status)}</select></label><label class="form-field full">Тема из базы знаний<select name="topicId"><option value="">Без привязки к теме</option>${state.data.topics.map((t) => `<option value="${t.id}"${t.id === value.topicId ? " selected" : ""}>${esc(t.title)}</option>`).join("")}</select></label><label class="form-field full">Что получится в результате<textarea name="outcome" rows="2" maxlength="1000" placeholder="Конкретный результат, который можно проверить">${esc(value.outcome)}</textarea></label><label class="form-field full">Заметки и выводы<textarea name="notes" rows="3" maxlength="8000" placeholder="Что стало понятно? Что стоит повторить?">${esc(value.notes)}</textarea></label></div><div id="overlap-warning" class="overlap-warning"></div><input type="hidden" name="version" value="${value.version}"></div><div class="dialog-actions">${session ? `<button type="button" class="btn btn-danger btn-small left" data-action="delete-confirm" data-id="${session.id}">${icon("trash")}Удалить</button>` : ""}<button type="button" class="btn btn-secondary" data-action="close">Отмена</button><button type="submit" class="btn btn-primary">Сохранить</button></div></form>`,
  );
  checkOverlap();
}
function checkOverlap() {
  const form = $("#session-form");
  if (!form || !form.elements.date.value || !form.elements.time.value) return;
  const start = new Date(
    toIso(form.elements.date.value, form.elements.time.value),
  ).getTime();
  const end = start + Number(form.elements.durationMinutes.value) * 60000;
  const overlap = state.data.sessions.find(
    (s) =>
      s.id !== form.dataset.id &&
      start < new Date(s.startsAt).getTime() + s.durationMinutes * 60000 &&
      end > new Date(s.startsAt).getTime(),
  );
  const goal = state.data.goal;
  const goalOverlap =
    start < new Date(goal.startsAt).getTime() + goal.durationMinutes * 60000 &&
    end > new Date(goal.startsAt).getTime();
  $("#overlap-warning").textContent = goalOverlap
    ? "Это занятие пересекается с собеседованием. Проверьте время перед сохранением."
    : overlap
      ? `Пересечение с «${overlap.title}» (${time(overlap.startsAt)}). Можно изменить время или сохранить оба занятия.`
      : "";
}
function openGoal() {
  const goal = state.data.goal;
  const parts = inputDate(goal.startsAt).split("T");
  openDialog(
    "Цель: собеседование",
    "Первый технический этап · C#/.NET",
    `<form id="goal-form"><div class="dialog-body"><div id="form-error" class="form-error" role="alert"></div><div class="form-grid"><label class="form-field">Компания<input name="company" required maxlength="80" value="${esc(goal.company)}"></label><label class="form-field">Этап<input name="title" required maxlength="160" value="${esc(goal.title)}"></label><label class="form-field">Дата<input type="date" name="date" required min="2000-01-01" max="2100-12-31" value="${parts[0]}"></label><label class="form-field">Начало · ${zoneLabel()}<input type="time" name="time" required value="${parts[1]}"></label><label class="form-field full">Длительность для календаря, минут<input name="durationMinutes" type="number" min="5" max="480" required value="${goal.durationMinutes}"></label><label class="form-field full">Детали и подготовка<textarea name="notes" rows="4" maxlength="8000">${esc(goal.notes)}</textarea></label></div><p class="form-help">${esc(fmt(goal.startsAt, { day: "numeric", month: "long", year: "numeric" }))} · ${new Intl.DateTimeFormat("ru-RU", { timeZone: "Europe/Moscow", hour: "2-digit", minute: "2-digit" }).format(new Date(goal.startsAt))} МСК / ${new Intl.DateTimeFormat("ru-RU", { timeZone: "Europe/Samara", hour: "2-digit", minute: "2-digit" }).format(new Date(goal.startsAt))} Самара. Время встречи и длительность можно уточнить у рекрутера.</p><input type="hidden" name="version" value="${goal.version}"></div><div class="dialog-actions"><button type="button" class="btn btn-secondary" data-action="close">Закрыть</button><button type="submit" class="btn btn-primary">Сохранить цель</button></div></form>`,
  );
}
function openTopic(id) {
  const topic = state.data.topics.find((t) => t.id === id);
  if (!topic) return;
  openDialog(
    topic.title,
    tracks[topic.track],
    `<form id="topic-form" data-id="${topic.id}"><div class="dialog-body"><div id="form-error" class="form-error" role="alert"></div><p class="topic-summary">${esc(topic.summary)}</p><a class="topic-resource" href="${safeLink(topic.resourceUrl)}" target="_blank" rel="noopener noreferrer">Официальный материал ${icon("external")}</a><strong class="dialog-label">Проверьте себя</strong><ol class="question-list">${topic.questions.map((question) => `<li>${esc(question)}</li>`).join("")}</ol><div class="form-grid"><label class="form-field full">Насколько уверенно вы знаете тему?<select name="mastery">${options(Object.fromEntries(masteryLabels.map((label, i) => [i, label])), String(topic.mastery))}</select></label><label class="form-field full">Личный конспект<textarea name="notes" rows="4" maxlength="8000" placeholder="Объяснение своими словами, примеры и вопросы">${esc(topic.notes)}</textarea></label></div><input type="hidden" name="version" value="${topic.version}"></div><div class="dialog-actions"><button type="button" class="btn btn-secondary btn-small left" data-action="plan-topic" data-id="${topic.id}">${icon("calendar")}В план</button><button type="submit" class="btn btn-primary">Сохранить</button></div></form>`,
  );
}
function openPrompt(id) {
  const prompt = state.prompts.find((p) => p.id === id);
  if (!prompt) return;
  openDialog(
    prompt.title,
    `${prompt.tool} · ${prompt.duration}`,
    `<div class="dialog-body"><p class="topic-summary">${esc(prompt.description)}</p><textarea class="prompt-text" id="prompt-text" readonly aria-label="Текст промпта">${esc(prompt.text)}</textarea><p class="form-help">Скопируйте текст в ${esc(prompt.tool)}. Ответы и выводы можно сохранить в заметках занятия.</p></div>`,
    `${prompt.tool === "ChatGPT" ? `<a class="btn btn-secondary" href="https://chatgpt.com/" target="_blank" rel="noopener noreferrer">Открыть ChatGPT ${icon("external")}</a>` : ""}<button class="btn btn-primary" data-action="copy-prompt">${icon("copy")}Скопировать</button>`,
  );
}
function openDay(key) {
  selectDate(key);
  render();
  const sessions = sessionsOn(key);
  const hasGoal = dateKey(state.data.goal.startsAt) === key;
  openDialog(
    dateLabel(key),
    `${fmt(keyDate(key), { weekday: "long" })} · время ${zoneLabel()}`,
    `<div>${dayRows(key)}${!sessions.length && !hasGoal ? '<div class="empty-state">День свободен. Запланируйте занятие или отдых.</div>' : ""}</div>`,
    `<button class="btn btn-primary" data-action="new" data-date="${key}">${icon("plus")}Добавить занятие</button>`,
  );
}
function openSearch() {
  openDialog(
    "Найти в плане",
    "Занятия, заметки и темы",
    `<div class="dialog-body"><input type="search" id="global-search" class="search-input" placeholder="Например, async, коллекции или GC…" aria-label="Поиск по плану"><div class="search-results" id="search-results"></div></div>`,
  );
  $("#global-search").style.width = "100%";
  searchResults("");
  $("#global-search").focus();
}
function searchResults(query) {
  const q = query.trim().toLocaleLowerCase("ru");
  const sessions = state.data.sessions
    .filter((s) =>
      `${s.title} ${s.notes} ${s.outcome}`.toLocaleLowerCase("ru").includes(q),
    )
    .slice(0, 5);
  const topics = state.data.topics
    .filter((t) =>
      `${t.title} ${t.summary}`.toLocaleLowerCase("ru").includes(q),
    )
    .slice(0, 4);
  $("#search-results").innerHTML =
    [
      ...sessions.map(
        (s) =>
          `<button class="search-result" data-action="session" data-id="${s.id}">${esc(s.title)}<small>Занятие · ${dateLabel(sessionDay(s))} · ${time(s.startsAt)}</small></button>`,
      ),
      ...topics.map(
        (t) =>
          `<button class="search-result" data-action="topic" data-id="${t.id}">${esc(t.title)}<small>База знаний · ${esc(tracks[t.track])}</small></button>`,
      ),
    ].join("") ||
    '<div class="search-empty">Ничего не найдено. Попробуйте другую формулировку.</div>';
}
function tick() {
  if (state.data && $("#count-days")) {
    const remaining = Math.max(
      0,
      new Date(state.data.goal.startsAt) - Date.now(),
    );
    $("#count-days").textContent = String(
      Math.floor(remaining / 86400000),
    ).padStart(2, "0");
    $("#count-hours").textContent = String(
      Math.floor(remaining / 3600000) % 24,
    ).padStart(2, "0");
    $("#count-minutes").textContent = String(
      Math.floor(remaining / 60000) % 60,
    ).padStart(2, "0");
    $("#countdown-title").textContent = remaining
      ? "ДО СОБЕСЕДОВАНИЯ"
      : "ВРЕМЯ ВСТРЕЧИ НАСТУПИЛО";
  }
  if (state.timer.endAt && Date.now() >= state.timer.endAt) {
    state.timer.endAt = null;
    state.timer.remaining = 0;
    storage.set("timer", state.timer);
    toast(
      "25 минут фокуса завершены. Сделайте перерыв и сохраните выводы занятия.",
    );
  }
  const remaining = state.timer.endAt
    ? Math.max(0, Math.ceil((state.timer.endAt - Date.now()) / 1000))
    : state.timer.remaining;
  if ($("#focus-time")) {
    $("#focus-time").textContent =
      `${String(Math.floor(remaining / 60)).padStart(2, "0")}:${String(remaining % 60).padStart(2, "0")}`;
    $("#focus-toggle").innerHTML =
      `${icon(state.timer.endAt ? "pause" : "play")}${state.timer.endAt ? "Пауза" : remaining === 0 ? "Ещё сессия" : remaining < 1500 ? "Продолжить" : "Начать"}`;
    $("#focus-caption").textContent =
      remaining === 0
        ? "Готово! Время короткого перерыва."
        : state.timer.endAt
          ? "Вы в фокусе. Продолжайте в своём темпе."
          : "Одна задача. Без переключений.";
  }
}

document.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-action]");
  if (!button || button.disabled) return;
  const { action, id } = button.dataset;
  if (!state.data && !["menu", "retry", "close"].includes(action)) {
    toast("Сначала загрузите учебный план.");
    return;
  }
  try {
    switch (action) {
      case "menu":
        $("#sidebar").classList.toggle("open");
        break;
      case "retry":
        await init();
        break;
      case "new":
        openSession(null, button.dataset.date || state.selected);
        break;
      case "session":
        openSession(id);
        break;
      case "goal":
        openGoal();
        break;
      case "topic":
        openTopic(id);
        break;
      case "prompt":
        button.disabled = true;
        state.prompts = await api("/prompts");
        openPrompt(id);
        break;
      case "plan-topic":
        openSession(null, state.selected, id);
        break;
      case "close":
        closeDialog();
        break;
      case "search":
        openSearch();
        break;
      case "select-day":
        selectDate(button.dataset.date);
        render();
        break;
      case "day-agenda":
        openDay(button.dataset.date);
        break;
      case "week-prev":
        selectDate(addDays(state.selected, -7));
        render();
        break;
      case "week-next":
        selectDate(addDays(state.selected, 7));
        render();
        break;
      case "calendar-view":
        state.calendarView = button.dataset.view;
        render();
        break;
      case "cal-prev":
      case "cal-next": {
        const delta = action === "cal-prev" ? -1 : 1;
        if (state.calendarView === "week")
          selectDate(addDays(state.selected, delta * 7));
        else selectDate(moveMonth(state.selected, delta));
        render();
        break;
      }
      case "today":
        selectDate(today());
        render();
        break;
      case "complete": {
        const session = state.data.sessions.find((s) => s.id === id);
        if (!session) return;
        button.disabled = true;
        await api(`/sessions/${id}`, "PUT", {
          ...session,
          status: session.status === "completed" ? "planned" : "completed",
        });
        await loadPlan();
        render();
        if ($("#dialog").open) openDay(sessionDay(session));
        toast(
          session.status === "completed"
            ? "Занятие возвращено в план"
            : "Ещё один шаг сделан. Занятие выполнено.",
        );
        break;
      }
      case "delete-confirm": {
        const session = state.data.sessions.find((s) => s.id === id);
        openDialog(
          "Удалить занятие?",
          "Это действие удалит занятие и его заметки.",
          `<div class="dialog-body"><p class="topic-summary">${esc(session.title)} · ${dateLabel(sessionDay(session))}, ${time(session.startsAt)}</p><div id="form-error" class="form-error" role="alert"></div></div>`,
          `<button class="btn btn-secondary" data-action="session" data-id="${id}">Отмена</button><button class="btn btn-danger" data-action="delete" data-id="${id}">Удалить занятие</button>`,
        );
        break;
      }
      case "delete": {
        button.disabled = true;
        const session = state.data.sessions.find((s) => s.id === id);
        await api(`/sessions/${id}?version=${session.version}`, "DELETE");
        closeDialog();
        await loadPlan();
        render();
        toast("Занятие удалено");
        break;
      }
      case "reload-prompts":
        state.prompts = await api("/prompts");
        render();
        break;
      case "copy-prompt": {
        try {
          await navigator.clipboard.writeText($("#prompt-text").value);
          toast("Промпт скопирован");
        } catch {
          $("#prompt-text").focus();
          $("#prompt-text").select();
          toast("Текст выделен. Нажмите Ctrl+C, чтобы скопировать.");
        }
        break;
      }
      case "timer-toggle": {
        if (state.timer.endAt) {
          state.timer.remaining = Math.max(
            0,
            Math.ceil((state.timer.endAt - Date.now()) / 1000),
          );
          state.timer.endAt = null;
        } else {
          if (!state.timer.remaining) state.timer.remaining = 1500;
          state.timer.endAt = Date.now() + state.timer.remaining * 1000;
        }
        storage.set("timer", state.timer);
        tick();
        break;
      }
      case "timer-reset":
        state.timer = {
          remaining: 1500,
          endAt: null,
          sessionId: state.timer.sessionId,
        };
        storage.set("timer", state.timer);
        tick();
        break;
    }
  } catch (error) {
    const target = $("#form-error");
    if (target && $("#dialog").open) target.textContent = error.message;
    else toast(error.message, true);
  } finally {
    if (button.isConnected) button.disabled = false;
  }
});
document.addEventListener("submit", async (event) => {
  if (!["session-form", "topic-form", "goal-form"].includes(event.target.id))
    return;
  event.preventDefault();
  const form = event.target;
  const values = Object.fromEntries(new FormData(form));
  const button = $('button[type="submit"]', form);
  button.disabled = true;
  $("#form-error").textContent = "";
  try {
    if (form.id === "session-form") {
      const body = {
        ...values,
        startsAt: toIso(values.date, values.time),
        durationMinutes: Number(values.durationMinutes),
        version: Number(values.version),
        topicId: values.topicId || null,
      };
      await api(
        form.dataset.id ? `/sessions/${form.dataset.id}` : "/sessions",
        form.dataset.id ? "PUT" : "POST",
        body,
      );
    } else if (form.id === "topic-form") {
      await api(`/topics/${form.dataset.id}`, "PUT", {
        mastery: Number(values.mastery),
        notes: values.notes,
        version: Number(values.version),
      });
    } else {
      await api("/goal", "PUT", {
        ...values,
        startsAt: toIso(values.date, values.time),
        durationMinutes: Number(values.durationMinutes),
        version: Number(values.version),
      });
    }
    closeDialog();
    await loadPlan();
    render();
    toast(
      form.id === "topic-form"
        ? "Самооценка и конспект сохранены"
        : "Изменения сохранены",
    );
  } catch (error) {
    if ($("#form-error")) $("#form-error").textContent = error.message;
    else toast(error.message, true);
  } finally {
    button.disabled = false;
  }
});
document.addEventListener("change", (event) => {
  if (event.target.id === "timezone") {
    state.zone = event.target.value;
    storage.set("timezone", state.zone);
    render();
  }
  if (event.target.id === "calendar-filter") {
    state.filter = event.target.value;
    render();
  }
  if (event.target.id === "topic-filter") {
    state.topicTrack = event.target.value;
    $("#topic-grid").innerHTML = topicCards();
  }
  if (event.target.id === "focus-session") {
    state.timer.sessionId = event.target.value;
    storage.set("timer", state.timer);
  }
  if (event.target.closest("#session-form")) checkOverlap();
});
document.addEventListener("input", (event) => {
  if (event.target.id === "topic-search") {
    state.topicQuery = event.target.value;
    $("#topic-grid").innerHTML = topicCards();
  }
  if (event.target.id === "global-search") searchResults(event.target.value);
});
document.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    if (state.data) openSearch();
  }
});
document.addEventListener("click", (event) => {
  if (
    !event.target.closest("#sidebar") &&
    !event.target.closest('[data-action="menu"]')
  )
    $("#sidebar").classList.remove("open");
});
$("#dialog").addEventListener("click", (event) => {
  if (event.target === $("#dialog")) {
    const bounds = $("#dialog").getBoundingClientRect();
    if (
      event.clientX < bounds.left ||
      event.clientX > bounds.right ||
      event.clientY < bounds.top ||
      event.clientY > bounds.bottom
    )
      closeDialog();
  }
});
window.addEventListener("hashchange", () => {
  state.page = pageTitles[location.hash.slice(1)]
    ? location.hash.slice(1)
    : "overview";
  $("#sidebar").classList.remove("open");
  render();
  window.scrollTo({ top: 0, behavior: "instant" });
});
setInterval(tick, 1000);
init();
