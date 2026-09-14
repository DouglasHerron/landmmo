/**
 * CORE_TownNav.js
 * Reliable town / bank / vendor pathing for Adventure Land.
 * Attaches to: BOT.townNav
 *
 * Never spam smart_move — re-issuing while searching causes
 * "searching for a path" / "path found" loops.
 */
(function () {
    "use strict";

    globalThis.BOT = globalThis.BOT || {};

    let lastMoveAt = 0;
    let lastX = 0;
    let lastY = 0;
    let lastDestKey = "";
    const RETRY_WHILE_IDLE_MS = 12000;
    const STUCK_REPATH_MS = 25000;

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
        } catch (e0) { /* ignore */ }
        try {
            if (typeof smart !== "undefined" && smart) {
                if (smart.moving) return true;
                // AL sets these while A* is running — do not interrupt
                if (smart.searching) return true;
                if (smart.start_x != null && smart.moving !== false && smart.found === false) return true;
            }
        } catch (e1) { /* ignore */ }
        return false;
    }

    function positionDelta() {
        return dist(character, { x: lastX, y: lastY });
    }

    function destKey(dest) {
        if (typeof dest === "string") return dest;
        if (dest && dest.key) return String(dest.key);
        if (dest && dest.name) return "name:" + dest.name;
        if (dest && typeof dest.x === "number") {
            return (dest.map || character.map || "") + ":" + Math.round(dest.x) + "," + Math.round(dest.y);
        }
        return "unknown";
    }

    function ensureCanMove() {
        try {
            if (character.stand || character.standed) {
                if (typeof parent !== "undefined" && parent && typeof parent.close_merchant === "function") {
                    parent.close_merchant();
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
                        map: fromMap,
                        key: "door:" + fromMap + "→" + destMap
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
     * Issue smart_move at most once per destination until idle or truly stuck.
     */
    function pathTo(dest, force) {
        ensureCanMove();
        if (!dest && dest !== 0) return;

        const t = now();
        const key = destKey(dest);
        const pathing = isPathing();
        const elapsed = t - lastMoveAt;
        const moved = positionDelta();

        // Already walking/searching toward same (or any) dest — do not restart
        if (pathing && !force) {
            if (elapsed < STUCK_REPATH_MS) return;
            // Long pathing with real movement = still fine
            if (moved >= 30) {
                lastX = character.x;
                lastY = character.y;
                lastMoveAt = t;
                return;
            }
            // Truly stuck ~25s with almost no movement — allow one retry below
        }

        // Idle: throttle repeats of the same destination
        if (!pathing && !force && key === lastDestKey && elapsed < RETRY_WHILE_IDLE_MS) {
            return;
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
                const sameMap = !dest.map || dest.map === character.map;
                const d = dist(character, dest);
                // Very close: step without new A* search
                if (sameMap && d < 80 && typeof move === "function") {
                    move(dest.x, dest.y);
                    return;
                }
                smart_move({
                    x: dest.x,
                    y: dest.y,
                    map: dest.map || character.map
                });
                return;
            }

            if (dest && dest.name) smart_move(dest.name);
        } catch (e) {
            if (utils().error) utils().error("townNav.pathTo: " + (utils().safeError ? utils().safeError(e) : e));
        }
    }

    function nearBank() {
        try {
            return character.map === "bank";
        } catch (e) {
            return false;
        }
    }

    function goBank() {
        ensureCanMove();
        if (nearBank()) return true;

        // Still searching/walking — wait (prevents search spam)
        if (isPathing() && (now() - lastMoveAt) < STUCK_REPATH_MS) {
            return false;
        }

        let door = findDoorTo("bank", character.map);
        if (!door) {
            door = findDoorTo("bank", "main");
            if (door) {
                if (character.map !== "main") {
                    pathTo({ x: door.x, y: door.y, map: "main", key: door.key + ":approach" });
                    return false;
                }
            } else {
                pathTo("bank");
                return false;
            }
        }

        const d = dist(character, door);
        if (d < Math.max(50, (door.w || 40) / 2 + 25)) {
            try {
                if (typeof transport === "function") {
                    transport("bank", door.destSpawn);
                }
            } catch (e) {
                if (utils().error) utils().error("transport bank: " + (utils().safeError ? utils().safeError(e) : e));
            }
            return character.map === "bank";
        }

        pathTo({
            x: door.x,
            y: door.y,
            map: door.map || character.map,
            key: door.key
        });
        return false;
    }

    function leaveBank() {
        if (character.map !== "bank") return true;
        ensureCanMove();
        if (isPathing() && (now() - lastMoveAt) < STUCK_REPATH_MS) return false;

        try {
            const door = findDoorTo("main", "bank");
            if (door && dist(character, door) < 80 && typeof transport === "function") {
                transport("main", door.destSpawn);
                return character.map === "main";
            }
            if (typeof transport === "function") transport("main", 3);
        } catch (e) { /* ignore */ }

        if (character.map === "bank") pathTo("main");
        return character.map === "main";
    }

    const SELL_NPCS = ["basics", "exchange", "fancypots", "pots"];

    function nearSell() {
        const npc = findNpcEntity(SELL_NPCS);
        return !!(npc && dist(character, npc) < 300);
    }

    function goSell() {
        ensureCanMove();

        if (character.map === "bank") {
            leaveBank();
            return false;
        }

        if (isPathing() && (now() - lastMoveAt) < STUCK_REPATH_MS) {
            return nearSell();
        }

        const npc = findNpcEntity(SELL_NPCS);
        if (npc) {
            if (dist(character, npc) < 300) return true;
            // Stable key by NPC id — NOT floating x,y every tick
            pathTo({
                x: npc.x,
                y: npc.y,
                map: character.map,
                key: "sell:" + (npc.id || npc.npc || "vendor")
            });
            return false;
        }

        if (character.map !== "main") {
            pathTo("main");
            return false;
        }
        pathTo("basics");
        return false;
    }

    function goNamed(name, nearCheck) {
        ensureCanMove();
        if (typeof nearCheck === "function" && nearCheck()) return true;

        if (character.map === "bank" && name !== "bank") {
            leaveBank();
            return false;
        }

        if (isPathing() && (now() - lastMoveAt) < STUCK_REPATH_MS) {
            return false;
        }

        const npc = findNpcEntity([name]);
        if (npc) {
            if (dist(character, npc) < 300) return true;
            pathTo({
                x: npc.x,
                y: npc.y,
                map: character.map,
                key: "named:" + name
            });
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
        _botVersion: "townNav-v2"
    };

    try { globalThis.BOT = globalThis.BOT || {}; globalThis.BOT.townNav = api; } catch (e1) { /* ignore */ }
    try {
        if (typeof window !== "undefined") {
            window.BOT = window.BOT || globalThis.BOT || {};
            window.BOT.townNav = api;
        }
    } catch (e2) { /* ignore */ }

    try {
        if (typeof game_log === "function") game_log("CORE_TownNav loaded " + api._botVersion, "#A0FFA0");
    } catch (e3) { /* ignore */ }
})();
