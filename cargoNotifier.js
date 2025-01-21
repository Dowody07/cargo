const botToken = '7851467206:AAHQDtehdzEfndJlCWOFX4ldvhGbr6j6p4Q';
const chatId = '1246584382';
const puppeteer = require('puppeteer');
const axios = require('axios');
const fs = require('fs');

const url = 'https://geotrans.ro/cargo/search?from=2575&to=136';
const lastCargoCountFile = 'lastCargoCount.json';

const getLastCargoCount = () => {
  if (fs.existsSync(lastCargoCountFile)) {
    try {
      const data = fs.readFileSync(lastCargoCountFile, 'utf8');
      return data ? JSON.parse(data).cargoCount : null;
    } catch (error) {
      console.error('Error reading or parsing lastCargoCount.json, initializing file...');
      return null;
    }
  }
  return null;
};

const saveCargoCount = (cargoCount) => {
  fs.writeFileSync(lastCargoCountFile, JSON.stringify({ cargoCount }));
};

const extractCargoDetails = async (el) => {
  try {
    // Extract the first td.city (loading city)
    const loadingCity = await el.$eval('.td-city', (city) => city.textContent.trim());
    
    // Extract the second td.city (unloading city)
    const unloadingCity = await el.$$eval('.td-city', (cities) => cities[1].textContent.trim());

    const date = await el.$eval('.td-date span', (date) => date.textContent.trim());
    const infoList = await el.$$eval('.td-info', (infos) => infos.map(info => info.textContent.trim()));
    const cargoType = infoList[0] || 'No type available';
    const weightVolume = infoList[1] || 'No weight/volume data';
    const company = await el.$eval('.td-company', (company) => company.textContent.trim());

    return {
      loadingCity,
      unloadingCity,
      date,
      cargoType,
      weightVolume,
      company
    };
  } catch (error) {
    console.error('Error extracting cargo details:', error);
    return null;
  }
};

(async () => {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 10000 });
    await page.waitForSelector('h4.label-items-found', { timeout: 7000 });
    await new Promise(resolve => setTimeout(resolve, 5000));

    const cargoCount = await page.$eval('h4.label-items-found', (el) => el.textContent.trim());
    const lastCargoCount = getLastCargoCount();

    if (cargoCount) {
      console.log(`Number of offers: ${cargoCount}`);
      const cargos = await page.$$('tr.table-line');

      let cargoDetailsMessage = '';
      for (let el of cargos) {
        const cargoDetails = await extractCargoDetails(el);
        if (cargoDetails) {
          cargoDetailsMessage += `
-----------------------------------

${cargoDetails.loadingCity} → ${cargoDetails.unloadingCity}
Perioada: ${cargoDetails.date}
Tip marfă: ${cargoDetails.cargoType}
Companie: ${cargoDetails.company}
          `;
        }
      }

      const messageUrl = `${url}`;

      if (lastCargoCount && lastCargoCount == cargoCount) {
        const message = `Marfă nouă! ${cargoCount}:\n${cargoDetailsMessage}\n${messageUrl}`;
        await axios.post(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          chat_id: chatId,
          text: message,
        });
        console.log('New cargo message sent to Telegram');
      } else if (!lastCargoCount) {
        const message = `Marfă nouă! ${cargoCount}:\n${cargoDetailsMessage}\n${messageUrl}`;
        await axios.post(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          chat_id: chatId,
          text: message,
        });
        console.log('Initial cargo message sent to Telegram');
      }

      saveCargoCount(cargoCount);
    } else {
      console.log('No cargo count found');
    }

  } catch (error) {
    console.error('Error fetching the cargo count:', error);
  } finally {
    await browser.close();
  }
})();