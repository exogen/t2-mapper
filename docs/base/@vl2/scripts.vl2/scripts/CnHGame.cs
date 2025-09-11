// DisplayName = Capture and Hold

//--- GAME RULES BEGIN ---
//Teams try to capture marked objectives
//Capturing player gets a point 12 seconds after a capture
//Hold objectives in order to score
//A team scores 2 points per second it holds an objective
//Turrets and inventory stations convert when their switch is taken
//--- GAME RULES END ---

//exec the AI scripts
exec("scripts/aiCnH.cs");

package CnHGame {

function FlipFlop::playerTouch(%data, %flipflop, %player)
{
   if(%flipflop.team != %player.client.team)
   {
		Parent::playerTouch(%data, %flipflop, %player);
		Game.startTimerPlayerFFCap(%player.client, %flipflop);
   }   
} 

function Flipflop::objectiveInit(%data, %flipflop)
{
   %flipflop.tCapThread = "";
   %flipflop.tHoldThread = "";
   %flipflop.pCapThread = "";
   Parent::objectiveInit(%data, %flipflop);
}

};


//--------- CnH SCORING INIT ------------------
function CnHGame::initGameVars(%game)
{
	%game.SCORE_PER_SUICIDE = -1; 
	%game.SCORE_PER_TEAMKILL = -1;
	%game.SCORE_PER_DEATH = -1;  

	%game.SCORE_PER_KILL = 1; 
	%game.SCORE_PER_PLYR_FLIPFLOP_CAP = 1;
	%game.SCORE_PER_TEAM_FLIPFLOP_CAP = 1;
	%game.SCORE_PER_TEAM_FLIPFLOP_HOLD = 1;	

	%game.SCORE_PER_TURRET_KILL = 1; 
	%game.SCORE_PER_FLIPFLOP_DEFEND = 1;
	%game.SCORE_LIMIT_PER_TOWER = 1200; //default of 1200 points per tower required to win @ 1 pt per %game.TIME_REQ_TEAM_HOLD_BONUS milliseconds

	%game.TIME_REQ_PLYR_CAP_BONUS =	12 * 1000;  //player must hold a switch 12 seconds to get a point for it.
	%game.TIME_REQ_TEAM_CAP_BONUS = 12 * 1000;	//time after touching it takes for team to get a point
	%game.TIME_REQ_TEAM_HOLD_BONUS = 0.5 * 1000;	 //recurring time it takes team to earn a point when flipflop held
	%game.RADIUS_FLIPFLOP_DEFENSE = 20; //meters
}

function CnHGame::setUpTeams(%game)
{
   DefaultGame::setUpTeams(%game);

   // reset the visibility of team 0 (team is still defaulted as friendly)   
   setSensorGroupAlwaysVisMask(0, 0);
}

//-- tracking  ---
// .deaths .kills .suicides .teamKills .turretKills 
// .flipFlopDefends .flipFlopsCapped

function CnHGame::startMatch(%game)
{
   for(%i = 0; %i <= %game.numTeams; %i++)
		$TeamScore[%i] = 0;

   DefaultGame::startMatch(%game);
}

function CnHGame::checkScoreLimit(%game, %team)
{
	%scoreLimit = %game.getScoreLimit();
	if($TeamScore[%team] >= %scoreLimit) 
		%game.scoreLimitReached();
}

function CnHGame::getScoreLimit(%game)
{
	%scoreLimit = MissionGroup.CnH_scoreLimit;
	if(%scoreLimit $= "")
		%scoreLimit = %game.getNumFlipFlops() * %game.SCORE_LIMIT_PER_TOWER;

	return %scoreLimit;
}

function CnHGame::scoreLimitReached(%game)
{
	logEcho("game over (scorelimit)");
	%game.gameOver();
   cycleMissions();
}

function CnHGame::timeLimitReached(%game)
{
	logEcho("game over (timelimit)");
	%game.gameOver();
   cycleMissions();
}

function CnHGame::gameOver(%game)
{
	//call the default
	DefaultGame::gameOver(%game);

	// stop all bonus timers
	%game.stopScoreTimers();

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
		%game.resetScore(%client);
	}
	for ( %team = 1; %team <= %game.numTeams; %team++ )
	{
		$TeamScore[%team] = 0;
		messageAll('MsgCnHTeamCap', "", -1, -1, -1, %team, $TeamScore[%team], %game.getScoreLimit());
	}
}

function CnHGame::stopScoreTimers(%game)
{
	// find all switches and cancel any timers associated with them
	%ffGroup = nameToId("MissionCleanup/FlipFlops");
	if(%ffGroup <= 0)
		return;

	for(%i = 0; %i < %ffGroup.getCount(); %i++)
	{
		%curFF = %ffGroup.getObject(%i);
		cancel(%curFF.tHoldThread);
		cancel(%curFF.pCapThread);
		cancel(%curFF.tCapThread);
	}
}

function CnHGame::clientMissionDropReady(%game, %client)
{
   messageClient(%client, 'MsgClientReady',"", %game.class);
	%scoreLimit = %game.getScoreLimit();

   for(%i = 1; %i <= %game.numTeams; %i++)
	{
		%teamHeld = %game.countFlipsHeld(%i);
      messageClient(%client, 'MsgCnHAddTeam', "", %i, $TeamName[%i], $TeamScore[%i], %scoreLimit, %teamHeld);
	}

	//%game.populateTeamRankArray(%client);
	//messageClient(%client, 'MsgYourRankIs', "", -1);

   messageClient(%client, 'MsgMissionDropInfo', '\c0You are in mission %1 (%2).', $MissionDisplayName, $MissionTypeDisplayName, $ServerName ); 
	
	DefaultGame::clientMissionDropReady(%game, %client);
}

function CnHGame::assignClientTeam(%game, %client, %respawn)
{
	DefaultGame::assignClientTeam(%game, %client, %respawn);
	// if player's team is not on top of objective hud, switch lines
	messageClient(%client, 'MsgCheckTeamLines', "", %client.team);
}

function CnHGame::getNumFlipFlops()
{
     %ffGroup = nameToID("MissionCleanup/FlipFlops");
	 return %ffGroup.getCount();
}

function CnHGame::countFlipsHeld(%game, %team)
{
	%teamHeld = 0;
	// count how many flipflops each team holds
	%ffSet = nameToID("MissionCleanup/FlipFlops");
	if(%ffSet > 0)
	{
		%numFF = %ffSet.getCount();
		for(%j = 0; %j < %numFF; %j++)
		{
			%curFF = %ffSet.getObject(%j);
			if(%curFF.team == %team)
				%teamHeld++;
		}
	}

	return %teamHeld;
}

function CnHGame::countFlips(%game)
{
	return true;
}

function CnHGame::equip(%game, %player)
{
	for(%i =0; %i<$InventoryHudCount; %i++)
		%player.client.setInventoryHudItem($InventoryHudData[%i, itemDataName], 0, 1);
   %player.client.clearBackpackIcon();

	//%player.setArmor("Light");
	%player.setInventory(Blaster,1);
	%player.setInventory(Chaingun, 1);
	%player.setInventory(ChaingunAmmo, 100);
	%player.setInventory(Disc,1);
	%player.setInventory(DiscAmmo, 20);
	%player.setInventory(TargetingLaser, 1);
	%player.setInventory(Grenade,6);
	%player.setInventory(Beacon, 3);
	%player.setInventory(RepairKit,1);
	%player.weaponCount = 3;

	%player.use("Blaster");
}                  

//--------------- Scoring functions -----------------
function CnHGame::recalcScore(%game, %cl)
{
	%killValue = %cl.kills * %game.SCORE_PER_KILL;
	%deathValue = %cl.deaths * %game.SCORE_PER_DEATH;

	if (%killValue - %deathValue == 0)
		%killPoints = 0;
	else
		%killPoints = (%killValue * %killValue) / (%killValue - %deathValue);

	%cl.offenseScore = %killPoints;
	%cl.offenseScore +=	%cl.suicides * %game.SCORE_PER_SUICIDE; //-1
	%cl.offenseScore +=	%cl.teamKills * %game.SCORE_PER_TEAMKILL; // -1
	%cl.offenseScore += %cl.flipFlopsCapped * %game.SCORE_PER_PLYR_FLIPFLOP_CAP;
	
	%cl.defenseScore =	%cl.turretKills * %game.SCORE_PER_TURRET_KILL;  // 1
	%cl.defenseScore += %cl.flipFlopDefends *  %game.SCORE_PER_FLIPFLOP_DEFEND;

	%cl.score =	mFloor(%cl.offenseScore + %cl.defenseScore);
	//track switches held (not touched), switches defended, kills, deaths, suicides, tks
	
	%game.recalcTeamRanks(%cl);
}

function CnHGame::updateKillScores(%game, %clVictim, %clKiller, %damageType, %implement)
{
   if(%game.testTurretKill(%implement))	//check for turretkill before awarded a non client points for a kill
   {    		
   	  %game.awardScoreTurretKill(%clVictim, %implement);  
   }
   else if (%game.testKill(%clVictim, %clKiller)) //verify victim was an enemy
   {
	  %game.awardScoreKill(%clKiller);
	  %game.awardScoreDeath(%clVictim);

      //see if we were defending a flip flop
      %flipflop = %game.testPlayerFFDefend(%clVictim, %clKiller);
      if (isObject(%flipflop))
	     %game.awardScorePlayerFFDefend(%clKiller, %flipflop);	  		
   }
   else
   {  		
	  if (%game.testSuicide(%clVictim, %clKiller, %damageType))  //otherwise test for suicide
	  {
	  	 %game.awardScoreSuicide(%clVictim);
	  }
	  else
	  {
	     if (%game.testTeamKill(%clVictim, %clKiller)) //otherwise test for a teamkill
   	        %game.awardScoreTeamKill(%clVictim, %clKiller);
	  }
   }	   	
}

function CnHGame::testPlayerFFDefend(%game, %victimID, %killerID)
{
   if (!isObject(%victimId) || !isObject(%killerId) || %killerId.team <= 0)
      return -1;

   //loop through the flipflops looking for one within range that belongs to the killer...
   %ffGroup = nameToID("MissionCleanup/FlipFlops");
   for (%i = 0; %i < %ffGroup.getCount(); %i++)
   {
      %ffObj = %ffGroup.getObject(%i);
      if (VectorDist(%ffObj.position, %victimID.plyrPointOfDeath) < %game.RADIUS_FLIPFLOP_DEFENSE)
      {
         if (%ffObj.team == %killerID.team)
            return %ffObj;
      }
   }

   //none were found
   return -1;
}

function CnHGame::awardScorePlayerFFDefend(%game, %cl, %flipflop)
{
	%cl.flipFlopDefends++;
   if (%game.SCORE_PER_FLIPFLOP_DEFEND != 0)
   {
      messageClient(%cl, 'msgFFDef', '\c0You received a %1 point bonus for defending %2.', %game.SCORE_PER_FLIPFLOP_DEFEND, %game.cleanWord(%flipflop.name));	
//      messageTeamExcept(%cl, 'msgFFDef', '\c0Teammate %1 received a %2 point bonus for defending %3', %cl.name, %game.SCORE_PER_FLIPFLOP_DEFEND, %game.cleanWord(%flipflop.name));
   }      
	%game.recalcScore(%cl);
}

function CnHGame::awardScorePlayerFFCap(%game, %cl, %this)
{
	if(!($missionRunning))
		return;

	%cl.flipFlopsCapped++;
   if (%game.SCORE_PER_PLYR_FLIPFLOP_CAP != 0)
   {
      messageClient(%cl, 'msgFFDef', '\c0You received a %1 point bonus for holding the %2.', %game.SCORE_PER_PLYR_FLIPFLOP_CAP, %game.cleanWord(%this.name));	
//      messageTeamExcept(%cl, 'msgFFDef', '\c0Teammate %1 received a %2 point bonus for holding the %3', %cl.name, %game.SCORE_PER_PLYR_FLIPFLOP_CAP, %game.cleanWord(%this.name));
   }      
	%game.recalcScore(%cl);
} 

function CnHGame::awardScoreTeamFFCap(%game, %team, %this)
{
	cancel(%this.tCapThread);

	if(!($missionRunning))
		return;

	$TeamScore[%team] +=%game.SCORE_PER_TEAM_FLIPFLOP_CAP;
	%sLimit = %game.getScoreLimit();
	if (%game.SCORE_PER_TEAM_FLIPFLOP_CAP)
		messageAll('MsgCnHTeamCap', "", -1, -1, -1, %team, $teamScore[%team], %sLimit);
   if (%game.SCORE_PER_TEAM_FLIPFLOP_HOLD != 0)
		%this.tHoldThread = %game.schedule(%game.TIME_REQ_TEAM_HOLD_BONUS, "awardScoreTeamFFHold", %team, %this);
	
	%game.checkScoreLimit(%team);
}

function CnHGame::awardScoreTeamFFHold(%game, %team, %this)
{
	cancel(%this.tHoldThread);

	if(!($missionRunning))
		return;

   $TeamScore[%team] +=%game.SCORE_PER_TEAM_FLIPFLOP_HOLD;
	%sLimit = %game.getScoreLimit();
	if (%game.SCORE_PER_TEAM_FLIPFLOP_HOLD)
		messageAll('MsgCnHTeamCap', "", $TeamName[%team], %game.SCORE_PER_TEAM_FLIPFLOP_HOLD, %game.cleanWord(%this.name), %team, $teamScore[%team], %sLimit);

	// if either team's score is divisible by 100, send a console log message
	if(($TeamScore[%team] / 100) == (mFloor($TeamScore[%team] / 100)))
		for(%i = 1; %i <= %game.numTeams; %i++)
			logEcho("team "@%i@" score "@$TeamScore[%i]);

	%game.checkScoreLimit(%team);

	%this.tHoldThread = %game.schedule(%game.TIME_REQ_TEAM_HOLD_BONUS, "awardScoreTeamFFHold", %team, %this);
}

function CnHGame::testValidRepair(%game, %obj)
{
	return ((%obj.lastDamagedByTeam != %obj.team) && (%obj.repairedBy.team == %obj.team));
}

function CnHGame::genOnRepaired(%game, %obj, %objName)
{
		
	if (%game.testValidRepair(%obj))
	{
		%repairman = %obj.repairedBy;
		messageTeam(%repairman.team, 'msgGenRepaired', '\c0%1 repaired the %2 Generator!', %repairman.name, %obj.nameTag);		
	}				
}

function CnHGame::stationOnRepaired(%game, %obj, %objName)
{
	if (%game.testValidRepair(%obj))	
	{		
	   %repairman = %obj.repairedBy;
	   messageTeam(%repairman.team, 'msgStationRepaired', '\c0%1 repaired the %2 Inventory Station!', %repairman.name, %obj.nameTag);
	}
}

function CnHGame::sensorOnRepaired(%game, %obj, %objName)
{
	if (%game.testValidRepair(%obj))	
	{		
	   %repairman = %obj.repairedBy;
	   messageTeam(%repairman.team, 'msgSensorRepaired', '\c0%1 repaired the %2 Pulse Sensor!', %repairman.name, %obj.nameTag);
	}
}

function CnHGame::turretOnRepaired(%game, %obj, %objName)
{																												 
	if (%game.testValidRepair(%obj))	
	{		
	   %repairman = %obj.repairedBy;
	   messageTeam(%repairman.team, 'msgTurretRepaired', '\c0%1 repaired the %2 Turret!', %repairman.name, %obj.nameTag);
	}
}

function CnHGame::vStationOnRepaired(%game, %obj, %objName)
{
	if (%game.testValidRepair(%obj))	
	{		
	   %repairman = %obj.repairedBy;
	   messageTeam(%repairman.team, 'msgTurretRepaired', '\c0%1 repaired the %2 Vehicle Station!', %repairman.name, %obj.nameTag);
	}
}

function CnHGame::startTimerPlayerFFCap(%game, %cl, %this)
{
	cancel(%this.pCapThread); //stop the last owner from collecting a cap bonus
	%this.pCapThread = %game.schedule(%game.TIME_REQ_PLYR_CAP_BONUS, "awardScorePlayerFFCap", %cl, %this);
	cancel(%this.tCapThread); //stop the old owners from collecting any cap bonus
	cancel(%this.tHoldThread); //stop the old owners from collecting any hold bonus
	%this.tCapThread = %game.schedule(%game.TIME_REQ_TEAM_CAP_BONUS, "awardScoreTeamFFCap", %cl.team, %this);
}

function CnHGame::startTimerTeamFFCap(%game, %team, %this, %time)
{
	%this.tCapThread = %game.schedule(%time, "awardScoreTeamFFCap", %team, %this);
}

//------------------------------------------------------------------------

function CnHGame::resetScore(%game, %client)
{
	%client.offenseScore = 0;
	%client.kills = 0;
	%client.deaths = 0;
   %client.suicides = 0;
	%client.teamKills = 0;
	%client.flipFlopsCapped = 0;

	
	%client.defenseScore = 0;
	%client.turretKills = 0;
	%client.flipFlopDefends = 0;

	%client.score = 0;

	for ( %team = 1; %team <= %game.numTeams; %team++ )
		if($TeamScore[%team] != 0)
			$TeamScore[%team] = 0;
}

function CnHGame::applyConcussion(%game, %player)
{
}
