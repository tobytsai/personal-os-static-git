# Personal OS LINE 通知｜蝦皮降價＋額緣高橋新品

使用現有 LINE Messaging API 帳號與 GitHub Actions Secrets：
- LINE_CHANNEL_ACCESS_TOKEN
- LINE_TO_USER_ID

**無須另外建立 LINE Token、Webhook 或新的排程任務。** 此整合**不會直接自動登入 Shopee 或抓取個人訂單**。既有 ChatGPT 追蹤任務仍負責官方／蝦皮商品的來源核實，並將核實結果寫入原有 GitHub 資料檔。LINE 只負責從**已完成寫入的核實結果**讀取有變化的事件。

## 來源與原有排程（保持不變）

| 任務 | 原始資料 | 排程 |
| --- | --- | --- |
| 蝦皮購買清單降價追蹤 | public/data/shopee-order-history-20261102.js + public/data/shopee-price-watch-state.json | 每日約 09:00 台灣時間 |
| 額緣高橋｜每週新品同步 | public/data/gakubuti-weekly.js + Google Sheet「額緣高橋｜每週新品追蹤（2026-11 起）」 | 每週一 08:00 台灣時間 |

GitHub LINE 橋接工作流程：.github/workflows/line-watch-bridges.yml

- 新增 GitHub 來源狀態檔時，若由一般 GitHub App／使用者提交而能觸發 push，會盡快檢查。
- 如果提交來自 GITHUB_TOKEN 而不會觸發後續 Actions，則於台灣時間每天 10:15 與 20:15 補查。GitHub schedule 可能延遲。
- 可在 Actions 以 workflow_dispatch 手動檢查，但**沒有新異動就絕不推播**。
- 同一個 LINE 通知中心也繼續處理原有 GitHub 工作流程失敗警示。

## 通知必要條件

### 蝦皮
- 原商品需屬於已完成、未退款、歷史標示價 > 0 的同規格商品。
- 原自動化已核實本次價格、規格、店家、蝦皮商品連結與有貨資訊，並寫入 last_notified。
- 新標價須嚴格低於「歷史商品標示價」，且比本 LINE 橋接先前通知過的有效價更低。
- 新報價驗證時間在 7 日以內，且商品 URL 中 shopid、itemid 與監測記錄一致。
- LINE 內容包含品名、規格、歷史標示價、目前標示價、差額／降幅、賣家、商品連結。
- **LINE 明確聲明：「低於歷史商品標價，尚未證實低於當時實付價；運費、優惠券及結帳價未核實」。** 不推測券後價、不能把整張訂單總額當成商品實付。

### 額緣高橋
- 原每週自動化只把官網明確標示「新商品」且已完成核對／建卡的項目加入 weeklyNew。
- LINE 橋接只接受 https://www.gakubuti.net/news/<數字> 的**單則官方公告**，且日文品名、中文品名、公告日完整。
- 商品頁若提供，必須指向原廠產品路徑。促銷、一般新聞首頁或修改舊商品卡片不會發通知。
- 同一公告網址或同一公告日期＋日文品名只提醒一次。
- LINE 包含原廠新聞連結、商品連結及啟動器入口。

**橋接不自行驗證「新商品」的文章是否屬實；沿用已被要求先核實的上游追蹤任務。** 如果上游沒有安全發布資料，即使 ChatGPT 任務曾產生文字摘要，也不會發 LINE，以避免沒有證據的通知。

## 去重與安全

.github/line-watch-ledger.json 追蹤已發送事件（**不是用戶訂單或存取權杖**）。

建置時已將 2026-11-02 既有 3 筆蝦皮歷史標示價降價紀錄，以及額緣高橋 3 筆歷史基準商品建立為「已知狀態」，以免部署瞬間重發。沒有符合條件的異動就不寫資料檔，也不呼叫 LINE。

成功送出 LINE 後使用 scripts/git-safe-push.sh 安全提交去重記錄，不使用強制推送。

> 此流程具有可重試的去重功能，但無法保證嚴格 exactly-once；如 LINE API 接受訊息後 GitHub 去重紀錄寫入失敗，下一次補查可能重送，需查看失敗執行日誌。未核實的價格或新品會寧可不通知，也不錯報。

## 測試與診斷

- PR 的 pull_request 檢查會跑 Python 語法、unittest 與 --dry-run。**此測試不發訊息**。
- 合併後在 GitHub Actions 執行「Personal OS LINE watch bridges」的 workflow_dispatch。
- 若沒有新增的降價或新品，日誌顯示 "New eligible LINE notifications: Shopee=0 Gakubuti=0"、"No LINE push"；這代表符合「無異動不通知」。
- 真正新增且完成核實才會收到 LINE，並更新 .github/line-watch-ledger.json。
- 避免在公開 Repo、Issues、ChatGPT 訊息或截圖裡貼 LINE Token。
