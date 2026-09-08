/**
 * 从币安公开接口拉全部 USDⓈ-M 合约的维持保证金档位表，压成 public/brackets.json（随站点/APK 一起分发，启动时加载）。
 *
 *   node tools/fetch-brackets.mjs
 *   BRACKETS_PROXY=http://127.0.0.1:1080 node tools/fetch-brackets.mjs   # 需要代理时（走 curl -x）
 *
 * 数据源：https://www.binance.com/bapi/futures/v1/friendly/future/common/brackets（无需登录）
 * 字段与 /fapi/v1/leverageBracket 一致：notionalFloor / notionalCap / maintMarginRatio / cum / maxLeverage。
 * 拉取失败时保留旧文件并以非零码退出，调用方（deploy 脚本）自行决定是否继续。
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'public', 'brackets.json');
const SRC = 'https://www.binance.com/bapi/futures/v1/friendly/future/common/brackets';
const proxy = process.env.BRACKETS_PROXY || '';

function download() {
  const args = ['-sS', '--max-time', '60', '-A', 'Mozilla/5.0', '-H', 'accept: application/json'];
  if (proxy) args.push('-x', proxy);
  args.push(SRC);
  return execFileSync('curl', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

function compact(raw) {
  const d = JSON.parse(raw);
  const items = Array.isArray(d.data) ? d.data : d.data?.brackets;
  if (!Array.isArray(items) || items.length < 100) throw new Error('接口返回不像档位表：' + raw.slice(0, 200));
  const symbols = {};
  let latest = 0;
  for (const it of items) {
    const sym = String(it.symbol || '');
    if (!/USD[TC]$/.test(sym)) continue; // 只要 USDⓈ-M（USDT / USDC 计价）
    const rows = (it.riskBrackets || [])
      .map((b) => [
        Number(b.bracketNotionalFloor),
        Number(b.bracketNotionalCap),
        Number(b.bracketMaintenanceMarginRate),
        Number(b.cumFastMaintenanceAmount),
        Number(b.maxOpenPosLeverage),
      ])
      .filter((r) => r.every((x) => Number.isFinite(x)))
      .sort((a, b) => a[0] - b[0]);
    if (rows.length === 0) continue;
    // 速算额递推校验：cum_i = cum_{i-1} + floor_i × (MMR_i − MMR_{i-1})，差 1 USDT 以上视为脏数据
    for (let i = 1; i < rows.length; i++) {
      const exp = rows[i - 1][3] + rows[i][0] * (rows[i][2] - rows[i - 1][2]);
      if (Math.abs(exp - rows[i][3]) > 1) throw new Error(`${sym} 第 ${i} 档 cum 不自洽：${rows[i][3]} vs ${exp}`);
    }
    symbols[sym] = rows;
    latest = Math.max(latest, Number(it.updateTime) || 0);
  }
  return {
    source: SRC,
    generatedAt: new Date().toISOString(),
    binanceUpdatedAt: latest ? new Date(latest).toISOString() : null,
    count: Object.keys(symbols).length,
    symbols,
  };
}

try {
  const data = compact(download());
  mkdirSync(path.dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(data));
  console.log(`brackets.json：${data.count} 个合约，${(readFileSync(OUT).length / 1024).toFixed(0)} KB，币安更新于 ${data.binanceUpdatedAt}`);
} catch (e) {
  console.error('拉取档位表失败：' + (e.message || e).toString().split('\n')[0]);
  console.error(existsSync(OUT) ? '保留现有 public/brackets.json' : '当前没有 public/brackets.json，应用将只用内置表');
  process.exit(1);
}
