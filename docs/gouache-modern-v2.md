# 膠彩五圖產品網站 v2｜現代化測試

基準：main ef0d3398a90f7205e3458c8dd5c75293049b5fa1；232 商品、1160 圖位、1070 新版縮圖、55 原圖待修、35 圖位缺來源。僅更新 UI、開發規則與獨立測試，不改 JSON、圖片、正式部署 workflow。
已查核官方 Modern Web Guidance 1.0 發行與 CLI。既有網站已採原生 dialog、lazy loading、aspect-ratio；不重複重寫。v2 增加語意標籤、焦點、暗色／減少動態偏好、容器查詢漸進增強、手機原生 scroll snap、收藏、色彩比較、深連結與搜尋。
測試分支 push 觸發獨立只讀 CI：官方 legacy-scan（advisory）＋ Chromium/Firefox/WebKit Playwright。掃描器僅偵測部分規則；通過測試仍需真機及 Lighthouse 前後效能比較。不得以官方評測推估本站實際效能。

## 第二輪（2026-11-27）
第一輪 run 45878727819：MWG 1.0.0 掃描 33 條可自動判斷的指南、0 findings；非完整網站合格證。Playwright 1.56.1 不支援 runner ubuntu26.04-x64，安裝失敗，因此未執行互動測試。固定 ubuntu-24.04，不變更正式部署工作流程；新增資料完整性、鍵盤及返回按鈕驗收。Lighthouse 12.8.2 對固定基準 ef0d3398 和測試版以同一份資料、同一個本地服務比較，手機/桌面各三次，取中位數；輸出效能、無障礙、最佳實務、LCP、FCP、TBT、CLS 和傳輸量。不將本機模擬結果當成真實使用者數據；尚待 CI 結果。