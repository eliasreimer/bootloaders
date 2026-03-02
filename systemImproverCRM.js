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
        ttlMinutes: 30,
    },

    // Ретраи при ошибках сети
    retries: 2,
    retryDelayMs: 1500,

    // Таймаут запроса (мс)
    requestTimeoutMs: 15000,

    // Скрипты (порядок = порядок загрузки)
    scripts: [
        'helperApi.js',
        'copyID.js',
        'scenariosInfo.js',
        'whoExportedIt.js',
        'viewingActivity.js',
        'nestedScenarios.js',
        'myBrother.js',
        'scenarioOpener.js',
        'scenarioLogsEnhancer.js',
        'fieldSettingsOpener.js',
        'apiLinkButton.js',
    ],

    // Базовый URL репозитория
    repoBase: 'https://api.github.com/repos/eliasreimer/systemImproverCRM/contents/',
};

(function() {
    'use strict';

    // ========== ЛОГИРОВАНИЕ ==========

    const log = {
        info:  (...a) => { if (BOOTLOADER.debug) console.log('%c[Bootloader]', 'color:#007bff;font-weight:600', ...a); },
        warn:  (...a) => { if (BOOTLOADER.debug) console.warn('%c[Bootloader]', 'color:#ff9800;font-weight:600', ...a); },
        error: (...a) => { if (BOOTLOADER.debug) console.error('%c[Bootloader]', 'color:#dc3545;font-weight:600', ...a); },
        ok:    (...a) => { if (BOOTLOADER.debug) console.log('%c[Bootloader]', 'color:#28a745;font-weight:600', ...a); },
    };

    // ========== ТОКЕН ==========

    function getToken() {
        let token = GM_getValue('github_token');
        if (!token) {
            token = prompt('Введите GitHub-токен для systemImproverCRM:', 'github_pat_...');
            if (token) {
                GM_setValue('github_token', token);
                GM_notification({ title: 'Готово!', text: 'Токен сохранён.', timeout: 3000 });
            }
        }
        return token;
    }

    GM_registerMenuCommand('🔑 Изменить GitHub-токен', () => {
        const t = prompt('Новый токен:', GM_getValue('github_token') || '');
        if (t !== null) {
            GM_setValue('github_token', t);
            GM_notification({ title: 'Готово!', text: 'Токен обновлён.', timeout: 3000 });
        }
    });

    // ========== КЭШ ==========

    function cacheKey(name) { return `script_cache_${name}`; }
    function cacheMeta(name) { return `script_meta_${name}`; }

    function getCache(name) {
        if (!BOOTLOADER.cache.enabled) return null;
        const meta = GM_getValue(cacheMeta(name));
        if (!meta) return null;

        const age = (Date.now() - meta.ts) / 1000 / 60;
        if (age > BOOTLOADER.cache.ttlMinutes) return null;

        const content = GM_getValue(cacheKey(name));
        if (!content) return null;

        return { content, sha: meta.sha, age: Math.round(age) };
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
        GM_notification({ title: 'Кэш очищен', text: 'Скрипты обновятся при перезагрузке страницы.', timeout: 3000 });
        location.reload();
    });

    GM_registerMenuCommand('📊 Статус кэша скриптов', () => {
        const lines = BOOTLOADER.scripts.map(name => {
            const cached = getCache(name);
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
                        if (r.status === 200) {
                            resolve(r.responseText);
                        } else if (n > 0) {
                            log.warn(`Ретрай ${url} (${r.status})...`);
                            setTimeout(() => attempt(n - 1), BOOTLOADER.retryDelayMs);
                        } else {
                            reject(new Error(`HTTP ${r.status}: ${url}`));
                        }
                    },
                    onerror(e) {
                        if (n > 0) {
                            log.warn(`Ретрай ${url} (ошибка сети)...`);
                            setTimeout(() => attempt(n - 1), BOOTLOADER.retryDelayMs);
                        } else {
                            reject(new Error(`Network error: ${url}`));
                        }
                    },
                    ontimeout() {
                        if (n > 0) {
                            log.warn(`Ретрай ${url} (таймаут)...`);
                            setTimeout(() => attempt(n - 1), BOOTLOADER.retryDelayMs);
                        } else {
                            reject(new Error(`Timeout: ${url}`));
                        }
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
        return new TextDecoder('utf-8').decode(
            new Uint8Array([...binary].map(c => c.charCodeAt(0)))
        );
    }

    function executeScript(name, content) {
        try {
            const script = document.createElement('script');
            script.textContent = `(function() { ${content} })();`;
            (document.head || document.body || document.documentElement).appendChild(script);
            script.remove();
        } catch (e) {
            log.error(`Ошибка выполнения ${name}:`, e);
            GM_notification({ title: `Ошибка: ${name}`, text: e.message, timeout: 5000 });
        }
    }

    // ========== ОСНОВНОЙ ПРОЦЕСС ==========

    async function loadAll() {
        const token = getToken();
        if (!token) return;

        const t0 = performance.now();
        log.info(`Загрузка ${BOOTLOADER.scripts.length} скриптов...`);

        // Фаза 1: мгновенный запуск из кэша
        const needsFetch = [];

        BOOTLOADER.scripts.forEach(name => {
            const cached = getCache(name);
            if (cached) {
                log.ok(`${name} — из кэша (${cached.age} мин)`);
                executeScript(name, cached.content);
            } else {
                needsFetch.push(name);
            }
        });

        if (needsFetch.length === 0) {
            log.ok(`Все скрипты из кэша за ${Math.round(performance.now() - t0)} мс`);
            backgroundUpdate(token);
            return;
        }

        // Фаза 2: загрузка отсутствующих в кэше
        log.info(`Загрузка с GitHub: ${needsFetch.join(', ')}`);

        await Promise.all(needsFetch.map(async (name) => {
            const url = BOOTLOADER.repoBase + name;
            const ts = performance.now();
            try {
                const raw = await fetchScript(url, token, BOOTLOADER.retries);
                const data = JSON.parse(raw);
                const content = decodeContent(raw);

                setCache(name, content, data.sha);
                executeScript(name, content);

                log.ok(`${name} — загружен за ${Math.round(performance.now() - ts)} мс`);
            } catch (e) {
                log.error(`${name} — ОШИБКА:`, e.message);
                GM_notification({ title: `Ошибка: ${name}`, text: e.message, timeout: 5000 });
            }
        }));

        log.ok(`Загрузка завершена за ${Math.round(performance.now() - t0)} мс`);
    }

    // Фоновая проверка обновлений для закэшированных скриптов
    async function backgroundUpdate(token) {
        log.info('Фоновая проверка обновлений...');

        for (const name of BOOTLOADER.scripts) {
            const url = BOOTLOADER.repoBase + name;
            try {
                const raw = await fetchScript(url, token, 1);
                const data = JSON.parse(raw);
                const meta = GM_getValue(cacheMeta(name));

                if (meta && meta.sha === data.sha) continue;

                const content = decodeContent(raw);
                setCache(name, content, data.sha);
                log.info(`${name} — обновлён в кэше (новый SHA)`);
            } catch {
                // Тихо пропускаем — не критично
            }
        }

        log.ok('Фоновая проверка завершена');
    }

    // ========== ЗАПУСК ==========

    loadAll();
})();
