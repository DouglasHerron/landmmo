/**
 * PRORG_Main.js
 * Priest entrypoint — load this CODE slot on Prorg.
 *
 * Load order: Config → CORE modules → PRI_Combat → main loop
 */
(function () {
    "use strict";

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

    function log(msg, color) {
        try {
            if (typeof game_log === "function") game_log(String(msg), color || "#A0FFA0");
            else console.log(String(msg));
        } catch (e) { /* ignore */ }
    }

    function loadModule(name) {
        try {
            if (typeof load_code !== "function") {
                throw new Error("load_code unavailable");
            }
            load_code(name);
            log("Loaded " + name);
            return true;
        } catch (e) {
            log("FAILED to load " + name + ": " + safeError(e), "#FF8080");
            return false;
        }
    }

    // --- Bootstrap ---
    loadModule("PRORG_Config");

    globalThis.BOT = globalThis.BOT || {
        role: "priest",
        config: { name: "Prorg" }
    };

    const modules = [
        "CORE_Utils",
        "CORE_Party",
        "CORE_Survival",
        "CORE_Inventory",
        "CORE_Restock",
        "CORE_Travel",
        "CORE_Benchmark",
        "PRI_Combat"
    ];

    for (let i = 0; i < modules.length; i++) {
        loadModule(modules[i]);
    }

    BOT.party = BOT.party || { handle: function () { return false; } };
    BOT.survival = BOT.survival || { handle: function () { return false; } };
    BOT.inventory = BOT.inventory || { handle: async function () { return false; } };
    BOT.restock = BOT.restock || { handle: async function () { return false; } };
    BOT.travel = BOT.travel || { handle: async function () { return false; } };
    BOT.combat = BOT.combat || { handle: function () { return false; } };
    BOT.benchmark = BOT.benchmark || { handle: function () { return false; }, report: function () {}, reset: function () {} };

    let busy = false;
    const TICK_MS = 250;

    async function mainTick() {
        if (busy) return;
        busy = true;

        try {
            // 1. Party management (accept invite / request fallback)
            if (BOT.party && typeof BOT.party.handle === "function") {
                BOT.party.handle();
            }

            // 2. Death / survival
            if (BOT.survival && typeof BOT.survival.handle === "function") {
                if (BOT.survival.handle()) {
                    return;
                }
            }

            // 3. Inventory cleanup
            if (BOT.inventory && typeof BOT.inventory.handle === "function") {
                if (await BOT.inventory.handle()) {
                    return;
                }
            }

            // 4. Restock
            if (BOT.restock && typeof BOT.restock.handle === "function") {
                if (await BOT.restock.handle()) {
                    return;
                }
            }

            // 5. Travel — priest has no farm.monster; follow is handled in combat
            if (BOT.travel && typeof BOT.travel.handle === "function") {
                if (await BOT.travel.handle()) {
                    return;
                }
            }

            // 6. Combat (heal / follow / assist)
            if (BOT.combat && typeof BOT.combat.handle === "function") {
                BOT.combat.handle();
            }

            // 7. Loot
            try {
                if (typeof loot === "function") loot();
            } catch (e) { /* ignore */ }

            // 8. Benchmark update
            if (BOT.benchmark && typeof BOT.benchmark.handle === "function") {
                BOT.benchmark.handle();
            }
        } catch (error) {
            log("PRORG main error: " + safeError(error), "#FF8080");
        } finally {
            busy = false;
        }
    }

    if (globalThis.BOT_PRORG_INTERVAL) {
        try { clearInterval(globalThis.BOT_PRORG_INTERVAL); } catch (e) { /* ignore */ }
    }

    globalThis.BOT_PRORG_INTERVAL = setInterval(function () {
        mainTick();
    }, TICK_MS);

    log("PRORG_Main running — leader=" + ((BOT.config.party && BOT.config.party.leader) || "?"));
    log("Commands: BOT.benchmark.report() / BOT.benchmark.reset()");
})();
