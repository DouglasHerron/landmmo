/**
 * CORE_Restock.js
 * Travel to potion vendor and restock HP/MP potions.
 * smart_move is fire-and-forget (await hangs and freezes the main loop).
 * Attaches to: BOT.restock
 */
(function () {
    "use strict";

    globalThis.BOT = globalThis.BOT || {};

    let state = "idle"; // idle | traveling | buying | returning
    let lastTravelAt = 0;
    let stateStartedAt = 0;
    const TRAVEL_RETRY_MS = 20000;
    const STATE_TIMEOUT_MS = 90000;

    function utils() {
        return BOT.utils || {};
    }

    function restockCfg() {
        return (BOT.config && BOT.config.restock) || {};
    }

    function farmMonster() {
        return (BOT.config && BOT.config.farm && BOT.config.farm.monster) || "crab";
    }

    function returnDest() {
        const home = BOT.config && BOT.config.home;
        if (home) {
            if (home.to) return { to: home.to };
            if (typeof home.x === "number" && typeof home.y === "number") return home;
        }
        return farmMonster();
    }

    function now() {
        return (utils().now && utils().now()) || Date.now();
    }

    function quantity(name) {
        if (!name || typeof character === "undefined" || !character.items) return 0;

        try {
            const alQuantity = (typeof parent !== "undefined" && parent && parent.quantity)
                || (typeof window !== "undefined" && window && window["quantity"]);
            if (typeof alQuantity === "function" && alQuantity !== quantity) {
                const n = alQuantity(name);
                if (typeof n === "number") return n;
            }
        } catch (e) { /* fall through */ }

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

    function isPathing() {
        try {
            if (typeof is_moving === "function" && is_moving(character)) return true;
            if (typeof smart !== "undefined" && smart && smart.moving) return true;
        } catch (e) { /* ignore */ }
        return false;
    }

    function nearPotionVendor() {
        try {
            if (typeof find_npc === "function") {
                const npc = find_npc("fancypots") || find_npc("pots") || find_npc("basics");
                if (npc && utils().distanceTo && utils().distanceTo(npc) < 350) return true;
            }
        } catch (e) { /* ignore */ }
        return false;
    }

    function nearBank() {
        try {
            if (character.map === "bank") return true;
        } catch (e) { /* ignore */ }
        return false;
    }

    function atReturnDest() {
        const dest = returnDest();
        if (dest && dest.to === "bank") return nearBank();
        if (dest && typeof dest.x === "number") {
            if (dest.map && character.map !== dest.map) return false;
            const dx = character.x - dest.x;
            const dy = character.y - dest.y;
            return Math.sqrt(dx * dx + dy * dy) < 80;
        }
        try {
            const mtype = String(dest || "crab");
            if (typeof get_nearest_monster === "function") {
                const mon = get_nearest_monster({ type: mtype });
                if (mon && utils().distanceTo && utils().distanceTo(mon) < 600) return true;
            }
        } catch (e) { /* ignore */ }
        return false;
    }

    function startMove(dest, label) {
        if (isPathing()) return;
        if (now() - lastTravelAt < TRAVEL_RETRY_MS && lastTravelAt > 0) return;
        lastTravelAt = now();
        if (utils().log && label) utils().log(label);
        try {
            if (BOT.townNav && typeof BOT.townNav.ensureCanMove === "function") {
                BOT.townNav.ensureCanMove();
            }
            const d = (dest && dest.to) ? dest.to : dest;
            if (d === "potions" && BOT.townNav && typeof BOT.townNav.goNamed === "function") {
                BOT.townNav.goNamed("potions");
                return;
            }
            if (BOT.townNav && typeof BOT.townNav.pathTo === "function") {
                BOT.townNav.pathTo(d);
                return;
            }
            if (typeof smart_move === "function") smart_move(d);
        } catch (e) {
            if (utils().error) utils().error("smart_move: " + (utils().safeError ? utils().safeError(e) : e));
        }
    }

    function buyPotions() {
        const cfg = restockCfg();
        const gold = (character && character.gold) || 0;
        if (gold < 1000) {
            if (utils().warn) utils().warn("Restock skipped — not enough gold");
            return 0;
        }

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

    function setState(next) {
        state = next;
        stateStartedAt = now();
    }

    async function handle() {
        if (typeof character === "undefined" || !character) return false;

        const cfg = restockCfg();
        if (cfg.enabled === false) return false;

        const t = now();

        try {
            if (state !== "idle" && t - stateStartedAt > STATE_TIMEOUT_MS) {
                if (utils().warn) utils().warn("Restock timeout — returning");
                setState("returning");
                startMove(returnDest(), "Restock abort — returning");
            }

            if (state === "idle") {
                if (!needsRestock()) return false;
                // Broke characters should farm, not spin on vendors
                if ((character.gold || 0) < 1000) return false;
                setState("traveling");
                startMove({ to: "potions" }, "Traveling to potion vendor");
                return true;
            }

            if (state === "traveling") {
                if (!needsRestock()) {
                    setState("returning");
                    startMove(returnDest(), "Restock no longer needed — returning");
                    return true;
                }
                if (!nearPotionVendor()) {
                    startMove({ to: "potions" }, "Traveling to potion vendor");
                    return true;
                }
                setState("buying");
                buyPotions();
                setState("returning");
                startMove(returnDest(), "Restock done — returning");
                return true;
            }

            if (state === "returning") {
                if (atReturnDest() || (!isPathing() && t - stateStartedAt > TRAVEL_RETRY_MS * 2)) {
                    setState("idle");
                    return false;
                }
                if (!isPathing()) startMove(returnDest(), "Returning from restock");
                return true;
            }

            if (state === "buying") {
                setState("idle");
                return false;
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
        getState: function () { return state; },
        reset: function () { state = "idle"; stateStartedAt = 0; }
    };

    if (utils().log) utils().log("CORE_Restock loaded");
})();
