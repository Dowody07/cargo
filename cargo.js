const puppeteer = require('puppeteer');
const axios = require('axios');

const botToken = '7851467206:AAHQDtehdzEfndJlCWOFX4ldvhGbr6j6p4Q';
const chatId = '7920332150';

const urls = [
  {
    url: 'https://geotrans.ro/cargo/search?from=2575&to=136',
    startMessage: 'Moldova → Romania',
    lastCargoCount: 0
  },
  {
    url: 'https://geotrans.ro/cargo/search?from=136&to=2575',
    startMessage: 'Romania → Moldova',
    lastCargoCount: 0
  },
];

const sendMessage = async (text) => {
  try {
    console.log('[Info] Sending Telegram notification');
    await axios.post(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
    });
    console.log('[Success] Telegram message sent successfully');
  } catch (error) {
    console.error('[Error] Telegram API Error:', error.message);
  }
};

const extractCargoDetails = async (el) => {
  try {
    console.log('[Debug] Extracting cargo details from element');
    const loadingCity = await el.$eval('.td-city', (city) => city.textContent.trim());
    const unloadingCity = await el.$$eval('.td-city', (cities) => cities[1].textContent.trim());
    const date = await el.$eval('.td-date span', (date) => date.textContent.trim());
    const infoList = await el.$$eval('.td-info', (infos) => infos.map(info => info.textContent.trim()));
    const cargoType = infoList[0] || 'Necunoscut';
    const company = await el.$eval('.td-company', (company) => company.textContent.trim());
    return { loadingCity, unloadingCity, date, cargoType, company };
  } catch (error) {
    console.error('[Error] Extraction Error:', error.message);
    return null;
  }
};

const checkCargoForUrl = async (urlConfig) => {
  const { url, startMessage, lastCargoCount } = urlConfig;
  let browser;
  console.log(`\n[Status] Starting check for: ${startMessage}`);

  try {
    console.log('[Init] Launching browser');
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const page = await browser.newPage();
    await page.setDefaultNavigationTimeout(60000);

    console.log(`[Nav] Navigating to ${url}`);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    
    console.log('[Wait] Waiting for page elements');
    await page.waitForSelector('h4.label-items-found', { timeout: 30000 });
    await page.waitForSelector('tr.table-line', { timeout: 30000 });
    await new Promise(resolve => setTimeout(resolve, 5000));

    const cargoCountText = await page.$eval('h4.label-items-found', (el) => el.textContent.trim());
    const cargoCountMatch = cargoCountText.match(/(?:OFERTE GĂSITE|FOUND OFFERS):\s*(\d+)/i);
    const cargoCount = cargoCountMatch ? parseInt(cargoCountMatch[1], 10) : NaN;

    if (isNaN(cargoCount)) {
      console.error('[Error] Invalid cargo count:', cargoCountText);
      return;
    }

    console.log(`[Data] Current cargo count: ${cargoCount} | Previous: ${lastCargoCount}`);
    const cargos = await page.$$('tr.table-line');
    let cargoDetailsMessage = `\n<b>${startMessage}</b>\n`;
    cargoDetailsMessage += `<b>Total marfă disponibilă:</b> ${cargoCount}\n\n`;

    console.log('[Process] Extracting latest cargo details');
    const cargoDetailsList = [];
    for (let el of cargos) {
      const cargoDetails = await extractCargoDetails(el);
      if (cargoDetails) cargoDetailsList.push(cargoDetails);
    }

    const latestCargos = cargoDetailsList.slice(0, 2);
    console.log(`[Data] Found ${cargoDetailsList.length} valid cargo entries`);

    latestCargos.forEach((cargo, index) => {
      cargoDetailsMessage += `
${index === 0 ? '🔴 <b>Ultima marfă apărută!</b>' : '------------------------------'}
<b>Traseu:</b> ${cargo.loadingCity} → ${cargo.unloadingCity}
<b>Perioadă:</b> ${cargo.date}
<b>Tip marfă:</b> ${cargo.cargoType}
<b>Furnizor:</b> ${cargo.company}\n
`;
    });

    const message = `
<b>📦 Situație marfă Geotrans (${startMessage})</b>
${cargoDetailsMessage}
<a href="${url}">🔍 Vezi toate ofertele</a>
    `.trim();

    if (cargoCount > lastCargoCount) {
      console.log(`[Alert] New cargo detected! Sending notification (Δ${cargoCount - lastCargoCount})`);
      await sendMessage(message);
      urlConfig.lastCargoCount = cargoCount;
    } else {
      console.log('[Info] No new cargo since last check');
    }
  } catch (error) {
    console.error(`[Critical] Processing Error (${startMessage}):`, error.message);
  } finally {
    if (browser) {
      try {
        console.log('[Cleanup] Closing browser instance');
        await browser.close();
      } catch (error) {
        console.error('[Error] Browser Close Error:', error.message);
      }
    }
  }
};

const checkAllCargos = async () => {
  console.log('\n=== Starting Cargo Check Cycle ===');
  try {
    for (const urlConfig of urls) {
      await checkCargoForUrl(urlConfig);
    }
    console.log('=== Completed Check Cycle ===\n');
  } catch (error) {
    console.error('[Critical] Main Loop Error:', error.message);
  }
};

// Initial execution
console.log('🚚 Starting Cargo Monitoring Service');
checkAllCargos();

// Setup interval with enhanced error handling
const intervalTime = 60000;
console.log(`⏰ Setting up ${intervalTime/1000} second check interval`);
setInterval(() => {
  console.log('\n🔃 Scheduled Check Triggered');
  checkAllCargos()
    .catch(error => console.error('[Critical] Interval Error:', error.message));
}, intervalTime);

// Global error handlers
process.on('uncaughtException', (error) => {
  console.error('🚨 Uncaught Exception:', error.message);
  console.error(error.stack);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('🚨 Unhandled Rejection at:', promise);
  console.error('Reason:', reason);
});