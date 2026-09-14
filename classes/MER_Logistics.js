/**
 * MER_Logistics.js
 * Merchant mule: scout party gear, buy/upgrade/compound only what's missing, home at bank.
 * Attaches to: BOT.logistics
 */
(function () {
    "use strict";

    globalThis.BOT = globalThis.BOT || {};

    let traveling = false;
    let lastTravelAt = 0;
    let lastUpgradeAt = 0;
    let lastScoutAt = 0;
    let lastBuyAt = 0;
    let scoutAnnounceAt = 0;
    let scoutTravelDone = false;
    let pickupRequestedAt = Date.now(); // force first farm trip on load
    let pickupFrom = "";
    let lastPickupRoundAt = 0;
    let lingerUntil = 0;
    let lastMoveX = 0;
    let lastMoveY = 0;
    let lastMoveCheckAt = 0;

    /** @type {Object.<string, { gear: Object.<string, number>, at: number, seen: boolean }>} */
    let partyStatus = {};

    const TRAVEL_COOLDOWN_MS = 15000;
    const UPGRADE_COOLDOWN_MS = 800;
    const BUY_COOLDOWN_MS = 1200;
    const HOME_RANGE = 120;
    const NPC_RANGE = 350;

    function utils() {
        return BOT.utils || {};
    }

    function homeCfg() {
        return (BOT.config && BOT.config.home) || { to: "bank" };
    }

    function upgradeCfg() {
        return (BOT.config && BOT.config.upgrade) || {};
    }

    function scoutCfg() {
        return (BOT.config && BOT.config.scout) || {};
    }

    function buyGearCfg() {
        return (BOT.config && BOT.config.buyGear) || {};
    }

    function clients() {
        return (BOT.config && BOT.config.clients) || [];
    }

    function targets() {
        return upgradeCfg().targets || [];
    }

    function now() {
        return (utils().now && utils().now()) || Date.now();
    }

    function gItem(name) {
        try {
            if (typeof G !== "undefined" && G && G.items && G.items[name]) return G.items[name];
        } catch (e) { /* ignore */ }
        return null;
    }

    function isCompoundable(item) {
        if (!item) return false;
        const g = gItem(item.name);
        return !!(g && g.compound);
    }

    function isUpgradeable(item) {
        if (!item) return false;
        const g = gItem(item.name);
        return !!(g && g.upgrade);
    }

    function isLocked(item) {
        return !!(item && (item.l || item.locked));
    }

    function scrollGrade(item) {
        let grade = 0;
        try {
            if (typeof item_grade === "function") grade = item_grade(item) || 0;
        } catch (e) {
            grade = 0;
        }
        if (grade < 0) grade = 0;
        if (grade > 2) grade = 2;
        return grade;
    }

    function scrollName(item, compound) {
        return (compound ? "cscroll" : "scroll") + scrollGrade(item);
    }

    function quantity(name) {
        if (!name || !character.items) return 0;
        try {
            const alQ = (typeof parent !== "undefined" && parent && parent.quantity)
                || (typeof window !== "undefined" && window && window.quantity);
            if (typeof alQ === "function" && alQ !== quantity) {
                const n = alQ(name);
                if (typeof n === "number") return n;
            }
        } catch (e) { /* fall through */ }
        let total = 0;
        for (let i = 0; i < character.items.length; i++) {
            const it = character.items[i];
            if (it && it.name === name) total += it.q || 1;
        }
        return total;
    }

    function findScrollSlot(name) {
        if (!character.items) return -1;
        for (let i = 0; i < character.items.length; i++) {
            const it = character.items[i];
            if (it && it.name === name && (it.q || 1) > 0) return i;
        }
        return -1;
    }

    function getPlayer(name) {
        try {
            if (typeof get_player === "function") {
                const p = get_player(name);
                if (p) return p;
            }
        } catch (e) { /* ignore */ }
        try {
            if (typeof get_entity === "function") {
                const e = get_entity(name);
                if (e && e.type === "character") return e;
            }
        } catch (e2) { /* ignore */ }
        return null;
    }

    /**
     * Best level per item name from equipped slots (+ inventory if visible).
     */
    function scanEntityGear(player) {
        const best = {};
        function consider(item) {
            if (!item || !item.name) return;
            const lv = item.level || 0;
            if (best[item.name] === undefined || lv > best[item.name]) best[item.name] = lv;
        }
        try {
            if (player.slots) {
                for (const slot in player.slots) {
                    if (Object.prototype.hasOwnProperty.call(player.slots, slot)) {
                        consider(player.slots[slot]);
                    }
                }
            }
        } catch (e) { /* ignore */ }
        try {
            if (player.items && player.items.length) {
                for (let i = 0; i < player.items.length; i++) consider(player.items[i]);
            }
        } catch (e2) { /* ignore */ }
        return best;
    }

    function inspectClient(name) {
        const player = getPlayer(name);
        if (!player) {
            if (!partyStatus[name]) {
                partyStatus[name] = { gear: {}, at: 0, seen: false };
            }
            return null;
        }
        const gear = scanEntityGear(player);
        partyStatus[name] = { gear: gear, at: now(), seen: true };
        return gear;
    }

    function inspectNearbyClients() {
        const list = clients();
        let found = 0;
        for (let i = 0; i < list.length; i++) {
            if (inspectClient(list[i])) found++;
        }
        return found;
    }

    function clientBest(clientName, itemName) {
        const st = partyStatus[clientName];
        if (!st || !st.seen || st.neverSeen) return null;
        const lv = st.gear[itemName];
        return typeof lv === "number" ? lv : -1;
    }

    function clientInspected(clientName) {
        const st = partyStatus[clientName];
        return !!(st && st.seen);
    }

    function allClientsInspected() {
        const list = clients();
        if (!list.length) return false;
        for (let i = 0; i < list.length; i++) {
            if (!clientInspected(list[i])) return false;
        }
        return true;
    }

    /**
     * True if this client still needs itemName upgraded toward their target max.
     * Offline-never-seen → skip (don't buy blind). Stale cache OK while offline.
     */
    function clientNeeds(clientName, itemName) {
        const st = partyStatus[clientName];
        if (!st || !st.seen || st.neverSeen) return false;

        const list = targets();
        for (let i = 0; i < list.length; i++) {
            const t = list[i];
            if (!t || t.for !== clientName || t.name !== itemName) continue;
            const best = clientBest(clientName, itemName);
            if (best === null) return false;
            const max = typeof t.maxLevel === "number" ? t.maxLevel : 0;
            if (best < max) return true;
        }
        return false;
    }

    /**
     * Highest maxLevel among clients who still need this item.
     * -1 = nobody needs it (all satisfied or not inspected).
     */
    function usefulMaxLevel(itemName) {
        let max = -1;
        const list = targets();
        for (let i = 0; i < list.length; i++) {
            const t = list[i];
            if (!t || t.name !== itemName) continue;
            if (!clientNeeds(t.for, itemName)) continue;
            const ml = typeof t.maxLevel === "number" ? t.maxLevel : 0;
            if (ml > max) max = ml;
        }
        return max;
    }

    function partyNeedsItem(itemName) {
        return usefulMaxLevel(itemName) >= 0;
    }

    function merchantBestLevel(itemName) {
        if (!character.items) return -1;
        let best = -1;
        for (let i = 0; i < character.items.length; i++) {
            const it = character.items[i];
            if (!it || it.name !== itemName || isLocked(it)) continue;
            const lv = it.level || 0;
            if (lv > best) best = lv;
        }
        return best;
    }

    function merchantHasInProgress(itemName) {
        const useful = usefulMaxLevel(itemName);
        if (useful < 0) return false;
        if (!character.items) return false;
        for (let i = 0; i < character.items.length; i++) {
            const it = character.items[i];
            if (!it || it.name !== itemName || isLocked(it)) continue;
            if ((it.level || 0) < useful) return true;
        }
        return false;
    }

    /**
     * Gaps: targets where party member is below max (after inspect).
     */
    function gaps() {
        const out = [];
        const list = targets();
        for (let i = 0; i < list.length; i++) {
            const t = list[i];
            if (!t || !t.for || !t.name) continue;
            const best = clientBest(t.for, t.name);
            if (best === null) {
                out.push({
                    for: t.for,
                    name: t.name,
                    have: null,
                    maxLevel: t.maxLevel,
                    status: "unscanned"
                });
                continue;
            }
            const max = typeof t.maxLevel === "number" ? t.maxLevel : 0;
            if (best < max) {
                out.push({
                    for: t.for,
                    name: t.name,
                    have: best < 0 ? null : best,
                    maxLevel: max,
                    status: "need",
                    merchant: merchantBestLevel(t.name)
                });
            } else {
                out.push({
                    for: t.for,
                    name: t.name,
                    have: best,
                    maxLevel: max,
                    status: "ok"
                });
            }
        }
        return out;
    }

    function gearReport() {
        const rows = gaps();
        const lines = ["Dorchant gear status:"];
        for (let i = 0; i < rows.length; i++) {
            const r = rows[i];
            if (r.status === "ok") {
                lines.push("  OK  " + r.for + " " + r.name + " +" + r.have + " (cap +" + r.maxLevel + ")");
            } else if (r.status === "unscanned") {
                lines.push("  ??? " + r.for + " " + r.name + " (not inspected yet)");
            } else {
                const have = r.have === null ? "none" : ("+" + r.have);
                const mer = r.merchant >= 0 ? (" merch +" + r.merchant) : " merch none";
                lines.push("  NEED " + r.for + " " + r.name + " have " + have + " → +" + r.maxLevel + mer);
            }
        }
        const text = lines.join("\n");
        if (utils().log) utils().log(text);
        return rows;
    }

    function shouldHoldItem(item) {
        if (!item || !upgradeCfg().enabled) return false;
        if (isLocked(item)) return false;

        // Before first scout: hold any wishlist item name (don't sell/bank blind)
        if (!allClientsInspected()) {
            const list = targets();
            for (let i = 0; i < list.length; i++) {
                if (list[i] && list[i].name === item.name) return true;
            }
            return false;
        }

        // While party still needs this item, keep every copy (upgrade + deliver)
        return partyNeedsItem(item.name);
    }

    function findUpgradeSlot() {
        if (!character.items || !allClientsInspected()) return -1;
        for (let i = 0; i < character.items.length; i++) {
            const item = character.items[i];
            if (!item || isLocked(item)) continue;
            if (!isUpgradeable(item)) continue;
            const useful = usefulMaxLevel(item.name);
            if (useful < 0) continue;
            if ((item.level || 0) >= useful) continue;
            return i;
        }
        return -1;
    }

    function findCompoundSet() {
        if (!character.items || !allClientsInspected()) return null;
        const groups = {};

        for (let i = 0; i < character.items.length; i++) {
            const item = character.items[i];
            if (!item || isLocked(item)) continue;
            if (!isCompoundable(item)) continue;
            const useful = usefulMaxLevel(item.name);
            if (useful < 0) continue;
            if ((item.level || 0) >= useful) continue;

            const key = item.name + "@" + (item.level || 0);
            if (!groups[key]) groups[key] = [];
            groups[key].push(i);
            if (groups[key].length >= 3) {
                return { a: groups[key][0], b: groups[key][1], c: groups[key][2] };
            }
        }
        return null;
    }

    function hasUpgradeWork() {
        if (!upgradeCfg().enabled) return false;
        if (!allClientsInspected()) return false;
        return findUpgradeSlot() !== -1 || !!findCompoundSet();
    }

    function itemsToBuy() {
        const cfg = buyGearCfg();
        if (cfg.enabled === false || !cfg.enabled) return [];
        if (!allClientsInspected()) return [];
        // No gold → never route to town for gear; sell/loot first
        if (gold() < minGoldReserve()) return [];

        const buy = [];
        const seen = {};
        const list = targets();

        for (let i = 0; i < list.length; i++) {
            const t = list[i];
            if (!t || !t.name) continue;
            if (seen[t.name]) continue;
            seen[t.name] = true;

            if (!partyNeedsItem(t.name)) continue;
            if (merchantHasInProgress(t.name)) continue;
            if (merchantBestLevel(t.name) >= usefulMaxLevel(t.name)) continue;

            const g = gItem(t.name);
            if (!g || typeof g.g !== "number") continue;
            if (!canAfford(t.name)) continue;

            buy.push(t.name);
        }
        return buy;
    }

    function neededScrolls() {
        const need = {};
        const slot = findUpgradeSlot();
        if (slot !== -1) {
            need[scrollName(character.items[slot], false)] = true;
        }
        const set = findCompoundSet();
        if (set) {
            need[scrollName(character.items[set.a], true)] = true;
        }
        return Object.keys(need);
    }

    function scrollsToBuy() {
        const cfg = upgradeCfg();
        if (cfg.buyScrolls === false) return [];
        if (!hasUpgradeWork()) return [];
        if (gold() < minGoldReserve()) return [];
        const min = typeof cfg.minimumScrolls === "number" ? cfg.minimumScrolls : 5;
        const desired = typeof cfg.desiredScrolls === "number" ? cfg.desiredScrolls : 20;
        const buy = [];
        const names = neededScrolls();
        ["scroll0", "cscroll0"].forEach(function (n) {
            if (names.indexOf(n) === -1) names.push(n);
        });
        for (let i = 0; i < names.length; i++) {
            const name = names[i];
            if (quantity(name) < min && canAfford(name)) {
                buy.push({ name: name, qty: Math.max(1, desired - quantity(name)) });
            }
        }
        return buy;
    }

    function nearNpc(ids) {
        try {
            if (typeof find_npc === "function") {
                for (let i = 0; i < ids.length; i++) {
                    const npc = find_npc(ids[i]);
                    if (npc && utils().distanceTo && utils().distanceTo(npc) < NPC_RANGE) return true;
                }
            }
        } catch (e) { /* ignore */ }
        return false;
    }

    function nearUpgrade() {
        return nearNpc(["upgrade", "compound"]);
    }

    function nearScrolls() {
        return nearNpc(["scrolls", "basics"]);
    }

    function atHome() {
        const home = homeCfg();
        try {
            if (home.to === "bank") {
                if (character.map === "bank") return true;
                if (typeof find_npc === "function") {
                    const npc = find_npc("bank");
                    if (npc && utils().distanceTo && utils().distanceTo(npc) < 400) return true;
                }
                return false;
            }
            if (typeof home.x === "number" && typeof home.y === "number") {
                if (home.map && character.map !== home.map) return false;
                const dx = character.x - home.x;
                const dy = character.y - home.y;
                return Math.sqrt(dx * dx + dy * dy) < HOME_RANGE;
            }
        } catch (e) { /* ignore */ }
        return false;
    }

    function isPathing() {
        if (traveling) return true;
        try {
            if (typeof is_moving === "function" && is_moving(character)) return true;
            if (typeof smart !== "undefined" && smart && smart.moving) return true;
        } catch (e) { /* ignore */ }
        return false;
    }

    function isUpgrading() {
        try {
            if (character.q && (character.q.upgrade || character.q.compound)) return true;
        } catch (e) { /* ignore */ }
        return false;
    }

    async function smartTo(dest, force) {
        const t = now();
        if (!force) {
            if (isPathing() && !isMoveStuck()) return;
            if (t - lastTravelAt < TRAVEL_COOLDOWN_MS) return;
        }
        lastTravelAt = t;
        lastMoveX = character.x;
        lastMoveY = character.y;
        lastMoveCheckAt = t;
        try {
            if (typeof smart_move === "function") smart_move(dest);
        } catch (e) {
            if (utils().error) utils().error("smart_move: " + (utils().safeError ? utils().safeError(e) : e));
        }
    }

    function isMoveStuck() {
        try {
            if (!isPathing()) return false;
            const t = now();
            if (t - lastMoveCheckAt < 8000) return false;
            const dx = (character.x || 0) - lastMoveX;
            const dy = (character.y || 0) - lastMoveY;
            lastMoveCheckAt = t;
            lastMoveX = character.x;
            lastMoveY = character.y;
            // Claimed moving but barely moved — re-issue path
            return Math.sqrt(dx * dx + dy * dy) < 15;
        } catch (e) {
            return true;
        }
    }

    function gold() {
        try {
            return (character && character.gold) || 0;
        } catch (e) {
            return 0;
        }
    }

    function minGoldReserve() {
        const cfg = buyGearCfg();
        return typeof cfg.minGold === "number" ? cfg.minGold : 50000;
    }

    function canAfford(itemName) {
        const g = gItem(itemName);
        if (!g || typeof g.g !== "number") return false;
        return gold() >= g.g + minGoldReserve();
    }

    async function travelHome() {
        const home = homeCfg();
        if (utils().log) utils().log("Dorchant → home (" + (home.to || "coords") + ")");
        if (home.to === "bank") {
            // Same path as inventory — string dest + door transport
            try {
                if (character.map !== "bank" && typeof smart_move === "function") {
                    smart_move("bank");
                }
            } catch (e) { /* ignore */ }
            return;
        }
        if (home.to) await smartTo(home.to);
        else if (typeof home.x === "number") await smartTo(home);
    }

    function muleCfg() {
        return (BOT.config && BOT.config.mule) || {};
    }

    function scoutMeet() {
        const s = scoutCfg();
        if (s.meet) return s.meet;
        if (BOT.config && BOT.config.farm && BOT.config.farm.monster) return BOT.config.farm.monster;
        return "crab";
    }

    function pickupIntervalMs() {
        const mins = muleCfg().pickupEveryMinutes;
        return (typeof mins === "number" ? mins : 3) * 60 * 1000;
    }

    function lingerMs() {
        const sec = muleCfg().lingerSeconds;
        return (typeof sec === "number" ? sec : 20) * 1000;
    }

    function needsPickupRound() {
        if (pickupRequestedAt && (now() - pickupRequestedAt) < 120000) return true;
        return (now() - lastPickupRoundAt) >= pickupIntervalMs();
    }

    function onCm(name, data) {
        const msg = typeof data === "string" ? data : (data && data.type) || "";
        if (msg !== "need_dump") return;
        if (clients().indexOf(name) === -1) return;
        pickupRequestedAt = now();
        pickupFrom = name;
        if (utils().log) utils().log("Pickup requested by " + name);
    }

    function atPickupSpot(meet) {
        if (clientsInRange() > 0) return true;
        // Must be on a combat map near the farm — bank/town never counts
        try {
            if (character.map === "bank") return false;
        } catch (e) { /* ignore */ }
        return farmNearby(meet);
    }

    /**
     * Go to farm, linger so farmers can send_item, then leave for sell/bank/home.
     */
    async function handlePickup() {
        const meet = scoutMeet();
        const arrived = atPickupSpot(meet);
        const t = now();

        // Only linger when actually at the farm / beside farmers
        if (arrived && t < lingerUntil) {
            if (t - scoutAnnounceAt > 10000) {
                scoutAnnounceAt = t;
                if (utils().log) {
                    utils().log("Dorchant collecting dumps (" + Math.ceil((lingerUntil - t) / 1000) + "s)");
                }
            }
            return true;
        }

        if (!needsPickupRound()) return false;

        // Not there yet — keep pathing (force retry if stuck)
        if (!arrived) {
            if (t - scoutAnnounceAt > 10000) {
                scoutAnnounceAt = t;
                if (utils().log) {
                    utils().log("Dorchant → " + meet + " (collect farmer loot" +
                        (pickupFrom ? " / " + pickupFrom : "") + ")");
                }
            }
            await smartTo(meet, isMoveStuck());
            return true;
        }

        // Arrived — start linger window once
        inspectNearbyClients();
        if (lingerUntil < t) {
            lingerUntil = t + lingerMs();
            lastPickupRoundAt = t;
            pickupRequestedAt = 0;
            pickupFrom = "";
            if (utils().log) utils().log("Dorchant at farm — waiting for dumps");
        }
        return true;
    }

    // Wire CM (preserve any prior handler)
    try {
        const prevCm = globalThis.on_cm;
        globalThis.on_cm = function (name, data) {
            try { onCm(name, data); } catch (e) { /* ignore */ }
            if (typeof prevCm === "function" && prevCm !== globalThis.on_cm) {
                try { prevCm(name, data); } catch (e2) { /* ignore */ }
            }
        };
    } catch (e) { /* ignore */ }

    function scoutIntervalMs() {
        const mins = scoutCfg().everyMinutes;
        return (typeof mins === "number" ? mins : 8) * 60 * 1000;
    }

    function needsScout() {
        if (scoutCfg().enabled === false) return !allClientsInspected();
        if (!allClientsInspected()) return true;
        return (now() - lastScoutAt) >= scoutIntervalMs();
    }

    function clientsInRange() {
        const list = clients();
        let n = 0;
        for (let i = 0; i < list.length; i++) {
            if (getPlayer(list[i])) n++;
        }
        return n;
    }

    function farmNearby(mtype) {
        try {
            if (typeof get_nearest_monster === "function") {
                const mon = get_nearest_monster({ type: mtype });
                if (mon && utils().distanceTo && utils().distanceTo(mon) < 800) return true;
            }
        } catch (e) { /* ignore */ }
        return false;
    }

    /**
     * Snapshot everyone: live inspect, or mark offline (keep prior gear cache).
     */
    function finalizeScoutPass() {
        const list = clients();
        for (let i = 0; i < list.length; i++) {
            const name = list[i];
            if (inspectClient(name)) continue;

            const prev = partyStatus[name];
            if (prev && prev.seen && !prev.neverSeen) {
                partyStatus[name] = {
                    gear: prev.gear || {},
                    at: prev.at || 0,
                    seen: true,
                    offline: true
                };
            } else {
                // Never successfully scanned — don't invent gaps
                partyStatus[name] = {
                    gear: {},
                    at: 0,
                    seen: true,
                    offline: true,
                    neverSeen: true
                };
            }
        }
        lastScoutAt = now();
    }

    async function handleScout() {
        // Always refresh anyone standing next to us
        inspectNearbyClients();

        if (!needsScout()) return false;
        if (isPathing()) return true;

        const meet = scoutMeet();
        const visible = clientsInRange();
        const atFarm = farmNearby(meet);

        // Always go to the farm first if nobody is in range yet
        if (visible === 0 && !atFarm) {
            if (now() - scoutAnnounceAt > 15000) {
                scoutAnnounceAt = now();
                if (utils().log) utils().log("Dorchant scout → " + meet + " (inspect party gear)");
            }
            await smartTo(typeof meet === "string" ? meet : meet);
            scoutTravelDone = true;
            return true;
        }

        // Some visible but not all — still walk to farm once
        if (visible < clients().length && !atFarm && !scoutTravelDone) {
            if (utils().log) utils().log("Dorchant scout → " + meet);
            await smartTo(meet);
            scoutTravelDone = true;
            return true;
        }

        finalizeScoutPass();
        scoutTravelDone = false; // allow next interval scout to travel again
        if (utils().log) {
            utils().log("Party gear scanned");
            gearReport();
        }
        return false;
    }

    async function buyNeededScrolls() {
        const list = scrollsToBuy();
        if (!list.length) return false;

        if (!nearScrolls()) {
            if (utils().log) utils().log("Dorchant → scrolls");
            await smartTo({ to: "scrolls" });
            return true;
        }

        for (let i = 0; i < list.length; i++) {
            const row = list[i];
            try {
                if (typeof buy === "function") {
                    buy(row.name, row.qty);
                    if (utils().log) utils().log("Bought " + row.qty + " " + row.name);
                }
            } catch (e) {
                if (utils().error) utils().error("buy scroll: " + (utils().safeError ? utils().safeError(e) : e));
            }
        }
        return true;
    }

    async function handleBuyGear() {
        const list = itemsToBuy();
        if (!list.length) return false;
        if (isPathing()) return true;

        const t = now();
        if (t - lastBuyAt < BUY_COOLDOWN_MS) return true;

        if (!canAfford(list[0])) {
            if (utils().log) utils().log("Skip buy gear — need gold (have " + gold() + ")");
            return false;
        }

        // Town vendors — main map near shops
        if (character.map === "bank" || !nearNpc(["basics", "weapons", "armors", "scrolls"])) {
            if (utils().log) utils().log("Dorchant → town (buy gear)");
            await smartTo({ to: "main" });
            return true;
        }

        const name = list[0];
        try {
            if (typeof buy === "function") {
                buy(name, 1);
                lastBuyAt = t;
                if (utils().log) utils().log("Bought " + name + " for party gap");
            }
        } catch (e) {
            if (utils().error) utils().error("buy gear " + name + ": " + (utils().safeError ? utils().safeError(e) : e));
            lastBuyAt = t;
        }
        return true;
    }

    function tryUpgradeOnce() {
        const t = now();
        if (t - lastUpgradeAt < UPGRADE_COOLDOWN_MS) return false;
        if (isUpgrading()) return false;

        const set = findCompoundSet();
        if (set) {
            const item = character.items[set.a];
            const scrollSlot = findScrollSlot(scrollName(item, true));
            if (scrollSlot < 0) return false;
            try {
                if (typeof compound === "function") {
                    compound(set.a, set.b, set.c, scrollSlot);
                    lastUpgradeAt = t;
                    if (utils().log) {
                        utils().log("Compound " + item.name + " +" + (item.level || 0));
                    }
                    return true;
                }
            } catch (e) {
                if (utils().error) utils().error("compound: " + (utils().safeError ? utils().safeError(e) : e));
            }
            return false;
        }

        const slot = findUpgradeSlot();
        if (slot < 0) return false;
        const item = character.items[slot];
        const scrollSlot = findScrollSlot(scrollName(item, false));
        if (scrollSlot < 0) return false;

        try {
            if (typeof upgrade === "function") {
                upgrade(slot, scrollSlot);
                lastUpgradeAt = t;
                if (utils().log) {
                    utils().log("Upgrade " + item.name + " +" + (item.level || 0));
                }
                return true;
            }
        } catch (e) {
            if (utils().error) utils().error("upgrade: " + (utils().safeError ? utils().safeError(e) : e));
        }
        return false;
    }

    async function handleUpgrade() {
        if (!upgradeCfg().enabled) return false;
        if (!hasUpgradeWork()) return false;

        if (isUpgrading()) return true;
        if (isPathing()) return true;

        if (scrollsToBuy().length) {
            await buyNeededScrolls();
            return true;
        }

        if (!nearUpgrade()) {
            if (utils().log) utils().log("Dorchant → upgrade");
            await smartTo({ to: "upgrade" });
            return true;
        }

        tryUpgradeOnce();
        return true;
    }

    async function handle() {
        if (typeof character === "undefined" || !character) return false;

        // 1) Collect farmer dumps (urgent CM or periodic)
        if (await handlePickup()) return true;

        // 2) Know party gear before buying/upgrading
        if (await handleScout()) return true;

        // 3) Buy missing base gear (gap only, needs gold)
        if (await handleBuyGear()) return true;

        // 4) Upgrade / compound toward gaps only
        if (await handleUpgrade()) return true;

        // 5) Idle at bank
        if (atHome()) return false;
        if (isPathing()) return true;
        await travelHome();
        return true;
    }

    BOT.logistics = {
        handle: handle,
        atHome: atHome,
        travelHome: travelHome,
        shouldHoldItem: shouldHoldItem,
        partyNeedsItem: partyNeedsItem,
        hasUpgradeWork: hasUpgradeWork,
        inspectClient: inspectClient,
        inspectNearbyClients: inspectNearbyClients,
        gaps: gaps,
        gearReport: gearReport,
        partyStatus: function () { return partyStatus; },
        usefulMaxLevel: usefulMaxLevel,
        onCm: onCm,
        _botVersion: "MER_Logistics_v8"
    };

    if (utils().log) utils().log("MER_Logistics loaded");
})();
