/**
 * CORE_Travel.js
 * Travel toward configured farm when monster is not nearby.
 * Attaches to: BOT.travel
 *
 * IMPORTANT: Only return true (block combat) while actively pathing.
 * Returning true on cooldown was leaving Dorg idle forever.
 */
(function () {
    "use strict";

    globalThis.BOT = globalThis.BOT || {};

    let traveling = false;
    let lastTravelAt = 0;
    const TRAVEL_COOLDOWN_MS = 15000;
    const NEARBY_RANGE = 600;

    function utils() {
        return BOT.utils || {};
    }

    function farmCfg() {
        return (BOT.config && BOT.config.farm) || {};
    }

    function farmTarget() {
        const cfg = farmCfg();
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
        if (!mtype) return false;

        try {
            if (typeof get_nearest_monster === "function") {
                const mon = get_nearest_monster({ type: mtype });
                if (mon && mon.mtype === mtype) {
                    const dist = utils().distanceTo ? utils().distanceTo(mon) : 0;
                    if (dist < NEARBY_RANGE) return true;
                }
            }
        } catch (e) { /* ignore */ }

        // Entity scan fallback
        try {
            if (parent && parent.entities) {
                for (const id in parent.entities) {
                    const e = parent.entities[id];
                    if (!e || e.type !== "monster" || e.dead) continue;
                    if (e.mtype !== mtype) continue;
                    if (mtype === "crab" && e.mtype === "crabx") continue;
                    const dist = utils().distanceTo ? utils().distanceTo(e) : Infinity;
                    if (dist < NEARBY_RANGE) return true;
                }
            }
        } catch (e) { /* ignore */ }

        return false;
    }

    function atCoordinates(dest) {
        if (!dest || typeof dest.x !== "number") return false;
        if (dest.map && character.map !== dest.map) return false;
        const dx = character.x - dest.x;
        const dy = character.y - dest.y;
        return Math.sqrt(dx * dx + dy * dy) < 80;
    }

    function isPathing() {
        if (traveling) return true;
        try {
            if (typeof is_moving === "function" && is_moving(character)) return true;
        } catch (e) { /* ignore */ }
        try {
            if (typeof smart !== "undefined" && smart && smart.moving) return true;
        } catch (e) { /* ignore */ }
        return false;
    }

    function needsTravel() {
        const dest = farmTarget();
        if (!dest) return false;

        if (typeof dest === "object" && typeof dest.x === "number") {
            return !atCoordinates(dest);
        }

        return !monsterNearby(String(dest));
    }

    async function goToFarm() {
        const dest = farmTarget();
        if (!dest) return false;

        const now = (utils().now && utils().now()) || Date.now();
        if (isPathing()) return true;
        if (now - lastTravelAt < TRAVEL_COOLDOWN_MS) return false;

        lastTravelAt = now;

        try {
            if (utils().log) {
                const label = typeof dest === "object" ? (dest.map || "") + " " + dest.x + "," + dest.y : dest;
                utils().log("Traveling to farm: " + label);
            }
            if (typeof set_message === "function") set_message("TRAVEL");

            // Fire-and-forget — awaiting smart_move freezes the main busy loop
            if (typeof smart_move === "function") {
                if (typeof dest === "object" && typeof dest.x === "number") {
                    smart_move(dest);
                } else {
                    smart_move(String(dest));
                }
            }
        } catch (e) {
            if (utils().error) utils().error("CORE_Travel: " + (utils().safeError ? utils().safeError(e) : e));
        }
        return isPathing();
    }

    /**
     * @returns {boolean} true ONLY while actively pathing (blocks combat)
     */
    async function handle() {
        if (!character || character.rip) return false;

        const cfg = farmCfg();
        if (!cfg.monster && typeof cfg.x !== "number") return false;

        try {
            if (!needsTravel()) return false;

            // Already moving — block combat until arrival
            if (isPathing()) return true;

            // Start a new trip (may no-op on cooldown → do NOT block combat)
            const startedOrPathing = await goToFarm();
            return !!startedOrPathing || isPathing();
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
        isTraveling: function () { return isPathing(); }
    };

    if (utils().log) utils().log("CORE_Travel loaded");
})();
