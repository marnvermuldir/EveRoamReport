// TODO:
//  - Proper UI for list of kills.
//  - Super fast select/deselect kill from final output:
//      - Click and drag over kills?
//      - Start/End separators?
//  - Redo layout
//      - Working concept: 3 resizable columns; A. Input names & start/end date; B. Filter kills; C. Output).
//  - Correct list of ships (and updates when CCP releases new ones).
//  - Input validation.
//  - Progress/Spinner/Loading UI.
//  - Abuse prevention and rate limiting (may require backend/caching).
//  - Get system/region names.
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

function numeric_sort(a, b) { return a-b; }

function kill_sort(a, b)
{
    var d1 = new Date(a.killTime);
    var d2 = new Date(b.killTime);
    if (d1 > d2) return 1;
    if (d1 == d2) return 0;
    return -1;
}

function enter_names()
{
    var elem = document.getElementsByName("names")[0];
    var nameList = elem.value.split("\n");
    var finalNames = [];
    window.killIDs = [];
    window.unsortedKills = [];
    window.friendlies = [];
    var charNameRegex1 = /\[ ([\d\. :]+) \] ([ a-zA-Z0-9-']{3,37}) > /g;
    var charNameRegex2 = /^\s*([ a-zA-Z0-9-']{3,37})\s*$/g

    window.starttime = undefined;
    window.endtime = undefined;

    for(var i = 0; i < nameList.length; ++i) {
        var line = nameList[i].trim();
        var name = undefined;
        var match = undefined;
        if ((match = charNameRegex1.exec(line)) !== null) {
            name = match[2].trim();
            var date = new Date("" + match[1] + " GMT");
            if (window.starttime === undefined) {
                window.starttime = match[1].replace(/[\. ]/g, "").slice(0, 10);
            }
            date.setHours(date.getHours() + 1);
            window.endtime = date.toISOString().replace(/[-T]/g, "").slice(0,10);
        } else if ((match = charNameRegex2.exec(line)) !== null) {
            name = match[1].trim();
        }

        if (name && finalNames.indexOf(name) == -1) {
            finalNames.push(name);
        }
    }

    var nameQuery = "https://api.eveonline.com/eve/CharacterID.xml.aspx?names=" + finalNames.map(x => escape(x)).join();
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
            window.killIDs.push(kill.killID);
            window.unsortedKills.push(kill);
            killAddCount += 1;
        }
        console.log("Added " + killAddCount + " kills");
        if (start+10 < characterIDs.length) {
            request_kill_batch(characterIDs, start+10);
        } else {
            process_kills();
        }
    })
    .catch(function(error) {
        console.error(error);
    });
}


function process_kills()
{
    console.log("Processing kills...");

    window.wokringKills = window.unsortedKills.sort(kill_sort);
    var table = document.getElementsByName("killdisplay")[0];
    table.innerHTML = "<tr><th>Include?</th><th>Time</th><th>Kill/Loss</th><th>Ship</th><th>Victim</th><th>Final Blow</th><th>Location</th><th>ISK</th></tr>";
    for (var i = 0; i < window.wokringKills.length; ++i) {
        var kill = window.wokringKills[i];
        var isFriendly = window.friendlies.indexOf(kill.victim.characterID) > -1;
        kill.isFriendly = isFriendly;
        var row = table.insertRow();
        row.style.color = isFriendly ? "red" : "green";

        var cell = row.insertCell();
        cell.innerHTML = '<input type="checkbox" checked id="'+kill.killID+'" name="includecheck" value="'+kill.killID+'">';
        // cell.children[0].checked = true;

        cell = row.insertCell();
        cell.innerHTML = "<a href=https://zkillboard.com/kill/"+kill.killID+"/>"+kill.killTime+"</a>";


        cell = row.insertCell();
        t = document.createTextNode(isFriendly ? "Loss" : "Kill");
        cell.appendChild(t);

        cell = row.insertCell();
        var shipID = "" + kill.victim.shipTypeID;
        var shipName = window.shipNames[shipID];
        if (shipName === undefined) shipName = "Unknown";
        t = document.createTextNode(shipName);
        cell.appendChild(t);

        cell = row.insertCell();
        t = document.createTextNode(kill.victim.characterName);
        cell.appendChild(t);

        cell = row.insertCell();
        t = document.createTextNode(kill.attackers.filter(x => x.finalBlow == 1)[0].characterName);
        cell.appendChild(t);

        cell = row.insertCell();
        t = document.createTextNode(kill.solarSystemID);
        cell.appendChild(t);

        cell = row.insertCell();
        t = document.createTextNode((Math.round(kill.zkb.totalValue/10000)/100) + "m");
        cell.appendChild(t);
    }
}

function get_forum_post()
{
    var lines = [];
    var checkboxes = document.getElementsByName("includecheck");
    var iskGain = 0;
    var iskLoss = 0;
    for (var i = 0; i < checkboxes.length; ++i) {
        var box = checkboxes[i];
        var id = box.value;
        if (!box.checked) continue;

        var kill = undefined
        for (var i = 0; i < window.wokringKills.length; ++i) {
            if (window.wokringKills[i].killID == id) {
                kill = window.wokringKills[i];
                break;
            }
        }

        if (kill === undefined) continue;
        var friendlyLine = kill.isFriendly ? "FF0000]-" : "00FF00]+";
        lines.push("[url]https://zkillboard.com/kill/"+kill.killID+"/[/url] [color=#" + friendlyLine + (Math.round(kill.zkb.totalValue/10000)/100)+ "m[/color]");

        if (!kill.isFriendly) {
            iskGain += kill.zkb.totalValue;
        } else {
            iskLoss += kill.zkb.totalValue;
        }
    }

    lines.push("\n");
    var deltaColor = iskLoss < iskGain ? "[color=#00FF00]" : "[color=#FF0000]";

    lines.push("ISK Destroyed: [color=#00FF00]" + iskGain.toLocaleString('en-US') +"[/color]");
    lines.push("ISK Lost: [color=#FF0000]" + iskLoss.toLocaleString('en-US') +"[/color]");
    lines.push("ISK Delta: " + deltaColor + (iskGain - iskLoss).toLocaleString('en-US') +"[/color]");
    lines.push("Efficiency: " + deltaColor + ((iskGain*100) / (iskGain + iskLoss)).toLocaleString('en-US') +"%[/color]");

    var elem = document.getElementsByName("output")[0];
    elem.value = lines.join("\n");
}

