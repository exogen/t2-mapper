// DisplayName = Team Deathmatch

//--- GAME RULES BEGIN ---
//Kills = points
//Killing marked targets can help close the point gap 
//Any capturable objectives is bonus points for each kill
//--- GAME RULES END ---

//exec the AI scripts
exec("scripts/aiTDM.cs");
$TDMGame::wpMessage = "";
$TDMGame::enableMarkPlayers =  true;
datablock StaticShapeData(TDMBonus)
{
   catagory = "Objectives";
   shapefile = "switch.dts";

   isInvincible = true;
   cmdCategory = "Objectives";
   cmdIcon = "CMDSwitchIcon";
   cmdMiniIconName = "commander/MiniIcons/com_switch_grey";
   targetTypeTag = 'Switch';
   alwaysAmbient = true;
   needsNoPower = true;
   emap = true;
};

function TDMBonus::onAdd(%this, %obj){  
   Parent::onAdd(%this, %obj);
}

package TDMGame {
	function ShapeBaseData::onDestroyed(%data, %obj, %prevstate)
   {
      // z0dd - ZOD, 5/27/03. Total re-write
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
            Game.awardScoreStaticShapeDestroy(%scorer, %obj);
      }
      else
      {
         if(!%obj.getDataBlock().deployedObject)
            Game.awardScoreTkDestroy(%scorer, %obj);

         return;
      }
   }



	function FlipFlop::playerTouch(%data, %flipflop, %player)
	{
		if(!%player.rk && !%player.client.isAIControlled()){
			messageClient(%player.client, 'MsgClient', '\c0You need at least one kill this life to claim a point!.~wfx/powered/station_denied.wav');
			bottomPrint(%player.client, "\nYou need at least one kill this life to claim a point!", 5, 3 );	
			return;
		}
		%client = %player.client;
		%flipTeam = %flipflop.team;

		if(%flipTeam == %client.team)
			return false;

		%teamName = game.getTeamName(%client.team);
		// Let the observers know:
		messageTeam( 0, 'MsgClaimFlipFlop', '\c2%1 claimed a point for %3.~wNflipflop_taken.wav', %client.name, Game.cleanWord( %flipflop.namePoint ), %teamName );
		// Let the teammates know:
		messageTeam( %client.team, 'MsgClaimFlipFlop', '\c2%1 claimed a point for %3.~wNflipflop_taken.wav', %client.name, Game.cleanWord( %flipflop.namePoint ), %teamName );
		// Let the other team know:
		%losers = %client.team == 1 ? 2 : 1;
		messageTeam( %losers, 'MsgClaimFlipFlop', '\c2%1 claimed a point for %3.~wNflipflop_lost.wav', %client.name, Game.cleanWord( %flipflop.namePoint ), %teamName ); // z0dd - ZOD, 10/30/02. Change flipflop lost sound

		//change the skin on the switch to claiming team's logo
		setTargetSkin(%flipflop.getTarget(), game.getTeamSkin(%player.team));
		setTargetSensorGroup(%flipflop.getTarget(), %player.team);

		// if there is a "projector" associated with this flipflop, put the claiming team's logo there
		if(%flipflop.projector > 0)
		{
			%projector = %flipflop.projector;
			// axe the old projected holo, if one exists
			if(%projector.holo > 0)
				%projector.holo.delete();
				
			%newHolo = getTaggedString(game.getTeamSkin(%client.team)) @ "Logo";

			%projTransform = %projector.getTransform();
			// below two functions are from deployables.cs
			%projRot = rotFromTransform(%projTransform);
			%projPos = posFromTransform(%projTransform);
			// place the holo above the projector (default 10 meters)
			%hHeight = %projector.holoHeight;
			if(%hHeight $= "")
				%hHeight = 10;
			%holoZ = getWord(%projPos, 2) + %hHeight;
			%holoPos = firstWord(%projPos) SPC getWord(%projPos,1) SPC %holoZ;

			%holo = new StaticShape() 
			{
				rotation = %projRot;
				position = %holoPos;
				dataBlock = %newHolo;
			};
			// dump the hologram into MissionCleanup
			MissionCleanup.add(%holo);
			// associate the holo with the projector
			%projector.holo = %holo;
		}

		// convert the resources associated with the flipflop
		Game.claimFlipflopResources(%flipflop, %client.team);
		Game.awardScorePlayerFFCap(%client, %flipFlop);
		if(Game.countFlips())
			for(%i = 1; %i <= Game.numTeams; %i++)
			{
				%teamHeld = Game.countFlipsHeld(%i);
				messageAll('MsgFlipFlopsHeld', "", %i, %teamHeld);
			}
		
		//call the ai function
		if(%player.client.isAIControlled()) // z0dd - ZOD, 5/19/03. check to see if the player is a bot, duh.
			Game.AIplayerCaptureFlipFlop(%player, %flipflop);
		Game.updateObjHudAll();
		return true;
	}

	function FlipFlop::objectiveInit(%data, %flipflop)
	{
		// add this flipflop to missioncleanup
		%flipflopSet = nameToID("MissionCleanup/FlipFlops");
		if(%flipflopSet <= 0) {
			%flipflopSet = new SimSet("FlipFlops");
			MissionCleanup.add(%flipflopSet);
		}
		%flipflopSet.add(%flipflop);

		// see if there's a holo projector associated with this flipflop
		// search the flipflop's folder for a holo projector
		// if one exists, associate it with the flipflop

		%flipflop.projector = 0;
		%folder = %flipflop.getGroup();
		for(%i = 0; %i < %folder.getCount(); %i++) 
		{
			%proj = %folder.getObject(%i);
			// weird, but line below prevents console error
			//if(%proj.getClassName() !$= "SimGroup" && %proj.getClassName() !$= "InteriorInstance")
			// z0dd - ZOD, 5/19/03. Added TSStatic for spam fix
			if(%proj.getClassName() !$= "SimGroup" && %proj.getClassName() !$= "InteriorInstance" && %proj.getClassName() !$= "TSStatic")
			{
				if(%proj.getDatablock().getName() $= "LogoProjector") 
				{
					%flipflop.projector = %proj;
					%flipflop.projector.holo = 0;
					break;
				}
			}
		}

		// may have been hidden
		%target = %flipFlop.getTarget();
		if(%target != -1)
		{
			// set flipflop to base skin
			if(%flipflop.team != 0){
				setTargetSkin(%target, $teamSkin[%flipflop.team]);
			}
			else{
				setTargetSkin(%target, $teamSkin[0]);
			}
			// make this always visible in the commander map
			setTargetAlwaysVisMask(%target, 0xffffffff);

			// make this always visible in the commander list
			setTargetRenderMask(%target, getTargetRenderMask(%target) | $TargetInfo::CommanderListRender);
		}
	}

};

function TDMGame::awardScoreTkDestroy(%game, %cl, %obj)
{
   %cl.tkDestroys++;
   messageTeamExcept(%cl, 'msgTkDes', '\c5Teammate %1 destroyed your team\'s %3 objective!', %cl.name, %game.cleanWord(%obj.getDataBlock().targetTypeTag));
   messageClient(%cl, 'msgTkDes', '\c0You have been penalized %1 points for destroying your teams equiptment.', %game.SCORE_PER_TK_DESTROY);
   %game.recalcScore(%cl);
   %game.shareScore(%cl, %game.SCORE_PER_TK_DESTROY);
}


function TDMGame::vehicleDestroyed(%game, %vehicle, %destroyer)
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
        //messageTeamExcept(%destroyer, 'msgVehicleDestroy', '\c0%1 destroyed an enemy %2.', %destroyerName, %vehicleType); // z0dd - ZOD, 8/20/02. not needed with new messenger on line below
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

function TDMGame::awardScoreVehicleDestroyed(%game, %client, %vehicleType, %mult, %passengers)
{
    // z0dd - ZOD, 9/29/02. Removed T2 demo code from here
    
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

function TDMGame::awardScoreStaticShapeDestroy(%game, %cl, %obj)
{
   %dataName = %obj.getDataBlock().getName();
   switch$ ( %dataName )
   {
      case "GeneratorLarge":
         %cl.genDestroys++;
         %value = %game.SCORE_PER_DESTROY_GEN;
         %msgType = 'msgGenDes';
         %tMsg = '\c5%1 destroyed an enemy %2 Generator!';
         %clMsg = '\c0You received a %1 point bonus for destroying an enemy generator.';

      case "SolarPanel":
         %cl.solarDestroys++;
         %value = %game.SCORE_PER_DESTROY_SOLAR;
         %msgType = 'msgSolarDes';
         %tMsg = '\c5%1 destroyed an enemy %2 Solar Panel!';
         %clMsg = '\c0You received a %1 point bonus for destroying an enemy solar panel.';

      case "SensorLargePulse" or "SensorMediumPulse":
         %cl.sensorDestroys++;
         %value = %game.SCORE_PER_DESTROY_SENSOR;
         %msgType = 'msgSensorDes';
         %tMsg = '\c5%1 destroyed an enemy %2 Sensor!';
         %clMsg = '\c0You received a %1 point bonus for destroying an enemy pulse sensor.';

      case "TurretBaseLarge":
         %cl.turretDestroys++;
         %value = %game.SCORE_PER_DESTROY_TURRET;
         %msgType = 'msgTurretDes';
         %tMsg = '\c5%1 destroyed an enemy %2 Turret!';
         %clMsg = '\c0You received a %1 point bonus for destroying an enemy base turret.';

      case "StationInventory":
         %cl.IStationDestroys++;
         %value = %game.SCORE_PER_DESTROY_ISTATION;
         %msgType = 'msgInvDes';
         %tMsg = '\c5%1 destroyed an enemy %2 Inventory Station!';
         %clMsg = '\c0You received a %1 point bonus for destroying an enemy inventory station.';

      case "StationAmmo":
         %cl.aStationDestroys++;
         %value = %game.SCORE_PER_DESTROY_ASTATION;
         %msgType = 'msgAmmoDes';
         %tMsg = '\c5%1 destroyed an enemy %2 Ammo Station!';
         %clMsg = '\c0You received a %1 point bonus for destroying an enemy ammo station.';

      case "StationVehicle":
         %cl.VStationDestroys++;
         %value = %game.SCORE_PER_DESTROY_VSTATION;
         %msgType = 'msgVSDes';
         %tMsg = '\c5%1 destroyed an enemy Vehicle Station!';
         %clMsg = '\c0You received a %1 point bonus for destroying an enemy vehicle station.';

      case "SentryTurret":
         %cl.sentryDestroys++;
         %value = %game.SCORE_PER_DESTROY_SENTRY;
         %msgType = 'msgSentryDes';
         %tMsg = '\c5%1 destroyed an enemy %2 Sentry Turret!';
         %clMsg = '\c0You received a %1 point bonus for destroying an enemy sentry turret.';

      case "DeployedMotionSensor" or "DeployedPulseSensor":
         %cl.depSensorDestroys++;
         %value = %game.SCORE_PER_DESTROY_DEP_SENSOR;
         %msgType = 'msgDepSensorDes';
         %tMsg = '\c5%1 destroyed an enemy Deployed Sensor!';
         %clMsg = '\c0You received a %1 point bonus for destroying an enemy deployed sensor.';

      case "TurretDeployedWallIndoor" or "TurretDeployedFloorIndoor" or "TurretDeployedCeilingIndoor":
         %cl.depTurretDestroys++;
         %value = %game.SCORE_PER_DESTROY_DEP_TUR;
         %msgType = 'msgDepTurDes';
         %tMsg = '\c5%1 destroyed an enemy Deployed Spider Clamp Turret!';
         %clMsg = '\c0You received a %1 point bonus for destroying an enemy deployed spider clamp turret.';

      case "TurretDeployedOutdoor":
         %cl.depTurretDestroys++;
         %value = %game.SCORE_PER_DESTROY_DEP_TUR;
         %msgType = 'msgDepTurDes';
         %tMsg = '\c5%1 destroyed an enemy Deployed Landspike Turret!';
         %clMsg = '\c0You received a %1 point bonus for destroying an enemy deployed landspike turret.';

      case "DeployedStationInventory":
         %cl.depStationDestroys++;
         %value = %game.SCORE_PER_DESTROY_DEP_INV;
         %msgType = 'msgDepInvDes';
         %tMsg = '\c5%1 destroyed an enemy Deployed Station!';
         %clMsg = '\c0You received a %1 point bonus for destroying an enemy deployed station.';

      case "MPBTeleporter":
         %cl.mpbtstationDestroys++;
         %value = %game.SCORE_PER_DESTROY_MPBTSTATION;
         %msgType = 'msgMPBTeleDes';
         %tMsg = '\c5%1 destroyed an enemy MPB Teleport Station!';
         %clMsg = '\c0You received a %1 point bonus for destroying an enemy MPB teleport station.';

      default:
         return;
   }
   teamDestroyMessage(%cl, 'MsgDestroyed', %tMsg, %cl.name, %obj.nameTag);
   messageClient(%cl, %msgType, %clMsg, %value, %dataName);
   %game.recalcScore(%cl);
   %game.shareScore(%scorer, %value);
}

function TDMGame::shareScore(%game, %client, %amount)
{
    // z0dd - ZOD, 9/29/02. Removed T2 demo code from here    
    
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

function TDMGame::objectRepaired(%game, %obj, %objName)
{
   %game.staticShapeOnRepaired(%obj, %objName);
   %obj.wasDisabled = false;
}

function TDMGame::staticShapeOnRepaired(%game, %obj, %objName)
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

         case "SensorLargePulse" or "SensorMediumPulse":
            %repairman.sensorRepairs++;
            %score = %game.SCORE_PER_REPAIR_SENSOR;
            %tMsgType = 'msgSensorRepaired';
            %msgType = 'msgSensorRep';
            %tMsg = '\c0%1 repaired the %2 Pulse Sensor!';
            %clMsg = '\c0You received a %1 point bonus for repairing a pulse sensor.';

         case "StationInventory" or "StationAmmo":
            %repairman.stationRepairs++;
            %score = %game.SCORE_PER_REPAIR_ISTATION;
            %tMsgType = 'msgStationRepaired';
            %msgType = 'msgIStationRep';
            %tMsg = '\c0%1 repaired the %2 Station!';
            %clMsg = '\c0You received a %1 point bonus for repairing a station.';

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

         case "DeployedMotionSensor" or "DeployedPulseSensor":
            %repairman.depSensorRepairs++;
            %tMsgType = 'msgDepSensorRepaired';
            %msgType = 'msgDepSensorRep';
            %score = %game.SCORE_PER_REPAIR_DEP_SENSOR;
            %tMsg = '\c0%1 repaired a Deployed Sensor!';
            %clMsg = '\c0You received a %1 point bonus for repairing a deployed sensor.';

         case "TurretDeployedWallIndoor" or "TurretDeployedFloorIndoor" or "TurretDeployedCeilingIndoor":
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
            %tMsg = '\c0%1 repaired a Deployable Station!';
            %clMsg = '\c0You received a %1 point bonus for repairing a deployed station.';

         case "MPBTeleporter":
            %repairman.mpbtstationRepairs++;
            %score = %game.SCORE_PER_REPAIR_MPBTSTATION;
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

function markTargetTDM(%client,%clTarget) // out of bountygame
{
   if(isObject(%clTarget) && isObject(%client) && !%client.isAIControlled())
   {
      %visMask = getSensorGroupAlwaysVisMask(%clTarget.getSensorGroup());
      %visMask |= (1 << %client.getSensorGroup());
      setSensorGroupAlwaysVisMask(%clTarget.getSensorGroup(), %visMask);
      %clTarget.player.scopeToClient(%client);
      %client.setTargetId(%clTarget.target);
      commandToClient(%client, 'TaskInfo', %client, -1, false, $TDMGame::wpMessage);
      %client.sendTargetTo(%client, true);
   }
}
function hideTargetTDM(%client,%clTarget)
{
   if(isObject(%clTarget) && isObject(%client) && !%client.isAIControlled())
   {
      %visMask = getSensorGroupAlwaysVisMask(%clTarget.getSensorGroup());
      %visMask &= ~(1 << %client.getSensorGroup());
      setSensorGroupAlwaysVisMask(%clTarget.getSensorGroup(), %visMask);
      removeClientTargetType(%client, "AssignedTask");
   }
}
function TDMGame::missionLoadDone(%game){
	parent::missionLoadDone(%game);
	for(%i = 1; %i < (%game.numTeams + 1); %i++){
      $teamScore[%i] = 0;
	}
}
//--------- TDM SCORING INIT ------------------
function TDMGame::initGameVars(%game){

	%game.SCORE_PER_SUICIDE = 0; 
	%game.SCORE_PER_TEAMKILL = -2;
	%game.SCORE_PER_DEATH = 0;  

	%game.SCORE_PER_KILL = 1; 
	%game.SCORE_PER_PLYR_FLIPFLOP_CAP = 10;
	%game.SCORE_PER_TURRET_KILL = 1; 
	%game.SCORE_PER_FLIPFLOP_DEFEND = 1;

	%game.RADIUS_FLIPFLOP_DEFENSE = 20; //meters
	%game.TIME_BONUS_FACTOR =  0.1; // secs times factor = bonus poitns to the mark player 
	%game.MIN_BONUS_POINTS =  10; 
	%game.DEFEND_TARGET_BONUS = 2; 
	%game.DEFEND_TARGET_RADIUS = 40;
	%game.KILL_TARGET_BONUS = 5; 
	%game.CATCHUP_FACTOR =  0.75; // catchup factor how much the loosing team can catch up by 
	%game.CATCHUP_DIFFERENCE = 25;// at what point do we trigger a way for the other team to catch up
	%game.MARK_TARGET_TIME = 60000 * 2;// how long between targets;

   %game.markedClient = 0;
	%game.markedTeam = 0;
	%game.markSimTime = getSimTime();

	%game.SCORE_PER_TK_DESTROY          = -10;

	%game.SCORE_PER_DESTROY_GEN         = 10;
   %game.SCORE_PER_DESTROY_SENSOR      = 4;
   %game.SCORE_PER_DESTROY_TURRET      = 5;
   %game.SCORE_PER_DESTROY_ISTATION    = 2;
   %game.SCORE_PER_DESTROY_VSTATION    = 5;
   %game.SCORE_PER_DESTROY_MPBTSTATION = 3; // z0dd - ZOD, 4/24/02. MPB Teleporter
   %game.SCORE_PER_DESTROY_SOLAR       = 5;
   %game.SCORE_PER_DESTROY_SENTRY      = 4;
   %game.SCORE_PER_DESTROY_DEP_SENSOR  = 1;
   %game.SCORE_PER_DESTROY_DEP_INV     = 2;
   %game.SCORE_PER_DESTROY_DEP_TUR     = 3;



   %game.SCORE_PER_DESTROY_SHRIKE      = 5;
   %game.SCORE_PER_DESTROY_BOMBER      = 8;
   %game.SCORE_PER_DESTROY_TRANSPORT   = 5;
   %game.SCORE_PER_DESTROY_WILDCAT     = 5;
   %game.SCORE_PER_DESTROY_TANK        = 8;
   %game.SCORE_PER_DESTROY_MPB         = 12;
   %game.SCORE_PER_PASSENGER           = 2;

	%game.SCORE_PER_REPAIR_GEN          = 8;
   %game.SCORE_PER_REPAIR_SENSOR       = 1;
   %game.SCORE_PER_REPAIR_TURRET       = 4;
   %game.SCORE_PER_REPAIR_ISTATION     = 2;
   %game.SCORE_PER_REPAIR_VSTATION     = 4;
   %game.SCORE_PER_REPAIR_MPBTSTATION  = 3; // z0dd - ZOD, 4/24/02. MPB Teleporter
   %game.SCORE_PER_REPAIR_SOLAR        = 4;
   %game.SCORE_PER_REPAIR_SENTRY       = 2;
   %game.SCORE_PER_REPAIR_DEP_SEN      = 1; // z0dd - ZOD, 4/24/02. Deployed sensors
   %game.SCORE_PER_REPAIR_DEP_TUR      = 3;
   %game.SCORE_PER_REPAIR_DEP_INV      = 2;

	%game.RADIUS_GEN_DEFENSE = 20;  //meters
}

function TDMGame::setUpTeams(%game)
{
   DefaultGame::setUpTeams(%game);

   // reset the visibility of team 0 (team is still defaulted as friendly)   
   setSensorGroupAlwaysVisMask(0, 0);
}

function TDMGame::startMatch(%game)
{
	%game.updateObjHudAll();
   DefaultGame::startMatch(%game);
}

function TDMGame::checkScoreLimit(%game)
{
	%game.updateObjHudAll();
	%scoreLimit = %game.getScoreLimit();
	if($teamScore[1] >= %scoreLimit || $teamScore[2] >= %scoreLimit) 
		%game.scoreLimitReached();
}

function TDMGame::getScoreLimit(%game)
{
	%scoreLimit = MissionGroup.TDM_scoreLimit;
	if(%scoreLimit $= "")
		%scoreLimit = 300;

	return %scoreLimit;
}

function TDMGame::scoreLimitReached(%game)
{
	%game.gameOver();
   cycleMissions();
}

function TDMGame::timeLimitReached(%game)
{
	%game.gameOver();
   cycleMissions();
}

function TDMGame::gameOver(%game)
{
  if(isObject(%game.markedClient)){
		%time = getSimTime() - %game.markSimTime;
		%timebonus = (%time/1000) * %game.TIME_BONUS_FACTOR;
		%game.awardScoreBonus(%game.markedClient, %time, %timebonus);
		%game.recalcScore(%game.markedClient);
		%game.markedClient = 0;
	}
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
		%game.resetScore(%client);
	}
	messageAll('MsgSPCurrentObjective1', "", "");
	messageAll('MsgSPCurrentObjective2', "", "");
}



function TDMGame::updateObjHud(%game, %client){
	messageClient(%client, 'MsgSPCurrentObjective1', "", '%1 %2/%3 Bonus %4x',$TeamName[1], $teamScore[1], game.getScoreLimit(), %game.countFlipsHeld(1)+1);
	messageClient(%client, 'MsgSPCurrentObjective2', "", '%1 %2/%3 Bonus %4x',$TeamName[2], $teamScore[2], game.getScoreLimit(), %game.countFlipsHeld(2)+1);
}

function TDMGame::updateObjHudAll(%game){
	messageAll('MsgSPCurrentObjective1', "", '%1 %2 / %3 Bonus %4x',$TeamName[1], $teamScore[1], game.getScoreLimit(), %game.countFlipsHeld(1)+1);
	messageAll('MsgSPCurrentObjective2', "", '%1 %2 / %3 Bonus %4x',$TeamName[2], $teamScore[2], game.getScoreLimit(), %game.countFlipsHeld(2)+1);
}
function TDMGame::clientMissionDropReady(%game, %client){
   messageClient(%client, 'MsgClientReady',"", "SinglePlayerGame");
	%game.updateObjHud(%client);
	
	//%game.populateTeamRankArray(%client);
	//messageClient(%client, 'MsgYourRankIs', "", -1);

   messageClient(%client, 'MsgMissionDropInfo', '\c0You are in mission %1 (%2).', $MissionDisplayName, $MissionTypeDisplayName, $ServerName ); 
	
	DefaultGame::clientMissionDropReady(%game, %client);
}

function TDMGame::assignClientTeam(%game, %client, %respawn){
	DefaultGame::assignClientTeam(%game, %client, %respawn);
	// if player's team is not on top of objective hud, switch lines
	messageClient(%client, 'MsgCheckTeamLines', "", %client.team);
}
function TDMGame::clientChangeTeam(%game, %client, %team, %fromObs, %respawned){ // z0dd - ZOD, 6/06/02. Don't send a message if player used respawn feature. Added %respawned
	parent::clientChangeTeam(%game, %client, %team, %fromObs, %respawned);
	if(isObject(%game.markedClient)){
		markTargetTDM(%client, %game.markedClient);
	}
}
function TDMGame::getNumFlipFlops(){
     %ffGroup = nameToID("MissionCleanup/FlipFlops");
	 return %ffGroup.getCount();
}

function TDMGame::countFlipsHeld(%game, %team)
{
	%teamHeld = 0;
	if(isObject(FlipFlops))
	{
		%numFF = FlipFlops.getCount();
		for(%j = 0; %j < %numFF; %j++)
		{
			%curFF = FlipFlops.getObject(%j);
			if(%curFF.team == %team)
				%teamHeld++;
		}
	}

	return %teamHeld;
}

function TDMGame::countFlips(%game)
{
	return true;
}

function TDMGame::equip(%game, %player)
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
	%player.setInventory(EnergyPack,1);
	%player.weaponCount = 3;

	%player.use("Blaster");
}                  

//--------------- Scoring functions -----------------
function TDMGame::recalcScore(%game, %cl)
{
	%killValue = %cl.kills * %game.SCORE_PER_KILL;
	%deathValue = %cl.deaths * %game.SCORE_PER_DEATH;

	if (%killValue - %deathValue == 0)
		%killPoints = 0;
	else
		%killPoints = (%killValue * %killValue) / (%killValue - %deathValue);


	%cl.offenseScore = %killPoints +
							%cl.killTarget          * %game.KILL_TARGET_BONUS + 
							%cl.flipFlopsCapped     * %game.SCORE_PER_PLYR_FLIPFLOP_CAP + 
							%cl.suicides            * %game.SCORE_PER_SUICIDE + 
							%cl.teamKills           * %game.SCORE_PER_TEAMKILL + 
							%cl.tkDestroys          * %game.SCORE_PER_TK_DESTROY + 
							%cl.genDestroys         * %game.SCORE_PER_DESTROY_GEN + 
							%cl.sensorDestroys      * %game.SCORE_PER_DESTROY_SENSOR + 
							%cl.turretDestroys      * %game.SCORE_PER_DESTROY_TURRET + 
							%cl.iStationDestroys    * %game.SCORE_PER_DESTROY_ISTATION + 
							%cl.vstationDestroys    * %game.SCORE_PER_DESTROY_VSTATION + 
							%cl.mpbtstationDestroys * %game.SCORE_PER_DESTROY_MPBTSTATION + 
							%cl.solarDestroys       * %game.SCORE_PER_DESTROY_SOLAR + 
							%cl.sentryDestroys      * %game.SCORE_PER_DESTROY_SENTRY + 
							%cl.depSensorDestroys   * %game.SCORE_PER_DESTROY_DEP_SENSOR + 
							%cl.depTurretDestroys   * %game.SCORE_PER_DESTROY_DEP_TUR + 
							%cl.depStationDestroys  * %game.SCORE_PER_DESTROY_DEP_INV +
							%cl.vehicleScore + %cl.vehicleBonus; 

%cl.defenseScore = %cl.genDefends    * %game.SCORE_PER_GEN_DEFEND +  
							%cl.flipFlopDefends    * %game.SCORE_PER_FLIPFLOP_DEFEND +
							%cl.defendTarget       * %game.DEFEND_TARGET_BONUS +
							%cl.turretKills        * %game.SCORE_PER_TURRET_KILL +   
							%cl.genRepairs         * %game.SCORE_PER_REPAIR_GEN +
							%cl.SensorRepairs      * %game.SCORE_PER_REPAIR_SENSOR +
							%cl.TurretRepairs      * %game.SCORE_PER_REPAIR_TURRET +
							%cl.StationRepairs     * %game.SCORE_PER_REPAIR_ISTATION +
							%cl.VStationRepairs    * %game.SCORE_PER_REPAIR_VSTATION +
							%cl.mpbtstationRepairs * %game.SCORE_PER_REPAIR_MPBTSTATION + // z0dd - ZOD 4/10/04. MPB Teleporter
							%cl.depSensorRepairs   * %game.SCORE_PER_REPAIR_DEP_SEN + // z0dd - ZOD 5/27/03. Deployed sensors       %cl.mpbtstationRepairs * %game.SCORE_PER_REPAIR_MPBTSTATION + // z0dd - ZOD 3/30/02. MPB Teleporter
							%cl.solarRepairs       * %game.SCORE_PER_REPAIR_SOLAR +
							%cl.sentryRepairs      * %game.SCORE_PER_REPAIR_SENTRY +
							%cl.depInvRepairs      * %game.SCORE_PER_REPAIR_DEP_INV +
							%cl.depTurretRepairs   * %game.SCORE_PER_REPAIR_DEP_TUR; 

	%cl.score =	mFloor(%cl.offenseScore + %cl.defenseScore + %cl.surviveBonus);
	//track switches held (not touched), switches defended, kills, deaths, suicides, tks
	
	%game.recalcTeamRanks(%cl);
}

function TDMGame::awardScoreBonus(%game, %client, %time, %bonus){
	if(%bonus $= ""){
		%bonus = 1;
	}
   %client.surviveBonus += %bonus;   
	messageClient(%client, 'msgClient', 'You stayed alive for %1 - %2 Bonus Points', %game.formatTime(%time), %bonus);
   %game.recalcScore(%killerID);    
} 


function TDMGame::awardDefTarget(%game, %client){
   %client.defendTarget++;   
	messageClient(%client, 'msgClient', '\c0You received a %1 point bonus for defending %2.', %game.DEFEND_TARGET_BONUS, %game.markedClient.name);	
   %game.recalcScore(%killerID);    
}

function TDMGame::awardKillTarget(%game, %client){
   %client.killTarget++;   
	messageClient(%client, 'msgClient', '\c0You received a %1 point bonus for killing %2.', %game.KILL_TARGET_BONUS, %game.markedClient.name);	
   %game.recalcScore(%killerID);    
}

function TDMGame::onClientKilled(%game, %clVictim, %clKiller, %damageType, %implement, %damageLoc){
   cancel(%clVictim.player.alertThread);

	if(%game.markedClient > 0 && !isObject(%game.markedClient)){
		messageAll('MsgClient','\c1Target has been lost.~wNflag_lost.wav');	
	}

	if(isObject(%game.markedClient) && %game.markedClient == %clVictim){
		%clVictim.player.unMountImage($FlagSlot);
		%time = getSimTime() - %game.markSimTime;
		%timebonus = (%time/1000) * %game.TIME_BONUS_FACTOR;
		%game.awardScoreBonus(%clVictim, %time, %timebonus);
		
	}

   parent::onClientKilled(%game, %clVictim, %clKiller, %damageType, %implement, %damageLoc);

	if(!isObject(%game.markedClient) && %game.markedClient > 0){// target loss 
		%game.markedClient = 0;
		%game.markedTeam  = 0;
		messageAll('msgClient', '\c1Target has been lost.~wNflag_lost.wav');
	}

	if(isObject(%game.markedClient) && %game.markedClient == %clVictim){
		%otherTeam = %clVictim.team == 1 ? 2 : 1;

		%teamBonus = mFloor(($teamScore[%clVictim.team] - $teamScore[%otherTeam]) * %game.CATCHUP_FACTOR);
		if(%teamBonus <= %game.MIN_BONUS_POINTS){
			%teamBonus = %game.MIN_BONUS_POINTS;
		}
		$teamScore[%otherTeam] += %teamBonus;
		messageTeam(%clVictim.team, 'MsgClient', '\c1Target has been killed %2 awarded %1 bonus points. ~wbassHit.wav',%teamBonus, $TeamName[%otherteam]);
		messageTeam(%otherTeam, 'MsgClient', '\c1Target has been killed %2 awarded %1 bonus points.~wNhunters_horde.wav', %teamBonus, $TeamName[%otherteam]);
		%game.checkScoreLimit();
		if(%clVictim.team != %clKiller.team){
			%game.awardKillTarget(%clKiller);		
		}

		%game.markedClient = 0;
		%game.markedTeam  = 0;
		for(%i = 0; %i < ClientGroup.getCount(); %i ++){
			%client = ClientGroup.getObject(%i);
			if(%client != %clVictim){
				hideTargetTDM(%client, %clVictim);
			}
		}
	}
	else if(isObject(%game.markedClient) && %game.markedClient.team == %clKiller.team){
		%mask = $TypeMasks::TerrainObjectType | $TypeMasks::InteriorObjectType | $TypeMasks::StaticShapeObjectType;
		%cpos = %clKiller.player.getWorldBoxCenter();
		%tgPos = %game.markedClient.player.getWorldBoxCenter();
		%dist = vectorDist(%cpos, %tgPos);

		if(%dist < %game.DEFEND_TARGET_RADIUS){
			%losResult = containerRayCast(%cpos, %tgPos, %mask,  %clKiller.player);
			%losObject = getWord(%losResult, 0);
			if (!isObject(%losObject)){// can we see the target 
				%game.awardDefTarget(%clKiller);
			}		
		}
	}
	

	if($TDMGame::enableMarkPlayers){
		%tc = 0;
		%winningTeam = ($teamScore[1] > $teamScore[2]) ? 1 : 2; 
		%losingTeam = (%winningTeam == 1) ? 2 : 1; 
		%pointDif = $teamScore[%winningTeam] -  $teamScore[%losingTeam];
		%time = getSimTime() - %game.markSimTime;
		//error(%pointDif SPC %time SPC %game.MARK_TARGET_TIME);
		if(!isObject(%game.markedClient) && ClientGroup.getCount() >= 4 && %pointDif > %game.CATCHUP_DIFFERENCE && %time > %game.MARK_TARGET_TIME){
			for(%i = 0; %i < ClientGroup.getCount(); %i ++){
				%client = ClientGroup.getObject(%i);
				%player = %client.player;
				if(isObject(%player) && %player.getState() !$= "Dead" && %client.team == %winningTeam){
					%teamList[%tc] = %client;
					%tc++;
				}
			}
			%randomClient = %teamList[getRandom(0,%teamCount[%winningTeam])];
			%game.markedClient = %randomClient;
			%game.markedTeam = %winningTeam;
			%game.markSimTime = getSimTime();
			%randomClient.player.mountImage(FlagImage, $FlagSlot, true, %game.getTeamSkin(%randomClient.team));
			for(%i = 0; %i < ClientGroup.getCount(); %i ++){
				%client = ClientGroup.getObject(%i);
				if(%client == %randomClient){
					messageClient( %randomClient, 'MsgLeaveMissionArea', '\c1You have been marked stay alive to gain bonus points.~wNflag_snatch.wav' );
					bottomPrint( %randomClient, "\nYou have been marked, stay alive to gain bonus points.", 5, 3 );

				}
				else{
					markTargetTDM(%client, %randomClient);
					if(%client.team == %randomClient.team){
						messageClient( %client, 'MsgLeaveMissionArea', '\c1Defend the target to prevent bonus points.~wNflag_snatch.wav' );
					}
					else{
						messageClient( %client, 'MsgLeaveMissionArea', '\c1Attack the target for team bonus.~wNflag_snatch.wav' );
					}
				}
			}
		}
	}
}



function TDMGame::awardTeamScoreKill(%game, %clVictim, %clKiller, %damageType, %implement){
	if(isObject(%implement) && %implement.getClassName() $= "Turret"){
		//error("damagetype" SPC %damageType SPC %implement);
		$teamScore[%implement.team]++; 
		%game.checkScoreLimit();
	}
	else if(%clVictim.team != %clKiller.team){
		%teamHeld = %game.countFlipsHeld(%clKiller.team);
		$teamScore[%clKiller.team] += 1 + %teamHeld;
		%game.checkScoreLimit();
	}
}

function TDMGame::awardScoreGenDefend(%game, %clKiller){
   %clKiller.genDefends++;
   if (%game.SCORE_PER_GEN_DEFEND != 0){
      messageClient(%clKiller, 'msgGenDef', '\c0You received a %1 point bonus for defending a generator.', %game.SCORE_PER_GEN_DEFEND);
      messageTeamExcept(%clKiller, 'msgGenDef', '\c2%1 defended our generator from an attack.', %clKiller.name); // z0dd - ZOD, 8/15/02. Tell team
   }
   %game.recalcScore(%cl);
    return %game.SCORE_PER_GEN_DEFEND;
}

function TDMGame::testGenDefend(%game, %clVictim, %clKiller)
{
   InitContainerRadiusSearch(%clVictim.plyrPointOfDeath, %game.RADIUS_GEN_DEFENSE, $TypeMasks::StaticShapeObjectType);
   %objID = containerSearchNext();
   while(%objID != 0)
   {
      %objType = %objID.getDataBlock().ClassName;
     if ((%objType $= "generator") && (%objID.team == %clKiller.team)){ 
        %game.awardScoreGenDefend(%clKiller);
        return true;
	  }
     else{
        %objID = containerSearchNext();
	  }
   }
   return false;  //didn't find a qualifying gen within required radius of victim's point of death 
}

function TDMGame::updateKillScores(%game, %clVictim, %clKiller, %damageType, %implement)
{
	%game.awardTeamScoreKill(%clVictim, %clKiller, %damageType, %implement);

   if(%game.testTurretKill(%implement))	//check for turretkill before awarded a non client points for a kill
   {    		
   	  %game.awardScoreTurretKill(%clVictim, %implement);  
   }
   else if (%game.testKill(%clVictim, %clKiller)) //verify victim was an enemy
   {
	  %game.awardScoreKill(%clKiller);
	  %game.awardScoreDeath(%clVictim);
	  %game.testGenDefend(%clVictim, %clKiller);
	  %clKiller.player.rk++;
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

function TDMGame::testPlayerFFDefend(%game, %victimID, %killerID)
{
   if (!isObject(%victimId) || !isObject(%killerId) || %killerId.team <= 0)
      return -1;

   //loop through the flipflops looking for one within range that belongs to the killer...
   for (%i = 0; %i < FlipFlops.getCount(); %i++)
   {
      %ffObj = FlipFlops.getObject(%i);
      if (VectorDist(%ffObj.position, %victimID.plyrPointOfDeath) < %game.RADIUS_FLIPFLOP_DEFENSE)
      {
         if (%ffObj.team == %killerID.team)
            return %ffObj;
      }
   }

   //none were found
   return -1;
}

function TDMGame::awardScorePlayerFFCap(%game, %cl, %this)
{
	if(!($missionRunning))
		return;

	%cl.flipFlopsCapped++;
   if (%game.SCORE_PER_PLYR_FLIPFLOP_CAP != 0)
   {
      messageClient(%cl, 'msgFFDef', '\c0You received a %1 point bonus for capping the point.', %game.SCORE_PER_PLYR_FLIPFLOP_CAP, %game.cleanWord(%this.namePoint));	
//      messageTeamExcept(%cl, 'msgFFDef', '\c0Teammate %1 received a %2 point bonus for holding the %3', %cl.name, %game.SCORE_PER_PLYR_FLIPFLOP_CAP, %game.cleanWord(%this.name));
   }      
	%game.recalcScore(%cl);
}

function TDMGame::awardScorePlayerFFDefend(%game, %cl, %flipflop)
{
	%cl.flipFlopDefends++;
   if (%game.SCORE_PER_FLIPFLOP_DEFEND != 0){
      messageClient(%cl, 'msgFFDef', '\c0You received a %1 point bonus for defending the point.', %game.SCORE_PER_FLIPFLOP_DEFEND, %game.cleanWord(%flipflop.name));	
   }      
	%game.recalcScore(%cl);
}

function TDMGame::testValidRepair(%game, %obj)
{
	return ((%obj.lastDamagedByTeam != %obj.team) && (%obj.repairedBy.team == %obj.team));
}

function TDMGame::genOnRepaired(%game, %obj, %objName)
{
		
	if (%game.testValidRepair(%obj))
	{
		%repairman = %obj.repairedBy;
		messageTeam(%repairman.team, 'msgGenRepaired', '\c0%1 repaired the %2 Generator!', %repairman.name, %obj.nameTag);		
	}				
}

function TDMGame::stationOnRepaired(%game, %obj, %objName)
{
	if (%game.testValidRepair(%obj))	
	{		
	   %repairman = %obj.repairedBy;
	   messageTeam(%repairman.team, 'msgStationRepaired', '\c0%1 repaired the %2 Inventory Station!', %repairman.name, %obj.nameTag);
	}
}

function TDMGame::sensorOnRepaired(%game, %obj, %objName)
{
	if (%game.testValidRepair(%obj))	
	{		
	   %repairman = %obj.repairedBy;
	   messageTeam(%repairman.team, 'msgSensorRepaired', '\c0%1 repaired the %2 Pulse Sensor!', %repairman.name, %obj.nameTag);
	}
}

function TDMGame::turretOnRepaired(%game, %obj, %objName)
{																												 
	if (%game.testValidRepair(%obj))	
	{		
	   %repairman = %obj.repairedBy;
	   messageTeam(%repairman.team, 'msgTurretRepaired', '\c0%1 repaired the %2 Turret!', %repairman.name, %obj.nameTag);
	}
}

function TDMGame::vStationOnRepaired(%game, %obj, %objName)
{
	if (%game.testValidRepair(%obj))	
	{		
	   %repairman = %obj.repairedBy;
	   messageTeam(%repairman.team, 'msgTurretRepaired', '\c0%1 repaired the %2 Vehicle Station!', %repairman.name, %obj.nameTag);
	}
}

//------------------------------------------------------------------------

function TDMGame::resetScore(%game, %client)
{
	%client.offenseScore = 0;
	%client.kills = 0;
	%client.deaths = 0;
   %client.suicides = 0;
	%client.teamKills = 0;
	%client.flipFlopsCapped = 0;
	%client.surviveBonus = 0;
	
	%client.defenseScore = 0;
	%client.turretKills = 0;
	%client.flipFlopDefends = 0;
	%client.defendTarget = 0;
	%client.killTarget = 0;
	%client.score = 0;

	%client.genDestroys = 0;
   %client.sensorDestroys = 0;
   %client.turretDestroys = 0;
   %client.iStationDestroys = 0;
   %client.vstationDestroys = 0;
   %client.mpbtstationDestroys = 0; // z0dd - ZOD 3/30/02. MPB Teleporter
   %client.solarDestroys = 0;
   %client.sentryDestroys = 0;
   %client.depSensorDestroys = 0;
   %client.depTurretDestroys = 0;
   %client.depStationDestroys = 0;
   %client.vehicleScore = 0; 
   %client.vehicleBonus = 0; 

	%client.genDefends = 0;

	%client.genRepairs = 0;
   %client.SensorRepairs = 0;
   %client.TurretRepairs = 0;
   %client.StationRepairs = 0;
   %client.VStationRepairs = 0;
   %client.mpbtstationRepairs = 0; // z0dd - ZOD 3/30/02. MPB Teleporter
   %client.solarRepairs = 0;
   %client.sentryRepairs = 0;
   %client.depSensorRepairs = 0; // z0dd - ZOD 5/27/03. Deployed sensors
   %client.depInvRepairs = 0;
   %client.depTurretRepairs = 0;
}

function TDMGame::applyConcussion(%game, %player)
{

}


function TDMGame::enterMissionArea( %game, %playerData, %player )
{
   if( %player.getState() $= "Dead" )
      return;

   %player.client.outOfBounds = false;
   messageClient( %player.client, 'EnterMissionArea', '\c1You have returned to the mission area.' );
   logEcho( %player.client.nameBase@" (pl "@%player@"/cl "@%player.client@") entered mission area" );

   // Disable out of bounds kill
   cancel( %player.alertThread );
}


function TDMGame::leaveMissionArea( %game, %playerData, %player )
{
   if( %player.getState() $= "Dead" )
      return;

   %player.client.outOfBounds = true;
   messageClient( %player.client, 'MsgLeaveMissionArea', '\c1You have left the mission area. Return or take damage.~wfx/misc/warning_beep.wav' );
   logEcho( %player.client.nameBase@" (pl "@%player@"/cl "@%player.client@") left mission area" );

   // Schedule out of bounds kill
   %player.alertThread = %game.schedule( 7500, "MissionAreaDamage", %player );
}

function TDMGame::MissionAreaDamage( %game, %player )
{
  if( %player.getState() !$= "Dead" )
  {
    %player.setDamageFlash( 0.1 );
    %prevHurt = %player.getDamageLevel();
    %player.setDamageLevel( %prevHurt + 0.09 );
    %player.alertThread = %game.schedule( 1000, "MissionAreaDamage", %player );
  }
  else
    %game.onClientKilled( %player.client, 0, $DamageType::OutOfBounds );
}
