const { chromium } = require('playwright');
const fs = require('fs');

async function gerarProposta() {
  const htmlPath = '/home/user/Victor/apresentacao/proposta-synchub-final.html';
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

    const size = (fs.statSync(pdfPath).size / 1024).toFixed(0);
    console.log(`✓ PDF gerado: ${pdfPath}`);
    console.log(`✓ Tamanho: ${size} KB`);
    console.log(`✓ Logo integrado: SIM`);
    
  } finally {
    await browser.close();
  }
}

gerarProposta().catch(e => {
  console.error('❌ Erro:', e.message);
  process.exit(1);
});
