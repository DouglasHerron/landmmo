/**
 * CORE_Party.js
 * Leader invite / follower accept party management.
 * Attaches to: BOT.party
 *
 * Adventure Land party signals:
 * - character.party  → leader name when grouped, falsy when solo
 * - parent.party     → { Name: {...}, ... }
 * - parent.party_list → array of names (not always present/reliable)
 */
(function () {
    "use strict";

    globalThis.BOT = globalThis.BOT || {};

    const INVITE_COOLDOWN_MS = 8000;
    const REQUEST_COOLDOWN_MS = 10000;

    let lastInviteAt = 0;
    let lastRequestAt = 0;
    let lastStatusLogAt = 0;

    function utils() {
        return BOT.utils || {};
    }

    function partyCfg() {
        return (BOT.config && BOT.config.party) || {};
    }

    function partyList() {
        const names = [];

        // Preferred: parent.party object
        try {
            if (parent && parent.party && typeof parent.party === "object") {
                for (const name in parent.party) {
                    if (Object.prototype.hasOwnProperty.call(parent.party, name)) {
                        names.push(name);
                    }
                }
                if (names.length) return names;
            }
        } catch (e) { /* ignore */ }

        // get_party() helper when available
        try {
            if (typeof get_party === "function") {
                const p = get_party();
                if (Array.isArray(p) && p.length) return p.slice();
                if (p && typeof p === "object") {
                    const keys = Object.keys(p);
                    if (keys.length) return keys;
                }
            }
        } catch (e) { /* ignore */ }

        // parent.party_list array
        try {
            if (parent && Array.isArray(parent.party_list) && parent.party_list.length) {
                return parent.party_list.slice();
            }
        } catch (e) { /* ignore */ }

        // Minimal fallback from character.party (leader name)
        try {
            if (character && character.party) {
                const out = [character.name];
                if (character.party !== character.name) out.unshift(character.party);
                return out;
            }
        } catch (e) { /* ignore */ }

        return [];
    }

    function inPartyWith(name) {
        if (!name) return false;
        return partyList().indexOf(name) !== -1;
    }

    function isLeader() {
        const cfg = partyCfg();
        const leader = cfg.leader;
        return !!(leader && character && character.name === leader);
    }

    /**
     * True when already correctly grouped — must stop invite spam.
     */
    function isGrouped() {
        if (!character) return false;

        const cfg = partyCfg();
        const leader = cfg.leader;

        // character.party is the authoritative "am I in a party?" flag
        if (!character.party) return false;

        if (!isLeader()) {
            // Follower: must be in the configured leader's party
            return character.party === leader;
        }

        // Leader: character.party should be own name
        if (character.party !== character.name) return false;

        const members = cfg.members || [];
        if (!members.length) return true;

        const list = partyList();
        for (let i = 0; i < members.length; i++) {
            if (list.indexOf(members[i]) === -1) return false;
        }
        return true;
    }

    function invite(name) {
        try {
            if (typeof send_party_invite === "function") {
                send_party_invite(name);
                return;
            }
            if (typeof party_invite === "function") {
                party_invite(name);
            }
        } catch (e) {
            if (utils().error) utils().error("invite failed: " + (utils().safeError ? utils().safeError(e) : e));
        }
    }

    function inviteMembers() {
        if (isGrouped()) return;

        const cfg = partyCfg();
        const members = cfg.members || [];
        const now = (utils().now && utils().now()) || Date.now();
        if (now - lastInviteAt < INVITE_COOLDOWN_MS) return;
        lastInviteAt = now;

        for (let i = 0; i < members.length; i++) {
            const name = members[i];
            if (!name || name === character.name) continue;
            if (inPartyWith(name)) continue;

            invite(name);
            if (utils().log) utils().log("Party invite -> " + name);
        }
    }

    function acceptFromLeader() {
        const cfg = partyCfg();
        const leader = cfg.leader;
        if (!leader || leader === character.name) return;
        if (character.party === leader) return; // already good

        try {
            if (typeof accept_party_invite === "function") accept_party_invite(leader);
        } catch (e) { /* ignore */ }

        try {
            if (typeof accept_party_request === "function") accept_party_request(leader);
        } catch (e) { /* ignore */ }
    }

    function requestLeaderFallback() {
        if (isGrouped()) return;

        const cfg = partyCfg();
        const leader = cfg.leader;
        if (!leader || leader === character.name) return;
        if (character.party) return; // already in some party

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
        if (!isLeader()) return;
        const cfg = partyCfg();
        const members = cfg.members || [];

        for (let i = 0; i < members.length; i++) {
            const name = members[i];
            if (!name || name === character.name) continue;
            if (inPartyWith(name)) continue;
            try {
                if (typeof accept_party_request === "function") accept_party_request(name);
            } catch (e) { /* ignore */ }
        }
    }

    function maybeLogStatus() {
        const now = Date.now();
        if (now - lastStatusLogAt < 30000) return;
        lastStatusLogAt = now;
        if (!utils().log) return;
        utils().log(
            "Party: grouped=" + isGrouped() +
            " character.party=" + (character.party || "none") +
            " list=" + JSON.stringify(partyList())
        );
    }

    function handle() {
        if (!character) return false;

        try {
            maybeLogStatus();

            if (isGrouped()) {
                return false; // done — no invites/requests
            }

            if (isLeader()) {
                acceptIncomingRequestsAsLeader();
                inviteMembers();
            } else {
                acceptFromLeader();
                requestLeaderFallback();
            }
        } catch (e) {
            if (utils().error) utils().error("CORE_Party: " + (utils().safeError ? utils().safeError(e) : e));
        }

        return false;
    }

    // Event handlers (more reliable than polling alone)
    const cfgLeader = function () {
        return (partyCfg().leader) || "";
    };
    const cfgMembers = function () {
        return partyCfg().members || [];
    };

    globalThis.on_party_invite = function (name) {
        try {
            if (!name) return;
            if (isLeader()) return;
            if (name !== cfgLeader()) return;
            if (character.party) return;
            if (typeof accept_party_invite === "function") accept_party_invite(name);
            if (utils().log) utils().log("Accepted party invite from " + name);
        } catch (e) { /* ignore */ }
    };

    globalThis.on_party_request = function (name) {
        try {
            if (!name) return;
            if (!isLeader()) return;
            if (cfgMembers().indexOf(name) === -1) return;
            if (typeof accept_party_request === "function") accept_party_request(name);
            if (utils().log) utils().log("Accepted party request from " + name);
        } catch (e) { /* ignore */ }
    };

    BOT.party = {
        handle: handle,
        isLeader: isLeader,
        isGrouped: isGrouped,
        partyList: partyList,
        inPartyWith: inPartyWith
    };

    if (utils().log) utils().log("CORE_Party loaded");
})();
