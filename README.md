# 合约模拟器 · Futures Trainer

一个跑在手机上的 **USDⓈ-M 永续合约模拟器**：接真实行情，用模拟资金下单，界面按主流交易所 App 的合约页布局。

用来练手感、验证策略、体验爆仓——**不涉及任何真实资金**。

---

## 特性

**真实行情**
- 直连交易所公开 WebSocket 与 REST，无模拟数据、无随机数
- **按子流健康监测的混合模式**：某条数据流静默时自动降级为 REST 轮询补数，状态栏如实显示当前数据来源，不会在拿不到价格时假装「已连接」

**合约引擎**
- 逐仓 / 全仓、单向 / 双向持仓
- 限价（GTC / IOC / FOK / Post Only）、市价、止盈止损（限价与市价）、追踪委托、只减仓
- 逐档吃单撮合，市价单模拟真实滑点
- **强平价按交易所公式实现**，维持保证金档位表来自币安公开接口（全部 USDⓈ-M 合约，`public/brackets.json`，`node tools/fetch-brackets.mjs` 刷新），含速算额 `cum`
- 资金费按币对实际结算周期计算（4h / 8h 自动识别）
- 手续费区分 maker / taker，按币安 VIP0–VIP9 费率表计算（默认 VIP2，偏好设置可改）

**界面**
- 左下单区 + 右订单簿的双栏合约页
- 订单簿含档位聚合、深度图、最新成交、买卖力量比例条；WebSocket 20 档之外用 REST 500 档深盘补齐，任何聚合档位都给满 6 档
- K 线 13 个周期，MA / EMA / BOLL 主图指标，成交量 / MACD / RSI / KDJ 副图
- 持仓卡片、调整杠杆（含档位表）、逐仓保证金调整、平仓与止盈止损面板

**交易行为分析**
- 每次开仓需选择一个理由标签（计划内 / 追涨 / 抄底 / 回血 / 突发消息 / 无聊手痒）
- 引擎自动识别并标记行为特征：
  - `REVENGE` — 距上一笔亏损平仓 10 分钟内、且仓位放大 1.5 倍以上
  - `OVERSIZE` — 单笔保证金超过权益 20%
  - `HIGH_LEV` — 杠杆超过 20x
  - `CHASE` — 顺着 1 分钟内的急涨急跌方向开仓
- 盈亏分析页按理由与标签分组统计，**结论文案由真实成交数据生成**

**风控闸门**
- 日亏损上限、连续亏损锁定、爆仓冷静期、单笔保证金占比上限、最大杠杆
- 触发后禁止开新仓，**App 内无解锁入口**，配置改动需重启生效
- 平仓、撤单、改止损**永远可用**——只锁开仓，不锁离场

---

## 技术栈

Vite + React 18 + TypeScript + Tailwind CSS + zustand + lightweight-charts，
通过 Capacitor 打包为 Android APK。**无后端，全部计算在端上，数据存本地 IndexedDB。**

---

## 开发

```bash
npm install
npm run dev        # 浏览器调试，手机模式查看
npx vitest run     # 单元测试
npm run build
```

### 打包 Android APK

需要 JDK 21 与 Android SDK（platform 35 / build-tools 35.0.0）。

```bash
npm run build
npx cap sync android
cd android && ./gradlew assembleDebug
```

产物在 `android/app/build/outputs/apk/debug/app-debug.apk`。

首次构建需在 `android/local.properties` 写入本机 SDK 路径（**用正斜杠**，反斜杠会被 Java properties 当作转义吃掉）：

```
sdk.dir=C:/path/to/Android/Sdk
```

---

## 测试

引擎部分的断言值均为手工计算后写入，与实现分离：

```
src/engine/__audit.test.ts    强平价、维持保证金档位、逐档吃单滑点
src/store/depthParse.test.ts  订单簿字段解析（WS 与 REST 字段名不同）
```

---

## 免责声明

- 本项目**与任何交易所无隶属、赞助或背书关系**，仅使用其公开行情接口。
- 仅供学习与模拟练习使用，**不构成任何投资建议**。
- 模拟环境无法复现真实交易中的滑点、深度、延迟与情绪压力，模拟盈亏不代表实盘结果。
- 合约交易风险极高，可能损失全部本金。

## License

MIT
