const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

async function gerarProposta() {
  const htmlPath = '/tmp/claude-0/-home-user-Victor/9a1bdc8a-651a-51d3-9937-3666a5d078ec/scratchpad/proposta-synchub-profissional.html';
  const pdfPath = '/home/user/Victor/apresentacao/Proposta-SyncHub-NebuTech.pdf';
  
  const browser = await chromium.launch({
    headless: true,
    executablePath: '/opt/pw-browsers/chromium'
  });

  try {
    const page = await browser.newPage();
    await page.goto(`file://${htmlPath}`, { waitUntil: 'networkidle' });
    
    await page.pdf({
      path: pdfPath,
      format: 'A4',
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
      printBackground: true
    });

    console.log(`✓ PDF gerado: ${pdfPath}`);
    console.log(`✓ Tamanho: ${(fs.statSync(pdfPath).size / 1024).toFixed(0)} KB`);
    
  } finally {
    await browser.close();
  }
}

gerarProposta().catch(e => {
  console.error('❌ Erro:', e.message);
  process.exit(1);
});
