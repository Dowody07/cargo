require('dotenv').config();
const puppeteer = require('puppeteer-core');
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
    const unloadingCity = await el.$$eval('.td-city', (cities) => cities[1]?.textContent.trim() || 'N/A');
    const date = await el.$eval('.td-date span', (date) => date.textContent.trim());
    const infoList = await el.$$eval('.td-info', (infos) => infos.map(info => info.textContent.trim()));
    const cargoType = infoList[0] || 'No type available';
    const company = await el.$eval('.td-company', (company) => company.textContent.trim());
    return { loadingCity, unloadingCity, date, cargoType, company };
  } catch {
    return null;
  }
};

const checkCargoForUrl = async (urlConfig) => {
  const { url, startMessage, lastCargoCount } = urlConfig;

  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/google-chrome-stable',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--single-process', '--no-zygote'],
  });

  const page = await browser.newPage();

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 22000 });
    await page.waitForSelector('h4.label-items-found', { timeout: 17000 });

    const cargoCountText = await page.$eval('h4.label-items-found', (el) => el.textContent.trim());
    const cargoCountMatch = cargoCountText.match(/(?:ОФЕРТЫ НАЙДЕНЫ|NAJDENO PREDLOZHENIY|FOUND OFFERS|OFERTE GĂSITE):\s*(\d+)/i);
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
    await browser.close();
  }
};

const checkAllCargos = async () => {
  for (const urlConfig of urls) {
    await checkCargoForUrl(urlConfig);
  }
};

setInterval(checkAllCargos, 45000);