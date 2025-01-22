const puppeteer = require('puppeteer');
const axios = require('axios');

// Telegram bot configuration
const botToken = '7851467206:AAHQDtehdzEfndJlCWOFX4ldvhGbr6j6p4Q';
const chatId = '7920332150';

// URLs and their last cargo counts
const urls = [
  {
    url: 'https://geotrans.ro/cargo/search?from=2575&to=136',
    startMessage: 'Moldova → Romania',
    lastCargoCount: 0 // Initialize with 0
  },
  {
    url: 'https://geotrans.ro/cargo/search?from=136&to=2575',
    startMessage: 'Romania → Moldova',
    lastCargoCount: 0 // Initialize with 0
  },
];

// Send a message to Telegram
const sendMessage = async (text) => {
  try {
    console.log('[Info] Sending Telegram message...');
    await axios.post(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
    });
    console.log('[Info] Message sent successfully!');
  } catch (error) {
    console.error('[Error] Failed to send Telegram message:', error.message);
  }
};

// Extract cargo details from a row
const extractCargoDetails = async (el) => {
  try {
    const loadingCity = await el.$eval('.td-city', (city) => city.textContent.trim());
    const unloadingCity = await el.$$eval('.td-city', (cities) => cities[1].textContent.trim());
    const date = await el.$eval('.td-date span', (date) => date.textContent.trim());
    const infoList = await el.$$eval('.td-info', (infos) => infos.map(info => info.textContent.trim()));
    const cargoType = infoList[0] || 'No type available';
    const company = await el.$eval('.td-company', (company) => company.textContent.trim());
    return { loadingCity, unloadingCity, date, cargoType, company };
  } catch {
    return null;
  }
};

// Check cargos for a specific URL
const checkCargoForUrl = async (urlConfig) => {
  const { url, startMessage, lastCargoCount } = urlConfig;

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();

  try {
    console.log(`[Info] Checking cargo for URL: ${url}`);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForSelector('h4.label-items-found', { timeout: 10000 });
    await new Promise(resolve => setTimeout(resolve, 5000)); // Small delay for additional loading

    // Extract and parse the cargo count
    const cargoCountText = await page.$eval('h4.label-items-found', (el) => el.textContent.trim());
    const cargoCountMatch = cargoCountText.match(/OFERTE GĂSITE:\s*(\d+)/); // Extract numeric part using regex
    const cargoCount = cargoCountMatch ? parseInt(cargoCountMatch[1], 10) : NaN;

    if (isNaN(cargoCount)) {
      console.error('[Error] Failed to extract cargo count. Raw text:', cargoCountText);
      return;
    }

    console.log(`[Info] Current cargo count: ${cargoCount}`);
    console.log(`[Info] Last recorded cargo count: ${lastCargoCount}`);

    // Compare with last recorded count in memory
    const cargos = await page.$$('tr.table-line');
    let cargoDetailsMessage = `\n<b>${startMessage}</b>\n\n`;
    const cargoDetailsList = [];
    for (let el of cargos) {
      const cargoDetails = await extractCargoDetails(el);
      if (cargoDetails) cargoDetailsList.push(cargoDetails);
    }

    // Get the last 3 cargos
    const latestCargos = cargoDetailsList.slice(0, 3);

    for (let i = 0; i < latestCargos.length; i++) {
      const cargo = latestCargos[i];
      cargoDetailsMessage += `
<b>${i === 0 ? '🔴 Ultima marfă apărută!' : '------------------------------'}</b>

<b>${cargo.loadingCity} → ${cargo.unloadingCity}</b>
<b>Perioada:</b> ${cargo.date}
<b>Tip marfă:</b> ${cargo.cargoType}
<b>Companie:</b> ${cargo.company}
`;
    }

    const message = `
<b>🔔 Marfă nouă detectată Geotrans!</b>
${cargoDetailsMessage}

<a href="${url}">🔗 Vezi detalii aici</a>
    `.trim();

    if (cargoCount > lastCargoCount) {
      await sendMessage(message);
      urlConfig.lastCargoCount = cargoCount; // Update last count
    } else {
      console.log(`[Info] No new cargos detected for ${url}`);
    }
  } catch (error) {
    console.error(`[Error] Error processing URL: ${url}`, error.message);
  } finally {
    await browser.close();
  }
};

// Check all cargos for all URLs
const checkAllCargos = async () => {
  console.log('[Info] Starting cargo check for all URLs...');
  for (const urlConfig of urls) {
    await checkCargoForUrl(urlConfig);
  }
};

// Run every 40 seconds
setInterval(checkAllCargos, 40000);