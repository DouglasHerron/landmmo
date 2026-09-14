/**
 * DORG_Main.js
 * Warrior entrypoint — load this CODE slot on Dorg.
 *
 * Load order: Config → CORE modules → WAR_Combat → main loop
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
    loadModule("DORG_Config");

    // Ensure config exists even if Config slot failed
    globalThis.BOT = globalThis.BOT || {
        role: "warrior",
        config: { name: "Dorg" }
    };

    const modules = [
        "CORE_Utils",
        "CORE_Party",
        "CORE_Survival",
        "CORE_Inventory",
        "CORE_Restock",
        "CORE_Travel",
        "CORE_Benchmark",
        "WAR_Combat"
    ];

    for (let i = 0; i < modules.length; i++) {
        loadModule(modules[i]);
    }

    // Guard missing modules
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
            // 1. Party management
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

            // 5. Travel
            if (BOT.travel && typeof BOT.travel.handle === "function") {
                if (await BOT.travel.handle()) {
                    return;
                }
            }

            // 6. Combat
            if (BOT.combat && typeof BOT.combat.handle === "function") {
                BOT.combat.handle();
            }

            // 7. Loot (also done in combat; extra safety)
            try {
                if (typeof loot === "function") loot();
            } catch (e) { /* ignore */ }

            // 8. Benchmark update
            if (BOT.benchmark && typeof BOT.benchmark.handle === "function") {
                BOT.benchmark.handle();
            }
        } catch (error) {
            log("DORG main error: " + safeError(error), "#FF8080");
        } finally {
            busy = false;
        }
    }

    // Clear previous intervals if reloading
    if (globalThis.BOT_DORG_INTERVAL) {
        try { clearInterval(globalThis.BOT_DORG_INTERVAL); } catch (e) { /* ignore */ }
    }

    globalThis.BOT_DORG_INTERVAL = setInterval(function () {
        mainTick();
    }, TICK_MS);

    log("DORG_Main running — farm=" + ((BOT.config.farm && BOT.config.farm.monster) || "?"));
    log("Commands: BOT.benchmark.report() / BOT.benchmark.reset()");
})();
