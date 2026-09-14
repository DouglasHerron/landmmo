/**
 * CORE_Travel.js
 * Travel toward configured farm when monster is not nearby.
 * Attaches to: BOT.travel
 */
(function () {
    "use strict";

    globalThis.BOT = globalThis.BOT || {};

    let traveling = false;
    let lastTravelAt = 0;
    const TRAVEL_COOLDOWN_MS = 15000;
    const NEARBY_RANGE = 400;

    function utils() {
        return BOT.utils || {};
    }

    function farmCfg() {
        return (BOT.config && BOT.config.farm) || {};
    }

    function farmTarget() {
        const cfg = farmCfg();
        // Prefer exact coordinates when provided
        if (typeof cfg.x === "number" && typeof cfg.y === "number") {
            return {
                x: cfg.x,
                y: cfg.y,
                map: cfg.map || (typeof character !== "undefined" ? character.map : undefined)
            };
        }
        return cfg.monster || null;
    }

    function monsterNearby(mtype) {
        if (!mtype || typeof get_nearest_monster !== "function") return false;
        try {
            const mon = get_nearest_monster({ type: mtype });
            if (!mon) return false;
            const dist = utils().distanceTo ? utils().distanceTo(mon) : Infinity;
            return dist < NEARBY_RANGE;
        } catch (e) {
            return false;
        }
    }

    function atCoordinates(dest) {
        if (!dest || typeof dest.x !== "number") return false;
        if (dest.map && character.map !== dest.map) return false;
        const dx = character.x - dest.x;
        const dy = character.y - dest.y;
        return Math.sqrt(dx * dx + dy * dy) < 80;
    }

    function needsTravel() {
        const cfg = farmCfg();
        const dest = farmTarget();
        if (!dest) return false;

        // Coordinate-based farm
        if (typeof dest === "object" && typeof dest.x === "number") {
            return !atCoordinates(dest);
        }

        // Monster-type farm (never treat crabx as crab)
        const mtype = String(dest);
        if (mtype === "crab") {
            // Ensure we are near normal crabs, not only huge crab
            return !monsterNearby("crab");
        }
        return !monsterNearby(mtype);
    }

    async function goToFarm() {
        const dest = farmTarget();
        if (!dest) return;

        const now = (utils().now && utils().now()) || Date.now();
        if (traveling) return;
        if (now - lastTravelAt < TRAVEL_COOLDOWN_MS) return;

        // Don't stack smart_move while already pathing
        try {
            if (typeof is_moving === "function" && is_moving(character)) return;
        } catch (e) {
            // ignore
        }

        traveling = true;
        lastTravelAt = now;

        try {
            if (utils().log) {
                const label = typeof dest === "object" ? (dest.map || "") + " " + dest.x + "," + dest.y : dest;
                utils().log("Traveling to farm: " + label);
            }

            if (typeof smart_move === "function") {
                if (typeof dest === "object" && typeof dest.x === "number") {
                    await smart_move(dest);
                } else {
                    await smart_move(String(dest));
                }
            }
        } catch (e) {
            if (utils().error) utils().error("CORE_Travel: " + (utils().safeError ? utils().safeError(e) : e));
        } finally {
            traveling = false;
        }
    }

    /**
     * @returns {boolean} true when travel should override combat this tick
     */
    async function handle() {
        if (typeof character === "undefined" || !character) return false;
        if (character.rip) return false;

        // Followers with no farm config skip travel (priest follows leader in combat)
        const cfg = farmCfg();
        if (!cfg.monster && typeof cfg.x !== "number") return false;

        try {
            if (!needsTravel()) return false;
            await goToFarm();
            return true;
        } catch (e) {
            traveling = false;
            if (utils().error) utils().error("CORE_Travel handle: " + (utils().safeError ? utils().safeError(e) : e));
            return false;
        }
    }

    BOT.travel = {
        handle: handle,
        needsTravel: needsTravel,
        farmTarget: farmTarget,
        isTraveling: function () { return traveling; }
    };

    if (utils().log) utils().log("CORE_Travel loaded");
})();
