(function() {
    'use strict';

    const DEBUG = false;

    const SCRIPT_URLS = [
        "https://api.github.com/repos/eliasreimer/managersUI/contents/keetleCRM.js"
    ];

    const TOKEN_KEY = 'github_token_crm';

    function getGitHubToken() {
        let token = GM_getValue(TOKEN_KEY);

        if (!token) {
            token = prompt(
                '❗️ Введите токен для доступа к улучшениям S2 CRM:',
                'github_pat_...'
            );

            if (token) {
                GM_setValue(TOKEN_KEY, token);
                GM_notification({
                    title: '✅ Токен сохранён!',
                    timeout: 3000
                });
            }
        }

        return token;
    }

    GM_registerMenuCommand("Сменить токен для доступа к улучшениям S2 CRM", function() {
        const newToken = prompt(
            '❗️ Введите новый токен:',
            GM_getValue(TOKEN_KEY) || ''
        );

        if (newToken !== null) {
            GM_setValue(TOKEN_KEY, newToken);
            GM_notification({
                title: '✅ Токен обновлён!',
                timeout: 3000
            });
        }
    });

    function executeScript(scriptContent) {
        try {
            // Выполняем код в текущем контексте (userscript), чтобы были доступны GM_* функции
            eval(scriptContent);
        } catch (error) {
            if (DEBUG) console.error('[S2 CRM] Ошибка выполнения:', error);
            GM_notification({
                title: 'Ошибка выполнения!',
                text: error.message,
                timeout: 5000
            });
        }
    }

    function loadScripts() {
        const token = getGitHubToken();
        if (!token) return;

        SCRIPT_URLS.forEach(url => {
            GM_xmlhttpRequest({
                method: "GET",
                url: url,
                headers: {
                    "Authorization": `Bearer ${token}`,
                    "Accept": "application/vnd.github.v3+json",
                    "User-Agent": "Tampermonkey"
                },
                onload: function(response) {
                    if (response.status === 200) {
                        try {
                            const data = JSON.parse(response.responseText);
                            const base64Content = data.content.replace(/\s/g, '');
                            const binaryContent = atob(base64Content);
                            const scriptContent = new TextDecoder("utf-8").decode(
                                new Uint8Array([...binaryContent].map(c => c.charCodeAt(0)))
                            );

                            executeScript(scriptContent);
                            if (DEBUG) console.log(`[S2 CRM] Загружен: ${url}`);
                        } catch (parseError) {
                            if (DEBUG) console.error('[S2 CRM] Ошибка обработки:', parseError);
                            GM_notification({
                                title: 'Ошибка обработки!',
                                text: `URL: ${url}\n${parseError.message}`,
                                timeout: 5000
                            });
                        }
                    } else {
                        if (DEBUG) console.error(`[S2 CRM] Ошибка загрузки ${url}:`, response.status);
                        GM_notification({
                            title: 'Ошибка загрузки!',
                            text: `Статус ${response.status} при запросе ${url}. Проверьте токен.`,
                            timeout: 5000
                        });
                    }
                },
                onerror: function(error) {
                    if (DEBUG) console.error(`[S2 CRM] Сетевая ошибка ${url}:`, error);
                    GM_notification({
                        title: 'Ошибка сети!',
                        text: `Не удалось загрузить ${url}`,
                        timeout: 5000
                    });
                }
            });
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', loadScripts);
    } else {
        loadScripts();
    }

})();
