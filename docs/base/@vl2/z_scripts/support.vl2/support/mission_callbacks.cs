// #name = Mission Callbacks
// #version = 1.0.1
// #date = September 6, 2001
// #author = Daniel Neilsen
// #warrior = Wizard_TPG
// #email = wizardsworld@bigpond.com
// #web = http://mods.tribalwar.com/wizard/
// #description = Adds some basic mission callbacks
// #status = release
// #include = support/callback.cs
// #include = support/player_support.cs
// ---------------------------------------------------------------------------
//
//	Usage Notes and Examples:
//
// 	Callbacks included in this support script:
//
//	onMatchStart			-	Match Start
//	onMissionEnd			-	Mission End
//	onClearDebrief			-	Debrief screen is cleared
//	onGameOver				-	Map ended for any reason (vote, etc.) //UberGuy
//	onMissionDropInfo		-	Mission Data is recieved
//	onSupportTimerUpdate	-	This occurs every 20 seconds when the timer is updated
//	onClientDrop			-	Client dropped.  Includes variables %clientname & %clientid
//	onUserClientDrop		-	The user client dropped.  Includes variables %clientname & %clientid
//	onClientJoin			-	Client joined.  Includes variables %clientname & %clientid
//	onUserClientJoin		-	The users client has joined a game.  Includes variables %clientname & %clientid
//
//
//
//	Useful Functions in this support script:
//
//	MissionCallback.getMissionName();			-	Returns mission name
//	MissionCallback.getMissionType();			-	Returns mission type (ie. CTF, etc)
//	MissionCallback.getServerName();			-	Returns server name
//	MissionCallback.getServerAddress();			-	Returns server address
//	MissionCallback.getServerMod();				-	Returns server mod
//	MissionCallback.getServerMod();				-	Returns server mod name (ie, base, bwadmin, tac)
//	MissionCallback.getServerType();			-	Returns server type (ie. linux, etc)
//
//
//
//---------------------------------------------------------------------------
//

if(!isObject(MissionCallback))
{
    new ScriptObject(MissionCallback)
    {
        class = MissionCallback;
    };
}

function handleMissionCallbackMissionStart (%msgType, %msgString)
{
	if(strstr(%msgString, "Match started!") == -1)
		return;
	callback.trigger(onMatchStart);
}
addMessageCallback( 'MsgMissionStart', handleMissionCallbackMissionStart );

function handleMissionCallbackMissionEnd (%msgType, %msgString, %seconds)
{
	if(%seconds)
		return;
	callback.trigger(onMissionEnd);
}
addMessageCallback( 'MsgMissionEnd', handleMissionCallbackMissionEnd );

// UberGuy 10/03/2002
function handleMissionCallbackGameOver (%msgType, %msgString, %seconds)
{
	callback.trigger(onGameOver);
}
addMessageCallback( 'MsgGameOver', handleMissionCallbackGameOver );

function handleMissionCallbackClearDebrief(%msgType, %msgString)
{
	callback.trigger(onClearDebrief);
}
addMessageCallback( 'MsgClearDebrief',handleMissionCallbackClearDebrief );

function handleMissionCallbackMissionInfo(%msgType, %msgString, %missionname, %missiontype, %servername)
{
	MissionCallback.MissionName = %missionname;
	MissionCallback.MissionType = %missiontype;
	MissionCallback.ServerName = %servername;
	MissionCallback.ServerAddress = getRecord( $ServerInfo, 1 );
	MissionCallback.ServerMod = getRecord( $ServerInfo, 2 );
	MissionCallback.ServerType = getRecord( $ServerInfo, 3 );
	callback.trigger(onMissionDropInfo);
}
addMessageCallback( 'MsgMissionDropInfo', handleMissionCallbackMissionInfo );

function handleMissionCallbackTimer(%msgType, %msgString, %timelimit, %curTimeLeftMS)
{
	callback.trigger(onSupportTimerUpdate);
}
addMessageCallback( 'MsgSystemClock', handleMissionCallbackTimer );

function handleMissionCallbackClientDrop (%msgType, %msgString, %clientname, %clientid)
{
	callback.trigger(onClientDrop, %clientname, %clientid);
}
addMessageCallback( 'MsgClientDrop', handleMissionCallbackClientDrop );

function handleMissionCallbackClientJoined (%msgType, %msgString, %clientName, %clientid)
{
    if (strstr(%msgString, "Welcome to Tribes2") == -1)
		callback.trigger(onClientjoin, %clientname, %clientid);
	else
		callback.trigger(onUserClientJoin, %clientname, %clientid);
}
addMessageCallback( 'MsgClientJoin', handleMissionCallbackClientJoined );


package mission_callbacks
{
	function DisconnectedCleanup()
	{
		%name = PlayerList.getMyName();
		%id = PlayerList.getMyID();
		callback.trigger(onUserClientDrop, %name, %id);
		parent::DisconnectedCleanup();
	}
};
activatepackage(mission_callbacks);

//---------------------------------------------------------------------------
// Server Data

function MissionCallback::getMissionName(%this)
{
	return %this.MissionName;
}

function MissionCallback::getMissionType(%this)
{
	return %this.MissionType;
}

function MissionCallback::getServerName(%this)
{
	return %this.ServerName;
}

function MissionCallback::getServerAddress(%this)
{
	return %this.ServerAddress;
}

function MissionCallback::getServerMod(%this)
{
	return %this.ServerMod;
}

function MissionCallback::getServerType(%this)
{
	return %this.ServerType;
}




