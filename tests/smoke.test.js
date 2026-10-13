/* Functional smoke tests for Habit Sheet (jsdom-based) */
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const appJs = fs.readFileSync(path.join(__dirname, "..", "js/app.js"), "utf8");

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log("  ✅", name); }
  else { fail++; console.log("  ❌", name); }
}

// localStorage mock
function makeStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    _map: map,
  };
}

async function boot(seedStorage) {
  const dom = new JSDOM(html, {
    runScripts: "dangerously",
    pretendToBeVisual: true,
    url: "http://localhost/",
    beforeParse(window) {
      window.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {} });
      Object.defineProperty(window, "localStorage", { value: seedStorage || makeStorage() });
    },
  });
  await new Promise((res) => setTimeout(res, 100));
  dom.window.eval(appJs);
  // DOMContentLoaded already fired during parse; re-dispatch so init() runs
  dom.window.document.dispatchEvent(new dom.window.Event("DOMContentLoaded"));
  await new Promise((res) => setTimeout(res, 50));
  return dom;
}

(async () => {
  console.log("\n== Test 1: First visit seeds demo data ==");
  const store = makeStorage();
  let dom = await boot(store);
  let doc = dom.window.document;
  check("4 demo habits rendered", doc.querySelectorAll(".habit-item").length === 4);
  check("hero shows today's date", /20\d\d/.test(doc.getElementById("heroDate").textContent));
  check("ring percent shown", /^\d+%$/.test(doc.getElementById("ringPct").textContent));
  check("seeded flag saved", store.getItem("habitSheet.seeded") === "1");

  console.log("\n== Test 2: Toggle completion updates state & storage ==");
  const firstCheck = doc.querySelector(".habit-item .check");
  const wasDone = doc.querySelector(".habit-item").classList.contains("done");
  firstCheck.click();
  doc = dom.window.document;
  const nowDone = doc.querySelector(".habit-item").classList.contains("done") !== wasDone;
  check("clicking checkbox toggles done class", nowDone);
  const saved = JSON.parse(store.getItem("habitSheet.data.v1"));
  check("log persisted to localStorage", typeof saved.log === "object");

  console.log("\n== Test 3: Add habit via modal ==");
  doc.getElementById("btnAdd").click();
  check("modal opens", doc.getElementById("modalOverlay").hidden === false);
  doc.getElementById("fName").value = "Test habit X";
  doc.getElementById("fIcon").value = "🧪";
  doc.getElementById("habitForm").dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true }));
  check("modal closed after save", doc.getElementById("modalOverlay").hidden === true);
  check("5 habits now listed", doc.querySelectorAll(".habit-item").length === 5);
  const s3 = JSON.parse(store.getItem("habitSheet.data.v1"));
  check("new habit persisted", s3.habits.some((h) => h.name === "Test habit X"));

  console.log("\n== Test 4: Validation — empty name rejected ==");
  doc.getElementById("btnAdd").click();
  doc.getElementById("fName").value = "   ";
  doc.getElementById("habitForm").dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true }));
  check("modal stays open on invalid name", doc.getElementById("modalOverlay").hidden === false);
  check("invalid class applied", doc.getElementById("errName").parentElement.classList.contains("invalid"));
  doc.getElementById("modalClose").click();

  console.log("\n== Test 5: Edit habit ==");
  doc.querySelector(".habit-item .btn-edit").click();
  check("edit modal prefilled", doc.getElementById("fName").value.length > 0);
  check("title says Edit", doc.getElementById("modalTitle").textContent === "Edit habit");
  doc.getElementById("fName").value = "Renamed habit";
  doc.getElementById("habitForm").dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true }));
  check("rename applied in list", [...doc.querySelectorAll(".habit-name")].some((n) => n.textContent === "Renamed habit"));

  console.log("\n== Test 6: Delete habit with confirm dialog ==");
  const before = doc.querySelectorAll(".habit-item").length;
  doc.querySelector(".habit-item .btn-del").click();
  check("confirm dialog opens", doc.getElementById("confirmOverlay").hidden === false);
  doc.getElementById("confirmYes").click();
  check("habit removed", doc.querySelectorAll(".habit-item").length === before - 1);

  console.log("\n== Test 7: Tabs switch views ==");
  ["week", "calendar", "stats"].forEach((v) => {
    doc.querySelector(`.tab[data-view="${v}"]`).click();
    check(`${v} view active`, doc.getElementById("view-" + v).classList.contains("is-active"));
  });

  console.log("\n== Test 8: Week grid renders & toggles ==");
  doc.querySelector('.tab[data-view="week"]').click();
  const cells = [...doc.querySelectorAll("#weekGrid button.cell-btn:not([disabled])")];
  check("week grid has clickable cells", cells.length > 0);
  const cellBefore = cells[0].classList.contains("on");
  cells[0].click();
  const cellAfter = [...doc.querySelectorAll("#weekGrid button.cell-btn")].find(
    (b) => b.dataset.habit === cells[0].dataset.habit && b.dataset.date === cells[0].dataset.date
  );
  check("cell toggle flips state", !!cellAfter && cellAfter.classList.contains("on") !== cellBefore);

  console.log("\n== Test 9: Calendar month navigation ==");
  doc.querySelector('.tab[data-view="calendar"]').click();
  const labelBefore = doc.getElementById("calLabel").textContent;
  doc.getElementById("calNext").click();
  check("month label changes on next", doc.getElementById("calLabel").textContent !== labelBefore);
  doc.getElementById("calPrev").click();
  check("month label returns on prev", doc.getElementById("calLabel").textContent === labelBefore);
  check("calendar day cells exist", doc.querySelectorAll("#calGrid .cal-cell:not(.empty)").length >= 28);

  console.log("\n== Test 10: Stats charts render ==");
  doc.querySelector('.tab[data-view="stats"]').click();
  check("7 daily bars", doc.querySelectorAll("#barsDaily .bar").length === 7);
  check("6 weekly progress rows", doc.querySelectorAll("#weeklyRows .weekly-row").length === 6);
  check("per-habit rows present", doc.querySelectorAll("#habitStats .ph-row").length > 0);
  check("best streak numeric", /^\d+$/.test(doc.getElementById("statBestStreak").textContent));
  check("week pct formatted", /^\d+%$/.test(doc.getElementById("statWeekPct").textContent));

  console.log("\n== Test 11: Theme toggle persists ==");
  const t0 = dom.window.document.documentElement.getAttribute("data-theme");
  doc.getElementById("btnTheme").click();
  const t1 = dom.window.document.documentElement.getAttribute("data-theme");
  check("theme flips", t0 !== t1);
  check("theme saved", store.getItem("habitSheet.theme") === t1);

  console.log("\n== Test 12: Persistence across reload ==");
  const names = [...doc.querySelectorAll(".habit-name")].map((n) => n.textContent);
  dom = await boot(store); // simulate refresh with same storage
  doc = dom.window.document;
  const names2 = [...doc.querySelectorAll(".habit-name")].map((n) => n.textContent);
  check("habits restored after reload", JSON.stringify(names) === JSON.stringify(names2));
  check("theme restored on reload", dom.window.document.documentElement.getAttribute("data-theme") === t1);

  console.log("\n== Test 13: Scheduled-day logic (rest day) ==");
  doc.getElementById("btnAdd").click();
  doc.getElementById("fName").value = "Not-today habit";
  const dayBtns = [...doc.querySelectorAll("#fDays .day-btn")];
  const todayDow = new Date().getDay();
  // Turn OFF today, keep everything else on
  const todayBtn = dayBtns[todayDow];
  if (todayBtn.classList.contains("on")) todayBtn.click();
  doc.getElementById("habitForm").dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true }));
  const items = [...doc.querySelectorAll(".habit-item")];
  const offItem = items.find((li) => li.querySelector(".habit-name").textContent === "Not-today habit");
  check("unscheduled-today habit marked scheduled-off", offItem && offItem.classList.contains("scheduled-off"));
  check("unscheduled-today checkbox disabled", offItem && offItem.querySelector(".check").disabled === true);

  console.log(`\n================  ${pass} passed, ${fail} failed  ================`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("Harness error:", e); process.exit(2); });
