//--------------------------------------//
// TeamHuntersGame.cs                   //
//--------------------------------------//

// DisplayName = Team Hunters

//--- GAME RULES BEGIN ---
//Collect flags and bring them to Nexus
//You may pass flags to a Capper
//Capper can collect many flags and try for massive score
//However, any player may score at Nexus
//All scores of team members count toward team score
//--- GAME RULES END ---

package TeamHuntersGame {

function Nexus::objectiveInit(%data, %object)
{
	Game.Nexus = %object;
	Game.Nexus.playThread(0, "ambient");
	Game.Nexus.setThreadDir(0, true);
	//The flash animation plays forwards, then back automatically, so we have to alternate the thread direcction...
	Game.Nexus.flashThreadDir = true;
}

function NexusBase::objectiveInit(%data, %object)
{
	Game.NexusBase = %object;
	Game.NexusBase.playthread(0, "ambient");
	Game.NexusBase.setThreadDir(0, true);
}

function NexusCap::objectiveInit(%data, %object)
{
	Game.NexusCap = %object;
	Game.NexusCap.playthread(0, "ambient");
	Game.NexusCap.setThreadDir(0, true);
}

};

//exec the AI scripts
exec("scripts/aiTeamHunters.cs");

$InvBanList[TeamHunters, "TurretOutdoorDeployable"] = 1;
$InvBanList[TeamHunters, "TurretIndoorDeployable"] = 1;
$InvBanList[TeamHunters, "ElfBarrelPack"] = 1;
$InvBanList[TeamHunters, "MortarBarrelPack"] = 1;
$InvBanList[TeamHunters, "PlasmaBarrelPack"] = 1;
$InvBanList[TeamHunters, "AABarrelPack"] = 1;
$InvBanList[TeamHunters, "MissileBarrelPack"] = 1;
$InvBanList[TeamHunters, "Mine"] = 1;

//-----------------------------------------------------------------------------
//Game initialization functions

function TeamHuntersGame::missionLoadDone(%game)
{
   //default version sets up teams - must be called first...
   DefaultGame::missionLoadDone(%game);

   $numRanked = 0;
   
   //initialize the score and flag count for all the players
   %count = ClientGroup.getCount();
   for(%i = 0; %i < %count; %i++)
   {
		%client = ClientGroup.getObject(%i);
		%game.resetScore(%client);
      %client.flagCount = 1;
   }
   $TopClient = "";
   $TopClientScore = 0;

	for(%j = 1; %j < (%game.numTeams + 1); %j++)
		$teamScore[%j] = 0;

	//create the Flag group
	$FlagGroup = nameToID("MissionCleanup/FlagGroup");
	if ($FlagGroup <= 0)
	{
		$FlagGroup = new SimGroup("FlagGroup");
      MissionCleanup.add($FlagGroup);
	}

	if(nameToId("HuntersYardSaleSet") <= 0)
	{
		$HuntersYardSaleSet = new SimSet("HuntersYardSaleSet");
      MissionCleanup.add($HuntersYardSaleSet);
	}

	// make a game object for the Nexus (functions defined in HuntersGame.cs)
	MissionGroup.findNexus();
}

function TeamHuntersGame::initGameVars(%game)
{
	%game.SCORE_PER_SUICIDE = -1; 
	%game.SCORE_PER_TEAMKILL = -1;
	%game.SCORE_PER_DEATH = -1;  
	%game.SCORE_PER_KILL = 1; 
	%game.SCORE_PER_TURRET_KILL = 1; 

	%game.TeamMode = true;

	%game.GreedMode = $Host::TeamHuntersGreedMode;
	%game.GreedMinFlags = 8;		//min number of flags you must have before you can cap

	%game.HoardMode = $Host::TeamHuntersHoardMode;
	%game.HoardStartTime = 5;	//time left in the game at which hoard mode will start
	%game.HoardDuration = 3;		//duration of the hoard period
	%game.HoardEndTime = %game.HoardStartTime - %game.HoardDuration;

	%game.yardSaleMin = 10;

	//make sure there is enough time in the match to actually have a hoard mode...
	if ($host::timeLimit < %game.hoardStartTime + 1)
		%game.hoardMode = false;

	//this is how many milliseconds before a warning is issued for camping near the Nexus
	%game.nexusCampingTime = 10000;

	//vars for how long before the flag is deleted, and the fade transition time...
	%game.flagLifeTimeMS = 120000;
	%game.fadeTimeMS = 2000;

	%game.flagMsgDelayMS = 3000;
	%game.oobThrowFlagsDelayMS = 3000;

   // targets for each of the flag types (except for base which is properly skinned already)
   HuntersFlag1.target = -1;  // red
   HuntersFlag2.target = allocTarget("", 'Blue', "", "", 0, "", "");
   HuntersFlag4.target = allocTarget("", 'Yellow', "", "", 0, "", "");
   HuntersFlag8.target = allocTarget("", 'Green', "", "", 0, "", "");
}

function TeamHuntersGame::allowsProtectedStatics(%game)
{
   // prevent appropriate equipment from being damaged - invulnerable
   return true;
}

function TeamHuntersGame::setNexusDisabled(%game)
{
	HuntersGame::setNexusDisabled(%game);
}

function TeamHuntersGame::setNexusEnabled(%game)
{
	HuntersGame::setNexusEnabled(%game);
}

function TeamHuntersGame::flashNexus(%game)
{
	HuntersGame::flashNexus(%game);
}

function TeamHuntersGame::NexusSparkEmitter(%game, %client, %cap, %numToScore)
{
	HuntersGame::NexusSparkEmitter(%game, %client, %cap, %numToScore);
}


function TeamHuntersGame::resetScore(%game, %client)
{
	%client.score = 0;
	%client.suicides = 0;
	%client.kills = 0;
	%client.teamKills = 0;
	%client.deaths = 0;
}

function TeamHuntersGame::recalcScore(%game, %cl)
{
	if (%cl <= 0)
		return;

	%killValue = %cl.kills * %game.SCORE_PER_KILL;
	%deathValue = %cl.deaths * %game.SCORE_PER_DEATH;

	if (%killValue - %deathValue == 0)
		%killPoints = 0;
	else
		%killPoints = (%killValue * %killValue) / (%killValue - %deathValue);

	%cl.score = %killPoints;
   %cl.score += %cl.suicides * %game.SCORE_PER_SUICIDE;
	%cl.score = mFloor(%cl.score);

	//must send the message to update the HUD
	messageClient(%cl, 'MsgYourScoreIs', "", %cl.score);
	
	%game.recalcTeamRanks(%cl);
}	

function TeamHuntersGame::startMatch(%game)
{
	HuntersGame::startMatch(%game);
}

function TeamHuntersGame::setupHoardCountdown(%game)
{
	HuntersGame::setupHoardCountdown(%game);
}

function TeamHuntersGame::notifyHoardStart(%game, %seconds)
{
	HuntersGame::notifyHoardStart(%game, %seconds);
}

function TeamHuntersGame::notifyHoardEnd(%game, %seconds)
{
	HuntersGame::notifyHoardEnd(%game, %seconds);
}

function TeamHuntersGame::updateHoardStatusHUD(%game)
{
	HuntersGame::updateHoardStatusHUD(%game);
}

//-----------------------------------------------------------------------------
//Player spawn/death functions

function TeamHuntersGame::assignClientTeam(%game, %client)
{
   DefaultGame::assignClientTeam(%game, %client);
}

function TeamHuntersGame::createPlayer(%game, %client, %spawnLoc)
{
   HuntersGame::createPlayer(%game, %client, %spawnLoc);
}

function TeamHuntersGame::pickPlayerSpawn(%game, %client, %respawn)
{
	return %game.pickTeamSpawn(%client.team);
}

function TeamHuntersGame::playerSpawned(%game, %player, %armor)
{
   HuntersGame::playerSpawned(%game, %player, %armor);

	//reset the enemy damaged time
	%player.client.lastEnemyDamagedTime = 0;
}

function TeamHuntersGame::onClientDamaged(%game, %clVictim, %clAttacker, %damageType, %sourceObject)
{
	//first call the default version
	DefaultGame::onClientDamaged(%game, %clVictim, %clAttacker, %damageType, %sourceObject);

	//now see if the attacker was an enemy
	if (isObject(%clAttacker) && %clAttacker.team != %clVictim.team)
		%clVictim.lastEnemyDamagedTime = getSimTime();
}

function TeamHuntersGame::onClientKilled(%game, %clVictim, %clKiller, %damageType, %implement)
{
   //set the flag
   %clVictim.isDead = true;

	//to prevent suiciders from dropping flags for their teammates - see if the player
	//has taken enemy damage within the last 20 seconds
   if ((%game.testSuicide(%clVictim, %clKiller, %damageType) ||
						   		(isObject(%clKiller) && %clKiller.team == %clVictim.team)) &&
							   	(getSimTime() - %clVictim.lastEnemyDamagedTime > 20000))
	{
		%clVictim.flagCount--;
	}

   //first, drop all the flags
   HuntersGame::dropFlag(%game, %clVictim.player);
   
   //now call the default game stuff
   DefaultGame::onClientKilled(%game, %clVictim, %clKiller, %damageType, %implement); 

   messageClient(%clVictim, 'MsgHuntYouHaveFlags', "", 0);
}

function TeamHuntersGame::updateKillScores(%game, %clVictim, %clKiller, %damageType, %implement)
{
	if (%game.testKill(%clVictim, %clKiller)) //verify victim was an enemy
	{
		%game.awardScoreKill(%clKiller);
		%game.awardScoreDeath(%clVictim);
	}       
	else if (%game.testSuicide(%clVictim, %clKiller, %damageType))  //otherwise test for suicide
		%game.awardScoreSuicide(%clVictim);		 
}

function TeamHuntersGame::equip(%game, %player)
{
   HuntersGame::equip(%game, %player);
}                  

function TeamHuntersGame::checkTimeLimit(%game)
{
	HuntersGame::checkTimeLimit(%game);
}

function TeamHuntersGame::timeLimitReached(%game)
{
   HuntersGame::timeLimitReached(%game);
}

function TeamHuntersGame::checkScoreLimit(%game, %team)
{
	//no such thing as a score limit in Hunters
}

function TeamHuntersGame::scoreLimitReached(%game)
{
	//no such thing as a score limit in Hunters
}

function TeamHuntersGame::clientMissionDropReady(%game, %client)
{
   //%client.rank = ClientGroup.getCount();
   messageClient(%client, 'MsgClientReady',"", %game.class);
	//messageClient(%client, 'MsgHuntModesSet', "", %game.GreedMode, %game.HoardMode);
	messageClient(%client, 'MsgHuntYouHaveFlags', "", 0);
	//%game.populateTeamRankArray(%client);
	//messageClient(%client, 'MsgHuntTeamRankIs', "", -1);
   for(%i = 1; %i <= %game.numTeams; %i++)
      messageClient(%client, 'MsgHuntAddTeam', "", %i, $TeamName[%i], $TeamScore[%i]);

	//messageClient(%client, 'MsgHuntGreedStatus', "", %game.GreedMode, %game.GreedMinFlags);
	//%curTimeLeftMS = ($Host::TimeLimit * 60 * 1000) + $missionStartTime - getSimTime();
	//messageClient(%client, 'MsgHuntHoardStatus', "", %game.HoardMode, $Host::TimeLimit, %curTimeLeftMS, %game.HoardStartTime, %game.HoardDuration);

   messageClient(%client, 'MsgMissionDropInfo', '\c0You are in mission %1 (%2).', $MissionDisplayName, $MissionTypeDisplayName, $ServerName ); 
	
	DefaultGame::clientMissionDropReady(%game, %client);
}

function TeamHuntersGame::assignClientTeam(%game, %client, %respawn)
{
	DefaultGame::assignClientTeam(%game, %client, %respawn);
	// if player's team is not on top of objective hud, switch lines
	messageClient(%client, 'MsgCheckTeamLines', "", %client.team);
}

function TeamHuntersGame::gameOver(%game)
{
	//call the default
	DefaultGame::gameOver(%game);

	//send the winner message
	%winner = "";
	if ($teamScore[1] > $teamScore[2])
		%winner = $teamName[1];
	else if ($teamScore[2] > $teamScore[1])
		%winner = $teamName[2];

	if (%winner $= 'Storm')
	   messageAll('MsgGameOver', "Match has ended.~wvoice/announcer/ann.stowins.wav" );
	else if (%winner $= 'Inferno')
	   messageAll('MsgGameOver', "Match has ended.~wvoice/announcer/ann.infwins.wav" );
	else
	   messageAll('MsgGameOver', "Match has ended.~wvoice/announcer/ann.gameover.wav" );

	messageAll('MsgClearObjHud', "");
	for(%i = 0; %i < ClientGroup.getCount(); %i ++)
	{
		%client = ClientGroup.getObject(%i);
		Game.resetScore(%client);
		cancel(%client.oobSched);
	}
}

function TeamHuntersGame::sendFlagCountMessage(%game, %client)
{
	HuntersGame::sendFlagCountMessage(%game, %client);
}

function TeamHuntersGame::playerTouchFlag(%game, %player, %flag)
{
   HuntersGame::playerTouchFlag(%game, %player, %flag);
}

function TeamHuntersGame::updateFlagHoarder(%game)
{
	//in Team Hunters, no waypoint for the flag hoarder...
}

function TeamHuntersGame::hoardModeActive(%game, %wouldBeActive)
{
   HuntersGame::hoardModeActive(%game, %wouldBeActive);
}

function TeamHuntersGame::playerDroppedFlag(%game, %player)
{
	HuntersGame::playerDroppedFlag(%game, %player);
}

//-----------------------------------------------------------------------------
//VOTING functions
function TeamHuntersGame::sendGameVoteMenu( %game, %client, %key )
{
   // Don't send any options if a vote is already running:
   if ( %game.scheduleVote $= "" )
   {
      // First send the common options:
      DefaultGame::sendGameVoteMenu( %game, %client, %key );

      // Now send the Hunters-specific options:
      if ( %game.GreedMode )
         messageClient( %client, 'MsgVoteItem', "", %key, 'VoteGreedMode', 'disable greed mode', 'Disable GREED Mode' );
      else
         messageClient( %client, 'MsgVoteItem', "", %key, 'VoteGreedMode', 'enable greed mode', 'Enable GREED Mode' );

      if ( %game.HoardMode )
         messageClient( %client, 'MsgVoteItem', "", %key, 'VoteHoardMode', 'disable hoard mode', 'Disable HOARD Mode' );
      else
         messageClient( %client, 'MsgVoteItem', "", %key, 'VoteHoardMode', 'enable hoard mode', 'Enable HOARD Mode' );
   }
}

function TeamHuntersGame::voteGreedMode( %game, %admin, %player )
{
	HuntersGame::voteGreedMode( %game, %admin, %player );
}

function TeamHuntersGame::voteHoardMode( %game, %admin, %player )
{
	HuntersGame::voteHoardMode( %game, %admin, %player );
}

function TeamHuntersGame::throwFlags(%game, %player)
{
	HuntersGame::throwFlags(%game, %player);
}

function TeamHuntersGame::outOfBoundsThrowFlags(%game, %client)
{
	HuntersGame::outOfBoundsThrowFlags(%game, %client);
}

function TeamHuntersGame::dropFlag(%game, %player)
{
	HuntersGame::dropFlag(%game, %player);
}

function TeamHuntersGame::enterMissionArea(%game, %playerData, %player)
{
	HuntersGame::enterMissionArea(%game, %playerData, %player);
}

function TeamHuntersGame::leaveMissionArea(%game, %playerData, %player)
{
	HuntersGame::leaveMissionArea(%game, %playerData, %player);
}

function TeamHuntersGame::onEnterTrigger(%game, %triggerName, %data, %obj, %colobj)
{
	HuntersGame::onEnterTrigger(%game, %triggerName, %data, %obj, %colobj);
}

function TeamHuntersGame::onLeaveTrigger(%game, %triggerName, %data, %obj, %colobj)
{
	HuntersGame::onLeaveTrigger(%game, %triggerName, %data, %obj, %colobj);
}

function TeamHuntersGame::CampingDamage(%game, %client, %firstWarning)
{
	HuntersGame::CampingDamage(%game, %client, %firstWarning);
}

function TeamHuntersGame::updateScoreHud(%game, %client, %tag)
{
	messageClient( %client, 'ClearHud', "", %tag, 0 );
   // Send header:
   messageClient( %client, 'SetScoreHudHeader', "", '<tab:15,315>\t%1<rmargin:260><just:right>%2<rmargin:560><just:left>\t%3<just:right>%4',
         $teamName[1], $teamScore[1], $teamName[2], $teamScore[2] );

   // Send subheader:
   messageClient( %client, 'SetScoreHudSubheader', "", '<tab:5,305>\tPLAYER (%1)<rmargin:210><just:right>SCORE<rmargin:270><just:right>FLAGS<rmargin:510><just:left>\tPLAYER (%2)<just:right>SCORE<rmargin:570><just:right>FLAGS',
         $TeamRank[1, count], $TeamRank[2, count] );

	//find out who on each team has the most flags
	%team1ClientMostFlags = -1;
	%team1ClientMostFlagsCount = -1;
	for (%i = 0; %i < $TeamRank[1, count]; %i++)
	{
		%cl = $TeamRank[1, %i];
		if (%cl.flagCount > %team1ClientMostFlagsCount)
		{
			%team1ClientMostFlagsCount = %cl.flagCount;
			%team1ClientMostFlags = %cl;
		}
	}
	if (%team1ClientMostFlagsCount <= 1)
		%team1ClientMostFlags = -1;

	%team2ClientMostFlags = -1;
	%team2ClientMostFlagsCount = -1;
	for (%i = 0; %i < $TeamRank[2, count]; %i++)
	{
		%cl = $TeamRank[2, %i];
		if (%cl.flagCount > %team2ClientMostFlagsCount)
		{
			%team2ClientMostFlagsCount = %cl.flagCount;
			%team2ClientMostFlags = %cl;
		}
	}
	if (%team2ClientMostFlagsCount <= 1)
		%team2ClientMostFlags = -1;

	%index = 0;
	while (true)
	{
		if (%index >= $TeamRank[1, count] && %index >= $TeamRank[2, count])
			break;

		//get the team1 client info
		%team1Client = "";
		%team1ClientScore = "";
		%team1ClientFlags = "";
      %col1Style = "";
		if (%index < $TeamRank[1, count])
		{
			%team1Client = $TeamRank[1, %index];
			%team1ClientScore = %team1Client.score $= "" ? 0 : %team1Client.score;
			%team1ClientFlags = %team1Client.flagCount - 1;
			if (%team1ClientFlags <= 0)
				%team1ClientFlags = "";
         if ( %team1Client == %team1ClientMostFlags )
            %col1Style = "<color:00dc00>";
         else if ( %team1Client == %client )
            %col1Style = "<color:dcdcdc>";
		}

		//get the team2 client info
		%team2Client = "";
		%team2ClientScore = "";
		%team2ClientFlags = "";
      %col2Style = "";
		if (%index < $TeamRank[2, count])
		{
			%team2Client = $TeamRank[2, %index];
			%team2ClientScore = %team2Client.score $= "" ? 0 : %team2Client.score;
			%team2ClientFlags = %team2Client.flagCount - 1;
			if (%team2ClientFlags <= 0)
				%team2ClientFlags = "";
         if ( %team2Client == %team2ClientMostFlags )
            %col2Style = "<color:00dc00>";
         else if ( %team2Client == %client )
            %col2Style = "<color:dcdcdc>";
		}


      //if the client is not an observer, send the message
      if (%client.team != 0)
      {
		   messageClient( %client, 'SetLineHud', "", %tag, %index, '<tab:10, 310><spush>%7\t<clip:150>%1</clip><rmargin:200><just:right>%2<rmargin:260><just:right>%3<spop><rmargin:500><just:left>\t%8<clip:150>%4</clip><just:right>%5<rmargin:560><just:right>%6', 
		         %team1Client.name, %team1ClientScore, %team1ClientFlags, %team2Client.name, %team2ClientScore, %team2ClientFlags, %col1Style, %col2Style );
      }
      //else for observers, create an anchor around the player name so they can be observed
      else
      {
         //this is lame, but we can only have up to %9 args
         if (%team2Client == %team2ClientMostFlags)
         {
		      messageClient( %client, 'SetLineHud', "", %tag, %index, '<tab:10, 310><spush>%7\t<clip:150><a:gamelink\t%8>%1</a></clip><rmargin:200><just:right>%2<rmargin:260><just:right>%3<spop><rmargin:500><just:left>\t<color:00dc00><clip:150><a:gamelink\t%9>%4</a></clip><just:right>%5<rmargin:560><just:right>%6', 
		            %team1Client.name, %team1ClientScore, %team1ClientFlags, %team2Client.name, %team2ClientScore, %team2ClientFlags, %col1Style, %team1Client, %team2Client );
         }
         else if (%team2Client == %client)
         {
		      messageClient( %client, 'SetLineHud', "", %tag, %index, '<tab:10, 310><spush>%7\t<clip:150><a:gamelink\t%8>%1</a></clip><rmargin:200><just:right>%2<rmargin:260><just:right>%3<spop><rmargin:500><just:left>\t<color:dcdcdc><clip:150><a:gamelink\t%9>%4</a></clip><just:right>%5<rmargin:560><just:right>%6', 
		            %team1Client.name, %team1ClientScore, %team1ClientFlags, %team2Client.name, %team2ClientScore, %team2ClientFlags, %col1Style, %team1Client, %team2Client );
         }
         else
         {
		      messageClient( %client, 'SetLineHud', "", %tag, %index, '<tab:10, 310><spush>%7\t<clip:150><a:gamelink\t%8>%1</a></clip><rmargin:200><just:right>%2<rmargin:260><just:right>%3<spop><rmargin:500><just:left>\t<clip:150><a:gamelink\t%9>%4</a></clip><just:right>%5<rmargin:560><just:right>%6', 
		            %team1Client.name, %team1ClientScore, %team1ClientFlags, %team2Client.name, %team2ClientScore, %team2ClientFlags, %col1Style, %team1Client, %team2Client );
         }
      }

		%index++;
	}

   // Tack on the list of observers:
   %observerCount = 0;
   for (%i = 0; %i < ClientGroup.getCount(); %i++)
   {
      %cl = ClientGroup.getObject(%i);
      if (%cl.team == 0)
         %observerCount++;
   }

   if (%observerCount > 0)
   {
	   messageClient( %client, 'SetLineHud', "", %tag, %index, "");
      %index++;
		messageClient(%client, 'SetLineHud', "", %tag, %index, '<tab:10, 310><spush><font:Univers Condensed:22>\tOBSERVERS (%1)<rmargin:260><just:right>TIME<spop>', %observerCount);
      %index++;
      for (%i = 0; %i < ClientGroup.getCount(); %i++)
      {
         %cl = ClientGroup.getObject(%i);
         //if this is an observer
         if (%cl.team == 0)
         {
            %obsTime = getSimTime() - %cl.observerStartTime;
            %obsTimeStr = %game.formatTime(%obsTime, false);
		      messageClient( %client, 'SetLineHud', "", %tag, %index, '<tab:20, 310>\t<clip:150>%1</clip><rmargin:260><just:right>%2',
		                     %cl.name, %obsTimeStr );
            %index++;
         }
      }
   }

	//clear the rest of Hud so we don't get old lines hanging around...
	messageClient( %client, 'ClearHud', "", %tag, %index );
}
