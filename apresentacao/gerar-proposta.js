const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage({
    viewport: { width: 1024, height: 1024 }
  });

  const htmlPath = '/tmp/claude-0/-home-user-Victor/9a1bdc8a-651a-51d3-9937-3666a5d078ec/scratchpad/proposta-synchub-final.html';
  const pdfPath = '/home/user/Victor/apresentacao/Proposta-SyncHub-NebuTech.pdf';

  await page.goto(`file://${htmlPath}`, { waitUntil: 'networkidle' });

  await page.pdf({
    path: pdfPath,
    format: 'A4',
    margin: { top: 0, right: 0, bottom: 0, left: 0 },
    printBackground: true
  });

  console.log(`✓ Proposta gerada: ${pdfPath}`);
  
  const stats = fs.statSync(pdfPath);
  console.log(`✓ Tamanho: ${(stats.size / 1024).toFixed(1)} KB`);

  await browser.close();
})().catch(e => {
  console.error('Erro:', e.message);
  process.exit(1);
});
