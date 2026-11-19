(() => {
  "use strict";

  const storageKey = "personal-os.work-plan.v1";
  const dartApp = "https://app.dartai.com/";
  const projects = [
    { name: "達利畫廊", type: "品牌", next: "驗證 Facebook 到 LINE 的詢價流程，追蹤報價與到店。", url: "dali-facebook-work.html" },
    { name: "井象藝術", type: "品牌", next: "做出裱框、展覽與膠彩推廣的服務導覽及作品案例。" },
    { name: "一方土", type: "品牌", next: "整理社區共創成果，試算體驗是否能續辦。", url: "one-earth-assets.html" },
    { name: "為桃園策展", type: "申請案", next: "確認策展主題、簡報與個人影片實際進度。", url: "citizen-curator-2027.html", official: "2026-12-13" },
    { name: "新住民及子女築夢計畫", type: "申請案", next: "確認資格與團隊，核對計畫書、線上報名及紙本掛號。", url: "guangfu-dream-project.html", official: "2026-12-15" },
    { name: "共用裱框", type: "達利 × 井象", next: "整理成品、框樣與卡紙，回算報價，最後測試線上接件。", url: "framing-business-model.html" }
  ];
  const sectionNames = ["今日安排", "ChatGPT 執行清單", "ChatGPT 執行紀錄", "晚間回顧", "明日預排"];
  const dateFormat = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit" });
  const now = new Date();
  const today = dateFormat.format(now);
  const tomorrow = dateFormat.format(new Date(now.getTime() + 86400000));

  function dartLink(value, kind = "[ot]") {
    try {
      const url = new URL(value);
      const path = new RegExp("^/" + kind + "/[A-Za-z0-9]+(?:-[^/]*)?/?$");
      return url.origin === "https://app.dartai.com" && !url.username && !url.password && path.test(url.pathname)
        ? url.origin + url.pathname
        : "";
    } catch {
      return "";
    }
  }

  function lineData(source) {
    const links = [];
    const addLink = (label, raw) => {
      const href = dartLink(raw);
      if (href && !links.some(item => item.href === href)) links.push({ label: label || "Dart 原卡", href });
      return href ? "" : label;
    };
    const title = source
      .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (match, label, url) => addLink(label, url))
      .replace(/https:\/\/app\.dartai\.com\/[ot]\/[^\s<>，。；、)\]]+/g, match => addLink("", match))
      .replace(/\*\*|\x60/g, "")
      .replace(/^\s*(?:[-*]\s+|\d+[.)、]\s*)/, "")
      .replace(/\s+/g, " ")
      .trim();
    return { title, links };
  }

  function parseWorkbench(markdown) {
    const text = markdown.replace(/\r\n?/g, "\n");
    const sections = new Map();
    let active = null;
    for (const line of text.split("\n")) {
      if (/^\s*#{1,6}\s/.test(line)) {
        const heading = line.match(/^\s*#{2,6}\s+(\d{4}-\d{2}-\d{2})\s*[｜|]\s*(.*?)\s*$/);
        const day = heading && new Date(heading[1] + "T00:00:00Z");
        const validDate = day && !Number.isNaN(day.getTime()) && day.toISOString().slice(0, 10) === heading[1];
        active = validDate && sectionNames.includes(heading[2]) ? [] : null;
        if (active) sections.set(heading[1] + " " + heading[2], active);
      } else if (active && line.trim()) {
        active.push(line.trim());
      }
    }
    const latest = [...sections.keys()].filter(key => key.endsWith(" 今日安排")).sort().at(-1)?.slice(0, 10);
    if (!latest) throw new Error("找不到「YYYY-MM-DD｜今日安排」。請從 Dart 複製完整工作台 Markdown。");

    const rows = text.split("\n").filter(line => line.trim().startsWith("|")).map(line => line.trim().split("|").slice(1, -1).map(cell => cell.trim()));
    const summaries = new Map();
    for (const project of projects.slice(0, 5)) {
      const row = rows.find(cells => cells[0]?.startsWith("[" + project.name + "](") && cells.length >= 3);
      if (row) summaries.set(project.name, { next: row[1], owner: row[2], link: lineData(row[0]).links[0] });
    }
    const shared = text.split("\n").find(line => line.includes("**裱框案件與材料清單**") && line.includes("[共用裱框專案]"));
    if (shared) {
      const info = lineData(shared);
      summaries.set("共用裱框", { next: info.title.replace(/^裱框案件與材料清單。/, ""), link: info.links[0] });
    }
    return { sections, summaries, latest };
  }

  function readSnapshot() {
    try {
      const value = JSON.parse(localStorage.getItem(storageKey));
      if (typeof value?.markdown !== "string") return null;
      return { ...value, source: dartLink(value.source, "o"), workbench: parseWorkbench(value.markdown) };
    } catch {
      return null;
    }
  }

  const element = (id) => document.getElementById(id);
  function node(tag, text, className) {
    const result = document.createElement(tag);
    if (text) result.textContent = text;
    if (className) result.className = className;
    return result;
  }

  function addLink(container, label, href) {
    const a = node("a", label + (href.startsWith("https:") ? " ↗" : ""), "plan-item-link");
    a.href = href;
    if (href.startsWith("https:")) {
      a.target = "_blank";
      a.rel = "noopener noreferrer";
    }
    container.append(a);
  }

  function list(target, lines, empty, tag = "ol") {
    const parent = element(target);
    parent.replaceChildren();
    if (!lines.length) {
      parent.append(node("p", empty, "plan-empty"));
      return;
    }
    const content = tag === "p" ? parent : node(tag);
    for (const line of lines) {
      const { title, links } = lineData(line);
      if (!title && !links.length) continue;
      const item = node(tag === "p" ? "p" : "li", title);
      for (const link of links) addLink(item, link.label, link.href);
      content.append(item);
    }
    if (content !== parent) parent.append(content);
  }

  function section(workbench, date, name) {
    return workbench?.sections.get(date + " " + name) ?? [];
  }

  function dates(source, year) {
    const found = [...source.matchAll(/(?<!\d)(\d{1,2})\/(\d{1,2})(?!\d)/g)];
    return found.map((match, index) => ({
      day: year + "-" + match[1].padStart(2, "0") + "-" + match[2].padStart(2, "0"),
      note: source.slice(match.index + match[0].length, found[index + 1]?.index).replace(/^[\s，。；]+|[\s，。；]+$/g, "")
    })).filter(item => item.note && !item.note.startsWith("截止"));
  }

  function showProjects(workbench) {
    const target = element("plan-projects");
    const deadlines = [];
    target.replaceChildren();
    for (const project of projects) {
      const summary = workbench?.summaries.get(project.name);
      const card = node("article", "", "plan-project");
      card.append(node("div", project.type, "plan-type"), node("h3", project.name), node("p", summary?.next ?? project.next));
      if (summary?.owner) card.append(node("p", summary.owner, "plan-type"));
      if (summary?.link) addLink(card, "開啟 Dart 計畫", summary.link.href);
      if (project.url) addLink(card, "相關工具", project.url);
      if (project.official) card.append(node("div", "官方截止 " + project.official, "plan-evidence-source"));
      target.append(card);
      const year = workbench?.latest.slice(0, 4);
      if (year && summary) for (const milestone of dates(summary.next, year)) {
        if (milestone.day !== project.official) deadlines.push({ ...milestone, name: project.name });
      }
      if (project.official) deadlines.push({ day: project.official, name: project.name, note: "官方截止", official: true });
    }

    const next = deadlines.filter(item => item.official || item.day >= today)
      .sort((a, b) => a.day.localeCompare(b.day));
    const soon = next.filter(item => !item.official).slice(0, 4);
    const featured = [...soon, ...next.filter(item => item.official)].sort((a, b) => a.day.localeCompare(b.day));
    const holder = element("plan-deadlines");
    holder.replaceChildren();
    if (featured.length) {
      const box = node("div", "", "plan-deadline");
      const rows = node("ul");
      for (const item of featured) {
        const li = node("li", "", item.day < today ? "expired" : "");
        li.append(node("strong", item.day.slice(5).replace("-", "/")), document.createTextNode(item.name + " · " + item.note + (item.day < today ? "（日期已過）" : "")));
        rows.append(li);
      }
      box.append(node("h3", "近期里程碑與官方截止"), rows);
      holder.append(box);
    }
  }

  function render(snapshot) {
    const workbench = snapshot?.workbench;
    const upcoming = section(workbench, today, "今日安排");
    const todayCount = upcoming.filter(line => /^\d+[.)、]\s*/.test(line)).length;
    const day = workbench?.sections.has(today + " 今日安排") ? today : workbench?.latest;
    const stale = Boolean(day && day !== today);
    const lastImport = snapshot?.imported && new Date(snapshot.imported);
    const importTime = lastImport && !Number.isNaN(lastImport.getTime())
      ? lastImport.toLocaleString("zh-TW", { timeZone: "Asia/Taipei", hour12: false })
      : "";
    const sourceLabel = importTime ? "已匯入 · " + importTime : "尚未匯入";
    const home = element("work-plan-home-summary");
    if (home && day) {
      home.textContent = stale ? "上次工作 " + day + " · 開啟更新"
        : "今日 " + todayCount + " 項 · 計畫與晚間回顧";
    }
    if (!element("work-plan")) return;

    const freshness = element("plan-freshness");
    freshness.textContent = stale ? "目前只讀到 " + day + " 的安排。要看今日狀態請匯入最新工作台。" : sourceLabel + "。";
    freshness.dataset.stale = String(stale);
    element("plan-dart").href = snapshot?.source || dartApp;
    element("plan-dart").textContent = snapshot?.source ? "開啟 Dart 每日工作台 ↗" : "開啟 Dart ↗";
    element("plan-today-heading").textContent = stale ? "上次工作安排" : "今日工作";
    element("plan-today-date").textContent = day || today;
    element("plan-review-date").textContent = day || today;
    element("plan-clear").hidden = !snapshot;
    element("plan-source").value = snapshot?.source || "";
    list("plan-today-items", section(workbench, day, "今日安排"), "匯入工作台後顯示原訂工作。");
    list("plan-ai-items", section(workbench, day, "ChatGPT 執行清單"), "此日尚未匯入 AI 工作清單。");
    list("plan-log-items", section(workbench, day, "ChatGPT 執行紀錄"), "此日尚未匯入可查的交付紀錄。", "ul");
    list("plan-evening", section(workbench, day, "晚間回顧"), "尚無晚間回顧。", "p");
    const nextDay = stale ? dateFormat.format(new Date(new Date(day + "T12:00:00+08:00").getTime() + 86400000)) : tomorrow;
    list("plan-tomorrow", section(workbench, nextDay, "明日預排"), "此日後尚未匯入明日預排。");
    showProjects(workbench);
  }

  if (!element("work-plan") && !element("work-plan-home-summary")) return;
  render(readSnapshot());
  const form = element("plan-import-form");
  if (!form) return;
  const feedback = element("plan-feedback");
  const field = element("plan-markdown");
  const importPanel = element("plan-import");
  const fileInput = element("plan-file");
  fileInput.addEventListener("change", async () => {
    const file = fileInput.files[0];
    if (!file) return;
    try {
      if (file.size > 2250000) throw new Error("工作台檔案過大。請先保留近期日誌再匯入。");
      field.value = await file.text();
      form.requestSubmit();
    } catch (error) {
      feedback.dataset.error = "true";
      feedback.textContent = error.message || "無法讀取工作台檔案。";
    } finally {
      fileInput.value = "";
    }
  });
  document.querySelector('.plan-hero a[href="#plan-import"]').addEventListener("click", () => { importPanel.open = true; });
  if (location.hash === "#plan-import") importPanel.open = true;
  form.addEventListener("submit", event => {
    event.preventDefault();
    try {
      const markdown = field.value.trim();
      if (markdown.length > 750000) throw new Error("工作台內容太長。請保留計畫區和近期日期，移除較早的日誌後再匯入。");
      const rawUrl = element("plan-source").value.trim();
      const sourceInDocument = markdown.match(/https:\/\/app\.dartai\.com\/o\/[^\s<>，。；、)\]]+/)?.[0];
      const source = dartLink(rawUrl || sourceInDocument, "o");
      if (rawUrl && !source) throw new Error("請填入 https://app.dartai.com/o/ 開頭的 Dart 文件連結，或留空。");
      const workbench = parseWorkbench(markdown);
      const snapshot = { markdown, source, imported: new Date().toISOString() };
      localStorage.setItem(storageKey, JSON.stringify(snapshot));
      render({ ...snapshot, workbench });
      feedback.dataset.error = "false";
      feedback.textContent = "已匯入工作台。";
      field.value = "";
    } catch (error) {
      feedback.dataset.error = "true";
      feedback.textContent = error?.name === "QuotaExceededError" || error?.name === "SecurityError"
        ? "瀏覽器無法儲存本機副本。請確認瀏覽器允許這個網站使用本機儲存空間。"
        : error.message;
    }
  });
  element("plan-clear").addEventListener("click", () => {
    localStorage.removeItem(storageKey);
    field.value = "";
    feedback.dataset.error = "false";
    feedback.textContent = "已清除本機副本。";
    render(null);
  });
})();
