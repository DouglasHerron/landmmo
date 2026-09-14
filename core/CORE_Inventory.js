/**
 * CORE_Inventory.js
 * Sell approved junk near vendors, bank loot, return to farm.
 * smart_move is fire-and-forget (await hangs and freezes the main loop).
 * Attaches to: BOT.inventory
 */
(function () {
    "use strict";

    globalThis.BOT = globalThis.BOT || {};

    let state = "idle"; // idle | traveling_sell | selling | traveling_bank | banking | returning
    let lastActionAt = 0;
    let stateStartedAt = 0;
    const TRAVEL_RETRY_MS = 20000;
    const STATE_TIMEOUT_MS = 90000;

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

    function now() {
        return (utils().now && utils().now()) || Date.now();
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
        if (item.stat_type) return true;
        if (item.p) return true;
        return false;
    }

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

    function shouldBank(item) {
        if (!item) return false;
        const cfg = invCfg();
        if (cfg.autoBank === false) return false;

        if (isProtected(item)) return false;
        try {
            if (BOT.logistics && typeof BOT.logistics.shouldHoldItem === "function" && BOT.logistics.shouldHoldItem(item)) {
                return false;
            }
        } catch (e) { /* ignore */ }
        if (isLocked(item)) return true;
        if (item.name === "anniversarygift") return true;
        if (shouldSell(item)) return false;
        if ((item.level || 0) > 0) return true;
        if (hasStats(item)) return true;
        return true;
    }

    function isPathing() {
        try {
            if (typeof is_moving === "function" && is_moving(character)) return true;
            if (typeof smart !== "undefined" && smart && smart.moving) return true;
        } catch (e) { /* ignore */ }
        return false;
    }

    function nearMerchant() {
        try {
            if (typeof find_npc === "function") {
                const npc = find_npc("basics") || find_npc("exchange") || find_npc("pots") || find_npc("fancypots");
                if (npc && utils().distanceTo && utils().distanceTo(npc) < 400) return true;
            }
        } catch (e) { /* ignore */ }
        try {
            // Town plaza fallback (broader than old 200px — spawn isn't always 0,0)
            if (character.map === "main" && Math.abs(character.x) < 100 && Math.abs(character.y) < 150) {
                return true;
            }
        } catch (e) { /* ignore */ }
        return false;
    }

    function nearBank() {
        try {
            if (character.map === "bank") return true;
            if (typeof find_npc === "function") {
                const npc = find_npc("bank");
                if (npc && utils().distanceTo && utils().distanceTo(npc) < 400) return true;
            }
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
        // Farm monster nearby
        try {
            const mtype = String(dest || "crab");
            if (typeof get_nearest_monster === "function") {
                const mon = get_nearest_monster({ type: mtype });
                if (mon && utils().distanceTo && utils().distanceTo(mon) < 600) return true;
            }
        } catch (e) { /* ignore */ }
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
            if (shouldSell(item)) continue;
            if (shouldBank(item)) return i;
        }
        return -1;
    }

    function hasJunkToSell() {
        return findSellSlot() !== -1;
    }

    function muleCfg() {
        return (BOT.config && BOT.config.mule) || {};
    }

    function muleName() {
        return muleCfg().name || "";
    }

    function muleEnabled() {
        return !!muleName();
    }

    function dumpDistance() {
        const d = muleCfg().dumpDistance;
        return typeof d === "number" ? d : 320;
    }

    function getMule() {
        const name = muleName();
        if (!name) return null;
        try {
            if (typeof get_player === "function") {
                const p = get_player(name);
                if (p) return p;
            }
        } catch (e) { /* ignore */ }
        return null;
    }

    function muleInRange() {
        const mule = getMule();
        if (!mule) return null;
        const dist = utils().distanceTo ? utils().distanceTo(mule) : Infinity;
        if (dist > dumpDistance()) return null;
        return mule;
    }

    /**
     * Items farmers push to Dorchant: sell-whitelist junk, gifts, and
     * non-protected loot when inventory is tight.
     */
    function shouldDump(item) {
        if (!item) return false;
        if (isProtected(item)) return false;
        if (isLocked(item)) return false;
        if (item.name === "anniversarygift") return true;

        const cfg = invCfg();
        const sellItems = cfg.sellItems || [];
        if (sellItems.indexOf(item.name) !== -1 && (item.level || 0) === 0 && !hasStats(item)) {
            return true;
        }

        // When low on space, dump anything not protected (mule sells/banks)
        if (inventoryFullSoon()) return true;
        return false;
    }

    function findDumpSlot() {
        if (!character.items) return -1;
        for (let i = 0; i < character.items.length; i++) {
            if (shouldDump(character.items[i])) return i;
        }
        return -1;
    }

    function needsDump() {
        if (!muleEnabled()) return false;
        if (hasAnniversaryGift()) return true;
        if (findDumpSlot() === -1) return false;
        // Always dump sell-whitelist junk when present; dump other loot when tight
        const cfg = invCfg();
        const sellItems = cfg.sellItems || [];
        if (character.items) {
            for (let i = 0; i < character.items.length; i++) {
                const it = character.items[i];
                if (!it) continue;
                if (sellItems.indexOf(it.name) !== -1 && (it.level || 0) === 0 && !isProtected(it) && !isLocked(it)) {
                    return true;
                }
            }
        }
        return inventoryFullSoon();
    }

    let lastMuleRequestAt = 0;
    const MULE_REQUEST_MS = 20000;

    function requestMule() {
        const name = muleName();
        if (!name) return;
        const t = now();
        if (t - lastMuleRequestAt < MULE_REQUEST_MS) return;
        lastMuleRequestAt = t;
        try {
            if (typeof send_cm === "function") {
                send_cm(name, "need_dump");
                if (utils().log) utils().log("Requested dump pickup from " + name);
            }
        } catch (e) {
            if (utils().error) utils().error("send_cm: " + (utils().safeError ? utils().safeError(e) : e));
        }
    }

    function dumpOneToMule() {
        const mule = muleInRange();
        if (!mule) return false;
        const slot = findDumpSlot();
        if (slot < 0) return false;
        const item = character.items[slot];
        if (!item) return false;

        try {
            if (typeof send_item === "function") {
                send_item(mule.name, slot, item.q || 1);
                if (utils().log) utils().log("Dumped " + item.name + " → " + mule.name);
                return true;
            }
        } catch (e) {
            if (utils().error) utils().error("send_item: " + (utils().safeError ? utils().safeError(e) : e));
        }
        return false;
    }

    /**
     * Farmer mule path: dump to Dorchant when nearby; never leave farm if mule is set.
     * @returns {boolean|null} true = busy dumping, false = nothing to do, null = fall through to town
     */
    function handleMuleDump() {
        if (!muleEnabled()) return null;
        if (BOT.role === "merchant") return null;

        if (!needsDump()) return false;

        if (muleInRange()) {
            dumpOneToMule();
            return true;
        }

        // Wait for mule — request pickup, stay on farm (no town trip)
        requestMule();
        return false;
    }

    function hasAnniversaryGift() {
        if (!character.items) return false;
        for (let i = 0; i < character.items.length; i++) {
            const it = character.items[i];
            if (it && it.name === "anniversarygift") return true;
        }
        return false;
    }

    function needsCleanup() {
        if (hasAnniversaryGift()) return true;
        if (!inventoryFullSoon()) return false;
        const cfg = invCfg();
        if (cfg.autoSell !== false && hasJunkToSell()) return true;
        if (cfg.autoBank !== false && findBankSlot() !== -1) return true;
        return false;
    }

    function setState(next) {
        state = next;
        stateStartedAt = now();
        lastActionAt = stateStartedAt;
    }

    function startMove(dest, label) {
        if (isPathing()) return;
        if (now() - lastActionAt < TRAVEL_RETRY_MS && lastActionAt > 0) return;
        lastActionAt = now();
        if (utils().log) utils().log(label || ("Moving to " + (dest && dest.to ? dest.to : dest)));
        try {
            if (typeof smart_move === "function") smart_move(dest);
        } catch (e) {
            if (utils().error) utils().error("smart_move: " + (utils().safeError ? utils().safeError(e) : e));
        }
    }

    function sellJunk() {
        if (!nearMerchant()) return 0;
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
        if (!nearBank()) return 0;
        let stored = 0;
        if (!character.items) return 0;

        for (let i = 0; i < character.items.length; i++) {
            const item = character.items[i];
            if (!item) continue;
            if (isProtected(item)) continue;
            if (shouldSell(item)) continue;
            if (!shouldBank(item) && item.name !== "anniversarygift") {
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

    function abortToFarm(reason) {
        if (utils().warn) utils().warn("Inventory abort: " + reason);
        setState("returning");
        startMove(returnDest(), "Returning to: " + ((returnDest() && returnDest().to) || returnDest() || "?"));
    }

    /**
     * @returns {boolean} true when inventory work should override combat
     */
    async function handle() {
        if (typeof character === "undefined" || !character) return false;

        const cfg = invCfg();
        const t = now();

        try {
            // Global timeout — never freeze combat forever
            if (state !== "idle" && t - stateStartedAt > STATE_TIMEOUT_MS) {
                abortToFarm("timeout in " + state);
            }

            if (state === "idle") {
                // Farmers with a mule: dump to Dorchant, skip town sell/bank
                const muleResult = handleMuleDump();
                if (muleResult === true) return true;
                if (muleResult === false) return false;
                // muleResult === null → no mule configured, use town cleanup

                if (!needsCleanup()) return false;

                // Sell only when low on space AND whitelist junk exists
                if (cfg.autoSell !== false && inventoryFullSoon() && hasJunkToSell()) {
                    setState("traveling_sell");
                    startMove({ to: "main" }, "Traveling to merchant to sell junk");
                    return true;
                }

                if (cfg.autoBank !== false && (hasAnniversaryGift() || (inventoryFullSoon() && findBankSlot() !== -1))) {
                    setState("traveling_bank");
                    startMove({ to: "bank" }, "Traveling to bank");
                    return true;
                }

                return false;
            }

            if (state === "traveling_sell") {
                // Abort if inventory freed up / nothing left to sell
                if (!hasJunkToSell() || !inventoryFullSoon()) {
                    abortToFarm("sell no longer needed");
                    return true;
                }
                if (!nearMerchant()) {
                    startMove({ to: "main" }, "Traveling to merchant to sell junk");
                    return true;
                }
                setState("selling");
                sellJunk();
                if (inventoryFullSoon() && cfg.autoBank !== false && findBankSlot() !== -1) {
                    setState("traveling_bank");
                    startMove({ to: "bank" }, "Traveling to bank");
                } else {
                    setState("returning");
                    startMove(returnDest(), "Returning to farm");
                }
                return true;
            }

            if (state === "traveling_bank") {
                if (!hasAnniversaryGift() && !inventoryFullSoon() && findBankSlot() === -1) {
                    abortToFarm("bank no longer needed");
                    return true;
                }
                if (!nearBank()) {
                    startMove({ to: "bank" }, "Traveling to bank");
                    return true;
                }
                setState("banking");
                bankItems();
                setState("returning");
                startMove(returnDest(), "Returning to farm");
                return true;
            }

            if (state === "returning") {
                if (atReturnDest() || (!isPathing() && t - stateStartedAt > TRAVEL_RETRY_MS * 2)) {
                    setState("idle");
                    return false;
                }
                if (!isPathing()) startMove(returnDest(), "Returning to farm");
                return true;
            }

            // selling / banking are instantaneous transitions
            if (state === "selling" || state === "banking") {
                setState("idle");
                return false;
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
        handle: handle,
        getState: function () { return state; },
        reset: function () { state = "idle"; stateStartedAt = 0; }
    };

    if (utils().log) utils().log("CORE_Inventory loaded");
})();
