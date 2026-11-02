# Personal OS LINE 通知中心

將此 repository 的重要 GitHub Actions 失敗警示及手動測試訊息送到自己的 LINE。使用 LINE 官方 Messaging API（Push message），不使用已停用的 LINE Notify，也不需要 Webhook。

## 1. LINE 官方帳號

1. 在 https://entry.line.biz/ 建立 LINE 官方帳號，名稱可設「Personal OS 通知中心」。
2. 在 https://manager.line.biz/ 選擇該帳號，進入「設定 → Messaging API → 使用 Messaging API」，建立/選擇 Personal OS provider。
3. 在 https://developers.line.biz/console/ 選擇 provider 和 Messaging API channel。
4. 在 Messaging API 分頁發行 Channel access token（保管好，**不要上傳到 repository**）。
5. 在 Basic settings 分頁找到 **Your user ID**，形如 `U` 加 32 個十六進位字元。若看不到，先把 Business ID 連結到自己的 LINE。
6. 使用該 Channel 的 QR code，從自己的 LINE 加入官方帳號為好友。

Push-only 不需要設定 Webhook URL；LINE User ID 不是一般的 LINE 搜尋 ID，也不是 Channel ID。

## 2. GitHub repository Secrets

GitHub → 此倉庫 → Settings → Secrets and variables → Actions → New repository secret：

| 名稱 | 值 |
| --- | --- |
| `LINE_CHANNEL_ACCESS_TOKEN` | LINE Messaging API Channel access token |
| `LINE_TO_USER_ID` | LINE Developers 的 Your user ID |

這兩個值只能透過 GitHub Secrets 儲存，**不可放在程式碼、GitHub Issues、PR 或 ChatGPT 訊息中**。

## 3. 第一次測試

合併安裝通知的 PR 後，前往 GitHub → Actions → **Personal OS LINE notifications** → **Run workflow**（main）。
* 輸入測試文字或使用預設文字。
* 成功時可從手機 LINE 收到一則測試通知。
* 如果 Workflow 失敗，打開執行日誌，核對 GitHub Secrets、Channel access token、Your user ID、是否已加入官方帳號好友，以及 LINE 訊息額度。

測試工作流程是手動觸發；不會每天發送沒有變化的訊息。

## 4. 自動警示

中央工作流程會監聽指定的 GitHub Actions 主流程：
* GitHub Pages 部署
* Daily trend radar
* Taiwan YouTube popular daily
* 股票收盤更新
* 四年級 IXL 資料更新

僅當以上流程在 `main` 分支失敗時發 LINE；成功時不通知，也不會自動讀取私人資料。

## 5. 日後整合「有更新才通知」

現有的其他 GitHub Actions 可以在 **已驗證內容改變** 的步驟後，再加入以下步驟：

```yaml
- name: Notify LINE only for real changes
  if: steps.changed.outputs.has_changes == 'true'
  env:
    LINE_CHANNEL_ACCESS_TOKEN: ${{ secrets.LINE_CHANNEL_ACCESS_TOKEN }}
    LINE_TO_USER_ID: ${{ secrets.LINE_TO_USER_ID }}
    LINE_MESSAGE: |-
      🔔 Personal OS｜追蹤內容有更新
      內容：請在這裡替換成真實異動摘要及原始網址
  run: python3 scripts/send_line_notification.py
```

`steps.changed.outputs.has_changes` **只是示意**：必須先在來源工作流程中實際新增「判斷變化」步驟，否則不可直接複製使用。手動測試走 `workflow_dispatch`；變化通知走 `LINE_MESSAGE`。

ChatGPT 自身的排程通知不會因為這個 GitHub 變更而自動同步到 LINE。需要另外建立通知郵件或其他可驗證事件來源的橋接流程。

官方參考：
- https://developers.line.biz/en/docs/messaging-api/getting-started/
- https://developers.line.biz/en/docs/messaging-api/getting-user-ids/
- https://developers.line.biz/en/docs/messaging-api/sending-messages/
- https://docs.github.com/en/actions/security-for-github-actions/security-guides/using-secrets-in-github-actions
