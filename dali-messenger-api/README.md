# 達利畫廊 Messenger AI 客服

此服務接收達利畫廊 Facebook Page 的 Messenger webhook，依安全規則決定是否交由 OpenAI 回覆。它不儲存客人訊息或 API 金鑰。

## 強制轉人工

含有下列意圖時，服務不會交給 AI 回答：

- 報價、價格、估價、費用
- 交期、何時完成、急件
- 付款、匯款、刷卡、訂金
- 作品保存、保護、修復、褪色、損壞、保固
- 真人／人工客服、投訴或客訴

系統會請客人留下照片、尺寸、作品類型與希望完成日期，對話仍會出現在 Meta Business Suite 收件匣供人工接手。

## 部署至 Vercel

1. 從 GitHub 匯入這個資料夾作為 Vercel 專案的 Root Directory：`dali-messenger-api`。
2. 在 Vercel 設定五個環境變數，名稱請依 `.env.example`，不要在 GitHub 或聊天室貼出實際值。
3. 部署後取得 `https://<project>.vercel.app/api/messenger-webhook`。
4. 在 Meta Developers 建立商業型 App，加入 Messenger，將該網址設定為 Callback URL；Verify Token 要與 Vercel 的 `META_VERIFY_TOKEN` 完全一致。
5. 訂閱 `messages` 與 `messaging_postbacks`，並把達利畫廊粉專連結到 App。
6. 先用 App 管理員帳號測試；要讓一般客戶使用，依 Meta 畫面完成所需的 App Review／上線設定。

## 測試檢核

- 普通提問「店在哪裡？」：AI 應提供地址與電話。
- 「裱框怎麼詢價？」：AI 應只要求照片、尺寸、作品類型與希望完成日期。
- 「這幅畫 80×100 多少錢？」：應固定回覆人工確認訊息，不能給價格。
- 「這週五可完成嗎？」：應固定回覆人工確認訊息，不能承諾交期。
