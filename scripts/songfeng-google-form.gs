/**
 * 達利／松風閣｜框條單價採集 Google Forms
 *
 * 安裝：在「松風閣｜框條單價採集表單與報價資料庫」Google 試算表中，
 * 點選「擴充功能 → Apps Script」，將此檔完整貼入 Code.gs，
 * 儲存後執行 installSongfengGoogleForm() 並完成授權。
 *
 * 本程式在你的 Google 帳戶中建立 Google 表單，表單原始回應與試算表連動，
 * 並在「報價紀錄」新增結構化資料。執行一次即可，後續只需填表。
 *
 * 注意：單價是根據兩次報價反推，不是松風閣正式確認單價。
 */
const SFG_SETUP = Object.freeze({
  catalogSheet: "框型清單",
  recordsSheet: "報價紀錄",
  entrySheet: "填寫表單",
  sourceUrl: "https://sfg218.com/simulation.php?Clear=Clear&winshow=no&df_pic=yes",
  cartUrl: "https://sfg218.com/shoplist.php"
});

function onOpen() {
  SpreadsheetApp.getUi().createMenu("松風閣報價")
    .addItem("建立／更新 Google 表單", "installSongfengGoogleForm")
    .addItem("查看表單連結", "showSongfengGoogleFormUrl")
    .addToUi();
}

function installSongfengGoogleForm() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error("請先從本次建立的 Google 試算表開啟 Apps Script。");
  const catalog = ss.getSheetByName(SFG_SETUP.catalogSheet);
  const records = ss.getSheetByName(SFG_SETUP.recordsSheet);
  if (!catalog || !records) throw new Error("缺少「框型清單」或「報價紀錄」分頁。");

  const properties = PropertiesService.getScriptProperties();
  let form = null;
  const oldId = properties.getProperty("SFG_FORM_ID");
  if (oldId) {
    try { form = FormApp.openById(oldId); } catch (error) { form = null; }
  }
  if (!form) {
    form = FormApp.create("松風閣｜框條單價報價採集表單", true);
    form.setDescription(
      "逐筆記錄同一框型在兩組尺寸的松風閣報價，反推每 15cm 計價單位的框價。\n\n" +
      "請先在模擬器選相同框型與相同工法，再記錄 30×30cm、30×45cm（或其他兩組尺寸）。\n" +
      SFG_SETUP.sourceUrl + "\n" + SFG_SETUP.cartUrl
    );
    form.setConfirmationMessage("報價已送出。可以繼續採集下一個框型；請回 Google 試算表「報價紀錄」確認推算值。");
    form.setProgressBar(true);
    addSongfengQuestions_(form, catalog);
    form.setDestination(FormApp.DestinationType.SPREADSHEET, ss.getId());
    properties.setProperty("SFG_FORM_ID", form.getId());
  } else {
    refreshSongfengChoices_(form, catalog);
  }
  properties.setProperty("SFG_SPREADSHEET_ID", ss.getId());

  // 保留其他 Apps Script 觸發器，僅避免本功能重複建立。
  const have = ScriptApp.getProjectTriggers().some(t =>
    t.getHandlerFunction() === "songfengOnSubmit" &&
    t.getTriggerSourceId() === form.getId()
  );
  if (!have) {
    ScriptApp.newTrigger("songfengOnSubmit").forForm(form).onFormSubmit().create();
  }

  const entry = ss.getSheetByName(SFG_SETUP.entrySheet);
  if (entry) {
    entry.getRange("A39").setValue("手機 Google 表單連結");
    entry.getRange("B39").setValue(form.getPublishedUrl());
    entry.getRange("C39").setValue("開啟網址即可新增一筆報價紀錄；Google 表單只需要安裝一次。");
    entry.getRange("B39").setWrap(true);
  }
  const guide = ss.getSheetByName("操作說明");
  if (guide) {
    guide.getRange("A13:B15").setValues([
      ["Google 表單入口", form.getPublishedUrl()],
      ["Google 表單管理", form.getEditUrl()],
      ["提醒", "首次安裝須在 Apps Script 授權。表單可分享填寫網址，但不要將試算表公開編輯。"]
    ]);
  }
  Logger.log("表單填寫網址：" + form.getPublishedUrl());
  Logger.log("表單管理網址：" + form.getEditUrl());
  SpreadsheetApp.getUi().alert(
    "Google 表單已建立（或更新）。\n填寫網址已放在「填寫表單」B39。\n" +
    "你也可從「操作說明」查看表單管理網址。"
  );
}

function addSongfengQuestions_(form, catalog) {
  const allChoices = readSongfengFrameNames_(catalog);
  form.addSectionHeaderItem().setTitle("① 選擇外框");
  const model = form.addListItem().setTitle("框型名稱").setRequired(true);
  try {
    model.setChoiceValues(allChoices.concat(["其他／未收錄框型"]));
  } catch (error) {
    // 萬一 Google Forms 限制下拉選項數量，就改用文字欄位，不影響採集。
    form.deleteItem(model);
    form.addTextItem().setTitle("框型名稱").setRequired(true)
      .setHelpText("請從試算表「框型清單」複製完整名稱，避免與 Airtable 對照失敗。");
  }
  form.addTextItem().setTitle("未收錄框型名稱").setRequired(false)
    .setHelpText("只有選擇「其他／未收錄框型」才需填寫。");
  form.addListItem().setTitle("報價來源").setChoiceValues([
    "松風閣購物車", "松風閣線上模擬框", "松風閣外框頁面", "電話詢價", "其他"
  ]).setRequired(true);

  form.addSectionHeaderItem().setTitle("② 兩組尺寸報價");
  const positive = FormApp.createTextValidation().requireNumberGreaterThan(0)
    .setHelpText("請輸入大於零的數字，例如 30 或 325。").build();
  [
    ["長度①（cm）", "30"], ["寬度①（cm）", "30"], ["報價①（NT$）", "第一筆實際報價"],
    ["長度②（cm）", "30"], ["寬度②（cm）", "45"], ["報價②（NT$）", "第二筆實際報價"]
  ].forEach(pair => {
    form.addTextItem().setTitle(pair[0]).setHelpText("參考：" + pair[1])
      .setRequired(true).setValidation(positive);
  });

  form.addSectionHeaderItem().setTitle("③ 材料與費用");
  form.addMultipleChoiceItem().setTitle("報價含背板").setChoiceValues(["不含", "包含"]).setRequired(true);
  form.addTextItem().setTitle("背板每才（NT$）").setRequired(false)
    .setHelpText("不填時採用 70 元；若含背板請核對實際價格。");
  form.addMultipleChoiceItem().setTitle("報價含壓克力").setChoiceValues(["不含", "包含"]).setRequired(true);
  form.addTextItem().setTitle("壓克力每才（NT$）").setRequired(false)
    .setHelpText("不填時採用 100 元；若含壓克力請核對實際價格。");
  form.addTextItem().setTitle("兩次共同固定費（NT$）").setHelpText("沒有或不確定時填 0。");
  form.addTextItem().setTitle("第一次其他費（NT$）").setHelpText("沒有填 0。");
  form.addTextItem().setTitle("第二次其他費（NT$）").setHelpText("沒有填 0。");
  form.addParagraphTextItem().setTitle("備註／工法").setRequired(false)
    .setHelpText("可記錄：折扣、固定工資、尺寸限制、價格與 Airtable 不一致的原因。");
}

function readSongfengFrameNames_(catalog) {
  const last = Math.max(catalog.getLastRow(), 2);
  return [...new Set(catalog.getRange(2, 1, last - 1, 1).getValues()
    .flat().map(v => String(v || "").trim()).filter(v => v && !v.startsWith("（清單")))];
}

function refreshSongfengChoices_(form, catalog) {
  const list = form.getItems(FormApp.ItemType.LIST)
    .map(it => it.asListItem()).find(it => it.getTitle() === "框型名稱");
  if (list) list.setChoiceValues(readSongfengFrameNames_(catalog).concat(["其他／未收錄框型"]));
}

function songfengOnSubmit(e) {
  if (!e || !e.response) throw new Error("此函式由 Google 表單的送出事件自動執行，請不要手動執行。");
  const props = PropertiesService.getScriptProperties();
  const spreadsheetId = props.getProperty("SFG_SPREADSHEET_ID");
  if (!spreadsheetId) throw new Error("請先執行 installSongfengGoogleForm。");

  const response = {};
  e.response.getItemResponses().forEach(item => {
    response[item.getItem().getTitle()] = item.getResponse();
  });
  const read = key => response[key] == null ? "" : response[key];
  const num = (key, fallback) => {
    const value = String(read(key)).trim().replace(/,/g, "");
    if (!value) return fallback;
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) throw new Error("表單數字無效：" + key);
    return n;
  };
  const safe = value => {
    const text = String(value || "").trim();
    return /^[=+\-@]/.test(text) ? "'" + text : text;
  };
  const model = safe(read("框型名稱") === "其他／未收錄框型" ?
    read("未收錄框型名稱") : read("框型名稱"));
  if (!model) throw new Error("框型名稱為必填。");
  const firstL = num("長度①（cm）", 30);
  const firstW = num("寬度①（cm）", 30);
  const firstPrice = num("報價①（NT$）", 0);
  const secondL = num("長度②（cm）", 30);
  const secondW = num("寬度②（cm）", 45);
  const secondPrice = num("報價②（NT$）", 0);
  if (firstL <= 0 || firstW <= 0 || secondL <= 0 || secondW <= 0 ||
      firstPrice <= 0 || secondPrice <= 0) throw new Error("尺寸及報價必須大於零。");

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const ss = SpreadsheetApp.openById(spreadsheetId);
    const records = ss.getSheetByName(SFG_SETUP.recordsSheet);
    const catalog = ss.getSheetByName(SFG_SETUP.catalogSheet);
    const catalogRows = catalog.getRange(2, 1, Math.max(catalog.getLastRow() - 1, 1), 2).getValues();
    const match = catalogRows.find(row => String(row[0] || "").trim() === model);
    const category = match ? String(match[1] || "") : "自訂／待核對";

    // 報價紀錄的 R:V 原本已有預留公式，因此不能直接 appendRow（會越過公式）。
    const searchEnd = Math.max(records.getLastRow(), 2);
    const existing = records.getRange(2, 1, searchEnd - 1, 1).getValues();
    const emptyIndex = existing.findIndex(row => row[0] === "");
    const rowNumber = emptyIndex < 0 ? searchEnd + 1 : emptyIndex + 2;
    if (rowNumber > records.getMaxRows()) records.insertRowsAfter(records.getMaxRows(), 50);

    const base = [
      new Date(), model, category, safe(read("報價來源") || "松風閣購物車"),
      firstL, firstW, firstPrice, secondL, secondW, secondPrice,
      read("報價含背板") === "包含", num("背板每才（NT$）", 70),
      read("報價含壓克力") === "包含", num("壓克力每才（NT$）", 100),
      num("兩次共同固定費（NT$）", 0),
      num("第一次其他費（NT$）", 0),
      num("第二次其他費（NT$）", 0)
    ];
    records.getRange(rowNumber, 1, 1, 17).setValues([base]);
    records.getRange("R2:V2").copyTo(records.getRange(rowNumber, 18, 1, 5),
      SpreadsheetApp.CopyPasteType.PASTE_FORMULA, false);
    records.getRange(rowNumber, 23, 1, 2).setValues([
      [safe(read("備註／工法")), SFG_SETUP.cartUrl]
    ]);
    records.getRange(rowNumber, 1).setNumberFormat("yyyy-mm-dd hh:mm");
    SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }
}

function showSongfengGoogleFormUrl() {
  const id = PropertiesService.getScriptProperties().getProperty("SFG_FORM_ID");
  if (!id) {
    SpreadsheetApp.getUi().alert("尚未建立表單，請先從「松風閣報價」選單建立／更新表單。");
    return;
  }
  const url = FormApp.openById(id).getPublishedUrl();
  SpreadsheetApp.getUi().alert("表單網址：\n" + url);
}
