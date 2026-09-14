/**
 * CORE_Benchmark.js
 * Tracks XP/gold rates, potion use, and deaths.
 * Attaches to: BOT.benchmark
 *
 * Commands:
 *   BOT.benchmark.report()
 *   BOT.benchmark.reset()
 */
(function () {
    "use strict";

    globalThis.BOT = globalThis.BOT || {};

    function utils() {
        return BOT.utils || {};
    }

    function benchCfg() {
        return (BOT.config && BOT.config.benchmark) || {};
    }

    function createState() {
        const xp = (typeof character !== "undefined" && character) ? character.xp : 0;
        const gold = (typeof character !== "undefined" && character) ? character.gold : 0;
        return {
            startedAt: Date.now(),
            startXp: xp,
            startGold: gold,
            lastXp: xp,
            lastGold: gold,
            hpPotsUsed: 0,
            mpPotsUsed: 0,
            deaths: 0,
            lastReportAt: Date.now()
        };
    }

    let state = createState();

    function hoursElapsed() {
        const ms = Math.max(1, Date.now() - state.startedAt);
        return ms / 3600000;
    }

    function runtimeLabel() {
        const ms = Date.now() - state.startedAt;
        const totalSec = Math.floor(ms / 1000);
        const h = Math.floor(totalSec / 3600);
        const m = Math.floor((totalSec % 3600) / 60);
        const s = totalSec % 60;
        return h + "h " + m + "m " + s + "s";
    }

    function xpGained() {
        if (typeof character === "undefined" || !character) return 0;
        // Adventure Land XP is cumulative within a level; handle level-ups approximately
        let gained = character.xp - state.startXp;
        if (gained < 0) gained = character.xp; // leveled; approximate from current xp only
        return Math.max(0, gained);
    }

    function goldGained() {
        if (typeof character === "undefined" || !character) return 0;
        return Math.max(0, character.gold - state.startGold);
    }

    function formatNum(n) {
        if (n >= 1e6) return (n / 1e6).toFixed(2) + "M";
        if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
        return String(Math.floor(n));
    }

    function snapshot() {
        const hours = hoursElapsed();
        const xp = xpGained();
        const gold = goldGained();
        return {
            runtime: runtimeLabel(),
            hours: hours,
            xpGained: xp,
            xpPerHour: xp / hours,
            goldGained: gold,
            goldPerHour: gold / hours,
            hpPotsUsed: state.hpPotsUsed,
            mpPotsUsed: state.mpPotsUsed,
            deaths: state.deaths
        };
    }

    function report() {
        const s = snapshot();
        const lines = [
            "=== BENCHMARK ===",
            "Runtime: " + s.runtime,
            "XP: " + formatNum(s.xpGained) + " (" + formatNum(s.xpPerHour) + "/hr)",
            "Gold: " + formatNum(s.goldGained) + " (" + formatNum(s.goldPerHour) + "/hr)",
            "HP pots used: " + s.hpPotsUsed,
            "MP pots used: " + s.mpPotsUsed,
            "Deaths: " + s.deaths
        ];

        for (let i = 0; i < lines.length; i++) {
            if (utils().log) utils().log(lines[i], "#80C0FF");
            else if (typeof game_log === "function") game_log(lines[i], "#80C0FF");
        }

        return s;
    }

    function reset() {
        state = createState();
        if (utils().log) utils().log("Benchmark reset");
        return state;
    }

    function notePotionUse(kind) {
        if (kind === "mp") state.mpPotsUsed++;
        else state.hpPotsUsed++;
    }

    function noteDeath() {
        state.deaths++;
    }

    /**
     * Periodic auto-report from Main loop.
     */
    function handle() {
        const cfg = benchCfg();
        if (cfg.enabled === false) return false;

        const everyMin = typeof cfg.reportEveryMinutes === "number" ? cfg.reportEveryMinutes : 10;
        const now = Date.now();
        if (now - state.lastReportAt >= everyMin * 60000) {
            state.lastReportAt = now;
            report();
        }
        return false;
    }

    BOT.benchmark = {
        report: report,
        reset: reset,
        handle: handle,
        snapshot: snapshot,
        notePotionUse: notePotionUse,
        noteDeath: noteDeath
    };

    if (utils().log) utils().log("CORE_Benchmark loaded — BOT.benchmark.report() / .reset()");
})();
