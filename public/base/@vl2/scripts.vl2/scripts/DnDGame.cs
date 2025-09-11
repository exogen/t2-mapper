// DisplayName = Defend and Destroy

//--- GAME RULES BEGIN ---
//Destroy objectives and hold switches.
//Teams score 1 point for each switch held, and each Large Turret, Sensor, Generator, and Vehicle Station destroyed.
//The map ends when one team destroys all the enemy objectives and holds all switches, or the timelimit expires.
//--- GAME RULES END ---

//--------------------------------------------------------------------------------
//  <> Defend and Destroy <>
//
//  Version: 1.1.25026
//  Date: October 23, 2002
//  By: ZOD
//  http://www.planettribes.com/syrinx/
//
//  SCORING:
//
//  Teams get 1 point each time they destroy and enemy objective or hold a
//  flip flop switch.
//  
//  Objectives consist of vehicle stations, large and medium pulse sensors,
//  solar panels, generators and base turrets.
//--------------------------------------------------------------------------------

//exec the AI scripts
exec("scripts/aiDnD.cs");

$DnDVer = "1.1.25026";
if($Host::MarkDnDObjectives $= "")
   $Host::MarkDnDObjectives = 1;

function DnDGame::initGameVars(%game)
{
   %game.SCORE_PER_SUICIDE = 0; // z0dd - ZOD, 8/19/02. No penalty for suicide! Was -10
   %game.SCORE_PER_TEAMKILL = -5;
   %game.SCORE_PER_DEATH = 0;  

   %game.SCORE_PER_KILL = 5;
   %game.SCORE_PER_HEADSHOT = 1;
   %game.SCORE_PER_TURRET_KILL = 5;
   %game.SCORE_PER_TURRET_KILL_AUTO = 1;

   %game.SCORE_PER_OBJECT_DEFEND = 5; // Score for defending an objective

   %game.SCORE_PER_DESTROY_GEN = 10;
   %game.SCORE_PER_DESTROY_SOLAR = 8;
   %game.SCORE_PER_DESTROY_SENSOR = 4;
   %game.SCORE_PER_DESTROY_TURRET = 6;
   %game.SCORE_PER_DESTROY_ISTATION = 4;
   %game.SCORE_PER_DESTROY_ASTATION = 4;
   %game.SCORE_PER_DESTROY_VSTATION = 8;
   %game.SCORE_PER_DESTROY_TSTATION = 4;
   %game.SCORE_PER_DESTROY_SENTRY = 4;
   %game.SCORE_PER_DESTROY_DEP_SENSOR = 1;
   %game.SCORE_PER_DESTROY_DEP_INV = 2;
   %game.SCORE_PER_DESTROY_DEP_TUR = 3;
   %game.SCORE_PER_TK_DESTROY = -10; // Penalty for TKing equiptment, needs to be harsh.

   %game.SCORE_PER_PLYR_FLIPFLOP_CAP = 8;

   %game.SCORE_PER_DESTROY_SHRIKE    = 5;
   %game.SCORE_PER_DESTROY_BOMBER    = 8;
   %game.SCORE_PER_DESTROY_TRANSPORT = 5;
   %game.SCORE_PER_DESTROY_WILDCAT   = 5;
   %game.SCORE_PER_DESTROY_TANK      = 8;
   %game.SCORE_PER_DESTROY_MPB       = 12;
   %game.SCORE_PER_PASSENGER         = 2;

   %game.SCORE_PER_REPAIR_GEN = 8;
   %game.SCORE_PER_REPAIR_SOLAR = 6;
   %game.SCORE_PER_REPAIR_SENSOR = 2;
   %game.SCORE_PER_REPAIR_TURRET = 4;
   %game.SCORE_PER_REPAIR_ASTATION = 2;
   %game.SCORE_PER_REPAIR_ISTATION = 2;
   %game.SCORE_PER_REPAIR_VSTATION = 4;
   %game.SCORE_PER_REPAIR_TSTATION = 4;
   %game.SCORE_PER_REPAIR_SENTRY = 2;
   %game.SCORE_PER_REPAIR_DEP_SENSOR = 1;
   %game.SCORE_PER_REPAIR_DEP_TUR = 3;
   %game.SCORE_PER_REPAIR_DEP_INV = 2;

   %game.RADIUS_OBJECT_DEFENSE = 20;
   %game.TIME_REQ_PLYR_CAP_BONUS =	12 * 1000; // player must hold a switch 12 seconds to get a point for it.
   %game.TIME_REQ_TEAM_CAP_BONUS = 12 * 1000; // time after touching it takes for team to get a point
}

package DnDGame
{
   // z0dd - ZOD. From Classic MOD, placed here for base and mod compatibility.
   function teamDestroyMessage(%client, %msgType, %msgString, %a1, %a2, %a3, %a4, %a5, %a6)
   {
      %team = %client.team;
      %count = ClientGroup.getCount();
      for(%i = 0; %i < %count; %i++)
      {
         %recipient = ClientGroup.getObject(%i);
         if((%recipient.team == %team) && (%recipient != %client))
         {
            commandToClient(%recipient, 'TeamDestroyMessage', %msgType, %msgString, %a1, %a2, %a3, %a4, %a5, %a6);
         }
      }
   }

   function ShapeBaseData::onDestroyed(%data, %obj, %prevstate)
   {
      %scorer = %obj.lastDamagedBy;
      if(!isObject(%scorer))
         return;

      if((%scorer.getType() & $TypeMasks::GameBaseObjectType) && %scorer.getDataBlock().catagory $= "Vehicles")
      {
         %name = %scorer.getDatablock().getName();
         if(%name $= "BomberFlyer" || %name $= "AssaultVehicle")
            %gunnerNode = 1;
         else
            %gunnerNode = 0;

         if(%scorer.getMountNodeObject(%gunnerNode))
         {
            %destroyer = %scorer.getMountNodeObject(%gunnerNode).client;
            %scorer = %destroyer;
            %damagingTeam = %scorer.team;
         }
      }
      else if(%scorer.getClassName() $= "Turret")
      {
         if(%scorer.getControllingClient())
         {
            // manned turret
            %destroyer = %scorer.getControllingClient();
            %scorer = %destroyer;
            %damagingTeam = %scorer.team;
         }
         else
            %scorer = %scorer.owner; // unmanned turret
      }
      if(!%damagingTeam)
         %damagingTeam = %scorer.team;

      if(%damagingTeam != %obj.team)
      {
         if(!%obj.soiledByEnemyRepair)
         {
            Game.awardScoreStaticShapeDestroy(%scorer, %obj);
         }
      }
      else
      {
         if(!%obj.getDataBlock().deployedObject)
            Game.awardScoreTkDestroy(%scorer, %obj);
      }
      if(!%obj.objectiveCompleted && %obj.scoreValue)
      {
         messageAllExcept(%scorer, %damagingTeam, 'MsgDnDObjDisabled', '\c2%1 destroyed your %2 objective!', %scorer.name, Game.cleanWord(%obj.getDataBlock().targetTypeTag));
         %obj.objectiveCompleted = true;
         if(isObject(%obj.wayPointMarker))
            %obj.wayPointMarker.schedule(100, "delete");

         $teamScore[%damagingTeam]++;
         Game.checkScoreLimit(%damagingTeam);
      }
   }

   function ShapeBaseData::onDisabled(%data, %obj)
   {
      %obj.wasDisabled = true;
      Parent::onDisabled(%data, %obj);
   }

   function RepairGunImage::onRepair(%this, %obj, %slot)
   {
      Parent::onRepair(%this, %obj, %slot);
      %target = %obj.repairing;
      if(%target && %target.team != %obj.team)
      {
         %target.soiledByEnemyRepair = true;
      }
   }

   function StaticShapeData::objectiveInit(%data, %obj)
   {
      if(!%data.deployedObject && %obj.team > 0)
      {
         %class = %data.className;
         if(%class $= "Generator" || %class $= "Sensor" || %class $= "TurretBase")
         {
            %obj.objectiveCompleted = false;
            %obj.scoreValue = true;
            $numObjectives[%obj.team]++;
            if($Host::MarkDnDObjectives)
               Game.setupObjectiveMarker(%obj);
         }
      }
   }

   function StationVehicle::onAdd(%this, %obj)
   {
      // We use onAdd because objectiveInit is never called on v-stations.
      Parent::onAdd(%this, %obj);
      if(%obj.team > 0)
      {
         %obj.objectiveCompleted = false;
         %obj.scoreValue = true;
         $numObjectives[%obj.team]++;
         if($Host::MarkDnDObjectives)
            Game.setupObjectiveMarker(%obj);
      }
   }

   function FlipFlop::objectiveInit(%data, %flipflop)
   {
      Parent::objectiveInit(%data, %flipflop);
      %flipflop.tCapThread = "";
      %flipflop.pCapThread = "";
      %flipflop.scoreValue = true;
      for(%i = 1; %i <= Game.numTeams; %i++)
      {
         $numObjectives[%i]++;
      }
      %flipFlop.prevTeam = "";
   }

   function FlipFlop::playerTouch(%data, %flipflop, %player)
   {
      if(%flipflop.team != %player.client.team)
      {
	   Parent::playerTouch(%data, %flipflop, %player);
	   Game.startTimerPlayerFFCap(%player.client, %flipflop);
      }
   }
};

function DnDGame::setupObjectiveMarker(%game, %obj)
{
   %name = (getTaggedString(%obj.getDataBlock().targetNameTag) SPC getTaggedString(%obj.getDataBlock().targetTypeTag));
   %obj.wayPointMarker = new WayPoint() {
      position = %obj.getPosition();
      name = %name;
      dataBlock = "WayPointMarker";
      team = %obj.team;
   };
   MissionCleanup.add(%obj.wayPointMarker);
}

function serverCmdsetDnDMarkers(%client, %value)
{
   // USAGE: commandToServer('setDnDMarkers', 1);
   %val = deTag(%value);
   %adj = %val == 1 ? 1 : 0;
   %snd = '~wfx/misc/warning_beep.wav';
   %detail = (%adj ? "enabled" : "disabled");
   %name = %client.name;
   if(%client.isAdmin)
   {
      switch$ ( %adj )
      {
         case 0:
            %msg = '\c3%5: \c2Objective markers: \c3%4\c2, cycling mission.%1';
            $Host::MarkDnDObjectives = %adj;
            export( "$Host::*", "prefs/ServerPrefs.cs", false );
            if( isObject( Game ) )
               Game.gameOver();
      
            loadMission($CurrentMission, $CurrentMissionType, false);

         case 1:
            %msg = '\c3%5: \c2Objective markers: \c3%4\c2, cycling mission.%1';
            $Host::MarkDnDObjectives = %adj;
            export( "$Host::*", "prefs/ServerPrefs.cs", false );
            if( isObject( Game ) )
               Game.gameOver();
      
            loadMission($CurrentMission, $CurrentMissionType, false);

         default:
            messageClient(%client, 'MsgAdmin', '\c2Incorrect value, 0 disables markers, 1 enables markers.');
      }
      messageAll( 'MsgAdmin', %msg, %snd, %val, %adj, %detail, %name, $CurrentMission );
   }
   else
      messageClient(%client, 'MsgAdmin', '\c2Only Admins can use this command.');
}

/////////////////////////////////////////////////////////////////////////////////////////
// Team Functions ///////////////////////////////////////////////////////////////////////
/////////////////////////////////////////////////////////////////////////////////////////

function DnDGame::setUpTeams(%game)
{
   DefaultGame::setUpTeams(%game);

   // reset the visibility of team 0 (team is still defaulted as friendly)   
   setSensorGroupAlwaysVisMask(0, 0);
}

function DnDGame::clientMissionDropReady(%game, %client)
{
   messageClient(%client, 'MsgClientReady', "", %game.class);
   for(%i = 1; %i <= %game.numTeams; %i++)
   {
      messageClient(%client, 'MsgDnDAddTeam', "", %i, %game.getTeamName(%i), $teamScore[%i], %game.getScoreLimit(%i), -1, -1);
   }
   %game.populateTeamRankArray(%client);
   messageClient(%client, 'MsgYourRankIs', "", -1);

   messageClient(%client, 'MsgMissionDropInfo', '\c0You are in mission %1 (%2).', $MissionDisplayName, $MissionTypeDisplayName, $ServerName ); 
   DefaultGame::clientMissionDropReady(%game, %client);
}

function DnDGame::assignClientTeam(%game, %client, %respawn)
{
   DefaultGame::assignClientTeam(%game, %client, %respawn);
   // if player's team is not on top of objective hud, switch lines
   messageClient(%client, 'MsgCheckTeamLines', "", %client.team);
}

function DnDGame::getTeamSkin(%game, %team)
{
   if($Host::tournamentMode)
      return $teamSkin[%team];

   if(!$Host::useCustomSkins)
   {
      %terrain = MissionGroup.musicTrack;
      switch$(%terrain)
      {
         case "lush":
            if(%team == 1)
               %skin = 'beagle';
            else if(%team == 2)
               %skin = 'dsword';
            else
               %skin = 'base';
            
         case "badlands":
            if(%team == 1)
               %skin = 'swolf';
            else if(%team == 2)
               %skin = 'dsword';
            else
               %skin = 'base';
            
         case "ice":
            if(%team == 1)
               %skin = 'swolf';
            else if(%team == 2)
               %skin = 'beagle';
            else
               %skin = 'base';
            
         case "desert":
            if(%team == 1)
               %skin = 'cotp';
            else if(%team == 2)
               %skin = 'beagle';
            else %skin = 'base';
            
         case "Volcanic":
            if(%team == 1)
               %skin = 'dsword';
            else if(%team == 2)
               %skin = 'cotp';
            else
               %skin = 'base';
            
         default:
            if(%team == 2)
               %skin = 'baseb';
            else
               %skin = 'base';
      }
      if(%skin $= "")
         %skin = $teamSkin[%team];
   }
   else
      %skin = $teamSkin[%team];
    
   return %skin;
}

function DnDGame::getTeamName(%game, %team)
{
   if($Host::tournamentMode)
      return $TeamName[%team];

   if(!$Host::useCustomSkins)
   {
      %terrain = MissionGroup.musicTrack;
      switch$(%terrain)
      {
         case "lush":
            if(%team == 1)
               %name = 'Blood Eagle';
            else if(%team == 2)
               %name = 'Diamond Sword';

         case "badlands":
            if(%team == 1)
               %name = 'Starwolf';
            else if(%team == 2)
               %name = 'Diamond Sword';
        
         case "ice":
            if(%team == 1)
               %name = 'Starwolf';
            else if(%team == 2)
               %name = 'Blood Eagle';
        
         case "desert":
            if(%team == 1)
               %name = 'Phoenix';
            else if(%team == 2)
               %name = 'Blood Eagle';
        
         case "Volcanic":
            if(%team == 1)
               %name = 'Diamond Sword';
            else if(%team == 2)
               %name = 'Phoenix';
        
         default:
            if(%team == 2)
               %name = 'Inferno';
            else 
               %name = 'Storm';
      }
      if(%name $= "")
         %name = $teamName[%team];
   }
   else 
     %name = $TeamName[%team];

   return %name;
}

/////////////////////////////////////////////////////////////////////////////////////////
// Flip Flop Functions //////////////////////////////////////////////////////////////////
/////////////////////////////////////////////////////////////////////////////////////////

function DnDGame::startTimerPlayerFFCap(%game, %cl, %this)
{
   cancel(%this.pCapThread); //stop the last owner from collecting a cap bonus
   %this.pCapThread = %game.schedule(%game.TIME_REQ_PLYR_CAP_BONUS, "awardScorePlayerFFCap", %cl, %this);
   cancel(%this.tCapThread); //stop the old owners from collecting any cap bonus
   %this.tCapThread = %game.schedule(%game.TIME_REQ_TEAM_CAP_BONUS, "awardScoreTeamFFCap", %this.team, %this);
}

function DnDGame::stopScoreTimers(%game)
{
   // find all switches and cancel any timers associated with them
   %ffGroup = nameToId("MissionCleanup/FlipFlops");
   if(%ffGroup <= 0)
      return;

   for(%i = 0; %i < %ffGroup.getCount(); %i++)
   {
      %curFF = %ffGroup.getObject(%i);
      cancel(%curFF.pCapThread);
      cancel(%curFF.tCapThread);
   }
}

function DnDGame::countFlips(%game)
{
   return false;
}

function DnDGame::awardScorePlayerFFCap(%game, %cl, %this)
{
   if(!($missionRunning))
      return;

   %cl.flipFlopsCapped++;
   messageClient(%cl, 'msgFFDef', '\c0You received a %1 point bonus for holding the %2.', %game.SCORE_PER_PLYR_FLIPFLOP_CAP, %game.cleanWord(%this.name));	
   messageTeamExcept(%cl, 'msgFFDef', '\c0Teammate %1 received a %2 point bonus for holding the %3', %cl.name, %game.SCORE_PER_PLYR_FLIPFLOP_CAP, %game.cleanWord(%this.name));
   %game.recalcScore(%cl);
}

function DnDGame::awardScoreTeamFFCap(%game, %team, %this)
{
   if(!($missionRunning))
      return;

   cancel(%this.tCapThread);
   $teamScore[%team]++;
   if(%this.prevTeam)
      $teamScore[%this.prevTeam]--;

   %this.prevTeam = %team;
   %game.checkScoreLimit(%team);
}

/////////////////////////////////////////////////////////////////////////////////////////
// Scoring Functions ////////////////////////////////////////////////////////////////////
/////////////////////////////////////////////////////////////////////////////////////////

function DnDGame::checkScoreLimit(%game, %team)
{
   // Since checkScore limit is called for every score, announce the team.
   if ($missionRunning)
   {
      if (%game.getTeamName(%team) $= 'Inferno')
         messageAll("", '~wvoice/announcer/ann.infscores.wav');
      else if (%game.getTeamName(%team) $= 'Storm')
         messageAll("", '~wvoice/announcer/ann.stoscores.wav');
      else if (%game.getTeamName(%team) $= 'Phoenix')
         messageAll("", '~wvoice/announcer/ann.pxscore.wav');
      else if (%game.getTeamName(%team) $= 'Blood Eagle')
         messageAll("", '~wvoice/announcer/ann.bescore.wav');
      else if (%game.getTeamName(%team) $= 'Diamond Sword')
         messageAll("", '~wvoice/announcer/ann.dsscore.wav');
      else if (%game.getTeamName(%team) $= 'Starwolf')
         messageAll("", '~wvoice/announcer/ann.swscore.wav');
   }

   // Update everyones objective hud.
   for(%i = 1; %i <= %game.numTeams; %i++)
      messageAll('MsgDnDTeamScores', "", %i, %game.getTeamName(%i), $teamScore[%i], %game.getScoreLimit(%i), -1, -1, -1);

   %scoreLimit = %game.getScoreLimit(%team);
   if($teamScore[%team] >= %scoreLimit)
      %game.scoreLimitReached();
}

function DnDGame::getScoreLimit(%game, %team)
{
   // If we ever have more then two teams this must be changed.
   %otherTeam = %team == 1 ? 2 : 1;
   return $numObjectives[%otherTeam];
}

function DnDGame::timeLimitReached(%game)
{
   logEcho("game over (timelimit)");
   %game.gameOver();
   cycleMissions();
}

function DnDGame::scoreLimitReached(%game)
{
   logEcho("game over (scorelimit)");
   %game.gameOver();
   cycleMissions();
}

function DnDGame::gameOver(%game)
{
   // call the default
   DefaultGame::gameOver(%game);

   // stop all bonus timers
   %game.stopScoreTimers();

   //send the winner message
   %winner = "";
   if ($teamScore[1] > $teamScore[2])
      %winner = %game.getTeamName(1);
   else if ($teamScore[2] > $teamScore[1])
      %winner = %game.getTeamName(2);

   if (%winner $= 'Storm')
      messageAll('MsgGameOver', "Match has ended.~wvoice/announcer/ann.stowins.wav" );
   else if (%winner $= 'Inferno')
      messageAll('MsgGameOver', "Match has ended.~wvoice/announcer/ann.infwins.wav" );
   else if (%winner $= 'Starwolf')
      messageAll('MsgGameOver', "Match has ended.~wvoice/announcer/ann.swwin.wav" );
   else if (%winner $= 'Blood Eagle')
      messageAll('MsgGameOver', "Match has ended.~wvoice/announcer/ann.bewin.wav" );
   else if (%winner $= 'Diamond Sword')
      messageAll('MsgGameOver', "Match has ended.~wvoice/announcer/ann.dswin.wav" );
   else if (%winner $= 'Phoenix')
      messageAll('MsgGameOver', "Match has ended.~wvoice/announcer/ann.pxwin.wav" );
   else
      messageAll('MsgGameOver', "Match has ended.~wvoice/announcer/ann.gameover.wav" );

   messageAll('MsgClearObjHud', "");
   for(%i = 0; %i < ClientGroup.getCount(); %i++)
   {
      %client = ClientGroup.getObject(%i);
      %game.resetScore(%client);
   }
   for ( %team = 1; %team <= %game.numTeams; %team++ )
   {
      $TeamScore[%team] = 0;
      $numObjectives[%team] = 0;
   }
}

function DnDGame::onClientDamaged(%game, %clVictim, %clAttacker, %damageType, %implement, %damageLoc)
{ 
   if(%clVictim.headshot && %damageType == $DamageType::Laser && %clVictim.team != %clAttacker.team)
   {
      %clAttacker.scoreHeadshot++;
      if (%game.SCORE_PER_HEADSHOT != 0)
      {
         messageClient(%clAttacker, 'msgHeadshot', '\c0You received a %1 point bonus for a successful headshot.', %game.SCORE_PER_HEADSHOT);
      }
      %game.recalcScore(%clAttacker);
   }
   //the DefaultGame will set some vars
   DefaultGame::onClientDamaged(%game, %clVictim, %clAttacker, %damageType, %implement, %damageLoc);
}

function DnDGame::recalcScore(%game, %cl)
{
   %killValue = %cl.kills * %game.SCORE_PER_KILL;
   %deathValue = %cl.deaths * %game.SCORE_PER_DEATH;

   if (%killValue - %deathValue == 0)
      %killPoints = 0;
   else
      %killPoints = (%killValue * %killValue) / (%killValue - %deathValue);

   %cl.offenseScore = %killPoints +
                      %cl.suicides           * %game.SCORE_PER_SUICIDE +
                      %cl.escortAssists      * %game.SCORE_PER_ESCORT_ASSIST +
                      %cl.teamKills          * %game.SCORE_PER_TEAMKILL +
                      %cl.tkDestroys         * %game.SCORE_PER_TK_DESTROY +
                      %cl.scoreHeadshot      * %game.SCORE_PER_HEADSHOT +
                      %cl.flagCaps           * %game.SCORE_PER_PLYR_FLAG_CAP +
                      %cl.flagGrabs          * %game.SCORE_PER_PLYR_FLAG_TOUCH +
                      %cl.genDestroys        * %game.SCORE_PER_DESTROY_GEN +
                      %cl.sensorDestroys     * %game.SCORE_PER_DESTROY_SENSOR +
                      %cl.turretDestroys     * %game.SCORE_PER_DESTROY_TURRET +
                      %cl.IStationDestroys   * %game.SCORE_PER_DESTROY_ISTATION +
                      %cl.AStationDestroys   * %game.SCORE_PER_DESTROY_ASTATION +
                      %cl.vstationDestroys   * %game.SCORE_PER_DESTROY_VSTATION +
                      %cl.TStationDestroys   * %game.SCORE_PER_DESTROY_TSTATION +
                      %cl.solarDestroys      * %game.SCORE_PER_DESTROY_SOLAR +
                      %cl.sentryDestroys     * %game.SCORE_PER_DESTROY_SENTRY +
                      %cl.depSensorDestroys  * %game.SCORE_PER_DESTROY_DEP_SENSOR + 
                      %cl.depTurretDestroys  * %game.SCORE_PER_DESTROY_DEP_TUR + 
                      %cl.depStationDestroys * %game.SCORE_PER_DESTROY_DEP_INV +
                      %cl.flipFlopsCapped    * %game.SCORE_PER_PLYR_FLIPFLOP_CAP +
                      %cl.vehicleScore  + %cl.vehicleBonus;

   %cl.defenseScore = %cl.genDefends        * %game.SCORE_PER_OBJECT_DEFEND +
                      %cl.turretKills       * %game.SCORE_PER_TURRET_KILL_AUTO +  
                      %cl.mannedturretKills * %game.SCORE_PER_TURRET_KILL +  
                      %cl.genRepairs        * %game.SCORE_PER_REPAIR_GEN +
                      %cl.sensorRepairs     * %game.SCORE_PER_REPAIR_SENSOR +
                      %cl.turretRepairs     * %game.SCORE_PER_REPAIR_TURRET +
                      %cl.stationRepairs    * %game.SCORE_PER_REPAIR_ISTATION +
                      %cl.AStationRepairs   * %game.SCORE_PER_REPAIR_ASTATION +
                      %cl.VStationRepairs   * %game.SCORE_PER_REPAIR_VSTATION +
                      %cl.TStationRepairs   * %game.SCORE_PER_REPAIR_TSTATION +
                      %cl.solarRepairs      * %game.SCORE_PER_REPAIR_SOLAR +
                      %cl.sentryRepairs     * %game.SCORE_PER_REPAIR_SENTRY +
                      %cl.depStationRepairs * %game.SCORE_PER_REPAIR_DEP_SENSOR +
                      %cl.depInvRepairs     * %game.SCORE_PER_REPAIR_DEP_INV +
                      %cl.depTurretRepairs  * %game.SCORE_PER_REPAIR_DEP_TUR;

   %cl.score = mFloor(%cl.offenseScore + %cl.defenseScore);
   %game.recalcTeamRanks(%cl);
}

function DnDGame::resetScore(%game, %client)
{
   %client.kills = 0;
   %client.deaths = 0;
   %client.suicides = 0;
   %client.teamKills = 0;
   %client.tkDestroys = 0;
   %client.genDestroys = 0;
   %client.sensorDestroys = 0;
   %client.turretDestroys = 0;
   %client.IStationDestroys = 0;
   %client.AStationDestroys = 0;
   %client.vstationDestroys = 0;
   %client.TStationDestroys = 0;
   %client.solarDestroys = 0;
   %client.sentryDestroys = 0;
   %client.depSensorDestroys = 0;
   %client.depTurretDestroys = 0;
   %client.depStationDestroys = 0;
   %client.vehicleScore = 0;
   %client.vehicleBonus = 0;
   %client.flipFlopsCapped = 0;
   %client.offenseScore = 0;

   %client.objDefends = 0;
   %client.turretKills = 0;
   %client.mannedTurretKills = 0;
   %client.genRepairs = 0;
   %client.sensorRepairs = 0;
   %client.turretRepairs = 0;
   %client.stationRepairs = 0;
   %client.AStationRepairs = 0;
   %client.VStationRepairs = 0;
   %client.TStationRepairs = 0;
   %client.solarRepairs = 0;
   %client.sentryRepairs = 0;
   %client.sentryRepairs = 0;
   %client.depStationRepairs = 0;
   %client.depInvRepairs = 0;
   %client.defenseScore = 0;
   %client.score = 0;
   %client.outOfBounds = "";
}

function DnDGame::updateKillScores(%game, %clVictim, %clKiller, %damageType, %implement)
{
   // is this a vehicle kill rather than a player kill
   // console error message suppression
   if( isObject( %implement ) )
   {
      if( %implement.getDataBlock().getName() $= "AssaultPlasmaTurret" ||  %implement.getDataBlock().getName() $= "BomberTurret" ) // gunner
           %clKiller = %implement.vehicleMounted.getMountNodeObject(1).client;
      else if(%implement.getDataBlock().catagory $= "Vehicles") // pilot
           %clKiller = %implement.getMountNodeObject(0).client;             
   }

   if(%game.testTurretKill(%implement)) // check for turretkill before awarded a non client points for a kill
      %game.awardScoreTurretKill(%clVictim, %implement);
   else if(%game.testKill(%clVictim, %clKiller)) // verify victim was an enemy
   {
      %value = %game.awardScoreKill(%clKiller);
      %game.shareScore(%clKiller, %value);
      %game.awardScoreDeath(%clVictim);

      if(%game.testObjectDefend(%clVictim, %clKiller))
         %game.awardScoreObjectDefend(%clKiller);   
   }       
   else
   {        
      if (%game.testSuicide(%clVictim, %clKiller, %damageType)) // otherwise test for suicide
      {
         %game.awardScoreSuicide(%clVictim);     
      }
      else
      {
         if (%game.testTeamKill(%clVictim, %clKiller)) // otherwise test for a teamkill
            %game.awardScoreTeamKill(%clVictim, %clKiller);
      }
   }        
}

function DnDGame::vehicleDestroyed(%game, %vehicle, %destroyer)
{
   //vehicle name
   %data = %vehicle.getDataBlock();
   //%vehicleType = getTaggedString(%data.targetNameTag) SPC getTaggedString(%data.targetTypeTag);
   %vehicleType = getTaggedString(%data.targetTypeTag);
   if(%vehicleType !$= "MPB")
      %vehicleType = strlwr(%vehicleType);
    
   %enemyTeam = ( %destroyer.team == 1 ) ? 2 : 1;
   %scorer = 0;
   %multiplier = 1;
   %passengers = 0;
   for(%i = 0; %i < %data.numMountPoints; %i++)
      if(%vehicle.getMountNodeObject(%i))
         %passengers++;
    
   //what destroyed this vehicle
   if(%destroyer.client)
   {
       //it was a player, or his mine, satchel, whatever...
       %destroyer = %destroyer.client;
       %scorer = %destroyer;
        
       // determine if the object used was a mine
       if(%vehicle.lastDamageType == $DamageType::Mine)
           %multiplier = 2;
   }    
   else if(%destroyer.getClassName() $= "Turret")
   {
       if(%destroyer.getControllingClient())
       {
           //manned turret
           %destroyer = %destroyer.getControllingClient();
           %scorer = %destroyer;
       }
       else 
       {
           %destroyerName = "A turret";
           %multiplier = 0;
       }
   }    
   else if(%destroyer.getDataBlock().catagory $= "Vehicles")
   {
        // Vehicle vs vehicle kill!
        if(%name $= "BomberFlyer" || %name $= "AssaultVehicle")
            %gunnerNode = 1;
        else
            %gunnerNode = 0;
        
        if(%destroyer.getMountNodeObject(%gunnerNode))
        {
            %destroyer = %destroyer.getMountNodeObject(%gunnerNode).client;
            %scorer = %destroyer;
        }
        %multiplier = 3;
   }
   else  // Is there anything else we care about?
      return;

   if(%destroyerName $= "")
      %destroyerName = %destroyer.name;

   if(%vehicle.team == %destroyer.team) // team kill
   {
      %pref = (%vehicleType $= "Assault Tank") ? "an" : "a";
      messageAll( 'msgVehicleTeamDestroy', '\c0%1 TEAMKILLED %3 %2!', %destroyerName, %vehicleType, %pref);
   }
   else // legit kill
   {
       //messageTeamExcept(%destroyer, 'msgVehicleDestroy', '\c0%1 destroyed an enemy %2.', %destroyerName, %vehicleType);
       teamDestroyMessage(%destroyer, 'msgVehDestroyed', '\c5%1 destroyed an enemy %2!', %destroyerName, %vehicleType); // z0dd - ZOD, 8/20/02. Send teammates a destroy message
       messageTeam(%enemyTeam, 'msgVehicleDestroy', '\c0%1 destroyed your team\'s %2.', %destroyerName, %vehicleType);
       //messageClient(%destroyer, 'msgVehicleDestroy', '\c0You destroyed an enemy %1.', %vehicleType);
    
       if(%scorer)
       {
           %value = %game.awardScoreVehicleDestroyed(%scorer, %vehicleType, %multiplier, %passengers);
           %game.shareScore(%value);
       }
   }
}

function DnDGame::awardScoreVehicleDestroyed(%game, %client, %vehicleType, %mult, %passengers)
{ 
   if(%vehicleType $= "Grav Cycle")
       %base = %game.SCORE_PER_DESTROY_WILDCAT;
   else if(%vehicleType $= "Assault Tank")
       %base = %game.SCORE_PER_DESTROY_TANK;
   else if(%vehicleType $= "MPB")
       %base = %game.SCORE_PER_DESTROY_MPB;
   else if(%vehicleType $= "Turbograv")
       %base = %game.SCORE_PER_DESTROY_SHRIKE;
   else if(%vehicleType $= "Bomber")
       %base = %game.SCORE_PER_DESTROY_BOMBER;
   else if(%vehicleType $= "Heavy Transport")
       %base = %game.SCORE_PER_DESTROY_TRANSPORT;

   %total = ( %base * %mult ) + ( %passengers * %game.SCORE_PER_PASSENGER ); 

   %client.vehicleScore += %total;

   messageClient(%client, 'msgVehicleScore', '\c0You received a %1 point bonus for destroying an enemy %2.', %total, %vehicleType);
   %game.recalcScore(%client);
   return %total;
}

function DnDGame::shareScore(%game, %client, %amount)
{  
    //error("share score of"SPC %amount SPC "from client:" SPC %client); 
    // all of the player in the bomber and tank share the points
    // gained from any of the others
    %vehicle = %client.vehicleMounted;
    if(!%vehicle)
        return 0;

    %vehicleType = getTaggedString(%vehicle.getDataBlock().targetTypeTag);
    if(%vehicleType $= "Bomber" || %vehicleType $= "Assault Tank")
    {
        for(%i = 0; %i < %vehicle.getDataBlock().numMountPoints; %i++)
        {
            %occupant = %vehicle.getMountNodeObject(%i);
            if(%occupant)
            {
                %occCl = %occupant.client;
                if(%occCl != %client && %occCl.team == %client.team)
                {
                    // the vehicle has a valid teammate at this node
                    // share the score with them
                    %occCl.vehicleBonus += %amount;
                    %game.recalcScore(%occCl);
                }
            }
        }
    }
}

function DnDGame::testObjectDefend(%game, %victimID, %killerID)
{
   InitContainerRadiusSearch(%victimID.plyrPointOfDeath, %game.RADIUS_OBJECT_DEFENSE, $TypeMasks::StaticShapeObjectType);
   %objID = containerSearchNext();   
   while(%objID != 0) 
   {
     if((%objID.scoreValue && !%objID.objectiveCompleted) && (%objID.team == %killerID.team)) 
        return true;  //found the(a) killer's objective near the victim's point of death
     else
        %objID = containerSearchNext();     
   }
   return false; // didn't find a qualifying objective within required radius of victims point of death  
}

function DnDGame::awardScoreObjectDefend(%game, %killerID)
{
   %killerID.objDefends++;
   messageClient(%killerID, 'msgObjDef', '\c0You received a %1 point bonus for defending an objective.', %game.SCORE_PER_OBJECT_DEFEND);
   messageTeamExcept(%killerID, 'msgObjDef', '\c0Teammate %1 received a %2 point bonus for defending an objective.', %killerID.name, %game.SCORE_PER_OBJECT_DEFEND);
   %game.recalcScore(%killerID);
   return %game.SCORE_PER_OBJECT_DEFEND;
}

/////////////////////////////////////////////////////////////////////////////////////////
// Destroy Scoring Functions ////////////////////////////////////////////////////////////
/////////////////////////////////////////////////////////////////////////////////////////

function DnDGame::awardScoreTkDestroy(%game, %cl, %obj)
{
   %cl.tkDestroys++;
   teamDestroyMessage(%cl, 'msgTkDes', '\c5Teammate %1 destroyed your team\'s %3 objective!', %cl.name, %game.cleanWord(%obj.getDataBlock().targetTypeTag));
   messageClient(%cl, 'msgTkDes', '\c0You have been penalized %1 points for destroying your teams equiptment.', %game.SCORE_PER_TK_DESTROY);
   %game.recalcScore(%cl);
   %game.shareScore(%cl, %game.SCORE_PER_TK_DESTROY);
}

function DnDGame::awardScoreStaticShapeDestroy(%game, %cl, %obj)
{
   %dataName = %obj.getDataBlock().getName();
   switch$ ( %dataName )
   {
      case "GeneratorLarge":
         %cl.genDestroys++;
         %value = %game.SCORE_PER_DESTROY_GEN;
         %msgType = 'msgGenDes';
         %tMsg = '\c5%1 destroyed a %2 Generator!';
         %clMsg = '\c0You received a %1 point bonus for destroying an enemy generator.';

      case "SolarPanel":
         %cl.solarDestroys++;
         %value = %game.SCORE_PER_DESTROY_SOLAR;
         %msgType = 'msgSolarDes';
         %tMsg = '\c5%1 destroyed a %2 Solar Panel!';
         %clMsg = '\c0You received a %1 point bonus for destroying an enemy solar panel.';

      case "SensorLargePulse":
         %cl.sensorDestroys++;
         %value = %game.SCORE_PER_DESTROY_SENSOR;
         %msgType = 'msgSensorDes';
         %tMsg = '\c5%1 destroyed a %2 Sensor!';
         %clMsg = '\c0You received a %1 point bonus for destroying a large enemy pulse sensor.';

      case "SensorMediumPulse":
         %cl.sensorDestroys++;
         %value = %game.SCORE_PER_DESTROY_SENSOR;
         %msgType = 'msgSensorDes';
         %tMsg = '\c5%1 destroyed a %2 Sensor!';
         %clMsg = '\c0You received a %1 point bonus for destroying a medium enemy pulse sensor.';

      case "TurretBaseLarge":
         %cl.turretDestroys++;
         %value = %game.SCORE_PER_DESTROY_TURRET;
         %msgType = 'msgTurretDes';
         %tMsg = '\c5%1 destroyed a %2 Turret!';
         %clMsg = '\c0You received a %1 point bonus for destroying an enemy base turret.';

      case "StationInventory":
         %cl.IStationDestroys++;
         %value = %game.SCORE_PER_DESTROY_GEN;
         %msgType = 'msgInvDes';
         %tMsg = '\c5%1 destroyed a %2 Inventory Station!';
         %clMsg = '\c0You received a %1 point bonus for destroying an enemy inventory station.';

      case "StationAmmo":
         %cl.aStationDestroys++;
         %value = %game.SCORE_PER_DESTROY_ASTATION;
         %msgType = 'msgAmmoDes';
         %tMsg = '\c5%1 destroyed a % 2 Ammo Station!';
         %clMsg = '\c0You received a %1 point bonus for destroying an enemy ammo station.';

      case "StationVehicle":
         %cl.VStationDestroys++;
         %value = %game.SCORE_PER_DESTROY_VSTATION;
         %msgType = 'msgVSDes';
         %tMsg = '\c5%1 destroyed a Vehicle Station!';
         %clMsg = '\c0You received a %1 point bonus for destroying an enemy vehicle station.';

      case "SentryTurret":
         %cl.sentryDestroys++;
         %value = %game.SCORE_PER_DESTROY_SENTRY;
         %msgType = 'msgSentryDes';
         %tMsg = '\c5%1 destroyed a %2 Sentry Turret!';
         %clMsg = '\c0You received a %1 point bonus for destroying an enemy sentry turret.';

      case "DeployedMotionSensor":
         %cl.depSensorDestroys++;
         %value = %game.SCORE_PER_DESTROY_DEP_SENSOR;
         %msgType = 'msgDepSensorDes';
         %tMsg = '\c5%1 destroyed a Deployable Motion Sensor!';
         %clMsg = '\c0You received a %1 point bonus for destroying an enemy deployable motion sensor.';

      case "DeployedPulseSensor":
         %cl.depSensorDestroys++;
         %value = %game.SCORE_PER_DESTROY_DEP_SENSOR;
         %msgType = 'msgDepSensorDes';
         %tMsg = '\c5%1 destroyed a Deployable Pulse Sensor!';
         %clMsg = '\c0You received a %1 point bonus for destroying an enemy deployable pulse sensor.';

      case "TurretDeployedWallIndoor":
         %cl.depTurretDestroys++;
         %value = %game.SCORE_PER_DESTROY_DEP_TUR;
         %msgType = 'msgDepTurDes';
         %tMsg = '\c5%1 destroyed a Deployable Spider Clamp Turret!';
         %clMsg = '\c0You received a %1 point bonus for destroying an enemy deployable spider clamp turret.';

      case "TurretDeployedFloorIndoor":
         %cl.depTurretDestroys++;
         %value = %game.SCORE_PER_DESTROY_DEP_TUR;
         %msgType = 'msgDepTurDes';
         %tMsg = '\c5%1 destroyed a Deployable Spider Clamp Turret!';
         %clMsg = '\c0You received a %1 point bonus for destroying an enemy deployable spider clamp turret.';

      case "TurretDeployedCeilingIndoor":
         %cl.depTurretDestroys++;
         %value = %game.SCORE_PER_DESTROY_DEP_TUR;
         %msgType = 'msgDepTurDes';
         %tMsg = '\c5%1 destroyed a Deployable Spider Clamp Turret!';
         %clMsg = '\c0You received a %1 point bonus for destroying an enemy deployable spider clamp turret.';

      case "TurretDeployedOutdoor":
         %cl.depTurretDestroys++;
         %value = %game.SCORE_PER_DESTROY_DEP_TUR;
         %msgType = 'msgDepTurDes';
         %tMsg = '\c5%1 destroyed a Deployable Landspike Turret!';
         %clMsg = '\c0You received a %1 point bonus for destroying an enemy deployable landspike turret.';

      case "DeployedStationInventory":
         %cl.depStationDestroys++;
         %value = %game.SCORE_PER_DESTROY_DEP_INV;
         %msgType = 'msgDepInvDes';
         %tMsg = '\c5%1 destroyed a Deployable Inventory!';
         %clMsg = '\c0You received a %1 point bonus for destroying an enemy deployable inventory station.';

      case "MPBTeleporter":
         %cl.TStationDestroys++;
         %value = %game.SCORE_PER_DESTROY_TSTATION;
         %msgType = 'msgMPBTeleDes';
         %tMsg = '\c5%1 destroyed a MPB Teleport Station!';
         %clMsg = '\c0You received a %1 point bonus for destroying an enemy MPB teleport station.';

      default:
         return;
   }
   teamDestroyMessage(%cl, 'msgDestroyed', %tMsg, %cl.name, %obj.nameTag); // z0dd - ZOD, 8/20/02. Send teammates a destroy message
   messageClient(%cl, %msgType, %clMsg, %value, %dataName);
   %game.recalcScore(%cl);
   %game.shareScore(%scorer, %value);
}

function DnDGame::awardScoreTurretKill(%game, %victimID, %implement)
{
    if ((%killer = %implement.getControllingClient()) != 0) //award whoever might be controlling the turret
    {
        if (%killer == %victimID)
            %game.awardScoreSuicide(%victimID);
        else if (%killer.team == %victimID.team) //player controlling a turret killed a teammate     
        {
            %killer.teamKills++;
            %game.awardScoreTurretTeamKill(%victimID, %killer);
            %game.awardScoreDeath(%victimID);
        }
        else
        {
            %killer.mannedturretKills++;
            %game.recalcScore(%killer);
            %game.awardScoreDeath(%victimID);
        }     
    }   
    else if ((%killer = %implement.owner) != 0) //if it isn't controlled, award score to whoever deployed it
    {
        if (%killer.team == %victimID.team)       
        {
            %game.awardScoreDeath(%victimID);
        }
        else       
        {
            %killer.turretKills++;
            %game.recalcScore(%killer);
            %game.awardScoreDeath(%victimID);
        }
    }   
    //default is, no one was controlling it, no one owned it.  No score given.   
}

function DnDGame::testKill(%game, %victimID, %killerID)
{
   return ((%killerID != 0) && (%victimID.team != %killerID.team));
}

function DnDGame::awardScoreKill(%game, %killerID)
{
   %killerID.kills++;   
   %game.recalcScore(%killerID);    
   return %game.SCORE_PER_KILL;
}

/////////////////////////////////////////////////////////////////////////////////////////
// Repair Scoring Functions /////////////////////////////////////////////////////////////
/////////////////////////////////////////////////////////////////////////////////////////

function DnDGame::testValidRepair(%game, %obj)
{
    if(!%obj.wasDisabled)
        return false;
    else if(%obj.lastDamagedByTeam == %obj.team)
        return false;
    else if(%obj.team != %obj.repairedBy.team)
        return false;
    else 
    {
        if(%obj.soiledByEnemyRepair)
            %obj.soiledByEnemyRepair = false;
        return true;
    }
}

function DnDGame::objectRepaired(%game, %obj, %objName)
{
   %game.staticShapeOnRepaired(%obj, %objName);
   %obj.wasDisabled = false;
}

function DnDGame::staticShapeOnRepaired(%game, %obj, %objName)
{
   if (%game.testValidRepair(%obj))
   {
      %repairman = %obj.repairedBy;
      %dataName = %obj.getDataBlock().getName();
      switch$ (%dataName)
      {
         case "GeneratorLarge":
            %repairman.genRepairs++;
            %score = %game.SCORE_PER_REPAIR_GEN;
            %tMsgType = 'msgGenRepaired';
            %msgType = 'msgGenRep';
            %tMsg = '\c0%1 repaired the %2 Generator!';
            %clMsg = '\c0You received a %1 point bonus for repairing a generator.';

         case "SolarPanel":
            %repairman.solarRepairs++;
            %score = %game.SCORE_PER_REPAIR_SOLAR;
            %tMsgType = 'msgsolarRepaired';
            %msgType = 'msgsolarRep';
            %tMsg = '\c0%1 repaired the %2 Solar Panel!';
            %clMsg = '\c0You received a %1 point bonus for repairing a solar panel.';

         case "SensorLargePulse":
            %repairman.sensorRepairs++;
            %score = %game.SCORE_PER_REPAIR_SENSOR;
            %tMsgType = 'msgSensorRepaired';
            %msgType = 'msgSensorRep';
            %tMsg = '\c0%1 repaired the %2 Large Pulse Sensor!';
            %clMsg = '\c0You received a %1 point bonus for repairing a large pulse sensor.';

         case "SensorMediumPulse":
            %repairman.sensorRepairs++;
            %score = %game.SCORE_PER_REPAIR_SENSOR;
            %tMsgType = 'msgSensorRepaired';
            %msgType = 'msgSensorRep';
            %tMsg = '\c0%1 repaired the %2 Medium Pulse Sensor!';
            %clMsg = '\c0You received a %1 point bonus for repairing a medium pulse sensor.';

         case "DeployedMotionSensor":
            %repairman.depSensorRepairs++;
            %tMsgType = 'msgDepSensorRepaired';
            %msgType = 'msgDepSensorRep';
            %score = %game.SCORE_PER_REPAIR_DEP_SENSOR;
            %tMsg = '\c0%1 repaired a Deployed Motion Sensor!';
            %clMsg = '\c0You received a %1 point bonus for repairing a deployed motion sensor.';

         case "DeployedPulseSensor":
            %repairman.depSensorRepairs++;
            %score = %game.SCORE_PER_REPAIR_DEP_SENSOR;
            %tMsgType = 'msgDepSensorRepaired';
            %msgType = 'msgDepSensorRep';
            %tMsg = '\c0%1 repaired a Deployed Pulse Sensor!';
            %clMsg = '\c0You received a %1 point bonus for repairing a deployed pulse sensor.';

         case "StationInventory":
            %repairman.stationRepairs++;
            %score = %game.SCORE_PER_REPAIR_ISTATION;
            %tMsgType = 'msgStationRepaired';
            %msgType = 'msgIStationRep';
            %tMsg = '\c0%1 repaired the %2 Inventory Station!';
            %clMsg = '\c0You received a %1 point bonus for repairing a inventory station.';

         case "StationAmmo":
            %repairman.stationRepairs++;
            %score = %game.SCORE_PER_REPAIR_ASTATION;
            %tMsgType = 'msgStationRepaired';
            %msgType = 'msgAStationRep';
            %tMsg = '\c0%1 repaired the %2 Ammo Station!';
            %clMsg = '\c0You received a %1 point bonus for repairing a ammo station.';

         case "StationVehicle":
            %repairman.VStationRepairs++;
            %score = %game.SCORE_PER_REPAIR_VSTATION;
            %tMsgType = 'msgvstationRepaired';
            %msgType = 'msgVStationRep';
            %tMsg = '\c0%1 repaired the Vehicle Station!';
            %clMsg = '\c0You received a %1 point bonus for repairing a vehicle station.';

         case "TurretBaseLarge":
            %repairman.TurretRepairs++;
            %score = %game.SCORE_PER_REPAIR_TURRET;
            %tMsgType = 'msgTurretRepaired';
            %msgType = 'msgTurretRep';
            %tMsg = '\c0%1 repaired the %2 Turret!';
            %clMsg = '\c0You received a %1 point bonus for repairing a base turret.';

         case "SentryTurret":
            %repairman.sentryRepairs++;
            %score = %game.SCORE_PER_REPAIR_SENTRY;
            %tMsgType = 'msgsentryTurretRepaired';
            %msgType = 'msgSentryRep';
            %tMsg = '\c0%1 repaired the %2 Sentry Turret!';
            %clMsg = '\c0You received a %1 point bonus for repairing a sentry turret.';

         case "TurretDeployedWallIndoor":
            %repairman.depTurretRepairs++;
            %score = %game.SCORE_PER_REPAIR_DEP_TUR;
            %tMsgType = 'msgDepTurretRepaired';
            %msgType = 'msgDepTurretRep';
            %tMsg = '\c0%1 repaired a Spider Clamp Turret!';
            %clMsg = '\c0You received a %1 point bonus for repairing a deployable spider clamp turret.';

         case "TurretDeployedFloorIndoor":
            %repairman.depTurretRepairs++;
            %score = %game.SCORE_PER_REPAIR_DEP_TUR;
            %tMsgType = 'msgDepTurretRepaired';
            %msgType = 'msgDepTurretRep';
            %tMsg = '\c0%1 repaired a Spider Clamp Turret!';
            %clMsg = '\c0You received a %1 point bonus for repairing a deployable spider clamp turret.';

         case "TurretDeployedCeilingIndoor":
            %repairman.depTurretRepairs++;
            %score = %game.SCORE_PER_REPAIR_DEP_TUR;
            %tMsgType = 'msgDepTurretRepaired';
            %msgType = 'msgDepTurretRep';
            %tMsg = '\c0%1 repaired a Spider Clamp Turret!';
            %clMsg = '\c0You received a %1 point bonus for repairing a deployable spider clamp turret.';

         case "TurretDeployedOutdoor":
            %repairman.depTurretRepairs++;
            %score = %game.SCORE_PER_REPAIR_DEP_TUR;
            %tMsgType = 'msgDepTurretRepaired';
            %msgType = 'msgDepTurretRep';
            %tMsg = '\c0%1 repaired a Landspike Turret!';
            %clMsg = '\c0You received a %1 point bonus for repairing a deployable landspike turret.';

         case "DeployedStationInventory":
            %repairman.depInvRepairs++;
            %score = %game.SCORE_PER_REPAIR_DEP_INV;
            %tMsgType = 'msgDepInvRepaired';
            %msgType = 'msgDepInvRep';
            %tMsg = '\c0%1 repaired a Deployable Inventory!';
            %clMsg = '\c0You received a %1 point bonus for repairing a deployed inventory station.';

         case "MPBTeleporter":
            %repairman.TStationRepairs++;
            %score = %game.SCORE_PER_REPAIR_TSTATION;
            %tMsgType = 'msgMPBTeleRepaired';
            %msgType = 'msgMPBTeleRep';
            %tMsg = '\c0%1 repaired the MPB Teleporter Station!';
            %clMsg = '\c0You received a %1 point bonus for repairing a mpb teleporter station.';

         default:
            return;
      }
      teamRepairMessage(%repairman, %tMsgType, %tMsg, %repairman.name, %obj.nameTag);
      messageClient(%repairman, %msgType, %clMsg, %score, %dataName);
      %game.recalcScore(%repairman);
   }
}

/////////////////////////////////////////////////////////////////////////////////////////
// Misc Functions //////////////////////////////////////////////////////////////////////
/////////////////////////////////////////////////////////////////////////////////////////

function DnDGame::enterMissionArea(%game, %playerData, %player)
{
   %player.client.outOfBounds = false; 
   messageClient(%player.client, 'EnterMissionArea', '\c1You are back in the mission area.');
   logEcho(%player.client.nameBase @ " (pl " @ %player @ "/cl "@%player.client @ ") entered mission area");
   cancel(%player.alertThread);
}

function DnDGame::leaveMissionArea(%game, %playerData, %player)
{
   if(%player.getState() $= "Dead")
      return;
                                         
   %player.client.outOfBounds = true;
   messageClient(%player.client, 'LeaveMissionArea', '\c1You have left the mission area. Return or take damage.~wfx/misc/warning_beep.wav');
   logEcho(%player.client.nameBase @ " (pl " @ %player @ "/cl " @ %player.client @ ") left mission area");
   %player.alertThread = %game.schedule(1000, "DMAlertPlayer", 3, %player);
}

function DnDGame::DMAlertPlayer(%game, %count, %player)
{
   // MES - I commented below line out because it prints a blank line to chat window
   //messageClient(%player.client, 'MsgDMLeftMisAreaWarn', '~wfx/misc/red_alert.wav');
   if(%count > 1)
      %player.alertThread = %game.schedule(1000, "DMAlertPlayer", %count - 1, %player);
   else 
      %player.alertThread = %game.schedule(1000, "MissionAreaDamage", %player);
}

function DnDGame::MissionAreaDamage(%game, %player)
{
   if(%player.getState() !$= "Dead")
   {                                   
      %player.setDamageFlash(0.1);
      %prevHurt = %player.getDamageLevel();
      %player.setDamageLevel(%prevHurt + 0.05);
      %player.alertThread = %game.schedule(1000, "MissionAreaDamage", %player);
   }
   else
   {
      if(%player.alertThread !$= "")
      {
         cancel(%player.alertThread);
         %player.alertThread = "";
      }
      if(%player.client.team != 0)
      {
         %game.onClientKilled(%player.client, 0, $DamageType::OutOfBounds);
      }
   }
}

function DnDGame::applyConcussion(%game, %player)
{
   %player.throwPack();
   %player.throwWeapon();
}
