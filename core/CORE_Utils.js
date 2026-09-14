/**
 * CORE_Utils.js
 * Shared helpers for Adventure Land bot modules.
 * Attaches to: BOT.utils
 */
(function () {
    "use strict";

    globalThis.BOT = globalThis.BOT || {};

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

    function log(message, color) {
        try {
            if (typeof game_log === "function") {
                game_log(String(message), color || "#A0FFA0");
            } else {
                console.log(String(message));
            }
        } catch (e) {
            // swallow logging failures
        }
    }

    function warn(message) {
        log(message, "#FFD080");
    }

    function error(message) {
        log(message, "#FF8080");
    }

    function cfg() {
        return (BOT && BOT.config) || {};
    }

    function get(path, fallback) {
        try {
            const parts = String(path).split(".");
            let cur = BOT && BOT.config;
            for (let i = 0; i < parts.length; i++) {
                if (cur == null || typeof cur !== "object") return fallback;
                cur = cur[parts[i]];
            }
            return cur === undefined ? fallback : cur;
        } catch (e) {
            return fallback;
        }
    }

    function now() {
        return Date.now();
    }

    function distanceTo(entity) {
        if (!entity || typeof character === "undefined") return Infinity;
        try {
            if (typeof distance === "function") return distance(character, entity);
            const dx = (character.x || 0) - (entity.x || 0);
            const dy = (character.y || 0) - (entity.y || 0);
            return Math.sqrt(dx * dx + dy * dy);
        } catch (e) {
            return Infinity;
        }
    }

    function isDead() {
        return !!(typeof character !== "undefined" && character && character.rip);
    }

    function setBusy(flag) {
        BOT._busy = !!flag;
    }

    function isBusy() {
        return !!BOT._busy;
    }

    BOT.utils = {
        safeError: safeError,
        log: log,
        warn: warn,
        error: error,
        cfg: cfg,
        get: get,
        now: now,
        distanceTo: distanceTo,
        isDead: isDead,
        setBusy: setBusy,
        isBusy: isBusy
    };

    log("CORE_Utils loaded");
})();
