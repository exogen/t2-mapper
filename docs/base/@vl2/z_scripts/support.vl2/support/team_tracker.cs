// #name = Team Tracking Support
// #version = 0.0.6
// #date = July 15, 2001
// #category = Support
// #author = Paul Tousignant
// #warrior = UberGuy (FT)
// #email = uberguy@tribalwar.com
// #web = http://scripts.tribalwar.com/uberguy
// #web = http://scripts.tribes-universe.com/uberguy
// #description = Provides information about teams and the players on them.
// #status = Release
// #include = support/callback.cs
// #include = support/PJEnhancedRecording.cs

// This class defines the following:
// Fields:
//    myID              : the player's clientID
//    myTag             : the player's tribal tag. "" if none.
//    myName            : the player's own name
//    enemyTeamID       : the # of the enemy team. In gametypes with more or less
//                        than 2 teams, this is -1
//    friendlyTeamID    : the # of the player's own team
//    numTeams          : the number of teams, not including observers as a team
//    idsByName[]       : an array of player ID's indexed by name. So idsByName["Bob"]
//                        would return Bob's clientID.
//    teamName[]        : an array of team names. teamName[0] is always "Observer".
//    teamGroup[]       : an array of SimGroups containing references to the Player
//                        class instances. So to iterate over all of the observers:
//                        for(%i=0; %i < teamTracker.teamGroup[0].getCount(); %i++) {
//                          ...
//                        }
// Methods: - these are modeled directly after PJ's functions.
//            Props to him for the originals. Like his, mine accept a %detag argument
//            that will strip tag codes from passed arguments if it is sent as 1 or true.
//
//    isManagerName(%name,%detag)  : true if %name is the player's name
//    getManagerId()               : the player's clientID. Same as teamTracker.myID
//    getManagerName()             : the player's name. Same as teamTracker.myName
//    getManagerTags()             : the player's tribal tags. Same as teamTracker.myTag
//    getEnemyTeamName()           : the name of the enemy team. "" if <> 2 teams
//    getFriendlyTeamName()        : the name of the player's team
//    getClientName(%ID,%detag)    : the name of the player with clientID %ID
//    getClientID(%name,%detag)    : the clientID of the player with name %name
//    getClientTeamID(%ID,%detag)  : the teamID of the player with clientID %ID
//    getPlayerTeamId(%name,%detag): the teamID of the player with name %name
//    getClientTeamName(%ID,%detag): the name of the team of the player with clientID %ID
//    getTeamSize(%teamID,%detag)  : the number of players on a given team
//    getClientRef(%ID)            : a reference to the playerRef object for clientID %ID
//    getPlayerRef(%name)          : a reference to the playerRef object for player %name
//    getSelfRef()                 : a reference to the client's own playerRef object
//
// Callback:
//    TeamUpdated       :  passes - the team ID that changed. Called when the size of a
//                         team changes.
//    PlayerLeavingGame : passes - the client ID of the dropping player
//    MyTeamChanged     : passes - the player's new teamID
//    PlayerJoinedTeam  : passes - teamID of the affected team & the player's clientID

// Miscellaneous:

//    strippedName(%playerRep) : Returns the full name of the player with all special
//                               characters removed
//    baseName()     : Returns the player's name without team tags
//    baseTags()     : Returns the player's tribal tags, or "" if none.

// ============================================================================

function makeTracker() {

	if(!isObject(teamTracker))	{

	    new ScriptObject(teamTracker)
	    {
	        class = teamTracker;
	        myID = 0;
	        myTag = "";
	        myName = "";
			enemyTeamID = 0;
			friendlyTeamID = 0;
			numTeams = 0;
	    };
	}
}

function resetTeamTracker() {

	for (%i = 0; %i<= teamTracker.numTeams; %i++) {
		if (isObject(teamTracker.teamGroup[%i])) {
			teamTracker.teamGroup[%i].delete();
		}
	}
	teamTracker.delete();
	makeTracker();
}

function teamTracker::isManagerName(%this, %clientname, %detag) {

	if (%detag) %clientname = detag(%clientname);
	return (%this.name $= %clientname);
}

function teamTracker::getManagerId(%this) {

	return %this.myID;
}

function teamTracker::getManagerName(%this) {

	return %this.myName;
}

function teamTracker::getManagerTags(%this) {

	return %this.myTag;
}

function teamTracker::getEnemyTeamName(%this) {

	return %this.teamName[%this.enemyTeamID];
}

function teamTracker::getFriendlyTeamName(%this) {

	return %this.teamName[%this.friendlyTeamID];
}

function teamTracker::getEnemyTeam(%this) {

	return %this.enemyTeamID;
}

function teamTracker::getClientName(%this, %clientId, %detag) {

	if (%detag)	%clientId = detag(%clientId);

	if (isObject($PlayerList[%clientId])) {
		return $PlayerList[%clientId].name;
	}
	else return "";
}

function teamTracker::getClientId(%this, %name, %detag) {

	if (%detag) %name = detag(%name);

	return %this.idsByName[%name];
}

function teamTracker::getClientTeamId(%this, %clientId, %detag) {

	if (%detag) %clientId = detag(%clientId);

	%player = $PlayerList[%clientId];
	if (isObject(%player)) return %player.teamId;
	else return -1;
}

function teamTracker::getClientRef(%this, %clientId, %detag) {

	if (%detag)	%clientId = detag(%clientId);

	%ref = $PlayerList[%clientId];
	if (isObject(%ref)) return %ref;
	else return "";
}

function teamTracker::getPlayerRef(%this, %name, %detag) {

	if (%detag)	%name = detag(%name);

	%ref = $PlayerList[%this.idsByName[%playerName]];
	if (isObject(%ref)) return %ref;
	else return "";
}

function teamTracker::getSelfRef(%this) {

	return $PlayerList[%this.myID];
}

function teamTracker::getPlayerTeamId(%this, %playerName, %detag) {

	if (%detag) %playerName = detag(%playerName);

	%player = $PlayerList[%this.idsByName[%playerName]];
	if (isObject(%player)) return %player.teamId;
	else return -1;
}

function teamTracker::getClientTeamName(%this, %clientId, %detag) {

	if(%detag) %clientId = detag(%clientId);

	if (isObject($PlayerList[%clientId])) {
		return %this.teamName[$PlayerList[%clientId].teamId];
	}
	else return "";
}

function teamTracker::getTeamSize(%this, %teamID, %detag) {

	if(%detag) %teamID = detag(%teamID);

	if ((%teamID < 0) || (%teamID > %this.numTeams)) return -1;
	else return %this.teamGroup[%teamID].getCount();
}

//=== PlayerRef utilites ======================================================

function strippedName(%playerRep) {

	if (!isObject(%playerRep)) return "";

	// Lazy evaluation, cached value
	if (%playerRep.strippedName $= "") {
		%playerRep.strippedName = stripMLControlChars(%playerRep.name);
	}
	return %playerRep.strippedName;
}

function baseName(%playerRep) {

	if (!isObject(%playerRep)) return "";

	if (%playerRep.baseName $= "") {
		%p1 = strstr(%playerRep.name,"\c6");
		%p2 = strstr(%playerRep.name,"\c7");
		%p3 = strstr(%playerRep.name,"\x11");
		if(%p1 < %p2) %baseName = getSubStr(%playerRep.name,%p1+1,strstr(%playerRep.name,"\c7")-1);
		if(%p1 > %p2) %baseName = getSubStr(%playerRep.name,%p1+1,strstr(%playerRep.name,"\x11"));
		if(%baseName $= "") %baseName = %playerRep.name;
		%playerRep.baseName = stripChars(%baseName,"\cp\co\c6\c7\c8\c9");
	}
	return %playerRep.baseName;
}

function baseTags(%playerRep) {

	if (!isObject(%playerRep)) return "";

	if (%playerRep.baseTags $= "") {
		%p1 = strstr(%playerRep.name,"\c6");
		%p2 = strstr(%playerRep.name,"\c7");
		%p3 = strstr(%playerRep.name,"\x11");
		if(%p1 > %p2) %baseTag = getSubStr(%playerRep.name,%p2+1,strstr(%playerRep.name,"\c6")-1);
		if(%p1 < %p2) %baseTag = getSubStr(%playerRep.name,%p2+1,strstr(%playerRep.name,"\x11"));
		if(%p2 == %p3) %baseTag = "";
		%playerRep.baseTags = stripChars(%baseTag,"\cp\co\c6\c7\c8\c9");
	}
	return %playerRep.baseTags;
}

//=== Package Wrappers ========================================================

package teamTrackerPkg {

	function handleClientJoin(%msgType, %msgString, %clientName, %clientId, %targetId,
		%isAI, %isAdmin, %isSuperAdmin, %isSmurf, %guid) {

		parent::handleClientJoin(%msgType, %msgString, %clientName, %clientId, %targetId,
			%isAI, %isAdmin, %isSuperAdmin, %isSmurf, %guid);

		%clName = detag(%clientName);

		if(StrStr(%msgString, "Welcome to Tribes") != -1) {
			teamTracker.myID = %clientId;
			teamTracker.myName = %clName;

			if(%isSmurf) teamTracker.myTag = "";
		}

		teamTracker.idsByName[%clName] = %clientId;

		// Put player in observer group until I hear otherwise
		if (!isObject(teamTracker.teamGroup[0]))
			teamTracker.teamGroup[0] = new SimSet("TrackerTeam_0");

		// $PlayerList[%clientID] is guaranteed to be a valid object here
		teamTracker.teamGroup[0].add($PlayerList[%clientID]);
		Callback.Trigger(TeamUpdated,0);
	}

	function handleClientDrop(%msgType, %msgString, %clientName, %clientId) {

		//if (%clientId != teamTracker.myID) {}

		%clName = detag(%clientName);
		teamTracker.idsByName[%clName] = "";

		%player = $PlayerList[%clientID];
		if (%player) {
			teamTracker.teamGroup[%player.teamID].remove(%player);

			Callback.Trigger(TeamUpdated,%player.teamID);
		}
		Callback.Trigger(PlayerLeavingGame,%clientID);

		parent::handleClientDrop(%msgType, %msgString, %clientName, %clientId);
	}

	function handleClientJoinTeam(%msgType, %msgString, %clientName, %teamName,
		%clientId, %teamId) {

		if(%clientId == teamTracker.myID) {
			if(%teamId == 0) {
				teamTracker.friendlyTeamID = teamTracker.enemyTeamID = -1;
			}
			else {
				teamTracker.friendlyTeamID = %teamID;
				// Assign a valid enemy team only if there are 2 teams.
				teamTracker.enemyTeamID =
					(teamTracker.numTeams == 2) ? ((%teamID == 1) ? 2 : 1) : -1;
			}
			// event here for my team change
			Callback.Trigger(MyTeamChanged,%teamID);
		}

		%player = $PlayerList[%clientID];
		// Looks like players who start the map teamed are on team -1...
		if (isObject(%player)) {

			%oldteam  = %player.teamId;
			if (%oldTeam < 0) %oldTeam = 0;
			if (%oldteam != %teamID) {
				// Move out of old team
				%teamGrp = teamTracker.teamGroup[%oldTeam];
				if (isObject(%teamGrp)) {
					if (%teamGrp.isMember(%player)) {
						%teamGrp.remove(%player);
					}
				}

				// Add to new
				%teamGrp = teamTracker.teamGroup[%teamID];
				if (!isObject(%teamGrp)) {
					%teamGrp = teamTracker.teamGroup[%teamID] =
						new SimSet("TrackerTeam_" @ %teamID);
				}
				%teamGrp.add(%player);

				// Event here indicating team size update
				Callback.Trigger(TeamUpdated,%teamID);
				Callback.Trigger(PlayerJoinedTeam,%teamID,%clientID);
			}
		}
		parent::handleClientJoinTeam(%msgType, %msgString, %clientName, %teamName,
			%clientId, %teamId);
	}

	function handleTeamListMessage(%msgType, %msgString, %teamCount, %teamList) {

		teamTracker.numTeams = %teamCount;
		for ( %i = 0; %i < %teamCount; %i++ ) {
			%j = %i+1;
			teamTracker.teamName[%j] = detag(getRecord(%teamList, %i));
			if (!isObject(teamTracker.teamGroup[%j]))
				teamTracker.teamGroup[%j] = new SimSet("TrackerTeam_" @ %j);
		}
		teamTracker.teamName[0] = "Observer";
		if (!isObject(teamTracker.teamGroup[0]))
			teamTracker.teamGroup[0] = new SimSet("TrackerTeam_0");

		parent::handleTeamListMessage(%msgType, %msgString, %teamCount, %teamList);
	}

	function connect(%address, %password, %playerName, %playerRaceGender, %playerSkin, %playerVoice, %playerVoicePitch) {

		resetTeamTracker();
		parent::connect(%address, %password, %playerName, %playerRaceGender, %playerSkin, %playerVoice, %playerVoicePitch);
	}

	function localConnect(%playerName, %playerRaceGender, %playerSkin, %playerVoice, %playerVoicePitch) {

		resetTeamTracker();
		parent::localConnect(%playerName, %playerRaceGender, %playerSkin, %playerVoice, %playerVoicePitch);
	}

	// Demo support
	function loadDemoSettings() {

		resetTeamTracker();
		NewRecordingData.clientid = ""; // Need to clear this between recordings

		parent::loadDemoSettings();

		teamTracker.teamName[0] = "Observer";
		if (!isObject(teamTracker.teamGroup[0]))
			teamTracker.teamGroup[0] = new SimSet("TrackerTeam_0");

		%sz = PlayerListGroup.getCount();
		for (%i=0; %i < %sz; %i++) {
			%player = PlayerListGroup.getObject(%i);

			if (!isObject(teamTracker.teamGroup[%player.teamId])) {
				teamTracker.teamGroup[%player.teamId] = new SimSet("TrackerTeam_" @ %player.teamId);
				teamTracker.numTeams++;
			}

			teamTracker.idsByName[%player.name] = %player.clientId;
			echo(%player.name SPC teamTracker.idsByName[%player.name]);
			teamTracker.teamGroup[%player.teamId].add(%player);
			Callback.Trigger(TeamUpdated,%player.teamId);
			Callback.Trigger(PlayerJoinedTeam,%player.teamId,%player.clientId);
		}

		// If this demo was recorded with PJs Enhanced info, we can determine team info
		if (NewRecordingData.clientid !$= "") {

			teamTracker.extendedDemo = true;
			teamTracker.myID = NewRecordingData.clientid;
			%player = $PlayerList[teamTracker.myID];
			teamTracker.myName = %player.name;
			teamTracker.friendlyTeamID = %player.teamId;
			teamTracker.enemyTeamID =
				(teamTracker.numTeams == 2) ? ((%teamID == 1) ? 2 : 1) : -1;
			Callback.Trigger(MyTeamChanged,%player.teamId);

			if(%player.isSmurf) teamTracker.myTag = "";
			else teamTracker.myTag = baseTags(%player);
		}
		else teamTracker.extendedDemo = false;
	}

	function LoadingGui::onWake(%this) {

		teamTracker.myTag = getField(wonGetAuthInfo(), 1);
		parent::onWake(%this);
	}
};

activatePackage(teamTrackerPkg);
makeTracker();
