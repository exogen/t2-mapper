// #name = Stat Support
// #version = 0.0.8
// #date = September 17, 2001
// #author = Daniel Neilsen
// #warrior = Wizard_TPG
// #email = wizardsworld@bigpond.com
// #web = http://mods.tribalwar.com/wizard/
// #description = Adds player and team stat logging support
// #status = release
// #include = support/callback.cs
// #include = support/player_support.cs
// #include = support/mission_callbacks.cs
// ---------------------------------------------------------------------------
//
//	Usage Notes and Examples:
//
// 	Callbacks included in this support script:
//
//	onStatsDelete				-	Stats have just been deleted
//	onSupportClearDebrief		-	Previous mission stats are wiped directly after this
//	onSupportUserClientDrop		-	The user client dropped (this is just before stats are deleted)
//	onPlayerDeathUpdate			-	A player was killed.  includes variables %victimId, %killerid, %vTeam and %kTeam
//	onTeamScoreUpdate			-	Team Score Altered.
//	onFlagGrab					- 	When a flag is taken.  Includes variables for %clientid and %flagteam
//	onFlagDrop					- 	When a flag is dropped.  Includes variables for %clientid and %flagteam
//	onFlagCap					- 	When a flag is capped.  Includes variables for %clientid and %flagteam
//	onFlagReturn				- 	When a flag is returned.  Includes variables for %clientid and %flagteam
//	onFFGrab					- 	When a FlipFlop is Grabbed.  Includes variables for %clientid
//	onHuntFlagChange			-	When number of hunters flag carried changes.  Includes variables for %clientid and %flags carried
//	onTACVehicleKill			-	When a TAC2 Vehicle is destroyed.  Includes variables for killer %clientid
//
//
//	Useful Functions in this support script:
//
//	StatSupport.getClientName(%client);						-	Returns client name, even if they have dropped
//	StatSupport.getClientScore(%client);					-	Returns client name, even post mission end
//	StatSupport.getClientDeaths(%client);					-	Returns client death count
//	StatSupport.getClientKills(%client);					-	Returns client kill count
//	StatSupport.getClientTeamKills(%client);				-	Returns client TK count
//	StatSupport.getClientHeadShot(%client);					-	Returns client headshot count
//	StatSupport.getClientDeathByType(%client, %type);		-	Returns client death count for damagetype
//	StatSupport.getClientKillByType(%client, %type);		-	Returns client kill count for damagetype
//	StatSupport.getClientDeathByClient(%client, %kclient);	-	Returns client death count from enemy client
//	StatSupport.getClientKillByClient(%client, %vclient);	-	Returns client kill count on enemy client
//	StatSupport.getClientGrabs(%client);					-	Returns client flag grabs
//	StatSupport.getClientDrops(%client);					-	Returns client flag drops
//	StatSupport.getClientCaps(%client);						-	Returns client flag caps
//	StatSupport.getClientReturns(%client);					-	Returns client flag returns
//	StatSupport.getClientFFGrabs(%client);					-	Returns client flag FF Grabs
//	StatSupport.getClientFlagsCarried(%client);				-	Returns client hunters flags carried
//	StatSupport.getClientTACFriendlyVehiclesKilled(%client)	-	Returns client TAC2 Friendly vehicle kills
//	StatSupport.getClientTACEnemyVehiclesKilled(%client)	-	Returns client TAC2 Enemy vehicle kills
//	StatSupport.getTeamScore(%team);						-	Returns team score
//	StatSupport.getTeamDeaths(%team);						-	Returns team death count
//	StatSupport.getTeamKills(%team);						-	Returns team kill count
//	StatSupport.getTeamTeamKills(%team);					-	Returns team TK count
//	StatSupport.getTeamDeathByType(%team, %type);			-	Returns team death count for damagetype
//	StatSupport.getTeamKillByType(%team, %type);			-	Returns team kill count for damagetype
//	StatSupport.getTeamGrabs(%team);						-	Returns team flag grabs
//	StatSupport.getTeamDrops(%team);						-	Returns team flag drops
//	StatSupport.getTeamCaps(%team);							-	Returns team flag caps
//	StatSupport.getTeamReturns(%team);						-	Returns team flag returns
//	StatSupport.getTeamFFGrabs(%team);						-	Returns team flag FF Grabs
//	StatSupport.getTeamTACFriendlyVehiclesKilled(%team)		-	Returns team TAC2 Friendly vehicle kills
//	StatSupport.getTeamTACEnemyVehiclesKilled(%team)		-	Returns team TAC2 Enemy vehicle kills
//
//
//	NOTE:  This script will work fine for all mods but the damagetypes will be as per
//			the damagetypes for that particular mod.
//
//
//
//	OTHER INFORMATION:
//
//		This script will remember a players statistics even if they drop from a
//		server and reconnect.  This means that should a player play for 10 minutes
//		and have 8 kills, then reconnect (in the same mission) and get another
//		1 kill, his kills displayed will be 9 kills.
//
//		Should the player drop from the mission, his statistics are still available
//		until the end of that mission, whether he is actualyl on the server or not.
//
//		Another important thing to note is that the players names, scores, etc will
//		not be wiped at the mission end but will remain and be wiped with all the
//		other statistics allowing your script to output this data.
//
//
//---------------------------------------------------------------------------
//
//			 				MAIN SYSTEM CODE
//
//---------------------------------------------------------------------------

//---------------------------------------------------------------------------
//	Create Stat Support Container Object

if(!isObject(StatSupport))
{
    new ScriptObject(StatSupport)
    {
        class = StatSupport;

		new ScriptObject(StatServerData)
		{
			class = StatServerData;
		};
		new ScriptObject(StatMissionData)
		{
			class = StatMissionData;
		};
    };
}

//---------------------------------------------------------------------------
//Start and End mission triggers

function handleStatSupportClearDebrief(%msgType, %msgString)
{
	callback.trigger(onSupportClearDebrief);

	//Clear All Stats
	StatMissionData.delete();
	if(!isObject(StatMissionData))
	{
		StatSupport.StatMissionData = new ScriptObject(StatMissionData)
		{
			class = StatMissionData;
		};
	}

	callback.trigger(onStatsDelete);
	exec("support/stat_support.cs");
}
addMessageCallback( 'MsgClearDebrief',handleStatSupportClearDebrief );


//---------------------------------------------------------------------------
//Client Drop/Join Code

function handleStatSupportClientDrop (%clientname, %clientid)
{
	//clean up stats on user drop
	callback.trigger(onSupportUserClientDrop);

	StatMissionData.delete();
	StatServerData.delete();
	StatSupport.StatMissionData = new ScriptObject(StatMissionData)
	{
		class = StatMissionData;
	};
	StatSupport.StatServerData = new ScriptObject(StatServerData)
	{
		class = StatServerData;
	};
	exec("support/stat_support.cs");
}
callback.add(onUserClientDrop, handleStatSupportClientDrop);


function handleStatSupportClientJoined (%clientName, %clientid)
{
	//backup existing dropped client data
	if(StatSupport.ClientName[%clientid])
	{
		StatSupport.CurrentTempID++;
		%tempid = StatSupport.CurrentTempID;
		StatMissionData.CopyClientStats(%clientid, %tempid);
	}

	//Add back in past data
	%cName = detag(%clientName);
	for(%oldid = 0; %oldid < 8000; %oldid++)
	{
		if(StatMissionData.ClientName[%oldid] $= %cName)
		{
			%foundid = %oldid;
			%oldid = 10000;
		}
	}
	if(%foundid)
	{
		StatMissionData.CopyClientStats(%foundid, %clientid);
		StatMissionData.ClearClientStats(%foundid);
	}
}
callback.add(onClientJoin, handleStatSupportClientJoined);


//---------------------------------------------------------------------------
//	Player Stats Alteration Functions

function StatMissionData::ClearClientStats(%this, %client)
{
	%this.ClientScore[%client] = "";
	%this.ClientName[%client] = "";
	%this.ClientDeath[%client] = "";
	%this.ClientKill[%client] = "";
	%this.ClientTeamKill[%client] = "";
	%this.ClientHeadShot[%client] = "";
	%this.ClientFlagGrab[%client] = "";
	%this.ClientFlagDrop[%client] = "";
	%this.ClientFlagCap[%client] = "";
	%this.ClientFlagReturn[%client] = "";
	%this.ClientFFGrab[%client] = "";
	%this.ClientHuntFlags[%client] = "";
	%this.ClientTACFriendVehicleKill[%client] = "";
	%this.ClientTACEnemyVehicleKill[%client] = "";
	for(%damageType = 0; %damageType<100; %damageType++)
	{
		%this.ClientDeathBy[%client, %damageType] = "";
		%this.ClientKillBy[%client, %damageType] = "";
	}
	for(%otherid = 0; %otherid < 8000; %otherid++)
	{
		if(%this.ClientName[%otherid] !$= "")
		{
			%this.ClientDeathByKiller[%client, %otherid] = "";
			%this.ClientKillByVictim[%client, %otherid] = "";
		}
	}
	return;
}

function StatMissionData::CopyClientStats(%this, %foundid, %clientid)
{
	//function swaps stats from foundid to clientid
	StatMissionData.ClientName[%clientid] = StatMissionData.ClientName[%foundid];
	StatMissionData.ClientDeath[%clientid] = StatMissionData.ClientDeath[%foundid];
	StatMissionData.ClientKill[%clientid] = StatMissionData.ClientKill[%foundid];
	StatMissionData.ClientTeamKill[%clientid] = StatMissionData.ClientTeamKill[%foundid];
	StatMissionData.ClientHeadShot[%clientid] = StatMissionData.ClientHeadShot[%foundid];
	StatMissionData.ClientFlagGrab[%clientid] = StatMissionData.ClientFlagGrab[%foundid];
	StatMissionData.ClientFlagDrop[%clientid] = StatMissionData.ClientFlagDrop[%foundid];
	StatMissionData.ClientFlagCap[%clientid] = StatMissionData.ClientFlagCap[%foundid];
	StatMissionData.ClientFlagReturn[%clientid] = StatMissionData.ClientFlagReturn[%foundid];
	StatMissionData.ClientFFGrab[%clientid] = StatMissionData.ClientFFGrab[%foundid];
	StatMissionData.ClientHuntFlags[%clientid] = StatMissionData.ClientHuntFlags[%foundid];
	%this.ClientTACFriendVehicleKill[%client] = %this.ClientTACFriendVehicleKill[%foundid];
	%this.ClientTACEnemyVehicleKill[%client] = %this.ClientTACEnemyVehicleKill[%foundid];

	for(%damageType = 0; %damageType<100; %damageType++)
	{
		StatMissionData.ClientDeathBy[%clientid, %damageType] = StatMissionData.ClientDeathBy[%foundid, %damageType];
		StatMissionData.ClientKillBy[%clientid, %damageType] = StatMissionData.ClientKillBy[%foundid, %damageType];
	}
	for(%otherid = 0; %otherid < 8000; %otherid++)
	{
		if(StatMissionData.ClientName[%otherid] !$= "")
		{
			StatMissionData.ClientDeathByKiller[%clientid, %otherid] = StatMissionData.ClientDeathByKiller[%foundid, %kId];
			StatMissionData.ClientKillByVictim[%clientid, %otherid] = StatMissionData.ClientKillByVictim[%foundid, %otherid];
		}
	}
}



//---------------------------------------------------------------------------
//
//			 				SCORE AND KILLS CODE
//
//---------------------------------------------------------------------------


//---------------------------------------------------------------------------
//Get client kills/deaths

function StatMissionData::KillInfo (%this, %victimname, %killername, %damageType)
{
	if(%victimname $= "")
		return;
	%vName = detag(%victimname);
	%vId = PlayerList.getIDByName(%vName);
	%vTeam = PlayerList.getTeamByName(%vName);

	if(%killername !$= "")
	{
		%kName = detag(%killername);
		%kId = PlayerList.getIDByName(%kName);
		%kTeam = PlayerList.getTeamByName(%kName);
	}
	else
	{
		%kId = 0;
		%kTeam = 0;
	}

	//calc specific player death stats.
	%this.ClientDeath[%vID]++;
	%this.ClientDeathBy[%vID, %damageType]++;
	%this.ClientDeathByKiller[%vID, %kId]++;
	%this.ClientLastDeathBy[%vID] = %damageType;
	%this.ClientLastKiller[%vID] = %kId;

	//calc team death stats
	%this.TeamDeath[%vTeam]++;
	%this.TeamDeathBy[%vTeam, %damageType]++;

	//calc team kill stats
	%this.TeamKill[%kTeam]++;
	%this.TeamKillBy[%kTeam, %damageType]++;

	if(%kID != 0)
	{
		//calc specific player kill stats
		%this.ClientKill[%kID]++;
		%this.ClientKillBy[%kID, %damageType]++;
		%this.ClientKillByVictim[%kID, %vId]++;
		%this.ClientLastKillBy[%kID] = %damageType;
		%this.ClientLastVictim[%kID] = %vId;
	}

	// Check for Team Kill
	if(%vTeam == %kTeam)
	{
		%this.ClientTeamKill[%kID]++;
		%this.TeamTeamKill[%kTeam]++;
	}
	callback.trigger(onPlayerDeathUpdate, %vID, %kId, vTeam, %kTeam);
}

function handleStatMissionDataExplosionKillInfo (%msgType, %msgString, %victimname, %victimGender, %victimPoss, %killerName, %killerGender, %killerPoss, %damageType)
{
	StatMissionData.KillInfo(%victimname, %killerName, %damageType);
}

function handleStatMissionDataSuicideKillInfo (%msgType, %msgString, %victimname, %victimGender, %victimPoss, %killerName, %killerGender, %killerPoss, %damageType)
{
	StatMissionData.KillInfo(%victimname, %killerName, %damageType);
}

function handleStatMissionDataVehicleSpawnKillInfo (%msgType, %msgString, %victimname, %victimGender, %victimPoss, %killerName, %killerGender, %killerPoss, %damageType)
{
	StatMissionData.KillInfo(%victimname, %killerName, %damageType);
}

function handleStatMissionDataVehicleKillInfo (%msgType, %msgString, %victimname, %victimGender, %victimPoss, %killerName, %killerGender, %killerPoss, %damageType)
{
	StatMissionData.KillInfo(%victimname, %killerName, %damageType);
}

function handleStatMissionDataTurretSelfKillInfo (%msgType, %msgString, %victimname, %victimGender, %victimPoss, %killerName, %killerGender, %killerPoss, %damageType)
{
	StatMissionData.KillInfo(%victimname, %killerName, %damageType);
}

function handleStatMissionDataCTurretKillInfo (%msgType, %msgString, %victimname, %victimGender, %victimPoss, %killerName, %killerGender, %killerPoss, %damageType)
{
	StatMissionData.KillInfo(%victimname, %killerName, %damageType);
}

function handleStatMissionDataTurretKillInfo (%msgType, %msgString, %victimname, %victimGender, %victimPoss, %killerName, %killerGender, %killerPoss, %damageType)
{
	StatMissionData.KillInfo(%victimname, %killerName, %damageType);
}

function handleStatMissionDataSelfKillInfo (%msgType, %msgString, %victimname, %victimGender, %victimPoss, %killerName, %killerGender, %killerPoss, %damageType)
{
	StatMissionData.KillInfo(%victimname, %killerName, %damageType);
}

function handleStatMissionDataOOBKillInfo (%msgType, %msgString, %victimname, %victimGender, %victimPoss, %killerName, %killerGender, %killerPoss, %damageType)
{
	StatMissionData.KillInfo(%victimname, %killerName, %damageType);
}

function handleStatMissionDataCampKillInfo (%msgType, %msgString, %victimname, %victimGender, %victimPoss, %killerName, %killerGender, %killerPoss, %damageType)
{
	StatMissionData.KillInfo(%victimname, %killerName, %damageType);
}

function handleStatMissionDataTeamKillInfo (%msgType, %msgString, %victimname, %victimGender, %victimPoss, %killerName, %killerGender, %killerPoss, %damageType)
{
	StatMissionData.KillInfo(%victimname, %killerName, %damageType);
}

function handleStatMissionDataLavaKillInfo (%msgType, %msgString, %victimname, %victimGender, %victimPoss, %killerName, %killerGender, %killerPoss, %damageType)
{
	StatMissionData.KillInfo(%victimname, %killerName, %damageType);
}

function handleStatMissionDataLightningKillInfo (%msgType, %msgString, %victimname, %victimGender, %victimPoss, %killerName, %killerGender, %killerPoss, %damageType)
{
	StatMissionData.KillInfo(%victimname, %killerName, %damageType);
}

function handleStatMissionDataHeadshotKillInfo (%msgType, %msgString, %victimname, %victimGender, %victimPoss, %killerName, %killerGender, %killerPoss, %damageType)
{
	%kName = detag(%killername);
	%kId = PlayerList.getIDByName(%kName);
	%kTeam = PlayerList.getTeamByName(%kName);
	StatMissionData.ClientHeadShot[%kId]++;
	StatMissionData.KillInfo(%victimname, %killerName, %damageType);
}

function handleStatMissionDataLegitKillInfo (%msgType, %msgString, %victimname, %victimGender, %victimPoss, %killerName, %killerGender, %killerPoss, %damageType)
{
	StatMissionData.KillInfo(%victimname, %killerName, %damageType);
}

addMessageCallback( 'msgExplosionKill', handleStatMissionDataExplosionKillInfo );
addMessageCallback( 'msgSuicide', handleStatMissionDataSuicideKillInfo );
addMessageCallback( 'msgVehicleSpawnKill', handleStatMissionDataVehicleSpawnKillInfo );
addMessageCallback( 'msgVehicleKill', handleStatMissionDataVehicleKillInfo );
addMessageCallback( 'msgTurretSelfKill', handleStatMissionDataTurretSelfKillInfo );
addMessageCallback( 'msgCTurretKill', handleStatMissionDataCTurretKillInfo );
addMessageCallback( 'msgTurretKill', handleStatMissionDataTurretKillInfo );
addMessageCallback( 'msgSelfKill', handleStatMissionDataSelfKillInfo );
addMessageCallback( 'msgOOBKill', handleStatMissionDataOOBKillInfo );
addMessageCallback( 'msgCampKill', handleStatMissionDataCampKillInfo );
addMessageCallback( 'msgTeamKill', handleStatMissionDataTeamKillInfo );
addMessageCallback( 'msgLavaKill', handleStatMissionDataLavaKillInfo );
addMessageCallback( 'msgLightningKill', handleStatMissionDataLightningKillInfo );
addMessageCallback( 'MsgHeadshotKill', handleStatMissionDataHeadshotKillInfo );
addMessageCallback( 'MsgLegitKill', handleStatMissionDataLegitKillInfo );



//---------------------------------------------------------------------------
//Get client score data

function StatMissionData::PlayerScoreUpdate(%this)
{
	%i = 0;
	%p = PlayerList.findByIndex(%i);
	while (%p !$= $PLAYER_ERROR)
	{
		if(%p.score != 0 || %this.ClientScore[%p.clientID] $= "")
		{
			%this.ClientScore[%p.clientID] = %p.score;
		}
		%i++;
		%p = PlayerList.findByIndex(%i);
	}
}
callback.add(onPlayerDeathUpdate, "StatMissionData.PlayerScoreUpdate();");
callback.add(onSupportTimerUpdate, "StatMissionData.PlayerScoreUpdate();");


//---------------------------------------------------------------------------
//Get team score data

function handleStatSupportTeamScore (%msgType, %msgString, %teamid, %teamscore)
{
	StatMissionData.TeamScore[%teamid] = %teamscore;
	callback.trigger(onTeamScoreUpdate);
}
addMessageCallback( 'MsgTeamScoreIs', handleStatSupportTeamScore );



//------------------------------------------------------------------
//	CTF Specific Game Code

function handleStatSupportCTFTeamInfo (%msgType, %msgString, %teamid, %teamname, %flagstatus, %teamscore)
{
	StatMissionData.TeamScore[%teamid] = %teamscore;
	callback.trigger(onTeamScoreUpdate);
}
addMessageCallback( 'MsgCTFAddTeam', handleStatSupportCTFTeamInfo );

function handleStatSupportCTFFlagTaken (%msgType, %msgString, %clientname, %flagteamname, %flagteamid, %namebase)
{
	%name = detag(%clientname);
	%clientid = PlayerList.getIDByName(%name);
	StatMissionData.ClientFlagGrab[%clientid]++;
	%capperteam = PlayerList.getTeamByID(%clientid);
	%flagteam = %capperteam == 1 ? 2 : 1;
	StatMissionData.TeamFlagGrab[%capperteam]++;
	callback.trigger(onFlagGrab, %clientid, %flagteam);
}
addMessageCallback( 'MsgCTFFlagTaken', handleStatSupportCTFFlagTaken );

function handleStatSupportCTFFlagDropped (%msgType, %msgString, %clientname, %flagteamname, %flagteamid)
{
	if(%clientname $= "0")
	{
		%name = playerList.getMyName();
	}
	else
	{
		%name = detag(%clientname);
	}
	%clientid = PlayerList.getIDByName(%name);
	StatMissionData.ClientFlagDrop[%clientid]++;
	%capperteam = PlayerList.getTeamByID(%clientid);
	StatMissionData.TeamFlagDrop[%capperteam]++;
	%flagteam = %capperteam == 1 ? 2 : 1;
	callback.trigger(onFlagDrop, %clientid, %flagteam);
}
addMessageCallback( 'MsgCTFFlagDropped', handleStatSupportCTFFlagDropped );

function handleStatSupportCTFFlagCapped (%msgType, %msgString, %clientname, %flagteamname, %flagteamid, %clientteamid)
{
	if(%clientname $= "0")
	{
		%name = playerList.getMyName();
	}
	else
	{
		%name = detag(%clientname);
	}
	%clientid = PlayerList.getIDByName(%name);
	StatMissionData.ClientFlagCap[%clientid]++;
	StatMissionData.TeamFlagCap[%clientteamid]++;
	%flagteam = %clientteamid == 1 ? 2 : 1;
	callback.trigger(onFlagCap, %clientid, %flagteam);
}
addMessageCallback( 'MsgCTFFlagCapped', handleStatSupportCTFFlagCapped );

function handleStatSupportCTFFlagReturn (%msgType, %msgString, %clientname, %flagteamname, %flagteamid)
{
	if(%clientname $= "0")
	{
		%name = playerList.getMyName();
	}
	else
	{
		%name = detag(%clientname);
	}

	StatMissionData.TeamFlagReturn[%flagteamid]++;
	if(%name !$= $PLAYER_ERROR)
	{
		%clientid = PlayerList.getIDByName(%name);
		StatMissionData.ClientFlagReturn[%clientid]++;
	}
	callback.trigger(onFlagReturn, %clientid, %flagteamid);
}
addMessageCallback( 'MsgCTFFlagReturned', handleStatSupportCTFFlagReturn );

//-------------------------------------------------------------------------
// CnH Specific Stuff

function handleStatSupportCNHTeamInfo (%msgType, %msgString, %teamid, %teamname, %teamscore, %scorelimit, %teamHeld)
{
	StatMissionData.TeamScore[%teamid] = %teamscore;
	StatMissionData.ScoreLimit = %scorelimit;
	callback.trigger(onTeamScoreUpdate);
}
addMessageCallback( 'MsgCnHAddTeam', handleStatSupportCNHTeamInfo );

function handleStatSupportCNHTeamClaim (%msgType, %msgString, %clientname, %ffname, %taggedteamname)
{
	%name = detag(%clientname);
	%clientid = PlayerList.getIDByName(%name);
	StatMissionData.ClientFFGrab[%clientid]++;
	%teamid = PlayerList.getTeamByID(%clientid);
	StatMissionData.TeamFFGrab[%teamid]++;
	callback.trigger(onFFGrab, %clientid);
}
addMessageCallback( 'MsgClaimFlipFlop', handleStatSupportCNHTeamClaim );


//-------------------------------------------------------------------------
// Hunters Stuff

function handleStatSupportHuntPlayerScored (%msgType, %msgString, %clientname)
{
	%name = detag(%clientname);
	%clientid = PlayerList.getIDByName(%name);
	StatMissionData.ClientHuntFlags[%clientid] = 0;
	callback.trigger(onHuntFlagChange, %clientid, 0);
}
addMessageCallback( 'MsgHuntPlayerScored', handleStatSupportHuntPlayerScored );

function handleStatSupportHuntYouScored (%msgType, %msgString)
{
	%clientid = PlayerList.getMyID();
	StatMissionData.ClientHuntFlags[%clientid] = 0;
	callback.trigger(onHuntFlagChange, %clientid, 0);
}
addMessageCallback( 'MsgHuntYouScored', handleStatSupportHuntYouScored );

function handleStatSupportHuntPlayerFlags (%msgType, %msgString, %clientname, %flagcount)
{
	%name = detag(%clientname);
	%clientid = PlayerList.getIDByName(%name);
	StatMissionData.ClientHuntFlags[%clientid] = %flagcount;
	callback.trigger(onHuntFlagChange, %clientid, %flagcount);
}
addMessageCallback( 'MsgHuntPlayerHasFlags', handleStatSupportHuntPlayerFlags );

function handleStatSupportHuntYouFlags (%msgType, %msgString, %flagcount)
{
	%clientid = PlayerList.getMyID();
	StatMissionData.ClientHuntFlags[%clientid] = %flagcount;
	callback.trigger(onHuntFlagChange, %clientid, %flagcount);
}
addMessageCallback( 'MsgHuntYouHaveFlags', handleStatSupportHuntYouFlags );

function handleStatSupportHuntPlayerDrop (%msgType, %msgString, %clientname, %flagcount)
{
	%name = detag(%clientname);
	%clientid = PlayerList.getIDByName(%name);
	StatMissionData.ClientHuntFlags[%clientid] = 0;
	callback.trigger(onHuntFlagChange, %clientid, 0);
}
addMessageCallback( 'MsgHuntPlayerDroppedFlags', handleStatSupportHuntPlayerDrop );

function handleStatSupportHuntYouDrop (%msgType, %msgString, %flagcount)
{
	%clientid = PlayerList.getMyID();
	StatMissionData.ClientHuntFlags[%clientid] = 0;
	callback.trigger(onHuntFlagChange, %clientid, 0);
}
addMessageCallback( 'MsgHuntYouDroppedFlags', handleStatSupportHuntYouDrop );


//-------------------------------------------------------------------------
// TAC2 Specific Stuff

function handleStatSupportTACFriend (%msgType, %msgString, %clientid, %points)
{
	if(%clientid $= 0 || %clientid $= "")
		return;
	StatMissionData.ClientTACFriendVehicleKill[%clientid]++;
	%myid = PlayerList.getMyID();
	%team = PlayerList.getTeamByID(%myid);
	StatMissionData.TeamTACFriendVehicleKill[%team]++;
	callback.trigger(onTACVehicleKill, %clientid);
}
addMessageCallback( 'MsgTACFriendVehicleKill', handleStatSupportTACFriend );

function handleStatSupportTACEnemy (%msgType, %msgString, %clientid, %points)
{
	if(%clientid $= 0 || %clientid $= "")
		return;
	StatMissionData.ClientTACEnemyVehicleKill[%clientid]++;
	%myid = PlayerList.getMyID();
	%team = PlayerList.getTeamByID(%myid);
	StatMissionData.TeamTACEnemyVehicleKill[%team]++;
	callback.trigger(onTACVehicleKill, %clientid);
}
addMessageCallback( 'MsgTACEnemyVehicleKill', handleStatSupportTACEnemy );

//===========================================================================

//---------------------------------------------------------------------------
//
//			 				DATA RETURN FUNCTIONS
//
//---------------------------------------------------------------------------

//---------------------------------------------------------------------------
// Client Data

//	This function will return the clients name, even if they have dropped
function StatSupport::getClientName(%this, %client)
{
	StatMissionData.ClientName[%client] = StatMissionData.ClientName[%client] $= "" ? "Unknown" : StatMissionData.ClientName[%client];
	return StatMissionData.ClientName[%client];
}

function StatSupport::getClientScore(%this, %client)
{
	StatMissionData.ClientScore[%client] = StatMissionData.ClientScore[%client] $= "" ? 0 : StatMissionData.ClientScore[%client];
	return StatMissionData.ClientScore[%client];
}

function StatSupport::getClientDeaths(%this, %client)
{
	StatMissionData.ClientDeath[%client] = StatMissionData.ClientDeath[%client] $= "" ? 0 : StatMissionData.ClientDeath[%client];
	return StatMissionData.ClientDeath[%client];
}

function StatSupport::getClientKills(%this, %client)
{
	StatMissionData.ClientKill[%client] = StatMissionData.ClientKill[%client] $= "" ? 0 : StatMissionData.ClientKill[%client];
	return StatMissionData.ClientKill[%client];
}

function StatSupport::getClientTeamKills(%this, %client)
{
	StatMissionData.ClientTeamKill[%client] = StatMissionData.ClientTeamKill[%client] $= "" ? 0 : StatMissionData.ClientTeamKill[%client];
	return StatMissionData.ClientTeamKill[%client];
}

function StatSupport::getClientHeadShot(%this, %client)
{
	StatMissionData.ClientHeadShot[%client] = StatMissionData.ClientHeadShot[%client] $= "" ? 0 : StatMissionData.ClientHeadShot[%client];
	return StatMissionData.ClientHeadShot[%client];
}

function StatSupport::getClientDeathByType(%this, %client, %damageType)
{
	StatMissionData.ClientDeathBy[%client, %damageType] = StatMissionData.ClientDeathBy[%client, %damageType] $= "" ? 0 : StatMissionData.ClientDeathBy[%client, %damageType];
	return StatMissionData.ClientDeathBy[%client, %damageType];
}

function StatSupport::getClientKillByType(%this, %client, %damageType)
{
	StatMissionData.ClientKillBy[%client, %damageType] = StatMissionData.ClientKillBy[%client, %damageType] $= "" ? 0 : StatMissionData.ClientKillBy[%client, %damageType];
	return StatMissionData.ClientKillBy[%client, %damageType];
}

function StatSupport::getClientDeathByClient(%this, %client, %kclient)
{
	StatMissionData.ClientDeathByKiller[%client, %kclient] = StatMissionData.ClientDeathByKiller[%client, %kclient] $= "" ? 0 : StatMissionData.ClientDeathByKiller[%client, %kclient];
	return StatMissionData.ClientDeathByKiller[%client, %kclient];
}

function StatSupport::getClientKillByClient(%this, %client, %vclient)
{
	StatMissionData.ClientKillByVictim[%client, %vclient] = StatMissionData.ClientKillByVictim[%client, %vclient] $= "" ? 0 : StatMissionData.ClientKillByVictim[%client, %vclient];
	return StatMissionData.ClientKillByVictim[%client, %vclient];
}



//---------------------------------------------------------------------------
// Game Stat Data

function StatSupport::getClientGrabs(%this, %clientid)
{
	StatMissionData.ClientFlagGrab[%clientid] = StatMissionData.ClientFlagGrab[%clientid] $= "" ? 0 : StatMissionData.ClientFlagGrab[%clientid];
	return StatMissionData.ClientFlagGrab[%clientid];
}

function StatSupport::getClientDrops(%this, %clientid)
{
	StatMissionData.ClientFlagDrop[%clientid] = StatMissionData.ClientFlagDrop[%clientid] $= "" ? 0 : StatMissionData.ClientFlagDrop[%clientid];
	return StatMissionData.ClientFlagDrop[%clientid];
}

function StatSupport::getClientCaps(%this, %clientid)
{
	StatMissionData.ClientFlagCap[%clientid] = StatMissionData.ClientFlagCap[%clientid] $= "" ? 0 : StatMissionData.ClientFlagCap[%clientid];
	return StatMissionData.ClientFlagCap[%clientid];
}

function StatSupport::getClientReturns(%this, %clientid)
{
	StatMissionData.ClientFlagReturn[%clientid] = StatMissionData.ClientFlagReturn[%clientid] $= "" ? 0 : StatMissionData.ClientFlagReturn[%clientid];
	return StatMissionData.ClientFlagReturn[%clientid];
}

function StatSupport::getClientFFGrabs(%this, %clientid)
{
	StatMissionData.ClientFFGrab[%clientid] = StatMissionData.ClientFFGrab[%clientid] $= "" ? 0 : StatMissionData.ClientFFGrab[%clientid];
	return StatMissionData.ClientFFGrab[%clientid];
}

function StatSupport::getClientFlagsCarried(%this, %client)
{
	StatMissionData.ClientHuntFlags[%clientid] = StatMissionData.ClientHuntFlags[%clientid] $= "" ? 0 : StatMissionData.ClientHuntFlags[%clientid];
	return StatMissionData.ClientHuntFlags[%clientid];
}

function StatSupport::getClientTACFriendlyVehiclesKilled(%this, %client)
{
	StatMissionData.ClientTACFriendVehicleKill[%clientid] = StatMissionData.ClientTACFriendVehicleKill[%clientid] $= "" ? 0 : StatMissionData.ClientTACFriendVehicleKill[%clientid];
	return StatMissionData.ClientTACFriendVehicleKill[%clientid];
}

function StatSupport::getClientTACEnemyVehiclesKilled(%this, %client)
{
	StatMissionData.ClientTACEnemyVehicleKill[%clientid] = StatMissionData.ClientTACEnemyVehicleKill[%clientid] $= "" ? 0 : StatMissionData.ClientTACEnemyVehicleKill[%clientid];
	return StatMissionData.ClientTACEnemyVehicleKill[%clientid];
}



//---------------------------------------------------------------------------
// Team Data

function StatSupport::getTeamScore(%this, %teamid)
{
	StatMissionData.TeamScore[%teamid] = StatMissionData.TeamScore[%teamid] $= "" ? 0 : StatMissionData.TeamScore[%teamid];
	return StatMissionData.TeamScore[%teamid];
}

function StatSupport::getTeamDeaths(%this, %teamid)
{
	StatMissionData.TeamDeath[%teamid] = StatMissionData.TeamDeath[%teamid] $= "" ? 0 : StatMissionData.TeamDeath[%teamid];
	return StatMissionData.TeamDeath[%teamid];
}

function StatSupport::getTeamKills(%this, %teamid)
{
	StatMissionData.TeamKill[%teamid] = StatMissionData.TeamKill[%teamid] $= "" ? 0 : StatMissionData.TeamKill[%teamid];
	return StatMissionData.TeamKill[%teamid];
}

function StatSupport::getTeamTeamKills(%this, %client)
{
	StatMissionData.TeamTeamKill[%teamid] = StatMissionData.TeamTeamKill[%teamid] $= "" ? 0 : StatMissionData.TeamTeamKill[%teamid];
	return StatMissionData.TeamTeamKill[%teamid];
}

function StatSupport::getTeamDeathByType(%this, %teamid, %damageType)
{
	StatMissionData.TeamDeathBy[%teamid, %damageType] = StatMissionData.TeamDeathBy[%teamid, %damageType] $= "" ? 0 : StatMissionData.TeamDeathBy[%teamid, %damageType];
	return StatMissionData.TeamDeathBy[%teamid, %damageType];
}

function StatSupport::getTeamKillByType(%this, %teamid, %damageType)
{
	StatMissionData.TeamKillBy[%teamid, %damageType] = StatMissionData.TeamKillBy[%teamid, %damageType] $= "" ? 0 : StatMissionData.TeamKillBy[%teamid, %damageType];
	return StatMissionData.TeamKillBy[%teamid, %damageType];
}

function StatSupport::getTeamGrabs(%this, %teamid)
{
	StatMissionData.TeamFlagGrab[%teamid] = StatMissionData.TeamFlagGrab[%teamid] $= "" ? 0 : StatMissionData.TeamFlagGrab[%teamid];
	return StatMissionData.TeamFlagGrab[%teamid];
}

function StatSupport::getTeamDrops(%this, %teamid)
{
	StatMissionData.TeamFlagDrop[%teamid] = StatMissionData.TeamFlagDrop[%teamid] $= "" ? 0 : StatMissionData.TeamFlagDrop[%teamid];
	return StatMissionData.TeamFlagDrop[%teamid];
}

function StatSupport::getTeamCaps(%this, %teamid)
{
	StatMissionData.TeamFlagCap[%teamid] = StatMissionData.TeamFlagCap[%teamid] $= "" ? 0 : StatMissionData.TeamFlagCap[%teamid];
	return StatMissionData.TeamFlagCap[%teamid];
}

function StatSupport::getTeamReturns(%this, %teamid)
{
	StatMissionData.TeamFlagReturn[%teamid] = StatMissionData.TeamFlagReturn[%teamid] $= "" ? 0 : StatMissionData.TeamFlagReturn[%teamid];
	return StatMissionData.TeamFlagReturn[%teamid];
}

function StatSupport::getTeamFFGrabs(%this, %teamid)
{
	StatMissionData.TeamFFGrab[%teamid] = StatMissionData.TeamFFGrab[%teamid] $= "" ? 0 : StatMissionData.TeamFFGrab[%teamid];
	return StatMissionData.TeamFFGrab[%teamid];
}

function StatSupport::getTeamTACFriendlyVehiclesKilled(%this, %client)
{
	StatMissionData.TeamTACFriendVehicleKill[%clientid] = StatMissionData.TeamTACFriendVehicleKill[%clientid] $= "" ? 0 : StatMissionData.TeamTACFriendVehicleKill[%clientid];
	return StatMissionData.TeamTACFriendVehicleKill[%clientid];
}

function StatSupport::getTeamTACEnemyVehiclesKilled(%this, %client)
{
	StatMissionData.TeamTACEnemyVehicleKill[%clientid] = StatMissionData.TeamTACEnemyVehicleKill[%clientid] $= "" ? 0 : StatMissionData.TeamTACEnemyVehicleKill[%clientid];
	return StatMissionData.TeamTACEnemyVehicleKill[%clientid];
}

