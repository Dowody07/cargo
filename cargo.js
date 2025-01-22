const puppeteer = require('puppeteer');
const axios = require('axios');
const fs = require('fs');

const botToken = '7851467206:AAHQDtehdzEfndJlCWOFX4ldvhGbr6j6p4Q';
const chatId = '7920332150';

const urls = [
  { 
    url: 'https://geotrans.ro/cargo/search?from=2575&to=136', 
    lastCargoCountFile: 'lastCargoCount_2575_136.json',
    startMessage: 'Moldova → Romania'
  },
  { 
    url: 'https://geotrans.ro/cargo/search?from=136&to=2575', 
    lastCargoCountFile: 'lastCargoCount_136_2575.json',
    startMessage: 'Romania → Moldova'
  },
];

// Retrieve the last saved cargo count from a file
const getLastCargoCount = (file) => {
  if (fs.existsSync(file)) {
    try {
      const data = fs.readFileSync(file, 'utf8');
      return data ? JSON.parse(data).cargoCount : null;
    } catch {
      return null;
    }
  }
  return null;
};

// Save the current cargo count to a file
const saveCargoCount = (file, cargoCount) => {
  fs.writeFileSync(file, JSON.stringify({ cargoCount }));
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

// Send a message to Telegram
const sendMessage = async (text) => {
  try {
    console.log('[Info] Sending new message...');
    await axios.post(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
    });
  } catch (error) {
    console.error('[Error] Failed to send message:', error.message);
  }
};

// Check cargos for a specific URL
const checkCargoForUrl = async ({ url, lastCargoCountFile, startMessage }) => {
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

    const lastCargoCount = getLastCargoCount(lastCargoCountFile);
    console.log(`[Info] Current cargo count: ${cargoCount}`);
    console.log(`[Info] Last recorded cargo count: ${lastCargoCount}`);

    if (cargoCount && lastCargoCount !== null && cargoCount > lastCargoCount) {
      const cargos = await page.$$('tr.table-line');
      let cargoDetailsMessage = `
<b>${startMessage}</b>
`;
      const cargoDetailsList = [];
      for (let el of cargos) {
        const cargoDetails = await extractCargoDetails(el);
        if (cargoDetails) cargoDetailsList.push(cargoDetails);
      }
      const latestCargos = cargoDetailsList.slice(0, cargoCount - lastCargoCount);

      for (let i = 0; i < latestCargos.length; i++) {
        const cargo = latestCargos[i];
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