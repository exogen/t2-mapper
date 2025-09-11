//--- GAME RULES BEGIN ---
//One team defends base, other team tries to conquer it as quickly as possible
//Game has two rounds: Round 1 ends when base is conquered or time runs out
//Round 2: Teams switch sides, play again -- to win, attackers MUST beat the time set by the attackers in Round 1
//Touching base switch conquers base
//--- GAME RULES END ---

//Siege type script for TRIBES 2
//
//The two teams each take a turn at defense and offense.
//
//If initial defending team's objective is captured, then roles switch
//and new offense team gets same amount of time to attempt to capture the
//objective.
//
//If time runs out before initial defending team's objective is captured,
//then roles switch and new offense team has to try to capture the
//objective before time runs out.
//
//The winner is either the team who captures the objective in least amount of time.
//
// In the mission file, Team 1 will be offense team, and team 2 will be the defense team.
// When the game actually starts, either team could start on offense, and the objects must
// have their team designation set accordingly.
//
// This mission type doesn't have a scoreLimit because, well, it really doesn't
// need one or lend itself to one.

// ai support
exec("scripts/aiSiege.cs");

package SiegeGame {

function FlipFlop::objectiveInit(%data, %flipflop)
{
   Game.regObjective(%flipflop);
   setTargetSkin(%flipflop.getTarget(), $teamSkin[0]);
}

function SiegeGame::regObjective(%game, %object)
{
   %objSet = nameToID("MissionCleanup/Objectives");
   if(!isObject(%objSet))
   {
      %objSet = new SimSet("Objectives");
      MissionCleanup.add(%objSet);
   }
   %objSet.add(%object);
}

function FlipFlop::playerTouch(%data, %flipflop, %player)
{
   if(%player.team != Game.offenseTeam)
      return;

   %defTeam = Game.offenseTeam == 1 ? 2 : 1;
   Game.capPlayer[Game.offenseTeam] = stripChars( getTaggedString( %player.client.name ), "\cp\co\c6\c7\c8\c9" );

   // Let the observers know:
   messageTeam( 0, 'MsgSiegeTouchFlipFlop', '\c2%1 captured the %2 base!~wfx/misc/flipflop_taken.wav', %player.client.name, $TeamName[%defTeam] );
   // Let the teammates know:
   messageTeam( %player.team, 'MsgSiegeTouchFlipFlop', '\c2%1 captured the %2 base!~wfx/misc/flipflop_taken.wav', %player.client.name, $TeamName[%defTeam] );
   // Let the other team know:
   %losers = %player.team == 1 ? 2 : 1;
   messageTeam( %losers, 'MsgSiegeTouchFlipFlop', '\c2%1 captured the %2 base!~wfx/misc/flipflop_lost.wav', %player.client.name, $TeamName[%defTeam]);

   logEcho(%player.client.nameBase@" (pl "@%player@"/cl "@%player.client@") captured team "@%defTeam@" base");
   Game.allObjectivesCompleted();
}

//--------------------------------------------------------------------------------
function StaticShapeData::onDisabled(%data, %obj, %prevState)
{
	Parent::onDisabled(%data, %obj, %prevState);

	if(%obj.waypoint)
		game.switchWaypoint(%obj.waypoint);
}

//--------------------------------------------------------------------------------
function StaticShapeData::onEnabled(%data, %obj, %prevState)
{
	if(%obj.waypoint)
		game.switchWaypoint(%obj.waypoint);

   if(%obj.isPowered())
      %data.onGainPowerEnabled(%obj);
   Parent::onEnabled(%data, %obj, %prevState);
}

};

//--------- Siege SCORING INIT ------------------
function SiegeGame::initGameVars(%game)
{
   %game.SCORE_PER_SUICIDE = 0; 
   %game.SCORE_PER_TEAMKILL = 0;
   %game.SCORE_PER_DEATH = 0;  

   %game.SCORE_PER_KILL = 0;  

   %game.SCORE_PER_TURRET_KILL = 0;
}

function SiegeGame::claimFlipflopResources(%game, %flipflop, %team)
{
   // equipment shouldn't switch teams when flipflop is touched
}

function SiegeGame::missionLoadDone(%game)
{
   if( $Host::timeLimit == 0 )
      $Host::timeLimit = 999;

   //default version sets up teams - must be called first...
   DefaultGame::missionLoadDone(%game);

   //clear the scores
   $teamScore[1] = 0;
   $teamScore[2] = 0;

   //decide which team is starting first
   if (getRandom() > 0.5)
   {
      %game.offenseTeam = 1;
      %defenseTeam = 2;
   }
   else
   {
      %game.offenseTeam = 2;
      %defenseTeam = 1;
   }

   //send the message
   messageAll('MsgSiegeStart', '\c2Team %1 is starting on offense', $teamName[%game.offenseTeam]);

   //if the first offense team is team2, switch the object team designation
   if (%game.offenseTeam == 2)
   {
      %group = nameToID("MissionGroup/Teams");
      %group.swapTeams();
      // search for vehicle pads also
      %mcg = nameToID("MissionCleanup");
      %mcg.swapVehiclePads();
   }

   //also ensure the objectives are all on the defending team
   %objSet = nameToId("MissionCleanup/Objectives");
   for(%j = 0; %j < %objSet.getCount(); %j++) 
   {
      %obj = %objSet.getObject(%j);
      %obj.team = %defenseTeam;
      setTargetSensorGroup(%obj.getTarget(), %defenseTeam);
   }

   //indicate we're starting the game from the beginning...
   %game.firstHalf = true;
   %game.timeLimitMS = $Host::TimeLimit * 60 * 1000;
   %game.secondHalfCountDown = false;
   %game.capPlayer[1] = "";
   %game.capPlayer[2] = "";

   // save off turret bases' original barrels
   %game.checkTurretBases();

	// add objective waypoints
	%game.findObjectiveWaypoints();

   MissionGroup.setupPositionMarkers(true);
}

function SiegeGame::checkTurretBases(%game)
{
   %mGroup = nameToID("MissionGroup/Teams");
   %mGroup.findTurretBase();
}

function SimGroup::findTurretBase(%this)
{
   for (%i = 0; %i < %this.getCount(); %i++)
      %this.getObject(%i).findTurretBase();
}

function InteriorInstance::findTurretBase(%this)
{
   // sorry, we're not looking for interiors
}

function AIObjective::findTurretBase(%this)
{
   // prevent console error spam
}

function TSStatic::findTurretBase(%this)
{
   // prevent console error spam
}

function GameBase::findTurretBase(%this)
{
   // apparently, the initialBarrel attribute gets overwritten whenever the
   // barrel gets replaced.  :( So we have to save it again under "originalBarrel".
   if(%this.getDatablock().getName() $= "TurretBaseLarge")
      %this.originalBarrel = %this.initialBarrel;
}

function TSStatic::findTurretBase(%this)
{
   // prevent console error spam
}

function SiegeGame::selectSpawnSphere(%game, %team)
{ 
   //for siege, the team1 drops are offense, team2 drops are defense
   %sphereTeam = %game.offenseTeam == %team ? 1 : 2;

   return DefaultGame::selectSpawnSphere(%game, %sphereTeam);
}

function SiegeGame::startMatch(%game)
{
   DefaultGame::startMatch( %game );
   
   %game.startTimeMS = getSimTime();
   
   // schedule first timeLimit check for 20 seconds
   %game.timeSync = %game.schedule( 20000, "checkTimeLimit");
   %game.timeThread = %game.schedule( %game.timeLimitMS, "timeLimitReached");
   //updateClientTimes(%game.timeLimitMS);
   messageAll('MsgSystemClock', "", $Host::TimeLimit, %game.timeLimitMS);
   
//    %count = ClientGroup.getCount();
//    for ( %i = 0; %i < %count; %i++ )
//    {
//       %cl = ClientGroup.getObject( %i );
//       if ( %cl.team == %game.offenseTeam )
//          centerPrint( %cl, "\nTouch the enemy control switch to capture their base!", 5, 3 );
//       else
//          centerPrint( %cl, "\nPrevent the enemy from touching your control switch!", 5, 3 );   
//    }

   //make sure the AI is started
   AISystemEnabled(true);
}

function SiegeGame::allObjectivesCompleted(%game)
{
   Cancel( %game.timeSync );
   Cancel( %game.timeThread );
   cancelEndCountdown();

   //store the elapsed time in the teamScore array...
   $teamScore[%game.offenseTeam] = getSimTime() - %game.startTimeMS;
   messageAll('MsgSiegeCaptured', '\c2Team %1 captured the base in %2!', $teamName[%game.offenseTeam], %game.formatTime($teamScore[%game.offenseTeam], true));

   //set the new timelimit
   %game.timeLimitMS = $teamScore[%game.offenseTeam];

   if (%game.firstHalf)
   {
      // it's halftime, let everyone know
      messageAll( 'MsgSiegeHalftime' );
   }
   else
   {
      // game is over
      messageAll('MsgSiegeMisDone', '\c2Mission complete.');
   }
   logEcho("objective completed in "@%game.timeLimitMS);

   //setup the second half...
   // MES -- per MarkF, scheduling for 0 seconds will prevent player deletion-related crashes
   %game.schedule(0, halftime, 'objectives');
}

function SiegeGame::timeLimitReached(%game)
{
   cancel( %game.timeThread );
   cancel( %game.timeSync );

   // if time has run out, the offense team gets no score (note, %game.timeLimitMS doesn't change)
   $teamScore[%game.offenseTeam] = 0;
   messageAll('MsgSiegeFailed', '\c2Team %1 failed to capture the base.', $teamName[%game.offenseTeam]);
   
   if (%game.firstHalf)
   {
      // it's halftime, let everyone know
      messageAll( 'MsgSiegeHalftime' );
   }
   else
   {
      // game is over
      messageAll('MsgSiegeMisDone', '\c2Mission complete.');
   }
   
   logEcho("time limit reached");
   %game.halftime('time');
}

function SiegeGame::checkTimeLimit(%game)
{
   //if we're counting down to the beginning of the second half, check back in 
   if (%game.secondHalfCountDown)
   {   
      %game.timeSync = %game.schedule(1000, "checkTimeLimit");
      return;
   }   
      
   %timeElapsedMS = getSimTime() - %game.startTimeMS;
   %curTimeLeftMS = %game.timeLimitMS - %timeElapsedMS;
      
   if (%curTimeLeftMS <= 0)
   {
      // time's up, put down your pencils
      %game.timeLimitReached();                        
   }
   else
   {
      if(%curTimeLeftMS >= 20000)
         %game.timeSync = %game.schedule( 20000, "checkTimeLimit" );
      else
         %game.timeSync = %game.schedule( %curTimeLeftMS + 1, "checkTimeLimit" );
                                                                             
      //now synchronize everyone's clock
      messageAll('MsgSystemClock', "", $Host::TimeLimit, %curTimeLeftMS);
   }
}

function SiegeGame::startSecondHalf(%game)
{
   $MatchStarted = true;
   %game.secondHalfCountDown = false;

   MessageAll('MsgMissionStart', "\c2Match started");

   // set the start time.  
   //the new %game.timeLimitMS would have been set by timeLimitReached() or allObjectivesCompleted()
   %game.startTimeMS = getSimTime();

   %game.timeThread = %game.schedule(%game.timeLimitMS, "timeLimitReached");
   if (%game.timeLimitMS > 20000)
      %game.timeSync = %game.schedule(20000, "checkTimeLimit");
   else
      %game.timeSync = %game.schedule(%game.timeLimitMS, "checkTimeLimit");
   logEcho("start second half");

   EndCountdown(%game.timeLimitMS);

   // set all clients control to their player
   %count = ClientGroup.getCount();
   for( %i = 0; %i < %count; %i++ )
   {
      %cl = ClientGroup.getObject(%i);
      if (!isObject(%cl.player))
         commandToClient(%cl, 'setHudMode', 'Observer');
      else
      {
         %cl.observerMode = "";
         %cl.setControlObject( %cl.player );
         commandToClient(%cl, 'setHudMode', 'Standard');
//          if ( %client.team == %game.offenseTeam )
//             centerPrint( %cl, "\nTouch the enemy control switch to capture their base!", 5, 3 );
//          else
//             centerPrint( %cl, "\nPrevent the enemy from touching your control switch!", 5, 3 );   
      }
   }
   
   //now synchronize everyone's clock
   updateClientTimes(%game.timeLimitMS);

   //start the bots up again...
   AISystemEnabled(true);
}

function SiegeGame::halftime(%game, %reason)
{
   //stop the game and the bots
   $MatchStarted = false;
   AISystemEnabled(false);

   if (%game.firstHalf)
   {
      //switch the game variables
      %game.firstHalf = false;
      %oldOffenseTeam = %game.offenseTeam;
      if (%game.offenseTeam == 1)
         %game.offenseTeam = 2;
      else
         %game.offenseTeam = 1;

      //send the message
      messageAll('MsgSiegeRolesSwitched', '\c2Team %1 is now on offense.', $teamName[%game.offenseTeam], %game.offenseTeam);

      //reset stations and vehicles that players were using
      %game.resetPlayers();
      // zero out the counts for deployable items (found in defaultGame.cs)
      %game.clearDeployableMaxes();

      // clean up the MissionCleanup group - note, this includes deleting all the player objects
      %clean = nameToID("MissionCleanup");
      %clean.housekeeping();

      // Non static objects placed in original position
      resetNonStaticObjPositions();
      
      // switch the teams for objects belonging to the teams
      %group = nameToID("MissionGroup/Teams");
      %group.swapTeams();
      // search for vehicle pads also
      %mcg = nameToID("MissionCleanup");
      %mcg.swapVehiclePads();

      //restore the objects
      %game.restoreObjects();

      %count = ClientGroup.getCount();
      for(%cl = 0; %cl < %count; %cl++)
      {
         %client = ClientGroup.getObject(%cl);
         if( !%client.isAIControlled() )
         {
            // Put everybody in observer mode:
            %client.camera.getDataBlock().setMode( %client.camera, "observerStaticNoNext" );
            %client.setControlObject( %client.camera );
            
            // Send the halftime result info:
            if ( %client.team == %oldOffenseTeam )
            {
               if ( $teamScore[%oldOffenseTeam] > 0 )
                  messageClient( %client, 'MsgSiegeResult', "", '%1 captured the %2 base in %3!', %game.capPlayer[%oldOffenseTeam], $teamName[%game.offenseTeam], %game.formatTime( $teamScore[%oldOffenseTeam], true ) );
               else
                  messageClient( %client, 'MsgSiegeResult', "", 'Your team failed to capture the %1 base.', $teamName[%game.offenseTeam] );   
            }
            else if ( $teamScore[%oldOffenseTeam] > 0 )
               messageClient( %client, 'MsgSiegeResult', "", '%1 captured your base in %3!', %game.capPlayer[%oldOffenseTeam], %game.formatTime( $teamScore[%oldOffenseTeam], true ) );
            else
               messageClient( %client, 'MsgSiegeResult', "", 'Your team successfully held off team %1!', $teamName[%oldOffenseTeam] );   
            
            // List out the team rosters:
            messageClient( %client, 'MsgSiegeAddLine', "", '<spush><color:00dc00><font:univers condensed:18><clip%%:50>%1</clip><lmargin%%:50><clip%%:50>%2</clip><spop>', $TeamName[1], $TeamName[2] );
            %max = $TeamRank[1, count] > $TeamRank[2, count] ? $TeamRank[1, count] : $TeamRank[2, count];
            for ( %line = 0; %line < %max; %line++ )
            {
               %plyr1 = $TeamRank[1, %line] $= "" ? "" : $TeamRank[1, %line].name;
               %plyr2 = $TeamRank[2, %line] $= "" ? "" : $TeamRank[2, %line].name;
               messageClient( %client, 'MsgSiegeAddLine', "", '<lmargin:0><clip%%:50> %1</clip><lmargin%%:50><clip%%:50> %2</clip>', %plyr1, %plyr2 );
            }

            // Show observers:
            %header = false;
            for ( %i = 0; %i < %count; %i++ )
            {
               %obs = ClientGroup.getObject( %i );
               if ( %obs.team <= 0 )
               {
                  if ( !%header )
                  {
                     messageClient( %client, 'MsgSiegeAddLine', "", '\n<lmargin:0><spush><color:00dc00><font:univers condensed:18>OBSERVERS<spop>' );
                     %header = true;
                  }

                  messageClient( %client, 'MsgSiegeAddLine', "", ' %1', %obs.name );
               }
            }
            
            commandToClient( %client, 'SetHalftimeClock', $Host::Siege::Halftime / 60000 );
            
            // Get the HUDs right:
            commandToClient( %client, 'setHudMode', 'SiegeHalftime' );
            commandToClient( %client, 'ControlObjectReset' );
            
            clientResetTargets(%client, true);
            %client.notReady = true;
         }
      }
      
      %game.schedule( $Host::Siege::Halftime, halftimeOver );
   }
   else
   {
      // let's wrap it all up
      %game.gameOver();
      cycleMissions();
   }
}

function SiegeGame::halftimeOver( %game )
{
   // drop all players into mission
   %game.dropPlayers();

   //setup the AI for the second half
   %game.aiHalfTime();
   
   // start the mission again (release players)
   %game.halfTimeCountDown( $Host::warmupTime );

	//redo the objective waypoints
	%game.findObjectiveWaypoints();
}

function SiegeGame::dropPlayers( %game )
{
   %count = ClientGroup.getCount();
   for(%cl = 0; %cl < %count; %cl++)
   {
      %client = ClientGroup.getObject(%cl);
      if( !%client.isAIControlled() )
      {
         // keep observers in observer mode
         if(%client.team == 0)
            %client.camera.getDataBlock().setMode(%client.camera, "justJoined");
         else
         {
            %game.spawnPlayer( %client, false );
            
            %client.camera.getDataBlock().setMode( %client.camera, "pre-game", %client.player );
            %client.setControlObject( %client.camera );
            %client.notReady = false;
         }
      }
   }      
}

function SiegeGame::resetPlayers(%game)
{
   // go through the client group and reset anything the players were using
   // is most of this stuff really necessary?
   %count = ClientGroup.getCount();
   for(%cl = 0; %cl < %count; %cl++)
   {
      %client = ClientGroup.getObject(%cl);
      %player = %client.player;

      // clear the pack icon
      messageClient(%client, 'msgPackIconOff', "");
      // if player was firing, stop firing
      if(%player.getImageTrigger($WeaponSlot))
         %player.setImageTrigger($WeaponSlot, false);

      // if player had pack activated, deactivate it
      if(%player.getImageTrigger($BackpackSlot))
         %player.setImageTrigger($BackpackSlot, false);

      // if player was in a vehicle, get rid of vehicle hud
      commandToClient(%client, 'setHudMode', 'Standard', "", 0);

      // clear player's weapons and inventory huds
      %client.SetWeaponsHudClearAll();
      %client.SetInventoryHudClearAll();

      // if player was at a station, deactivate it
      if(%player.station)
      {
         %player.station.triggeredBy = "";
         %player.station.getDataBlock().stationTriggered(%player.station, 0);
         if(%player.armorSwitchSchedule)
            cancel(%player.armorSwitchSchedule);
      }

      // if piloting a vehicle, reset it (assuming it doesn't get deleted)
      if(%player.lastVehicle.lastPilot)
         %player.lastVehicle.lastPilot = "";
   }
}

function SimGroup::housekeeping(%this)
{
   // delete selectively in the MissionCleanup group
   %count = %this.getCount();
   // have to do this backwards or only half the objects will be deleted
   for(%i = (%count - 1); %i > -1; %i--)
   {
      %detritus = %this.getObject(%i);
      if(%detritus.getClassName() $= "SimSet")
      {
         // I don't think there are any simsets we want to delete
      }
      else if(%detritus.getName() $= "PZones")
      {
         // simgroup of physical zones for force fields
         // don't delete them
      }
      //else if (%detritus.getClassName() $= "ScriptObject")
      //{
      // // this will be the game type object.
      // // DEFINITELY don't want to delete this.
      //}
      else if(%detritus.getName() $= PosMarker)
      {
         //Needed to reset non static objects...
      }
      else if((%detritus.getName() $= "TeamDrops1") || (%detritus.getName() $= "TeamDrops2"))
      {
         // this will actually be a SimSet named TeamDropsN (1 or 2)
         // don't want to delete the spawn sphere groups, so do nothing
      }
      else if (%detritus.getName() $= "PlayerListGroup")
      {
         // we don't want to delete PlayerListGroup (SimGroup)
      }
      else if (%detritus.getDatablock().getName() $= "stationTrigger")
      {
         //we don't want to delete triggers for stations
      }
      else if (%detritus.getDatablock().getName() $= "StationVehicle")
      {
         // vehicle stations automatically get placed in MissionCleanup in a
         // position near the vehicle pad. Don't delete it.
      }
      else if (%detritus.getClassName() $= "Camera")
      {
         // Cameras should NOT be deleted
      }
      else
      {
         // this group of stuff to be deleted should include:
         // mines, deployed objects, projectiles, explosions, corpses,
         // players, and the like.
         %detritus.delete();
      }
   }
}

function SiegeGame::groupSwapTeams(%game, %this)
{
   for(%i = 0; %i < %this.getCount(); %i++)
      %this.getObject(%i).swapTeams();
}

function SiegeGame::objectSwapTeams(%game, %this)
{
   %defTeam = %game.offenseTeam == 1 ? 2 : 1;

   if(%this.getDatablock().getName() $= "Flipflop") 
   {
      if(getTargetSensorGroup(%this.getTarget()) != %defTeam)
      {
         setTargetSensorGroup(%this.getTarget(), %defTeam);
         %this.team = %defTeam;
      }
   }
   else
   {
      if(%this.getTarget() != -1)
      {
         if(getTargetSensorGroup(%this.getTarget()) == %game.offenseTeam)
         {
            setTargetSensorGroup(%this.getTarget(), %defTeam);
            %this.team = %defTeam;
         }
         else if(getTargetSensorGroup(%this.getTarget()) == %defTeam)
         {
            setTargetSensorGroup(%this.getTarget(), %game.offenseTeam);
            %this.team = %game.offenseTeam;
         }
      }
      if(%this.getClassName() $= "Waypoint")
      {
         if(%this.team == %defTeam)
            %this.team = %game.offenseTeam;
         else if(%this.team == %game.offenseTeam)
            %this.team = %defTeam;
      }
   }
}

function SiegeGame::groupSwapVehiclePads(%game, %this)
{
   for(%i = 0; %i < %this.getCount(); %i++)
      %this.getObject(%i).swapVehiclePads();
}

function SiegeGame::objectSwapVehiclePads(%game, %this)
{
   %defTeam = %game.offenseTeam == 1 ? 2 : 1;

   if(%this.getDatablock().getName() $= "StationVehicle")
   {
      if(%this.getTarget() != -1)
      {
         // swap the teams of both the vehicle pad and the vehicle station
         if(getTargetSensorGroup(%this.getTarget()) == %game.offenseTeam)
         {
            setTargetSensorGroup(%this.getTarget(), %defTeam);
            %this.team = %defTeam;
            setTargetSensorGroup(%this.pad.getTarget(), %defTeam);
            %this.pad.team = %defTeam;
         }
         else if(getTargetSensorGroup(%this.getTarget()) == %defTeam)
         {
            setTargetSensorGroup(%this.getTarget(), %game.offenseTeam);
            %this.team = %game.offenseTeam;
            setTargetSensorGroup(%this.pad.getTarget(), %game.offenseTeam);
            %this.pad.team = %game.offenseTeam;
         }
      }
   }
}

function SiegeGame::restoreObjects(%game)
{
   // restore all the "permanent" mission objects to undamaged state
   %group = nameToID("MissionGroup/Teams");
   // SimGroup::objectRestore is defined in DefaultGame.cs -- it simply calls
   // %game.groupObjectRestore
   %group.objectRestore();
}

function SiegeGame::groupObjectRestore(%game, %this)
{
   for(%i = 0; %i < %this.getCount(); %i++)
      %this.getObject(%i).objectRestore();
}

function SiegeGame::shapeObjectRestore(%game, %object)
{
   //if(%object.getDatablock().getName() $= FlipFlop)
   //{
   // messageAll('MsgSiegeObjRestore', "", %object.number, true);
   //}
   //else if(%object.getDamageLevel())
   if(%object.getDamageLevel())
   {
      %object.setDamageLevel(0.0);
      %object.setDamageState(Enabled);
   }
   if(%object.getDatablock().getName() $= "TurretBaseLarge")
   {
      // check to see if the turret base still has the same type of barrel it had
      // at the beginning of the mission
      if(%object.getMountedImage(0))
         if(%object.getMountedImage(0).getName() !$= %object.originalBarrel)
         {
            // pop the "new" barrel
            %object.unmountImage(0);
            // mount the original barrel
            %object.mountImage(%object.originalBarrel, 0, false);
         }
   }
}

function InteriorInstance::objectRestore(%this)
{
   // avoid console error spam
}

function Trigger::objectRestore(%this)
{
   // avoid console error spam
}

function TSStatic::objectRestore(%this)
{
   // avoid console error spam
}

function ForceFieldBare::objectRestore(%this)
{
   // avoid console error spam
}

// ------------------------------------------------------------------------
// Waypoint managing

function siegeGame::findObjectiveWaypoints(%game, %group)
{
	if(!%group)
		%group = nameToId("MissionGroup/Teams");
	
	for (%i = 0; %i < %group.getCount(); %i++)
	{
		%obj = %group.getObject(%i);
		if(%obj.getClassName() $= SimGroup)
		{
			%game.findObjectiveWaypoints(%obj);
		}
 		else if(%obj.needsObjectiveWaypoint)
 		{
 			%game.initializeWaypointAtObjective(%obj);
 		}
	}
}

function siegeGame::initializeWaypointAtObjective(%game, %object)
{
	// out with the old...jic
	if ( %object.waypoint )
   {
      if ( isObject( %object.waypoint ) )
		   %object.waypoint.delete();
      else
         %object.waypoint = "";   
   }

	if(%object.team == %game.offenseTeam)
		%team = %game.offenseTeam;
	else
		%team = (%game.offenseTeam == 1 ? 2 : 1);
	
	// to make the waypoint look a little prettier we are using the z from
	// position and the x and y from worldBoxCenter
	%posX = getWord(%object.getWorldBoxCenter(), 0);
	%posY = getWord(%object.getWorldBoxCenter(), 1);
	%posZ = getWord(%object.position, 2);

	%append = getTaggedString(%object.getDataBlock().targetTypeTag);

	%object.waypoint = new WayPoint() {
		position = %posX SPC %posY SPC %posZ;
		rotation = "1 0 0 0";
		scale = "1 1 1";
		dataBlock = "WayPointMarker";
		team = %team;
		name = getTaggedString(%object.nameTag) SPC %append;
	};
	MissionCleanup.add(%object.waypoint);
}

function siegeGame::switchWaypoint(%game, %waypoint)
{
	%team = %waypoint.team;
	%newTeam = (%team == 1 ? 2 : 1);
	
	%waypoint.team = %newTeam; 
}


function SiegeGame::gameOver(%game)
{
   //call the default
   DefaultGame::gameOver(%game);

   cancel(%game.timeThread);

   messageAll('MsgClearObjHud', "");
}

function SiegeGame::sendDebriefing( %game, %client )
{
   //if neither team captured
   %winnerName = "";
   if ( $teamScore[1] == 0 && $teamScore[2] == 0 )
      %winner = -1;

   //else see if team1 won
   else if ( $teamScore[1] > 0 && ( $teamScore[2] == 0 || $teamScore[1] < $teamScore[2] ) )
   {
      %winner = 1;
      %winnerName = $teamName[1];
   }

   //else see if team2 won
   else if ($teamScore[2] > 0 && ($teamScore[1] == 0 || $teamScore[2] < $teamScore[1]))
   {
      %winner = 2;
      %winnerName = $teamName[2];
   }

   //else see if it was a tie (right down to the millisecond - doubtful)
   else if ($teamScore[1] == $teamScore[2])
      %winner = 0;

   //send the winner message
   if (%winnerName $= 'Storm')
      messageClient( %client, 'MsgGameOver', "Match has ended.~wvoice/announcer/ann.stowins.wav" );
   else if (%winnerName $= 'Inferno')
      messageClient( %client, 'MsgGameOver', "Match has ended.~wvoice/announcer/ann.infwins.wav" );
   else
      messageClient( %client, 'MsgGameOver', "Match has ended.~wvoice/announcer/ann.gameover.wav" );

   // Mission result:
   if (%winner > 0)
   {
      if (%winner == 1)
      {  
         if ($teamScore[2] == 0)
            messageClient(%client, 'MsgDebriefResult', "", '<just:center>Team %1 wins!', $TeamName[1]);
         else
         {
            %timeDiffMS = $teamScore[2] - $teamScore[1];
            messageClient(%client, 'MsgDebriefResult', "", '<just:center>Team %1 won by capturing the base %2 faster!', $TeamName[1], %game.formatTime(%timeDiffMS, true));
         }
      }
      else
      {
         if ($teamScore[1] == 0)
            messageClient(%client, 'MsgDebriefResult', "", '<just:center>Team %1 wins!', $TeamName[2]);
         else
         {
            %timeDiffMS = $teamScore[1] - $teamScore[2];
            messageClient(%client, 'MsgDebriefResult', "", '<just:center>Team %1 won by capturing the base %2 faster!', $TeamName[2], %game.formatTime(%timeDiffMS, true));
         }
      }
   }
   else
      messageClient( %client, 'MsgDebriefResult', "", '<just:center>The mission ended in a tie.' );

   // Game summary:
   messageClient( %client, 'MsgDebriefAddLine', "", '<spush><color:00dc00><font:univers condensed:18>SUMMARY:<spop>' );
   %team1 = %game.offenseTeam == 1 ? 2 : 1;
   %team2 = %game.offenseTeam;
   if ( $teamScore[%team1] > 0 )
   {  
      %timeStr = %game.formatTime($teamScore[%team1], true);
      messageClient( %client, 'MsgDebriefAddLine', "", '<bitmap:bullet_2><lmargin:24>%1 captured the %2 base for Team %3 in %4.<lmargin:0>', %game.capPlayer[%team1], $TeamName[%team2], $TeamName[%team1], %timeStr);
   }
   else
      messageClient( %client, 'MsgDebriefAddLine', "", '<bitmap:bullet_2><lmargin:24>Team %1 failed to capture the base.<lmargin:0>', $TeamName[%team1]);

   if ( $teamScore[%team2] > 0 )
   {  
      %timeStr = %game.formatTime($teamScore[%team2], true);
      messageClient( %client, 'MsgDebriefAddLine', "", '<bitmap:bullet_2><lmargin:24>%1 captured the %2 base for Team %3 in %4.<lmargin:0>', %game.capPlayer[%team2], $TeamName[%team1], $TeamName[%team2], %timeStr);
   }
   else
      messageClient( %client, 'MsgDebriefAddLine', "", '<bitmap:bullet_2><lmargin:24>Team %1 failed to capture the base.<lmargin:0>', $TeamName[%team2]);

   // List out the team rosters:
   messageClient( %client, 'MsgDebriefAddLine', "", '\n<spush><color:00dc00><font:univers condensed:18><clip%%:50>%1</clip><lmargin%%:50><clip%%:50>%2</clip><spop>', $TeamName[1], $TeamName[2] );
   %max = $TeamRank[1, count] > $TeamRank[2, count] ? $TeamRank[1, count] : $TeamRank[2, count];
   for ( %line = 0; %line < %max; %line++ )
   {
      %plyr1 = $TeamRank[1, %line] $= "" ? "" : $TeamRank[1, %line].name;
      %plyr2 = $TeamRank[2, %line] $= "" ? "" : $TeamRank[2, %line].name;
      messageClient( %client, 'MsgDebriefAddLine', "", '<lmargin:0><clip%%:50> %1</clip><lmargin%%:50><clip%%:50> %2</clip>', %plyr1, %plyr2 );
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
            messageClient( %client, 'MsgDebriefAddLine', "", '\n<lmargin:0><spush><color:00dc00><font:univers condensed:18>OBSERVERS<spop>' );
            %header = true;
         }

         messageClient( %client, 'MsgDebriefAddLine', "", ' %1', %cl.name );
      }
   }
}

function SiegeGame::clientMissionDropReady(%game, %client)
{
   messageClient(%client, 'MsgClientReady', "", %game.class);

   for(%i = 1; %i <= %game.numTeams; %i++) 
   {
      %isOffense = (%i == %game.offenseTeam);
      messageClient(%client, 'MsgSiegeAddTeam', "", %i, $teamName[%i], %isOffense);
   }

   messageClient(%client, 'MsgMissionDropInfo', '\c0You are in mission %1 (%2).', $MissionDisplayName, $MissionTypeDisplayName, $ServerName ); 
   DefaultGame::clientMissionDropReady(%game, %client);
}

function SiegeGame::assignClientTeam(%game, %client, %respawn)
{
   DefaultGame::assignClientTeam(%game, %client, %respawn);
   
   // if player's team is not on top of objective hud, switch lines
   messageClient(%client, 'MsgCheckTeamLines', "", %client.team);
}

function SiegeGame::resetScore(%game, %client)
{
   %client.score = 0;
   %client.kills = 0;
   %client.deaths = 0;
   %client.suicides = 0;
   %client.objScore = 0;
   %client.teamKills = 0;
   %client.turretKills = 0;
   %client.offenseScore = 0;
   %client.defenseScore = 0;
}

//--------------- Scoring functions -----------------
function SiegeGame::recalcScore(%game, %cl)
{
   %killValue = %cl.kills * %game.SCORE_PER_KILL;
   %deathValue = %cl.deaths * %game.SCORE_PER_DEATH;

   if (%killValue - %deathValue == 0)
      %killPoints = 0;
   else
      %killPoints = (%killValue * %killValue) / (%killValue - %deathValue);

   %cl.offenseScore = %killPoints;
   %cl.offenseScore +=  %cl.teamKills * %game.SCORE_PER_TEAMKILL; // -1
   %cl.offenseScore += %cl.objScore;
   
   %cl.defenseScore =   %cl.turretKills * %game.SCORE_PER_TURRET_KILL;  // 1 

   %cl.score = %cl.offenseScore + %cl.defenseScore;
   %cl.score = mFloor(%cl.score);
   %game.recalcTeamRanks(%cl);
}

function SiegeGame::updateKillScores(%game, %clVictim, %clKiller, %damageType, %implement)
{
   if(%game.testTurretKill(%implement))   //check for turretkill before awarded a non client points for a kill
   {        
        %game.awardScoreTurretKill(%clVictim, %implement);  
   }
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

function SiegeGame::testValidRepair(%game, %obj)
{
   return ((%obj.lastDamagedByTeam != %obj.team) && (%obj.repairedBy.team == %obj.team));
}

function SiegeGame::genOnRepaired(%game, %obj, %objName)
{
      
   if (%game.testValidRepair(%obj))
   {
      %repairman = %obj.repairedBy;
      messageTeam(%repairman.team, 'msgGenRepaired', '\c0%1 repaired the %2 generator!', %repairman.name, %obj.nameTag);    
   }
}

function SiegeGame::stationOnRepaired(%game, %obj, %objName)
{
   if (%game.testValidRepair(%obj)) 
   {     
      %repairman = %obj.repairedBy;
      messageTeam(%repairman.team, 'msgStationRepaired', '\c0%1 repaired the %2 inventory station!', %repairman.name, %obj.nameTag);
   }
}

function SiegeGame::sensorOnRepaired(%game, %obj, %objName)
{
   if (%game.testValidRepair(%obj)) 
   {     
      %repairman = %obj.repairedBy;
      messageTeam(%repairman.team, 'msgSensorRepaired', '\c0%1 repaired the %2 pulse sensor!', %repairman.name, %obj.nameTag);
   }
}

function SiegeGame::turretOnRepaired(%game, %obj, %objName)
{
   if (%game.testValidRepair(%obj)) 
   {     
      %repairman = %obj.repairedBy;
      messageTeam(%repairman.team, 'msgTurretRepaired', '\c0%1 repaired the %2 turret!', %repairman.name, %obj.nameTag);
   }
}

function SiegeGame::vStationOnRepaired(%game, %obj, %objName)
{
   if (%game.testValidRepair(%obj)) 
   {     
      %repairman = %obj.repairedBy;
      messageTeam(%repairman.team, 'msgTurretRepaired', '\c0%1 repaired the %2 vehicle station!', %repairman.name, %obj.nameTag);
   }
}

function SiegeGame::halfTimeCountDown(%game, %time)
{
   %game.secondHalfCountDown = true;
   $MatchStarted = false;

   %timeMS = %time * 1000;
   %game.schedule(%timeMS, "startSecondHalf");
   notifyMatchStart(%timeMS);
   
   if(%timeMS > 30000)
      schedule(%timeMS - 30000, 0, "notifyMatchStart", 30000);
   if(%timeMS > 20000)
      schedule(%timeMS - 20000, 0, "notifyMatchStart", 20000);
   if(%timeMS > 10000)
      schedule(%timeMS - 10000, 0, "notifyMatchStart", 10000);
   if(%timeMS > 5000)
      schedule(%timeMS - 5000, 0, "notifyMatchStart", 5000);
   if(%timeMS > 4000)
      schedule(%timeMS - 4000, 0, "notifyMatchStart", 4000);
   if(%timeMS > 3000)
      schedule(%timeMS - 3000, 0, "notifyMatchStart", 3000);
   if(%timeMS > 2000)
      schedule(%timeMS - 2000, 0, "notifyMatchStart", 2000);
   if(%timeMS > 1000)
      schedule(%timeMS - 1000, 0, "notifyMatchStart", 1000);
}

function SiegeGame::applyConcussion(%game, %player)
{
}

function SiegeGame::updateScoreHud(%game, %client, %tag)
{
   %timeElapsedMS = getSimTime() - %game.startTimeMS;
   %curTimeLeftMS = %game.timeLimitMS - %timeElapsedMS;

   if (!$MatchStarted)
      %curTimeLeftStr = %game.formatTime(%game.timelimitMS, false);
   else
      %curTimeLeftStr = %game.formatTime(%curTimeLeftMS, false);

   // Send header:
   if (%game.firstHalf)
      messageClient( %client, 'SetScoreHudHeader', "", '<just:center>Team %1 has %2 to capture the base.', 
            $teamName[%game.offenseTeam], %curTimeLeftStr ); 
   else
      messageClient( %client, 'SetScoreHudHeader', "", '<just:center>Team %1 must capture the base within %2 to win.', 
            $teamName[%game.offenseTeam], %curTimeLeftStr );

   // Send subheader:
   messageClient( %client, 'SetScoreHudSubheader', "", '<tab:15,315>\t%1 (%2)\t%3 (%4)',
         $TeamName[1], $TeamRank[1, count], $TeamName[2], $TeamRank[2, count] );

   %index = 0;
   while (true)
   {
      if (%index >= $TeamRank[1, count] && %index >= $TeamRank[2, count])
         break;

      //get the team1 client info
      %team1Client = "";
      %team1ClientScore = "";
      %col1Style = "";
      if (%index < $TeamRank[1, count])
      {
         %team1Client = $TeamRank[1, %index];
         %team1ClientScore = %team1Client.score $= "" ? 0 : %team1Client.score;
         if ( %team1Client == %client )
            %col1Style = "<color:dcdcdc>";
      }

      //get the team2 client info
      %team2Client = "";
      %team2ClientScore = "";
      %col2Style = "";
      if (%index < $TeamRank[2, count])
      {
         %team2Client = $TeamRank[2, %index];
         %team2ClientScore = %team2Client.score $= "" ? 0 : %team2Client.score;
         if ( %team2Client == %client )
            %col2Style = "<color:dcdcdc>";
      }


      //if the client is not an observer, send the message
      if (%client.team != 0)
      {
         messageClient( %client, 'SetLineHud', "", %tag, %index, '<tab:20,320>\t<spush>%3<clip:200>%1</clip><spop>\t%4<clip:200>%2</clip>', 
               %team1Client.name, %team2Client.name, %col1Style, %col2Style );
      }
      //else for observers, create an anchor around the player name so they can be observed
      else
      {
         messageClient( %client, 'SetLineHud', "", %tag, %index, '<tab:20,320>\t<spush>%3<clip:200><a:gamelink\t%5>%1</a></clip><spop>\t%4<clip:200><a:gamelink\t%6>%2</a></clip>', 
               %team1Client.name, %team2Client.name, %col1Style, %col2Style, %team1Client, %team2Client );
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