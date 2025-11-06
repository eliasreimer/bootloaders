(function() {
    'use strict';

    const urls = [
        "https://api.github.com/repos/eliasreimer/systemImproverCRM/contents/copyID.js",
        "https://api.github.com/repos/eliasreimer/systemImproverCRM/contents/scenariosInfo.js",      
        "https://api.github.com/repos/eliasreimer/systemImproverCRM/contents/whoExportedIt.js",        
        "https://api.github.com/repos/eliasreimer/systemImproverCRM/contents/viewingActivity.js",
        "https://api.github.com/repos/eliasreimer/systemImproverCRM/contents/nestedScenarios.js",
        "https://api.github.com/repos/eliasreimer/systemImproverCRM/contents/helperApi.js"
    ];

    // Получение токена
    function getGitHubToken() {
        let token = GM_getValue('github_token');

        if (!token) {
            token = prompt(
                'Введите токен для systemImproverCRM:',
                'github_pat_...'
            );

            if (token) {
                GM_setValue('github_token', token);
                GM_notification({
                    title: 'Отлично!',
                    text: 'Токен был успешно сохранён.',
                    timeout: 3000
                });
            }
        }

        return token;
    }

    // Команда в меню Tampermonkey для смены токена
    GM_registerMenuCommand("Изменить токен для systemImproverCRM", function() {
        const newToken = prompt(
            'Введите новый токен для systemImproverCRM:',
            GM_getValue('github_token') || ''
        );

        if (newToken !== null) {
            GM_setValue('github_token', newToken);
            GM_notification({
                title: 'Отлично!',
                text: 'Новый токен был успешно сохранён.',
                timeout: 3000
            });
        }
    });

    // Выполнение скрипта
    function executeScript(scriptContent) {
        try {
            const script = document.createElement('script');
            script.textContent = `(function() { ${scriptContent} })();`;
            (document.head || document.body || document.documentElement).appendChild(script);
            script.remove();
        } catch (error) {
            console.error('Ошибка выполнения скрипта:', error);
            GM_notification({
                title: 'Ошибка выполнения скрипта',
                text: error.message,
                timeout: 5000
            });
        }
    }

    // Основная функция загрузки
    function loadScripts() {
        const token = getGitHubToken();
        if (!token) return;

        urls.forEach(url => {
            GM_xmlhttpRequest({
                method: "GET",
                url: url,
                headers: {
                    "Authorization": `Bearer ${token}`,
                    "Accept": "application/vnd.github.v3+json",
                    "User-Agent": "Tampermonkey GitHub Script Loader"
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
                        } catch (parseError) {
                            console.error('Ошибка обработки ответа:', parseError);
                            GM_notification({
                                title: 'Ошибка обработки скрипта',
                                text: `URL: ${url}\nОшибка: ${parseError.message}`,
                                timeout: 5000
                            });
                        }
                    } else {
                        console.error(`Ошибка загрузки ${url}:`, response.status, response.responseText);
                        GM_notification({
                            title: 'Ошибка загрузки',
                            text: `URL: ${url}\nStatus: ${response.status}\n${response.statusText}`,
                            timeout: 5000
                        });
                    }
                },
                onerror: function(error) {
                    console.error(`Ошибка запроса для ${url}:`, error);
                    GM_notification({
                        title: 'Ошибка сети',
                        text: `URL: ${url}\nОшибка: ${error.statusText || 'Неизвестная ошибка'}`,
                        timeout: 5000
                    });
                }
            });
        });
    }

    // Загрузка
    loadScripts();
})();
