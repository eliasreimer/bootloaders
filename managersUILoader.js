/**
 * ============================================
 *  НАСТРОЙКИ БУТЛОАДЕРА (ManagersUI)
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
        bootloaderVersion: '1.2.0',
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

    // ========== ТОКЕН ==========

    function getToken() {
        let token = GM_getValue(BOOTLOADER.tokenKey);
        if (!token) {
            token = prompt(`Введите GitHub-токен для ${BOOTLOADER.tokenLabel}:`, 'github_pat_...');
            if (token) {
                GM_setValue(BOOTLOADER.tokenKey, token);
                GM_notification({ title: 'Готово!', text: 'Токен сохранён.', timeout: 3000 });
            }
        }
        return token;
    }

    GM_registerMenuCommand('🔑 Изменить GitHub-токен', () => {
        const t = prompt('Новый токен:', GM_getValue(BOOTLOADER.tokenKey) || '');
        if (t !== null) {
            GM_setValue(BOOTLOADER.tokenKey, t);
            GM_notification({ title: 'Готово!', text: 'Токен обновлён.', timeout: 3000 });
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
        GM_notification({ title: 'Кэш очищен', text: 'Скрипты обновятся при перезагрузке.', timeout: 3000 });
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
            const script = document.createElement('script');
            script.textContent = `(function() { ${content} })();`;
            (document.head || document.body || document.documentElement).appendChild(script);
            script.remove();
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
                            GM_notification({
                                title: '📋 Создана заявка в Service Desk',
                                text: `Нажмите, чтобы открыть: ${ticketUrl}`,
                                timeout: 10000,
                                onclick: () => window.open(ticketUrl, '_blank'),
                            });
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
        GM_notification({ title: 'Отправлено!', text: 'Диагностика отправлена в Service Desk.', timeout: 3000 });
    });

    // ========== ОСНОВНОЙ ПРОЦЕСС ==========

    async function loadAll() {
        const token = getToken();
        if (!token) {
            if (!BOOTLOADER.silentErrors) {
                GM_notification({
                    title: 'Токен не указан',
                    text: 'Укажите токен в меню Tampermonkey',
                    timeout: 5000,
                });
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
                    GM_notification({
                        title: `Ошибка: ${name}`,
                        text: 'Невозможно загрузить скрипт. Обратитесь в Service Desk.',
                        timeout: 10000,
                    });
                } else {
                    // Silent mode: показываем уведомление только если нет даже кэша
                    const hasStaleCache = getCache(name, true);
                    if (!hasStaleCache) {
                        GM_notification({
                            title: `⚠️ Проблемы с ${name}`,
                            text: 'Скрипт недоступен. Функционал может быть ограничен.',
                            timeout: 5000,
                        });
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
