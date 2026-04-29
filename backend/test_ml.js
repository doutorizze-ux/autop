const axios = require('axios');
const cheerio = require('cheerio');

async function searchML(query) {
    try {
        const url = `https://lista.mercadolivre.com.br/veiculos/pecas/carros/${encodeURIComponent(query)}`;
        const { data } = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36'
            }
        });
        
        const $ = cheerio.load(data);
        const results = [];
        
        $('.ui-search-result__wrapper').each((i, el) => {
            if (i >= 5) return;
            const title = $(el).find('.ui-search-item__title').text().trim();
            const price = $(el).find('.ui-search-price__second-line .andes-money-amount__fraction').first().text().trim();
            const link = $(el).find('a.ui-search-item__group__element').attr('href');
            if (title && price) {
                results.push({ title, price: parseFloat(price.replace('.', '')), link });
            }
        });
        
        console.log(JSON.stringify(results, null, 2));
    } catch (e) {
        console.error("Error:", e.message);
    }
}

searchML(process.argv[2] || "pastilha de freio hilux");
