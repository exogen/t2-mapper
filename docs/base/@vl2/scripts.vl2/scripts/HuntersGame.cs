//--------------------------------------//
// HuntersGame.cs                       //
//--------------------------------------//

//--- GAME RULES BEGIN ---
//Kill other players to make them drop flags
//Return flags to the Nexus for points
//The more flags brought to Nexus at one time, the more each flag scores
//GREED mode: you must return 8 or more flags at once to score
//HOARD mode: no returns between 5 and 2 min. left in game
//Flag Colors: Red = 1pt, Blue = 2pts, Yellow = 4pts, Green = 8pts
//--- GAME RULES END ---

package HuntersGame {

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

$InvBanList[Hunters, "TurretOutdoorDeployable"] = 1;
$InvBanList[Hunters, "TurretIndoorDeployable"] = 1;
$InvBanList[Hunters, "ElfBarrelPack"] = 1;
$InvBanList[Hunters, "MortarBarrelPack"] = 1;
$InvBanList[Hunters, "PlasmaBarrelPack"] = 1;
$InvBanList[Hunters, "AABarrelPack"] = 1;
$InvBanList[Hunters, "MissileBarrelPack"] = 1;
$InvBanList[Hunters, "Mine"] = 1;

datablock EffectProfile(HuntersFlagPickupEffect)
{
   effectname = "misc/hunters_flag_snatch";
   minDistance = 2.5;
   maxDistance = 5.0;
};

datablock AudioProfile(HuntersFlagPickupSound)
{
   filename    = "fx/misc/hunters_flag_snatch.wav";
   description = AudioClose3d;
   effect      = HuntersFlagPickupEffect;
   preload     = true;
};


//exec the AI script
exec("scripts/aiHunters.cs");

//exec the records script
if (isFile("prefs/HuntersRecords.cs"))
   exec("prefs/HuntersRecords.cs");

//-----------------------------------------------------------------------------
//Game initialization functions

function HuntersGame::setUpTeams(%game)
{
   // Force the numTeams variable to one:
   DefaultGame::setUpTeams(%game);
   %game.numTeams = 1;

   // allow teams 1->31 to listen to each other (team 0 can only listen to self)
   for(%i = 1; %i < 32; %i++)
      setSensorGroupListenMask(%i, 0xfffffffe);
}

function HuntersGame::initGameVars(%game)
{
   %game.SCORE_PER_SUICIDE = -1; 
   %game.SCORE_PER_DEATH = 0;
   %game.SCORE_PER_KILL = 1;

   %game.teamMode = false;

   if (!isDemo())
      %game.greedMode = $Host::HuntersGreedMode;
   else
      %game.greedMode = false;
   %game.greedMinFlags = 8;   //min number of flags you must have before you can cap

   if (!isDemo())
      %game.hoardMode = $Host::HuntersHoardMode;
   else
      %game.hoardMode = false;
   %game.HoardStartTime = 5;  //time left in the game at which hoard mode will start
   %game.HoardDuration = 3;   //duration of the hoard period
   %game.HoardEndTime = %game.HoardStartTime - %game.HoardDuration;

   %game.yardSaleMin = 10;

   //make sure there is enough time in the match to actually have a hoard mode...
   if ($host::timeLimit < %game.hoardStartTime + 1)
      %game.hoardMode = false;

   %game.maxSensorGroup = 0;

   %game.highestFlagReturnCount = 10;  //initialize to 10 - don't bother recording less than that...
   %game.highestFlagReturnName = "";
   %game.greedFlagCount = 10;  //initialize to 10 - don't bother recording greed less than that...
   %game.greedFlagName = "";

   //this is how many humans have to be playing in order to set a record
   %game.numHumansForRecord = 4;

   //this is how many milliseconds before a warning is issued for camping near the Nexus
   %game.nexusCampingTime = 10000;

   %game.flagHoarder = "";
   %game.flagHoarderMin = 15;

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

function HuntersGame::allowsProtectedStatics(%game)
{
   return true;
}

function HuntersGame::missionLoadDone(%game)
{
   //default version sets up teams - must be called first...
   DefaultGame::missionLoadDone(%game);

   //initialize the score and flag count for all the players
   %count = ClientGroup.getCount();
   for(%i = 0; %i < %count; %i++)
   {
      %client = ClientGroup.getObject(%i);
      %game.resetScore(%client);
      %client.flagCount = 1;
      %client.trackWaypoint = "";
      %client.playerTrackLine = -1;
   }
   $TopClient = -1;
   $TopClientScore = 0;

   //create the Flag group
   $FlagGroup = nameToID("MissionCleanup/FlagGroup");
   if ($FlagGroup <= 0)
   {
      $FlagGroup = new SimGroup("FlagGroup");
      MissionCleanup.add($FlagGroup);
   }

   //create the "yard sale waypoint set"
   if(nameToId("HuntersYardSaleSet") <= 0)
   {
      $HuntersYardSaleSet = new SimSet("HuntersYardSaleSet");
      MissionCleanup.add($HuntersYardSaleSet);
   }
}


function HuntersGame::startMatch(%game)
{
   //call the default
   DefaultGame::startMatch(%game);

   //schedule the hoard countdowns
   %game.setupHoardCountdown();
}

function HuntersGame::setupHoardCountdown(%game)
{
   //delete all previous scheduled calls...
   cancel(%game.hoardStart30);
   cancel(%game.hoardStart10);
   cancel(%game.hoardStart5);
   cancel(%game.hoardStart4);
   cancel(%game.hoardStart3);
   cancel(%game.hoardStart2);
   cancel(%game.hoardStart1);
   cancel(%game.hoardStart0);

   cancel(%game.hoardEnd30);
   cancel(%game.hoardEnd10);
   cancel(%game.hoardEnd5);
   cancel(%game.hoardEnd4);
   cancel(%game.hoardEnd3);
   cancel(%game.hoardEnd2);
   cancel(%game.hoardEnd1);
   cancel(%game.hoardEnd0);

   //schedule hoard mode start notify calls
   %curTimeLeftMS = ($Host::TimeLimit * 60 * 1000) + $missionStartTime - getSimTime();
   %hoardStartTimeMS = %game.HoardStartTime * 60 * 1000;

   if (%curTimeLeftMS >= %hoardStartTimeMS + 30000)
      %game.hoardStart30 = %game.schedule(%curTimeLeftMS - (%hoardStartTimeMS + 30000), "notifyHoardStart", 30);

   if (%curTimeLeftMS >= %hoardStartTimeMS + 10000)
      %game.hoardStart10 = %game.schedule(%curTimeLeftMS - (%hoardStartTimeMS + 10000), "notifyHoardStart", 10);

   if (%curTimeLeftMS >= %hoardStartTimeMS + 5000)
      %game.hoardStart5 = %game.schedule(%curTimeLeftMS - (%hoardStartTimeMS + 5000), "notifyHoardStart", 5);

   if (%curTimeLeftMS >= %hoardStartTimeMS + 4000)
      %game.hoardStart4 = %game.schedule(%curTimeLeftMS - (%hoardStartTimeMS + 4000), "notifyHoardStart", 4);

   if (%curTimeLeftMS >= %hoardStartTimeMS + 3000)
      %game.hoardStart3 = %game.schedule(%curTimeLeftMS - (%hoardStartTimeMS + 3000), "notifyHoardStart", 3);

   if (%curTimeLeftMS >= %hoardStartTimeMS + 2000)
      %game.hoardStart2 = %game.schedule(%curTimeLeftMS - (%hoardStartTimeMS + 2000), "notifyHoardStart", 2);

   if (%curTimeLeftMS >= %hoardStartTimeMS + 1000)
      %game.hoardStart1 = %game.schedule(%curTimeLeftMS - (%hoardStartTimeMS + 1000), "notifyHoardStart", 1);

   if (%curTimeLeftMS >= %hoardStartTimeMS)
      %game.hoardStart0 = %game.schedule(%curTimeLeftMS - %hoardStartTimeMS, "notifyHoardStart", 0);

   
   //schedule hoard mode end notify calls
   %hoardEndTimeMS = %game.HoardEndTime * 60 * 1000;

   if (%curTimeLeftMS >= %hoardEndTimeMS + 30000)
      %game.hoardEnd30 = %game.schedule(%curTimeLeftMS - (%hoardEndTimeMS + 30000), "notifyHoardEnd", 30);

   if (%curTimeLeftMS >= %hoardEndTimeMS + 10000)
      %game.hoardEnd10 = %game.schedule(%curTimeLeftMS - (%hoardEndTimeMS + 10000), "notifyHoardEnd", 10);

   if (%curTimeLeftMS >= %hoardEndTimeMS + 5000)
      %game.hoardEnd5 = %game.schedule(%curTimeLeftMS - (%hoardEndTimeMS + 5000), "notifyHoardEnd", 5);

   if (%curTimeLeftMS >= %hoardEndTimeMS + 4000)
      %game.hoardEnd4 = %game.schedule(%curTimeLeftMS - (%hoardEndTimeMS + 4000), "notifyHoardEnd", 4);

   if (%curTimeLeftMS >= %hoardEndTimeMS + 3000)
      %game.hoardEnd3 = %game.schedule(%curTimeLeftMS - (%hoardEndTimeMS + 3000), "notifyHoardEnd", 3);

   if (%curTimeLeftMS >= %hoardEndTimeMS + 2000)
      %game.hoardEnd2 = %game.schedule(%curTimeLeftMS - (%hoardEndTimeMS + 2000), "notifyHoardEnd", 2);

   if (%curTimeLeftMS >= %hoardEndTimeMS + 1000)
      %game.hoardEnd1 = %game.schedule(%curTimeLeftMS - (%hoardEndTimeMS + 1000), "notifyHoardEnd", 1);

   if (%curTimeLeftMS >= %hoardEndTimeMS)
      %game.hoardEnd0 = %game.schedule(%curTimeLeftMS - %hoardEndTimeMS, "notifyHoardEnd", 0);
}

function HuntersGame::notifyHoardStart(%game, %seconds)
{
   if (%game.HoardMode)
   {
      if (%seconds > 1)
         messageAll('MsgHuntersHoardNotifyStart', '\c2%1 seconds left until the HOARD period begins.~wfx/misc/hunters_%1.wav', %seconds);
      else if (%seconds == 1)
         messageAll('MsgHuntersHoardNotifyStart', '\c21 second left until the HOARD period begins.~wfx/misc/hunters_1.wav');
      else
      {
         messageAll('MsgHuntHoardNotifyStarted', '\c2The HOARD period has begun.~wfx/misc/hunters_horde.wav');
         logEcho("hoard mode start");
         %game.setNexusDisabled();
         cancel(%game.greedNexusFlash);
      }
   }
}

function HuntersGame::notifyHoardEnd(%game, %seconds)
{
   if (%game.HoardMode)
   {
      if (%seconds > 1)
         messageAll('MsgHuntersHoardNotifyEnd', '\c2%1 seconds left until the HOARD period ends.~wfx/misc/hunters_%1.wav', %seconds);
      else if (%seconds == 1)
         messageAll('MsgHuntersHoardNotifyEnd', '\c21 second left until the HOARD period ends.~wfx/misc/hunters_1.wav');
      else
      {
         messageAll('MsgHuntersHoardNotifyEnded', '\c2The HOARD period has ended!~wfx/misc/hunters_greed.wav');
         logEcho("hoard mode end");
         %game.setNexusEnabled();
         cancel(%game.greedNexusFlash);
      }
   }
}

function HuntersGame::clientJoinTeam( %game, %client, %team, %respawn )
{
   %game.assignClientTeam( %client );
   
   // Spawn the player:
   %game.spawnPlayer( %client, %respawn );
}

//-----------------------------------------------------------------------------
//Player spawn/death functions

function HuntersGame::assignClientTeam(%game, %client)
{
   %client.team = 0;

   //initialize the team array
   for (%i = 1; %i < 32; %i++)
      $HuntersTeamArray[%i] = false;

   %game.maxSensorGroup = 0;
   %count = ClientGroup.getCount();
   for (%i = 0; %i < %count; %i++)
   {
      %cl = ClientGroup.getObject(%i);
      if (%cl.team != 0)
         $HuntersTeamArray[%cl.team] = true;

      //need to set the number of sensor groups to the max...
      if (%cl.team > %game.maxSensorGroup)
         %game.maxSensorGroup = %cl.team;
   }

   //now loop through the team array, looking for an empty team
   for (%i = 1; %i < 32; %i++)
   {
      if (! $HuntersTeamArray[%i])
      {
         %client.team = %i;

         if (%client.team > %game.maxSensorGroup)
            %game.maxSensorGroup = %client.team;

         break;
      }
   }

   // set player's skin pref here
   setTargetSkin(%client.target, %client.skin);

   // Let everybody know you are no longer an observer:
   messageAll( 'MsgClientJoinTeam', '\c1%1 has joined the hunt.', %client.name, "", %client, 1 );
   updateCanListenState( %client );

   //now set the max number of sensor groups...
   setSensorGroupCount(%game.maxSensorGroup + 1);
}

function HuntersGame::createPlayer(%game, %client, %spawnLoc, %respawn)
{
   //first call the default
   DefaultGame::createPlayer(%game, %client, %spawnLoc, %respawn);

   //now set the sensor group
   %client.setSensorGroup(%client.team);
}

function HuntersGame::pickPlayerSpawn(%game, %client, %respawn)
{
   return %game.pickTeamSpawn(1);
}

function HuntersGame::playerSpawned(%game, %player, %armor)
{
   //intialize
   %client = %player.client;
   %client.flagCount = 1;
   %client.isDead = false;

   //make sure they're not still taking camping damage...
   cancel(%client.campingThread);

   
   //continue with the default
   DefaultGame::playerSpawned(%game, %player, %armor);
}

function HuntersGame::onClientKilled(%game, %clVictim, %clKiller, %damageType, %implement, %damageLoc)
{
   //set the flag
   %clVictim.isDead = true;

   //set the greed variable if required
   if (!%game.teamMode && $missionRunning)
   {
      if (%clVictim.flagCount - 1 > %game.greedFlagCount)
      {
         %game.greedFlagCount = %clVictim.flagCount - 1;
         %game.greedFlagName = getTaggedString(%clVictim.name);
      }
   }
   
   //first, drop all the flags
   HuntersGame::dropFlag(%game, %clVictim.player);
   
   //now call the default game stuff
   DefaultGame::onClientKilled(%game, %clVictim, %clKiller, %damageType, %implement, %damageLoc); 

   messageClient(%clVictim, 'MsgHuntYouHaveFlags', "", 0);
}

function HuntersGame::updateKillScores(%game, %clVictim, %clKiller, %damageType, %implement)
{
   if (%game.testKill(%clVictim, %clKiller)) //verify victim was an enemy
   {
      %game.awardScoreKill(%clKiller);
      %game.awardScoreDeath(%clVictim);
   }       
   else if (%game.testSuicide(%clVictim, %clKiller, %damageType))  //otherwise test for suicide
      %game.awardScoreSuicide(%clVictim);     
}

function Huntersgame::awardScoreKill(%game, %client)
{
   //call the default
   DefaultGame::awardScoreKill(%game, %client);

   //check if we have a new leader
   if (!%game.teamMode && (%client.score > $TopClientScore))
   {
      $TopClientScore = %client.score;
      //this message is annoying!
      //if (%client != $TopClient)
      //   messageAll('MsgHuntNewTopScore', '\c0%1 has taken the lead with a score of %2!~wfx/misc/flag_capture.wav', %client.name, %client.score);
      $TopClient = %client;
   }
}

function Huntersgame::awardScoreSuicide(%game, %client)
{
   //call the default
   DefaultGame::awardScoreSuicide(%game, %client);

   //check if we have a new leader
   if (!%game.teamMode && %client == $TopClient && (%client.score < $TopClientScore))
   {
      //first lower the topClientScore var
      $TopClientScore = %client.score;

      //see if there's a new leader...
      %highestScore = %client.score;
      %highestScoreClient = -1;
      for (%i = 0; %i < ClientGroup.getCount(); %i++)
      {
         %cl = ClientGroup.getObject(%i);
         if (%cl.score > %highestScore)
         {
            %highestScore = %cl.score;
            %highestScoreClient = %cl;
         }
      }

      //did we find someone?
      if (%highestScoreClient > 0)
      {
         $TopClientScore = %highestScoreClient.score;
         $TopClient = %highestScoreClient;
         //this message is annoying...
         //messageAll('MsgHuntNewTopScore', '\c0%1 is now in the lead with a score of %2!~wfx/misc/flag_capture.wav', %highestScoreClient.name, %highestScoreClient.score);
      }
   }
}

function HuntersGame::equip(%game, %player)
{
   for(%i =0; %i<$InventoryHudCount; %i++)
      %player.client.setInventoryHudItem($InventoryHudData[%i, itemDataName], 0, 1);
   %player.client.clearBackpackIcon();

   //%player.setArmor("Light");
   %player.setInventory(RepairKit,1);
   %player.setInventory(Grenade,6);
   %player.setInventory(Blaster,1);
   %player.setInventory(Chaingun,1);
   %player.setInventory(ChaingunAmmo, 100);
   %player.setInventory(Disc,1);
   %player.setInventory(DiscAmmo, 20);
   %player.setInventory(EnergyPack,1);
   %player.setInventory(TargetingLaser, 1);
   %player.weaponCount = 3;

   %player.use("Disc");
}                  

//-----------------------------------------------------------------------------
//flag functions
function HuntersGame::playerDroppedFlag(%game, %player)
{
   // this stuff has all been moved to HuntersGame::dropFlag
   // we really don't want something to happen for *every* flag a player drops anyway
}

function HuntersStartFlagTimeOut(%flag)
{
   // start the fade out...
   %flag.startFade(Game.fadeTimeMS, 0, true);
   schedule(Game.fadeTimeMS, %flag, "HuntersEndFlagTimeOut", %flag);
}

function HuntersEndFlagTimeOut(%flag)
{
   %flag.delete();
}

function HuntersYardSaleTimeOut(%waypoint)
{
   %waypoint.delete();
}

function HuntersGame::updateFlagHoarder(%game, %eventClient)
{
   %hoarder = -1;
   %maxFlags = -1;
   %count = ClientGroup.getCount();
   for (%i = 0; %i < %count; %i++)
   {
      %client = ClientGroup.getObject(%i);
      if (%client.flagCount > %game.flagHoarderMin && %client.flagCount > %maxFlags)
      {
         %maxflags = %client.flagCount;
         %hoarder = %client;
      }
   }

   //if we found our hoarder, set the waypoint, otherwise, delete it
   if (%hoarder > 0)
   {
      //only update if the event (capping, picking up flag, etc...) was the actual hoarder
      if (!isObject(%game.flagHoarder) || %game.flagHoarder == %eventClient)
      {
         if (!isObject(%game.hoarderWaypoint))
         {
            //create a waypoint at player's location...
            %game.hoarderWaypoint = new WayPoint()
            {
               position = %hoarder.player.position;
               rotation = "1 0 0 0";
               scale = "1 1 1";
               name = "Flag Hoarder Was Here";
               dataBlock = "WayPointMarker";
               lockCount = "0";
               homingCount = "0";
               team = 0;
            };

            //add the waypoint to the cleanup group
            MissionCleanup.add(%game.hoarderWaypoint);
         }

         //set the position
         %game.flagHoarder = %hoarder;
         %game.hoarderWaypoint.setTransform(%hoarder.player.getWorldBoxCenter() SPC "0 0 1 0");
      }
   }
   else if (isObject(%game.hoarderWaypoint))
   {
      %game.flaghoarder = "";
      %game.hoarderWaypoint.delete();
   }
}

function HuntersGame::sendFlagCountMessage(%game, %client)
{
   //send the messages
   if (%client.flagCount - 1 == 1)
   {
      messageAllExcept(%client, -1, 'MsgHuntPlayerHasFlags', '\c2%1 now has 1 flag.', %client.name, 1);
      messageClient(%client, 'MsgHuntYouHaveFlags', '\c2You now have 1 flag.', %client.flagCount - 1);
   }
   else if (%client.flagCount - 1 > 1)
   {
      messageAllExcept(%client, -1, 'MsgHuntPlayerHasFlags', '\c2%1 now has %2 flags.', %client.name, %client.flagCount - 1);
      messageClient(%client, 'MsgHuntYouHaveFlags', '\c2You now have %1 flags.', %client.flagCount - 1);
   }
}

function HuntersGame::playerTouchFlag(%game, %player, %flag)
{
   //make sure the player is still alive
   %client = %player.client;
   if (%player.getState() !$= "Dead")
   {
      //increase the count bye the flag value
      %flagValue = %flag.value;
      %client.flagCount += %flagValue;
      
      //delete the flag
      %flag.delete();
      
      //if the client has 5 or more flags, mount an image
      if (%client.flagCount >= 5)
         %player.mountImage(HuntersFlagImage, $FlagSlot);

      //schedule an update message
      cancel(%client.flagMsgPending);
      %client.flagMsgPending = %game.schedule(%game.flagMsgDelayMS, "sendFlagCountMessage", %client);
      messageClient(%client, 'MsgHuntYouHaveFlags', "", %client.flagCount - 1);

      //update the log...
      logEcho(%client.nameBase@" (pl "@%player@"/cl "@%client@") has "@%client.flagCount-1@" flags");

      //play the sound pickup in 3D
      %player.playAudio(0, HuntersFlagPickupSound);

      //see if the client could set the record
      if (!%game.teamMode && !%client.couldSetRecord)
      {
         %numFlags = %client.flagCount - 1;
         if (%numFlags > 10 && %numFlags > $Host::HuntersRecords::Count[$currentMission])
         {
            //see if we have at least 4 non-AI players
            %humanCount = 0;
            %count = ClientGroup.getCount();
            for (%i = 0; %i < %count; %i++)
            {
               %cl = ClientGroup.getObject(%i);
               if (!%cl.isAIControlled())
                  %humanCount++;
               if (%humanCount >= %game.numHumansForRecord)
                  break;
            }

            if (%humanCount >= %game.numHumansForRecord)
            {
               %client.couldSetRecord = true;

               //send a message right away...
               if (isEventPending(%client.flagMsgPending))
               {
                  cancel(%client.flagMsgPending);
                  %game.sendFlagCountMessage(%client);
               }

               //send a message to everyone
               messageAllExcept(%client, -1, 'MsgHuntPlayerCouldSetRecord', '\c2%1 has enough flags to set the record for this mission!~wfx/misc/flag_return.wav');
               messageClient(%client, 'MsgHuntYouCouldSetRecord', '\c2You have enough flags to set the record for this mission!~wfx/misc/flag_return.wav');
            }
         }
      }

      //new tracking - *everyone* automatically tracks the "flag hoarder" if they have at least 15 flags
      %game.updateFlagHoarder(%client);
   }
}

function HuntersGame::checkTimeLimit(%game)
{
   DefaultGame::checkTimeLimit(%game);

   //make sure the hoard counter is also up to date
   %curTimeLeftMS = ($Host::TimeLimit * 60 * 1000) + $missionStartTime - getSimTime();
   messageAll('MsgHuntHoardStatus', "", %game.HoardMode, $Host::TimeLimit, %curTimeLeftMS, %game.HoardStartTime, %game.HoardDuration);
}

function HuntersGame::timeLimitReached(%game)
{
   logEcho("game over (timelimit)");
   %game.gameOver();
   cycleMissions();
}

function HuntersGame::scoreLimitReached(%game)
{
   //no such thing as a score limit in Hunters...
}

function HuntersGame::gameOver(%game)
{
   //call the default
   DefaultGame::gameOver(%game);

   messageAll('MsgGameOver', "Match has ended.~wvoice/announcer/ann.gameover.wav" );

   messageAll('MsgClearObjHud', "");
   for(%i = 0; %i < ClientGroup.getCount(); %i ++) 
   {
      %client = ClientGroup.getObject(%i);
      Game.resetScore(%client);
      cancel(%client.oobSched);
   }
}

function HuntersGame::checkScoreLimit(%game, %client)
{
   //no such thing as a score limit in Hunters...
}

//-----------------------------------------------------------------------------
//Nexus functions

function HuntersGame::setNexusDisabled(%game)
{
   //set the animations
   Game.Nexus.playThread(1, "transition");
   Game.NexusCap.playthread(1, "transition");
   Game.NexusBase.playthread(1, "transition");
   Game.Nexus.setThreadDir(1, true);
   Game.NexusCap.setThreadDir(1, true);
   Game.NexusBase.setThreadDir(1, true);
}

function HuntersGame::setNexusEnabled(%game)
{
   //set the animations
   Game.Nexus.playThread(1, "transition");
   Game.NexusCap.playthread(1, "transition");
   Game.NexusBase.playthread(1, "transition");
   Game.Nexus.setThreadDir(1, false);
   Game.NexusCap.setThreadDir(1, false);
   Game.NexusBase.setThreadDir(1, false);
}

function HuntersGame::flashNexus(%game)
{
   //set the animations
   Game.Nexus.playThread(1, "flash");
   Game.NexusCap.playthread(1, "flash");
   Game.NexusBase.playthread(1, "flash");
   Game.Nexus.setThreadDir(1, Game.Nexus.flashThreadDir);
   Game.NexusCap.setThreadDir(1, Game.Nexus.flashThreadDir);
   Game.NexusBase.setThreadDir(1, Game.Nexus.flashThreadDir);
   Game.Nexus.flashThreadDir = !Game.Nexus.flashThreadDir;
}

function HuntersGame::NexusSparkEmitter(%game, %client, %cap, %numToScore)
{
   if (isObject(%client.nexusEmitter))
      %client.nexusEmitter.delete();

   %client.nexusEmitter = new ParticleEmissionDummy()
   {
      //position = getWord(%client.player.position, 0) SPC getWord(%client.player.position, 1) SPC getWord(%client.player.position, 2) + 3;
      position = (%cap ? Game.nexus.getWorldBoxCenter() : %client.player.getWorldBoxCenter());
      rotation = "1 0 0 0";
      scale = "1 1 1";
      dataBlock = defaultEmissionDummy;
      emitter = (%cap ? NexusParticleCapEmitter : NexusParticleDeniedEmitter);            
      velocity = "1";
   };
   MissionCleanup.add(%client.nexusEmitter);

   //the effect should only last a few seconds
   if (%cap)
   {
      %timeMS = (%numToScore < 10 ? 200 : %numToScore * 20);
      %client.nexusEmitter.schedule(%timeMS, "delete"); 
   }
   else
      %client.nexusEmitter.schedule(200, "delete"); 
}

function HuntersGame::hoardModeActive(%game, %wouldBeActive)
{
   if (%wouldBeActive $= "")
      %wouldBeActive = false;

   //see if hoard mode is on and active
   if (%game.HoardMode || %wouldBeActive)
   {
      %missionEndTime = ($Host::TimeLimit * 60 * 1000) + $missionStartTime;
      %timeLeftMS = %missionEndTime - getSimTime();

      %hoardStartTime = %game.HoardStartTime * 60 * 1000;
      %hoardEndTime = %hoardStartTime - (%game.HoardDuration * 60 * 1000);
      if (%timeLeftMS <= %hoardStartTime && %timeLeftMS > %hoardEndTime)
         return true;
   }
   return false;
}

function Nexus::onCollision(%data, %obj, %colObj)  
{
   //make sure it was a player that entered the trigger
   if((%colObj.getDataBlock().className $= Armor) && (%colObj.getState() !$= "Dead"))
   {
      %player = %colObj;
      %client = %player.client;

      // if player has been to the nexus within last 5 seconds, don't keep spamming messages
      if((getSimTime() - %player.lastNexusTime) < 5000)
         return;

      %player.lastNexusTime = getSimTime();

      if(Game.hoardModeActive())
      {
         messageClient(%client, 'MsgHuntHoardNoCap', '\c2Hoard mode is in effect! You cannot return any flags right now.~wfx/powered/nexus_deny.wav');

         //apply a "bounce" impulse to the player
         %velocity = %player.getVelocity();
         if (VectorDist("0 0 0", %velocity) < 2)
            %velocityNorm = "0 20 0";
         else
            %velocityNorm = VectorScale(VectorNormalize(%velocity), 20);
         %vector = VectorScale(%velocityNorm, -200);
         %player.applyImpulse(%player.position, %vector);

         Game.NexusSparkEmitter(%client, false);
         return;
      }
      
      // you can't cap your own flag
      %numToScore = %client.flagCount - 1;
      if (Game.greedMode && (%numToScore < Game.GreedMinFlags) && (%numToScore >= 1))
      {
         messageClient(%client, 'MsgHuntNeedGreed', '\c2Greed mode is ON! You must have %1 flags before you can return them.~wfx/powered/nexus_deny.wav', Game.GreedMinFlags);

         //transition the Nexus to the "off" animation and back again
         Game.flashNexus();

         //apply a "bounce" impuse to the player
         %velocity = %player.getVelocity();
         if (VectorDist("0 0 0", %velocity) < 2)
            %velocityNorm = "0 20 0";
         else
            %velocityNorm = VectorScale(VectorNormalize(%velocity), 20);
         %vector = VectorScale(%velocityNorm, -200);
         %player.applyImpulse(%player.position, %vector);

         Game.NexusSparkEmitter(%client, false);
         return;
      }

      //send the flags message right away...
      if (isEventPending(%client.flagMsgPending))
      {
         cancel(%client.flagMsgPending);
         %game.sendFlagCountMessage(%client);
      }

      //unless the nexus is very near the mission boundary, there should be no oobSched to cancel, but...
      cancel(%client.oobSched);

      //score the flags
      %totalScore = (%numToScore * (%numToScore + 1)) / 2;
      if (Game.teamMode)
      {
         $teamScore[%client.team] += %totalScore;
         logEcho(%client.nameBase@" (pl "@%player@"/cl "@%client@") score "@%numToScore@" flags worth "@%totalScore@" pts for team "@%client.team);
         messageAll('MsgTeamScoreIs', "", %client.team, $teamScore[%client.team]);
         Game.recalcTeamRanks(%client.team);
      }
      else
      {
         %client.flagPoints += %totalScore;
         logEcho(%client.nameBase@" (pl "@%player@"/cl "@%client@") score "@%numToScore@" flags worth "@%totalScore@" pts");
         Game.recalcScore(%client);

         //see if we should set the highest for the mission here
         if (%numToScore > Game.highestFlagReturnCount)
         {
            Game.highestFlagReturnCount = %numToScore;
            Game.highestFlagReturnName = getTaggedString(%client.name);
         }
      }
      
      //reset the flags
      %client.flagCount = 1;
      %client.couldSetRecord = false;
      %player.unMountImage($FlagSlot);   
      messageClient(%client, 'MsgHuntYouHaveFlags', "", 0);
      
      //see if it's the top score
      if (!Game.teamMode && (%client.score > $TopClientScore))
         %topScore = true;
      else
         %topScore = false;
         
      //send the messages
      if (%numToScore <= 0)
      {
         messageClient(%client, 'MsgHuntYouNeedHelp', '\c2Pick up flags and bring them here to score points.~wfx/misc/nexus_idle.wav');
      }
      else if (%numToScore == 1)
      {
         if(Game.teamMode)
            messageAllExcept(%client, -1, 'MsgHuntPlayerScored', '\c2%1 returned 1 flag (1 point) for %2.~wfx/misc/nexus_cap.wav', %client.name, $TeamName[%client.team], 1);
         else
         {
            messageAllExcept(%client, -1, 'MsgHuntPlayerScored', '\c2%1 returned 1 flag for 1 point.~wfx/misc/nexus_cap.wav', %client.name, 1);

            //new tracking - *everyone* automatically tracks the "flag hoarder" if they have at least 15 flags
            Game.updateFlagHoarder(%client);
         }

         //add the nexus effect
         Game.NexusSparkEmitter(%client, true, %numToScore);

         messageClient(%client, 'MsgHuntYouScored', '\c2You returned 1 flag for 1 point.~wfx/misc/nexus_cap.wav', 1);
      }
      else if (%numToScore < 5)
      {
         if(Game.teamMode)
            messageAllExcept(%client, -1, 'MsgHuntPlayerScored', '\c2%1 returned %2 flags (%3 points) for %4.~wfx/misc/nexus_cap.wav', %client.name, %numToScore, %totalScore, $TeamName[%client.team]);
         else
         {
            messageAllExcept(%client, -1, 'MsgHuntPlayerScored', '\c2%1 returned %2 flags for %3 points.~wfx/misc/nexus_cap.wav', %client.name, %numToScore, %totalScore);

            //new tracking - *everyone* automatically tracks the "flag hoarder" if they have at least 15 flags
            Game.updateFlagHoarder(%client);
         }

         //add the nexus effect
         Game.NexusSparkEmitter(%client, true, %numToScore);

         messageClient(%client, 'MsgHuntYouScored', '\c2You returned %1 flags for %2 points.~wfx/misc/nexus_cap.wav', %numToScore, %totalScore);
      }
      else
      {
         if(Game.teamMode)
            messageAllExcept(%client, -1, 'MsgHuntPlayerScored', '\c2%1 returned %2 flags (%3 points) for %4.~wfx/misc/nexus_cap.wav', %client.name, %numToScore, %totalScore, $TeamName[%client.team]);
         else
         {
            messageAllExcept(%client, -1, 'MsgHuntPlayerScored', '\c2%1 returned %2 flags for %3 points.~wfx/misc/nexus_cap.wav', %client.name, %numToScore, %totalScore);

            //new tracking - *everyone* automatically tracks the "flag hoarder" if they have at least 15 flags
            Game.updateFlagHoarder(%client);
         }

         //add the nexus effect
         Game.NexusSparkEmitter(%client, true, %numToScore);

         messageClient(%client, 'MsgHuntYouScored', '\c2You returned %1 flags for %2 points.~wfx/misc/nexus_cap.wav', %numToScore, %totalScore);
      }
      
      //see if it's the top score
      if (%topScore)
      {
         $TopClientScore = %client.score;
         if (%client == $TopClient)
         {
            if (%numToScore >= 5)
               messageAll('MsgHuntTopScore', '\c0%1 is leading with a score of %2!~wfx/misc/flag_capture.wav', %client.name, %client.score);
            else
               messageAll('MsgHuntTopScore', '\c0%1 is leading with a score of %2!', %client.name, %client.score);
         }
         else
            messageAll('MsgHuntNewTopScore', '\c0%1 has taken the lead with a score of %2!~wfx/misc/flag_capture.wav', %client.name, %client.score);
         $TopClient = %client;
      }

      //see if it's a record
      if (%numToScore > 10 && %numToScore > $Host::HuntersRecords::Count[$currentMission])
      {
         //see if we have at least 4 non-AI players
         %humanCount = 0;
         %count = ClientGroup.getCount();
         for (%i = 0; %i < %count; %i++)
         {
            %cl = ClientGroup.getObject(%i);
            if (!%cl.isAIControlled())
               %humanCount++;
            if (%humanCount >= Game.numHumansForRecord)
               break;
         }

         if (%humanCount >= Game.numHumansForRecord)
         {
            $Host::HuntersRecords::Count[$currentMission] = %numToScore;
            $Host::HuntersRecords::Name[$currentMission] = getTaggedString(%client.name);

            //send a message to everyone
            messageAllExcept(%client, -1, 'MsgHuntPlayerSetRecord', '\c2%1 set the record for this mission with a return of %2 flags!~wfx/misc/flag_return.wav', %client.name, %numToScore);
            messageClient(%client, 'MsgHuntYouSetRecord', '\c2You set the record for this mission with a return of %1 flags!~wfx/misc/flag_return.wav', %numToScore);

            //update the records file...
            export( "$Host::HuntersRecords::*", "prefs/HuntersRecords.cs", false );

            //once the record has been set, reset everyone's tag
            for (%i = 0; %i < %count; %i++)
            {
               %cl = ClientGroup.getObject(%count);
               %cl.couldSetRecord = false;
            }
         }
      }

      if(Game.teamMode)
         Game.checkScoreLimit(%team);
      else
         Game.checkScoreLimit(%client);
   }
}

function HuntersGame::clientMissionDropReady(%game, %client)
{
   //%client.rank = ClientGroup.getCount();
   messageClient(%client, 'MsgClientReady',"", %game.class);
   //messageClient(%client, 'MsgHuntGreedStatus', "", %game.greedMode, %game.GreedMinFlags);
   //%curTimeLeftMS = ($Host::TimeLimit * 60 * 1000) + $missionStartTime - getSimTime();
   //messageClient(%client, 'MsgHuntHoardStatus', "", %game.HoardMode, $Host::TimeLimit, %curTimeLeftMS, %game.HoardStartTime, %game.HoardDuration);
   messageClient(%client, 'MsgHuntYouHaveFlags', "", 0);
   messageClient(%client, 'MsgYourScoreIs', "", 0);
   // MES function below does not exist
   //%game.populateRankArray(%client);
   //messageClient(%client, 'MsgYourRankIs', "", -1);

   messageClient(%client, 'MsgMissionDropInfo', '\c0You are in mission %1 (%2).', $MissionDisplayName, $MissionTypeDisplayName, $ServerName ); 
   
   DefaultGame::clientMissionDropReady(%game, %client);
}

function HuntersGame::AIHasJoined(%game, %client)
{
   //let everyone know the player has joined the game
   //messageAllExcept(%client, -1, 'MsgClientJoin', '%1 joined the game.', %client.name, "", %client, 1);
}

function HuntersGame::resetScore(%game, %client)
{
   %client.score = 0;
   %client.suicides = 0;
   %client.kills = 0;
   %client.teamKills = 0;
   %client.deaths = 0;
   %client.flagPoints = 0;
}

function HuntersGame::recalcScore(%game, %cl)
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
   %cl.score += %cl.flagPoints;
   %cl.score += %cl.suicides * %game.SCORE_PER_SUICIDE;
   //%cl.score = mFloatLength(%cl.score, 1);
   %cl.score = mFloor(%cl.score);

   //must send the message to update the HUD
   messageClient(%cl, 'MsgYourScoreIs', "", %cl.score);

   %game.recalcTeamRanks(%cl);      
}  

function HuntersGame::sendGameVoteMenu( %game, %client, %key )
{
   // Don't send any options if a vote is already running:
   if ( %game.scheduleVote $= "" )
   {
      // First send the common options:
      DefaultGame::sendGameVoteMenu( %game, %client, %key );

      if (!isDemo())
      {
         if(!%client.isAdmin)
         {
            // Now send the Hunters-specific options:
            if ( %game.greedMode )
               messageClient( %client, 'MsgVoteItem', "", %key, 'VoteGreedMode', 'disable greed mode', 'Vote Disable GREED Mode' );
            else
               messageClient( %client, 'MsgVoteItem', "", %key, 'VoteGreedMode', 'enable greed mode', 'Vote Enable GREED Mode' );

            if ( %game.HoardMode )
               messageClient( %client, 'MsgVoteItem', "", %key, 'VoteHoardMode', 'disable hoard mode', 'Vote Disable HOARD Mode' );
            else
               messageClient( %client, 'MsgVoteItem', "", %key, 'VoteHoardMode', 'enable hoard mode', 'Vote Enable HOARD Mode' );
         }
         else
         {
            if ( %game.greedMode )
               messageClient( %client, 'MsgVoteItem', "", %key, 'VoteGreedMode', 'disable greed mode', 'Disable GREED Mode' );
            else
               messageClient( %client, 'MsgVoteItem', "", %key, 'VoteGreedMode', 'enable greed mode', 'Enable GREED Mode' );

            if ( %game.HoardMode )
               messageClient( %client, 'MsgVoteItem', "", %key, 'VoteHoardMode', 'disable hoard mode', 'Disable HOARD Mode' );
            else
               messageClient( %client, 'MsgVoteItem', "", %key, 'VoteHoardMode', 'enable hoard mode', 'Enable HOARD Mode' );
         }
      }
   }
}

function HuntersGame::voteGreedMode( %game, %admin, %player )
{
   %cause = "";
   %setto = "";
   if ( %admin )
   {
      if ( %game.greedMode )
      {
         messageAll( 'AdminDisableGreedMode', '\c2The Admin has disabled GREED mode.~wfx/misc/hunters_greed.wav' );
         %game.greedMode = false;
         %setto = "disabled";
      }
      else
      {
         messageAll( 'AdminEnableGreedMode', '\c2The Admin has enabled GREED mode.~wfx/misc/hunters_greed.wav' );
         %game.greedMode = true;
         %setto = "enabled";
      }
      %cause = "(admin)";
   }
   else
   {
      %totalVotes = %game.totalVotesFor + %game.totalVotesAgainst;
      if ( %totalVotes > 0 && ( %game.totalVotesFor / %totalVotes ) > 0.7 ) 
      {
         if ( %game.greedMode ) 
         {
            messageAll( 'MsgVotePassed', '\c2GREED mode was disabled by vote.~wfx/misc/hunters_greed.wav' );   
            %game.greedMode = false;            
            %setto = "disabled";
         }
         else 
         {
            messageAll( 'MsgVotePassed', '\c2GREED mode was enabled by vote.~wfx/misc/hunters_greed.wav' ); 
            %game.greedMode = true;            
            %setto = "enabled";
         }
         %cause = "(vote)";
//         alxPlay(VotePassSound, 0, 0, 0);
      }
      else 
      {
         if ( %game.greedMode )
            messageAll( 'MsgVoteFailed', '\c2Disable GREED mode vote did not pass, %1 to %2.', %game.totalVotesFor, %game.totalVotesAgainst );  
         else 
            messageAll( 'MsgVoteFailed', '\c2Enable GREED mode vote did not pass, %1 to %2.', %game.totalVotesFor, %game.totalVotesAgainst );   
//         alxPlay(VoteNotPassSound, 0, 0, 0);
      }
   } 

   //send the global message
   messageAll('MsgHuntGreedStatus', "", %game.greedMode, %game.GreedMinFlags);
   if(%setto !$= "")
      logEcho("greed mode "@%setto SPC %cause);

   //store the result
   if (%game.teamMode)
      $Host::TeamHuntersGreedMode = %game.greedMode;
   else
      $Host::HuntersGreedMode = %game.greedMode;
}

function HuntersGame::voteHoardMode( %game, %admin, %player )
{
   %cause = "";
   %setto = "";

   if ( %admin )
   {
      if ( %game.HoardMode )
      {
         messageAll( 'AdminDisableHoardMode', '\c2The Admin has disabled HOARD mode.' );
         %game.HoardMode = false;
         %setto = "disabled";
      }
      else
      {
         messageAll( 'AdminEnableHoardMode', '\c2The Admin has enabled HOARD mode.' );
         %game.HoardMode = true;
         %setto = "enabled";
      }
      %cause = "(admin)";
   }
   else
   {
      %totalVotes = %game.totalVotesFor + %game.totalVotesAgainst;
      if ( %totalVotes > 0 && ( %game.totalVotesFor / %totalVotes ) > 0.7 ) 
      {
         if ( %game.HoardMode ) 
         {
            messageAll( 'MsgVotePassed', '\c2HOARD mode was disabled by vote.' );   
            %game.HoardMode = false;
            %setto = "disabled";
         }
         else 
         {
            messageAll( 'MsgVotePassed', '\c2HOARD mode was enabled by vote.' ); 
            %game.HoardMode = true;            
            %setto = "enabled";
         }
         %cause = "(vote)";
//         alxPlay(VotePassSound, 0, 0, 0);
      }
      else 
      {
         if ( %game.HoardMode )
            messageAll( 'MsgVoteFailed', '\c2Disable HOARD mode vote did not pass, %1 to %2.', %game.totalVotesFor, %game.totalVotesAgainst );  
         else 
            messageAll( 'MsgVoteFailed', '\c2Enable HOARD mode vote did not pass, %1 to %2.', %game.totalVotesFor, %game.totalVotesAgainst );   
//         alxPlay(VoteNotPassSound, 0, 0, 0);
      }
   } 

   //send the global message
   %curTimeLeftMS = ($Host::TimeLimit * 60 * 1000) + $missionStartTime - getSimTime();
   messageAll('MsgHuntHoardStatus', "", %game.HoardMode, $Host::TimeLimit, %curTimeLeftMS, %game.HoardStartTime, %game.HoardDuration);
   if(%setto !$= "")
      logEcho("hoard mode "@%setto SPC %cause);

   //store the result
   if (%game.teamMode)
      $Host::TeamHuntersHoardMode = %game.HoardMode;
   else
      $Host::HuntersHoardMode = %game.HoardMode;
}

function HuntersGame::voteChangeTimeLimit( %game, %admin, %newLimit )
{
   %oldTimeLimit = $Host::TimeLimit;
   DefaultGame::voteChangeTimeLimit(%game, %admin, %newLimit);

   //if the time limit changed, this will affect hoard mode:
   if ($Host::TimeLimit != %oldTimeLimit)
   {
      %game.setupHoardCountdown();
   }
}

function createDroppedFlag(%data, %value, %player, %game)
{
   %client = %player.client;
   %playerPos = %player.getWorldBoxCenter();

   // create a flag and throw it
   %droppedflag = new Item() {
      position = %playerPos;
      rotation = "0 0 1 " @ (getRandom() * 360);
      scale = "1 1 1";
      dataBlock = %data;
      collideable = "0";
      static = "0";
      rotate = "0";
      team = "0";
   };
   $FlagGroup.add(%droppedflag);
   %droppedFlag.value = %value;

   // set the flags target (for proper skin)
   %droppedFlag.setTarget(%data.target);

   //throw the flag randomly away from the body
   if (%client.isDead)
   {
      %vec = (-1.0 + getRandom() * 2.0) SPC (-1.0 + getRandom() * 2.0) SPC getRandom();
      %vec = VectorScale(%vec, 1000 + (getRandom() * 500));
   
      // Add player's velocity
      %vec = vectorAdd(%vec, %player.getVelocity());
   }
   
   //else if the player is Out of bounds, throw them in the direction of the nexus
   else if (%client.outOfBounds)
   {
      %towardsNexusVec = VectorSub(%game.nexus.position, %player.position);
      %towardsNexusVec = getWord(%towardsNexusVec, 0) SPC getWord(%towardsNexusVec, 1) SPC "0";
      %towardsNexusVec = VectorNormalize(%towardsNexusVec);
   
      //add a little noise
      %vec = getWord(%towardsNexusVec, 0) + (-0.3 + getRandom() * 0.6) SPC
               getWord(%towardsNexusVec, 1) + (-0.3 + getRandom() * 0.6) SPC
               getWord(%towardsNexusVec, 2);
      %vec = VectorScale(%vec, 1000 + (getRandom() * 500));
   }
   
   //else throw them more or less in the direction the player was facing...
   else
   {
      %playerFacingVec = MatrixMulVector("0 0 0 " @ getWords(%client.player.getTransform(), 3, 6), "0 1 0");
      %playerFacingVec = VectorNormalize(%playerFacingVec);
   
      //add a little noise
      %vec = getWord(%playerFacingVec, 0) + (-0.3 + getRandom() * 0.6) SPC
               getWord(%playerFacingVec, 1) + (-0.3 + getRandom() * 0.6) SPC
               getWord(%playerFacingVec, 2);
      %vec = VectorScale(%vec, 1000 + (getRandom() * 500));
   
      // Add player's velocity
      %vec = vectorAdd(%vec, %player.getVelocity());
   }
   
   %droppedflag.applyImpulse(%playerPos, %vec);
   %droppedflag.setCollisionTimeout(%player);
   schedule(%game.flagLifeTimeMS, %droppedflag, "HuntersStartFlagTimeOut", %droppedflag);
}

function HuntersGame::throwFlags(%game, %player)
{
   %client = %player.client;

   //find out how many flags to drop
   if (%client.isDead)
      %numFlags = %client.flagCount;
   else
      %numFlags = %client.flagCount - 1;

   if (%numFlags <= 0)
      return;
   //send the flags message right away...
   if (isEventPending(%client.flagMsgPending))
   {
      cancel(%client.flagMsgPending);
      %game.sendFlagCountMessage(%client);
   }

   %numFlagsToDrop = %numFlags;

   //reset the count (which doesn't matter if player is dead)
   %client.flagCount = 1;
   %client.couldSetRecord = false;
   
   //drop the flags
   %flagIncrement = 1;
   %db[1] = HuntersFlag1;
   %db[2] = HuntersFlag2;
   %db[4] = HuntersFlag4;
   %db[8] = HuntersFlag8;

   %i = 0;
   while (%i < %numFlagsToDrop)
   {
      for (%j = 0; %j < 5; %j++)
      {
         %numFlagsLeft = %numFlagsToDrop - %i;
         if (%numFlagsLeft >= %flagIncrement)
         {
            createDroppedFlag(%db[%flagIncrement], %flagIncrement, %player, %game);
            %i += %flagIncrement;
         }
         else
         {
            // cleanup
            if (%numFlagsLeft >= 8)
            {
               createDroppedFlag(%db[8], 8, %player, %game);
               %i += 8;
               %numFlagsLeft -= 8;
            }
            if (%numFlagsLeft >= 4)
            {
               createDroppedFlag(%db[4], 4, %player, %game);
               %i += 4;
               %numFlagsLeft -= 4;
            }
            if (%numFlagsLeft >= 2)
            {
               createDroppedFlag(%db[2], 2, %player, %game);
               %i += 2;
               %numFlagsLeft -= 2;
            }
            if (%numFlagsLeft >= 1)
            {
               createDroppedFlag(%db[1], 1, %player, %game);
               %i += 1;
               %numFlagsLeft -= 1;
            }

            if (%i != %numFlagsToDrop || %numFlagsLeft != 0)
            {
               error("Error, missing a flag!");
            }
            break;
         }
      }

      if (%flagIncrement < 8)
         %flagIncrement = %flagIncrement * 2;
   }

   //yard sale!
   if (%numFlags >= %game.yardSaleMin)
   {
      messageAll('MsgHuntYardSale', '\c2YARD SALE!!!~wfx/misc/yardsale.wav');

      //create a waypoint at player's location...
      %yardWaypoint = new WayPoint()
      {
         position = %player.position;
         rotation = "1 0 0 0";
         scale = "1 1 1";
         name = "YARD SALE!";
         dataBlock = "WayPointMarker";
         lockCount = "0";
         homingCount = "0";
         team = "0";
      };

      //add the waypoint to the cleanup group
      MissionCleanup.add(%yardWaypoint);
      $HuntersYardSaleSet.add(%yardWaypoint);
      schedule(30000, %yardWaypoint, "HuntersYardSaleTimeOut", %yardWaypoint);
   }
      
   //remove any mounted flag from the player
   %player.unMountImage($FlagSlot);

   //update the client's hud
   messageClient(%client, 'MsgHuntYouHaveFlags', "", 0);

   //new tracking - *everyone* automatically tracks the "flag hoarder" if they have at least 15 flags
   %game.updateFlagHoarder(%client);
}

function HuntersGame::dropFlag(%game, %player)
{
   //first throw the flags
   %game.throwFlags(%player);

   //send the messages
   if (%numFlags == 1)
   {
      messageAllExcept(%client, -1, 'MsgHuntPlayerDroppedFlags', '\c0%1 dropped 1 flag.', %client.name, 1);
      messageClient(%client, 'MsgHuntYouDroppedFlags', '\c0You dropped 1 flag.', 1);
   }
   else if (%numFlags > 1)
   {
      messageAllExcept(%client, -1, 'MsgHuntPlayerDroppedFlags', '\c0%1 dropped %2 flags.', %client.name, %numFlags);
      messageClient(%client, 'MsgHuntYouDroppedFlags', '\c0You dropped %1 flags.', %numFlags);
   }
   logEcho(%client.nameBase@" (pl "@%player@"/cl "@%client@") dropped "@%numFlags@" flags");
}

function HuntersGame::enterMissionArea(%game, %playerData, %player)
{
   if(%player.getState() $= "Dead")
      return;
   
   %client = %player.client;
   %client.outOfBounds = false;
   cancel(%client.oobSched);
   messageClient(%player.client, 'MsgEnterMissionArea', '\c1You are back in the mission area.');
   logEcho(%player.client.nameBase@" (pl "@%player@"/cl "@%player.client@") entered mission area");
   cancel(%player.alertThread);
}

function HuntersGame::leaveMissionArea(%game, %playerData, %player)
{
   if(%player.getState() $= "Dead")
      return;
   
   // strip flags and throw them back into the mission area
   %client = %player.client;
   %client.outOfBounds = true;   
   if (%player.client.flagCount > 1)
      messageClient(%player.client, 'MsgLeaveMissionArea', '\c1You have left the mission area and will lose your flags!~wfx/misc/warning_beep.wav');
   else
      messageClient(%player.client, 'MsgLeaveMissionArea', '\c1You have left the mission area.~wfx/misc/warning_beep.wav');

   %client.oobSched = %game.schedule(%game.oobThrowFlagsDelayMS, "outOfBoundsThrowFlags", %client);
   logEcho(%player.client.nameBase@" (pl "@%player@"/cl "@%player.client@") left mission area");
}

function HuntersGame::outOfBoundsThrowFlags(%game, %client)
{
   %player = %client.player;
   if (!%client.outOfBounds)
      return;

   if (%client.flagCount > 1)
   {
      %game.throwFlags(%player);
      messageClient(%player.client, 'MsgLeaveMissionArea', '\c1You are out of the mission area and have lost your flags!~wfx/misc/flag_taken.wav');
   }

   //set the next schedule check
   %client.oobSched = %game.schedule(%game.oobThrowFlagsDelayMS, "outOfBoundsThrowFlags", %client);
}

function HuntersGame::onEnterTrigger(%game, %triggerName, %data, %obj, %colobj)
{
   //schedule a warning in 10 seconds 
   %client = %colobj.client;
   %client.campingThread = %game.schedule(game.nexusCampingTime, "CampingDamage", %client, true);
}

function HuntersGame::onLeaveTrigger(%game, %triggerName, %data, %obj, %colobj)
{
   %client = %colobj.client;
   cancel(%client.campingThread);
}

function HuntersGame::CampingDamage(%game, %client, %firstWarning)
{
   //make sure we're still alive...
   %player = %client.player;
   if (!isObject(%player) || %player.getState() $= "Dead")
      return;

   //if the match hasn't yet started, don't warn or apply damage yet...
   if (!$MatchStarted)
   {
      %client.campingThread = %game.schedule(game.nexusCampingTime / 2, "CampingDamage", %client, true);
   }
   else if (%firstWarning)
   {
      messageClient(%client, 'MsgHuntersNoCampZone', '\c2No camping near the Nexus.', 1);
      %client.campingThread = %game.schedule(game.nexusCampingTime / 2, "CampingDamage", %client, false);
   }
   else
   {
      %player.setDamageFlash(0.1);
      %player.damage(0, %player.position, 0.05, $DamageType::NexusCamping);
      %client.campingThread = %game.schedule(1000, "CampingDamage", %client, false);
   }

}

function HuntersGame::updateScoreHud(%game, %client, %tag)
{
   //tricky stuff here...  use two columns if we have more than 15 clients...
   %numClients = $TeamRank[0, count];
   if (%numClients > $ScoreHudMaxVisible)
      %numColumns = 2;

   // Clear the header:
   messageClient( %client, 'SetScoreHudHeader', "", "" );

   // Send header:
   if ( %numColumns == 2 )
      messageClient( %client, 'SetScoreHudSubheader', "", '<tab:5,155,225,305,455,525>\tPLAYER\tSCORE\tFLAGS\tPLAYER\tSCORE\tFLAGS' );
   else
      messageClient( %client, 'SetScoreHudSubheader', "", '<tab:15,235,335>\tPLAYER\tSCORE\tFLAGS' );

   //find out who has the most flags
   %maxFlagsClient = -1;
   %maxFlags = -1;
   for (%i = 0; %i < %numClients; %i++)
   {
      %cl = $TeamRank[0, %i];
      if (%cl.flagCount > %maxFlags)
      {
         %maxFlags = %cl.flagCount - 1;
         %maxFlagsClient = %cl;
      }
   }

   //if no one has any flags, don't hilite anyone...
   if (%maxFlags <= 0)
      %maxFlagsClient = -1;
   
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
      %col1ClientFlags = %col1Client.flagCount - 1;
      if (%col1ClientFlags <= 0)
         %col1ClientFlags = "";
      %col1Style = "";
      if ( %col1Client == %maxFlagsClient )
         %col1Style = "<color:00dc00>";
      else if ( %col1Client == %client )
         %col1Style = "<color:dcdcdc>";

      //see if we have two columns
      if (%numColumns == 2)
      {
         %col2Client = "";
         %col2ClientScore = "";
         %col2ClientFlags = "";
         %col2Style = "";

         //get the column 2 client info
         %col2Index = %index + %countMax;
         if (%col2Index < %numClients)
         {
            %col2Client = $TeamRank[0, %col2Index];
            %col2ClientScore = %col2Client.score $= "" ? 0 : %col2Client.score;
            %col2ClientFlags = %col2Client.flagCount - 1;
            if (%col2ClientFlags <= 0)
               %col2ClientFlags = "";
            if ( %col2Client == %maxFlagsClient )
               %col2Style = "<color:00dc00>";
            else if ( %col2Client == %client )
               %col2Style = "<color:dcdcdc>";
         }
      }

      //if the client is not an observer, send the message
      if (%client.team != 0)
      {
         if ( %numColumns == 2 )
            messageClient( %client, 'SetLineHud', "", %tag, %index, '<tab:10><spush>%7\t<clip:150>%1</clip><rmargin:205><just:right>%2<rmargin:270><just:right>%3<spop><rmargin:505><lmargin:310><just:left>%8<clip:150>%4</clip><rmargin:505><just:right>%5<rmargin:570><just:right>%6',
                  %col1Client.name, %col1ClientScore, %col1ClientFlags, %col2Client.name, %col2ClientScore, %col2ClientFlags, %col1Style, %col2Style );
         else
            messageClient( %client, 'SetLineHud', "", %tag, %index, '<tab:20>%4\t<clip:200>%1</clip><rmargin:280><just:right>%2<rmargin:380><just:right>%3', 
                  %col1Client.name, %col1ClientScore, %col1ClientFlags, %col1Style );
      }

      //else for observers, create an anchor around the player name so they can be observed
      else
      {
         if ( %numColumns == 2 )
         {

            //this is lame, but we can only have up to %9 args
            if ( %col2Client == %maxFlagsClient )
            {
               messageClient( %client, 'SetLineHud', "", %tag, %index, '<tab:10><spush>%7\t<clip:150><a:gamelink\t%8>%1</a></clip><rmargin:205><just:right>%2<rmargin:270><just:right>%3<spop><rmargin:505><lmargin:310><just:left><color:00dc00><clip:150><a:gamelink\t%9>%4</a></clip><rmargin:505><just:right>%5<rmargin:570><just:right>%6',
                                    %col1Client.name, %col1ClientScore, %col1ClientFlags,
                                    %col2Client.name, %col2ClientScore, %col2ClientFlags,
                                    %col1Style, %col1Client, %col2Client);
            }
            else if ( %col2Client == %client )
            {
               messageClient( %client, 'SetLineHud', "", %tag, %index, '<tab:10><spush>%7\t<clip:150><a:gamelink\t%8>%1</a></clip><rmargin:205><just:right>%2<rmargin:270><just:right>%3<spop><rmargin:505><lmargin:310><just:left><color:dcdcdc><clip:150><a:gamelink\t%9>%4</a></clip><rmargin:505><just:right>%5<rmargin:570><just:right>%6',
                                    %col1Client.name, %col1ClientScore, %col1ClientFlags,
                                    %col2Client.name, %col2ClientScore, %col2ClientFlags,
                                    %col1Style, %col1Client, %col2Client);
            }
            else
            {
               messageClient( %client, 'SetLineHud', "", %tag, %index, '<tab:10><spush>%7\t<clip:150><a:gamelink\t%8>%1</a></clip><rmargin:205><just:right>%2<rmargin:270><just:right>%3<spop><rmargin:505><lmargin:310><just:left><clip:150><a:gamelink\t%9>%4</a></clip><rmargin:505><just:right>%5<rmargin:570><just:right>%6',
                                    %col1Client.name, %col1ClientScore, %col1ClientFlags,
                                    %col2Client.name, %col2ClientScore, %col2ClientFlags,
                                    %col1Style, %col1Client, %col2Client);
            }
         }
         else
            messageClient( %client, 'SetLineHud', "", %tag, %index, '<tab:20>%4\t<clip:200><a:gamelink\t%5>%1</a></clip><rmargin:280><just:right>%2<rmargin:380><just:right>%3', 
                  %col1Client.name, %col1ClientScore, %col1ClientFlags, %col1Style, %col1Client );
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

function HuntersGame::sendDebriefing( %game, %client )
{
   // Mission result:
   if ( $TeamRank[0, 0].score > 0 )
      messageClient( %client, 'MsgDebriefResult', "", '<just:center>%1 wins with a score of %2!', $TeamRank[0, 0].name, $TeamRank[0, 0].score );
   else
      messageClient( %client, 'MsgDebriefResult', "", '<just:center>Nobody wins!' );


   if ( %game.highestFlagReturnName !$= "" )
      messageClient( %client, 'MsgDebriefResult', "", '<spush><color:3cb4b4><font:univers condensed:18>%1 had the highest return count with %2 flags!<spop>', %game.highestFlagReturnName, %game.highestFlagReturnCount );

   if ( $Host::HuntersRecords::Count[$currentMission] !$= "" && $Host::HuntersRecords::Name[$currentMission] !$= "" )
      messageClient( %client, 'MsgDebriefResult', "", '<spush><color:3cb4b4><font:univers condensed:18>%1 holds the record with a return count of %2 flags!<spop>', $Host::HuntersRecords::Name[$currentMission], $Host::HuntersRecords::Count[$currentMission] );

   if ( %game.greedFlagName !$= "" )
      messageClient( %client, 'MsgDebriefResult', "", '<spush><color:3cb4b4><font:univers condensed:18>%1 gets the honorary greed award for dropping %2 flags!<spop>', %game.greedFlagName, %game.greedFlagCount );

   // Player scores:
   messageClient( %client, 'MsgDebriefAddLine', "", '<spush><color:00dc00><font:univers condensed:18>PLAYER<lmargin%%:60>SCORE<lmargin%%:80>KILLS<spop>' );
   %count = $TeamRank[0, count];
   for ( %i = 0; %i < %count; %i++ )
   {
      %cl = $TeamRank[0, %i];
      if ( %cl.score $= "" )
         %score = 0;
      else
         %score = %cl.score;
      if ( %cl.kills $= "" )
         %kills = 0;
      else
         %kills = %cl.kills;
      messageClient( %client, 'MsgDebriefAddLine', "", '<lmargin:0><clip%%:60> %1</clip><lmargin%%:60><clip%%:20> %2</clip><lmargin%%:80><clip%%:20> %3</clip>', %cl.name, %score, %kills );
   }

   // Show observers:
   %count = ClientGroup.getCount();
   %header = false;
   for ( %i = 0; %i < %count; %i++ )
   {
      %cl = ClientGroup.getObject( %i );
      if ( %cl.team <= 0 )
      {
         if ( !%header )
         {
            messageClient( %client, 'MsgDebriefAddLine', "", '\n<lmargin:0><spush><font:univers condensed:18><color:00dc00>OBSERVERS<lmargin%%:60>SCORE<spop>' );
            %header = true;
         }

         %score = %cl.score $= "" ? 0 : %cl.score;
         messageClient( %client, 'MsgDebriefAddLine', "", '<lmargin:0><clip%%:60> %1</clip><lmargin%%:60><clip%%:40> %2</clip>', %cl.name, %score );
      }
   }
}

function HuntersGame::applyConcussion(%game, %player)
{
   //%game.dropFlag( %player );
}
