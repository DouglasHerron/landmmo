/**
 * CORE_Party.js
 * Leader invite / follower accept party management.
 * Attaches to: BOT.party
 */
(function () {
    "use strict";

    globalThis.BOT = globalThis.BOT || {};

    const INVITE_COOLDOWN_MS = 4000;
    const REQUEST_COOLDOWN_MS = 6000;

    let lastInviteAt = 0;
    let lastRequestAt = 0;

    function utils() {
        return BOT.utils || {};
    }

    function partyCfg() {
        return (BOT.config && BOT.config.party) || {};
    }

    function partyList() {
        try {
            if (parent && Array.isArray(parent.party_list)) return parent.party_list.slice();
        } catch (e) {
            // ignore
        }
        return [];
    }

    function inPartyWith(name) {
        if (!name) return false;
        const list = partyList();
        return list.indexOf(name) !== -1;
    }

    function isLeader() {
        const cfg = partyCfg();
        const leader = cfg.leader;
        return !!(leader && typeof character !== "undefined" && character.name === leader);
    }

    function isGrouped() {
        const cfg = partyCfg();
        const members = cfg.members || [];
        const list = partyList();

        if (!list.length) return false;

        // Leader: ensure configured members are present
        if (isLeader()) {
            for (let i = 0; i < members.length; i++) {
                if (list.indexOf(members[i]) === -1) return false;
            }
            return true;
        }

        // Follower: must be with exact configured leader
        const leader = cfg.leader;
        return !!(leader && list.indexOf(leader) !== -1);
    }

    function inviteMembers() {
        const cfg = partyCfg();
        const members = cfg.members || [];
        const now = (utils().now && utils().now()) || Date.now();

        if (now - lastInviteAt < INVITE_COOLDOWN_MS) return;
        lastInviteAt = now;

        for (let i = 0; i < members.length; i++) {
            const name = members[i];
            if (!name || name === character.name) continue;
            if (inPartyWith(name)) continue;

            try {
                if (typeof party_invite === "function") {
                    party_invite(name);
                    if (utils().log) utils().log("Party invite -> " + name);
                }
            } catch (e) {
                if (utils().error) utils().error("party_invite failed: " + (utils().safeError ? utils().safeError(e) : e));
            }
        }
    }

    function acceptFromLeader() {
        const cfg = partyCfg();
        const leader = cfg.leader;
        if (!leader || leader === character.name) return;

        // Only trust the exact configured leader
        try {
            if (typeof accept_party_invite === "function") {
                accept_party_invite(leader);
            }
        } catch (e) {
            // invite may not exist; ignore
        }

        try {
            if (typeof accept_party_request === "function") {
                accept_party_request(leader);
            }
        } catch (e) {
            // ignore
        }
    }

    function requestLeaderFallback() {
        const cfg = partyCfg();
        const leader = cfg.leader;
        if (!leader || leader === character.name) return;
        if (inPartyWith(leader)) return;

        const now = (utils().now && utils().now()) || Date.now();
        if (now - lastRequestAt < REQUEST_COOLDOWN_MS) return;
        lastRequestAt = now;

        try {
            if (typeof send_party_request === "function") {
                send_party_request(leader);
                if (utils().log) utils().log("Party request -> " + leader);
            }
        } catch (e) {
            if (utils().error) utils().error("send_party_request failed: " + (utils().safeError ? utils().safeError(e) : e));
        }
    }

    function acceptIncomingRequestsAsLeader() {
        const cfg = partyCfg();
        const members = cfg.members || [];

        for (let i = 0; i < members.length; i++) {
            const name = members[i];
            if (!name || name === character.name) continue;
            if (inPartyWith(name)) continue;

            try {
                if (typeof accept_party_request === "function") {
                    accept_party_request(name);
                }
            } catch (e) {
                // ignore
            }
        }
    }

    /**
     * Party management tick.
     * Returns true if still trying to form the party (caller may continue other work).
     */
    function handle() {
        if (typeof character === "undefined" || !character) return false;

        try {
            if (isLeader()) {
                acceptIncomingRequestsAsLeader();
                if (!isGrouped()) inviteMembers();
            } else {
                acceptFromLeader();
                if (!isGrouped()) requestLeaderFallback();
            }
        } catch (e) {
            if (utils().error) utils().error("CORE_Party: " + (utils().safeError ? utils().safeError(e) : e));
        }

        return false;
    }

    BOT.party = {
        handle: handle,
        isLeader: isLeader,
        isGrouped: isGrouped,
        partyList: partyList,
        inPartyWith: inPartyWith
    };

    if (utils().log) utils().log("CORE_Party loaded");
})();
