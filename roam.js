// TODO:
//  - Input validation.
//  - Abuse prevention and rate limiting (may require backend/caching).
//  - Custom output formatting:
//      - Different forum post templates.
//      - Custom number formatting for isk values.
//      - Allow killfeed.eveuni (not sure if worth, kill ids don't match between zkill and killfeed)
//  - Discuss with Zarquu: Integration with the new SRP system.
//  - Other roam metrics>
//      - Damage?
//      - Member participation on kills?
//      - Time?
//      - Corps/Alliances involved?
//      - Losses/Corp?
//      - Ship kill/loss count?
//      - Uni members involved?
//  - Manually add kills?
//  - Other forms of editing?
//  - Ship icons?
//  - Detect missing fleet members?
//  - Permalinks to roam reports?
//  - Additional visualisations?
//      - visual timeline?
//      - parallel tracks for different systems?
//  - Detect if browser is supported (obviously, Fetch API is not supported in IE).

window.knownTypes = {}
window.unknownTypes = []

function numeric_sort(a, b) { return a-b; }

function kill_sort(a, b)
{
    if (a.date > b.date) return 1;
    if (a.date == b.date) return 0;
    return -1;
}

function get_kill_by_id(id, killList)
{
    for (var i = 0; i < killList.length; ++i) {
        if (killList[i].killID == id) return killList[i];
    }
    return undefined;
}

function enter_names()
{
    var loader = document.getElementsByClassName("loader")[0];
    loader.style.display = "inherit";

    var elem = document.getElementsByName("names")[0];
    var nameList = elem.value.split("\n");
    window.finalNames = [];
    window.killIDs = [];
    window.unsortedKills = [];
    window.friendlies = [];
    var charNameRegex1 = /\[ ([\d\. :]+) \] ([ a-zA-Z0-9-']{3,37}) > /;
    var charNameRegex2 = /^\s*([ a-zA-Z0-9-']{3,37})\s*$/

    window.starttime = undefined;
    window.endtime = undefined;

    for(var i = 0; i < nameList.length; ++i) {
        var line = nameList[i].trim();
        var name = undefined;
        var match = undefined;
        if ((match = charNameRegex1.exec(line)) !== null) {
            name = match[2].trim();
            var date = new Date(match[1] + " GMT");
            if (window.starttime === undefined) {
                window.starttime = match[1].replace(/[\. ]/g, "").slice(0, 10);
            }
            date.setHours(date.getHours() + 1);
            window.endtime = date.toISOString().replace(/[-T]/g, "").slice(0,10);
        } else if ((match = charNameRegex2.exec(line)) !== null) {
            name = match[1].trim();
        }

        // If the player named "EVE System" ever becomes active, this script will no longer be accurate.
        if (name && name != "EVE System" && window.finalNames.indexOf(name) == -1) {
            window.finalNames.push(name);
        }
    }

    console.log("Players involved:" + window.finalNames);

    var nameQuery = "https://api.eveonline.com/eve/CharacterID.xml.aspx?names=" + window.finalNames.map(x => escape(x)).join();
    fetch(new Request(nameQuery, {method: 'GET'}))
    .then(response => {
        if (response.status != 200) throw new Error("API request failed to get list of character IDs");
        return response.text();
    })
    .then(xmltext => {
        // There really is no need to do xml processing...
        var charIdRegex = /characterID="(\d+)"/gi;
        var match;
        while ((match = charIdRegex.exec(xmltext)) !== null) {
            var id = parseInt(match[1]);
            if (id != 0) window.friendlies.push(id);
        }
        window.friendlies = window.friendlies.sort(numeric_sort);
        console.log("Got character IDs");
        request_kill_batch(window.friendlies, 0);
    })
    .catch(function(error) {
        console.error(error);
        var loader = document.getElementsByClassName("loader")[0];
        loader.style.display = "none";
    });
}

function request_kill_batch(characterIDs, start)
{
    console.log("Requesting kills for chars: " + start);

    var group = characterIDs.slice(start, start+10);
    var killQuery = "https://zkillboard.com/api/characterID/" + group.join() + "/startTime/"+window.starttime+"00/endTime/"+window.endtime+"00/no-items/";
    fetch(new Request(killQuery, {method: 'GET', mode: 'cors'}))
    .then(response => {
        if (response.status != 200) throw new Error("API request failed to get list of character IDs");
        return response.json();
    })
    .then(kills => {
        var killAddCount = 0;
        for (var i = 0; i < kills.length; ++i) {
            var kill = kills[i];
            if (window.killIDs.indexOf(kill.killID) >= 0) continue;
            kill.date = new Date(kill.killTime);
            window.killIDs.push(kill.killID);
            window.unsortedKills.push(kill);
            if (window.unknownTypes.indexOf(kill.victim.shipTypeID) == -1 && !window.knownTypes[kill.victim.shipTypeID]) {
                window.unknownTypes.push(kill.victim.shipTypeID);
            }
            killAddCount += 1;
        }
        console.log("Added " + killAddCount + " kills");
        if (start+10 < characterIDs.length) {
            request_kill_batch(characterIDs, start+10);
        } else {
            update_eve_types();
        }
    })
    .catch(function(error) {
        console.error(error);
        var loader = document.getElementsByClassName("loader")[0];
        loader.style.display = "none";
    });
}

function update_eve_types()
{
    var types = window.unknownTypes.slice(0,250).join();
    window.unknownTypes = window.unknownTypes.slice(250);
    var typesQuery = "https://api.eveonline.com/eve/TypeName.xml.aspx?ids=" + types;

    function next_request() {
        if (window.unknownTypes.length > 0) {
            update_eve_types();
        } else {
            process_kills();
        }
    }

    fetch(new Request(typesQuery, {method: 'GET'}))
    .then(response => {
        if (response.status != 200) {
            next_request();
            throw new Error("API request failed to get list of character IDs");
        }
        return response.text();
    })
    .then(xmltext => {
        // There really is no need to do xml processing...
        var typeRegex = /typeID="(\d+)"\s*typeName="([^"]+)"/gi;
        var match;
        while ((match = typeRegex.exec(xmltext)) !== null) {
            window.knownTypes[match[1]] = match[2];
        }
        next_request();
    })
    .catch(function(error) {
        console.error(error);
        var loader = document.getElementsByClassName("loader")[0];
        loader.style.display = "none";
    });

}

function process_kills()
{
    console.log("Processing kills...");

    window.workingKillSet = window.unsortedKills.sort(kill_sort);
    var table = document.getElementsByName("killdisplay")[0];
    table.innerHTML = '<div class="krh"><div class="kh">New fight?</div><div class="kh">Time</div><div class="kh">Kill/Loss</div><div class="kh">Ship</div><div class="kh">Victim</div><div class="kh">Final Blow</div><div class="kh">Location</div><div class="kh">ISK</div></div>';

    for (var i = 0; i < window.workingKillSet.length; ++i) {
        var kill = window.workingKillSet[i];
        var isFriendly = window.friendlies.indexOf(kill.victim.characterID) > -1;
        var row = document.createElement("div"); row.className = "kr-on"; table.appendChild(row);
        row.name = kill.killID;

        kill.displayRow = row;
        kill.isFriendly = isFriendly;
        kill.isIncluded = true;
        kill.isFightStart = (i == 0 || (kill.date - window.workingKillSet[i-1].date) > 5 * 60 * 1000);

        var cell = document.createElement("div"); cell.className = "kd"; row.appendChild(cell);
        cell.innerHTML = '<input type="checkbox" checked id="'+kill.killID+'">';
        kill.isFightStartCheckBox = cell.children[0];
        kill.isFightStartCheckBox.checked = kill.isFightStart;
        kill.isFightStartCheckBox.addEventListener('change', function (event) {
            var kill = get_kill_by_id(parseInt(event.target.id), window.workingKillSet);
            kill.isFightStart = event.target.checked;
            update_kill_display(kill);
        });

        kill.isFightStartCheckBox.addEventListener('mousedown', function (event) { event.stopPropagation(); });
        kill.isFightStartCheckBox.addEventListener('touchdown', function (event) { event.stopPropagation(); });

        var cell = document.createElement("div"); cell.className = "kd"; row.appendChild(cell);
        cell.innerHTML = "<a href=https://zkillboard.com/kill/"+kill.killID+"/ target=\"_blank\">"+kill.killTime+"</a>";
        kill.zkillHref = cell.children[0];

        kill.zkillHref.addEventListener('mousedown', function (event) { event.stopPropagation(); });
        kill.zkillHref.addEventListener('touchdown', function (event) { event.stopPropagation(); });

        var cell = document.createElement("div"); cell.className = "kd"; row.appendChild(cell);
        t = document.createTextNode(isFriendly ? "Loss" : "Kill");
        cell.appendChild(t);

        var cell = document.createElement("div"); cell.className = "kd"; row.appendChild(cell);
        var shipName = window.knownTypes[kill.victim.shipTypeID];
        if (shipName === undefined) shipName = "Unknown Type";
        t = document.createTextNode(shipName);
        cell.appendChild(t);

        var cell = document.createElement("div"); cell.className = "kd"; row.appendChild(cell);
        t = document.createTextNode(kill.victim.characterName);
        cell.appendChild(t);

        var cell = document.createElement("div"); cell.className = "kd"; row.appendChild(cell);
        t = document.createTextNode(kill.attackers.filter(x => x.finalBlow == 1)[0].characterName);
        cell.appendChild(t);

        var cell = document.createElement("div"); cell.className = "kd"; row.appendChild(cell);
        var systemName = window.solarSystems[kill.solarSystemID];
        if (systemName === undefined) systemName = "sysId_"+kill.solarSystemID;
        t = document.createTextNode(systemName);
        cell.appendChild(t);

        var cell = document.createElement("div"); cell.className = "kd"; row.appendChild(cell);
        t = document.createTextNode((Math.round(kill.zkb.totalValue/10000)/100) + "m");
        cell.appendChild(t);

        update_kill_display(kill);
    }

    var loader = document.getElementsByClassName("loader")[0];
    loader.style.display = "none";
}

function update_kill_display(kill)
{
    kill.isFightStartCheckBox.checked = kill.isFightStart;
    if (kill.isFightStart) {
        kill.displayRow.style.borderTop = "solid 2px #ccc";
    } else {
        kill.displayRow.style.borderTop = "0px";
    }


    if (kill.isIncluded) {
        kill.displayRow.className = "kr-on";
        kill.displayRow.style.color = kill.isFriendly ? "red" : "green";
    } else {
        kill.displayRow.className = "kr-off";
        kill.displayRow.style.color = "#aaa";
    }
}

function get_forum_post()
{
    var lines = []
    lines.push("    Roam members (" + window.finalNames.length + ") - NOTE: This section is NOT usually included in AARs.");
    window.finalNames = window.finalNames.sort();
    for (var i = 0; i < window.finalNames.length; ++i) {
        lines.push(window.finalNames[i]);
    }
    lines.push("\n    Kills and Losses");

    var iskGain = 0;
    var iskLoss = 0;
    var firstKill = true;
    for (var i = 0; i < window.workingKillSet.length; ++i) {
        var kill = window.workingKillSet[i];
        if (!kill.isIncluded) continue;

        var friendlyLine = kill.isFriendly ? "FF0000]-" : "00FF00]+";
        var shipName = window.knownTypes[kill.victim.shipTypeID];
        if (shipName === undefined) shipName = "Unknown Type";

        if (kill.isFightStart || firstKill) {
            var regions = [kill.solarSystemID];
            for (var j = i+1; j < window.workingKillSet.length; ++j) {
                var kk = window.workingKillSet[j];
                if (kk.isFightStart) break;
                if (kk.isIncluded && regions.indexOf(kk.solarSystemID) == -1) {
                    regions.push(kk.solarSystemID);
                }
            }
            var regions = regions.map(x => {
                var systemName = window.solarSystems[x];
                if (systemName === undefined) return "sysId_"+x;
                return systemName;
            })

            lines.push((firstKill ? "(" : "\n(") + kill.killTime.slice(11) + ") " + regions.join(", "));
            firstKill = false;
        }
        lines.push("[url=https://zkillboard.com/kill/"+kill.killID+"/]"+shipName+"[/url] [color=#" + friendlyLine + (Math.round(kill.zkb.totalValue/10000)/100)+ "m[/color]");

        if (!kill.isFriendly) {
            iskGain += kill.zkb.totalValue;
        } else {
            iskLoss += kill.zkb.totalValue;
        }
    }

    lines.push("\n");
    var deltaColor = iskLoss < iskGain ? "[color=#00FF00]" : "[color=#FF0000]";

    lines.push("    Stats");
    lines.push("ISK Destroyed: [color=#00FF00]" + iskGain.toLocaleString('en-US') +"[/color]");
    lines.push("ISK Lost: [color=#FF0000]" + iskLoss.toLocaleString('en-US') +"[/color]");
    lines.push("ISK Delta: " + deltaColor + (iskGain - iskLoss).toLocaleString('en-US') +"[/color]");
    lines.push("Efficiency: " + deltaColor + ((iskGain*100) / (iskGain + iskLoss)).toLocaleString('en-US') +"%[/color]");

    var elem = document.getElementsByName("output")[0];
    elem.value = lines.join("\n");
}


var mouseDown = false;
var previousRow = undefined;
var enablingRows = false;
// function kills_mouse_down('mousedown touchstart',
function kills_mouse_down(event) {
    event.preventDefault();
    var row = event.target;
    if (row.tagName == "a" || row.tagName == "input") return;

    while(row && row.className != "kr-on" && row.className != "kr-off") row = row.parentElement;
    if (row) {
        kill = get_kill_by_id(parseInt(row.name), window.workingKillSet);
        enablingRows = !kill.isIncluded;
        mouseDown = true;
        previousRow = undefined;

        kills_update_include_state(event);
    }
}

function kills_update_include_state(event) {
    // event.preventDefault();
    if(mouseDown) {
        var row = event.target;
        while(row && row.className != "kr-on" && row.className != "kr-off") row = row.parentElement;
        if (row && row != previousRow) {
            kill = get_kill_by_id(parseInt(row.name), window.workingKillSet);
            kill.isIncluded = enablingRows;
            update_kill_display(kill);
        }
    }
}

function window_mouse_up(event) {
    mouseDown = false;
};

window.onload = function()
{
    var table = document.getElementsByName("killdisplay")[0];
    console.log("loaded " + table);
    table.addEventListener('mousedown', kills_mouse_down);
    table.addEventListener('touchdown', kills_mouse_down);
    table.addEventListener('mousemove', kills_update_include_state);
    table.addEventListener('touchmove', kills_update_include_state);
    document.addEventListener('mouseup', window_mouse_up);
    document.addEventListener('touchend', window_mouse_up);
}
