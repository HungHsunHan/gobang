# 藏陣 · 五子棋

**[開始下棋](https://gobang.b04605078123.workers.dev/)**。可以在同一台手機、平板或電腦輪流下，也可以和電腦對弈。

## 玩法

### 盲五子棋

在 15×15 棋盤輪流落子。落下的棋子會蓋面，只有最新一手會標記小菱形。記住兩方的落點，先在橫、直或斜線上連成五子以上的一方獲勝。終局會揭開棋色。

### 競價五子棋

在 11×11 棋盤輪流選出同一直線上三個連續空點。雙方每輪各獲得 10 點，私下為三點分配點數，每格至少 1 點。未用完的點數折半後無條件捨去，帶到下一輪。三點同時結算，出價較高者落子。同價時，未選點的一方取得該點。同機雙人會用換手畫面保護各自的出價。

每條五子以上的連線計一次。若雙方同一輪都連線，由新連線較多的一方獲勝。新連線數相同，或棋盤上已沒有三個連續空位時，結為和局。

這個模式取材自《魔鬼的計謀》第三季第 13 集流配賽的得分五子棋，使用自訂棋盤、終局規則及不限時的回合。盲五子棋的蓋牌靈感來自第一季的盲棋挑戰。 [第三季賽制整理](https://bubuu.com.tw/film-tv/watching/devilsplan-3-winner/) [第一季玩法](https://www.dexerto.com/tv-movies/the-devils-plan-games-explained-2310672/)

鍵盤可按 Tab 進入棋盤，用方向鍵移動，按 Enter 或空白鍵下棋或選點。

## 本機與家庭 Wi-Fi

安裝 Node.js 22 以上。在本機執行 `npm start` 後，開啟 `http://127.0.0.1:8788/`。若想讓同一個家庭網路的裝置開啟遊戲，執行 `npm run start:lan` 並分享終端機顯示的網址。同機雙人仍在同一個瀏覽器輪流操作。

LAN 模式只綁定此電腦的私有 IPv4 位址，並接受同一子網路的連線。若 Wi-Fi 位址無法自動判定，可用 `npm run start:lan -- --host 192.168.1.20` 指定本機實際的 Wi-Fi 位址。兩種啟動方式都可加上 `--port` 參數。

執行 `npm test` 可測試規則、電腦決策、本機服務與靜態部署設定。

## Cloudflare 部署

採用 Cloudflare Workers 靜態資源，直接提供 `public/`。Wrangler 設定中的 Worker 名稱為 `gobang`。 [靜態資源說明](https://developers.cloudflare.com/workers/static-assets/)

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
