/**
 * managersUILoader.js — Бутлоадер для Котла Лидов
 * Аналог systemImproverCRM.js, но с new Function() для передачи GM_* API.
 *
 * Запуск: Tampermonkey shell
 * Репозиторий: eliasreimer/managersUI
 *
 * Отличия от systemImproverCRM:
 *   - new Function() вместо script.textContent (скрипты используют GM_* напрямую)
 *   - Список скриптов Котла
 */

'use strict';

/**
 *  НАСТРОЙКИ БУТЛОАДЕРА
 * ============================================
 */
const KETTLE_BOOT = {
    // Дебаг: логи в консоль
    debug: true,

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

    // Интервал проверки обновлений (мс)
    pollIntervalMs: 30000,

    // Скрипты (порядок = порядок загрузки)
    // _shared.js ВСЕГДА первый — общий модуль
    scripts: [
        '_shared.js',
        'keetleCRM.js',
        'kettleAdmin.js',
    ],

    // Базовый URL репозитория
    repoBase: 'https://api.github.com/repos/eliasreimer/managersUI/contents/',

    // GM_* функции для передачи через new Function()
    gmFunctions: [
        'GM_xmlhttpRequest', 'GM_notification', 'GM_getValue', 'GM_setValue',
        'GM_deleteValue', 'GM_addStyle', 'GM_registerMenuCommand',
    ],
};

console.log('[Котёл] Загрузчик запущен');

// ========== ФУТЕРНЫЙ ИНДИКАТОР ==========

function initFooter() {
    if (document.getElementById('kb-footer-indicator')) return;
    var pfRight = document.querySelector('.pf-right');
    if (!pfRight) return;

    // "v. 4.2.73" → "Версия S2 CRM: 4.2.73"
    var versionLink = pfRight.querySelector('a.version-text');
    if (versionLink) {
        var m = versionLink.textContent.match(/v\.\s*([\d.]+)/);
        if (m) versionLink.textContent = 'Версия S2 CRM: ' + m[1];
    }

    // Скрываем ТОЛЬКО юзер-аккаунт
    var userAccount = pfRight.querySelector('.page-footer__user-account');
    if (userAccount) userAccount.style.display = 'none';

    // Вставляем индикатор вместо юзер-аккаунта (между двумя point-status)
    if (userAccount) {
        var span = document.createElement('span');
        span.id = 'kb-footer-indicator';
        span.style.cssText = 'font-size:11px;color:#999;white-space:nowrap';
        span.textContent = 'Версия скриптов: загрузка...';
        userAccount.parentNode.insertBefore(span, userAccount.nextSibling);
    }
}

// Пробуем сразу
initFooter();

// Если футер ещё не в DOM — ждём
if (!document.getElementById('kb-footer-indicator')) {
    var _ftObs = new MutationObserver(function() {
        if (document.querySelector('.pf-right')) {
            _ftObs.disconnect();
            initFooter();
        }
    });
    _ftObs.observe(document.body, { childList: true, subtree: true });
    setTimeout(function() { _ftObs.disconnect(); }, 10000);
}

function hidePreloader(text, isError) {
    var el = document.getElementById('kb-footer-indicator');
    if (el) el.textContent = text || 'Готово';
}
function updatePreloaderText(text) {
    var el = document.getElementById('kb-footer-indicator');
    if (el) el.textContent = text;
}


// ========== Захват GM_* API ==========
    // GM_* доступны из внешнего scope (new Function в Tampermonkey shell).
    // Сохраняем в _gm для передачи child-скриптам через new Function().
    const _gm = {
        GM_xmlhttpRequest, GM_notification, GM_getValue, GM_setValue,
        GM_deleteValue, GM_addStyle, GM_registerMenuCommand,
    };

    // ========== ЛОГИРОВАНИЕ ==========

    // Ключевые шаги — всегда, детали — только при debug
    const log = {
        info:  (...a) => console.log('%c[Котёл]', 'color:#ff9800;font-weight:600', ...a),
        warn:  (...a) => { if (KETTLE_BOOT.debug) console.warn('%c[Котёл]', 'color:#ff5722;font-weight:600', ...a); },
        error: (...a) => console.error('%c[Котёл]', 'color:#dc3545;font-weight:600', ...a),
        ok:    (...a) => console.log('%c[Котёл]', 'color:#4CAF50;font-weight:600', ...a),
        debug: (...a) => { if (KETTLE_BOOT.debug) console.log('%c[Котёл]', 'color:#999;font-weight:400', ...a); },
    };

    // ========== ТОКЕН ==========

    /**
     * Кастомный модал для ввода токена.
     * Возвращает Promise<string|null> — null если отменено.
     */
    function showTokenModal(title, descriptionHTML, placeholder, currentValue) {
        return new Promise((resolve) => {
            // Убираем предыдущий модал если есть
            const old = document.getElementById('kettle-token-modal');
            if (old) old.remove();

            const overlay = document.createElement('div');
            overlay.id = 'kettle-token-modal';
            overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:999999;display:flex;align-items:center;justify-content:center;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;animation:kbm-fadeIn .2s ease;transition:opacity .3s ease;';
            overlay.onclick = (e) => { if (e.target === overlay) { overlay.remove(); resolve(null); } };

            const box = document.createElement('div');
            box.style.cssText = 'background:#fff;border-radius:14px;box-shadow:0 20px 60px rgba(0,0,0,0.35);width:440px;overflow:hidden;animation:kbm-scaleIn .25s ease;transition:opacity .3s ease,transform .3s ease;';

            // Заголовок
            const hdr = document.createElement('div');
            hdr.style.cssText = 'padding:20px 24px 0;display:flex;align-items:center;gap:10px;transition:opacity .3s ease;';
            hdr.innerHTML = `<span style="font-size:20px">🔑</span><span style="font-size:16px;font-weight:600;color:#222">${title}</span>`;

            // Описание (поддерживает HTML — для гиперссылок)
            const desc = document.createElement('div');
            desc.style.cssText = 'padding:12px 24px 0;font-size:13px;color:#666;line-height:1.5;transition:opacity .3s ease;';
            desc.innerHTML = descriptionHTML;

            // Ошибка (скрыта по умолчанию)
            const errEl = document.createElement('div');
            errEl.style.cssText = 'padding:8px 24px 0;font-size:12px;color:#dc3545;display:none;transition:opacity .3s ease;';

            // Инпут
            const inputWrap = document.createElement('div');
            inputWrap.style.cssText = 'padding:16px 24px 0;transition:opacity .3s ease;';
            const input = document.createElement('input');
            input.type = 'text';
            input.value = currentValue || '';
            input.placeholder = placeholder;
            input.style.cssText = 'width:100%;padding:10px 14px;border:2px solid #dee2e6;border-radius:8px;font-size:13px;font-family:Consolas,Monaco,monospace;outline:none;transition:border-color .2s;';
            input.addEventListener('focus', () => { input.style.borderColor = '#4a8fda'; });
            input.addEventListener('blur', () => { input.style.borderColor = '#dee2e6'; });
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') { e.preventDefault(); submit(); }
                if (e.key === 'Escape') { overlay.remove(); resolve(null); }
            });
            inputWrap.appendChild(input);

            // Кнопки
            const btns = document.createElement('div');
            btns.style.cssText = 'padding:16px 24px 20px;display:flex;gap:10px;justify-content:flex-end;transition:opacity .3s ease;';

            const cancelBtn = document.createElement('button');
            cancelBtn.textContent = 'Отмена';
            cancelBtn.style.cssText = 'padding:8px 18px;border:1px solid #dee2e6;border-radius:8px;background:#fff;color:#555;font-size:13px;cursor:pointer;transition:background .15s;';
            cancelBtn.addEventListener('mouseenter', () => { cancelBtn.style.background = '#f0f0f0'; });
            cancelBtn.addEventListener('mouseleave', () => { cancelBtn.style.background = '#fff'; });
            cancelBtn.onclick = () => { overlay.remove(); resolve(null); };

            const saveBtn = document.createElement('button');
            saveBtn.textContent = 'Сохранить';
            saveBtn.style.cssText = 'padding:8px 18px;border:none;border-radius:8px;background:linear-gradient(135deg,#4a8fda,#3a7fc8);color:#fff;font-size:13px;font-weight:600;cursor:pointer;transition:transform .15s,box-shadow .15s;';
            saveBtn.addEventListener('mouseenter', () => { saveBtn.style.transform = 'translateY(-1px)'; saveBtn.style.boxShadow = '0 4px 12px rgba(74,143,218,0.35)'; });
            saveBtn.addEventListener('mouseleave', () => { saveBtn.style.transform = 'none'; saveBtn.style.boxShadow = 'none'; });

            // Результат (скрыт по умолчанию)
            const resultEl = document.createElement('div');
            resultEl.style.cssText = 'padding:32px 24px;text-align:center;display:none;';
            resultEl.innerHTML = '<span style="font-size:24px">✅</span><div style="margin-top:8px;font-size:15px;font-weight:600;color:#222;">Токен сохранён</div>';

            const elementsToHide = [hdr, desc, errEl, inputWrap, btns];

            function showError(text) {
                errEl.textContent = text;
                errEl.style.display = 'block';
                saveBtn.disabled = false;
                saveBtn.textContent = 'Сохранить';
                saveBtn.style.opacity = '1';
            }

            function submit() {
                const val = input.value.trim();
                if (!val) { showError('Введите токен'); return; }

                // Блокируем кнопку, показываем лоадер
                saveBtn.disabled = true;
                saveBtn.textContent = 'Проверяю...';
                saveBtn.style.opacity = '0.7';
                errEl.style.display = 'none';

                // Тестовый запрос к GitHub API
                GM_xmlhttpRequest({
                    method: 'GET',
                    url: KETTLE_BOOT.repoBase + '_shared.js',
                    timeout: 10000,
                    headers: {
                        'Authorization': `Bearer ${val}`,
                        'Accept': 'application/vnd.github.v3+json',
                        'User-Agent': 'Tampermonkey Kettle Bootloader',
                    },
                    onload(r) {
                        if (r.status === 200) {
                            // Токен валидный — плавная анимация
                            elementsToHide.forEach(el => {
                                el.style.opacity = '0';
                                el.style.maxHeight = '0';
                                el.style.padding = '0 24px';
                                el.style.overflow = 'hidden';
                                el.style.margin = '0';
                            });
                            setTimeout(() => {
                                elementsToHide.forEach(el => el.style.display = 'none');
                                resultEl.style.display = 'block';
                                resultEl.style.opacity = '0';
                                resultEl.style.transition = 'opacity .3s ease';
                                requestAnimationFrame(() => { resultEl.style.opacity = '1'; });
                            }, 300);
                            setTimeout(() => {
                                overlay.style.opacity = '0';
                                box.style.opacity = '0';
                                box.style.transform = 'scale(0.95)';
                                setTimeout(() => {
                                    overlay.remove();
                                    resolve(val);
                                }, 300);
                            }, 1400);
                        } else {
                            showError(`Токен не принят (${r.status}). Проверьте и попробуйте снова.`);
                        }
                    },
                    onerror() {
                        showError('Ошибка сети. Проверьте подключение и попробуйте снова.');
                    },
                });
            }
            saveBtn.onclick = submit;

            btns.appendChild(cancelBtn);
            btns.appendChild(saveBtn);

            box.appendChild(hdr);
            box.appendChild(desc);
            box.appendChild(errEl);
            box.appendChild(inputWrap);
            box.appendChild(btns);
            box.appendChild(resultEl);
            overlay.appendChild(box);
            document.body.appendChild(overlay);

            // Стили анимации (один раз)
            if (!document.getElementById('kettle-modal-anim')) {
                const s = document.createElement('style');
                s.id = 'kettle-modal-anim';
                s.textContent = `@keyframes kbm-fadeIn{from{opacity:0}to{opacity:1}}@keyframes kbm-scaleIn{from{opacity:0;transform:scale(.92)}to{opacity:1;transform:scale(1)}}`;
                document.head.appendChild(s);
            }

            input.focus();
            input.select();
        });
    }

    async function getToken() {
        let token = GM_getValue('kettle_github_token');
        if (!token) {
            token = await showTokenModal(
                'Токен',
                'Введите токен для установки <a href="https://confluence.skillbox.pro/pages/viewpage.action?pageId=358386673" target="_blank" style="color:#4a8fda;text-decoration:underline">скриптов для ОП</a>:',
                'github_pat_...',
                ''
            );
            if (token) {
                GM_setValue('kettle_github_token', token);
            }
        }
        return token;
    }

    GM_registerMenuCommand('🔑 Изменить токен', async () => {
        const current = GM_getValue('kettle_github_token') || '';
        const t = await showTokenModal(
            'Токен',
            'Текущий токен будет заменён на новый.',
            'github_pat_...',
            current
        );
        if (t !== null) {
            GM_setValue('kettle_github_token', t);
            location.reload();
        }
    });

    // ========== КЭШ ==========

    // Префикс kettle_ чтобы не конфликтовать с systemImproverCRM
    function cacheKey(name)  { return `kettle_cache_${name}`; }
    function cacheMeta(name) { return `kettle_meta_${name}`; }

    function getCache(name) {
        if (!KETTLE_BOOT.cache.enabled) return null;
        const meta = GM_getValue(cacheMeta(name));
        if (!meta) return null;

        const age = (Date.now() - meta.ts) / 1000 / 60;
        if (age > KETTLE_BOOT.cache.ttlMinutes) return null;

        const content = GM_getValue(cacheKey(name));
        if (!content) return null;

        return { content, sha: meta.sha, age: Math.round(age) };
    }

    function setCache(name, content, sha) {
        if (!KETTLE_BOOT.cache.enabled) return;
        GM_setValue(cacheKey(name), content);
        GM_setValue(cacheMeta(name), { ts: Date.now(), sha });
    }

    // ========== ЗАГРУЗКА ==========

    function fetchScript(url, token, retriesLeft) {
        return new Promise((resolve, reject) => {
            const attempt = (n) => {
                GM_xmlhttpRequest({
                    method: 'GET',
                    url,
                    timeout: KETTLE_BOOT.requestTimeoutMs,
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Accept': 'application/vnd.github.v3+json',
                        'User-Agent': 'Tampermonkey Kettle Bootloader',
                    },
                    onload(r) {
                        if (r.status === 200) {
                            resolve(r.responseText);
                        } else if (n > 0) {
                            log.warn(`Ретрай ${url} (${r.status})...`);
                            setTimeout(() => attempt(n - 1), KETTLE_BOOT.retryDelayMs);
                        } else {
                            reject(new Error(`HTTP ${r.status}: ${url}`));
                        }
                    },
                    onerror() {
                        if (n > 0) {
                            log.warn(`Ретрай ${url} (сеть)...`);
                            setTimeout(() => attempt(n - 1), KETTLE_BOOT.retryDelayMs);
                        } else {
                            reject(new Error(`Network error: ${url}`));
                        }
                    },
                    ontimeout() {
                        if (n > 0) {
                            log.warn(`Ретрай ${url} (таймаут)...`);
                            setTimeout(() => attempt(n - 1), KETTLE_BOOT.retryDelayMs);
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

    /**
     * Выполняет скрипт через new Function() с передачей GM_* API.
     * Скрипты Котла используют GM_* напрямую (GM_setValue, GM_addStyle и т.д.),
     * поэтому передаём захваченные ссылки из _gm.
     */
    function executeScript(name, content) {
        try {
            const gmNames = KETTLE_BOOT.gmFunctions;
            const gmRefs = gmNames.map(n => _gm[n] || null);

            const fn = new Function(...gmNames, content);
            fn(...gmRefs);

            log.ok(`${name} — выполнен`);
        } catch (e) {
            log.error(`Ошибка выполнения ${name}:`, e);
        }
    }

    // ========== ОСНОВНОЙ ПРОЦЕСС ==========

    async function loadAll() {
        log.info('loadAll() вызван');
        var token = await getToken();
        log.info('токен:', token ? 'получен' : 'отсутствует');
        if (!token) { updatePreloaderText('Ошибка: нет токена'); return; }

        var t0 = performance.now();
        log.info('Загрузка ' + KETTLE_BOOT.scripts.length + ' скриптов...');
        updatePreloaderText('Загрузка скриптов...');

        // Фаза 1: мгновенный запуск из кэша
        var needsFetch = [];

        KETTLE_BOOT.scripts.forEach(function(name) {
            // Если уже есть пропуски — всё остальное тоже на загрузку (порядок важен)
            if (needsFetch.length > 0) {
                needsFetch.push(name);
                return;
            }
            var cached = getCache(name);
            if (cached) {
                log.debug(name + ' — из кэше (' + cached.age + ' мин)');
                executeScript(name, cached.content);
                // После загрузки _shared.js — обновляем версию в футере
                if (name === '_shared.js' && window.__KETTLE && window.__KETTLE.SCRIPT_VERSION) {
                    updatePreloaderText('Версия скриптов: ' + window.__KETTLE.SCRIPT_VERSION);
                }
            } else {
                needsFetch.push(name);
            }
        });

        if (needsFetch.length === 0) {
            var elapsed = Math.round(performance.now() - t0);
            log.ok('Все из кэше за ' + elapsed + ' мс');
            updatePreloaderText('Скрипты загружены за ' + elapsed + ' мс.'); setTimeout(function() { updatePreloaderText('Версия скриптов: ' + (window.__KETTLE && window.__KETTLE.SCRIPT_VERSION || '')); }, 3000);
            setTimeout(function() { updateFooterIndicator('', 'version'); }, 3000);
            backgroundUpdate(token);
            return;
        }

        // Фаза 2: загрузка отсутствующих в кэше
        log.info('Загрузка с GitHub: ' + needsFetch.join(', '));

        // Загружаем последовательно (порядок важен — _shared.js первым)
        for (var i = 0; i < needsFetch.length; i++) {
            var name = needsFetch[i];
            var url = KETTLE_BOOT.repoBase + name;
            var ts = performance.now();
            try {
                var raw = await fetchScript(url, token, KETTLE_BOOT.retries);
                var data = JSON.parse(raw);
                var content = decodeContent(raw);

                setCache(name, content, data.sha);
                executeScript(name, content);

                // После загрузки _shared.js — обновляем версию в футере
                if (name === '_shared.js' && window.__KETTLE && window.__KETTLE.SCRIPT_VERSION) {
                    updatePreloaderText('Версия скриптов: ' + window.__KETTLE.SCRIPT_VERSION);
                }

                log.ok(name + ' — загружен за ' + Math.round(performance.now() - ts) + ' мс');
            } catch (e) {
                log.error(name + ' — ОШИБКА:', e.message);
            }
        }

        var total = Math.round(performance.now() - t0);
        log.ok('Загрузка завершена за ' + total + ' мс');
        updatePreloaderText('Скрипты загружены за ' + total + ' мс.'); setTimeout(function() { updatePreloaderText('Версия скриптов: ' + (window.__KETTLE && window.__KETTLE.SCRIPT_VERSION || '')); }, 3000);
        setTimeout(function() { updateFooterIndicator('', 'version'); }, 3000);
    }

    // Фоновая проверка обновлений для закэшированных скриптов
    // При обнаружении нового SHA — перезапускает скрипты и предлагает перезагрузку
    async function backgroundUpdate(token) {
        log.debug('Фоновая проверка обновлений...');

        var updated = [];

        for (var i = 0; i < KETTLE_BOOT.scripts.length; i++) {
            var name = KETTLE_BOOT.scripts[i];
            var url = KETTLE_BOOT.repoBase + name;
            try {
                var raw = await fetchScript(url, token, 1);
                var data = JSON.parse(raw);
                var meta = GM_getValue(cacheMeta(name));

                if (meta && meta.sha === data.sha) continue;

                var content = decodeContent(raw);
                setCache(name, content, data.sha);
                updated.push(name);
                log.debug(name + ' — обновлён в кэше (новый SHA)');
            } catch (e) {
                // Тихо — не критично
            }
        }

        GM_setValue('kettle_last_bg_check', Date.now());
        log.debug('Фоновая проверка завершена');

        if (updated.length > 0) {
            log.info('Найдены обновления:', updated.join(', '));
            GM_setValue('kettle_pending_reload', true);

            // Показываем тост с предложением перезагрузки
            var toast = document.createElement('div');
            toast.style.cssText = 'position:fixed;bottom:60px;right:16px;z-index:100001;display:flex;align-items:center;gap:10px;padding:12px 18px;border-radius:10px;background:#fff;box-shadow:0 4px 20px rgba(0,0,0,0.18);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;font-size:13px;color:#222;animation:kb-preloader-in 0.3s ease;cursor:pointer;';
            toast.innerHTML = '<span style="color:#43a047;font-weight:600">✓</span> Скрипты обновлены. <span style="color:#4a8fda;font-weight:600;text-decoration:underline">Обновить страницу</span>';
            toast.title = 'Котёл — обновления ' + updated.join(', ');
            toast.onclick = function() {
                toast.style.opacity = '0';
                toast.style.transform = 'translateY(8px)';
                toast.style.transition = 'all 0.3s ease';
                setTimeout(function() { toast.remove(); location.reload(); }, 300);
            };
            document.body.appendChild(toast);
            setTimeout(function() {
                if (toast.parentNode) {
                    toast.style.opacity = '0';
                    toast.style.transition = 'opacity 0.5s ease';
                    setTimeout(function() { toast.remove(); }, 500);
                }
            }, 15000);
        }
    }

    // Периодический полл обновлений (30 сек ± jitter)
    // GitHub API с ETag: 304 не считается против rate limit
    function watchForUpdates(token) {
        var pollUrl = 'https://api.github.com/repos/eliasreimer/managersUI/commits?per_page=1';
        var toast = null;
        var polling = true;
        var etag = null;
        var firstPoll = true; // флаг первого запроса после смены URL

        function poll() {
            if (!polling) return;
            var headers = {
                'Authorization': 'Bearer ' + token,
                'Accept': 'application/vnd.github.v3+json',
                'User-Agent': 'Tampermonkey Kettle Bootloader',
            };
            if (etag) headers['If-None-Match'] = etag;

            GM_xmlhttpRequest({
                method: 'GET',
                url: pollUrl,
                timeout: 10000,
                headers: headers,
                onload: function(r) {
                    // Сохраняем ETag для следующего запроса
                    if (r.responseHeaders) {
                        var match = r.responseHeaders.match(/ETag:\s*(\"[^\"]+\")/);
                        if (match) etag = match[1];
                    }

                    if (r.status === 304) { firstPoll = false; return; }

                    if (r.status === 200 && r.responseText) {
                        try {
                            var commits = JSON.parse(r.responseText);
                            if (!commits.length) return;
                            var latestSha = commits[0].sha;
                            var savedSha = GM_getValue('kettle_repo_sha');
                            GM_setValue('kettle_repo_sha', latestSha);

                            if (firstPoll) {
                                // Первый полл — просто синхронизируем SHA, не показываем тост
                                firstPoll = false;
                                return;
                            }

                            if (savedSha && latestSha !== savedSha) {
                                polling = false;
                                showUpdateToast();
                                return;
                            }
                        } catch (e) { /* тихо */ }
                    }
                },
                onerror: function() { /* тихо */ },
                ontimeout: function() { /* тихо */ },
            });

            // Следующий запрос с jitter ±5 сек
            if (polling) {
                var jitter = Math.floor(Math.random() * 10000) - 5000;
                setTimeout(poll, KETTLE_BOOT.pollIntervalMs + jitter);
            }
        }

        // Первый запрос через jitter чтобы разнести юзеров
        var initialDelay = Math.floor(Math.random() * 10000);
        setTimeout(poll, initialDelay);

        function showUpdateToast() {
            if (toast && toast.parentNode) return;
            toast = document.createElement('div');
            toast.id = 'kb-update-toast';
            toast.style.cssText = 'position:fixed;bottom:16px;right:16px;z-index:100001;display:flex;align-items:center;gap:10px;padding:12px 18px;border-radius:10px;background:#fff;box-shadow:0 4px 20px rgba(0,0,0,0.18);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;font-size:13px;color:#222;animation:kb-preloader-in 0.3s ease;';
            toast.innerHTML = '<span style="color:#43a047;font-weight:600">&#x2713;</span> Скрипты обновлены. <span style="color:#4a8fda;font-weight:600;text-decoration:underline;cursor:pointer">Обновить страницу</span>';

            var reloadLink = toast.querySelector('span[style*="cursor:pointer"]');
            if (reloadLink) {
                reloadLink.onclick = function(e) {
                    e.stopPropagation();
                    toast.style.opacity = '0';
                    toast.style.transform = 'translateY(8px)';
                    toast.style.transition = 'all 0.3s ease';
                    setTimeout(function() { toast.remove(); location.reload(); }, 300);
                };
            }

            document.body.appendChild(toast);
            setTimeout(function() {
                if (toast.parentNode) {
                    toast.style.opacity = '0';
                    toast.style.transition = 'opacity 0.5s ease';
                    setTimeout(function() { toast.remove(); toast = null; }, 500);
                }
            }, 30000);
        }
    }

    // ========== ЗАПУСК ==========

    log.info('Вызов loadAll()');
    loadAll().then(function() {
        watchForUpdates(GM_getValue('kettle_github_token'));
    }).catch(function(e) {
        log.error('Фатальная ошибка loadAll():', e);
        hidePreloader('Ошибка загрузки', true);
    });
