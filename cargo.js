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
    await axios.post(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
    });
  } catch (error) {
    console.error('[Error] Failed to send Telegram message:', error.message);
  }
};

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

const checkCargoForUrl = async (urlConfig, browser) => {
  const { url, startMessage, lastCargoCount } = urlConfig;
  const page = await browser.newPage();

  const maxRetries = 3;
  let success = false;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
      success = true;
      break;
    } catch (error) {
      console.warn(`[Retry ${attempt}] Failed to load ${url}:`, error.message);
    }
  }

  if (!success) {
    console.error(`[Error] Unable to load ${url} after ${maxRetries} attempts.`);
    await page.close();
    return;
  }

  try {
    await page.waitForSelector('h4.label-items-found', { timeout: 17000 });
    await new Promise(resolve => setTimeout(resolve, 5000));

    const cargoCountText = await page.$eval('h4.label-items-found', (el) => el.textContent.trim());
    const cargoCountMatch = cargoCountText.match(/(?:OFERTE GĂSITE|FOUND OFFERS):\s*(\d+)/i);
    const cargoCount = cargoCountMatch ? parseInt(cargoCountMatch[1], 10) : NaN;

    if (isNaN(cargoCount)) {
      console.error('[Error] Failed to extract cargo count. Raw text:', cargoCountText);
      return;
    }

    const cargos = await page.$$('tr.table-line');
    let cargoDetailsMessage = `\n<b>${startMessage}</b>\n\n`;
    const cargoDetailsList = [];
    for (let el of cargos) {
      const cargoDetails = await extractCargoDetails(el);
      if (cargoDetails) cargoDetailsList.push(cargoDetails);
    }

    const latestCargos = cargoDetailsList.slice(0, 2);

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
      urlConfig.lastCargoCount = cargoCount;
    }
  } catch (error) {
    console.error(`[Error] Error processing URL: ${url}`, error.message);
  } finally {
    await page.close();
  }
};

const checkAllCargos = async () => {
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium-browser',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--single-process', '--disable-dev-shm-usage', '--disable-gpu'],
  });

  for (const urlConfig of urls) {
    await checkCargoForUrl(urlConfig, browser);
  }

  await browser.close();
};

setInterval(checkAllCargos, 45000);