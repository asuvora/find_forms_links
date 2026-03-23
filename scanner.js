const axios = require('axios');
const cheerio = require('cheerio');
const { URL } = require('url');

class SiteScanner {
    constructor(baseUrl, maxPages = 100, delay = 500) {
        this.baseUrl = baseUrl;
        this.baseDomain = this.extractDomain(baseUrl);
        this.maxPages = maxPages;
        this.delay = delay;
        this.seenUrls = new Set();
        this.foundForms = new Set();
        this.queue = [];
        this.errors = [];
        
        this.axiosInstance = axios.create({
            timeout: 10000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; FormScanner/1.0)'
            }
        });
    }

    extractDomain(url) {
        try {
            const parsed = new URL(url);
            return parsed.hostname;
        } catch (e) {
            return url;
        }
    }

    isInternalUrl(url) {
        try {
            const parsed = new URL(url);
            return parsed.hostname === this.baseDomain || !parsed.hostname;
        } catch (e) {
            return false;
        }
    }

    isValidUrl(url) {
        try {
            new URL(url);
            return true;
        } catch (e) {
            return false;
        }
    }

    async extractFormsFromPage(url, html) {
        const $ = cheerio.load(html);
        const forms = [];
        
        // Ищем ссылки на формы
        $('a').each((_, element) => {
            const href = $(element).attr('href');
            if (!href) return;

            try {
                const absoluteUrl = new URL(href, url).href;
                
                if (absoluteUrl.includes('forms.yandex.ru')) {
                    const formInfo = {
                        type: 'Яндекс-форма',
                        url: absoluteUrl,
                        source: url,
                        text: $(element).text().trim() || 'Ссылка без текста'
                    };
                    this.foundForms.add(formInfo);
                    forms.push(formInfo);
                } 
                else if (absoluteUrl.includes('forms.google.com')) {
                    const formInfo = {
                        type: 'Google-форма',
                        url: absoluteUrl,
                        source: url,
                        text: $(element).text().trim() || 'Ссылка без текста'
                    };
                    this.foundForms.add(formInfo);
                    forms.push(formInfo);
                }
                else if (absoluteUrl.includes('docs.google.com') && absoluteUrl.includes('/forms/')) {
                    const formInfo = {
                        type: 'Google Docs Form',
                        url: absoluteUrl,
                        source: url,
                        text: $(element).text().trim() || 'Ссылка без текста'
                    };
                    this.foundForms.add(formInfo);
                    forms.push(formInfo);
                }
                else if (absoluteUrl.includes('typeform.com')) {
                    const formInfo = {
                        type: 'Typeform',
                        url: absoluteUrl,
                        source: url,
                        text: $(element).text().trim() || 'Ссылка без текста'
                    };
                    this.foundForms.add(formInfo);
                    forms.push(formInfo);
                }
            } catch (e) {
                // Пропускаем некорректные URL
            }
        });

        // Ищем iframe с формами
        $('iframe').each((_, element) => {
            const src = $(element).attr('src');
            if (!src) return;

            try {
                const absoluteUrl = new URL(src, url).href;
                
                if (absoluteUrl.includes('forms.yandex.ru') || 
                    absoluteUrl.includes('forms.google.com') ||
                    absoluteUrl.includes('typeform.com')) {
                    const formInfo = {
                        type: 'Форма в iframe',
                        url: absoluteUrl,
                        source: url,
                        text: 'Встроенная форма'
                    };
                    this.foundForms.add(formInfo);
                    forms.push(formInfo);
                }
            } catch (e) {
                // Пропускаем
            }
        });

        return forms;
    }

    async crawlPage(url) {
        if (this.seenUrls.has(url)) return null;
        if (this.seenUrls.size >= this.maxPages) return null;
        
        this.seenUrls.add(url);
        
        console.log(`[${this.seenUrls.size}/${this.maxPages}] Проверяю: ${url}`);

        try {
            const response = await this.axiosInstance.get(url);
            const forms = await this.extractFormsFromPage(url, response.data);

            const $ = cheerio.load(response.data);
            const links = $('a').map((_, element) => $(element).attr('href')).get();
            
            for (const href of links) {
                if (!href) continue;
                
                try {
                    const absoluteUrl = new URL(href, url).href;
                    
                    if (this.isInternalUrl(absoluteUrl) && 
                        !this.seenUrls.has(absoluteUrl) &&
                        this.isValidUrl(absoluteUrl) &&
                        absoluteUrl.startsWith('http') &&
                        this.queue.length + this.seenUrls.size < this.maxPages * 2) {
                        
                        if (!this.queue.includes(absoluteUrl)) {
                            this.queue.push(absoluteUrl);
                        }
                    }
                } catch (e) {
                    // Пропускаем некорректные URL
                }
            }
            
            // Задержка между запросами
            await new Promise(resolve => setTimeout(resolve, this.delay));
            
            return forms;
            
        } catch (error) {
            this.errors.push({ url, error: error.message });
            console.log(`Ошибка на ${url}: ${error.message}`);
            return null;
        }
    }

    async scan(progressCallback = null) {
        console.log(`Начинаю сканирование ${this.baseUrl}`);
        console.log(`Максимум страниц: ${this.maxPages}`);
        
        this.queue = [this.baseUrl];
        const allForms = [];
        
        while (this.queue.length > 0 && this.seenUrls.size < this.maxPages) {
            const url = this.queue.shift();
            const forms = await this.crawlPage(url);
            
            if (forms && forms.length > 0) {
                allForms.push(...forms);
            }
            
            // Отправляем прогресс
            if (progressCallback) {
                progressCallback({
                    scanned: this.seenUrls.size,
                    total: this.maxPages,
                    queue: this.queue.length,
                    formsFound: this.foundForms.size,
                    errors: this.errors.length
                });
            }
        }
        
        return {
            forms: Array.from(this.foundForms),
            scannedPages: this.seenUrls.size,
            errors: this.errors,
            totalForms: this.foundForms.size
        };
    }
}

module.exports = SiteScanner;