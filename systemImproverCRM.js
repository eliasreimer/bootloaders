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
    // uiKit.js — первый, задаёт пространство имён и компоненты
    scripts: [
        'uiKit.js',
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
        'scenarioLogs.js',
    ],

    // Ленивая загрузка — только для определённых URL
    // Если скрипт указан здесь, он загрузится только если location.pathname совпадает
    lazyScripts: {
        // 'helperApi.js': '/api-keys',      // пример: только на странице API-токенов
        // 'scenarioLogs.js': '/scenario-logs',
    },

    // Базовый URL репозитория
    repoBase: 'https://api.github.com/repos/eliasreimer/systemImproverCRM/contents/',

    // Режим загрузки: 'tree' (один запрос) или 'individual' (по одному, fallback)
    fetchMode: 'tree',

    // Branch
    branch: 'master',
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

        return { content, sha: meta.sha, treeSha: meta.treeSha, age: Math.round(age) };
    }

    function setCache(name, content, sha, treeSha) {
        if (!BOOTLOADER.cache.enabled) return;
        GM_setValue(cacheKey(name), content);
        GM_setValue(cacheMeta(name), { ts: Date.now(), sha, treeSha });
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

    function fetchJSON(url, token, retriesLeft) {
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
                            try { resolve(JSON.parse(r.responseText)); }
                            catch (e) { reject(new Error(`JSON parse error: ${url}`)); }
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

    function decodeContent(base64Str) {
        const binary = atob(base64Str.replace(/\s/g, ''));
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

    // ========== ОДИН ЗАПРОС (tree mode) ==========

    async function fetchTree(token) {
        const url = `https://api.github.com/repos/eliasreimer/systemImproverCRM/git/trees/${BOOTLOADER.branch}?recursive=1`;
        return fetchJSON(url, token, BOOTLOADER.retries);
    }

    function shouldLoadScript(name) {
        const pattern = BOOTLOADER.lazyScripts[name];
        if (!pattern) return true;
        return window.location.pathname.includes(pattern);
    }

    function getScriptsToLoad() {
        return BOOTLOADER.scripts.filter(name => shouldLoadScript(name));
    }

    // ========== ОСНОВНОЙ ПРОЦЕСС ==========

    async function loadAll() {
        const token = getToken();
        if (!token) return;

        const t0 = performance.now();
        const scriptsToLoad = getScriptsToLoad();
        log.info(`Загрузка ${scriptsToLoad.length} скриптов (из ${BOOTLOADER.scripts.length} общих)...`);

        // Фаза 1: мгновенный запуск из кэша
        const needsFetch = [];

        for (const name of scriptsToLoad) {
            const cached = getCache(name);
            if (cached) {
                log.ok(`${name} — из кэша (${cached.age} мин)`);
                executeScript(name, cached.content);
            } else {
                needsFetch.push(name);
            }
        }

        if (needsFetch.length === 0) {
            log.ok(`Все скрипты из кэша за ${Math.round(performance.now() - t0)} мс`);
            backgroundUpdate(token);
            return;
        }

        // Фаза 2: загрузка
        if (BOOTLOADER.fetchMode === 'tree') {
            await loadViaTree(token, needsFetch, t0);
        } else {
            await loadIndividual(token, needsFetch, t0);
        }
    }

    async function loadViaTree(token, needsFetch, t0) {
        log.info(`Tree mode: загрузка ${needsFetch.length} скриптов одним запросом...`);

        try {
            const treeData = await fetchTree(token);
            const fileMap = {};

            for (const item of treeData.tree) {
                if (item.type === 'blob') {
                    fileMap[item.path] = item;
                }
            }

            // Загружаем только отсутствующие файлы (пропускаем uiKit.js если в кэше)
            const fetchPromises = needsFetch.map(async (name) => {
                const file = fileMap[name];
                if (!file) {
                    log.error(`${name} — не найден в репозитории`);
                    return;
                }

                // Декодируем прямо из tree response
                const content = decodeContent(file.content);
                setCache(name, content, file.sha, treeData.sha);
                executeScript(name, content);
                log.ok(`${name} — загружен`);
            });

            await Promise.all(fetchPromises);

            log.ok(`Загрузка завершена за ${Math.round(performance.now() - t0)} мс`);

        } catch (e) {
            log.warn(`Tree mode не удался: ${e.message}, переключаюсь на individual...`);
            await loadIndividual(token, needsFetch, t0);
        }
    }

    async function loadIndividual(token, needsFetch, t0) {
        log.info(`Individual mode: загрузка ${needsFetch.length} скриптов...`);

        await Promise.all(needsFetch.map(async (name) => {
            const url = BOOTLOADER.repoBase + name;
            const ts = performance.now();
            try {
                const data = await fetchJSON(url, token, BOOTLOADER.retries);
                const content = decodeContent(data.content);

                setCache(name, content, data.sha, null);
                executeScript(name, content);

                log.ok(`${name} — загружен за ${Math.round(performance.now() - ts)} мс`);
            } catch (e) {
                log.error(`${name} — ОШИБКА:`, e.message);
                GM_notification({ title: `Ошибка: ${name}`, text: e.message, timeout: 5000 });
            }
        }));

        log.ok(`Загрузка завершена за ${Math.round(performance.now() - t0)} мс`);
    }

    // Фоновая проверка обновлений (по tree SHA — один запрос)
    async function backgroundUpdate(token) {
        log.info('Фоновая проверка обновлений...');

        try {
            const treeData = await fetchTree(token);
            const scriptsToLoad = getScriptsToLoad();

            for (const name of scriptsToLoad) {
                const meta = GM_getValue(cacheMeta(name));

                // Проверяем tree SHA — если не поменялся, пропускаем весь репо
                if (meta && meta.treeSha === treeData.sha) continue;

                // Ищем файл в tree
                const file = treeData.tree.find(f => f.path === name);
                if (!file) continue;

                if (meta && meta.sha === file.sha) continue;

                const content = decodeContent(file.content);
                setCache(name, content, file.sha, treeData.sha);
                log.info(`${name} — обновлён в кэше (новый SHA)`);
            }
        } catch {
            // Тихо пропускаем — не критично
        }

        log.ok('Фоновая проверка завершена');
    }

    // ========== ЗАПУСК ==========

    loadAll();
})();
