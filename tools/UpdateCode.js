/**
 * UpdateCode.js
 * Pulls bot modules from GitHub into Adventure Land CODE slots.
 *
 * Why slots may not show up:
 * - save_code REQUIRES slot as a string/number + name + code
 * - The CODE "Load" UI often needs list_codes / reopen CODE to refresh
 * - Slots 3–100 need Ancient Computer (1–2 always free)
 * - Our old "OK" log was optimistic — this version VERIFIES via list_codes
 *
 * Usage:
 *   1. Paste into a CODE slot, Save, Run
 *   2. await BOT_UPDATE.run()
 *   3. await BOT_UPDATE.list()     // shows what the server actually has
 *   4. Close/reopen CODE window if names still missing from Load dropdown
 *   5. Or chat: /loadcode DORG_Main   or   /loadcode 31
 */
(function () {
    "use strict";

    const REPO = "DouglasHerron/landmmo";
    const BRANCH = "main";

    /**
     * Fixed slot map (slot sent as STRING — matches working community scripts).
     * Change if these collide with your existing CODE.
     */
    const FILES = [
        { slot: "10", name: "CORE_Utils", path: "core/CORE_Utils.js" },
        { slot: "11", name: "CORE_Party", path: "core/CORE_Party.js" },
        { slot: "12", name: "CORE_Survival", path: "core/CORE_Survival.js" },
        { slot: "13", name: "CORE_Inventory", path: "core/CORE_Inventory.js" },
        { slot: "14", name: "CORE_Restock", path: "core/CORE_Restock.js" },
        { slot: "15", name: "CORE_Travel", path: "core/CORE_Travel.js" },
        { slot: "16", name: "CORE_Benchmark", path: "core/CORE_Benchmark.js" },
        { slot: "20", name: "WAR_Combat", path: "classes/WAR_Combat.js" },
        { slot: "21", name: "PRI_Combat", path: "classes/PRI_Combat.js" },
        { slot: "22", name: "MER_Logistics", path: "classes/MER_Logistics.js" },
        { slot: "30", name: "DORG_Config", path: "characters/DORG_Config.js" },
        { slot: "31", name: "DORG_Main", path: "characters/DORG_Main.js" },
        { slot: "32", name: "PRORG_Config", path: "characters/PRORG_Config.js" },
        { slot: "33", name: "PRORG_Main", path: "characters/PRORG_Main.js" },
        { slot: "34", name: "DORCHANT_Config", path: "characters/DORCHANT_Config.js" },
        { slot: "35", name: "DORCHANT_Main", path: "characters/DORCHANT_Main.js" },
        { slot: "40", name: "UpdateCode", path: "tools/UpdateCode.js" }
    ];

    function log(msg, color) {
        try {
            if (typeof game_log === "function") game_log(String(msg), color || "#80C0FF");
            else console.log(String(msg));
        } catch (e) { /* ignore */ }
    }

    function safeError(error) {
        try {
            if (error == null) return "Unknown error";
            if (typeof error === "string") return error;
            if (error.message) return error.message;
            return JSON.stringify(error) || String(error);
        } catch (e) {
            return String(error);
        }
    }

    function rawUrl(path) {
        // Cache-bust so syncs aren't stuck on stale jsDelivr/CDN copies
        const bust = "t=" + Date.now();
        return "https://raw.githubusercontent.com/" + REPO + "/" + BRANCH + "/" + path + "?" + bust;
    }

    function rawUrlJsdelivr(path) {
        return "https://cdn.jsdelivr.net/gh/" + REPO + "@" + BRANCH + "/" + path;
    }

    function fetchText(url) {
        return new Promise(function (resolve, reject) {
            try {
                const xhr = new XMLHttpRequest();
                xhr.open("GET", url, true);
                xhr.onreadystatechange = function () {
                    if (xhr.readyState !== 4) return;
                    if (xhr.status >= 200 && xhr.status < 300) resolve(xhr.responseText);
                    else reject(new Error("HTTP " + xhr.status + " for " + url));
                };
                xhr.onerror = function () { reject(new Error("Network error for " + url)); };
                xhr.send();
            } catch (e) {
                reject(e);
            }
        });
    }

    async function fetchCode(path) {
        try {
            return await fetchText(rawUrl(path));
        } catch (e1) {
            log("raw GitHub failed, trying jsDelivr...", "#FFD080");
            return await fetchText(rawUrlJsdelivr(path));
        }
    }

    /**
     * Fetch account code_list from the server.
     * Returns a plain map: { "10": "CORE_Utils", ... }
     */
    function listCodes() {
        return new Promise(function (resolve, reject) {
            try {
                if (!parent || typeof parent.api_call !== "function") {
                    reject(new Error("parent.api_call unavailable"));
                    return;
                }

                let settled = false;
                function done(map) {
                    if (settled) return;
                    settled = true;
                    resolve(map || {});
                }

                parent.api_call("list_codes", {
                    callback: function (payload) {
                        try {
                            // Community scripts: callback receives [ { list: {...} } ]
                            let list = null;
                            if (Array.isArray(payload) && payload[0] && payload[0].list) {
                                list = payload[0].list;
                            } else if (payload && payload.list) {
                                list = payload.list;
                            } else if (payload && typeof payload === "object") {
                                list = payload;
                            }

                            const map = {};
                            if (list) {
                                for (const key in list) {
                                    if (!Object.prototype.hasOwnProperty.call(list, key)) continue;
                                    const val = list[key];
                                    // val is either "name" or ["name", version]
                                    if (typeof val === "string") map[String(key)] = val;
                                    else if (Array.isArray(val)) map[String(key)] = val[0];
                                    else if (val && val.name) map[String(key)] = val.name;
                                }
                            }
                            done(map);
                        } catch (e) {
                            reject(e);
                        }
                    }
                });

                // Fallback if callback never fires
                setTimeout(function () {
                    if (settled) return;
                    // Try reading any client-side cache
                    try {
                        if (parent.code_list) {
                            const map = {};
                            const list = parent.code_list;
                            for (const key in list) {
                                if (!Object.prototype.hasOwnProperty.call(list, key)) continue;
                                const val = list[key];
                                if (typeof val === "string") map[String(key)] = val;
                                else if (Array.isArray(val)) map[String(key)] = val[0];
                            }
                            done(map);
                            return;
                        }
                    } catch (e) { /* ignore */ }
                    done({});
                }, 2500);
            } catch (e) {
                reject(e);
            }
        });
    }

    function saveCode(slot, name, code) {
        return new Promise(function (resolve, reject) {
            try {
                if (!parent || typeof parent.api_call !== "function") {
                    reject(new Error("parent.api_call unavailable"));
                    return;
                }

                // Working community pattern: slot as STRING
                parent.api_call("save_code", {
                    name: name,
                    slot: String(slot),
                    code: code
                });

                // Give the server a moment; real confirmation is list_codes afterward
                setTimeout(function () { resolve(true); }, 750);
            } catch (e) {
                reject(e);
            }
        });
    }

    function findFiles(filterNames) {
        if (!filterNames || !filterNames.length) return FILES.slice();
        const wanted = {};
        for (let i = 0; i < filterNames.length; i++) wanted[filterNames[i]] = true;
        return FILES.filter(function (f) { return wanted[f.name]; });
    }

    async function list() {
        log("Requesting code list from server...");
        const map = await listCodes();
        const keys = Object.keys(map).sort(function (a, b) { return Number(a) - Number(b); });
        if (!keys.length) {
            log("CODE list empty or UI not refreshed yet.", "#FFD080");
            log("Try: close CODE, reopen it, or chat /codes");
            return map;
        }
        log("=== Account CODE slots (" + keys.length + ") ===");
        for (let i = 0; i < keys.length; i++) {
            log("  slot " + keys[i] + " = " + map[keys[i]]);
        }
        return map;
    }

    async function verify() {
        const map = await listCodes();
        let missing = 0;
        for (let i = 0; i < FILES.length; i++) {
            const f = FILES[i];
            const actual = map[String(f.slot)];
            if (actual === f.name) {
                log("VERIFIED " + f.name + " @ slot " + f.slot, "#A0FFA0");
            } else {
                missing++;
                log("MISSING  " + f.name + " @ slot " + f.slot + " (found: " + (actual || "empty") + ")", "#FF8080");
            }
        }
        if (missing) {
            log(missing + " missing. If slots >= 3 fail, you need Ancient Computer.", "#FFD080");
            log("Or the Load dropdown is stale — close/reopen CODE, then await BOT_UPDATE.list()");
        } else {
            log("All bot CODE slots verified on server.", "#A0FFA0");
        }
        return { map: map, missing: missing };
    }

    /**
     * @param {string[]} [onlyNames]
     */
    async function run(onlyNames) {
        const list = findFiles(onlyNames);
        log("UpdateCode: syncing " + list.length + " file(s) from " + REPO + "@" + BRANCH);
        log("Watch chat for official 'Saved name.slot.js' messages from the game.");

        let ok = 0;
        let fail = 0;

        for (let i = 0; i < list.length; i++) {
            const file = list[i];
            try {
                log("Fetching " + file.name + " → slot " + file.slot);
                const code = await fetchCode(file.path);
                if (!code || !String(code).trim()) throw new Error("Empty response");
                await saveCode(file.slot, file.name, code);
                log("save_code sent: " + file.name + "." + file.slot + ".js", "#A0FFA0");
                ok++;
            } catch (e) {
                log("FAILED " + file.name + ": " + safeError(e), "#FF8080");
                fail++;
            }
        }

        log("Saves requested — ok_sent=" + ok + " fail=" + fail);
        log("Verifying against server code_list...");
        await new Promise(function (r) { setTimeout(r, 1000); });
        const result = await verify();

        log("If verified but Load dropdown empty: close CODE window and reopen.");
        log("Or use chat: /loadcode DORG_Main");
        return result;
    }

    function status() {
        log("await BOT_UPDATE.run()   — download + save + verify");
        log("await BOT_UPDATE.list()  — print server CODE slots");
        log("await BOT_UPDATE.verify()— check our slot map");
        return FILES;
    }

    globalThis.BOT_UPDATE = {
        REPO: REPO,
        BRANCH: BRANCH,
        FILES: FILES,
        run: run,
        list: list,
        verify: verify,
        status: status
    };

    log("UpdateCode ready");
    log("1) await BOT_UPDATE.run()");
    log("2) await BOT_UPDATE.list()");
})();
