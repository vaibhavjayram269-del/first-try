/* ============================================================
   Habit Sheet — app.js
   Vanilla JS habit tracker with localStorage persistence
   ============================================================ */
"use strict";

/* ---------- Constants & helpers ---------- */
const STORE_KEY = "habitSheet.data.v1";
const THEME_KEY = "habitSheet.theme";

const COLORS = ["#6c5ce7", "#00cec9", "#00b894", "#fdcb6e", "#e17055", "#e84393", "#0984e3", "#a29bfe"];
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function uid() {
  return "h" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/** Local date -> "YYYY-MM-DD" key */
function dateKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function keyToDate(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function todayKey() { return dateKey(new Date()); }
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
/** Monday-based start of week */
function weekStart(d) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = (x.getDay() + 6) % 7; // Mon=0..Sun=6
  return addDays(x, -dow);
}
function fmtShort(d) { return `${MONTHS[d.getMonth()].slice(0, 3)} ${d.getDate()}`; }
function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/* ---------- State ---------- */
let state = loadState();
let currentView = "today"; /* active tab name */
let weekAnchor = new Date();   // any date inside the displayed week
let calAnchor = new Date();    // month displayed in calendar
let selectedCalDate = todayKey();
let editingId = null;          // habit id being edited
let formColor = COLORS[0];
let formDays = [0, 1, 2, 3, 4, 5, 6];
let confirmCb = null;

function defaultState() { return { habits: [], log: {} }; }

function loadState() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return defaultState();
    const data = JSON.parse(raw);
    if (!Array.isArray(data.habits)) data.habits = [];
    if (!data.log || typeof data.log !== "object") data.log = {};
    // normalize
    data.habits.forEach((h) => {
      h.id = h.id || uid();
      h.days = Array.isArray(h.days) && h.days.length ? h.days : [0, 1, 2, 3, 4, 5, 6];
      h.color = h.color || COLORS[0];
      h.icon = h.icon || "✅";
      h.createdAt = h.createdAt || Date.now();
    });
    return data;
  } catch (e) {
    console.warn("Failed to load state, starting fresh.", e);
    return defaultState();
  }
}

function saveState() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
  } catch (e) {
    toast("⚠️ Could not save — storage may be full.");
  }
}

/* ---------- Derived data ---------- */
/** Is the habit scheduled on this weekday? habit.days uses getDay() indices (0=Sun..6=Sat) */
function scheduled(habit, date) { return habit.days.includes(date.getDay()); }

function isDone(habitId, key) {
  const arr = state.log[key];
  return Array.isArray(arr) && arr.includes(habitId);
}

function toggleDone(habitId, key) {
  const arr = state.log[key] || (state.log[key] = []);
  const i = arr.indexOf(habitId);
  if (i >= 0) arr.splice(i, 1); else arr.push(habitId);
  if (!arr.length) delete state.log[key];
  saveState();
}

/** Current streak: count consecutive scheduled completions backwards from `from`. */
function streakOf(habit, from) {
  const d = new Date(from);
  let cur = 0;
  // If today is scheduled but not yet done, start counting from yesterday.
  if (scheduled(habit, d) && !isDone(habit.id, dateKey(d))) {
    d.setDate(d.getDate() - 1);
  }
  for (let i = 0; i < 3650; i++) {
    if (scheduled(habit, d)) {
      if (isDone(habit.id, dateKey(d))) { cur++; d.setDate(d.getDate() - 1); }
      else break;
    } else {
      d.setDate(d.getDate() - 1);
    }
  }
  return cur;
}

/** Best (all-time) streak across scheduled history */
function bestStreakOf(habit) {
  const keys = Object.keys(state.log).sort();
  if (!keys.length) return streakOf(habit, new Date());
  const start = new Date(Math.min(habit.createdAt || Date.now(), keyToDate(keys[0]).getTime()));
  const end = new Date();
  let run = 0, max = 0;
  for (let d = new Date(start); d <= end; d = addDays(d, 1)) {
    if (!scheduled(habit, d)) continue;
    if (isDone(habit.id, dateKey(d))) { run++; max = Math.max(max, run); }
    else run = 0;
  }
  return Math.max(max, streakOf(habit, end));
}

function totalCompletions() {
  const ids = new Set(state.habits.map((h) => h.id));
  let n = 0;
  for (const key in state.log) {
    n += state.log[key].filter((id) => ids.has(id)).length;
  }
  return n;
}

/** For a date: {scheduled:[habits], done:[habits]} */
function daySnapshot(date) {
  const key = dateKey(date);
  const sched = state.habits.filter((h) => scheduled(h, date));
  const done = sched.filter((h) => isDone(h.id, key));
  return { sched, done, pct: sched.length ? Math.round((done.length / sched.length) * 100) : 0 };
}

function rangeStats(start, days) {
  let schedCount = 0, doneCount = 0;
  for (let i = 0; i < days; i++) {
    const d = addDays(start, i);
    const snap = daySnapshot(d);
    schedCount += snap.sched.length;
    doneCount += snap.done.length;
  }
  return { schedCount, doneCount, pct: schedCount ? Math.round((doneCount / schedCount) * 100) : 0 };
}

/* ---------- Theme ---------- */
function getTheme() { return document.documentElement.getAttribute("data-theme") || "dark"; }
function setTheme(t) {
  document.documentElement.setAttribute("data-theme", t);
  try { localStorage.setItem(THEME_KEY, t); } catch (e) {}
}

/* ---------- Toast ---------- */
function toast(msg) {
  const stack = $("#toastStack");
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = msg;
  stack.appendChild(el);
  setTimeout(() => {
    el.classList.add("out");
    setTimeout(() => el.remove(), 320);
  }, 2400);
}

/* ---------- Rendering: Hero ---------- */
function renderHero() {
  const now = new Date();
  $("#heroDate").textContent = now.toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  const hr = now.getHours();
  $("#heroGreeting").textContent =
    hr < 5 ? "Burning the midnight oil 🌙" :
    hr < 12 ? "Good morning 👋" :
    hr < 18 ? "Good afternoon 👋" : "Good evening 👋";

  const snap = daySnapshot(now);
  const ringPct = $("#ringPct");
  const circle = $("#ringCircle");
  const C = 326.7;
  circle.style.strokeDashoffset = String(C - (C * snap.pct) / 100);
  ringPct.textContent = snap.pct + "%";

  if (!state.habits.length) {
    $("#heroSummary").textContent = "Add your first habit to get started.";
  } else if (!snap.sched.length) {
    $("#heroSummary").textContent = "No habits scheduled for today — enjoy your rest day! 😌";
  } else if (snap.done.length === snap.sched.length) {
    $("#heroSummary").textContent = `All ${snap.sched.length} habit${snap.sched.length > 1 ? "s" : ""} completed today. Amazing work! 🎉`;
  } else {
    $("#heroSummary").textContent = `${snap.done.length} of ${snap.sched.length} habits completed today. Keep going!`;
  }
  $("#todayCountChip").textContent = `${snap.done.length} / ${snap.sched.length} done`;
}

/* ---------- Rendering: Today list ---------- */
const CHECK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>';

function renderToday() {
  const list = $("#habitList");
  const empty = $("#emptyToday");
  list.innerHTML = "";
  empty.hidden = state.habits.length > 0;

  const today = new Date();
  const tkey = todayKey();

  state.habits.forEach((h) => {
    const li = document.createElement("li");
    const schedToday = scheduled(h, today);
    const done = schedToday && isDone(h.id, tkey);
    li.className = "habit-item" + (done ? " done" : "") + (schedToday ? "" : " scheduled-off");
    li.style.setProperty("--hc", h.color);
    li.dataset.id = h.id;

    const streak = streakOf(h, today);
    const total = totalForHabit(h);

    li.innerHTML = `
      <button class="check" aria-label="${done ? "Mark as not done" : "Mark as done"}" ${schedToday ? "" : "disabled"}>${CHECK_SVG}</button>
      <span class="habit-icon" aria-hidden="true">${esc(h.icon)}</span>
      <div class="habit-main">
        <p class="habit-name">${esc(h.name)}</p>
        <div class="habit-meta">
          <span class="badge ${streak >= 3 ? "streak-hot" : ""}">🔥 ${streak} day${streak === 1 ? "" : "s"}</span>
          <span class="badge">✅ ${total} total</span>
          ${!schedToday ? `<span class="badge">😴 Rest day today</span>` : ""}
        </div>
      </div>
      <div class="habit-actions">
        <button class="icon-btn btn-edit" title="Edit habit" aria-label="Edit ${esc(h.name)}">✏️</button>
        <button class="icon-btn btn-del" title="Delete habit" aria-label="Delete ${esc(h.name)}">🗑️</button>
      </div>`;

    li.querySelector(".check").addEventListener("click", () => {
      if (!schedToday) return;
      toggleDone(h.id, tkey);
      const box = li.querySelector(".check");
      box.classList.remove("pop"); void box.offsetWidth; box.classList.add("pop");
      renderAll();
    });
    li.querySelector(".btn-edit").addEventListener("click", () => openModal(h.id));
    li.querySelector(".btn-del").addEventListener("click", () => {
      askConfirm(`Delete "${h.name}" and all its history?`, () => {
        state.habits = state.habits.filter((x) => x.id !== h.id);
        for (const key in state.log) {
          state.log[key] = state.log[key].filter((id) => id !== h.id);
          if (!state.log[key].length) delete state.log[key];
        }
        saveState();
        renderAll();
        toast("Habit deleted.");
      });
    });

    list.appendChild(li);
  });
}

function totalForHabit(h) {
  let n = 0;
  for (const key in state.log) if (state.log[key].includes(h.id)) n++;
  return n;
}

/* ---------- Rendering: Week grid ---------- */
function renderWeek() {
  const grid = $("#weekGrid");
  const empty = $("#emptyWeek");
  grid.innerHTML = "";
  empty.hidden = state.habits.length > 0;
  $(".grid-card").style.display = state.habits.length ? "" : "none";

  const ws = weekStart(weekAnchor);
  const tkey = todayKey();
  $("#weekLabel").textContent = `${fmtShort(ws)} – ${fmtShort(addDays(ws, 6))}`;

  const thead = document.createElement("thead");
  let headHtml = "<tr><th class='col-habit'>Habit</th>";
  for (let i = 0; i < 7; i++) {
    const d = addDays(ws, i);
    const isToday = dateKey(d) === tkey;
    headHtml += `<th${isToday ? ' style="color:var(--grad-b)"' : ""}>${DAY_NAMES[d.getDay()]}<br><span style="font-weight:600">${d.getDate()}</span></th>`;
  }
  headHtml += "<th>%</th></tr>";
  thead.innerHTML = headHtml;
  grid.appendChild(thead);

  const tbody = document.createElement("tbody");
  state.habits.forEach((h) => {
    const tr = document.createElement("tr");
    let cells = `<td class="grid-habit-name" title="${esc(h.name)}">${esc(h.icon)} ${esc(h.name)}</td>`;
    let schedN = 0, doneN = 0;
    for (let i = 0; i < 7; i++) {
      const d = addDays(ws, i);
      const key = dateKey(d);
      const onSched = scheduled(h, d);
      const done = onSched && isDone(h.id, key);
      if (onSched) { schedN++; if (done) doneN++; }
      const future = d > new Date();
      const cls = ["cell-btn"];
      if (!onSched) cls.push("off-day");
      if (done) cls.push("on");
      if (key === tkey) cls.push("today-col");
      if (future) cls.push("future");
      cells += `<td><button class="${cls.join(" ")}" data-habit="${h.id}" data-date="${key}" ${!onSched ? "disabled" : ""} style="--hc:${h.color}">${CHECK_SVG}</button></td>`;
    }
    const pct = schedN ? Math.round((doneN / schedN) * 100) : 0;
    cells += `<td class="grid-pct">${pct}%</td>`;
    tr.innerHTML = cells;
    tbody.appendChild(tr);
  });
  grid.appendChild(tbody);

  $$("button.cell-btn:not([disabled])", grid).forEach((btn) => {
    btn.addEventListener("click", () => {
      toggleDone(btn.dataset.habit, btn.dataset.date);
      renderAll();
    });
  });
}

/* ---------- Rendering: Calendar ---------- */
function renderCalendar() {
  const grid = $("#calGrid");
  const wd = $("#calWeekdays");
  wd.innerHTML = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map((d) => `<span>${d}</span>`).join("");

  const y = calAnchor.getFullYear(), m = calAnchor.getMonth();
  $("#calLabel").textContent = `${MONTHS[m]} ${y}`;

  const first = new Date(y, m, 1);
  const lead = (first.getDay() + 6) % 7; // Monday-first offset
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const tkey = todayKey();

  grid.innerHTML = "";
  for (let i = 0; i < lead; i++) {
    const c = document.createElement("div");
    c.className = "cal-cell empty";
    grid.appendChild(c);
  }
  for (let day = 1; day <= daysInMonth; day++) {
    const d = new Date(y, m, day);
    const key = dateKey(d);
    const snap = daySnapshot(d);
    const future = d > new Date();
    const cell = document.createElement("button");
    cell.className = "cal-cell" + (key === tkey ? " today" : "") + (future ? " future-disabled" : "");
    cell.dataset.date = key;
    const dots = snap.done.slice(0, 5).map((h) => `<span class="cal-dot" style="background:${h.color}"></span>`).join("");
    cell.innerHTML = `
      <span class="cal-daynum">${day}</span>
      <span class="cal-dots">${dots}</span>
      ${snap.sched.length ? `<span class="cal-pct">${snap.pct}%</span>` : ""}`;
    cell.addEventListener("click", () => {
      selectedCalDate = key;
      renderCalDetail();
      $$(".cal-cell").forEach((c) => c.style.outline = "");
      cell.style.outline = "2px solid var(--accent)";
      cell.style.outlineOffset = "-2px";
    });
    grid.appendChild(cell);
  }
  renderCalDetail();
}

function renderCalDetail() {
  const box = $("#calDetail");
  const d = keyToDate(selectedCalDate);
  const snap = daySnapshot(d);
  const label = d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
  if (!snap.sched.length) {
    box.innerHTML = `<h4>${label}</h4><p style="margin:0;color:var(--text-dim);font-size:0.9rem">No habits scheduled this day.</p>`;
    return;
  }
  const items = snap.sched.map((h) => {
    const done = isDone(h.id, selectedCalDate);
    return `<li><span class="mini-check ${done ? "on" : ""}" style="--hc:${h.color}">${done ? "✓" : ""}</span>${esc(h.icon)} ${esc(h.name)} <span style="color:var(--text-dim);font-size:0.8rem">${done ? "done" : "missed"}</span></li>`;
  }).join("");
  box.innerHTML = `<h4>${label} — ${snap.done.length}/${snap.sched.length} (${snap.pct}%)</h4><ul>${items}</ul>`;
}

/* ---------- Rendering: Stats ---------- */
function renderStats() {
  const hasData = state.habits.length > 0;
  $("#emptyStats").hidden = hasData;
  $$("#view-stats .stat-cards, #view-stats .chart-row, .per-habit-card").forEach((el) => {
    el.style.display = hasData ? "" : "none";
  });
  if (!hasData) return;

  // Summary cards
  const best = state.habits.reduce((mx, h) => Math.max(mx, bestStreakOf(h)), 0);
  $("#statBestStreak").textContent = best;
  $("#statTotalDone").textContent = totalCompletions();
  const wk = rangeStats(weekStart(new Date()), 7);
  $("#statWeekPct").textContent = wk.pct + "%";
  $("#statHabits").textContent = state.habits.length;

  // Daily bars — last 7 days
  const bars = $("#barsDaily");
  bars.innerHTML = "";
  const t = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = addDays(t, -i);
    const snap = daySnapshot(d);
    const col = document.createElement("div");
    col.className = "bar-col";
    col.innerHTML = `
      <span class="bar-val">${snap.sched.length ? snap.pct + "%" : "–"}</span>
      <div class="bar" style="height:${Math.max(snap.pct, 3)}%" title="${snap.done.length}/${snap.sched.length}"></div>
      <span class="bar-label">${DAY_NAMES[d.getDay()]}</span>`;
    bars.appendChild(col);
  }

  // Weekly rows — last 6 weeks
  const rows = $("#weeklyRows");
  rows.innerHTML = "";
  const wsThis = weekStart(t);
  for (let i = 5; i >= 0; i--) {
    const ws = addDays(wsThis, -7 * i);
    const r = rangeStats(ws, 7);
    const row = document.createElement("div");
    row.className = "weekly-row";
    row.innerHTML = `
      <div class="wr-head"><span>${i === 0 ? "This week" : "Week of " + fmtShort(ws)}</span><span>${r.pct}%</span></div>
      <div class="progress-track"><div class="progress-fill" data-w="${r.pct}"></div></div>`;
    rows.appendChild(row);
  }
  requestAnimationFrame(() => $$(".progress-fill", rows).forEach((f) => { f.style.width = f.dataset.w + "%"; }));

  // Per-habit summary
  const box = $("#habitStats");
  box.innerHTML = "";
  state.habits.forEach((h) => {
    const since = new Date(h.createdAt || Date.now());
    let schedN = 0, doneN = 0;
    for (let d = new Date(since); d <= new Date(); d = addDays(d, 1)) {
      if (!scheduled(h, d)) continue;
      schedN++;
      if (isDone(h.id, dateKey(d))) doneN++;
    }
    const rate = schedN ? Math.round((doneN / schedN) * 100) : 0;
    const row = document.createElement("div");
    row.className = "ph-row";
    row.innerHTML = `
      <div class="ph-name"><span class="ph-dot" style="background:${h.color}"></span><span class="n">${esc(h.icon)} ${esc(h.name)}</span></div>
      <span class="ph-streak">🔥 ${streakOf(h, new Date())}d · best ${bestStreakOf(h)}d</span>
      <span class="ph-rate" style="color:${rate >= 70 ? "var(--ok)" : rate >= 40 ? "var(--text)" : "var(--danger)"}">${rate}%</span>`;
    box.appendChild(row);
  });
}

/* ---------- Render all ---------- */
function renderAll() {
  renderHero();
  renderToday();
  renderWeek();
  renderCalendar();
  renderStats();
}

/* ---------- Views / tabs ---------- */
function switchView(name) {
  currentView = name;
  $$(".tab").forEach((t) => {
    const on = t.dataset.view === name;
    t.classList.toggle("is-active", on);
    t.setAttribute("aria-selected", String(on));
  });
  $$(".view").forEach((v) => v.classList.toggle("is-active", v.id === "view-" + name));
  observeReveals();
}

/* ---------- Modal (add/edit) ---------- */
function buildSwatches() {
  const wrap = $("#fColors");
  wrap.innerHTML = "";
  COLORS.forEach((c) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "swatch" + (c === formColor ? " sel" : "");
    b.style.background = c;
    b.style.setProperty("--sw", c);
    b.setAttribute("role", "radio");
    b.setAttribute("aria-checked", String(c === formColor));
    b.setAttribute("aria-label", "Color " + c);
    b.addEventListener("click", () => {
      formColor = c;
      $$(".swatch", wrap).forEach((s) => s.classList.remove("sel"));
      b.classList.add("sel");
    });
    wrap.appendChild(b);
  });
}

function buildDayPicker() {
  const wrap = $("#fDays");
  wrap.innerHTML = "";
  DAY_NAMES.forEach((name, idx) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "day-btn" + (formDays.includes(idx) ? " on" : "");
    b.textContent = name.slice(0, 3);
    b.title = name;
    b.setAttribute("aria-pressed", String(formDays.includes(idx)));
    b.addEventListener("click", () => {
      if (formDays.includes(idx)) {
        if (formDays.length > 1) formDays = formDays.filter((d) => d !== idx);
        else { toast("Pick at least one day."); return; }
      } else {
        formDays.push(idx);
        formDays.sort((a, b2) => a - b2);
      }
      b.classList.toggle("on", formDays.includes(idx));
      b.setAttribute("aria-pressed", String(formDays.includes(idx)));
    });
    wrap.appendChild(b);
  });
}

function openModal(id) {
  editingId = id || null;
  const h = id ? state.habits.find((x) => x.id === id) : null;
  $("#modalTitle").textContent = h ? "Edit habit" : "New habit";
  $("#btnSave").textContent = h ? "Save changes" : "Save habit";
  $("#fName").value = h ? h.name : "";
  $("#fIcon").value = h ? h.icon : "";
  formColor = h ? h.color : COLORS[Math.floor(Math.random() * COLORS.length)];
  formDays = h ? [...h.days] : [0, 1, 2, 3, 4, 5, 6];
  $("#errName").parentNode.classList.remove("invalid");
  buildSwatches();
  buildDayPicker();
  $("#modalOverlay").hidden = false;
  setTimeout(() => $("#fName").focus(), 60);
}

function closeModal() {
  $("#modalOverlay").hidden = true;
  editingId = null;
}

function submitForm(e) {
  e.preventDefault();
  const name = $("#fName").value.trim();
  const field = $("#errName").parentNode;
  if (!name) { field.classList.add("invalid"); $("#fName").focus(); return; }
  field.classList.remove("invalid");
  const icon = $("#fIcon").value.trim() || "✅";

  if (editingId) {
    const h = state.habits.find((x) => x.id === editingId);
    if (h) {
      const removedDays = h.days.filter((d) => !formDays.includes(d));
      h.name = name; h.icon = icon; h.color = formColor; h.days = [...formDays];
      // Clear completions that fall on newly unscheduled weekdays
      for (const key in state.log) {
        const dow = keyToDate(key).getDay();
        if (removedDays.includes(dow)) {
          state.log[key] = state.log[key].filter((id) => id !== h.id);
          if (!state.log[key].length) delete state.log[key];
        }
      }
      toast("Habit updated ✨");
    }
  } else {
    state.habits.push({ id: uid(), name, icon, color: formColor, days: [...formDays], createdAt: Date.now() });
    toast("Habit created 🎉");
  }
  saveState();
  closeModal();
  renderAll();
}

/* ---------- Confirm dialog ---------- */
function askConfirm(text, cb) {
  $("#confirmText").textContent = text;
  confirmCb = cb;
  $("#confirmOverlay").hidden = false;
}

/* ---------- Reveal-on-scroll ---------- */
let io = null;
function observeReveals() {
  if (!("IntersectionObserver" in window)) {
    $$(".reveal").forEach((el) => el.classList.add("visible"));
    return;
  }
  if (!io) {
    io = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (en.isIntersecting) { en.target.classList.add("visible"); io.unobserve(en.target); }
      });
    }, { threshold: 0.08 });
  }
  $$(".reveal:not(.visible)").forEach((el) => io.observe(el));
}

/* ---------- Seed demo data on very first visit ---------- */
function maybeSeed() {
  let seeded;
  try { seeded = localStorage.getItem("habitSheet.seeded"); } catch (e) { seeded = "1"; }
  if (seeded || state.habits.length) return;
  const demo = [
    { name: "Drink 8 glasses of water", icon: "💧", color: "#0984e3" },
    { name: "Read 20 pages", icon: "📚", color: "#6c5ce7" },
    { name: "Morning workout", icon: "🏋️", color: "#00b894" },
    { name: "Meditate 10 minutes", icon: "🧘", color: "#e84393" },
  ];
  const now = new Date();
  demo.forEach((d) => {
    const h = { id: uid(), name: d.name, icon: d.icon, color: d.color, days: [0, 1, 2, 3, 4, 5, 6], createdAt: addDays(now, -21).getTime() };
    state.habits.push(h);
    // randomly complete past days (~70%)
    for (let i = 1; i <= 20; i++) {
      if (Math.random() < 0.7) {
        const key = dateKey(addDays(now, -i));
        (state.log[key] || (state.log[key] = [])).push(h.id);
      }
    }
    if (Math.random() < 0.5) {
      (state.log[todayKey()] || (state.log[todayKey()] = [])).push(h.id);
    }
  });
  saveState();
  try { localStorage.setItem("habitSheet.seeded", "1"); } catch (e) {}
}

/* ---------- Wire-up ---------- */
function init() {
  maybeSeed();

  // Tabs
  $$(".tab").forEach((t) => t.addEventListener("click", () => switchView(t.dataset.view)));

  // Theme toggle
  $("#btnTheme").addEventListener("click", () => {
    setTheme(getTheme() === "dark" ? "light" : "dark");
  });

  // Add buttons
  $("#btnAdd").addEventListener("click", () => openModal(null));
  $$("[data-open-modal]").forEach((b) => b.addEventListener("click", () => openModal(null)));

  // Modal
  $("#modalClose").addEventListener("click", closeModal);
  $("#btnCancel").addEventListener("click", closeModal);
  $("#modalOverlay").addEventListener("click", (e) => { if (e.target === e.currentTarget) closeModal(); });
  $("#habitForm").addEventListener("submit", submitForm);

  // Confirm
  $("#confirmNo").addEventListener("click", () => { $("#confirmOverlay").hidden = true; confirmCb = null; });
  $("#confirmYes").addEventListener("click", () => {
    $("#confirmOverlay").hidden = true;
    if (confirmCb) confirmCb();
    confirmCb = null;
  });
  $("#confirmOverlay").addEventListener("click", (e) => { if (e.target === e.currentTarget) { e.currentTarget.hidden = true; confirmCb = null; } });

  // Esc closes overlays
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { closeModal(); $("#confirmOverlay").hidden = true; }
  });

  // Week pager
  $("#weekPrev").addEventListener("click", () => { weekAnchor = addDays(weekAnchor, -7); renderWeek(); });
  $("#weekNext").addEventListener("click", () => { weekAnchor = addDays(weekAnchor, 7); renderWeek(); });

  // Calendar pager
  $("#calPrev").addEventListener("click", () => { calAnchor = new Date(calAnchor.getFullYear(), calAnchor.getMonth() - 1, 1); renderCalendar(); });
  $("#calNext").addEventListener("click", () => { calAnchor = new Date(calAnchor.getFullYear(), calAnchor.getMonth() + 1, 1); renderCalendar(); });

  renderAll();
  observeReveals();
}

document.addEventListener("DOMContentLoaded", init);
