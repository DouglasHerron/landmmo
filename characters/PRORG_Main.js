/**
 * PRORG_Main.js
 * Priest entrypoint — Run THIS slot on Prorg (Stop first).
 */
(function () {
    "use strict";

    // Adventure Land runner global (prefer window — reliable in AL console)
    var root = (typeof window !== "undefined") ? window
             : (typeof globalThis !== "undefined") ? globalThis
             : this;

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
            else if (typeof console !== "undefined") console.log(String(msg));
        } catch (e) { /* ignore */ }
    }

    // Immediate proof that THIS file started (before any loads)
    root.BOT_STATUS = { main: "PRORG_Main", phase: "starting" };
    log("PRORG_Main starting...");
    try {
        if (typeof set_message === "function") set_message("PRORG boot");
    } catch (e) { /* ignore */ }

    function clearLeftoverTimers() {
        var known = [
            "BOT_PRORG_INTERVAL",
            "BOT_DORG_INTERVAL",
            "BOT_PRI_INTERVAL",
            "BOT_WAR_INTERVAL"
        ];
        for (var i = 0; i < known.length; i++) {
            try {
                if (root[known[i]]) {
                    clearInterval(root[known[i]]);
                    clearTimeout(root[known[i]]);
                    root[known[i]] = null;
                }
            } catch (e) { /* ignore */ }
        }
        // Broad clear of prior bot loops (old PRI_Main)
        try {
            var probe = setTimeout(function () {}, 0);
            for (var id = 1; id <= probe; id++) {
                try { clearInterval(id); } catch (e1) { /* ignore */ }
                try { clearTimeout(id); } catch (e2) { /* ignore */ }
            }
        } catch (e) { /* ignore */ }
        log("Cleared leftover timers");
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

    try {
        clearLeftoverTimers();

        loadModule(32, "PRORG_Config");

        root.BOT = root.BOT || { role: "priest", config: { name: "Prorg" } };

        var modules = [
            { slot: 10, name: "CORE_Utils" },
            { slot: 11, name: "CORE_Party" },
            { slot: 12, name: "CORE_Survival" },
            { slot: 13, name: "CORE_Inventory" },
            { slot: 14, name: "CORE_Restock" },
            { slot: 15, name: "CORE_Travel" },
            { slot: 16, name: "CORE_Benchmark" },
            { slot: 21, name: "PRI_Combat" }
        ];

        for (var m = 0; m < modules.length; m++) {
            loadModule(modules[m].slot, modules[m].name);
        }

        root.BOT.party = root.BOT.party || { handle: function () { return false; } };
        root.BOT.survival = root.BOT.survival || { handle: function () { return false; } };
        root.BOT.inventory = root.BOT.inventory || { handle: function () { return false; } };
        root.BOT.restock = root.BOT.restock || { handle: function () { return false; } };
        root.BOT.travel = root.BOT.travel || { handle: function () { return false; } };
        root.BOT.combat = root.BOT.combat || { handle: function () { return false; } };
        root.BOT.benchmark = root.BOT.benchmark || { handle: function () { return false; }, report: function () {}, reset: function () {} };

        root.BOT_STATUS = {
            main: "PRORG_Main",
            phase: "running",
            party: (root.BOT.party && root.BOT.party._botVersion) || "MISSING",
            combat: (root.BOT.combat && root.BOT.combat._botVersion) || "MISSING",
            leader: (root.BOT.config && root.BOT.config.party && root.BOT.config.party.leader) || "?"
        };
        log("BOT_STATUS = " + JSON.stringify(root.BOT_STATUS));
        try {
            if (typeof set_message === "function") set_message("PRORG " + root.BOT_STATUS.party);
        } catch (e) { /* ignore */ }

        var busy = false;
        var TICK_MS = 250;

        async function mainTick() {
            if (busy) return;
            busy = true;
            try {
                if (root.BOT.party && root.BOT.party.handle) root.BOT.party.handle();
                if (root.BOT.survival && root.BOT.survival.handle && root.BOT.survival.handle()) return;
                if (root.BOT.inventory && root.BOT.inventory.handle && await root.BOT.inventory.handle()) return;
                if (root.BOT.restock && root.BOT.restock.handle && await root.BOT.restock.handle()) return;
                if (root.BOT.travel && root.BOT.travel.handle && await root.BOT.travel.handle()) return;
                if (root.BOT.combat && root.BOT.combat.handle) root.BOT.combat.handle();
                try { if (typeof loot === "function") loot(); } catch (e) { /* ignore */ }
                if (root.BOT.benchmark && root.BOT.benchmark.handle) root.BOT.benchmark.handle();
            } catch (error) {
                log("PRORG main error: " + safeError(error), "#FF8080");
            } finally {
                busy = false;
            }
        }

        root.BOT_PRORG_INTERVAL = setInterval(function () {
            mainTick();
        }, TICK_MS);

        log("PRORG_Main running. In CODE console type: BOT_STATUS");
    } catch (error) {
        root.BOT_STATUS = { main: "PRORG_Main", phase: "CRASHED", error: safeError(error) };
        log("PRORG_Main CRASHED: " + safeError(error), "#FF8080");
    }
})();
