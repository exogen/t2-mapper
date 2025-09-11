// DisplayName = Capture the Flag

//--- GAME RULES BEGIN ---
//Prevent enemy from capturing your flag
//Score one point for grabbing the enemy's flag 
//To capture, your flag must be at its stand
//Score 100 points each time enemy flag is captured
//--- GAME RULES END ---

//exec the AI scripts
exec("scripts/aiCTF.cs");

//-- tracking  ---
function CTFGame::initGameVars(%game)
{
    
    if(isDemo())
    {
       %game.SCORE_PER_SUICIDE = -1; 
       %game.SCORE_PER_TEAMKILL = -1;
       %game.SCORE_PER_DEATH = -1;  

       %game.SCORE_PER_KILL = 1; 
       %game.SCORE_PER_PLYR_FLAG_CAP = 3;
       %game.SCORE_PER_TEAM_FLAG_CAP = 100;
       %game.SCORE_PER_TEAM_FLAG_TOUCH = 1;
       %game.SCORE_PER_GEN_DESTROY = 2;
       %game.SCORE_PER_ESCORT_ASSIST = 1;

       %game.SCORE_PER_TURRET_KILL = 1; 
       %game.SCORE_PER_FLAG_DEFEND = 1; 
       %game.SCORE_PER_CARRIER_KILL = 1;
       %game.SCORE_PER_FLAG_RETURN = 1;
       %game.SCORE_PER_GEN_DEFEND = 1;
       %game.SCORE_PER_GEN_REPAIR = 1;
       
       %game.FLAG_RETURN_DELAY = 45 * 1000; //45 seconds

       %game.TIME_CONSIDERED_FLAGCARRIER_THREAT = 3 * 1000;  //after damaging enemy flag carrier
       %game.RADIUS_GEN_DEFENSE = 20;  //meters
       %game.RADIUS_FLAG_DEFENSE = 20;  //meters 

	    %game.TOUCH_DELAY_MS = 20000;  //20 secs

       %game.fadeTimeMS = 2000;

       %game.notifyMineDist = 7.5;


       %game.stalemate = false;
       %game.stalemateObjsVisible = false;
       %game.stalemateTimeMS = 60000;
       %game.stalemateFreqMS = 15000;
       %game.stalemateDurationMS = 6000;
    }
    if( !isDemo() )
    {
       %game.SCORE_PER_SUICIDE                  = -10; 
       %game.SCORE_PER_TEAMKILL                 = -10;
       %game.SCORE_PER_DEATH                    = 0;  

       %game.SCORE_PER_KILL                     = 10; 
       %game.SCORE_PER_PLYR_FLAG_CAP            = 30;
       %game.SCORE_PER_PLYR_FLAG_TOUCH          = 20;
       %game.SCORE_PER_TEAM_FLAG_CAP            = 100;
       %game.SCORE_PER_TEAM_FLAG_TOUCH          = 1;
       %game.SCORE_PER_ESCORT_ASSIST            = 5;
       %game.SCORE_PER_HEADSHOT                 = 1;

       %game.SCORE_PER_TURRET_KILL              = 10;   // controlled
       %game.SCORE_PER_TURRET_KILL_AUTO         = 3;   // uncontrolled
       %game.SCORE_PER_FLAG_DEFEND              = 5; 
       %game.SCORE_PER_CARRIER_KILL             = 5;
       %game.SCORE_PER_FLAG_RETURN              = 10;
       %game.SCORE_PER_STALEMATE_RETURN         = 15;
       %game.SCORE_PER_GEN_DEFEND               = 5;
       
       %game.SCORE_PER_DESTROY_GEN              = 10;
       %game.SCORE_PER_DESTROY_SENSOR           = 4;
       %game.SCORE_PER_DESTROY_TURRET           = 5;
       %game.SCORE_PER_DESTROY_ISTATION         = 2;
       %game.SCORE_PER_DESTROY_VSTATION         = 5;
       %game.SCORE_PER_DESTROY_SOLAR            = 5;
       %game.SCORE_PER_DESTROY_SENTRY           = 4;
       %game.SCORE_PER_DESTROY_DEP_SENSOR       = 1;
       %game.SCORE_PER_DESTROY_DEP_INV          = 2;
       %game.SCORE_PER_DESTROY_DEP_TUR          = 3;
       
       %game.SCORE_PER_DESTROY_SHRIKE           = 5;
       %game.SCORE_PER_DESTROY_BOMBER           = 8;
       %game.SCORE_PER_DESTROY_TRANSPORT        = 5;
       %game.SCORE_PER_DESTROY_WILDCAT          = 5;
       %game.SCORE_PER_DESTROY_TANK             = 8;
       %game.SCORE_PER_DESTROY_MPB              = 12;
       %game.SCORE_PER_PASSENGER                = 2;
       
       %game.SCORE_PER_REPAIR_GEN               = 8;
       %game.SCORE_PER_REPAIR_SENSOR            = 1;
       %game.SCORE_PER_REPAIR_TURRET            = 4;
       %game.SCORE_PER_REPAIR_ISTATION          = 2;
       %game.SCORE_PER_REPAIR_VSTATION          = 4;
       %game.SCORE_PER_REPAIR_SOLAR             = 4;
       %game.SCORE_PER_REPAIR_SENTRY            = 2;
       %game.SCORE_PER_REPAIR_DEP_TUR           = 3;
       %game.SCORE_PER_REPAIR_DEP_INV           = 2;
       
       %game.FLAG_RETURN_DELAY = 45 * 1000; //45 seconds

       %game.TIME_CONSIDERED_FLAGCARRIER_THREAT = 3 * 1000;  //after damaging enemy flag carrier
       %game.RADIUS_GEN_DEFENSE = 20;  //meters
       %game.RADIUS_FLAG_DEFENSE = 20;  //meters 

	    %game.TOUCH_DELAY_MS = 20000;  //20 secs

       %game.fadeTimeMS = 2000;

       %game.notifyMineDist = 7.5;


       %game.stalemate = false;
       %game.stalemateObjsVisible = false;
       %game.stalemateTimeMS = 60000;
       %game.stalemateFreqMS = 15000;
       %game.stalemateDurationMS = 6000;
    }
    
}

package CTFGame {

function ShapeBaseData::onDestroyed(%data, %obj)
{
    %scorer = %obj.lastDamagedBy;
    if(!isObject(%scorer))
       return;
    
    if( (%scorer.getType() & $TypeMasks::GameBaseObjectType) && 
       %scorer.getDataBlock().catagory $= "Vehicles" )
    {
        // ---------------------------------------------
        // z0dd - ZOD, 6/18/02. %name was never defined.
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
            //manned turret
            %destroyer = %scorer.getControllingClient();
            %scorer = %destroyer;
            %damagingTeam = %scorer.team;
        }
        else return;  //unmanned turret
    }
    
    if(!%damagingTeam)
        %damagingTeam = %scorer.team;
       
    if(%damagingTeam == %obj.team)
    {
        //error("team objects dont score");
        return;
    }
    
    if(%obj.soiledByEnemyRepair)
    {
        //error(%obj SPC "was once repiared by an enemy.  No destruction points.");
        return;
    }
    
    %objType = %obj.getDataBlock().getName();
    if(%objType $= "GeneratorLarge")
    {
        %score = game.awardScoreGenDestroy(%scorer);
        game.shareScore(%scorer, %score);
    }
    else if(%objType $= "SensorLargePulse" || %objType $= "SensorMediumPulse")
    {
        %score = game.awardScoreSensorDestroy(%scorer);
        game.shareScore(%scorer, %score);
    }
    else if(%objType $= "TurretBaseLarge")
    {
        %score = game.awardScoreTurretDestroy(%scorer);
        game.shareScore(%scorer, %score);
    }
    else if(%objType $= "StationInventory")
    {
        %score = game.awardScoreInvDestroy(%scorer);
        game.shareScore(%scorer, %score);
    }
    else if(%objType $= "StationVehicle")
    {
        %score = game.awardScoreVehicleStationDestroy(%scorer);
        game.shareScore(%scorer, %score);
    }    
    else if(%objType $= "SolarPanel")
    {
        %score = game.awardScoreSolarDestroy(%scorer);
        game.shareScore(%score, %score);
    }
    else if(%objType $= "SentryTurret")
    {
        %score = game.awardScoreSentryDestroy(%scorer);
        game.shareScore(%scorer, %score);
    }
    else if(%objType $= "DeployedMotionSensor" || %objType $= "DeployedPulseSensor")
    {
        %score = game.awardScoreDepSensorDestroy(%scorer);
        game.shareScore(%scorer, %score);
    }
    else if(%objType $= "TurretDeployedWallIndoor" || %objType $= "TurretDeployedFloorIndoor" ||
        %objType $= "TurretDeployedCeilingIndoor" || %objType $= "TurretDeployedOutdoor")
    {
        %score = game.awardScoreDepTurretDestroy(%scorer);
        game.shareScore(%scorer, %score);
    }
    else if(%objType $= "DeployedStationInventory")
    {
        %score = game.awardScoreDepStationDestroy(%scorer);
        game.shareScore(%scorer, %score);
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
        //error("Enemy stuff("@%obj@") is being repaired (by "@%target@")");
        %target.soiledByEnemyRepair = true;
    }
}


function Flag::objectiveInit(%data, %flag)
{
   if (!%flag.isTeamSkinned)
   {
      %pos = %flag.getTransform();
      %group = %flag.getGroup();
   }
   %flag.originalPosition = %flag.getTransform();
   $flagPos[%flag.team] = %flag.originalPosition;
   %flag.isHome = true;
   %flag.carrier = "";
   %flag.grabber = "";
   setTargetSkin(%flag.getTarget(), CTFGame::getTeamSkin(CTFGame, %flag.team));
   setTargetSensorGroup(%flag.getTarget(), %flag.team);
   setTargetAlwaysVisMask(%flag.getTarget(), 0x7);
   setTargetRenderMask(%flag.getTarget(), getTargetRenderMask(%flag.getTarget()) | 0x2);
   %flag.scopeWhenSensorVisible(true);
   $flagStatus[%flag.team] = "<At Base>";

   //Point the flag and stand at each other
   %group = %flag.getGroup();
   %count = %group.getCount();
   %flag.stand = "";
   for(%i = 0; %i < %count; %i++)
   {
      %this = %group.getObject(%i);

      //---------------------------------------------------------------------------------------------------------------------------
      // z0dd - ZOD, 3/16/02. Added TSStatic class, to fix console spam.
      //if((%this.getClassName() !$= "InteriorInstance") && (%this.getClassName() !$= "SimGroup"))
      if(%this.getClassName() !$= "InteriorInstance" && %this.getClassName() !$= "SimGroup" && %this.getClassName() !$= "TSStatic")
      {
         if(%this.getDataBlock().getName() $= "ExteriorFlagStand")
         {
            %flag.stand = %this;
            %this.flag = %flag;
         }
      }
   }

   // set the nametag on the target
   setTargetName(%flag.getTarget(), CTFGame::getTeamName(CTFGame, %flag.team));

   // create a marker on this guy
   %flag.waypoint = new MissionMarker() {
      position = %flag.getTransform();
      dataBlock = "FlagMarker";
   };
   MissionCleanup.add(%flag.waypoint);

   // create a target for this (there is no MissionMarker::onAdd script call)
   %target = createTarget(%flag.waypoint, CTFGame::getTeamName( CTFGame, %flag.team), "", "", 'Base', %flag.team, 0);
   setTargetAlwaysVisMask(%target, 0xffffffff);

   //store the flag in an array
   $TeamFlag[%flag.team] = %flag;

   // ------------------------------------------
   // z0dd - ZOD, 5/27/02. Fixes flags hovering
   // over friendly player when collision occurs
   %flag.static = true;
}

function Flag::onEnterLiquid(%data, %obj, %coverage, %type)
{
    if(%type > 3)  // 1-3 are water, 4+ is lava and quicksand(?)
    {
        //error("flag("@%obj@") is in liquid type" SPC %type);
        game.schedule(3000, flagReturn, %obj);
    }
}

};

//--------------------------------------------------------------------------
// need to have this for the corporate maps which could not be fixed
function SimObject::clearFlagWaypoints(%this)
{
}

function WayPoint::clearFlagWaypoints(%this)
{
   logEcho("Removing flag waypoint: " @ %this);
   if(%this.nameTag $= "Flag")
      %this.delete();
}

function SimGroup::clearFlagWaypoints(%this)
{
   for(%i = %this.getCount() - 1; %i >= 0; %i--)
      %this.getObject(%i).clearFlagWaypoints();
}

function CTFGame::getTeamSkin(%game, %team)
{

    if(isDemo() || $host::tournamentMode)
    {
        return $teamSkin[%team];
    }

    else
    {
    //error("CTFGame::getTeamSkin");
    if(!$host::useCustomSkins)
    {
        %terrain = MissionGroup.musicTrack;
        //error("Terrain type is: " SPC %terrain);
        switch$(%terrain)
        {
            case "lush":
                if(%team == 1)
                    %skin = 'beagle';
                else if(%team == 2)
                    %skin = 'dsword';
                else %skin = 'base';
            
            case "badlands":
                if(%team == 1)
                    %skin = 'swolf';
                else if(%team == 2)
                    %skin = 'dsword';
                else %skin = 'base';
            
            case "ice":
                if(%team == 1)
                    %skin = 'swolf';
                else if(%team == 2)
                    %skin = 'beagle';
                else %skin = 'base';
            
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
                else %skin = 'base';
            
            default:
                if(%team == 2)
                    %skin = 'baseb';
                else %skin = 'base';
        }
    }
    else %skin = $teamSkin[%team];
    
    //error("%skin = " SPC getTaggedString(%skin));
    return %skin;
}
}

function CTFGame::getTeamName(%game, %team)
{
   if ( isDemo() || $host::tournamentMode)
       return $TeamName[%team];

   //error("CTFGame::getTeamName");
   if(!$host::useCustomSkins)
   {
      %terrain = MissionGroup.musicTrack;
      //error("Terrain type is: " SPC %terrain);
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
      {
         //error("No team Name =============================");
         %name = $teamName[%team];
      }
   }
   else 
     %name = $TeamName[%team];

   //error("%name = " SPC getTaggedString(%name));
   return %name;
}

//--------------------------------------------------------------------------
function CTFGame::missionLoadDone(%game)
{
   //default version sets up teams - must be called first...
   DefaultGame::missionLoadDone(%game);

   for(%i = 1; %i < (%game.numTeams + 1); %i++)
      $teamScore[%i] = 0;

   // remove 
   MissionGroup.clearFlagWaypoints();

   //reset some globals, just in case...
	$dontScoreTimer[1] = false;
	$dontScoreTimer[2] = false;

   echo( "starting camp thread..." );
   %game.campThread_1 = schedule( 1000, 0, "checkVehicleCamping", 1 );
   %game.campThread_2 = schedule( 1000, 0, "checkVehicleCamping", 2 );
}

function CTFGame::playerTouchFlag(%game, %player, %flag)
{
   %client = %player.client;
   
   if ((%flag.carrier $= "") && (%player.getState() !$= "Dead"))
   {
      //flag isn't held and has been touched by a live player
      if (%client.team == %flag.team)
         %game.playerTouchOwnFlag(%player, %flag);
      else
         %game.playerTouchEnemyFlag(%player, %flag);
   }

   // toggle visibility of the flag
   setTargetRenderMask(%flag.waypoint.getTarget(), %flag.isHome ? 0 : 1);
   
}

function CTFGame::playerTouchOwnFlag(%game, %player, %flag)
{   
   if(%flag.isHome)
   {
      if (%player.holdingFlag !$= "")      
         %game.flagCap(%player);
   }
   else      
      %game.flagReturn(%flag, %player);
            
   //call the AI function
   %game.AIplayerTouchOwnFlag(%player, %flag);            
}

function CTFGame::playerTouchEnemyFlag(%game, %player, %flag)
{
   %client = %player.client;
   %player.holdingFlag = %flag;  //%player has this flag
   %flag.carrier = %player;  //this %flag is carried by %player

    %player.mountImage(FlagImage, $FlagSlot, true, %game.getTeamSkin(%flag.team));

   %game.playerGotFlagTarget(%player);
   //only cancel the return timer if the player is in bounds...
   if (!%client.outOfBounds)
   {
      cancel($FlagReturnTimer[%flag]);
      $FlagReturnTimer[%flag] = "";
   }

   //if this flag was "at home", see if both flags have now been taken
   if (%flag.isHome)
   {
		// tiebreaker score
		game.awardScoreFlagTouch( %client, %flag );

      %startStalemate = false;
      if ($TeamFlag[1] == %flag)
         %startStalemate = !$TeamFlag[2].isHome;
      else
         %startStalemate = !$TeamFlag[1].isHome;

      if (%startStalemate)
         %game.stalemateSchedule = %game.schedule(%game.stalemateTimeMS, beginStalemate);
   
   }

   %flag.hide(true);
   %flag.startFade(0, 0, false);         
   %flag.isHome = false;
   if(%flag.stand)
      %flag.stand.getDataBlock().onFlagTaken(%flag.stand);//animate, if exterior stand

   $flagStatus[%flag.team] = %client.nameBase;
   %teamName = %game.getTeamName(%flag.team);
   messageTeamExcept(%client, 'MsgCTFFlagTaken', '\c2Teammate %1 took the %2 flag.~wfx/misc/flag_snatch.wav', %client.name, %teamName, %flag.team, %client.nameBase);
   messageTeam(%flag.team, 'MsgCTFFlagTaken', '\c2Your flag has been taken by %1!~wfx/misc/flag_taken.wav',%client.name, 0, %flag.team, %client.nameBase);
   messageTeam(0, 'MsgCTFFlagTaken', '\c2%1 took the %2 flag.~wfx/misc/flag_snatch.wav', %client.name, %teamName, %flag.team, %client.nameBase);
   messageClient(%client, 'MsgCTFFlagTaken', '\c2You took the %2 flag.~wfx/misc/flag_snatch.wav', %client.name, %teamName, %flag.team, %client.nameBase);     
   logEcho(%client.nameBase@" (pl "@%player@"/cl "@%client@") took team "@%flag.team@" flag");
   
   //call the AI function
   %game.AIplayerTouchEnemyFlag(%player, %flag);

   //if the player is out of bounds, then in 3 seconds, it should be thrown back towards the in bounds area...
   if (%client.outOfBounds)
      %game.schedule(3000, "boundaryLoseFlag", %player);
}

function CTFGame::playerGotFlagTarget(%game, %player)
{
   %player.scopeWhenSensorVisible(true);
   %target = %player.getTarget();
   setTargetRenderMask(%target, getTargetRenderMask(%target) | 0x2);
   if(%game.stalemateObjsVisible)
      setTargetAlwaysVisMask(%target, 0x7);
}

function CTFGame::playerLostFlagTarget(%game, %player)
{
   %player.scopeWhenSensorVisible(false);
   %target = %player.getTarget();
   setTargetRenderMask(%target, getTargetRenderMask(%target) & ~0x2);
   // clear his always vis target mask
   setTargetAlwaysVisMask(%target, (1 << getTargetSensorGroup(%target)));
}

function CTFGame::playerDroppedFlag(%game, %player)
{
   %client = %player.client;
   %flag = %player.holdingFlag;

   %game.playerLostFlagTarget(%player);

   %player.holdingFlag = ""; //player isn't holding a flag anymore
   %flag.carrier = "";  //flag isn't held anymore 
   $flagStatus[%flag.team] = "<In the Field>";
   
   %player.unMountImage($FlagSlot);   
   %flag.hide(false); //Does the throwItem function handle this?   

    %teamName = %game.getTeamName(%flag.team);
   messageTeamExcept(%client, 'MsgCTFFlagDropped', '\c2Teammate %1 dropped the %2 flag.~wfx/misc/flag_drop.wav', %client.name, %teamName, %flag.team);
   messageTeam(%flag.team, 'MsgCTFFlagDropped', '\c2Your flag has been dropped by %1!~wfx/misc/flag_drop.wav', %client.name, 0, %flag.team);
   messageTeam(0, 'MsgCTFFlagDropped', '\c2%1 dropped the %2 flag.~wfx/misc/flag_drop.wav', %client.name, %teamName, %flag.team);
   if(!%player.client.outOfBounds)
      messageClient(%client, 'MsgCTFFlagDropped', '\c2You dropped the %2 flag.~wfx/misc/flag_drop.wav', 0, %teamName, %flag.team);
   logEcho(%client.nameBase@" (pl "@%player@"/cl "@%client@") dropped team "@%flag.team@" flag");

   //don't duplicate the schedule if there's already one in progress...
   if ($FlagReturnTimer[%flag] <= 0)
      $FlagReturnTimer[%flag] = %game.schedule(%game.FLAG_RETURN_DELAY - %game.fadeTimeMS, "flagReturnFade", %flag);
     
   //call the AI function
   %game.AIplayerDroppedFlag(%player, %flag);
}

function CTFGame::flagCap(%game, %player)
{
   %client = %player.client;
   %flag = %player.holdingFlag;
   %flag.carrier = "";

   %game.playerLostFlagTarget(%player);
   //award points to player and team
   %teamName = %game.getTeamName(%flag.team);
   messageTeamExcept(%client, 'MsgCTFFlagCapped', '\c2%1 captured the %2 flag!~wfx/misc/flag_capture.wav', %client.name, %teamName, %flag.team, %client.team);
   messageTeam(%flag.team, 'MsgCTFFlagCapped', '\c2Your flag was captured by %1.~wfx/misc/flag_lost.wav', %client.name, 0, %flag.team, %client.team); 
   messageTeam(0, 'MsgCTFFlagCapped', '\c2%1 captured the %2 flag!~wfx/misc/flag_capture.wav', %client.name, %teamName, %flag.team, %client.team); 
   messageClient(%client, 'MsgCTFFlagCapped', '\c2You captured the %2 flag!~wfx/misc/flag_capture.wav', 0, %teamName, %flag.team, %client.team);

   logEcho(%client.nameBase@" (pl "@%player@"/cl "@%client@") capped team "@%client.team@" flag");
   %player.holdingFlag = ""; //no longer holding it.
   %player.unMountImage($FlagSlot);
   %game.awardScoreFlagCap(%client, %flag);   
   %game.flagReset(%flag);
     
   //call the AI function
   %game.AIflagCap(%player, %flag);

   //if this cap didn't end the game, play the announcer...
   if ($missionRunning)
   {
      if (%game.getTeamName(%client.team) $= 'Inferno')
         messageAll("", '~wvoice/announcer/ann.infscores.wav');
      else if (%game.getTeamName(%client.team) $= 'Storm')
         messageAll("", '~wvoice/announcer/ann.stoscores.wav');
      else if (%game.getTeamName(%client.team) $= 'Phoenix')
         messageAll("", '~wvoice/announcer/ann.pxscore.wav');
      else if (%game.getTeamName(%client.team) $= 'Blood Eagle')
         messageAll("", '~wvoice/announcer/ann.bescore.wav');
      else if (%game.getTeamName(%client.team) $= 'Diamond Sword')
         messageAll("", '~wvoice/announcer/ann.dsscore.wav');
      else if (%game.getTeamName(%client.team) $= 'Starwolf')
         messageAll("", '~wvoice/announcer/ann.swscore.wav');
   }
}

function CTFGame::flagReturnFade(%game, %flag)
{
   $FlagReturnTimer[%flag] = %game.schedule(%game.fadeTimeMS, "flagReturn", %flag);
   %flag.startFade(%game.fadeTimeMS, 0, true);
}

function CTFGame::flagReturn(%game, %flag, %player)
{
   cancel($FlagReturnTimer[%flag]);
   $FlagReturnTimer[%flag] = "";

   if(%flag.team == 1)
      %otherTeam = 2;
   else
      %otherTeam = 1;
   %teamName = %game.getTeamName(%flag.team);
   if (%player !$= "")
   {
      //a player returned it
      %client = %player.client;
      messageTeamExcept(%client, 'MsgCTFFlagReturned', '\c2Teammate %1 returned your flag to base.~wfx/misc/flag_return.wav', %client.name, 0, %flag.team);
      messageTeam(%otherTeam, 'MsgCTFFlagReturned', '\c2Enemy %1 returned the %2 flag.~wfx/misc/flag_return.wav', %client.name, %teamName, %flag.team);
      messageTeam(0, 'MsgCTFFlagReturned', '\c2%1 returned the %2 flag.~wfx/misc/flag_return.wav', %client.name, %teamName, %flag.team);
      messageClient(%client, 'MsgCTFFlagReturned', '\c2You returned your flag.~wfx/misc/flag_return.wav', 0, %teamName, %flag.team);
      logEcho(%client.nameBase@" (pl "@%player@"/cl "@%client@") returned team "@%flag.team@" flag");
      
      // find out what type of return it is
      // stalemate return?
      if(!isDemo())
      {
          if(%game.stalemate)
          {
            //error("Stalemate return!!!");
            %game.awardScoreStalemateReturn(%player.client);
          }
          // regular return
          else
          {
            %enemyFlagDist = vectorDist($flagPos[%flag.team], $flagPos[%otherTeam]);
            %dist = vectorDist(%flag.position, %flag.originalPosition);
        
            %rawRatio = %dist/%enemyFlagDist;
            %ratio = %rawRatio < 1 ? %rawRatio : 1;
            %percentage = mFloor( (%ratio) * 10 ) * 10;
            %game.awardScoreFlagReturn(%player.client, %percentage); 
          }
      }
      else %game.awardScoreFlagReturn(%player.client); 
   }      
   else
   {
      //returned due to timer
      messageTeam(%otherTeam, 'MsgCTFFlagReturned', '\c2The %2 flag was returned to base.~wfx/misc/flag_return.wav', 0, %teamName, %flag.team);  //because it was dropped for too long
      messageTeam(%flag.team, 'MsgCTFFlagReturned', '\c2Your flag was returned.~wfx/misc/flag_return.wav', 0, 0, %flag.team);
      messageTeam(0, 'MsgCTFFlagReturned', '\c2The %2 flag was returned to base.~wfx/misc/flag_return.wav', 0, %teamName, %flag.team);
      logEcho("team "@%flag.team@" flag returned (timeout)");
   }
   
   %game.flagReset(%flag);
}

function CTFGame::showStalemateTargets(%game)
{
   cancel(%game.stalemateSchedule);

   //show the targets
   for (%i = 1; %i <= 2; %i++)
   {
      %flag = $TeamFlag[%i];

      //find the object to scope/waypoint....
      //render the target hud icon for slot 1 (a centermass flag)
      //if we just set him as always sensor vis, it'll work fine.
      if (isObject(%flag.carrier))
         setTargetAlwaysVisMask(%flag.carrier.getTarget(), 0x7);
   }

   //schedule the targets to hide
   %game.stalemateObjsVisible = true;
   %game.stalemateSchedule = %game.schedule(%game.stalemateDurationMS, hideStalemateTargets);
}

function CTFGame::hideStalemateTargets(%game)
{
   cancel(%game.stalemateSchedule);

   //hide the targets
   for (%i = 1; %i <= 2; %i++)
   {
      %flag = $TeamFlag[%i];
      if (isObject(%flag.carrier))
      {
         %target = %flag.carrier.getTarget();
         setTargetAlwaysVisMask(%target, (1 << getTargetSensorGroup(%target)));
      }
   }

   //schedule the targets to show again
   %game.stalemateObjsVisible = false;
   %game.stalemateSchedule = %game.schedule(%game.stalemateFreqMS, showStalemateTargets);
}

function CTFGame::beginStalemate(%game)
{
   %game.stalemate = true;
   %game.showStalemateTargets();
}

function CTFGame::endStalemate(%game)
{
   %game.stalemate = false;
   %game.hideStalemateTargets();
   cancel(%game.stalemateSchedule);
}

function CTFGame::flagReset(%game, %flag)
{
   //any time a flag is reset, kill the stalemate schedule
   %game.endStalemate();

   //make sure if there's a player carrying it (probably one out of bounds...), it is stripped first
   if (isObject(%flag.carrier))
   {
      //hide the target hud icon for slot 2 (a centermass flag - visible only as part of a teams sensor network)
      %game.playerLostFlagTarget(%flag.carrier);
      %flag.carrier.holdingFlag = ""; //no longer holding it.
      %flag.carrier.unMountImage($FlagSlot);
   }

   //fades, restore default position, home, velocity, general status, etc.
   %flag.setVelocity("0 0 0");
   %flag.setTransform(%flag.originalPosition);
   %flag.isHome = true;
   %flag.carrier = "";
   %flag.grabber = "";
   $flagStatus[%flag.team] = "<At Base>";
   %flag.hide(false);
   if(%flag.stand)
      %flag.stand.getDataBlock().onFlagReturn(%flag.stand);//animate, if exterior stand

   //fade the flag in...
   %flag.startFade(%game.fadeTimeMS, 0, false);         

   // dont render base target
   setTargetRenderMask(%flag.waypoint.getTarget(), 0);

   //call the AI function
   %game.AIflagReset(%flag);

   // ------------------------------------------
   // z0dd - ZOD, 5/27/02. Fixes flags hovering
   // over friendly player when collision occurs
   %flag.static = true;
}

function CTFGame::timeLimitReached(%game)
{
   logEcho("game over (timelimit)");
   %game.gameOver();
   cycleMissions();
}

function CTFGame::scoreLimitReached(%game)
{
   logEcho("game over (scorelimit)");
   %game.gameOver();
   cycleMissions();
}

function CTFGame::notifyMineDeployed(%game, %mine)
{
   //see if the mine is within 5 meters of the flag stand...
   %mineTeam = %mine.sourceObject.team;
   %homeFlag = $TeamFlag[%mineTeam];
   if (isObject(%homeFlag))
   {
      %dist = VectorDist(%homeFlag.originalPosition, %mine.position);
      if (%dist <= %game.notifyMineDist)
      {
         messageTeam(%mineTeam, 'MsgCTFFlagMined', "The flag has been mined.~wvoice/announcer/flag_minedFem.wav" );
      }
   }
}

function CTFGame::gameOver(%game)
{
   //call the default
   DefaultGame::gameOver(%game);

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
   for(%i = 0; %i < ClientGroup.getCount(); %i ++) 
   {
      %client = ClientGroup.getObject(%i);
      %game.resetScore(%client);
   }
   for(%j = 1; %j <= %game.numTeams; %j++)
      $TeamScore[%j] = 0;
}

function CTFGame::onClientDamaged(%game, %clVictim, %clAttacker, %damageType, %implement, %damageLoc)
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
   
     
   //if victim is carrying a flag and is not on the attackers team, mark the attacker as a threat for x seconds(for scoring purposes)
   if ((%clVictim.holdingFlag !$= "") && (%clVictim.team != %clAttacker.team))
   {
      %clAttacker.dmgdFlagCarrier = true;
      cancel(%clAttacker.threatTimer);  //restart timer    
      %clAttacker.threatTimer = schedule(%game.TIME_CONSIDERED_FLAGCARRIER_THREAT, %clAttacker.dmgdFlagCarrier = false);
   }
   
   
}
      
////////////////////////////////////////////////////////////////////////////////////////
function CTFGame::clientMissionDropReady(%game, %client)
{   
   messageClient(%client, 'MsgClientReady',"", %game.class);
   %game.resetScore(%client);
   for(%i = 1; %i <= %game.numTeams; %i++)
   {
      $Teams[%i].score = 0;
      messageClient(%client, 'MsgCTFAddTeam', "", %i, %game.getTeamName(%i), $flagStatus[%i], $TeamScore[%i]);
   }
   //%game.populateTeamRankArray(%client);

   //messageClient(%client, 'MsgYourRankIs', "", -1);
      
   messageClient(%client, 'MsgMissionDropInfo', '\c0You are in mission %1 (%2).', $MissionDisplayName, $MissionTypeDisplayName, $ServerName ); 

   DefaultGame::clientMissionDropReady(%game, %client);
}

function CTFGame::assignClientTeam(%game, %client, %respawn)
{
   DefaultGame::assignClientTeam(%game, %client, %respawn);
   // if player's team is not on top of objective hud, switch lines
   messageClient(%client, 'MsgCheckTeamLines', "", %client.team);
}

function CTFGame::recalcScore(%game, %cl)
{
   %killValue = %cl.kills * %game.SCORE_PER_KILL;
   %deathValue = %cl.deaths * %game.SCORE_PER_DEATH;

   if (%killValue - %deathValue == 0)
      %killPoints = 0;
   else
      %killPoints = (%killValue * %killValue) / (%killValue - %deathValue);

   if(!isDemo())
   {
        %cl.offenseScore = %killPoints +
                        %cl.suicides            * %game.SCORE_PER_SUICIDE + 
                        %cl.escortAssists       * %game.SCORE_PER_ESCORT_ASSIST +
                        %cl.teamKills           * %game.SCORE_PER_TEAMKILL + 
                        %cl.scoreHeadshot           * %game.SCORE_PER_HEADSHOT + 
                        %cl.flagCaps            * %game.SCORE_PER_PLYR_FLAG_CAP       + 
                        %cl.flagGrabs           * %game.SCORE_PER_PLYR_FLAG_TOUCH       + 
                        %cl.genDestroys         * %game.SCORE_PER_DESTROY_GEN         + 
                        %cl.sensorDestroys     * %game.SCORE_PER_DESTROY_SENSOR      + 
                        %cl.turretDestroys     * %game.SCORE_PER_DESTROY_TURRET      + 
                        %cl.iStationDestroys   * %game.SCORE_PER_DESTROY_ISTATION    + 
                        %cl.vstationDestroys   * %game.SCORE_PER_DESTROY_VSTATION    + 
                        %cl.solarDestroys      * %game.SCORE_PER_DESTROY_SOLAR       + 
                        %cl.sentryDestroys     * %game.SCORE_PER_DESTROY_SENTRY      + 
                        %cl.depSensorDestroys  * %game.SCORE_PER_DESTROY_DEP_SENSOR  + 
                        %cl.depTurretDestroys  * %game.SCORE_PER_DESTROY_DEP_TUR     + 
                        %cl.depStationDestroys * %game.SCORE_PER_DESTROY_DEP_INV     +
                        %cl.vehicleScore + %cl.vehicleBonus; 

        %cl.defenseScore =   %cl.genDefends          * %game.SCORE_PER_GEN_DEFEND +   
                        %cl.flagDefends         * %game.SCORE_PER_FLAG_DEFEND +
                        %cl.carrierKills        * %game.SCORE_PER_CARRIER_KILL +  
                        %cl.escortAssists       * %game.SCORE_PER_ESCORT_ASSIST + 
                        %cl.turretKills         * %game.SCORE_PER_TURRET_KILL_AUTO +  
                        %cl.mannedturretKills   * %game.SCORE_PER_TURRET_KILL +  
                        %cl.genRepairs          * %game.SCORE_PER_REPAIR_GEN             +
                        %cl.SensorRepairs       * %game.SCORE_PER_REPAIR_SENSOR          +
                        %cl.TurretRepairs       * %game.SCORE_PER_REPAIR_TURRET          +
                        %cl.StationRepairs      * %game.SCORE_PER_REPAIR_ISTATION        +
                        %cl.VStationRepairs     * %game.SCORE_PER_REPAIR_VSTATION        +
                        %cl.solarRepairs        * %game.SCORE_PER_REPAIR_SOLAR           +
                        %cl.sentryRepairs       * %game.SCORE_PER_REPAIR_SENTRY          +
                        %cl.depInvRepairs       * %game.SCORE_PER_REPAIR_DEP_INV         +
                        %cl.depTurretRepairs    * %game.SCORE_PER_REPAIR_DEP_TUR  +
                        %cl.returnPts; 
        }

    if( isDemo() )
    {
        %cl.offenseScore = %killPoints +
                            %cl.flagDefends         * %game.SCORE_PER_FLAG_DEFEND +
                            %cl.suicides * %game.SCORE_PER_SUICIDE + //-1
                            %cl.escortAssists * %game.SCORE_PER_ESCORT_ASSIST + // 1
                            %cl.teamKills * %game.SCORE_PER_TEAMKILL + // -1
                            %cl.flagCaps * %game.SCORE_PER_PLYR_FLAG_CAP + // 3
                            %cl.genDestroys * %game.SCORE_PER_GEN_DESTROY; // 2

        %cl.defenseScore =   %cl.genDefends * %game.SCORE_PER_GEN_DEFEND +   // 1
                            %cl.carrierKills * %game.SCORE_PER_CARRIER_KILL +  // 1
                            %cl.escortAssists * %game.SCORE_PER_ESCORT_ASSIST + // 1
                            %cl.turretKills * %game.SCORE_PER_TURRET_KILL +  // 1
                            %cl.flagReturns * %game.SCORE_PER_FLAG_RETURN +  // 1
                            %cl.genRepairs * %game.SCORE_PER_GEN_REPAIR;  // 1
    } 

   %cl.score = mFloor(%cl.offenseScore + %cl.defenseScore);

   %game.recalcTeamRanks(%cl);
}

function CTFGame::updateKillScores(%game, %clVictim, %clKiller, %damageType, %implement)
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

   if(%game.testTurretKill(%implement))   //check for turretkill before awarded a non client points for a kill
      %game.awardScoreTurretKill(%clVictim, %implement);
   else if (%game.testKill(%clVictim, %clKiller)) //verify victim was an enemy
   {
      %value = %game.awardScoreKill(%clKiller);
      %game.shareScore(%clKiller, %value);
      %game.awardScoreDeath(%clVictim);

      if (%game.testGenDefend(%clVictim, %clKiller))
         %game.awardScoreGenDefend(%clKiller);

      if(%game.testCarrierKill(%clVictim, %clKiller))    
         %game.awardScoreCarrierKill(%clKiller);
      else
      {
         if (%game.testFlagDefend(%clVictim, %clKiller))
            %game.awardScoreFlagDefend(%clKiller);
      }
      if (%game.testEscortAssist(%clVictim, %clKiller))
         %game.awardScoreEscortAssist(%clKiller);     
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

function CTFGame::testFlagDefend(%game, %victimID, %killerID)
{
   InitContainerRadiusSearch(%victimID.plyrPointOfDeath, %game.RADIUS_FLAG_DEFENSE, $TypeMasks::ItemObjectType);
   %objID = containerSearchNext();   
   while(%objID != 0) 
   {
     %objType = %objID.getDataBlock().getName();
     if ((%objType $= "Flag") && (%objID.team == %killerID.team)) 
          return true;  //found the(a) killer's flag near the victim's point of death
     else
        %objID = containerSearchNext();     
   }
   return false; //didn't find a qualifying flag within required radius of victims point of death  
}

function CTFGame::testGenDefend(%game, %victimID, %killerID)
{
   InitContainerRadiusSearch(%victimID.plyrPointOfDeath, %game.RADIUS_GEN_DEFENSE, $TypeMasks::StaticShapeObjectType);
   %objID = containerSearchNext();
   while(%objID != 0)
   {
      %objType = %objID.getDataBlock().ClassName;
     if ((%objType $= "generator") && (%objID.team == %killerID.team)) 
        return true;  //found a killer's generator within required radius of victim's death
     else
        %objID = containerSearchNext();
   }
   return false;  //didn't find a qualifying gen within required radius of victim's point of death 
}

function CTFGame::testCarrierKill(%game, %victimID, %killerID)
{
   %flag = %victimID.plyrDiedHoldingFlag;
   return ((%flag !$= "") && (%flag.team == %killerID.team));  
}

function CTFGame::testEscortAssist(%game, %victimID, %killerID)
{
   return (%victimID.dmgdFlagCarrier); 
}

function CTFGame::testValidRepair(%game, %obj)
{
    if(!%obj.wasDisabled)
    {
        //error(%obj SPC "was never disabled");
        return false;
    }
    else if(%obj.lastDamagedByTeam == %obj.team)
    {
        //error(%obj SPC "was last damaged by a friendly");
        return false;
    }
    else if(%obj.team != %obj.repairedBy.team)
    {
        //error(%obj SPC "was repaired by an enemy");
        return false;
    }
    else 
    {
        if(%obj.soiledByEnemyRepair)
            %obj.soiledByEnemyRepair = false;
        return true;
    }
}  

function CTFGame::awardScoreFlagCap(%game, %cl, %flag)
{
    %cl.flagCaps++;
    $TeamScore[%cl.team] += %game.SCORE_PER_TEAM_FLAG_CAP;
    messageAll('MsgTeamScoreIs', "", %cl.team, $TeamScore[%cl.team]);

    %flag.grabber.flagGrabs++;

    if (%game.SCORE_PER_TEAM_FLAG_CAP > 0)
    {
        %plural = (%game.SCORE_PER_PLYR_FLAG_CAP != 1 ? 's' : "");
        %plural2 = (%game.SCORE_PER_PLYR_FLAG_TOUCH != 1 ? 's' : "");

        if(isDemo())
        {
            messageTeam(%flag.team, 'msgCTFEnemyCap', '\c0Enemy %1 received %2 point%3 for capturing your flag!', %cl.name, %game.SCORE_PER_PLYR_FLAG_CAP, %plural);
            messageTeamExcept(%cl, 'msgCTFFriendCap', '\c0Teammate %1 receives %2 point%3 for capturing the enemy flag!', %cl.name, %game.SCORE_PER_PLYR_FLAG_CAP, %plural); 
            messageClient(%cl, 'msgCTFFriendCap', '\c0You receive %1 point%2 for stealing and capturing the enemy flag!', %game.SCORE_PER_PLYR_FLAG_CAP, %plural);
        }

        if(!isDemo())
        {
            if(%cl == %flag.grabber)
            {
                messageClient(%cl, 'msgCTFFriendCap', '\c0You receive %1 point%2 for stealing and capturing the enemy flag!', %game.SCORE_PER_PLYR_FLAG_CAP+%game.SCORE_PER_PLYR_FLAG_TOUCH, %plural);
                messageTeam(%flag.team, 'msgCTFEnemyCap', '\c0Enemy %1 received %2 point%3 for capturing your flag!', %cl.name, %game.SCORE_PER_PLYR_FLAG_CAP+%game.SCORE_PER_PLYR_FLAG_TOUCH, %plural);
                messageTeamExcept(%cl, 'msgCTFFriendCap', '\c0Teammate %1 receives %2 point%3 for capturing the enemy flag!', %cl.name, %game.SCORE_PER_PLYR_FLAG_CAP+%game.SCORE_PER_PLYR_FLAG_TOUCH, %plural); 
            }
            else
            {
                if(isObject(%flag.grabber))  // is the grabber still here?
                {
                    messageClient(%cl, 'msgCTFFriendCap', '\c0You receive %1 point%2 for capturing the enemy flag!  %3 gets %4 point%5 for the steal assist.', %game.SCORE_PER_PLYR_FLAG_CAP, %plural, %flag.grabber.name, %game.SCORE_PER_PLYR_FLAG_TOUCH, %plural2);
                    messageClient(%flag.grabber, 'msgCTFFriendCap', '\c0You receive %1 point%2 for stealing a flag that was subsequently capped by %3.', %game.SCORE_PER_PLYR_FLAG_TOUCH, %plural2, %cl.name);
                }
                else
                    messageClient(%cl, 'msgCTFFriendCap', '\c0You receive %1 point%2 for capturing the enemy flag!', %game.SCORE_PER_PLYR_FLAG_CAP, %plural);

                messageTeamExcept(%cl, 'msgCTFFriendCap', '\c0Teammate %1 receives %2 point%3 for capturing the enemy flag!', %cl.name, %game.SCORE_PER_PLYR_FLAG_CAP, %plural); 
                messageTeam(%flag.team, 'msgCTFEnemyCap', '\c0Enemy %1 received %2 point%3 for capturing your flag!', %cl.name, %game.SCORE_PER_PLYR_FLAG_CAP, %plural);
            }
        }
    }

    %game.recalcScore(%cl);

    if(isObject(%flag.grabber))
        %game.recalcScore(%flag.grabber);

    %game.checkScoreLimit(%cl.team);
}


function CTFGame::awardScoreFlagTouch(%game, %cl, %flag)
{
 
    %flag.grabber = %cl;
    %team = %cl.team;
	if( $DontScoreTimer[%team] )
		return;

	$dontScoreTimer[%team] = true;
   //tinman - needed to remove all game calls to "eval" for the PURE server...
   %game.schedule(%game.TOUCH_DELAY_MS, resetDontScoreTimer, %team);
	//schedule(%game.TOUCH_DELAY_MS, 0, eval, "$dontScoreTimer["@%team@"] = false;");
	schedule(%game.TOUCH_DELAY_MS, 0, eval, "$dontScoreTimer["@%team@"] = false;");
   $TeamScore[%team] += %game.SCORE_PER_TEAM_FLAG_TOUCH;
   messageAll('MsgTeamScoreIs', "", %team, $TeamScore[%team]);

   if (%game.SCORE_PER_TEAM_FLAG_TOUCH > 0)
   {
      %plural = (%game.SCORE_PER_TEAM_FLAG_TOUCH != 1 ? 's' : "");
      messageTeam(%team, 'msgCTFFriendFlagTouch', '\c0Your team receives %1 point%2 for grabbing the enemy flag!', %game.SCORE_PER_TEAM_FLAG_TOUCH, %plural);
      messageTeam(%flag.team, 'msgCTFEnemyFlagTouch', '\c0Enemy %1 receives %2 point%3 for grabbing your flag!', %cl.name, %game.SCORE_PER_TEAM_FLAG_TOUCH, %plural);
   }
   %game.recalcScore(%cl);
   %game.checkScoreLimit(%team);
}

function CTFGame::resetDontScoreTimer(%game, %team)
{
   $dontScoreTimer[%team] = false;
}

function CTFGame::checkScoreLimit(%game, %team)
{
   %scoreLimit = MissionGroup.CTF_scoreLimit * %game.SCORE_PER_TEAM_FLAG_CAP;
   // default of 5 if scoreLimit not defined
   if(%scoreLimit $= "")
      %scoreLimit = 5 * %game.SCORE_PER_TEAM_FLAG_CAP;
   if($TeamScore[%team] >= %scoreLimit) 
      %game.scoreLimitReached();
}

function CTFGame::awardScoreFlagReturn(%game, %cl, %perc)
{
   if(isDemo())
   {
       %cl.flagReturns++;
       if (%game.SCORE_PER_FLAG_RETURN != 0)
       {
          messageClient(%cl, 'scoreFlaRetMsg', '\c0You received a %1 point bonus for returning your flag.', %game.SCORE_PER_FLAG_RETURN);
          //messageTeamExcept(%cl, 'scoreFlaRetMsg', '\c0Teammate %1 received a %2 point bonus for returning your flag.', %cl.name, %game.SCORE_PER_FLAG_RETURN);
       }
       %game.recalcScore(%cl);
   }
   else
   {
       if (%game.SCORE_PER_FLAG_RETURN != 0)
       {
            %pts = mfloor( %game.SCORE_PER_FLAG_RETURN * (%perc/100) );
            if(%perc  == 100)
                messageClient(%cl, 'scoreFlaRetMsg', 'Flag return - exceeded capping distance - %1 point bonus.', %pts, %perc);
            else if(%perc  == 0)
                messageClient(%cl, 'scoreFlaRetMsg', 'You gently place the flag back on the stand.', %pts, %perc);
            else 
                messageClient(%cl, 'scoreFlaRetMsg', '\c0Flag return from %2%% of capping distance - %1 point bonus.', %pts, %perc);
            %cl.returnPts += %pts;
       }
       %game.recalcScore(%cl);
        return %game.SCORE_PER_FLAG_RETURN;
    }
}

function CTFGame::awardScoreStalemateReturn(%game, %cl)
{
   if (%game.SCORE_PER_STALEMATE_RETURN != 0)
   {
      messageClient(%cl, 'scoreStaleRetMsg', '\c0You received a %1 point bonus for a stalemate-breaking, flag return.', %game.SCORE_PER_STALEMATE_RETURN);
        %cl.returnPts += %game.SCORE_PER_STALEMATE_RETURN;
   }
   %game.recalcScore(%cl);
    return %game.SCORE_PER_STALEMATE_RETURN;
}

// Asset Destruction scoring
function CTFGame::awardScoreGenDestroy(%game,%cl)
{
   %cl.genDestroys++;
   if (%game.SCORE_PER_DESTROY_GEN != 0)
      {
         messageClient(%cl, 'msgGenDes', '\c0You received a %1 point bonus for destroying an enemy generator.', %game.SCORE_PER_DESTROY_GEN);
         //messageTeamExcept(%cl, 'msgGenDes', '\c0Teammate %1 received a %2 point bonus for destroying an enemy generator.', %cl.name, %game.SCORE_PER_GEN_DESTROY);
      }
      %game.recalcScore(%cl);
    return %game.SCORE_PER_DESTROY_GEN;
}

function CTFGame::awardScoreSensorDestroy(%game,%cl)
{
   %cl.sensorDestroys++;
   if (%game.SCORE_PER_DESTROY_SENSOR != 0)
      {
         messageClient(%cl, 'msgSensorDes', '\c0You received a %1 point bonus for destroying an enemy sensor.', %game.SCORE_PER_DESTROY_SENSOR);
         //messageTeamExcept(%cl, 'msgGenDes', '\c0Teammate %1 received a %2 point bonus for destroying an enemy generator.', %cl.name, %game.SCORE_PER_GEN_DESTROY);
      }
      %game.recalcScore(%cl);
    return %game.SCORE_PER_DESTROY_SENSOR;
}

function CTFGame::awardScoreTurretDestroy(%game,%cl)
{
   %cl.turretDestroys++;
   if (%game.SCORE_PER_DESTROY_TURRET != 0)
      {
         messageClient(%cl, 'msgTurretDes', '\c0You received a %1 point bonus for destroying an enemy turret.', %game.SCORE_PER_DESTROY_TURRET);
         //messageTeamExcept(%cl, 'msgGenDes', '\c0Teammate %1 received a %2 point bonus for destroying an enemy generator.', %cl.name, %game.SCORE_PER_GEN_DESTROY);
      }
      %game.recalcScore(%cl);
    return %game.SCORE_PER_DESTROY_TURRET;
}

function CTFGame::awardScoreInvDestroy(%game,%cl)
{
   %cl.IStationDestroys++;
   if (%game.SCORE_PER_DESTROY_ISTATION != 0)
      {
         messageClient(%cl, 'msgInvDes', '\c0You received a %1 point bonus for destroying an enemy inventory station.', %game.SCORE_PER_DESTROY_ISTATION);
         //messageTeamExcept(%cl, 'msgGenDes', '\c0Teammate %1 received a %2 point bonus for destroying an enemy generator.', %cl.name, %game.SCORE_PER_GEN_DESTROY);
      }
      %game.recalcScore(%cl);
    return %game.SCORE_PER_DESTROY_ISTATION;
}

function CTFGame::awardScoreVehicleStationDestroy(%game,%cl)
{
   %cl.VStationDestroys++;
   if (%game.SCORE_PER_DESTROY_VSTATION != 0)
      {
         messageClient(%cl, 'msgVSDes', '\c0You received a %1 point bonus for destroying an enemy vehicle station.', %game.SCORE_PER_DESTROY_VSTATION);
         //messageTeamExcept(%cl, 'msgGenDes', '\c0Teammate %1 received a %2 point bonus for destroying an enemy generator.', %cl.name, %game.SCORE_PER_GEN_DESTROY);
      }
      %game.recalcScore(%cl);
    return %game.SCORE_PER_DESTROY_VSTATION;
}

function CTFGame::awardScoreSolarDestroy(%game,%cl)
{
   %cl.SolarDestroys++;
   if (%game.SCORE_PER_DESTROY_SOLAR != 0)
      {
         messageClient(%cl, 'msgSolarDes', '\c0You received a %1 point bonus for destroying an enemy solar panel.', %game.SCORE_PER_DESTROY_SOLAR);
         //messageTeamExcept(%cl, 'msgGenDes', '\c0Teammate %1 received a %2 point bonus for destroying an enemy generator.', %cl.name, %game.SCORE_PER_GEN_DESTROY);
      }
      %game.recalcScore(%cl);
    return %game.SCORE_PER_DESTROY_SOLAR;
}

function CTFGame::awardScoreSentryDestroy(%game,%cl)
{
   %cl.sentryDestroys++;
   if (%game.SCORE_PER_DESTROY_SENTRY != 0)
      {
         messageClient(%cl, 'msgSentryDes', '\c0You received a %1 point bonus for destroying an enemy sentry turret.', %game.SCORE_PER_DESTROY_SENTRY);
         //messageTeamExcept(%cl, 'msgGenDes', '\c0Teammate %1 received a %2 point bonus for destroying an enemy generator.', %cl.name, %game.SCORE_PER_GEN_DESTROY);
      }
      %game.recalcScore(%cl);
    return %game.SCORE_PER_DESTROY_SENTRY;
}

function CTFGame::awardScoreDepSensorDestroy(%game,%cl)
{
   %cl.depSensorDestroys++;
   if (%game.SCORE_PER_DESTROY_DEP_SENSOR != 0)
      {
         messageClient(%cl, 'msgDepSensorDes', '\c0You received a %1 point bonus for destroying an enemy deployable.', %game.SCORE_PER_DESTROY_DEP_SENSOR);
         //messageTeamExcept(%cl, 'msgGenDes', '\c0Teammate %1 received a %2 point bonus for destroying an enemy generator.', %cl.name, %game.SCORE_PER_GEN_DESTROY);
      }
      %game.recalcScore(%cl);
    return %game.SCORE_PER_DESTROY_DEP_SENSOR;
}

function CTFGame::awardScoreDepTurretDestroy(%game,%cl)
{
   %cl.depTurretDestroys++;
   if (%game.SCORE_PER_DESTROY_DEP_TUR != 0)
      {
         messageClient(%cl, 'msgDepTurDes', '\c0You received a %1 point bonus for destroying an enemy deployed turret.', %game.SCORE_PER_DESTROY_DEP_TUR);
         //messageTeamExcept(%cl, 'msgGenDes', '\c0Teammate %1 received a %2 point bonus for destroying an enemy generator.', %cl.name, %game.SCORE_PER_GEN_DESTROY);
      }
      %game.recalcScore(%cl);
    return %game.SCORE_PER_DESTROY_DEP_TUR;
}

function CTFGame::awardScoreDepStationDestroy(%game,%cl)
{
   %cl.depStationDestroys++;
   if (%game.SCORE_PER_DESTROY_DEP_INV != 0)
      {
         messageClient(%cl, 'msgDepInvDes', '\c0You received a %1 point bonus for destroying an enemy deployed station.', %game.SCORE_PER_DESTROY_DEP_INV);
         //messageTeamExcept(%cl, 'msgGenDes', '\c0Teammate %1 received a %2 point bonus for destroying an enemy generator.', %cl.name, %game.SCORE_PER_GEN_DESTROY);
      }
      %game.recalcScore(%cl);
    return %game.SCORE_PER_DESTROY_DEP_INV;
}

function CTFGame::awardScoreGenDefend(%game, %killerID)
{
   %killerID.genDefends++;
   if (%game.SCORE_PER_GEN_DEFEND != 0)
   {
      messageClient(%killerID, 'msgGenDef', '\c0You received a %1 point bonus for defending a generator.', %game.SCORE_PER_GEN_DEFEND);
      //messageTeamExcept(%killerID, 'msgGenDef', '\c0Teammate %1 received a %2 point bonus for defending a generator.', %killerID.name, %game.SCORE_PER_GEN_DEFEND);
   }
   %game.recalcScore(%cl);
    return %game.SCORE_PER_GEN_DEFEND;
}

function CTFGame::awardScoreCarrierKill(%game, %killerID)
{
   %killerID.carrierKills++;
   if (%game.SCORE_PER_CARRIER_KILL != 0)
   {
      messageClient(%killerID, 'msgCarKill', '\c0You received a %1 point bonus for stopping the enemy flag carrier!', %game.SCORE_PER_CARRIER_KILL);
      //messageTeamExcept(%killerID, 'msgCarKill', '\c0Teammate %1 received a %2 point bonus for stopping the enemy flag carrier!', %killerID.name, %game.SCORE_PER_CARRIER_KILL);
   }
   %game.recalcScore(%killerID);   
    return %game.SCORE_PER_CARRIER_KILL;
}

function CTFGame::awardScoreFlagDefend(%game, %killerID)
{
   %killerID.flagDefends++;
   if (%game.SCORE_PER_FLAG_DEFEND != 0)
   {
      messageClient(%killerID, 'msgFlagDef', '\c0You received a %1 point bonus for defending your flag!', %game.SCORE_PER_FLAG_DEFEND);
      //messageTeamExcept(%killerID, 'msgFlagDef', '\c0Teammate %1 received a %2 point bonus for defending your flag!', %killerID.name, %game.SCORE_PER_FLAG_DEFEND);
   }      
   %game.recalcScore(%killerID);
    return %game.SCORE_PER_FLAG_DEFEND;
}

function CTFGame::awardScoreEscortAssist(%game, %killerID)
{
   %killerID.escortAssists++;
   if (%game.SCORE_PER_ESCORT_ASSIST != 0)
   {
      messageClient(%killerID, 'msgEscAsst', '\c0You received a %1 point bonus for protecting the flag carrier!', %game.SCORE_PER_ESCORT_ASSIST);
      //messageTeamExcept(%killerID, 'msgEscAsst', '\c0Teammate %1 received a %2 point bonus for protecting the flag carrier!', %killerID.name, %game.SCORE_PER_ESCORT_ASSIST);
   }
   %game.recalcScore(%killerID);
    return %game.SCORE_PER_ESCORT_ASSIST;
}

function CTFGame::resetScore(%game, %client)
{
   %client.offenseScore = 0;
   %client.kills = 0;
   %client.deaths = 0;
   %client.suicides = 0;
   %client.escortAssists = 0;
   %client.teamKills = 0;
   %client.flagCaps = 0;
   %client.flagGrabs = 0;
   %client.genDestroys = 0;
   %client.sensorDestroys = 0;
   %client.turretDestroys = 0;
   %client.iStationDestroys = 0;
   %client.vstationDestroys = 0;
   %client.solarDestroys = 0;
   %client.sentryDestroys = 0;
   %client.depSensorDestroys = 0;
   %client.depTurretDestroys = 0;
   %client.depStationDestroys = 0;
   %client.vehicleScore = 0; 
   %client.vehicleBonus = 0; 

    %client.flagDefends = 0;
   %client.defenseScore = 0;
   %client.genDefends = 0;
   %client.carrierKills = 0;
   %client.escortAssists = 0;
   %client.turretKills = 0;
   %client.mannedTurretKills = 0;
   %client.flagReturns = 0;
   %client.genRepairs = 0;
    %client.SensorRepairs   =0;
    %client.TurretRepairs   =0;
    %client.StationRepairs  =0;
    %client.VStationRepairs =0;
    %client.solarRepairs    =0;
    %client.sentryRepairs   =0;
    %client.depInvRepairs   =0;
    %client.depTurretRepairs=0;
    %client.returnPts = 0;
   %client.score = 0;
}

function CTFGame::objectRepaired(%game, %obj, %objName)
{     
   %item = %obj.getDataBlock().getName();
   switch$ (%item)
   {
      case generatorLarge :
         %game.genOnRepaired(%obj, %objName);
      case sensorMediumPulse : 
         %game.sensorOnRepaired(%obj, %objName);
      case sensorLargePulse : 
         %game.sensorOnRepaired(%obj, %objName);
      case stationInventory :
         %game.stationOnRepaired(%obj, %objName);
      case turretBaseLarge : 
         %game.turretOnRepaired(%obj, %objName);
      case stationVehicle :
        %game.vStationOnRepaired(%obj, %objName);
      case solarPanel :
        %game.solarPanelOnRepaired(%obj, %objName);
      case sentryTurret :
        %game.sentryTurretOnRepaired(%obj, %objName);
      case TurretDeployedWallIndoor:
        %game.depTurretOnRepaired(%obj, %objName);
      case TurretDeployedFloorIndoor:
        %game.depTurretOnRepaired(%obj, %objName);
      case TurretDeployedCeilingIndoor:
        %game.depTurretOnRepaired(%obj, %objName);
      case TurretDeployedOutdoor:
        %game.depTurretOnRepaired(%obj, %objName);
   }
   %obj.wasDisabled = false;
}

function CTFGame::genOnRepaired(%game, %obj, %objName)
{
      
   if (%game.testValidRepair(%obj))
   {
      %repairman = %obj.repairedBy;
      teamRepairMessage(%repairman, 'msgGenRepaired', '\c0%1 repaired the %2 Generator!', %repairman.name, %obj.nameTag);
      %game.awardScoreGenRepair(%obj.repairedBy);
   }           
}

function CTFGame::stationOnRepaired(%game, %obj, %objName)
{
   if (%game.testValidRepair(%obj)) 
   {     
      %repairman = %obj.repairedBy;
      teamRepairMessage(%repairman, 'msgStationRepaired', '\c0%1 repaired the %2 Inventory Station!', %repairman.name, %obj.nameTag);
      %game.awardScoreStationRepair(%obj.repairedBy);
   }
}

function CTFGame::sensorOnRepaired(%game, %obj, %objName)
{
   if (%game.testValidRepair(%obj)) 
   {     
      %repairman = %obj.repairedBy;
      teamRepairMessage(%repairman, 'msgSensorRepaired', '\c0%1 repaired the %2 Pulse Sensor!', %repairman.name, %obj.nameTag);
      %game.awardScoreSensorRepair(%obj.repairedBy);
   }
}

function CTFGame::turretOnRepaired(%game, %obj, %objName)
{
   if (%game.testValidRepair(%obj)) 
   {     
      %repairman = %obj.repairedBy;
      teamRepairMessage(%repairman, 'msgTurretRepaired', '\c0%1 repaired the %2 Turret!', %repairman.name, %obj.nameTag);
      %game.awardScoreTurretRepair(%obj.repairedBy);
   }
}

function CTFGame::vStationOnRepaired(%game, %obj, %objName)
{
   if (%game.testValidRepair(%obj)) 
   {     
      %repairman = %obj.repairedBy;
      teamRepairMessage(%repairman, 'msgvstationRepaired', '\c0%1 repaired the Vehicle Station!', %repairman.name);
      %game.awardScoreVStationRepair(%obj.repairedBy);
   }
}

function CTFGame::solarPanelOnRepaired(%game, %obj, %objName)
{
   if (%game.testValidRepair(%obj)) 
   {     
      %repairman = %obj.repairedBy;
      teamRepairMessage(%repairman, 'msgsolarRepaired', '\c0%1 repaired the %2 Solar Panel!', %repairman.name, %obj.nameTag);
      %game.awardScoreSolarRepair(%obj.repairedBy);
   }
}

function CTFGame::sentryTurretOnRepaired(%game, %obj, %objName)
{
   if (%game.testValidRepair(%obj)) 
   {     
      %repairman = %obj.repairedBy;
      teamRepairMessage(%repairman, 'msgsentryTurretRepaired', '\c0%1 repaired the %2 Sentry Turret!', %repairman.name, %obj.nameTag);
      %game.awardScoreSentryRepair(%obj.repairedBy);
   }
}

function CTFGame::depTurretOnRepaired(%game, %obj, %objName)
{
   if (%game.testValidRepair(%obj)) 
   {     
      %repairman = %obj.repairedBy;
      %game.awardScoreDepTurretRepair(%obj.repairedBy);
   }
}

function CTFGame::depInvOnRepaired(%game, %obj, %objName)
{
   if (%game.testValidRepair(%obj)) 
   {     
      %repairman = %obj.repairedBy;
      %game.awardScoreDepInvRepair(%obj.repairedBy);
   }
}

function CTFGame::awardScoreGenRepair(%game, %cl)
{
   %cl.genRepairs++;
   if (%game.SCORE_PER_REPAIR_GEN != 0)
   {
      messageClient(%cl, 'msgGenRep', '\c0You received a %1 point bonus for repairing a generator.', %game.SCORE_PER_REPAIR_GEN);
   }
   %game.recalcScore(%cl);
}

function CTFGame::awardScoreStationRepair(%game, %cl)
{
   %cl.stationRepairs++;
   if (%game.SCORE_PER_REPAIR_ISTATION != 0)
   {
      messageClient(%cl, 'msgIStationRep', '\c0You received a %1 point bonus for repairing a inventory station.', %game.SCORE_PER_REPAIR_ISTATION);
   }
   %game.recalcScore(%cl);
}

function CTFGame::awardScoreSensorRepair(%game, %cl)
{
   %cl.sensorRepairs++;
   if (%game.SCORE_PER_REPAIR_SENSOR != 0)
   {
      messageClient(%cl, 'msgSensorRep', '\c0You received a %1 point bonus for repairing a sensor.', %game.SCORE_PER_REPAIR_SENSOR);
   }
   %game.recalcScore(%cl);
}

function CTFGame::awardScoreTurretRepair(%game, %cl)
{
   %cl.TurretRepairs++;
   if (%game.SCORE_PER_REPAIR_TURRET != 0)
   {
      messageClient(%cl, 'msgTurretRep', '\c0You received a %1 point bonus for repairing a base turret.', %game.SCORE_PER_REPAIR_TURRET);
   }
   %game.recalcScore(%cl);
}

function CTFGame::awardScoreVStationRepair(%game, %cl)
{
   %cl.VStationRepairs++;
   if (%game.SCORE_PER_REPAIR_VSTATION != 0)
   {
      messageClient(%cl, 'msgVStationRep', '\c0You received a %1 point bonus for repairing a vehicle station.', %game.SCORE_PER_REPAIR_VSTATION);
   }
   %game.recalcScore(%cl);
}

function CTFGame::awardScoreSolarRepair(%game, %cl)
{
   %cl.solarRepairs++;
   if (%game.SCORE_PER_REPAIR_SOLAR != 0)
   {
      messageClient(%cl, 'msgsolarRep', '\c0You received a %1 point bonus for repairing a solar panel.', %game.SCORE_PER_REPAIR_SOLAR);
   }
   %game.recalcScore(%cl);
}

function CTFGame::awardScoreSentryRepair(%game, %cl)
{
   %cl.sentryRepairs++;
   if (%game.SCORE_PER_REPAIR_SENTRY != 0)
   {
      messageClient(%cl, 'msgSentryRep', '\c0You received a %1 point bonus for repairing a sentry turret.', %game.SCORE_PER_REPAIR_SENTRY);
   }
   %game.recalcScore(%cl);
}

function CTFGame::awardScoreDepTurretRepair(%game, %cl)
{
   %cl.depTurretRepairs++;
   if (%game.SCORE_PER_REPAIR_DEP_TUR != 0)
   {
      messageClient(%cl, 'msgDepTurretRep', '\c0You received a %1 point bonus for repairing a deployed turret.', %game.SCORE_PER_REPAIR_DEP_TUR);
   }
   %game.recalcScore(%cl);
}

function CTFGame::awardScoreDepInvRepair(%game, %cl)
{
   %cl.depInvRepairs++;
   if (%game.SCORE_PER_REPAIR_DEP_INV != 0)
   {
      messageClient(%cl, 'msgDepInvRep', '\c0You received a %1 point bonus for repairing a deployed station.', %game.SCORE_PER_REPAIR_DEP_INV);
   }
   %game.recalcScore(%cl);
}

function CTFGame::enterMissionArea(%game, %playerData, %player)
{
    if(%player.getState() $= "Dead")
    return;
    %player.client.outOfBounds = false; 
   messageClient(%player.client, 'EnterMissionArea', '\c1You are back in the mission area.');
   logEcho(%player.client.nameBase@" (pl "@%player@"/cl "@%player.client@") entered mission area");

   //the instant a player leaves the mission boundary, the flag is dropped, and the return is scheduled...
   if (%player.holdingFlag > 0)
   {
      cancel($FlagReturnTimer[%player.holdingFlag]);
      $FlagReturnTimer[%player.holdingFlag] = "";
   }
}

function CTFGame::leaveMissionArea(%game, %playerData, %player)
{
    if(%player.getState() $= "Dead")
    return;
   // maybe we'll do this just in case
   %player.client.outOfBounds = true;
   // if the player is holding a flag, strip it and throw it back into the mission area
   // otherwise, just print a message
   if(%player.holdingFlag > 0)
      %game.boundaryLoseFlag(%player);
   else
      messageClient(%player.client, 'MsgLeaveMissionArea', '\c1You have left the mission area.~wfx/misc/warning_beep.wav');
   logEcho(%player.client.nameBase@" (pl "@%player@"/cl "@%player.client@") left mission area");
}

function CTFGame::boundaryLoseFlag(%game, %player)
{
   // this is called when a player goes out of the mission area while holding
   // the enemy flag. - make sure the player is still out of bounds
   if (!%player.client.outOfBounds || !isObject(%player.holdingFlag))
      return;

   %client = %player.client;
   %flag = %player.holdingFlag;
   %flag.setVelocity("0 0 0");
   %flag.setTransform(%player.getWorldBoxCenter());
   %flag.setCollisionTimeout(%player);

   %game.playerDroppedFlag(%player);

   // now for the tricky part -- throwing the flag back into the mission area
   // let's try throwing it back towards its "home"
   %home = %flag.originalPosition;
   %vecx =  firstWord(%home) - firstWord(%player.getWorldBoxCenter());
   %vecy = getWord(%home, 1) - getWord(%player.getWorldBoxCenter(), 1);
   %vecz = getWord(%home, 2) - getWord(%player.getWorldBoxCenter(), 2);
   %vec = %vecx SPC %vecy SPC %vecz;

   // normalize the vector, scale it, and add an extra "upwards" component
   %vecNorm = VectorNormalize(%vec);
   %vec = VectorScale(%vecNorm, 1500);
   %vec = vectorAdd(%vec, "0 0 500");

   // ---------------------------------------------------------------------
   // z0dd - ZOD, 6/09/02. Remove anti-hover so flag can be thrown properly
   %flag.static = false;

   // apply the impulse to the flag object
   %flag.applyImpulse(%player.getWorldBoxCenter(), %vec);

   //don't forget to send the message
   // -----------------------------------------------------------------------------------------------------------------------------------------------------------------
   // z0dd - ZOD 3/30/02. Message was sending the wrong varible to objective hud thus not updating hud correctly.
   //messageClient(%player.client, 'MsgCTFFlagDropped', '\c1You have left the mission area and lost the flag.~wfx/misc/flag_drop.wav', 0, 0, %player.holdingFlag.team);
   messageClient(%player.client, 'MsgCTFFlagDropped', '\c1You have left the mission area and lost the flag.~wfx/misc/flag_drop.wav', 0, 0, %flag.team);

   logEcho(%player.client.nameBase@" (pl "@%player@"/cl "@%player.client@") lost flag (out of bounds)");
}

function CTFGame::dropFlag(%game, %player)
{
   if(%player.holdingFlag > 0)
   {
      if (!%player.client.outOfBounds)
         %player.throwObject(%player.holdingFlag);
      else
         %game.boundaryLoseFlag(%player);
   }
}

function CTFGame::applyConcussion(%game, %player)
{
   %game.dropFlag( %player );
}

function CTFGame::vehicleDestroyed(%game, %vehicle, %destroyer)
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
        messageTeamExcept(%destroyer, 'msgVehicleDestroy', '\c0%1 destroyed an enemy %2.', %destroyerName, %vehicleType);
        messageTeam(%enemyTeam, 'msgVehicleDestroy', '\c0%1 destroyed your team\'s %2.', %destroyerName, %vehicleType);
        //messageClient(%destroyer, 'msgVehicleDestroy', '\c0You destroyed an enemy %1.', %vehicleType);
    
        if(%scorer)
        {
            %value = %game.awardScoreVehicleDestroyed(%scorer, %vehicleType, %multiplier, %passengers);
            %game.shareScore(%value);
        }
    }
}

function CTFGame::awardScoreVehicleDestroyed(%game, %client, %vehicleType, %mult, %passengers)
{
    if(isDemo())
        return 0;
    
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

function CTFGame::shareScore(%game, %client, %amount)
{
    if(isDemo())
        return 0;
    
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

function CTFGame::awardScoreTurretKill(%game, %victimID, %implement)
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

function CTFGame::testKill(%game, %victimID, %killerID)
{
   return ((%killerID !=0) && (%victimID.team != %killerID.team));
}

function CTFGame::awardScoreKill(%game, %killerID)
{
   %killerID.kills++;   
   %game.recalcScore(%killerID);    
    return %game.SCORE_PER_KILL;
} 


function checkVehicleCamping( %team )
{
   %position = $flagPos[%team];
   %radius = 5;
   InitContainerRadiusSearch(%position, %radius, $TypeMasks::VehicleObjectType );
   
   while ((%vehicle = containerSearchNext()) != 0)
   {
      %dist = containerSearchCurrRadDamageDist();

      if (%dist > %radius)
         continue;
      else
      {   
         //if( %vehicle.team == %team )
            applyVehicleCampDamage( %vehicle );
      }
   }
   
   if( %team == 1 )
      Game.campThread_1 = schedule( 1000, 0, "checkVehicleCamping", 1 );
   else
      Game.campThread_2 = schedule( 1000, 0, "checkVehicleCamping", 2 );
}

function applyVehicleCampDamage( %vehicle )
{
   if( !isObject( %vehicle ) )
      return;

   if( %vehicle.getDamageState() $= "Destroyed" )
      return;

   %client = %vehicle.getMountNodeObject(0).client; // grab the pilot
   
   messageClient( %client, 'serverMessage', "Can't park vehicles in flag zones!" );
   %vehicle.getDataBlock().damageObject( %vehicle, 0, "0 0 0", 0.5, 0); 
}
