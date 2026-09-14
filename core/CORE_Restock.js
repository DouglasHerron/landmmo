/**
 * CORE_Restock.js
 * Travel to potion vendor and restock HP/MP potions.
 * Attaches to: BOT.restock
 */
(function () {
    "use strict";

    globalThis.BOT = globalThis.BOT || {};

    let state = "idle"; // idle | traveling | buying | returning
    let lastTravelAt = 0;
    const TRAVEL_RETRY_MS = 20000;

    function utils() {
        return BOT.utils || {};
    }

    function restockCfg() {
        return (BOT.config && BOT.config.restock) || {};
    }

    function farmMonster() {
        return (BOT.config && BOT.config.farm && BOT.config.farm.monster) || "crab";
    }

    function quantity(name) {
        if (!name || typeof character === "undefined" || !character.items) return 0;

        // Prefer Adventure Land global quantity() if present (not this local fn)
        try {
            const alQuantity = (typeof parent !== "undefined" && parent && parent.quantity)
                || (typeof window !== "undefined" && window && window["quantity"]);
            // Only use if it's a different function than ours
            if (typeof alQuantity === "function" && alQuantity !== quantity) {
                const n = alQuantity(name);
                if (typeof n === "number") return n;
            }
        } catch (e) {
            // fall through to manual count
        }

        let total = 0;
        for (let i = 0; i < character.items.length; i++) {
            const item = character.items[i];
            if (item && item.name === name) total += item.q || 1;
        }
        return total;
    }

    function hpCount() {
        const cfg = restockCfg();
        return quantity(cfg.hpPotion || "hpot1");
    }

    function mpCount() {
        const cfg = restockCfg();
        return quantity(cfg.mpPotion || "mpot1");
    }

    function needsRestock() {
        const cfg = restockCfg();
        if (cfg.enabled === false) return false;

        const minHp = typeof cfg.minimumHpPotions === "number" ? cfg.minimumHpPotions : 100;
        const minMp = typeof cfg.minimumMpPotions === "number" ? cfg.minimumMpPotions : 100;

        return hpCount() < minHp || mpCount() < minMp;
    }

    function nearPotionVendor() {
        try {
            if (typeof find_npc === "function") {
                const npc = find_npc("fancypots") || find_npc("pots") || find_npc("basics");
                if (npc && utils().distanceTo && utils().distanceTo(npc) < 350) return true;
            }
        } catch (e) {
            // ignore
        }
        return false;
    }

    async function travelToPotions() {
        if (utils().log) utils().log("Traveling to potion vendor");
        lastTravelAt = (utils().now && utils().now()) || Date.now();
        try {
            if (typeof smart_move === "function") {
                await smart_move({ to: "potions" });
            }
        } catch (e) {
            if (utils().error) utils().error("travel potions: " + (utils().safeError ? utils().safeError(e) : e));
        }
    }

    function buyPotions() {
        const cfg = restockCfg();
        const hpName = cfg.hpPotion || "hpot1";
        const mpName = cfg.mpPotion || "mpot1";
        const desiredHp = typeof cfg.desiredHpPotions === "number" ? cfg.desiredHpPotions : 500;
        const desiredMp = typeof cfg.desiredMpPotions === "number" ? cfg.desiredMpPotions : 500;

        let bought = 0;

        try {
            const needHp = Math.max(0, desiredHp - hpCount());
            const needMp = Math.max(0, desiredMp - mpCount());

            if (needHp > 0 && typeof buy === "function") {
                buy(hpName, needHp);
                bought += needHp;
                if (utils().log) utils().log("Bought " + needHp + " " + hpName);
            }
            if (needMp > 0 && typeof buy === "function") {
                buy(mpName, needMp);
                bought += needMp;
                if (utils().log) utils().log("Bought " + needMp + " " + mpName);
            }
        } catch (e) {
            if (utils().error) utils().error("buyPotions: " + (utils().safeError ? utils().safeError(e) : e));
        }

        return bought;
    }

    async function returnToFarm() {
        const monster = farmMonster();
        if (utils().log) utils().log("Restock done — returning to " + monster);
        try {
            if (typeof smart_move === "function") {
                await smart_move(monster);
            }
        } catch (e) {
            if (utils().error) utils().error("restock return: " + (utils().safeError ? utils().safeError(e) : e));
        }
    }

    /**
     * @returns {boolean} true when restock should override combat
     */
    async function handle() {
        if (typeof character === "undefined" || !character) return false;

        const cfg = restockCfg();
        if (cfg.enabled === false) return false;

        const now = (utils().now && utils().now()) || Date.now();

        try {
            if (state === "idle") {
                if (!needsRestock()) return false;
                state = "traveling";
                await travelToPotions();
                return true;
            }

            if (state === "traveling") {
                if (!nearPotionVendor()) {
                    if (now - lastTravelAt > TRAVEL_RETRY_MS) {
                        await travelToPotions();
                    }
                    return true;
                }
                state = "buying";
                buyPotions();
                state = "returning";
                await returnToFarm();
                state = "idle";
                return true;
            }

            if (state === "buying" || state === "returning") {
                return true;
            }
        } catch (e) {
            state = "idle";
            if (utils().error) utils().error("CORE_Restock: " + (utils().safeError ? utils().safeError(e) : e));
        }

        return state !== "idle";
    }

    BOT.restock = {
        quantity: quantity,
        hpCount: hpCount,
        mpCount: mpCount,
        needsRestock: needsRestock,
        buyPotions: buyPotions,
        handle: handle,
        getState: function () { return state; }
    };

    if (utils().log) utils().log("CORE_Restock loaded");
})();
