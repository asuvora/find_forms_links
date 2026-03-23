let eventSource = null;

document.getElementById('scanForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const url = document.getElementById('url').value;
    const maxPages = parseInt(document.getElementById('maxPages').value);
    const delay = parseInt(document.getElementById('delay').value);
    
    // Валидация
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
        alert('Пожалуйста, введите URL с http:// или https://');
        return;
    }
    
    // Закрываем предыдущее соединение если есть
    if (eventSource) {
        eventSource.close();
    }
    
    // Показываем прогресс
    document.getElementById('progress').style.display = 'block';
    document.getElementById('results').style.display = 'none';
    document.getElementById('scanBtn').disabled = true;
    document.getElementById('scanBtn').innerHTML = '<span class="btn-icon">⏳</span> Сканирование...';
    
    // Сброс значений
    resetProgress();
    
    try {
        const response = await fetch('/api/scan', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ url, maxPages, delay })
        });
        
        if (!response.ok) {
            throw new Error('Ошибка при запуске сканирования');
        }
        
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            const chunk = decoder.decode(value);
            const lines = chunk.split('\n');
            
            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const data = JSON.parse(line.slice(6));
                    
                    if (data.type === 'progress') {
                        updateProgress(data.data);
                    } else if (data.type === 'complete') {
                        showResults(data.data);
                    } else if (data.type === 'error') {
                        showError(data.data.message);
                    }
                }
            }
        }
        
    } catch (error) {
        console.error('Ошибка:', error);
        showError(error.message);
    } finally {
        document.getElementById('scanBtn').disabled = false;
        document.getElementById('scanBtn').innerHTML = '<span class="btn-icon">🚀</span> Начать сканирование';
    }
});

function resetProgress() {
    document.getElementById('progressBar').style.width = '0%';
    document.getElementById('scannedCount').textContent = '0';
    document.getElementById('queueCount').textContent = '0';
    document.getElementById('formsFound').textContent = '0';
    document.getElementById('errorsCount').textContent = '0';
}

function updateProgress(progress) {
    const percent = (progress.scanned / progress.total) * 100;
    document.getElementById('progressBar').style.width = `${percent}%`;
    document.getElementById('progressBar').textContent = `${Math.round(percent)}%`;
    document.getElementById('scannedCount').textContent = progress.scanned;
    document.getElementById('queueCount').textContent = progress.queue;
    document.getElementById('formsFound').textContent = progress.formsFound;
    document.getElementById('errorsCount').textContent = progress.errors;
}

function showResults(data) {
    document.getElementById('progress').style.display = 'none';
    document.getElementById('results').style.display = 'block';
    
    document.getElementById('totalPages').textContent = data.scannedPages;
    document.getElementById('totalForms').textContent = data.totalForms;
    
    // Отображаем формы
    const formsList = document.getElementById('formsList');
    if (data.forms.length === 0) {
        formsList.innerHTML = '<div class="form-item">🔍 Формы не найдены</div>';
    } else {
        formsList.innerHTML = data.forms.map(form => `
            <div class="form-item">
                <div class="form-type">${form.type}</div>
                <div class="form-url">
                    🔗 <a href="${form.url}" target="_blank">${form.url}</a>
                </div>
                ${form.text !== 'Ссылка без текста' ? `<div class="form-text">📝 ${escapeHtml(form.text)}</div>` : ''}
                <div class="form-source">
                    📄 Найдено на: <a href="${form.source}" target="_blank">${form.source}</a>
                </div>
            </div>
        `).join('');
    }
    
    // Отображаем ошибки
    const errorsList = document.getElementById('errorsList');
    const errorsContent = document.getElementById('errorsContent');
    
    if (data.errors && data.errors.length > 0) {
        errorsList.style.display = 'block';
        errorsContent.innerHTML = data.errors.map(err => `
            <div class="error-item">
                <strong>${err.url}</strong><br>
                Ошибка: ${escapeHtml(err.error)}
            </div>
        `).join('');
    } else {
        errorsList.style.display = 'none';
    }
    
    // Сохраняем данные для экспорта
    window.scanResults = data;
}

function showError(message) {
    document.getElementById('progress').style.display = 'none';
    alert(`Ошибка: ${message}`);
}

function exportToJSON() {
    if (!window.scanResults) {
        alert('Нет результатов для экспорта');
        return;
    }
    
    const dataStr = JSON.stringify(window.scanResults, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    
    const exportFileDefaultName = `scan_results_${new Date().toISOString().slice(0,19)}.json`;
    
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Экспорт по кнопке
document.getElementById('exportBtn')?.addEventListener('click', exportToJSON);