/**
 * WAR_Combat.js
 * Warrior combat: farm target, attack, optional charge/cleave.
 * Attaches to: BOT.combat
 */
(function () {
    "use strict";

    globalThis.BOT = globalThis.BOT || {};

    function utils() {
        return BOT.utils || {};
    }

    function combatCfg() {
        return (BOT.config && BOT.config.combat) || {};
    }

    function farmCfg() {
        return (BOT.config && BOT.config.farm) || {};
    }

    function farmMonster() {
        return farmCfg().monster || "crab";
    }

    function maxChase() {
        const d = farmCfg().maxChaseDistance;
        return typeof d === "number" ? d : 250;
    }

    function isValidFarmTarget(mon) {
        if (!mon || mon.dead) return false;
        const wanted = farmMonster();
        if (mon.mtype !== wanted) return false;
        // Never treat crabx as crab
        if (wanted === "crab" && mon.mtype === "crabx") return false;
        return true;
    }

    function getTarget() {
        let target = null;

        try {
            if (typeof get_targeted_monster === "function") {
                target = get_targeted_monster();
            }
        } catch (e) {
            target = null;
        }

        if (isValidFarmTarget(target)) {
            const dist = utils().distanceTo ? utils().distanceTo(target) : 0;
            if (dist <= maxChase()) return target;
        }

        try {
            if (typeof get_nearest_monster === "function") {
                target = get_nearest_monster({ type: farmMonster() });
            }
        } catch (e) {
            target = null;
        }

        if (isValidFarmTarget(target)) return target;
        return null;
    }

    function countNearbyMonsters(radius) {
        let count = 0;
        try {
            if (typeof parent === "undefined" || !parent.entities) return 0;
            for (const id in parent.entities) {
                const e = parent.entities[id];
                if (!e || e.type !== "monster" || e.dead) continue;
                if (e.mtype !== farmMonster()) continue;
                const dist = utils().distanceTo ? utils().distanceTo(e) : Infinity;
                if (dist <= radius) count++;
            }
        } catch (e) {
            // ignore
        }
        return count;
    }

    function trySkills(target) {
        const cfg = combatCfg();

        try {
            if (cfg.useCharge !== false && target && typeof can_use === "function" && can_use("charge")) {
                if (typeof use_skill === "function") use_skill("charge");
            }
        } catch (e) {
            // ignore skill errors
        }

        try {
            if (cfg.useCleave) {
                const minTargets = typeof cfg.cleaveMinimumTargets === "number" ? cfg.cleaveMinimumTargets : 2;
                const radius = typeof cfg.cleaveRadius === "number" ? cfg.cleaveRadius : 80;
                if (countNearbyMonsters(radius) >= minTargets) {
                    if (typeof can_use === "function" && can_use("cleave") && typeof use_skill === "function") {
                        use_skill("cleave");
                    }
                }
            }
        } catch (e) {
            // ignore
        }
    }

    function attackTarget(target) {
        if (!target) return;

        try {
            if (typeof change_target === "function") change_target(target);
        } catch (e) {
            // ignore
        }

        trySkills(target);

        try {
            const inRange = typeof is_in_range === "function" ? is_in_range(target) : (utils().distanceTo(target) < (character.range || 40));
            if (inRange) {
                if (typeof can_attack === "function" && can_attack(target) && typeof attack === "function") {
                    attack(target);
                }
            } else {
                // Move toward target
                if (typeof is_moving === "function" && is_moving(character)) return;
                if (typeof xmove === "function") {
                    xmove(target.x, target.y);
                } else if (typeof move === "function") {
                    move(target.x, target.y);
                }
            }
        } catch (e) {
            if (utils().error) utils().error("WAR attack: " + (utils().safeError ? utils().safeError(e) : e));
        }
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
            if (typeof set_message === "function") set_message("FARM " + farmMonster());

            const target = getTarget();
            if (!target) {
                lootNearby();
                return false;
            }

            attackTarget(target);
            lootNearby();
        } catch (e) {
            if (utils().error) utils().error("WAR_Combat: " + (utils().safeError ? utils().safeError(e) : e));
        }

        return false;
    }

    BOT.combat = {
        handle: handle,
        getTarget: getTarget,
        loot: lootNearby
    };

    if (utils().log) utils().log("WAR_Combat loaded");
})();
