/**
 * CORE_Party.js
 * Leader invites; follower only accepts (no request spam by default).
 *
 * Prorg was looping "request expired" because send_party_request ran
 * even while already grouped / while Dorg's invite was enough.
 */
(function () {
    "use strict";

    globalThis.BOT = globalThis.BOT || {};

    const INVITE_COOLDOWN_MS = 30000;
    const REQUEST_COOLDOWN_MS = 60000;

    let lastInviteAt = 0;
    let lastRequestAt = 0;
    let lastLogAt = 0;

    function utils() {
        return BOT.utils || {};
    }

    function partyCfg() {
        return (BOT.config && BOT.config.party) || {};
    }

    function leaderName() {
        return partyCfg().leader || "";
    }

    function memberNames() {
        return partyCfg().members || [];
    }

    /** Follower party requests — OFF by default (Dorg invite is enough). */
    function allowRequestFallback() {
        return partyCfg().requestFallback === true;
    }

    function uniquePush(arr, name) {
        if (!name) return;
        if (arr.indexOf(name) === -1) arr.push(name);
    }

    function partyList() {
        const names = [];

        try {
            if (parent && parent.party && typeof parent.party === "object") {
                for (const key in parent.party) {
                    if (!Object.prototype.hasOwnProperty.call(parent.party, key)) continue;
                    const entry = parent.party[key];
                    if (entry && typeof entry === "object" && entry.name) uniquePush(names, entry.name);
                    else uniquePush(names, key);
                }
            }
        } catch (e) { /* ignore */ }

        try {
            if (typeof get_party === "function") {
                const p = get_party();
                if (Array.isArray(p)) {
                    for (let i = 0; i < p.length; i++) {
                        uniquePush(names, typeof p[i] === "string" ? p[i] : (p[i] && p[i].name));
                    }
                } else if (p && typeof p === "object") {
                    for (const key in p) {
                        const entry = p[key];
                        if (entry && entry.name) uniquePush(names, entry.name);
                        else uniquePush(names, key);
                    }
                }
            }
        } catch (e) { /* ignore */ }

        try {
            if (parent && parent.party_list) {
                if (Array.isArray(parent.party_list)) {
                    for (let i = 0; i < parent.party_list.length; i++) uniquePush(names, parent.party_list[i]);
                } else if (typeof parent.party_list === "object") {
                    for (const key in parent.party_list) uniquePush(names, key);
                }
            }
        } catch (e) { /* ignore */ }

        try {
            if (character && character.name) uniquePush(names, character.name);
        } catch (e) { /* ignore */ }

        return names;
    }

    function amInAParty() {
        try {
            if (character && character.party) return true;
        } catch (e) { /* ignore */ }

        // Fallback detections — stop follower request spam
        try {
            const list = partyList();
            if (list.length >= 2 && list.indexOf(character.name) !== -1) return true;
        } catch (e) { /* ignore */ }

        try {
            if (parent && parent.party && parent.party[character.name]) return true;
        } catch (e) { /* ignore */ }

        return false;
    }

    function playerInOurParty(name) {
        if (!name) return false;
        if (partyList().indexOf(name) !== -1) return true;

        try {
            if (typeof get_player === "function") {
                const p = get_player(name);
                if (p && p.party) {
                    if (character.party && p.party === character.party) return true;
                    if (p.party === character.name) return true;
                }
            }
        } catch (e) { /* ignore */ }

        return false;
    }

    function isLeader() {
        const leader = leaderName();
        return !!(leader && character && character.name === leader);
    }

    function isGrouped() {
        if (!character) return false;
        if (!amInAParty()) return false;

        const leader = leaderName();

        if (!isLeader()) {
            // Follower: in party with configured leader (or any party if leader unset)
            if (character.party) return !leader || character.party === leader;
            // character.party missing but party list shows leader
            return !leader || partyList().indexOf(leader) !== -1;
        }

        // Leader
        const members = memberNames();
        if (!members.length) return true;

        for (let i = 0; i < members.length; i++) {
            const name = members[i];
            if (playerInOurParty(name)) continue;

            let visible = null;
            try {
                if (typeof get_player === "function") visible = get_player(name);
            } catch (e) { /* ignore */ }

            if (!visible) continue; // offline — don't treat as ungrouped
            return false;
        }
        return true;
    }

    function sendInvite(name) {
        try {
            if (typeof send_party_invite === "function") send_party_invite(name);
            else if (typeof party_invite === "function") party_invite(name);
        } catch (e) {
            if (utils().error) utils().error("invite: " + (utils().safeError ? utils().safeError(e) : e));
        }
    }

    function logStatus(force) {
        const now = Date.now();
        if (!force && now - lastLogAt < 20000) return;
        lastLogAt = now;
        if (!utils().log) return;
        utils().log(
            "Party | me=" + character.name +
            " party=" + (character.party || "none") +
            " inParty=" + amInAParty() +
            " grouped=" + isGrouped() +
            " list=" + JSON.stringify(partyList())
        );
    }

    function handleFollower() {
        // Already in a party → NEVER request / poll-accept
        if (amInAParty()) return;

        const leader = leaderName();
        if (!leader) return;

        // Only accept via event handler ideally; light poll accept is OK, no requests
        try {
            if (typeof accept_party_invite === "function") accept_party_invite(leader);
        } catch (e) { /* ignore */ }

        if (!allowRequestFallback()) return;

        const now = Date.now();
        if (now - lastRequestAt < REQUEST_COOLDOWN_MS) return;
        lastRequestAt = now;

        try {
            if (typeof send_party_request === "function") {
                send_party_request(leader);
                if (utils().log) utils().log("Party request (fallback) -> " + leader);
            }
        } catch (e) { /* ignore */ }
    }

    function handleLeader() {
        if (isGrouped()) return;

        const now = Date.now();
        if (now - lastInviteAt < INVITE_COOLDOWN_MS) return;

        const members = memberNames();
        let invited = false;

        for (let i = 0; i < members.length; i++) {
            const name = members[i];
            if (!name || name === character.name) continue;
            if (playerInOurParty(name)) continue;

            // If we're already in a party, only invite visible players
            if (amInAParty()) {
                let visible = null;
                try {
                    if (typeof get_player === "function") visible = get_player(name);
                } catch (e) { /* ignore */ }
                if (!visible) continue;
            }

            sendInvite(name);
            invited = true;
            if (utils().log) utils().log("Party invite -> " + name);
        }

        if (invited) lastInviteAt = now;
    }

    function handle() {
        if (!character) return false;

        try {
            logStatus(false);

            if (isLeader()) handleLeader();
            else handleFollower();
        } catch (e) {
            if (utils().error) utils().error("CORE_Party: " + (utils().safeError ? utils().safeError(e) : e));
        }

        return false;
    }

    globalThis.on_party_invite = function (name) {
        try {
            if (!name || isLeader()) return;
            if (leaderName() && name !== leaderName()) return;
            if (amInAParty()) return;
            if (typeof accept_party_invite === "function") accept_party_invite(name);
            if (utils().log) utils().log("Accepted invite from " + name);
        } catch (e) { /* ignore */ }
    };

    globalThis.on_party_request = function (name) {
        try {
            if (!name || !isLeader()) return;
            if (memberNames().indexOf(name) === -1) return;
            if (typeof accept_party_request === "function") accept_party_request(name);
            if (utils().log) utils().log("Accepted request from " + name);
        } catch (e) { /* ignore */ }
    };

    BOT.party = {
        handle: handle,
        isLeader: isLeader,
        isGrouped: isGrouped,
        partyList: partyList,
        inPartyWith: playerInOurParty,
        amInAParty: amInAParty,
        logStatus: function () { logStatus(true); }
    };

    if (utils().log) utils().log("CORE_Party loaded (follower requests OFF by default)");
})();
