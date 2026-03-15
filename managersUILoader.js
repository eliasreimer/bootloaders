/**
 * ============================================
 *  НАСТРОЙКИ БУТЛОАДЕРА
 * ============================================
 */
const BOOTLOADER = {
    // Дебаг: логи в консоль
    debug: false,

    // Кэширование скриптов (GM_setValue)
    cache: {
        enabled: true,
        ttlMinutes: 10080, // 7 дней
        ignoreTtlOnError: true, // Использовать устаревший кэш при ошибках
    },

    // Ретраи при ошибках сети
    retries: 2,
    retryDelayMs: 1500,
    requestTimeoutMs: 15000,

    // Silent errors: не показывать уведомления об ошибках, использовать кэш
    silentErrors: true,

    // Логирование ошибок для диагностики (только ручная отправка через меню)
    logging: {
        enabled: true,
        endpoint: 'https://utsp.corp.skillbox.pro/webhook/288c45f5-71f7-4a77-9133-783389a9698b',
        token: '4TDBAIBM0cNRPcg2F0FdqfCorwuxVx',
    },

    // Скрипты (порядок = порядок загрузки)
    scripts: [
        'keetleCRM.js',
    ],

    // GitHub конфиг
    repoBase: 'https://api.github.com/repos/eliasreimer/managersUI/contents/',

    // Ключ хранения токена
    tokenKey: 'github_token_crm',
    tokenLabel: 'ManagersUI',
};

(function() {
    'use strict';

    // ========== ДИАГНОСТИКА ==========

    const diagnostics = {
        startTime: Date.now(),
        bootloaderVersion: '1.3.0',
        scripts: [],
        cacheHits: 0,
        cacheMisses: 0,
        errors: [],
        staleCacheUsed: false,
    };

    function recordScriptEvent(name, event, data = {}) {
        const existing = diagnostics.scripts.find(s => s.name === name);
        const record = existing || { name, events: [] };
        record.events.push({ event, timestamp: Date.now(), ...data });
        if (!existing) diagnostics.scripts.push(record);
    }

    // ========== ЛОГИРОВАНИЕ ==========

    const log = {
        info:  (...a) => { if (BOOTLOADER.debug) console.log('%c[ManagersUI Bootloader]', 'color:#007bff;font-weight:600', ...a); },
        warn:  (...a) => { if (BOOTLOADER.debug) console.warn('%c[ManagersUI Bootloader]', 'color:#ff9800;font-weight:600', ...a); },
        error: (...a) => { if (BOOTLOADER.debug) console.error('%c[ManagersUI Bootloader]', 'color:#dc3545;font-weight:600', ...a); },
        ok:    (...a) => { if (BOOTLOADER.debug) console.log('%c[ManagersUI Bootloader]', 'color:#28a745;font-weight:600', ...a); },
    };

    // ========== УВЕДОМЛЕНИЯ ==========

    let notificationTimer = null;

    function showNotification(title, message, options = {}) {
        const {
            type = 'info',      // info, success, warning, error
            duration = 3000,    // длительность показа (мс)
            onClick = null,     // callback при клике
        } = options;

        log.info(`Уведомление: [${type}] ${title} — ${message}`);

        // Удаляем старые уведомления
        const oldNotification = document.querySelector('.bl-notification');
        const oldOverlay = document.querySelector('.bl-notification-overlay');
        if (oldNotification) oldNotification.remove();
        if (oldOverlay) oldOverlay.remove();

        // Создаём оверлей
        const overlay = document.createElement('div');
        overlay.className = 'bl-notification-overlay';

        // Создаём уведомление
        const notification = document.createElement('div');
        notification.className = `bl-notification bl-notification-${type}`;

        const icon = {
            info: 'ℹ️',
            success: '✅',
            warning: '⚠️',
            error: '❌',
        }[type] || 'ℹ️';

        notification.innerHTML = `
            <div class="bl-notification-icon">${icon}</div>
            <div class="bl-notification-content">
                <div class="bl-notification-title">${title}</div>
                ${message ? `<div class="bl-notification-message">${message}</div>` : ''}
            </div>
            <button class="bl-notification-close">&times;</button>
        `;

        document.body.appendChild(overlay);
        document.body.appendChild(notification);

        // Обработчик закрытия
        const closeHandler = () => {
            notification.classList.add('bl-notification-hiding');
            setTimeout(() => {
                notification.remove();
                overlay.remove();
                clearTimeout(notificationTimer);
            }, 200);
        };

        notification.querySelector('.bl-notification-close').addEventListener('click', closeHandler);
        overlay.addEventListener('click', closeHandler);

        // Клик по уведомлению
        if (onClick) {
            notification.addEventListener('click', (e) => {
                if (e.target.classList.contains('bl-notification-close')) return;
                onClick();
                closeHandler();
            });
            notification.style.cursor = 'pointer';
        }

        // Автоматическое закрытие
        clearTimeout(notificationTimer);
        if (duration > 0) {
            notificationTimer = setTimeout(closeHandler, duration);
        }

        return notification;
    }

    // Инжектим стили
    GM_addStyle(`
        .bl-notification-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.3);
            z-index: 99999;
            animation: bl-fade-in 0.15s ease;
        }

        .bl-notification {
            position: fixed;
            top: 20px;
            right: 20px;
            min-width: 300px;
            max-width: 450px;
            background: white;
            border-radius: 12px;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
            display: flex;
            align-items: flex-start;
            gap: 12px;
            padding: 16px;
            z-index: 100000;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            font-size: 14px;
            line-height: 1.4;
            animation: bl-slide-in 0.2s ease;
            backdrop-filter: blur(10px);
        }

        .bl-notification.bl-notification-hiding {
            animation: bl-slide-out 0.2s ease forwards;
        }

        .bl-notification-icon {
            font-size: 24px;
            flex-shrink: 0;
        }

        .bl-notification-content {
            flex: 1;
            min-width: 0;
        }

        .bl-notification-title {
            font-weight: 600;
            color: #1a1a1a;
            margin-bottom: 4px;
        }

        .bl-notification-message {
            color: #666;
            font-size: 13px;
            word-break: break-word;
        }

        .bl-notification-close {
            flex-shrink: 0;
            width: 24px;
            height: 24px;
            border: none;
            background: none;
            color: #999;
            font-size: 20px;
            cursor: pointer;
            border-radius: 6px;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.15s;
        }

        .bl-notification-close:hover {
            background: rgba(0, 0, 0, 0.05);
            color: #333;
        }

        /* Типы уведомлений */
        .bl-notification-info {
            border-left: 4px solid #4a8fda;
        }
        .bl-notification-info .bl-notification-icon {
            color: #4a8fda;
        }

        .bl-notification-success {
            border-left: 4px solid #4caf50;
        }
        .bl-notification-success .bl-notification-icon {
            color: #4caf50;
        }

        .bl-notification-warning {
            border-left: 4px solid #ff9800;
        }
        .bl-notification-warning .bl-notification-icon {
            color: #ff9800;
        }

        .bl-notification-error {
            border-left: 4px solid #f44336;
        }
        .bl-notification-error .bl-notification-icon {
            color: #f44336;
        }

        /* Анимации */
        @keyframes bl-fade-in {
            from { opacity: 0; }
            to { opacity: 1; }
        }

        @keyframes bl-slide-in {
            from {
                opacity: 0;
                transform: translateX(100%);
            }
            to {
                opacity: 1;
                transform: translateX(0);
            }
        }

        @keyframes bl-slide-out {
            from {
                opacity: 1;
                transform: translateX(0);
            }
            to {
                opacity: 0;
                transform: translateX(100%);
            }
        }

        /* Мобильная адаптивность */
        @media (max-width: 480px) {
            .bl-notification {
                top: 10px;
                right: 10px;
                left: 10px;
                min-width: auto;
                max-width: none;
            }
        }
    `);

    // ========== ТОКЕН ==========

    function getToken() {
        let token = GM_getValue(BOOTLOADER.tokenKey);
        if (!token) {
            token = prompt(`Введите GitHub-токен для ${BOOTLOADER.tokenLabel}:`, 'github_pat_...');
            if (token) {
                GM_setValue(BOOTLOADER.tokenKey, token);
                showNotification('Готово!', 'Токен сохранён', { type: 'success', duration: 2500 });
            }
        }
        return token;
    }

    GM_registerMenuCommand('🔑 Изменить GitHub-токен', () => {
        const t = prompt('Новый токен:', GM_getValue(BOOTLOADER.tokenKey) || '');
        if (t !== null) {
            GM_setValue(BOOTLOADER.tokenKey, t);
            showNotification('Готово!', 'Токен обновлён', { type: 'success', duration: 2500 });
        }
    });

    // ========== КЭШ ==========

    const pfx = 'mgrui_';
    function cacheKey(name) { return `${pfx}script_cache_${name}`; }
    function cacheMeta(name) { return `${pfx}script_meta_${name}`; }

    function getCache(name, ignoreTtl = false) {
        if (!BOOTLOADER.cache.enabled) return null;
        const meta = GM_getValue(cacheMeta(name));
        if (!meta) return null;

        const age = (Date.now() - meta.ts) / 1000 / 60;

        // Если игнорируем TTL при ошибках - проверяем флаг
        if (!ignoreTtl && age > BOOTLOADER.cache.ttlMinutes) return null;

        const content = GM_getValue(cacheKey(name));
        if (!content) return null;

        const cacheData = { content, sha: meta.sha, age: Math.round(age) };

        if (age > BOOTLOADER.cache.ttlMinutes) {
            diagnostics.staleCacheUsed = true;
            log.warn(`${name} — использован устаревший кэш (${age} мин)`);
        }

        return cacheData;
    }

    function setCache(name, content, sha) {
        if (!BOOTLOADER.cache.enabled) return;
        GM_setValue(cacheKey(name), content);
        GM_setValue(cacheMeta(name), { ts: Date.now(), sha });
    }

    function clearAllCache() {
        BOOTLOADER.scripts.forEach(name => {
            GM_setValue(cacheKey(name), null);
            GM_setValue(cacheMeta(name), null);
        });
    }

    GM_registerMenuCommand('🔄 Принудительно обновить скрипты', () => {
        clearAllCache();
        showNotification('Кэш очищен', 'Скрипты обновятся при перезагрузке страницы', { type: 'info' });
        location.reload();
    });

    GM_registerMenuCommand('📊 Статус кэша скриптов', () => {
        const lines = BOOTLOADER.scripts.map(name => {
            const cached = getCache(name, true);
            if (cached) return `✅ ${name} — в кэше (${cached.age} мин назад)`;
            return `❌ ${name} — не в кэше`;
        });
        alert('Статус кэша:\n\n' + lines.join('\n'));
    });

    // ========== ЗАГРУЗКА ==========

    function fetchScript(url, token, retriesLeft) {
        return new Promise((resolve, reject) => {
            const attempt = (n) => {
                GM_xmlhttpRequest({
                    method: 'GET',
                    url,
                    timeout: BOOTLOADER.requestTimeoutMs,
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Accept': 'application/vnd.github.v3+json',
                        'User-Agent': 'Tampermonkey Bootloader',
                    },
                    onload(r) {
                        if (r.status === 200) resolve(r.responseText);
                        else if (r.status === 401 || r.status === 403) {
                            // Проблема с токеном - критично
                            reject(new Error(`Auth failed (${r.status}): проверьте токен`));
                        }
                        else if (n > 0) {
                            log.warn(`Ретрай ${url} (${r.status})...`);
                            setTimeout(() => attempt(n - 1), BOOTLOADER.retryDelayMs);
                        }
                        else reject(new Error(`HTTP ${r.status}: ${url}`));
                    },
                    onerror() {
                        if (n > 0) {
                            log.warn(`Ретрай ${url} (сеть)...`);
                            setTimeout(() => attempt(n - 1), BOOTLOADER.retryDelayMs);
                        }
                        else reject(new Error(`Network error: ${url}`));
                    },
                    ontimeout() {
                        if (n > 0) {
                            log.warn(`Ретрай ${url} (таймаут)...`);
                            setTimeout(() => attempt(n - 1), BOOTLOADER.retryDelayMs);
                        }
                        else reject(new Error(`Timeout: ${url}`));
                    },
                });
            };
            attempt(retriesLeft);
        });
    }

    function decodeContent(responseText) {
        const data = JSON.parse(responseText);
        const base64 = data.content.replace(/\s/g, '');
        const binary = atob(base64);
        return {
            content: new TextDecoder('utf-8').decode(
                new Uint8Array([...binary].map(c => c.charCodeAt(0)))
            ),
            sha: data.sha,
        };
    }

    function executeScript(name, content) {
        try {
            // Выполняем код в userscript контексте, чтобы были доступны GM_* функции
            eval(content);
            recordScriptEvent(name, 'executed');
            return true;
        } catch (e) {
            log.error(`Ошибка выполнения ${name}:`, e);
            recordScriptEvent(name, 'execution_error', { error: e.message });
            return false;
        }
    }

    // ========== ОТПРАВКА ДИАГНОСТИКИ ==========

    function sendDiagnostics() {
        if (!BOOTLOADER.logging.enabled) return;

        const totalTime = Date.now() - diagnostics.startTime;
        const payload = {
            timestamp: new Date().toISOString(),
            bootloaderVersion: diagnostics.bootloaderVersion,
            platform: {
                userAgent: navigator.userAgent,
                url: window.location.href,
                screen: `${window.screen.width}x${window.screen.height}`,
            },
            scripts: diagnostics.scripts,
            cache: {
                hitRate: diagnostics.scripts.length > 0
                    ? (diagnostics.cacheHits / diagnostics.scripts.length).toFixed(2)
                    : 0,
                misses: diagnostics.cacheMisses,
                staleUsed: diagnostics.staleCacheUsed,
            },
            errors: diagnostics.errors,
            performance: {
                totalTime: totalTime,
            },
        };

        GM_xmlhttpRequest({
            method: 'POST',
            url: BOOTLOADER.logging.endpoint,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${BOOTLOADER.logging.token}`,
            },
            data: JSON.stringify(payload),
            onload: (r) => {
                if (r.status === 200 || r.status === 201) {
                    log.info('Диагностика отправлена');

                    // Если в ответе есть ссылка на тикет - показываем менеджеру
                    try {
                        const response = JSON.parse(r.responseText);
                        if (response.ticketUrl || response.ticket_link || response.url) {
                            const ticketUrl = response.ticketUrl || response.ticket_link || response.url;
                            showNotification(
                                '📋 Создана заявка в Service Desk',
                                'Нажмите, чтобы открыть',
                                {
                                    type: 'success',
                                    duration: 8000,
                                    onClick: () => window.open(ticketUrl, '_blank'),
                                }
                            );
                        }
                    } catch {
                        // Ответ не JSON - игнорируем
                    }
                } else {
                    log.warn(`Ошибка отправки диагностики: ${r.status}`);
                }
            },
            onerror: (e) => {
                log.warn('Не удалось отправить диагностику', e);
            },
        });
    }

    GM_registerMenuCommand('📤 Отправить диагностику', () => {
        sendDiagnostics();
        showNotification('Отправлено!', 'Диагностика отправлена в Service Desk', { type: 'success' });
    });

    // ========== ОСНОВНОЙ ПРОЦЕСС ==========

    async function loadAll() {
        const token = getToken();
        if (!token) {
            if (!BOOTLOADER.silentErrors) {
                showNotification(
                    'Токен не указан',
                    'Укажите токен в меню Tampermonkey',
                    { type: 'error' }
                );
            }
            return;
        }

        const t0 = performance.now();
        log.info(`Загрузка ${BOOTLOADER.scripts.length} скриптов...`);

        const needsFetch = [];

        // Фаза 1: мгновенный запуск из кэша
        for (const name of BOOTLOADER.scripts) {
            const cached = getCache(name);
            if (cached) {
                log.ok(`${name} — из кэша (${cached.age} мин)`);
                diagnostics.cacheHits++;
                recordScriptEvent(name, 'cache_hit', { age: cached.age });
                executeScript(name, cached.content);
            } else {
                diagnostics.cacheMisses++;
                needsFetch.push(name);
            }
        }

        if (needsFetch.length === 0) {
            log.ok(`Все скрипты из кэша за ${Math.round(performance.now() - t0)} мс`);
            backgroundUpdate(token);
            return;
        }

        log.info(`Загрузка с GitHub: ${needsFetch.join(', ')}`);

        // Фаза 2: загрузка отсутствующих в кэше
        for (const name of needsFetch) {
            const url = BOOTLOADER.repoBase + name;
            const ts = performance.now();

            try {
                const raw = await fetchScript(url, token, BOOTLOADER.retries);
                const decoded = decodeContent(raw);

                setCache(name, decoded.content, decoded.sha);
                executeScript(name, decoded.content);

                recordScriptEvent(name, 'loaded', { source: 'github', sha: decoded.sha, duration: Date.now() - ts });
                log.ok(`${name} — загружен за ${Math.round(performance.now() - ts)} мс`);
            } catch (e) {
                log.error(`${name} — ОШИБКА:`, e.message);

                // Graceful degradation: пробуем устаревший кэш
                if (BOOTLOADER.cache.ignoreTtlOnError) {
                    const staleCache = getCache(name, true);
                    if (staleCache) {
                        log.warn(`${name} — использован устаревший кэш (${staleCache.age} мин)`);
                        diagnostics.staleCacheUsed = true;
                        executeScript(name, staleCache.content);
                        recordScriptEvent(name, 'stale_cache_used', { age: staleCache.age });
                        continue;
                    }
                }

                // Если ничего не помогло - записываем ошибку
                diagnostics.errors.push({
                    script: name,
                    error: e.message,
                    timestamp: Date.now(),
                });

                if (!BOOTLOADER.silentErrors) {
                    showNotification(
                        `Ошибка: ${name}`,
                        'Невозможно загрузить скрипт. Обратитесь в Service Desk.',
                        { type: 'error', duration: 8000 }
                    );
                } else {
                    // Silent mode: показываем уведомление только если нет даже кэша
                    const hasStaleCache = getCache(name, true);
                    if (!hasStaleCache) {
                        showNotification(
                            `⚠️ Проблемы с ${name}`,
                            'Скрипт недоступен. Функционал может быть ограничен.',
                            { type: 'warning' }
                        );
                    }
                }
            }
        }

        log.ok(`Загрузка завершена за ${Math.round(performance.now() - t0)} мс`);
    }

    // Фоновая проверка обновлений для закэшированных скриптов
    async function backgroundUpdate(token) {
        log.info('Фоновая проверка обновлений...');

        for (const name of BOOTLOADER.scripts) {
            const url = BOOTLOADER.repoBase + name;
            try {
                const raw = await fetchScript(url, token, 1);
                const decoded = decodeContent(raw);
                const meta = GM_getValue(cacheMeta(name));

                if (!meta || meta.sha !== decoded.sha) {
                    setCache(name, decoded.content, decoded.sha);
                    log.info(`${name} — обновлён в кэше (новый SHA)`);
                }
            } catch {
                // Тихо пропускаем
            }
        }

        log.ok('Фоновая проверка завершена');
    }

    // ========== ЗАПУСК ==========

    loadAll();
})();
