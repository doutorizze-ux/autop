import { ScraperService } from './src/services/scraper.service';

async function test() {
    const res = await ScraperService.searchMultipleProducts(['amortecedor']);
    console.log(JSON.stringify(res, null, 2));
}

test().catch(console.error);
