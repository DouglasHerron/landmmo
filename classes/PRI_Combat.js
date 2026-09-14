/**
 * PRI_Combat.js
 * Priest: self-heal > heal leader > follow > assist leader target.
 * Attaches to: BOT.combat
 */
(function () {
    "use strict";

    globalThis.BOT = globalThis.BOT || {};

    function utils() {
        return BOT.utils || {};
    }

    function healCfg() {
        return (BOT.config && BOT.config.healing) || {};
    }

    function combatCfg() {
        return (BOT.config && BOT.config.combat) || {};
    }

    function moveCfg() {
        return (BOT.config && BOT.config.movement) || {};
    }

    function partyCfg() {
        return (BOT.config && BOT.config.party) || {};
    }

    function getLeader() {
        const name = (partyCfg().leader) || "Dorg";
        try {
            if (typeof get_player === "function") {
                const p = get_player(name);
                if (p) return p;
            }
        } catch (e) {
            // ignore
        }
        // Fallback: scan entities
        try {
            if (parent && parent.entities) {
                for (const id in parent.entities) {
                    const e = parent.entities[id];
                    if (e && e.name === name) return e;
                }
            }
        } catch (e) {
            // ignore
        }
        return null;
    }

    function entityHpPercent(entity) {
        if (!entity || !entity.max_hp) return 1;
        return entity.hp / entity.max_hp;
    }

    function healSelf() {
        const cfg = healCfg();
        const threshold = typeof cfg.healSelfBelow === "number" ? cfg.healSelfBelow : 0.75;
        if (entityHpPercent(character) >= threshold) return false;

        try {
            if (typeof can_heal === "function" && !can_heal(character)) return false;
            if (typeof can_use === "function" && !can_use("heal")) return false;
            if (typeof use_skill === "function") {
                use_skill("heal", character);
                if (typeof set_message === "function") set_message("HEAL SELF");
                return true;
            }
            if (typeof heal === "function") {
                heal(character);
                return true;
            }
        } catch (e) {
            if (utils().error) utils().error("healSelf: " + (utils().safeError ? utils().safeError(e) : e));
        }
        return false;
    }

    function healLeader() {
        const leader = getLeader();
        if (!leader || leader.rip) return false;

        const cfg = healCfg();
        const threshold = typeof cfg.healLeaderBelow === "number" ? cfg.healLeaderBelow : 0.85;
        if (entityHpPercent(leader) >= threshold) return false;

        try {
            // Move into heal range if needed
            const inRange = typeof is_in_range === "function"
                ? is_in_range(leader, "heal")
                : (utils().distanceTo(leader) < (character.range || 60) + 20);

            if (!inRange) {
                if (typeof xmove === "function") xmove(leader.x, leader.y);
                else if (typeof move === "function") move(leader.x, leader.y);
                return true;
            }

            if (typeof can_heal === "function" && !can_heal(leader)) return false;
            if (typeof can_use === "function" && !can_use("heal")) return false;

            if (typeof use_skill === "function") {
                use_skill("heal", leader);
                if (typeof set_message === "function") set_message("HEAL " + leader.name);
                return true;
            }
            if (typeof heal === "function") {
                heal(leader);
                return true;
            }
        } catch (e) {
            if (utils().error) utils().error("healLeader: " + (utils().safeError ? utils().safeError(e) : e));
        }
        return false;
    }

    function followLeader() {
        const leader = getLeader();
        if (!leader) return false;

        const cfg = moveCfg();
        const followDistance = typeof cfg.followDistance === "number" ? cfg.followDistance : 70;
        const maxDistance = typeof cfg.maxDistance === "number" ? cfg.maxDistance : 250;

        const dist = utils().distanceTo ? utils().distanceTo(leader) : 0;

        if (dist > maxDistance) {
            // Too far — smart follow via move
            try {
                if (typeof smart_move === "function" && !(typeof is_moving === "function" && is_moving(character))) {
                    smart_move({ x: leader.x, y: leader.y, map: leader.map });
                } else if (typeof xmove === "function") {
                    xmove(leader.x, leader.y);
                }
            } catch (e) {
                // ignore
            }
            return true;
        }

        if (dist > followDistance) {
            try {
                if (typeof is_moving === "function" && is_moving(character)) return true;
                if (typeof xmove === "function") xmove(leader.x, leader.y);
                else if (typeof move === "function") move(leader.x, leader.y);
            } catch (e) {
                // ignore
            }
            return true;
        }

        return false;
    }

    function getLeaderTarget() {
        const leader = getLeader();
        if (!leader) return null;

        try {
            // Leader's current target id
            if (leader.target && parent && parent.entities) {
                const t = parent.entities[leader.target];
                if (t && t.type === "monster" && !t.dead) return t;
            }
        } catch (e) {
            // ignore
        }
        return null;
    }

    function assistLeader() {
        const cfg = combatCfg();
        if (cfg.assistLeader === false) return false;

        const target = getLeaderTarget();
        if (!target) return false;

        try {
            if (typeof change_target === "function") change_target(target);

            const inRange = typeof is_in_range === "function"
                ? is_in_range(target)
                : (utils().distanceTo(target) < (character.range || 60));

            if (inRange) {
                if (typeof can_attack === "function" && can_attack(target) && typeof attack === "function") {
                    attack(target);
                    if (typeof set_message === "function") set_message("ASSIST");
                    return true;
                }
            } else {
                if (typeof xmove === "function") xmove(target.x, target.y);
                else if (typeof move === "function") move(target.x, target.y);
                return true;
            }
        } catch (e) {
            if (utils().error) utils().error("assistLeader: " + (utils().safeError ? utils().safeError(e) : e));
        }
        return false;
    }

    function lootNearby() {
        try {
            if (typeof loot === "function") loot();
        } catch (e) {
            // ignore
        }
    }

    function handle() {
        const cfg = combatCfg();
        if (cfg.enabled === false) return false;
        if (typeof character === "undefined" || !character || character.rip) return false;

        try {
            // Priority: self-heal > heal leader > follow > assist
            if (healSelf()) return true;
            if (healLeader()) return true;
            followLeader();
            assistLeader();
            lootNearby();
        } catch (e) {
            if (utils().error) utils().error("PRI_Combat: " + (utils().safeError ? utils().safeError(e) : e));
        }

        return false;
    }

    BOT.combat = {
        handle: handle,
        getLeader: getLeader,
        healSelf: healSelf,
        healLeader: healLeader,
        followLeader: followLeader,
        getLeaderTarget: getLeaderTarget,
        assistLeader: assistLeader,
        loot: lootNearby
    };

    if (utils().log) utils().log("PRI_Combat loaded");
})();
