/**
 * DORCHANT_Main.js
 * Merchant entrypoint — Run THIS slot on Dorchant (Stop first).
 */
(function () {
    "use strict";

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

    /** AL CODE console often can't see runner locals — publish everywhere. */
    function publishStatus(status) {
        try { if (typeof globalThis !== "undefined") globalThis.BOT_STATUS = status; } catch (e0) { /* ignore */ }
        try { if (typeof window !== "undefined") window.BOT_STATUS = status; } catch (e1) { /* ignore */ }
        try { if (root) root.BOT_STATUS = status; } catch (e2) { /* ignore */ }
        try {
            if (typeof parent !== "undefined" && parent && parent !== root) {
                parent.BOT_STATUS = status;
            }
        } catch (e3) { /* ignore */ }
        try {
            if (root.BOT) {
                root.BOT.status = status;
                root.BOT.getStatus = function () {
                    log(JSON.stringify(status));
                    return status;
                };
            }
        } catch (e4) { /* ignore */ }
        return status;
    }

    publishStatus({ main: "DORCHANT_Main", phase: "starting" });
    log("DORCHANT_Main starting...");
    try {
        if (typeof set_message === "function") set_message("DORCHANT boot");
    } catch (e) { /* ignore */ }

    function clearLeftoverTimers() {
        var known = [
            "BOT_DORCHANT_INTERVAL",
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
        // Only clear our known bot intervals — do NOT nuke all timer IDs
        log("Cleared leftover bot timers");
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

        loadModule(34, "DORCHANT_Config");

        // Prefer existing BOT from Config (globalThis); keep window in sync
        try {
            if (typeof globalThis !== "undefined" && globalThis.BOT) root.BOT = globalThis.BOT;
        } catch (e) { /* ignore */ }
        root.BOT = root.BOT || { role: "merchant", config: { name: "Dorchant" } };
        try { if (typeof globalThis !== "undefined") globalThis.BOT = root.BOT; } catch (e2) { /* ignore */ }

        var modules = [
            { slot: 10, name: "CORE_Utils" },
            { slot: 11, name: "CORE_Party" },
            { slot: 12, name: "CORE_Survival" },
            { slot: 17, name: "CORE_TownNav" },
            { slot: 13, name: "CORE_Inventory" },
            { slot: 14, name: "CORE_Restock" },
            { slot: 16, name: "CORE_Benchmark" },
            { slot: 22, name: "MER_Logistics" }
        ];

        for (var m = 0; m < modules.length; m++) {
            loadModule(modules[m].slot, modules[m].name);
        }

        // Re-sync BOT after modules (they attach to globalThis.BOT)
        try {
            if (typeof globalThis !== "undefined" && globalThis.BOT) root.BOT = globalThis.BOT;
        } catch (e3) { /* ignore */ }

        root.BOT.party = root.BOT.party || { handle: function () { return false; } };
        root.BOT.survival = root.BOT.survival || { handle: function () { return false; } };
        root.BOT.inventory = root.BOT.inventory || { handle: function () { return false; } };
        root.BOT.restock = root.BOT.restock || { handle: function () { return false; } };
        root.BOT.logistics = root.BOT.logistics || { handle: function () { return false; } };
        root.BOT.benchmark = root.BOT.benchmark || { handle: function () { return false; }, report: function () {}, reset: function () {} };
        if (!root.BOT.townNav) {
            log("CORE_TownNav MISSING — sync slot 17 then reload", "#FF8080");
        }
        if (!root.BOT.logistics || !root.BOT.logistics._botVersion) {
            log("MER_Logistics FAILED to load — sync slot 22 then reload", "#FF8080");
        } else {
            log("logistics " + root.BOT.logistics._botVersion);
        }

        if (root.BOT.inventory && root.BOT.inventory.reset) root.BOT.inventory.reset();
        if (root.BOT.restock && root.BOT.restock.reset) root.BOT.restock.reset();

        function buildStatus(phase) {
            return {
                main: "DORCHANT_Main",
                phase: phase || "running",
                party: (root.BOT.party && root.BOT.party._botVersion) || "MISSING",
                logistics: (root.BOT.logistics && root.BOT.logistics._botVersion) || "MISSING",
                townNav: (root.BOT.townNav && root.BOT.townNav._botVersion) || "MISSING",
                inventory: (root.BOT.inventory && root.BOT.inventory.getState)
                    ? root.BOT.inventory.getState()
                    : "?",
                home: (root.BOT.config && root.BOT.config.home && root.BOT.config.home.to) || "?",
                map: (typeof character !== "undefined" && character && character.map) || "?"
            };
        }

        publishStatus(buildStatus("running"));
        log("BOT_STATUS = " + JSON.stringify(publishStatus(buildStatus("running"))));
        try {
            if (typeof set_message === "function") {
                set_message("DORCHANT " + ((root.BOT.townNav && root.BOT.townNav._botVersion) || "no-nav"));
            }
        } catch (e) { /* ignore */ }

        var busy = false;
        var TICK_MS = 250;
        var lastStatusAt = 0;

        async function mainTick() {
            if (busy) return;
            busy = true;
            try {
                // Keep status visible to CODE console
                var t = Date.now();
                if (t - lastStatusAt > 5000) {
                    lastStatusAt = t;
                    publishStatus(buildStatus("running"));
                }

                if (root.BOT.party && root.BOT.party.handle) root.BOT.party.handle();
                if (root.BOT.survival && root.BOT.survival.handle && root.BOT.survival.handle()) return;
                if (root.BOT.inventory && root.BOT.inventory.handle && await root.BOT.inventory.handle()) return;
                if (root.BOT.logistics && root.BOT.logistics.handle && await root.BOT.logistics.handle()) return;
                if (root.BOT.restock && root.BOT.restock.handle && await root.BOT.restock.handle()) return;
                if (root.BOT.benchmark && root.BOT.benchmark.handle) root.BOT.benchmark.handle();
            } catch (error) {
                log("DORCHANT main error: " + safeError(error), "#FF8080");
                publishStatus({ main: "DORCHANT_Main", phase: "error", error: safeError(error) });
            } finally {
                busy = false;
            }
        }

        root.BOT_DORCHANT_INTERVAL = setInterval(function () {
            mainTick();
        }, TICK_MS);

        log("DORCHANT_Main running. Try: BOT.getStatus()  or  BOT.status");
    } catch (error) {
        publishStatus({ main: "DORCHANT_Main", phase: "CRASHED", error: safeError(error) });
        log("DORCHANT_Main CRASHED: " + safeError(error), "#FF8080");
    }
})();
