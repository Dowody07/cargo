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
  
      const cargoCount = await page.$eval('h4.label-items-found', (el) => parseInt(el.textContent.trim(), 10));
      const lastCargoCount = getLastCargoCount(lastCargoCountFile);
  
      if (cargoCount && cargoCount > lastCargoCount) {
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
      } else if (cargoCount) {
        console.log(`No new cargos for ${url}. The cargo count remains the same or decreased: ${cargoCount}`);
      }
    } catch {
      console.log(`Error processing URL: ${url}`);
    } finally {
      await browser.close();
    }
  };