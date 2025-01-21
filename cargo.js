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

const saveCargoCount = (file, cargoCount) => {
  fs.writeFileSync(file, JSON.stringify({ cargoCount }));
};

// Function to extract cargo details
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

// Function to send a message to Telegram
const sendMessage = async (text) => {
  try {
    console.log('Sending new message...');
    await axios.post(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
    });
  } catch {
    console.log('Error sending message');
  }
};

// Function to check cargo details for each URL
const checkCargoForUrl = async ({ url, lastCargoCountFile, startMessage }) => {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();
  try {
    console.log(`Checking cargo for URL: ${url}`);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForSelector('h4.label-items-found', { timeout: 10000 });
    await new Promise(resolve => setTimeout(resolve, 5000));

    const cargoCount = await page.$eval('h4.label-items-found', (el) => el.textContent.trim());
    const lastCargoCount = getLastCargoCount(lastCargoCountFile);

    if (cargoCount && cargoCount === lastCargoCount) {
      // Log to the console that the cargo count remains the same
      console.log(`No new cargos for ${url}. The cargo count remains the same: ${cargoCount}`);

      // Send a message saying the cargo count is the same
      const message = `
<b>🔔 Nu sunt noi oferte!</b>
<b>Numărul de oferte rămâne același:</b> ${cargoCount}

<a href="${url}">🔗 Vezi detalii aici</a>
      `.trim();
      await sendMessage(message);
    } else if (cargoCount) {
      const cargos = await page.$$('tr.table-line');
      let cargoDetailsMessage = `
<b>${startMessage}</b>
`; // Declare once here
      const cargoDetailsList = [];
      for (let el of cargos) {
        const cargoDetails = await extractCargoDetails(el);
        if (cargoDetails) cargoDetailsList.push(cargoDetails);
      }
      const latestCargos = cargoDetailsList.slice(0, 3);

      // Mark the first cargo as the latest (top of the list)
      for (let i = 0; i < latestCargos.length; i++) {
        const cargo = latestCargos[i];
        if (i === 0) {
          cargoDetailsMessage += `
<b>------------------------------</b>

<b>🔴 <i>Ultima marfă apărută!</i></b> 

<b>${cargo.loadingCity} → ${cargo.unloadingCity}</b>
<b>Perioada:</b> ${cargo.date}
<b>Tip marfă:</b> ${cargo.cargoType}
<b>Companie:</b> ${cargo.company}
          `;
        } else {
          cargoDetailsMessage += `
<b>------------------------------</b>

<b>${cargo.loadingCity} → ${cargo.unloadingCity}</b>
<b>Perioada:</b> ${cargo.date}
<b>Tip marfă:</b> ${cargo.cargoType}
<b>Companie:</b> ${cargo.company}
          `;
        }
      }

      const message = `
<b>🔔 Marfă nouă detectată Geotrans!</b>
${cargoDetailsMessage}

<a href="${url}">🔗 Vezi detalii aici</a>
      `.trim();
      await sendMessage(message);
      saveCargoCount(lastCargoCountFile, cargoCount);
    }
  } catch {
    console.log(`Error processing URL: ${url}`);
  } finally {
    await browser.close();
  }
};

// Function to check all cargos from all URLs
const checkAllCargos = async () => {
  console.log('Checking all cargos...');
  for (const urlConfig of urls) {
    await checkCargoForUrl(urlConfig);
  }
};

// Run every 40 seconds
setInterval(checkAllCargos, 40000);