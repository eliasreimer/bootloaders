// ==UserScript==
// @name         S2 CRM — пакет улучшений интерфейса
// @namespace    https://github.com/eliasreimer
// @version      2025.08.16
// @description  Основной функционал CRM
// @author       Elias Reimer
// @match        https://crm.corp.skillbox.pro/*
// @grant        GM_xmlhttpRequest
// @grant        GM_notification
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @connect      github.com
// @connect      api.github.com
// @connect      raw.githubusercontent.com
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    const MODULES = [
        { name: "Даты создания/обновления", url: "createdUpdatedDates.js" },
        { name: "Информация об экспорте", url: "whoExportedIt.js" },
        { name: "Копирование ID", url: "copyID.js" },
        { name: "Активность просмотра", url: "viewingActivity.js" }
    ];

    const REPO_URL = "https://api.github.com/repos/eliasreimer/systemImproverCRM/contents/";
    const RAW_REPO_URL = "https://raw.githubusercontent.com/eliasreimer/systemImproverCRM/main/";

    // Инициализация
    initLoader();

    function initLoader() {
        if (!window.S2_CRM) {
            window.S2_CRM = {
                version: "2025.08.16",
                modules: {},
                utils: {
                    loadModule,
                    showAlert,
                    getToken
                }
            };
        }

        if (getToken()) {
            loadAllModules();
        } else {
            promptForToken();
        }
    }

    function getToken() {
        return GM_getValue('s2_crm_token');
    }

    function promptForToken() {
        GM_registerMenuCommand("🔑 Установить GitHub токен", () => {
            const token = prompt("Введите GitHub Personal Access Token:", "");
            if (token) {
                GM_setValue('s2_crm_token', token.trim());
                showAlert("Токен сохранён", "success");
                loadAllModules();
            }
        });
        
        showAlert(
            "Требуется аутентификация",
            "Для работы S2 CRM необходим GitHub токен. Откройте меню Tampermonkey и выберите '🔑 Установить GitHub токен'",
            "warning"
        );
    }

    async function loadAllModules() {
        showAlert("Начало загрузки модулей...", "info");
        
        for (const module of MODULES) {
            try {
                await loadModule(module);
            } catch (e) {
                console.error(`[S2 CRM] Ошибка загрузки ${module.name}:`, e);
                showAlert(`Ошибка в модуле ${module.name}`, e.message, "error");
            }
        }
    }

    function loadModule(module) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: "GET",
                url: RAW_REPO_URL + module.url + "?t=" + Date.now(),
                timeout: 8000,
                onload: function(r) {
                    if (r.status === 200) {
                        try {
                            executeScript(r.responseText, module.name);
                            resolve();
                        } catch (e) {
                            reject(new Error(`Ошибка выполнения: ${e.message}`));
                        }
                    } else {
                        reject(new Error(`HTTP ${r.status}: ${r.statusText}`));
                    }
                },
                onerror: reject,
                ontimeout: () => reject(new Error("Таймаут загрузки"))
            });
        });
    }

    function executeScript(content, moduleName) {
        const script = document.createElement('script');
        script.textContent = `(function() { 
            try {
                ${content}
                console.log('[S2 CRM] Модуль "${moduleName}" успешно загружен');
            } catch(e) {
                console.error('[S2 CRM] Ошибка в модуле "${moduleName}":', e);
            }
        })();`;
        document.head.appendChild(script);
        script.remove();
    }

    function showAlert(title, message, type = "info") {
        const colors = {
            info: "#3498db",
            success: "#2ecc71",
            warning: "#f39c12",
            error: "#e74c3c"
        };
        
        GM_notification({
            title: `S2 CRM: ${title}`,
            text: message,
            highlight: true,
            timeout: type === "error" ? 8000 : 5000,
            image: `https://via.placeholder.com/64/${colors[type].slice(1)}/ffffff?text=${type[0].toUpperCase()}`
        });
    }
})();
