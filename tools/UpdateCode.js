/**
 * UpdateCode.js
 * Pulls bot modules from a public GitHub repo and writes them into
 * Adventure Land saved CODE slots via parent.api_call("save_code", ...).
 *
 * IMPORTANT:
 * - Adventure Land REQUIRES a numeric `slot` to save. Name alone is not enough.
 * - You do NOT need empty slots created first — save_code creates/overwrites by slot #.
 * - Slots 3–100 need an Ancient Computer unlock (slots 1–2 are always free).
 *
 * SECURITY:
 * - Do NOT put GitHub PATs, passwords, or API keys in this file.
 *
 * Usage:
 *   1. Paste this file into ONE CODE slot (any free slot), name it UpdateCode, SAVE, RUN
 *   2. In the CODE console / runner:
 *        await BOT_UPDATE.run()
 *   3. Open CODE list and confirm new named slots appeared
 *   4. On Dorg: load_code("DORG_Main")   On Prorg: load_code("PRORG_Main")
 */
(function () {
    "use strict";

    const REPO = "DouglasHerron/landmmo";
    const BRANCH = "main";

    /**
     * Fixed slot map.
     * Change numbers if they collide with your existing CODE.
     * load_code("Name") works by name once saved — slot is only for save_code.
     */
    const FILES = [
        { slot: 10, name: "CORE_Utils", path: "core/CORE_Utils.js" },
        { slot: 11, name: "CORE_Party", path: "core/CORE_Party.js" },
        { slot: 12, name: "CORE_Survival", path: "core/CORE_Survival.js" },
        { slot: 13, name: "CORE_Inventory", path: "core/CORE_Inventory.js" },
        { slot: 14, name: "CORE_Restock", path: "core/CORE_Restock.js" },
        { slot: 15, name: "CORE_Travel", path: "core/CORE_Travel.js" },
        { slot: 16, name: "CORE_Benchmark", path: "core/CORE_Benchmark.js" },
        { slot: 20, name: "WAR_Combat", path: "classes/WAR_Combat.js" },
        { slot: 21, name: "PRI_Combat", path: "classes/PRI_Combat.js" },
        { slot: 30, name: "DORG_Config", path: "characters/DORG_Config.js" },
        { slot: 31, name: "DORG_Main", path: "characters/DORG_Main.js" },
        { slot: 32, name: "PRORG_Config", path: "characters/PRORG_Config.js" },
        { slot: 33, name: "PRORG_Main", path: "characters/PRORG_Main.js" },
        { slot: 40, name: "UpdateCode", path: "tools/UpdateCode.js" }
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
        // jsDelivr often works when raw.githubusercontent.com is blocked
        return "https://cdn.jsdelivr.net/gh/" + REPO + "@" + BRANCH + "/" + path;
    }

    function rawUrlGithub(path) {
        return "https://raw.githubusercontent.com/" + REPO + "/" + BRANCH + "/" + path;
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
            log("jsDelivr failed, trying raw.githubusercontent.com ...", "#FFD080");
            return await fetchText(rawUrlGithub(path));
        }
    }

    function saveCode(slot, name, code) {
        return new Promise(function (resolve, reject) {
            try {
                if (!parent || typeof parent.api_call !== "function") {
                    reject(new Error("parent.api_call unavailable — run this inside Adventure Land CODE"));
                    return;
                }
                if (slot == null || slot === "") {
                    reject(new Error("No slot number for " + name));
                    return;
                }

                // Official API requires: slot (number), name, code
                parent.api_call("save_code", {
                    slot: slot,
                    name: name,
                    code: code
                });

                log("save_code requested: " + name + " → slot " + slot);
                setTimeout(function () { resolve(true); }, 600);
            } catch (e) {
                reject(e);
            }
        });
    }

    function refreshCodeList() {
        try {
            if (parent && typeof parent.api_call === "function") {
                parent.api_call("list_codes", {});
            }
        } catch (e) {
            // optional
        }
    }

    function findFiles(filterNames) {
        if (!filterNames || !filterNames.length) return FILES.slice();
        const wanted = {};
        for (let i = 0; i < filterNames.length; i++) wanted[filterNames[i]] = true;
        return FILES.filter(function (f) { return wanted[f.name]; });
    }

    /**
     * @param {string[]} [onlyNames] optional CODE names to update
     */
    async function run(onlyNames) {
        const list = findFiles(onlyNames);
        log("UpdateCode: syncing " + list.length + " file(s) from " + REPO + "@" + BRANCH);

        let ok = 0;
        let fail = 0;

        for (let i = 0; i < list.length; i++) {
            const file = list[i];
            try {
                log("Fetching " + file.name + " (slot " + file.slot + ") ...");
                const code = await fetchCode(file.path);
                if (!code || !String(code).trim()) {
                    throw new Error("Empty response");
                }
                if (String(code).indexOf("404") === 0 && code.length < 40) {
                    throw new Error("Looks like a 404 page");
                }
                await saveCode(file.slot, file.name, code);
                log("OK " + file.name + "." + file.slot + ".js", "#A0FFA0");
                ok++;
            } catch (e) {
                log("FAILED " + file.name + ": " + safeError(e), "#FF8080");
                fail++;
            }
        }

        refreshCodeList();
        log("UpdateCode done — ok=" + ok + " fail=" + fail, fail ? "#FFD080" : "#A0FFA0");
        log("Open CODE and look for slots 10–16, 20–21, 30–33, 40");
        return { ok: ok, fail: fail };
    }

    function status() {
        log("BOT_UPDATE ready. Call: await BOT_UPDATE.run()");
        log("Slot map:");
        for (let i = 0; i < FILES.length; i++) {
            const f = FILES[i];
            log("  " + f.slot + " = " + f.name);
        }
        return FILES;
    }

    globalThis.BOT_UPDATE = {
        REPO: REPO,
        BRANCH: BRANCH,
        FILES: FILES,
        run: run,
        status: status,
        rawUrl: rawUrl
    };

    log("UpdateCode ready — run: await BOT_UPDATE.run()");
    log("(Not just BOT_UPDATE — you need .run())");
})();
