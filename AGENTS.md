# Personal OS — AI 網頁開發規則

## Modern Web Guidance 1.0
- 官方：https://github.com/GoogleChrome/modern-web-guidance
- Node.js 22+；專案優先採用經驗證的版本，不在正式網站執行開發工具。
- 查閱指引：`DISABLE_TELEMETRY=1 npx --yes modern-web-guidance@1.0.0 search "accessible dialog"`
- 掃描：`DISABLE_TELEMETRY=1 npx --yes modern-web-guidance@1.0.0 legacy-scan public/pages`
- 安裝供本機代理使用：`npx modern-web-guidance@latest install`（互動式，由使用者選擇代理）。
- 採 Baseline、漸進增強與必要備援；掃描僅作參考，不代表安全或無障礙完整驗收。預設關閉工具匿名遙測。
- 新功能優先原生 HTML/CSS/JS：語意、鍵盤、焦點、對比、減少動態效果、相容性、尺寸預留、延遲載圖；不為追求新技術重寫正常功能。

## 井象岩繪具
- 保持產品資料列、原圖及圖1至圖5順序。真實照片／生成展示圖沿用來源，不用其他顏料補缺圖、不任意變色、改構圖或質感。
- 新名＋號數、目數、重量以獨立規格欄為準；保留原名與原始圖連結，未核實文字標示待核對。
- 網頁可增加縮圖、篩選、比較、收藏；不公開成本、庫存或未授權私有資料。不修改分享權限。
- 保留既有靜態入口、相對路徑、資料格式及其他啟動器；收藏明示只在本機。
- 在測試分支驗證後才合併 main；沒有使用者明確同意，不部署 Pages、不更動正式站。
- 驗收：所有資料與圖片連結保留、手機／桌面、鍵盤、搜尋分類粒度、分享連結、比較收藏、缺圖與載入失敗、效能前後對照。
