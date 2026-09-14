/**
 * CORE_TownNav.js
 * Reliable town / bank / vendor pathing for Adventure Land.
 * Attaches to: BOT.townNav
 *
 * Key AL gotchas this handles:
 * - Open merchant stand blocks movement → close first
 * - smart_move("bank") often stops outside the door → walk to door + transport
 * - Prefer NPC coords / named destinations over vague { to: "main" }
 */
(function () {
    "use strict";

    globalThis.BOT = globalThis.BOT || {};

    let lastMoveAt = 0;
    let lastX = 0;
    let lastY = 0;
    let lastDestKey = "";
    const MOVE_RETRY_MS = 10000;

    function utils() {
        return BOT.utils || {};
    }

    function now() {
        return (utils().now && utils().now()) || Date.now();
    }

    function dist(a, b) {
        if (!a || !b) return Infinity;
        const dx = (a.x || 0) - (b.x || 0);
        const dy = (a.y || 0) - (b.y || 0);
        return Math.sqrt(dx * dx + dy * dy);
    }

    function isPathing() {
        try {
            if (typeof is_moving === "function" && is_moving(character)) return true;
            if (typeof smart !== "undefined" && smart && smart.moving) return true;
        } catch (e) { /* ignore */ }
        return false;
    }

    function movedSinceLast() {
        const d = dist(character, { x: lastX, y: lastY });
        return d >= 20;
    }

    /** Merchant stand open = cannot walk. */
    function ensureCanMove() {
        try {
            if (character.stand || character.standed) {
                if (typeof parent !== "undefined" && parent && typeof parent.close_merchant === "function") {
                    parent.close_merchant();
                    if (utils().log) utils().log("Closed merchant stand");
                }
            }
        } catch (e) { /* ignore */ }
    }

    function findDoorTo(destMap, fromMap) {
        fromMap = fromMap || character.map;
        try {
            const doors = G && G.maps && G.maps[fromMap] && G.maps[fromMap].doors;
            if (!doors) return null;
            for (let i = 0; i < doors.length; i++) {
                const d = doors[i];
                if (d && d[4] === destMap) {
                    return {
                        x: d[0],
                        y: d[1],
                        w: d[2] || 40,
                        h: d[3] || 40,
                        destMap: d[4],
                        destSpawn: d[5] || 0,
                        map: fromMap
                    };
                }
            }
        } catch (e) { /* ignore */ }
        return null;
    }

    function findNpcEntity(ids) {
        if (typeof find_npc !== "function") return null;
        for (let i = 0; i < ids.length; i++) {
            try {
                const npc = find_npc(ids[i]);
                if (npc) return npc;
            } catch (e) { /* ignore */ }
        }
        return null;
    }

    /**
     * Issue a path request (throttled). dest may be string, {x,y,map}, or entity.
     */
    function pathTo(dest, force) {
        ensureCanMove();

        const t = now();
        const key = typeof dest === "string" ? dest
            : (dest && dest.name) ? dest.name
            : (dest && dest.map ? dest.map + ":" : "") + (dest && dest.x) + "," + (dest && dest.y);

        if (!force) {
            if (isPathing() && movedSinceLast() && key === lastDestKey && t - lastMoveAt < MOVE_RETRY_MS) {
                return;
            }
            if (!isPathing() && key === lastDestKey && t - lastMoveAt < 4000) return;
        }

        lastMoveAt = t;
        lastX = character.x;
        lastY = character.y;
        lastDestKey = key;

        try {
            if (typeof smart_move !== "function") return;

            if (typeof dest === "string") {
                smart_move(dest);
                return;
            }
            if (dest && typeof dest.x === "number" && typeof dest.y === "number") {
                // Close range: simple move is snappier near doors/NPCs
                if ((!dest.map || dest.map === character.map) && dist(character, dest) < 120) {
                    if (typeof move === "function") move(dest.x, dest.y);
                    else smart_move({ x: dest.x, y: dest.y, map: character.map });
                    return;
                }
                smart_move({
                    x: dest.x,
                    y: dest.y,
                    map: dest.map || character.map
                });
                return;
            }
            if (dest && dest.name) {
                smart_move(dest.name);
            }
        } catch (e) {
            if (utils().error) utils().error("townNav.pathTo: " + (utils().safeError ? utils().safeError(e) : e));
        }
    }

    function nearBank() {
        try {
            if (character.map === "bank") return true;
        } catch (e) { /* ignore */ }
        return false;
    }

    /**
     * Walk to bank door then transport. Returns true when on bank map.
     */
    function goBank() {
        ensureCanMove();
        if (nearBank()) return true;

        // Already on a map with a bank door — approach + transport
        let door = findDoorTo("bank", character.map);

        // From farm / elsewhere: path via main bank door
        if (!door) {
            door = findDoorTo("bank", "main");
            if (door) {
                if (character.map !== "main") {
                    pathTo({ x: door.x, y: door.y, map: "main" });
                    return false;
                }
            } else {
                pathTo("bank");
                return false;
            }
        }

        const d = dist(character, door);
        // Wide enough to hit door rectangle
        if (d < Math.max(50, (door.w || 40) / 2 + 25)) {
            try {
                if (typeof transport === "function") {
                    transport("bank", door.destSpawn);
                    if (utils().log) utils().log("townNav: transport → bank");
                }
            } catch (e) {
                if (utils().error) utils().error("transport bank: " + (utils().safeError ? utils().safeError(e) : e));
            }
            return character.map === "bank";
        }

        pathTo({ x: door.x, y: door.y, map: door.map || character.map });
        return false;
    }

    /**
     * Leave bank to main (spawn by bank door).
     */
    function leaveBank() {
        if (character.map !== "bank") return true;
        ensureCanMove();
        try {
            // Common exit: main spawn index 3 (bank exit). Also try door on bank map.
            const door = findDoorTo("main", "bank");
            if (door && dist(character, door) < 80 && typeof transport === "function") {
                transport("main", door.destSpawn);
                return character.map === "main";
            }
            if (typeof transport === "function") transport("main", 3);
        } catch (e) { /* ignore */ }
        pathTo("main");
        return character.map === "main";
    }

    const SELL_NPCS = ["basics", "exchange", "fancypots", "pots"];

    function nearSell() {
        const npc = findNpcEntity(SELL_NPCS);
        return !!(npc && dist(character, npc) < 300);
    }

    /**
     * Go to a town vendor that accepts sell(). Returns true when in range.
     */
    function goSell() {
        ensureCanMove();

        if (character.map === "bank") {
            leaveBank();
            return false;
        }

        const npc = findNpcEntity(SELL_NPCS);
        if (npc) {
            if (dist(character, npc) < 300) return true;
            pathTo({ x: npc.x, y: npc.y, map: character.map });
            return false;
        }

        // Not in range of NPC entity — use named destination
        if (character.map !== "main") {
            pathTo("main");
            return false;
        }
        pathTo("basics");
        return false;
    }

    /**
     * Go to a named AL destination (potions, scrolls, upgrade, crab, …).
     * Returns true when "close enough" heuristics succeed.
     */
    function goNamed(name, nearCheck) {
        ensureCanMove();
        if (typeof nearCheck === "function" && nearCheck()) return true;

        if (character.map === "bank" && name !== "bank") {
            leaveBank();
            return false;
        }

        // Prefer live NPC if name matches
        const npc = findNpcEntity([name]);
        if (npc) {
            if (dist(character, npc) < 300) return true;
            pathTo({ x: npc.x, y: npc.y, map: character.map });
            return false;
        }

        pathTo(name);
        return false;
    }

    var api = {
        ensureCanMove: ensureCanMove,
        pathTo: pathTo,
        goBank: goBank,
        leaveBank: leaveBank,
        goSell: goSell,
        goNamed: goNamed,
        nearBank: nearBank,
        nearSell: nearSell,
        isPathing: isPathing,
        findDoorTo: findDoorTo,
        _botVersion: "townNav-v1"
    };

    // Attach on every common global AL uses (console BOT === window.BOT)
    try { globalThis.BOT = globalThis.BOT || {}; globalThis.BOT.townNav = api; } catch (e1) { /* ignore */ }
    try {
        if (typeof window !== "undefined") {
            window.BOT = window.BOT || globalThis.BOT || {};
            window.BOT.townNav = api;
            if (globalThis.BOT && globalThis.BOT !== window.BOT) {
                // Keep both in sync if they diverged
                globalThis.BOT.townNav = api;
            }
        }
    } catch (e2) { /* ignore */ }

    try {
        if (typeof game_log === "function") game_log("CORE_TownNav loaded " + api._botVersion, "#A0FFA0");
        else if (utils().log) utils().log("CORE_TownNav loaded");
    } catch (e3) { /* ignore */ }
})();
