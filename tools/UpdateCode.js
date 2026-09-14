/**
 * UpdateCode.js
 * Pulls bot modules from a public GitHub repo and writes them into
 * Adventure Land saved CODE slots via parent.api_call("save_code", ...).
 *
 * SECURITY:
 * - Do NOT put GitHub PATs, passwords, or API keys in this file.
 * - Use a public repo, or paste code manually if the repo is private.
 *
 * Usage (in Adventure Land CODE console / a CODE slot):
 *   1. Edit REPO / BRANCH below if needed
 *   2. Run / load this file
 *   3. Call: await BOT_UPDATE.run()
 *      or:    await BOT_UPDATE.run(["DORG_Main", "CORE_Party"])
 */
(function () {
    "use strict";

    // --- Configure these for your fork ---
    const REPO = "DouglasHerron/landmmo";
    const BRANCH = "main";

    /**
     * CODE slot name → repo-relative path
     * Slot names must match what load_code("...") expects in Main files.
     */
    const FILES = [
        { name: "CORE_Utils", path: "core/CORE_Utils.js" },
        { name: "CORE_Party", path: "core/CORE_Party.js" },
        { name: "CORE_Survival", path: "core/CORE_Survival.js" },
        { name: "CORE_Inventory", path: "core/CORE_Inventory.js" },
        { name: "CORE_Restock", path: "core/CORE_Restock.js" },
        { name: "CORE_Travel", path: "core/CORE_Travel.js" },
        { name: "CORE_Benchmark", path: "core/CORE_Benchmark.js" },
        { name: "WAR_Combat", path: "classes/WAR_Combat.js" },
        { name: "PRI_Combat", path: "classes/PRI_Combat.js" },
        { name: "DORG_Config", path: "characters/DORG_Config.js" },
        { name: "DORG_Main", path: "characters/DORG_Main.js" },
        { name: "PRORG_Config", path: "characters/PRORG_Config.js" },
        { name: "PRORG_Main", path: "characters/PRORG_Main.js" },
        { name: "UpdateCode", path: "tools/UpdateCode.js" }
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
        return "https://raw.githubusercontent.com/" + REPO + "/" + BRANCH + "/" + path;
    }

    function fetchText(url) {
        return new Promise(function (resolve, reject) {
            try {
                if (typeof fetch === "function") {
                    fetch(url)
                        .then(function (res) {
                            if (!res.ok) throw new Error("HTTP " + res.status + " for " + url);
                            return res.text();
                        })
                        .then(resolve)
                        .catch(reject);
                    return;
                }
            } catch (e) {
                // fall through to XHR
            }

            try {
                const xhr = new XMLHttpRequest();
                xhr.open("GET", url, true);
                xhr.onreadystatechange = function () {
                    if (xhr.readyState !== 4) return;
                    if (xhr.status >= 200 && xhr.status < 300) resolve(xhr.responseText);
                    else reject(new Error("XHR " + xhr.status + " for " + url));
                };
                xhr.onerror = function () { reject(new Error("XHR network error")); };
                xhr.send();
            } catch (e) {
                reject(e);
            }
        });
    }

    function saveCode(name, code) {
        return new Promise(function (resolve, reject) {
            try {
                if (!parent || typeof parent.api_call !== "function") {
                    reject(new Error("parent.api_call unavailable"));
                    return;
                }

                // Adventure Land save_code — name-based slot
                parent.api_call(
                    "save_code",
                    {
                        name: name,
                        code: code
                    },
                    function () {
                        resolve(true);
                    }
                );

                // Some clients don't invoke the callback reliably; resolve after short delay
                setTimeout(function () { resolve(true); }, 800);
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

    /**
     * @param {string[]} [onlyNames] optional list of CODE names to update
     */
    async function run(onlyNames) {
        const list = findFiles(onlyNames);
        log("UpdateCode: syncing " + list.length + " file(s) from " + REPO + "@" + BRANCH);

        let ok = 0;
        let fail = 0;

        for (let i = 0; i < list.length; i++) {
            const file = list[i];
            const url = rawUrl(file.path);
            try {
                log("Fetching " + file.name + " ...");
                const code = await fetchText(url);
                if (!code || !String(code).trim()) {
                    throw new Error("Empty response");
                }
                await saveCode(file.name, code);
                log("Saved CODE slot: " + file.name, "#A0FFA0");
                ok++;
            } catch (e) {
                log("FAILED " + file.name + ": " + safeError(e), "#FF8080");
                fail++;
            }
        }

        log("UpdateCode done — ok=" + ok + " fail=" + fail, fail ? "#FFD080" : "#A0FFA0");
        return { ok: ok, fail: fail };
    }

    globalThis.BOT_UPDATE = {
        REPO: REPO,
        BRANCH: BRANCH,
        FILES: FILES,
        run: run,
        rawUrl: rawUrl
    };

    log("UpdateCode ready — await BOT_UPDATE.run()");
})();
