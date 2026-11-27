# 藏陣 · 五子棋

**[開始下棋](https://gobang.zangzhen-games.workers.dev/)**。支援房間代碼連線、同機雙人和電腦對弈。

## 兩支手機連線對戰

1. 兩支手機都開啟遊戲網址。使用正式網址時，兩人可以在不同網路上玩。
2. 第一位玩家選擇「盲五子棋」或「競價五子棋」，在棋盤上方的「對局設定」點「連線對戰」和「建立房間」，把四碼房間代碼傳給朋友。代碼由數字組成，可以重複，也可以從 0 開頭。
3. 第二位玩家在「對局設定」點「連線對戰」，輸入房間代碼後點「加入房間」。建立者執深色，加入者執淺色。

競價時，兩人各自在自己的手機分配點數，雙方都送出後才會結算。對局結束後，兩人都點「再玩一局」就能在原房間開新局。

重新整理原分頁會接回棋局。房間在最後一次建立、加入或對局操作的 24 小時後到期。

## 玩法

### 盲五子棋

在 15×15 棋盤輪流落子。落下的棋子會蓋面，只有最新一手會標記小菱形。記住兩方的落點，先在橫、直或斜線上連成五子以上的一方獲勝。終局會揭開棋色。

### 競價五子棋

在 15×15 棋盤輪流選出同一直線上三個連續空點。雙方每輪各獲得 10 點，私下為三點分配點數。

看著棋盤上的三個標號，用競價區每格的「−」和「＋」調整出價。每格至少 1 點，總額須在可用點數內。分配完後點「送出競價」。同機雙人會用換手畫面保護各自的出價。

未用完的點數折半後無條件捨去，帶到下一輪。三點同時結算，出價較高者落子。同價時，未選點的一方取得該點。

每條五子以上的連線計一次。若雙方同一輪都連線，由新連線較多的一方獲勝。新連線數相同，或棋盤上已沒有三個連續空位時，結為和局。

這個模式取材自《魔鬼的計謀》第三季第 13 集流配賽的得分五子棋，使用自訂終局規則及不限時的回合。盲五子棋的蓋牌靈感來自第一季的盲棋挑戰。 [第三季賽制整理](https://bubuu.com.tw/film-tv/watching/devilsplan-3-winner/) [第一季玩法](https://www.dexerto.com/tv-movies/the-devils-plan-games-explained-2310672/)

鍵盤可按 Tab 進入棋盤，用方向鍵移動，按 Enter 或空白鍵下棋或選點。

## 本機與家庭 Wi-Fi

安裝 Node.js 22 以上。在本機執行 `npm start` 後，開啟 `http://127.0.0.1:8788/`。若想在同一個家庭網路用兩支手機對戰，執行 `npm run start:lan`，兩支手機都開啟終端機顯示的網址，再依上述步驟建立及加入房間。本機房間會隨伺服器停止而清除。

LAN 模式只綁定此電腦的私有 IPv4 位址，並接受同一子網路的連線。若 Wi-Fi 位址無法自動判定，可用 `npm run start:lan -- --host 192.168.1.20` 指定本機實際的 Wi-Fi 位址。兩種啟動方式都可加上 `--port` 參數。

執行 `npm test` 可測試規則、電腦決策、本機服務、連線對戰與部署設定。

## Cloudflare 部署

`gobang` Worker 提供 `public/` 的靜態資源，房間 API 使用 SQLite 型 Durable Object 儲存棋局。Wrangler 會在部署時建立房間用的 Durable Object 類別。 [靜態資源說明](https://developers.cloudflare.com/workers/static-assets/) [Durable Objects 說明](https://developers.cloudflare.com/durable-objects/)

### Workers Builds

從 Worker 的「Settings → Builds」連接 GitHub 專案，使用下列設定。 [Workers Builds 設定說明](https://developers.cloudflare.com/workers/ci-cd/builds/)

| 設定 | 值 |
| --- | --- |
| 正式分支 | `main` |
| 根目錄 | `/` |
| Build command | `npm test` |
| Deploy command | `npm exec --yes --package=wrangler@4.166.0 -- wrangler deploy` |
| 預覽建置 | 關閉 |

### 手動部署

具備部署權限的 Cloudflare 帳戶可透過 Wrangler 發布。同時可在 Worker 的 Deployments 查看實際發布版本。

```sh
npm exec --yes --package=wrangler@4.166.0 -- wrangler login --scopes account:read user:read workers:write workers_scripts:write
npm test
npm exec --yes --package=wrangler@4.166.0 -- wrangler deploy
```
