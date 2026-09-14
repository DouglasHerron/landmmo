/**
 * CORE_Inventory.js
 * Sell approved junk near vendors, bank loot, return to farm.
 * Attaches to: BOT.inventory
 */
(function () {
    "use strict";

    globalThis.BOT = globalThis.BOT || {};

    let state = "idle"; // idle | traveling_sell | selling | traveling_bank | banking | returning
    let lastActionAt = 0;
    const ACTION_COOLDOWN_MS = 1500;

    function utils() {
        return BOT.utils || {};
    }

    function invCfg() {
        return (BOT.config && BOT.config.inventory) || {};
    }

    function farmMonster() {
        return (BOT.config && BOT.config.farm && BOT.config.farm.monster) || "crab";
    }

    /** Farmers → farm monster; merchant → config.home (e.g. { to: "bank" }). */
    function returnDest() {
        const home = BOT.config && BOT.config.home;
        if (home) {
            if (home.to) return { to: home.to };
            if (typeof home.x === "number" && typeof home.y === "number") return home;
        }
        return farmMonster();
    }

    function usedSlots() {
        if (typeof character === "undefined" || !character || !character.items) return 0;
        let used = 0;
        for (let i = 0; i < character.items.length; i++) {
            if (character.items[i]) used++;
        }
        return used;
    }

    function freeSlots() {
        if (typeof character === "undefined" || !character || !character.items) return 0;
        return character.items.length - usedSlots();
    }

    function inventoryFullSoon() {
        const cfg = invCfg();
        const minFree = typeof cfg.minimumFreeSlots === "number" ? cfg.minimumFreeSlots : 5;
        return freeSlots() <= minFree;
    }

    function isProtected(item) {
        if (!item) return true;
        const cfg = invCfg();
        const protectedItems = cfg.protectedItems || [];
        if (protectedItems.indexOf(item.name) !== -1) return true;
        return false;
    }

    function isLocked(item) {
        return !!(item && (item.l || item.locked));
    }

    function hasStats(item) {
        if (!item) return false;
        // Statted / compound / special props — keep these
        if (item.stat_type) return true;
        if (item.p) return true; // shiny / special
        return false;
    }

    /**
     * Only sell exact item IDs in sellItems whitelist,
     * and only +0, unlocked, unstatted, unprotected.
     */
    function shouldSell(item) {
        if (!item) return false;
        const cfg = invCfg();
        if (cfg.autoSell === false) return false;

        const sellItems = cfg.sellItems || [];
        if (sellItems.indexOf(item.name) === -1) return false;
        if (isProtected(item)) return false;
        if (isLocked(item)) return false;
        if (hasStats(item)) return false;
        if ((item.level || 0) > 0) return false;
        return true;
    }

    /**
     * Bank remaining loot when still low on space.
     * +1+ versions, gifts, and non-sell junk go to bank.
     */
    function shouldBank(item) {
        if (!item) return false;
        const cfg = invCfg();
        if (cfg.autoBank === false) return false;

        if (isProtected(item)) return false;
        // Merchant wishlist gear — keep in inventory until upgrade hits maxLevel
        try {
            if (BOT.logistics && typeof BOT.logistics.shouldHoldItem === "function" && BOT.logistics.shouldHoldItem(item)) {
                return false;
            }
        } catch (e) {
            // ignore
        }
        if (isLocked(item)) return true; // don't sell; bank if needed
        if (item.name === "anniversarygift") return true;
        if (shouldSell(item)) return false;
        // Upgraded / statted gear and other loot
        if ((item.level || 0) > 0) return true;
        if (hasStats(item)) return true;
        // Unknown junk — bank rather than destroy/sell
        return true;
    }

    function nearMerchant() {
        try {
            if (typeof find_npc === "function") {
                const npc = find_npc("basics") || find_npc("exchange") || find_npc("pots");
                if (npc && utils().distanceTo && utils().distanceTo(npc) < 400) return true;
            }
        } catch (e) {
            // ignore
        }
        // Fallback: in main town map near spawn area
        try {
            if (character.map === "main" && Math.abs(character.x) < 200 && Math.abs(character.y) < 200) {
                return true;
            }
        } catch (e) {
            // ignore
        }
        return false;
    }

    function nearBank() {
        try {
            if (character.map === "bank") return true;
            if (typeof find_npc === "function") {
                const npc = find_npc("bank");
                if (npc && utils().distanceTo && utils().distanceTo(npc) < 400) return true;
            }
        } catch (e) {
            // ignore
        }
        return false;
    }

    function findSellSlot() {
        if (!character.items) return -1;
        for (let i = 0; i < character.items.length; i++) {
            if (shouldSell(character.items[i])) return i;
        }
        return -1;
    }

    function findBankSlot() {
        if (!character.items) return -1;
        for (let i = 0; i < character.items.length; i++) {
            const item = character.items[i];
            if (!item) continue;
            if (isProtected(item)) continue;
            if (shouldSell(item)) continue; // sell first when autoSell
            if (shouldBank(item)) return i;
        }
        return -1;
    }

    function hasJunkToSell() {
        return findSellSlot() !== -1;
    }

    function needsCleanup() {
        const cfg = invCfg();
        if (!inventoryFullSoon()) {
            // Still bank anniversarygift even if not full
            if (character.items) {
                for (let i = 0; i < character.items.length; i++) {
                    const it = character.items[i];
                    if (it && it.name === "anniversarygift") return true;
                }
            }
            return false;
        }
        if (cfg.autoSell !== false && hasJunkToSell()) return true;
        if (cfg.autoBank !== false && findBankSlot() !== -1) return true;
        return inventoryFullSoon();
    }

    async function travelToSell() {
        if (utils().log) utils().log("Traveling to merchant to sell junk");
        try {
            if (typeof smart_move === "function") {
                await smart_move({ to: "main" });
            }
        } catch (e) {
            if (utils().error) utils().error("travel sell: " + (utils().safeError ? utils().safeError(e) : e));
        }
    }

    async function travelToBank() {
        if (utils().log) utils().log("Traveling to bank");
        try {
            if (typeof smart_move === "function") {
                await smart_move({ to: "bank" });
            }
        } catch (e) {
            if (utils().error) utils().error("travel bank: " + (utils().safeError ? utils().safeError(e) : e));
        }
    }

    function sellJunk() {
        if (!nearMerchant()) {
            if (utils().warn) utils().warn("sellJunk: not near merchant — skip");
            return 0;
        }

        let sold = 0;
        if (!character.items) return 0;

        for (let i = 0; i < character.items.length; i++) {
            const item = character.items[i];
            if (!shouldSell(item)) continue;
            try {
                if (typeof sell === "function") {
                    sell(i, item.q || 1);
                    sold++;
                    if (utils().log) utils().log("Sold " + item.name + " +" + (item.level || 0));
                }
            } catch (e) {
                if (utils().error) utils().error("sell failed slot " + i + ": " + (utils().safeError ? utils().safeError(e) : e));
            }
        }
        return sold;
    }

    function bankItems() {
        if (!nearBank()) {
            if (utils().warn) utils().warn("bankItems: not near bank — skip");
            return 0;
        }

        let stored = 0;
        if (!character.items) return 0;

        for (let i = 0; i < character.items.length; i++) {
            const item = character.items[i];
            if (!item) continue;
            if (isProtected(item)) continue;
            if (shouldSell(item)) continue;
            if (!shouldBank(item) && item.name !== "anniversarygift") {
                // When inventory still tight, bank non-protected loot
                if (!inventoryFullSoon()) continue;
            }
            try {
                if (typeof bank_store === "function") {
                    bank_store(i);
                    stored++;
                    if (utils().log) utils().log("Banked " + item.name);
                }
            } catch (e) {
                if (utils().error) utils().error("bank_store failed: " + (utils().safeError ? utils().safeError(e) : e));
            }
        }
        return stored;
    }

    async function returnToFarm() {
        const dest = returnDest();
        const label = (dest && dest.to) || dest || "?";
        if (utils().log) utils().log("Returning to: " + label);
        try {
            if (typeof smart_move === "function") {
                await smart_move(dest);
            }
        } catch (e) {
            if (utils().error) utils().error("returnToFarm: " + (utils().safeError ? utils().safeError(e) : e));
        }
    }

    /**
     * @returns {boolean} true when inventory work should override combat
     */
    async function handle() {
        if (typeof character === "undefined" || !character) return false;

        const cfg = invCfg();
        const now = (utils().now && utils().now()) || Date.now();

        try {
            if (state === "idle") {
                if (!needsCleanup()) return false;

                if (cfg.autoSell !== false && hasJunkToSell()) {
                    state = "traveling_sell";
                    lastActionAt = now;
                    await travelToSell();
                    return true;
                }

                if (cfg.autoBank !== false && (inventoryFullSoon() || findBankSlot() !== -1)) {
                    state = "traveling_bank";
                    lastActionAt = now;
                    await travelToBank();
                    return true;
                }

                return false;
            }

            if (state === "traveling_sell") {
                if (!nearMerchant()) {
                    if (now - lastActionAt > 30000) {
                        // retry travel
                        lastActionAt = now;
                        await travelToSell();
                    }
                    return true;
                }
                state = "selling";
                sellJunk();
                lastActionAt = now;

                if (inventoryFullSoon() && cfg.autoBank !== false) {
                    state = "traveling_bank";
                    await travelToBank();
                } else {
                    state = "returning";
                    await returnToFarm();
                    state = "idle";
                }
                return true;
            }

            if (state === "traveling_bank") {
                if (!nearBank()) {
                    if (now - lastActionAt > 30000) {
                        lastActionAt = now;
                        await travelToBank();
                    }
                    return true;
                }
                state = "banking";
                bankItems();
                lastActionAt = now;
                state = "returning";
                await returnToFarm();
                state = "idle";
                return true;
            }

            if (state === "returning") {
                return true;
            }
        } catch (e) {
            state = "idle";
            if (utils().error) utils().error("CORE_Inventory: " + (utils().safeError ? utils().safeError(e) : e));
        }

        return state !== "idle";
    }

    BOT.inventory = {
        usedSlots: usedSlots,
        freeSlots: freeSlots,
        inventoryFullSoon: inventoryFullSoon,
        isProtected: isProtected,
        shouldSell: shouldSell,
        shouldBank: shouldBank,
        sellJunk: sellJunk,
        bankItems: bankItems,
        returnToFarm: returnToFarm,
        handle: handle,
        getState: function () { return state; }
    };

    if (utils().log) utils().log("CORE_Inventory loaded");
})();
