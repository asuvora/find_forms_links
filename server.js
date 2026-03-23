const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const SiteScanner = require('./scanner');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Валидация URL
function validateUrl(url) {
    try {
        const parsed = new URL(url);
        return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch (e) {
        return false;
    }
}

// Эндпоинт для сканирования
app.post('/api/scan', async (req, res) => {
    const { url, maxPages = 50, delay = 500 } = req.body;
    
    if (!url) {
        return res.status(400).json({ error: 'URL не указан' });
    }
    
    if (!validateUrl(url)) {
        return res.status(400).json({ error: 'Неверный URL. Используйте http:// или https://' });
    }
    
    if (maxPages > 200) {
        return res.status(400).json({ error: 'Максимум страниц не может превышать 200' });
    }
    
    try {
        const scanner = new SiteScanner(url, maxPages, delay);
        
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        
        const progressCallback = (progress) => {
            res.write(`data: ${JSON.stringify({ type: 'progress', data: progress })}\n\n`);
        };
        
        const result = await scanner.scan(progressCallback);
        
        res.write(`data: ${JSON.stringify({ type: 'complete', data: result })}\n\n`);
        res.end();
        
    } catch (error) {
        console.error('Ошибка сканирования:', error);
        res.write(`data: ${JSON.stringify({ type: 'error', data: { message: error.message } })}\n\n`);
        res.end();
    }
});

// Эндпоинт для проверки статуса
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Отдаем index.html для всех остальных маршрутов
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Сервер запущен на http://localhost:${PORT}`);
});
