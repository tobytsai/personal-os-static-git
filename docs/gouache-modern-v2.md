# 膠彩五圖產品網站 v2｜現代化測試

基準：main ef0d3398a90f7205e3458c8dd5c75293049b5fa1；232 商品、1160 圖位、1070 新版縮圖、55 原圖待修、35 圖位缺來源。僅更新 UI、開發規則與獨立測試，不改 JSON、圖片、正式部署 workflow。
已查核官方 Modern Web Guidance 1.0 發行與 CLI。既有網站已採原生 dialog、lazy loading、aspect-ratio；不重複重寫。v2 增加語意標籤、焦點、暗色／減少動態偏好、容器查詢漸進增強、手機原生 scroll snap、收藏、色彩比較、深連結與搜尋。
測試分支 push 觸發獨立只讀 CI：官方 legacy-scan（advisory）＋ Chromium/Firefox/WebKit Playwright。掃描器僅偵測部分規則；通過測試仍需真機及 Lighthouse 前後效能比較。不得以官方評測推估本站實際效能。

## 第二輪（2026-11-27）
第一輪 run 45878727819：MWG 1.0.0 掃描 33 條可自動判斷的指南、0 findings；非完整網站合格證。Playwright 1.56.1 不支援 runner ubuntu26.04-x64，安裝失敗，因此未執行互動測試。固定 ubuntu-24.04，不變更正式部署工作流程；新增資料完整性、鍵盤及返回按鈕驗收。Lighthouse 12.8.2 對固定基準 ef0d3398 和測試版以同一份資料、同一個本地服務比較，手機/桌面各三次，取中位數；輸出效能、無障礙、最佳實務、LCP、FCP、TBT、CLS 和傳輸量。不將本機模擬結果當成真實使用者數據；尚待 CI 結果。
## 第三輪｜2026-11-27
run 45879421685：18/18 Playwright 測試成功，MWG 0 findings/33 guides。Lighthouse 手機 median performance 74→93、CLS .5139→.0871、LCP 2852→3003 ms、FCP 803→961 ms、bytes 1557290→814922；桌面 77→77、CLS .7119→.7121、LCP 601→604 ms、FCP 216→261 ms、bytes 3407020→3419069。兩端 accessibility 100、best practices 96。實驗室數據，非真機/現場 CWV。
待驗假設：共用導覽列 deferred script 動態加 padding、統計及44色組在 fetch 完成時展開，導致版面位移。預先保留導覽、統計和兩條快速篩選區的空間；快選改水平捲動、完整下拉仍可用；先保留統計標籤，資料載入後只更新數字；分頁資料準備完成才顯示；預載同一 JSON。保留全商品、圖位、分類、色組、原始圖片與共享導覽功能。增加延遲資料載入位置測試和跨引擎截圖。再次執行原版 vs 最新測試版各3次 mobile/desktop，確認 CLS 與 LCP，尚未宣稱改善，未合併 main。