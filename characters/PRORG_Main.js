/**
 * PRORG_Main.js
 * Priest entrypoint — load this CODE slot on Prorg.
 *
 * IMPORTANT: Always STOP code before running this, or old PRI_Main
 * intervals keep inviting/requesting forever in the background.
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

    /**
     * Kill leftover intervals/timeouts from old PRI_Main / previous runs.
     * Standard Adventure Land reload pattern.
     */
    function clearLeftoverTimers() {
        const known = [
            "BOT_PRORG_INTERVAL",
            "BOT_DORG_INTERVAL",
            "BOT_PRI_INTERVAL",
            "BOT_WAR_INTERVAL",
            "mainInterval",
            "attack_interval",
            "party_interval"
        ];
        for (let i = 0; i < known.length; i++) {
            const key = known[i];
            try {
                if (globalThis[key]) {
                    clearInterval(globalThis[key]);
                    clearTimeout(globalThis[key]);
                    globalThis[key] = null;
                }
            } catch (e) { /* ignore */ }
        }

        // Broad clear — stops old PRI_Main setIntervals that weren't stored on a global
        try {
            const probe = setTimeout(function () {}, 0);
            for (let id = 1; id <= probe; id++) {
                try { clearInterval(id); } catch (e) { /* ignore */ }
                try { clearTimeout(id); } catch (e) { /* ignore */ }
            }
        } catch (e) { /* ignore */ }

        log("Cleared leftover timers (old PRI_Main loops included)");
    }

    function loadModule(slot, label) {
        try {
            if (typeof load_code !== "function") throw new Error("load_code unavailable");
            load_code(String(slot));
            log("Loaded " + label + " (slot " + slot + ")");
            return true;
        } catch (e) {
            log("FAILED " + label + " slot " + slot + ": " + safeError(e), "#FF8080");
            return false;
        }
    }

    clearLeftoverTimers();

    loadModule(32, "PRORG_Config");

    globalThis.BOT = globalThis.BOT || {
        role: "priest",
        config: { name: "Prorg" }
    };

    const modules = [
        { slot: 10, name: "CORE_Utils" },
        { slot: 11, name: "CORE_Party" },
        { slot: 12, name: "CORE_Survival" },
        { slot: 13, name: "CORE_Inventory" },
        { slot: 14, name: "CORE_Restock" },
        { slot: 15, name: "CORE_Travel" },
        { slot: 16, name: "CORE_Benchmark" },
        { slot: 21, name: "PRI_Combat" }
    ];

    for (let i = 0; i < modules.length; i++) {
        loadModule(modules[i].slot, modules[i].name);
    }

    BOT.party = BOT.party || { handle: function () { return false; } };
    BOT.survival = BOT.survival || { handle: function () { return false; } };
    BOT.inventory = BOT.inventory || { handle: async function () { return false; } };
    BOT.restock = BOT.restock || { handle: async function () { return false; } };
    BOT.travel = BOT.travel || { handle: async function () { return false; } };
    BOT.combat = BOT.combat || { handle: function () { return false; } };
    BOT.benchmark = BOT.benchmark || { handle: function () { return false; }, report: function () {}, reset: function () {} };

    if (!BOT.party || BOT.party._botVersion !== "party-v2") {
        log("WARN: CORE_Party is not party-v2 — sync slot 11", "#FFD080");
    } else {
        log("Party module OK (party-v2, follower event-only)");
    }

    if (!BOT.combat || BOT.combat._botVersion !== "shared-v1") {
        log("WARN: BOT.combat is not shared-v1 PRI_Combat — check slot 21", "#FFD080");
    }

    let busy = false;
    const TICK_MS = 250;

    async function mainTick() {
        if (busy) return;
        busy = true;
        try {
            if (BOT.party && typeof BOT.party.handle === "function") BOT.party.handle();
            if (BOT.survival && typeof BOT.survival.handle === "function") {
                if (BOT.survival.handle()) return;
            }
            if (BOT.inventory && typeof BOT.inventory.handle === "function") {
                if (await BOT.inventory.handle()) return;
            }
            if (BOT.restock && typeof BOT.restock.handle === "function") {
                if (await BOT.restock.handle()) return;
            }
            if (BOT.travel && typeof BOT.travel.handle === "function") {
                if (await BOT.travel.handle()) return;
            }
            if (BOT.combat && typeof BOT.combat.handle === "function") BOT.combat.handle();
            try { if (typeof loot === "function") loot(); } catch (e) { /* ignore */ }
            if (BOT.benchmark && typeof BOT.benchmark.handle === "function") BOT.benchmark.handle();
        } catch (error) {
            log("PRORG main error: " + safeError(error), "#FF8080");
        } finally {
            busy = false;
        }
    }

    globalThis.BOT_PRORG_INTERVAL = setInterval(function () {
        mainTick();
    }, TICK_MS);

    log("PRORG_Main running — leader=" + ((BOT.config.party && BOT.config.party.leader) || "?"));
    log("Do NOT also run PRI_Main. Check: BOT.party._botVersion");
})();
