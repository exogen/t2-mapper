//-------------------------------------------------------------------
// Team Rabbit script
// -------------------------------------------------------------------

//--- GAME RULES BEGIN ---
//Grab the flag
//Run like crazy
//EVERYONE tries to kill the person with the flag (the Rabbit)
//The longer the Rabbit keeps the flag, the more points he scores
//--- GAME RULES END ---

package RabbitGame {

function Flag::objectiveInit(%data, %flag)
{
   $flagStatus = "<At Home>";
   %flag.carrier = "";
   %flag.originalPosition = %flag.getTransform();  
   %flag.isHome = true;

   // create a waypoint to the flag's starting place
   %flagWaypoint = new WayPoint()
   {
      position = %flag.position;
      rotation = "1 0 0 0";
      name = "Flag Home";
      dataBlock = "WayPointMarker";
      team = $NonRabbitTeam;
   };

   $AIRabbitFlag = %flag;

   MissionCleanup.add(%flagWaypoint);
}

};

//exec the AI scripts
exec("scripts/aiRabbit.cs");

$InvBanList[Rabbit, "TurretOutdoorDeployable"] = 1;
$InvBanList[Rabbit, "TurretIndoorDeployable"] = 1;
$InvBanList[Rabbit, "ElfBarrelPack"] = 1;
$InvBanList[Rabbit, "MortarBarrelPack"] = 1;
$InvBanList[Rabbit, "PlasmaBarrelPack"] = 1;
$InvBanList[Rabbit, "AABarrelPack"] = 1;
$InvBanList[Rabbit, "MissileBarrelPack"] = 1;
$InvBanList[Rabbit, "MissileLauncher"] = 1;
$InvBanList[Rabbit, "Mortar"] = 1;
$InvBanList[Rabbit, "Mine"] = 1;

function RabbitGame::setUpTeams(%game)
{
   // Force the numTeams variable to one:
   DefaultGame::setUpTeams(%game);
   %game.numTeams = 1;
   setSensorGroupCount(3);

   //team damage should always be off for Rabbit
   $teamDamage = 0;

   //make all the sensor groups visible at all times
   if (!Game.teamMode)
   {
      setSensorGroupAlwaysVisMask($NonRabbitTeam, 0xffffffff);
      setSensorGroupAlwaysVisMask($RabbitTeam, 0xffffffff);

      // non-rabbits can listen to the rabbit: all others can only listen to self
      setSensorGroupListenMask($NonRabbitTeam, (1 << $RabbitTeam) | (1 << $NonRabbitTeam));
   }
}

function RabbitGame::initGameVars(%game)
{
   %game.playerBonusValue = 1;
   %game.playerBonusTime = 3 * 1000; //3 seconds

   %game.teamBonusValue = 1;
   %game.teamBonusTime = 15 * 1000; //15 seconds
   %game.flagReturnTime = 45 * 1000;  //45 seconds 

   %game.waypointFrequency = 24000;
   %game.waypointDuration = 6000;
}

$RabbitTeam = 2;
$NonRabbitTeam = 1;

// ----- These functions supercede those in DefaultGame.cs

function RabbitGame::allowsProtectedStatics(%game)
{
   return true;
}

function RabbitGame::clientMissionDropReady(%game, %client)
{
   messageClient(%client, 'MsgClientReady', "", %game.class);
   messageClient(%client, 'MsgYourScoreIs', "", 0);
   //messageClient(%client, 'MsgYourRankIs', "", -1);
   messageClient(%client, 'MsgRabbitFlagStatus', "", $flagStatus);
   
   messageClient(%client, 'MsgMissionDropInfo', '\c0You are in mission %1 (%2).', $MissionDisplayName, $MissionTypeDisplayName, $ServerName ); 

   DefaultGame::clientMissionDropReady(%game,%client);
}

function RabbitGame::AIHasJoined(%game, %client)
{
   //let everyone know the player has joined the game
   //messageAllExcept(%client, -1, 'MsgClientJoinTeam', '%1 has joined the hunt.', %client.name, "", %client, $NonRabbitTeam);
}

function RabbitGame::clientJoinTeam( %game, %client, %team, %respawn )
{
   %game.assignClientTeam( %client );
   
   // Spawn the player:
   %game.spawnPlayer( %client, %respawn );
}


function RabbitGame::assignClientTeam(%game, %client)
{
   // all players start on team 1
   %client.team = $NonRabbitTeam;

   // set player's skin pref here
   setTargetSkin(%client.target, %client.skin);

   // Let everybody know you are no longer an observer:
   messageAll( 'MsgClientJoinTeam', '\c1%1 has joined the hunt.', %client.name, "", %client, %client.team );
   updateCanListenState( %client );
}

function RabbitGame::playerSpawned(%game, %player)
{
   //call the default stuff first...
   DefaultGame::playerSpawned(%game, %player);

   //find the rabbit
   %clRabbit = -1;
   for (%i = 0; %i < ClientGroup.getCount(); %i++)
   {
      %cl = ClientGroup.getObject(%i);
      if (isObject(%cl.player) && isObject(%cl.player.holdingFlag))
      {
         %clRabbit = %cl;
         break;
      }
   }

   //now set a waypoint just for that client...
   cancel(%player.client.waypointSchedule);
   if (isObject(%clRabbit) && !%player.client.isAIControlled())
      %player.client.waypointSchedule = %game.showRabbitWaypointClient(%clRabbit, %player.client);
}

function RabbitGame::pickPlayerSpawn(%game, %client, %respawn)
{
   // all spawns come from team 1
   return %game.pickTeamSpawn($NonRabbitTeam);
}

function RabbitGame::createPlayer(%game, %client, %spawnLoc, %respawn)
{
   %client.team = $NonRabbitTeam;
   DefaultGame::createPlayer(%game, %client, %spawnLoc, %respawn);
}

function RabbitGame::recalcScore(%game, %client)
{
   //score is grabs + kills + (totalTime / 15 seconds);
   %timeHoldingFlagMS = %client.flagTimeMS;
   if (isObject(%client.player.holdingFlag))
      %timeHoldingFlagMS += getSimTime() - %client.startTime;
   %client.score = %client.flagGrabs + %client.kills + mFloor(%timeHoldingFlagMS / 15000);
   messageClient(%client, 'MsgYourScoreIs', "", %client.score);
   %game.recalcTeamRanks(%client);
   %game.checkScoreLimit(%client);
}

function RabbitGame::onClientDamaged(%game, %clVictim, %clAttacker, %damageType, %sourceObject)
{
   //if the victim is the rabbit, and the attacker is not the rabbit, set the damage time...
   if (isObject(%clAttacker) && %clAttacker != %clVictim)
   {
      if (%clVictim.team == $RabbitTeam)
         %game.rabbitDamageTime = getSimTime();
   }

   //call the default
   DefaultGame::onClientDamaged(%game, %clVictim, %clAttacker, %damageType, %sourceObject);
}

function RabbitGame::onClientKilled(%game, %clVictim, %clKiller, %damageType, %implement, %damageLoc)
{
   //see if the killer was the rabbit and the victim was someone else...
   if (isObject(%clKiller) && (%clKiller != %clVictim) && (%clKiller.team == $RabbitTeam))
   {
      %clKiller.kills++;
      %game.recalcScore(%clKiller);
   }

   DefaultGame::onClientKilled(%game, %clVictim, %clKiller, %damageType, %implement, %damageLoc);
}

function RabbitGame::playerDroppedFlag(%game, %player)
{
   //set the flag status
   %flag = %player.holdingFlag;
   %player.holdingFlag = "";
   %flag.carrier = "";
   $flagStatus = "<In the Field>";

   %player.unmountImage($FlagSlot);
   %flag.hide(false);

   //hide the rabbit waypoint
   cancel(%game.waypointSchedule);
   %game.hideRabbitWaypoint(%player.client);

   //set the client status
   %player.client.flagTimeMS += getSimTime() - %player.client.startTime;
   %player.client.team = $NonRabbitTeam;
   %player.client.setSensorGroup($NonRabbitTeam);
   setTargetSensorGroup(%player.getTarget(), $NonRabbitTeam);

   messageAllExcept(%player.client, -1, 'MsgRabbitFlagDropped', '\c2%1 dropped the flag!~wfx/misc/flag_drop.wav', %player.client.name);
   // if the player left the mission area, he's already been notified
   if(!%player.outArea)
      messageClient(%player.client, 'MsgRabbitFlagDropped', '\c2You dropped the flag!~wfx/misc/flag_drop.wav');
   logEcho(%player.client.nameBase@" (pl "@%player@"/cl "@%player.client@") dropped flag");

   %flag.returnThread = %game.schedule(%game.flagReturnTime, "returnFlag", %flag);
}

function RabbitGame::playerTouchFlag(%game, %player, %flag)
{
   if ((%flag.carrier $= "") && (%player.getState() !$= "Dead"))
   {
      %player.client.startTime = getSimTime();
      %player.holdingFlag = %flag;
      %flag.carrier = %player;       
      %player.mountImage(FlagImage, $FlagSlot, true); //, $teamSkin[$RabbitTeam]);
      cancel(%flag.returnThread);
      %flag.hide(true);
      %flag.isHome = false;
      $flagStatus = %client.name;
      messageAll('MsgRabbitFlagTaken', '\c2%1 has taken the flag!~wfx/misc/flag_snatch.wav', %player.client.name);
      logEcho(%player.client.nameBase@" (pl "@%player@"/cl "@%player.client@") took flag");
      %player.client.team = $RabbitTeam;
      %player.client.setSensorGroup($RabbitTeam);
      setTargetSensorGroup(%player.getTarget(), $RabbitTeam);

      //increase the score
      %player.client.flagGrabs++;
      %game.recalcScore(%player.client);
      %game.schedule(5000, "RabbitFlagCheck", %player);

      //show the rabbit waypoint
      %game.rabbitDamageTime = 0;
      cancel(%game.waypointSchedule);
      %game.showRabbitWaypoint(%player.client);
   }
}

function RabbitGame::rabbitFlagCheck(%game, %player)
{
   // this function calculates the score for the rabbit. It must be done periodically
   // since the rabbit's score is based on how long the flag has been in possession.
   if((%player.holdingFlag != 0) && (%player.getState() !$= "Dead"))
   {
      %game.recalcScore(%player.client);
      //reschedule this flagcheck for 5 seconds
      %game.schedule(5000, "RabbitFlagCheck", %player);
   }
}

function RabbitGame::returnFlag(%game, %flag)
{
   messageAll('MsgRabbitFlagReturned', '\c2The flag was returned to its starting point.~wfx/misc/flag_return.wav');
   logEcho("flag return (timeout)");
   %game.resetFlag(%flag);
}

function RabbitGame::resetFlag(%game, %flag)
{
   %flag.setVelocity("0 0 0");
   %flag.setTransform(%flag.originalPosition);
   %flag.isHome = true;
   %flag.carrier = "";
   $flagStatus = "<At Home>";
   %flag.hide(false);
}

// ----- These functions are native to Rabbit

function RabbitGame::timeLimitReached(%game)
{
   logEcho("game over (timelimit)");
   %game.gameOver();
   cycleMissions();
}

function RabbitGame::scoreLimitReached(%game)
{
   logEcho("game over (scorelimit)");
   %game.gameOver();
   cycleMissions();
}

function RabbitGame::checkScoreLimit(%game, %client)
{
   %scoreLimit = MissionGroup.Rabbit_scoreLimit;
   // default of 1200 if scoreLimit not defined  (that's 1200 seconds worth - 20 minutes)
   if(%scoreLimit $= "")
      %scoreLimit = 1200;
   if(%client.score >= %scoreLimit) 
      %game.scoreLimitReached();
}

function RabbitGame::gameOver(%game)
{
   //call the default
   DefaultGame::gameOver(%game);

   //send the message
   messageAll('MsgGameOver', "Match has ended.~wvoice/announcer/ann.gameover.wav" );

   cancel(%game.rabbitWaypointThread);
   messageAll('MsgClearObjHud', "");
   for(%i = 0; %i < ClientGroup.getCount(); %i++)
   {
      %client = ClientGroup.getObject(%i);
      %game.resetScore(%client);
      cancel(%client.waypointSchedule);
   }

   cancel(%game.waypointSchedule);
}

function RabbitGame::resetScore(%game, %client)
{
   %client.score = 0;
   %client.kills = 0;
   %client.deaths = 0;
   %client.suicides = 0;
   %client.flagGrabs = 0;
   %client.flagTimeMS = 0;
}

function RabbitGame::enterMissionArea(%game, %playerData, %player)
{
   %player.client.outOfBounds = false; 
   messageClient(%player.client, 'EnterMissionArea', '\c1You are back in the mission area.');
   logEcho(%player.client.nameBase@" (pl "@%player@"/cl "@%player.client@") entered mission area");
   cancel(%player.alertThread);
}

function RabbitGame::leaveMissionArea(%game, %playerData, %player)
{
   if(%player.getState() $= "Dead")
      return;
   
   %player.client.outOfBounds = true;
   if (%player.client.team == $RabbitTeam)
      messageClient(%player.client, 'LeaveMissionArea', '\c1You have left the mission area. Return or take damage.~wfx/misc/warning_beep.wav');
   else
      messageClient(%player.client, 'LeaveMissionArea', '\c1You have left the mission area.~wfx/misc/warning_beep.wav');
   logEcho(%player.client.nameBase@" (pl "@%player@"/cl "@%player.client@") left mission area");
   %player.alertThread = %game.schedule(1000, "AlertPlayer", 3, %player);
}

function RabbitGame::AlertPlayer(%game, %count, %player)
{
   if (%player.client.team == $RabbitTeam)
   {
      if(%count > 1)
         %player.alertThread = %game.schedule(1000, "AlertPlayer", %count - 1, %player);
      else 
         %player.alertThread = %game.schedule(1000, "MissionAreaDamage", %player);
   }

   //keep the thread going for non rabbits, but give the new rabbit time to return to the mission area...
   else
      %player.alertThread = %game.schedule(1000, "AlertPlayer", 3, %player);
}

function RabbitGame::MissionAreaDamage(%game, %player)
{
   if(%player.getState() !$= "Dead") {                                   
      %player.setDamageFlash(0.1);
		%damageRate = 0.05;
		%pack = %player.getMountedImage($BackpackSlot);
		if(%pack.getName() $= "RepairPackImage")
			if(%player.getMountedImage($WeaponSlot).getName() $= "RepairGunImage")
				%damageRate = 0.15;
      %prevHurt = %player.getDamageLevel();
      %player.setDamageLevel(%prevHurt + %damageRate);
      // a little redundancy to see if the lastest damage killed the player
      if(%player.getState() $= "Dead")
         %game.onClientKilled(%player.client, 0, $DamageType::OutOfBounds);
      else
         %player.alertThread = %game.schedule(1000, "MissionAreaDamage", %player);
   }
   else  
   {
      %game.onClientKilled(%player.client, 0, $DamageType::OutOfBounds);
   }  
}

function RabbitGame::dropFlag(%game, %player)
{
   //you can no longer throw the flag in Rabbit...
}

function RabbitGame::updateScoreHud(%game, %client, %tag)
{
   //tricky stuff here...  use two columns if we have more than 15 clients...
   %numClients = $TeamRank[0, count];
   if ( %numClients > $ScoreHudMaxVisible )
      %numColumns = 2;

   // Clear the header:
   messageClient( %client, 'SetScoreHudHeader', "", "" );

   // Send subheader:
   if (%numColumns == 2)
      messageClient(%client, 'SetScoreHudSubheader', "", '<tab:5,155,225,305,455,525>\tPLAYER\tSCORE\tTIME\tPLAYER\tSCORE\tTIME');
   else
      messageClient(%client, 'SetScoreHudSubheader', "", '<tab:15,235,335>\tPLAYER\tSCORE\tTIME');

   //recalc the score for whoever is holding the flag
   if (isObject($AIRabbitFlag.carrier))
      %game.recalcScore($AIRabbitFlag.carrier.client);

   %countMax = %numClients;
   if ( %countMax > ( 2 * $ScoreHudMaxVisible ) )
   {
      if ( %countMax & 1 )
         %countMax++;
      %countMax = %countMax / 2;
   }
   else if ( %countMax > $ScoreHudMaxVisible )
      %countMax = $ScoreHudMaxVisible;

   for (%index = 0; %index < %countMax; %index++)
   {
      //get the client info
      %col1Client = $TeamRank[0, %index];
      %col1ClientScore = %col1Client.score $= "" ? 0 : %col1Client.score;
      %col1Style = "";

      if (isObject(%col1Client.player.holdingFlag))
      {
         %col1ClientTimeMS = %col1Client.flagTimeMS + getSimTime() - %col1Client.startTime;
         %col1Style = "<color:00dc00>";
      }
      else
      {
         %col1ClientTimeMS = %col1Client.flagTimeMS;
         if ( %col1Client == %client )
            %col1Style = "<color:dcdcdc>";
      }

      if (%col1ClientTimeMS <= 0)
         %col1ClientTime = "";
      else
      {
         %minutes = mFloor(%col1ClientTimeMS / (60 * 1000));
         if (%minutes <= 0)
            %minutes = "0";
         %seconds = mFloor(%col1ClientTimeMS / 1000) % 60;
         if (%seconds < 10)
            %seconds = "0" @ %seconds;

         %col1ClientTime = %minutes @ ":" @ %seconds;
      }

      //see if we have two columns
      if (%numColumns == 2)
      {
         %col2Client = "";
         %col2ClientScore = "";
         %col2ClientTime = "";
         %col2Style = "";

         //get the column 2 client info
         %col2Index = %index + %countMax;
         if (%col2Index < %numClients)
         {
            %col2Client = $TeamRank[0, %col2Index];
            %col2ClientScore = %col2Client.score $= "" ? 0 : %col2Client.score;

            if (isObject(%col2Client.player.holdingFlag))
            {
               %col2ClientTimeMS = %col2Client.flagTimeMS + getSimTime() - %col2Client.startTime;
               %col2Style = "<color:00dc00>";
            }
            else
            {
               %col2ClientTimeMS = %col2Client.flagTimeMS;
               if ( %col2Client == %client )
                  %col2Style = "<color:dcdcdc>";
            }

            if (%col2ClientTimeMS <= 0)
               %col2ClientTime = "";
            else
            {
               %minutes = mFloor(%col2ClientTimeMS / (60 * 1000));
               if (%minutes <= 0)
                  %minutes = "0";
               %seconds = mFloor(%col2ClientTimeMS / 1000) % 60;
               if (%seconds < 10)
                  %seconds = "0" @ %seconds;

               %col2ClientTime = %minutes @ ":" @ %seconds;
            }
         }
      }

      //if the client is not an observer, send the message
      if (%client.team != 0)
      {
         if ( %numColumns == 2 )
            messageClient( %client, 'SetLineHud', "", %tag, %index, '<tab:10><spush>%7\t<clip:150>%1</clip><rmargin:205><just:right>%2<rmargin:270><just:right>%3<spop><rmargin:505><lmargin:310>%8<just:left>%4<rmargin:505><just:right>%5<rmargin:570><just:right>%6', 
                  %col1Client.name, %col1ClientScore, %col1ClientTime, %col2Client.name, %col2ClientScore, %col2ClientTime, %col1Style, %col2Style );
         else
            messageClient( %client, 'SetLineHud', "", %tag, %index, '<tab:20>%4\t<clip:200>%1</clip><rmargin:280><just:right>%2<rmargin:375><just:right>%3', 
                  %col1Client.name, %col1ClientScore, %col1ClientTime, %col1Style );
      }
      //else for observers, create an anchor around the player name so they can be observed
      else
      {
         if ( %numColumns == 2 )
         {
            //this is really crappy, but I need to save 1 tag - can only pass in up to %9, %10 doesn't work...
            if (%col2Style $= "<color:00dc00>")
            {
               messageClient( %client, 'SetLineHud', "", %tag, %index, '<tab:10><spush>%7\t<clip:150><a:gamelink\t%8>%1</a></clip><rmargin:205><just:right>%2<rmargin:270><just:right>%3<spop><rmargin:505><lmargin:310><color:00dc00><just:left><clip:150><a:gamelink\t%9>%4</a></clip><rmargin:505><just:right>%5<rmargin:570><just:right>%6', 
                              %col1Client.name, %col1ClientScore, %col1ClientTime,
                              %col2Client.name, %col2ClientScore, %col2ClientTime,
                              %col1Style, %col1Client, %col2Client );
            }
            else if (%col2Style $= "<color:dcdcdc>")
            {
               messageClient( %client, 'SetLineHud', "", %tag, %index, '<tab:10><spush>%7\t<clip:150><a:gamelink\t%8>%1</a></clip><rmargin:205><just:right>%2<rmargin:270><just:right>%3<spop><rmargin:505><lmargin:310><color:dcdcdc><just:left><clip:150><a:gamelink\t%9>%4</a></clip><rmargin:505><just:right>%5<rmargin:570><just:right>%6', 
                              %col1Client.name, %col1ClientScore, %col1ClientTime,
                              %col2Client.name, %col2ClientScore, %col2ClientTime,
                              %col1Style, %col1Client, %col2Client );
            }
            else
            {
               messageClient( %client, 'SetLineHud', "", %tag, %index, '<tab:10><spush>%7\t<clip:150><a:gamelink\t%8>%1</a></clip><rmargin:205><just:right>%2<rmargin:270><just:right>%3<spop><rmargin:505><lmargin:310><just:left><clip:150><a:gamelink\t%9>%4</a></clip><rmargin:505><just:right>%5<rmargin:570><just:right>%6', 
                              %col1Client.name, %col1ClientScore, %col1ClientTime,
                              %col2Client.name, %col2ClientScore, %col2ClientTime,
                              %col1Style, %col1Client, %col2Client );
            }
         }
         else
            messageClient( %client, 'SetLineHud', "", %tag, %index, '<tab:20>%4\t<clip:200><a:gamelink\t%5>%1</a></clip><rmargin:280><just:right>%2<rmargin:375><just:right>%3', 
                  %col1Client.name, %col1ClientScore, %col1ClientTime, %col1Style, %col1Client );
      }
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

function RabbitGame::showRabbitWaypointClient(%game, %clRabbit, %client)
{
   //make sure we have a rabbit
   if (!isObject(%clRabbit) || !isObject(%clRabbit.player) || !isObject(%clRabbit.player.holdingFlag))
      return;

   //no waypoints for bots
   if (%client.isAIControlled())
      return;

   //scope the client, then set the always vis mask...
   %clRabbit.player.scopeToClient(%client);
   %visMask = getSensorGroupAlwaysVisMask(%clRabbit.getSensorGroup());
   %visMask |= (1 << %client.getSensorGroup());
   setSensorGroupAlwaysVisMask(%clRabbit.getSensorGroup(), %visMask);

   //now issue a command to kill the target
   %client.setTargetId(%clRabbit.target);
   commandToClient(%client, 'TaskInfo', %client, -1, false, "Kill the Rabbit!");
   %client.sendTargetTo(%client, true);

   //send the "waypoint is here sound"
   messageClient(%client, 'MsgRabbitWaypoint', '~wfx/misc/target_waypoint.wav');

   //and hide the waypoint
   %client.waypointSchedule = %game.schedule(%game.waypointDuration, "hideRabbitWaypointClient", %clRabbit, %client);
}

function RabbitGame::hideRabbitWaypointClient(%game, %clRabbit, %client)
{
   //no waypoints for bots
   if (%client.isAIControlled())
      return;

   //unset the always vis mask...
   %visMask = getSensorGroupAlwaysVisMask(%clRabbit.getSensorGroup());
   %visMask &= ~(1 << %client.getSensorGroup());
   setSensorGroupAlwaysVisMask(%clRabbit.getSensorGroup(), %visMask);

   //kill the actually task...
   removeClientTargetType(%client, "AssignedTask");
}

function RabbitGame::showRabbitWaypoint(%game, %clRabbit)
{
   //make sure we have a rabbit
   if (!isObject(%clRabbit) || !isObject(%clRabbit.player) || !isObject(%clRabbit.player.holdingFlag))
      return;

   //only show the rabbit waypoint if the rabbit hasn't been damaged within the frequency period
   if (getSimTime() - %game.rabbitDamageTime < %game.waypointFrequency)
   {
      %game.waypointSchedule = %game.schedule(%game.waypointFrequency, "showRabbitWaypoint", %clRabbit);
      return;
   }

   //loop through all the clients and flash a waypoint at the rabbits position
   for (%i = 0; %i < ClientGroup.getCount(); %i++)
   {
      %cl = ClientGroup.getObject(%i);
      if (%cl.isAIControlled() || %cl == %clRabbit)
         continue;

      //scope the client, then set the always vis mask...
      %clRabbit.player.scopeToClient(%cl);
      %visMask = getSensorGroupAlwaysVisMask(%clRabbit.getSensorGroup());
      %visMask |= (1 << %cl.getSensorGroup());
      setSensorGroupAlwaysVisMask(%clRabbit.getSensorGroup(), %visMask);

      //now issue a command to kill the target
      %cl.setTargetId(%clRabbit.target);
      commandToClient(%cl, 'TaskInfo', %cl, -1, false, "Kill the Rabbit!");
      %cl.sendTargetTo(%cl, true);

      //send the "waypoint is here sound"
      messageClient(%cl, 'MsgRabbitWaypoint', '~wfx/misc/target_waypoint.wav');
   }

   //schedule the time to hide the waypoint
   %game.waypointSchedule = %game.schedule(%game.waypointDuration, "hideRabbitWaypoint", %clRabbit);
}

function RabbitGame::hideRabbitWaypoint(%game, %clRabbit)
{
   //make sure we have a valid client
   if (!isObject(%clRabbit))
      return;

   //loop through all the clients and hide the waypoint
   for (%i = 0; %i < ClientGroup.getCount(); %i++)
   {
      %cl = ClientGroup.getObject(%i);
      if (%cl.isAIControlled())
         continue;

      //unset the always vis mask...
      %visMask = getSensorGroupAlwaysVisMask(%clRabbit.getSensorGroup());
      %visMask &= ~(1 << %cl.getSensorGroup());
      setSensorGroupAlwaysVisMask(%clRabbit.getSensorGroup(), %visMask);

      //kill the actually task...
      removeClientTargetType(%cl, "AssignedTask");
   }

   //make sure we have a rabbit before scheduling the next showRabbitWaypoint...
   if (isObject(%clRabbit.player) && isObject(%clRabbit.player.holdingFlag))
      %game.waypointSchedule = %game.schedule(%game.waypointFrequency, "showRabbitWaypoint", %clRabbit);
}

function RabbitGame::updateKillScores(%game, %clVictim, %clKiller, %damageType, %implement)
{
   if(%game.testTurretKill(%implement))   //check for turretkill before awarded a non client points for a kill
        %game.awardScoreTurretKill(%clVictim, %implement);  
   else if (%game.testKill(%clVictim, %clKiller)) //verify victim was an enemy
   {
     %game.awardScoreKill(%clKiller);
     %game.awardScoreDeath(%clVictim);          
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

function RabbitGame::applyConcussion(%game, %player)
{
   // MES -- this won't do anything, the function RabbitGame::dropFlag is empty
   %game.dropFlag( %player );
}

