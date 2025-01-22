const puppeteer = require('puppeteer');
const axios = require('axios');
const fs = require('fs');

const botToken = '7851467206:AAHQDtehdzEfndJlCWOFX4ldvhGbr6j6p4Q';
const chatId = '7920332150';

const urls = [
  {
    url: 'https://geotrans.ro/cargo/search?from=2575&to=136',
    lastCargoCountFile: 'lastCargoCount_2575_136.json',
    startMessage: 'Moldova → Romania',
  },
  {
    url: 'https://geotrans.ro/cargo/search?from=136&to=2575',
    lastCargoCountFile: 'lastCargoCount_136_2575.json',
    startMessage: 'Romania → Moldova',
  },
];

// Retrieve the last saved cargo count from a file
const getLastCargoCount = (file) => {
  if (fs.existsSync(file)) {
    try {
      const data = fs.readFileSync(file, 'utf8');
      return data ? JSON.parse(data).cargoCount : null;
    } catch (error) {
      console.error(`[Error] Failed to read last cargo count from ${file}: ${error.message}`);
      return null;
    }
  }
  return null;
};

// Save the current cargo count to a file
const saveCargoCount = (file, cargoCount) => {
  try {
    fs.writeFileSync(file, JSON.stringify({ cargoCount }));
    console.log(`[Info] Updated cargo count saved to ${file}: ${cargoCount}`);
  } catch (error) {
    console.error(`[Error] Failed to save cargo count to ${file}: ${error.message}`);
  }
};

// Extract cargo details from a row
const extractCargoDetails = async (el) => {
  try {
    const loadingCity = await el.$eval('.td-city', (city) => city.textContent.trim());
    const unloadingCity = await el.$$eval('.td-city', (cities) => cities[1].textContent.trim());
    const date = await el.$eval('.td-date span', (date) => date.textContent.trim());
    const infoList = await el.$$eval('.td-info', (infos) => infos.map((info) => info.textContent.trim()));
    const cargoType = infoList[0] || 'No type available';
    const company = await el.$eval('.td-company', (company) => company.textContent.trim());
    return { loadingCity, unloadingCity, date, cargoType, company };
  } catch (error) {
    console.error('[Error] Failed to extract cargo details:', error.message);
    return null;
  }
};

// Send a message to Telegram
const sendMessage = async (text) => {
  try {
    console.log('[Info] Sending new Telegram message...');
    await axios.post(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
    });
    console.log('[Success] Telegram message sent!');
  } catch (error) {
    console.error('[Error] Failed to send Telegram message:', error.message);
  }
};

// Check cargos for a specific URL
const checkCargoForUrl = async ({ url, lastCargoCountFile, startMessage }) => {
  console.log(`\n[Info] Checking cargo for URL: ${url}`);
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });

    await page.waitForSelector('h4.label-items-found', { timeout: 10000 });

    const cargoCountText = await page.$eval('h4.label-items-found', (el) => el.textContent.trim());
    const cargoCount = parseInt(cargoCountText);
    console.log(`[Info] Current cargo count: ${cargoCount}`);

    const lastCargoCount = getLastCargoCount(lastCargoCountFile);
    console.log(`[Info] Last recorded cargo count: ${lastCargoCount}`);

    if (cargoCount && lastCargoCount !== null && cargoCount > lastCargoCount) {
      console.log('[Info] New cargos detected!');
      const cargos = await page.$$('tr.table-line');
      const cargoDetailsList = [];

      for (let el of cargos) {
        const cargoDetails = await extractCargoDetails(el);
        if (cargoDetails) cargoDetailsList.push(cargoDetails);
      }

      const latestCargos = cargoDetailsList.slice(0, cargoCount - lastCargoCount);
      let cargoDetailsMessage = `<b>${startMessage}</b>\n`;
      for (let cargo of latestCargos) {
        cargoDetailsMessage += `
<b>------------------------------</b>
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

      await sendMessage(message);
      saveCargoCount(lastCargoCountFile, cargoCount);
    } else if (lastCargoCount === null) {
      console.log('[Warning] No last cargo count recorded. Saving initial cargo count.');
      saveCargoCount(lastCargoCountFile, cargoCount);
    } else {
      console.log('[Info] No new cargos detected.');
    }
  } catch (error) {
    console.error(`[Error] Failed to process URL ${url}:`, error.message);
  } finally {
    await browser.close();
  }
};

// Check all cargos for all URLs
const checkAllCargos = async () => {
  console.log('\n[Info] Starting cargo check for all URLs...');
  for (const urlConfig of urls) {
    await checkCargoForUrl(urlConfig);
  }
};

// Run every 40 seconds
console.log('[Info] Cargo monitor started...');
setInterval(checkAllCargos, 40000);