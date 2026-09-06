// 把 assets/icon.svg 渲染成主屏图标 assets/icon-180.png（iOS 只认 PNG）
// 用法：NODE_PATH=$(npm root -g) node tools/make-icon.js   （需要 playwright）
const path = require('path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 180, height: 180 }, deviceScaleFactor: 1 });
  await page.goto('file://' + path.join(root, 'assets', 'icon.svg'));
  await page.screenshot({ path: path.join(root, 'assets', 'icon-180.png'), clip: { x: 0, y: 0, width: 180, height: 180 } });
  await browser.close();
  console.log('assets/icon-180.png 已生成');
})().catch(e => { console.error(e); process.exit(1); });
