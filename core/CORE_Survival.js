/**
 * CORE_Survival.js
 * Shared death / potion / retreat handling.
 * Attaches to: BOT.survival
 */
(function () {
    "use strict";

    globalThis.BOT = globalThis.BOT || {};

    let lastRetreatAt = 0;
    const RETREAT_COOLDOWN_MS = 400;

    function utils() {
        return BOT.utils || {};
    }

    function survivalCfg() {
        return (BOT.config && BOT.config.survival) || {};
    }

    function hpPercent() {
        if (typeof character === "undefined" || !character || !character.max_hp) return 1;
        return character.hp / character.max_hp;
    }

    function mpPercent() {
        if (typeof character === "undefined" || !character || !character.max_mp) return 1;
        return character.mp / character.max_mp;
    }

    function shouldRetreat() {
        const cfg = survivalCfg();
        const threshold = typeof cfg.retreatAt === "number" ? cfg.retreatAt : 0.45;
        return hpPercent() <= threshold;
    }

    function trackPotionUse(kind) {
        try {
            if (BOT.benchmark && typeof BOT.benchmark.notePotionUse === "function") {
                BOT.benchmark.notePotionUse(kind);
            }
        } catch (e) {
            // optional
        }
    }

    function usePotionsIfNeeded() {
        const cfg = survivalCfg();
        const hpAt = typeof cfg.hpPotionAt === "number" ? cfg.hpPotionAt : 0.8;
        const mpAt = typeof cfg.mpPotionAt === "number" ? cfg.mpPotionAt : 0.5;

        const needHp = hpPercent() < hpAt;
        const needMp = mpPercent() < mpAt;

        if (!needHp && !needMp) return;

        try {
            if (needHp && needMp && typeof use_hp_or_mp === "function") {
                // Prefer HP if both are low
                if (hpPercent() <= mpPercent()) {
                    if (typeof use_hp === "function") {
                        use_hp();
                        trackPotionUse("hp");
                    } else {
                        use_hp_or_mp();
                        trackPotionUse("hp");
                    }
                } else {
                    if (typeof use_mp === "function") {
                        use_mp();
                        trackPotionUse("mp");
                    } else {
                        use_hp_or_mp();
                        trackPotionUse("mp");
                    }
                }
                return;
            }

            if (needHp) {
                if (typeof use_hp === "function") {
                    use_hp();
                } else if (typeof use_hp_or_mp === "function") {
                    use_hp_or_mp();
                }
                trackPotionUse("hp");
                return;
            }

            if (needMp) {
                if (typeof use_mp === "function") {
                    use_mp();
                } else if (typeof use_hp_or_mp === "function") {
                    use_hp_or_mp();
                }
                trackPotionUse("mp");
            }
        } catch (e) {
            if (utils().error) utils().error("usePotions: " + (utils().safeError ? utils().safeError(e) : e));
        }
    }

    function retreatFromThreat() {
        const now = (utils().now && utils().now()) || Date.now();
        if (now - lastRetreatAt < RETREAT_COOLDOWN_MS) return;
        lastRetreatAt = now;

        try {
            if (typeof set_message === "function") set_message("RETREAT");

            let threat = null;
            if (typeof get_targeted_monster === "function") threat = get_targeted_monster();
            if (!threat && typeof get_nearest_monster === "function") threat = get_nearest_monster();

            if (!threat || typeof character === "undefined") return;

            const angle = Math.atan2(character.y - threat.y, character.x - threat.x);
            const dist = 120;
            const tx = character.x + Math.cos(angle) * dist;
            const ty = character.y + Math.sin(angle) * dist;

            if (typeof xmove === "function") {
                xmove(tx, ty);
            } else if (typeof move === "function") {
                move(tx, ty);
            }
        } catch (e) {
            if (utils().error) utils().error("retreat: " + (utils().safeError ? utils().safeError(e) : e));
        }
    }

    function handleDeath() {
        const cfg = survivalCfg();
        if (!character.rip) return false;
        if (cfg.autoRespawn === false) return true;

        try {
            if (typeof respawn === "function") {
                respawn();
                if (BOT.benchmark && typeof BOT.benchmark.noteDeath === "function") {
                    BOT.benchmark.noteDeath();
                }
                if (utils().warn) utils().warn("Respawned");
            }
        } catch (e) {
            if (utils().error) utils().error("respawn: " + (utils().safeError ? utils().safeError(e) : e));
        }
        return true;
    }

    /**
     * @returns {boolean} true when survival should override the rest of the Main loop
     */
    function handle() {
        if (typeof character === "undefined" || !character) return false;

        try {
            if (handleDeath()) return true;

            usePotionsIfNeeded();

            if (shouldRetreat()) {
                retreatFromThreat();
                return true;
            }
        } catch (e) {
            if (utils().error) utils().error("CORE_Survival: " + (utils().safeError ? utils().safeError(e) : e));
        }

        return false;
    }

    BOT.survival = {
        hpPercent: hpPercent,
        mpPercent: mpPercent,
        shouldRetreat: shouldRetreat,
        handle: handle
    };

    if (utils().log) utils().log("CORE_Survival loaded");
})();
