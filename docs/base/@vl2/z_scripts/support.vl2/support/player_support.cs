// #name = Player support
// #version = 0.0.7
// #date = June 8, 2001
// #author = Jason "VeKToR" Gill
// #warrior = VeKToR++
// #email = vektor@linux.ca
// #web = http://scripts.tribalwar.com/vektor
// #description = Provides a convenient api for getting info about players.
// #status = release

// ----------------------------------------
// Documentation
// ----------------------------------------
// This script provides a convenient interface for T2 scripters to look up
// information about players. You could do most of the stuff in this script
// without it, but it's a lot more convenient this way :)
// This script is little more than a nice looking interface to data the
// client already stores.
//
// First up are the MOST convenient functions. These allow you to get info
// about a player, given you know at least one other piece of info about
// them, such as their Name, ClientID, TargetID, GUID, Index number.
//
// The functions are relatively self-explainatory.
// They're all named in a consistent fashion, like:
// PlayerList.get___By___
// The blanks are filled in with the name of the information you want, and
// the piece of information you want to use to look it up, respectively.
// For example, PlayerList.GetNameByID would look up a player's name based on
// his/her clientID. All these functions are named in this format.
// Note - a return value of $PLAYER_ERROR indicates an error of some kind
// occured. You should probably test for this value unless you're certain your
// function call will result in valid information ;)
// Additionally, a couple of these functions have special return values.
//
// First off, the getNetInfoBy* functions will return Ping AND Packet loss
// seperated by a space in the same function call. I did this to prevent
// additional unnecessary functions (heck, there's probably too many as it
// stands). An example of a return value from a NetInfo function is:
// "237 1", where 237 is the player's ping, and 1 is his packet loss.
// These can be seperated using the getword function.
//
// Second, the getFlagsBy* functions will return a BITFIELD representing the
// 4 player flags (smurf, admin, superadmin, ai).
// An easy way to extract info from these flags is accomplished using several
// global "flags" this script defines:
// $PLAYER_SMURF 		- is the player using an alias?
// $PLAYER_ADMIN		- is the player an admin?
// $PLAYER_SUPERADMIN	- is the player a superadmin?
// $PLAYER_AI			- is the player a bot?
//
// To check any of these flags, merely AND it with the return value - if the
// result is nonzero, the flag is set, otherwise, it's not. Here's an example:
//
// %flags = PlayerList.getFlagsByID(4100);
// if (%flags & $PLAYER_SMURF)
//		echo("This player is a smurf!");
//
// NEW:
// In order for player scores/pings/packetloss, etc. to be updated, you must
// first request this information from the server - otherwise, you'll just get
// the same info as the last time it was updated.
// Be careful about how fast you refresh it, doing it too often can smack down
// anyone on a modem running your script. Anyway, the command to update the
// player info is:
// commandToServer('getScores');
// 
// Without further ado, here's the list of convenience functions:
//
// These functions get player info, if you know his/her detagged name.
// PlayerList.getIDByName(%value);
// PlayerList.getTargetIDByName(%value);
// PlayerList.getGUIDByName(%value);
// PlayerList.getTeamByName(%value);
// PlayerList.getScoreByName(%value);
// PlayerList.getNetInfoByName(%value);
// PlayerList.getFlagsByName(%value);
//
// These functions get player info, if you know his/her ClientID
// PlayerList.getNameByID(%value);
// PlayerList.getTargetIDByID(%value);
// PlayerList.getGUIDByID(%value);
// PlayerList.getTeamByID(%value);
// PlayerList.getScoreByID(%value);
// PlayerList.getNetInfoByID(%value);
// PlayerList.getFlagsByID(%value);
//
// These functions get player info, if you know his/her TargetD
// PlayerList.getNameByTargetID(%value);
// PlayerList.getIDByTargetID(%value);
// PlayerList.getGUIDByTargetID(%value);
// PlayerList.getTeamByTargetID(%value);
// PlayerList.getScoreByTargetID(%value);
// PlayerList.getNetInfoByTargetID(%value);
// PlayerList.getFlagsByTargetID(%value);
//
// These functions get player info, if you know his/her Global User ID (GUID)
// PlayerList.getNameByGUID(%value);
// PlayerList.getTargetIDByGUID(%value);
// PlayerList.getIDByGUID(%value);
// PlayerList.getTeamByGUID(%value);
// PlayerList.getScoreByGUID(%value);
// PlayerList.getNetInfoByGUID(%value);
// PlayerList.getFlagsByGUID(%value);
//
// These functions get player info, if you know his/her player Index
// (Index is an arbitrary number from 0 to (MAX_PLAYERS - 1).
// Note, index is NOT a reliable method if looking up players, as it can
// change as players are added and removed. It's primary use is when you
// want to cycle through all players in the game sequentially.
// PlayerList.getNameByIndex(%value);
// PlayerList.getIDByIndex(%value);
// PlayerList.getGUIDByIndex(%value);
// PlayerList.getTeamByIndex(%value);
// PlayerList.getScoreByIndex(%value);
// PlayerList.getNetInfoByIndex(%value);
// PlayerList.getFlagsByIndex(%value);
//
// Now, this script also provides an easy way to get information about the
// client actually using the machine right now (ie. the person running your
// script - similar to getManagerID in Tribes1).
// I made 2 quick information lookups about the local player. If you need
// more, well - that's why you have all those fancy functions up there ;)
//
// PlayerList.getMyID();	- returns the ClientID of the local player
// PlayerList.getMyName();	- returns the detagged name of the local player.
//
// Finally, these are ever so slightly more advanced - it's not quite as
// braindead-straightforward as the above ;)
// These return the object numbers of "PlayerRep" objects, which the game
// default scripts use to track player information. You can use and store
// these to directly access player information later, if you want (do NOT
// use the index number to store player info long-term, as it can change
// as people join and drop.)
//
// Anyway. here's the overall definition of the PlayerRep object, as taken
// from messages.cs
//   new ScriptObject() 
//   {
//      className = "PlayerRep";
//      name = detag(%clientName);
//      guid = %guid;
//      clientId = %clientId;
//      targetId = %targetId;
//      teamId = 0;
//      score = 0;
//      ping = 0;
//      packetLoss = 0;
//      chatMuted = false;
//      canListen = false;
//      voiceEnabled = false;
//      isListening = false;
//      isBot = %isAI;
//      isAdmin = %isAdmin;
//      isSuperAdmin = %isSuperAdmin;
//      isSmurf = %isSmurf;
//   };
//
// So now that you know what members each PlayerRep object contains, let's look
// at how we can get them.
// Like the PlayerList.getBy functions, you need at least one piece of info
// about the player to retrieve a PlayerRep object.
// Each of these functions returns a playerRep object that can be used as you
// see fit. Doing it like this is more efficient if you want to look up multiple
// pieces of into about a single player - this way, you only actually SEARCH for
// the player once, then get multiple pieces of info, instead of searching for the
// player once for each piece of info.
// Anyway, here's the functions:
//
// PlayerList.findByName(%value);
// PlayerList.findByID(%value);
// PlayerList.findByTargetID(%value);
// PlayerList.findByIndex(%value);
// PlayerList.findByGUID(%value);
//
// So you could do something like this:
// %p = PlayerList.findByIndex(3);
// echo("Name: ", %p.name, " ID: ", %p.clientID, " Team: ", %p.teamID);
//
// Also, there's one more function you need to know about.
// PlayerList.findByTeam(%value);
// This will search the entire player list for players on a given team
// number (the one you specify), and return a space-delimited list of
// playerRef objects.
// For example, PlayerList.findByTeam(1); might return:
// "8576 8581 8593 8602 8611"
// you can then use getword to seperate them and retrieve info, as follows:
//
// %list = PlayerList.findByTeam(1);
// %p = getword(%list, 2);
// echo("Name: ", %p.name, " ID: ", %p.clientID, " Team: ", %p.teamID);
//
// That is all ;)

// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
//                             SCRIPT BEGINS HERE
// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-

// ----------------------------------------
// Information retrieval.
// The lazy man's functions ;)
// These functions take a certain input
// like name, GUID, clientID, targetID, etc
// and return a specific piece of information
// about the requested player
// The following pieces of data can be used
// to look up info:
// Name, ID, TargetID, Index, GUID
// You can return the following  info:
// Name, ID, TargetID, GUID, Team, Score
// Netinfo (ping,pl), flags (ai,smurf,admin,sad)
// ----------------------------------------

// ----------------------------------------
// Local Player
// ----------------------------------------
function PlayerList::getMyID(%this) {
	return %this.myID;
}

function PlayerList::getMyName(%this) {
	return %this.myName;
}

// ----------------------------------------
// Get by name
// ----------------------------------------
function PlayerList::getScoreByName(%this, %value) {
	return %this.getInfo(%value, "Score", "Name");
}

function PlayerList::getIDByName(%this, %value) {
	return %this.getInfo(%value, "ClientID", "Name");
}

function PlayerList::getTargetIDByName(%this, %value) {
	return %this.getInfo(%value, "TargetID", "Name");
}

function PlayerList::getGUIDByName(%this, %value) {
	return %this.getInfo(%value, "guid", "Name");
}

function PlayerList::getTeamByName(%this, %value) {
	return %this.getInfo(%value, "teamID", "Name");
}

function PlayerList::getNetInfoByName(%this, %value) {
	return %this.getNetInfo(%value, "Name");
}

function PlayerList::getFlagsByName(%this, %value) {
	return %this.getFlags(%value, "Name");
}

// ----------------------------------------
// Get by ID
// ----------------------------------------
function PlayerList::getScoreByID(%this, %value) {
	return %this.getInfo(%value, "Score", "ID");
}

function PlayerList::getNameByID(%this, %value) {
	return %this.getInfo(%value, "Name", "ID");
}

function PlayerList::getTargetIDByID(%this, %value) {
	return %this.getInfo(%value, "TargetID", "ID");
}

function PlayerList::getGUIDByID(%this, %value) {
	return %this.getInfo(%value, "guid", "ID");
}

function PlayerList::getTeamByID(%this, %value) {
	return %this.getInfo(%value, "teamID", "ID");
}

function PlayerList::getNetInfoByID(%this, %value) {
	return %this.getNetInfo(%value, "ID");
}

function PlayerList::getFlagsByID(%this, %value) {
	return %this.getFlags(%value, "ID");
}

// ----------------------------------------
// Get by TargetID
// ----------------------------------------
function PlayerList::getScoreByTargetID(%this, %value) {
	return %this.getInfo(%value, "Score", "TargetID");
}

function PlayerList::getIDByTargetID(%this, %value) {
	return %this.getInfo(%value, "ClientID", "TargetID");
}

function PlayerList::getNameByTargetID(%this, %value) {
	return %this.getInfo(%value, "Name", "TargetID");
}

function PlayerList::getGUIDByTargetID(%this, %value) {
	return %this.getInfo(%value, "guid", "TargetID");
}

function PlayerList::getTeamByTargetID(%this, %value) {
	return %this.getInfo(%value, "teamID", "TargetID");
}

function PlayerList::getNetInfoByTargetID(%this, %value) {
	return %this.getNetInfo(%value, "TargetID");
}

function PlayerList::getFlagsByTargetID(%this, %value) {
	return %this.getFlags(%value, "TargetID");
}

// ----------------------------------------
// Get by Index. 
// ----------------------------------------
function PlayerList::getTargetIDByIndex(%this, %value) {
	return %this.getInfo(%value, "TargetID", "Index");
}

function PlayerList::getScoreByIndex(%this, %value) {
	return %this.getInfo(%value, "Score", "Index");
}

function PlayerList::getIDByIndex(%this, %value) {
	return %this.getInfo(%value, "ClientID", "Index");
}

function PlayerList::getNameByIndex(%this, %value) {
	return %this.getInfo(%value, "Name", "Index");
}

function PlayerList::getGUIDByIndex(%this, %value) {
	return %this.getInfo(%value, "guid", "Index");
}

function PlayerList::getTeamByIndex(%this, %value) {
	return %this.getInfo(%value, "teamID", "Index");
}

function PlayerList::getNetInfoByIndex(%this, %value) {
	return %this.getNetInfo(%value, "Index");
}

function PlayerList::getFlagsByIndex(%this, %value) {
	return %this.getFlags(%value, "Index");
}

// ----------------------------------------
// Get by GUID
// ----------------------------------------
function PlayerList::getScoreByGUID(%this, %value) {
	return %this.getInfo(%value, "Score", "GUID");
}

function PlayerList::getIDByGUID(%this, %value) {
	return %this.getInfo(%value, "ClientID", "GUID");
}

function PlayerList::getNameByGUID(%this, %value) {
	return %this.getInfo(%value, "Name", "GUID");
}

function PlayerList::getTargetIDByGUID(%this, %value) {
	return %this.getInfo(%value, "TargetID", "GUID");
}

function PlayerList::getTeamByGUID(%this, %value) {
	return %this.getInfo(%value, "teamID", "GUID");
}

function PlayerList::getNetInfoByGUID(%this, %value) {
	return %this.getNetInfo(%value, "GUID");
}

function PlayerList::getFlagsByGUID(%this, %value) {
	return %this.getFlags(%value, "GUID");
}

// ----------------------------------------
// The fancy functions that drive all the
// above. Woohoo!
// These three functions reduce the amount
// of repeated code by a _LOT_
// I am win ;)
// ----------------------------------------
function PlayerList::getInfo(%this, %value, %returntype, %searchtype) {
	%object = eval("PlayerList.findBy" @ %searchtype @ "(%value);");
	if (%object == 0)
		return $PLAYER_ERROR;
	else {
		eval("%retr = " @ %object @ "." @ %returntype @ ";");
		return %retr;
	}
}

function PlayerList::getNetInfo(%this, %value, %searchtype) {
	%object = eval("PlayerList.findBy" @ %searchtype @ "(%value);");
	if (%object == 0)
		return $PLAYER_ERROR;
	else
		return %object.ping @ " " @ %object.packetloss;
}

function PlayerList::getFlags(%this, %value, %searchtype) {
	%object = eval("PlayerList.findBy" @ %searchtype @ "(%value);");
	if (%object == 0)
		return $PLAYER_ERROR;
	else
		return %this.createFlags(%object.isSmurf, %object.isAdmin, %object.isSuperAdmin, %object.isBot);
}

// ----------------------------------------
// Search functions. These functions look
// through stored player data, and locate
// a PlayerRep object by a certain criteria
// such as GUID (Global User ID), name,
// client ID, and target ID.
// These are some of the most useful
// functions in this file, because you can
// find a PlayerRep object, then request
// whatever information you want from it
// by using the member selection operator
// (ie. the period ;)
// %object.name
// %object.ping
// etc. 
// Note - some of these (such as findByTeam)
// can return multiple object numbers. These
// will be returned in a space-delimited
// string, 
// ----------------------------------------

// Find a playerRep object by GUID
function PlayerList::findByGUID(%this, %guid) {
	if (!isObject(PlayerListGroup))
		return $PLAYER_ERROR;

	%clients = PlayerListGroup.getCount();
	for (%i = 0; %i < %clients; %i++) {
		%objnum = PlayerListGroup.getObject(%i);
		if (%objnum.guid == %guid)
			return %objnum;
	}
	return $PLAYER_ERROR;
}

// Find a playerRep object by TargetID
function PlayerList::findByTargetID(%this, %targ) {
	if (!isObject(PlayerListGroup))
		return $PLAYER_ERROR;

	%clients = PlayerListGroup.getCount();
	for (%i = 0; %i < %clients; %i++) {
		%objnum = PlayerListGroup.getObject(%i);
		if (%objnum.targetID == %targ)
			return %objnum;
	}
	return $PLAYER_ERROR;
}

// Find a playerRep object by detagged playerName
function PlayerList::findByName(%this, %name) {
	if (!isObject(PlayerListGroup))
		return $PLAYER_ERROR;

	%clients = PlayerListGroup.getCount();
	for (%i = 0; %i < %clients; %i++) {
		%objnum = PlayerListGroup.getObject(%i);
		if (%objnum.name $= %name)
			return %objnum;
	}
	return $PLAYER_ERROR;
}

// Find a playerRep object by clientID
function PlayerList::findByID(%this, %id) {
	if (isObject($PlayerList[%id]))
		return $PlayerList[%id];
	else
		return $PLAYER_ERROR;
}

// Find by 'index'. IE, %index of 0 will get the first player in the list
// index of 1 gets the second, etc.
function PlayerList::findByIndex(%this, %index) {
	if (!isObject(PlayerListGroup))
		return $PLAYER_ERROR;

	if ((%index < PlayerListGroup.getCount()) && (%index >= 0))
		return PlayerListGroup.getObject(%index);
	else
		return $PLAYER_ERROR;
}

// Find by team# - almost guaranteed to return more than one client
function PlayerList::findByTeam(%this, %team) {
	if (!isObject(PlayerListGroup))
		return $PLAYER_ERROR;

	%clients = PlayerListGroup.getCount();
	for (%i = 0; %i < %clients; %i++) {
		%objnum = PlayerListGroup.getObject(%i);
		if (%objnum.teamID == %team) %teamstring = %teamstring @ %objnum @ " ";
	}
	if (%teamstring $= "")
		return $PLAYER_ERROR;
	else
		return %teamstring;
}

// ----------------------------------------
// Internal script nonsense ;)
// ----------------------------------------

if(!isObject(PlayerList))
{
    new ScriptObject(PlayerList)
    {
        class = PlayerList;
        activated = false;
		initialized = false;
    };
}

function PlayerList::init(%this) {
	if (!%this.initialized) {
		// ----------------------------------------
		// GENERAL INITIALIZATION
		// ----------------------------------------
		%this.initialized = true;
		addMessageCallback('MsgClientJoin', PlayerList_HandleJoin);				

		activatePackage(Player_Support);

		// Flags! Woohoo!
		$PLAYER_SMURF		= 1;
		$PLAYER_ADMIN		= 2;
		$PLAYER_SUPERADMIN	= 4;
		$PLAYER_AI			= 8;
		
		// Error return value. Almost guaranteed never to match a legit return value.
		$PLAYER_ERROR		= "\x10error\x10";

		// ----------------------------------------
		// GUI OBJECTS
		// ----------------------------------------
	}
}

// These are just part of my standard script format.
// Since there's really no active parts to this script
// (ie. all the functions just return values), they don't
// do much right now, but they're here in case I ever decide
// to implement them ;)
function PlayerList::activate(%this) {
	if (!%this.activated) {
		%this.activated = true;
	}
}

function PlayerList::deactivate(%this) {
	if (%this.activated) {
		%this.activated = false;
	}
}

// debug functions! w00t w00t!
//function listAllPlayers() {
//	%i = 0;
//	%p = PlayerList.findByIndex(%i);
//	while (%p !$= $PLAYER_ERROR) {
//		echo(	"Name: ", %p.name, "(", %p.clientID, ") Team: ", %p.teamID, " Targ: ", %p.targetID, 
//				" Net: ", %p.ping, "|", %p.packetloss, " Flags: ", PlayerList.createFlags(%p.isSmurf, %p.isAdmin, %p.isSuperAdmin, %p.isBot),
//				" Score: ", %p.score, " GUID: ", %p.guid);

//		%i++;
//		%p = PlayerList.findByIndex(%i);
//	}
//}

// This lil' doohicky combines a couple vars to make player flags
function PlayerList::createFlags(%this, %smurf, %admin, %SAD, %smurf) {
	return ((%smurf?($PLAYER_SMURF):0) | (%AI?($PLAYER_AI):0) | (%Admin?($PLAYER_ADMIN):0) | (%SAD?($PLAYER_SUPERADMIN):0));
}

function PlayerList_HandleJoin(%msgtype, %message, %name, %id) {
	// set the values of a few "special" variables if this is the player's client.
    // Got the idea for this one from Wizard's ObserverHUD.
    if (strstr(%message, "Welcome to Tribes2") != -1)
    {
        PlayerList.myID = %id;
		PlayerList.myName = detag(%name);
    }	
}

package Player_Support {
	function DisconnectedCleanup() {
		PlayerList.myID = "";
		PlayerList.myName = "";

		parent::DisconnectedCleanup();
	}
};

PlayerList.init();
PlayerList.activate();
