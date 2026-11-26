# 膠彩五圖產品網站 v2｜現代化測試

基準：main ef0d3398a90f7205e3458c8dd5c75293049b5fa1；232 商品、1160 圖位、1070 新版縮圖、55 原圖待修、35 圖位缺來源。僅更新 UI、開發規則與獨立測試，不改 JSON、圖片、正式部署 workflow。
已查核官方 Modern Web Guidance 1.0 發行與 CLI。既有網站已採原生 dialog、lazy loading、aspect-ratio；不重複重寫。v2 增加語意標籤、焦點、暗色／減少動態偏好、容器查詢漸進增強、手機原生 scroll snap、收藏、色彩比較、深連結與搜尋。
測試分支 push 觸發獨立只讀 CI：官方 legacy-scan（advisory）＋ Chromium/Firefox/WebKit Playwright。掃描器僅偵測部分規則；通過測試仍需真機及 Lighthouse 前後效能比較。不得以官方評測推估本站實際效能。
