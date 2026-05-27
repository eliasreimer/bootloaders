// ==UserScript==
// @name         S2 CRM. Инструменты и улучшения для ОП.
// @version      2026.05.27.2
// @description  ...
// @author       Elias Reimer ilya.raymer@skillbox.ru
// @match        https://crm.corp.skillbox.pro/*
// @grant        GM_xmlhttpRequest
// @grant        GM_notification
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_addStyle
// @grant        GM_registerMenuCommand
// @connect      github.com
// @connect      api.github.com
// @connect      raw.githubusercontent.com
// @connect      utsp.corp.skillbox.pro
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    // Сброс кэша при обновлении shell-скрипта
    var SHELL_VERSION = '2026.05.27.2';
    var lastShellVer = GM_getValue('kettle_shell_version') || '';
    if (lastShellVer !== SHELL_VERSION) {
        ['_shared.js', 'keetleCRM.js', 'kettleAdmin.js'].forEach(function(name) {
            GM_setValue('kettle_cache_' + name, null);
            GM_setValue('kettle_meta_' + name, null);
        });
        GM_setValue('kettle_shell_version', SHELL_VERSION);
        console.log('[Котёл] Shell обновлён до ' + SHELL_VERSION + ' — кэш сброшен');
    }

    const URL = 'https://raw.githubusercontent.com/eliasreimer/bootloaders/master/managersUILoader.js';

    GM_xmlhttpRequest({
        method: 'GET',
        url: URL,
        onload(r) {
            if (r.status !== 200) return console.error('[Котёл] Ошибка загрузчика:', r.status);
            try {
                const fn = new Function(
                    'GM_xmlhttpRequest','GM_notification','GM_getValue','GM_setValue','GM_deleteValue','GM_addStyle','GM_registerMenuCommand',
                    r.responseText
                );
                fn(GM_xmlhttpRequest, GM_notification, GM_getValue, GM_setValue, GM_deleteValue, GM_addStyle, GM_registerMenuCommand);
            } catch(e) { console.error('[Котёл]', e); }
        },
        onerror(e) { console.error('[Котёл] Ошибка сети:', e); },
    });
})();
