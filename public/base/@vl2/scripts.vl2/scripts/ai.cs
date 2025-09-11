//-----------------------------------//
//        AI SCRIPT FUNCTIONS        //
//-----------------------------------//

//first, exec the supporting scripts
exec("scripts/aiDebug.cs");
exec("scripts/aiDefaultTasks.cs");
exec("scripts/aiObjectives.cs");
exec("scripts/aiInventory.cs");
exec("scripts/aiChat.cs");
exec("scripts/aiHumanTasks.cs");
exec("scripts/aiObjectiveBuilder.cs");
exec("scripts/aiBotProfiles.cs");

$AIModeStop = 0;
$AIModeWalk = 1;
$AIModeGainHeight = 2;
$AIModeExpress = 3;
$AIModeMountVehicle = 4;

$AIClientLOSTimeout = 15000;	//how long a client has to remain out of sight of the bot
										//before the bot "can't see" the client anymore...
$AIClientMinLOSTime = 10000;	//how long a bot will search for a client


//-----------------------------------//
//Objective weights - level 1

$AIWeightCapFlag[1]           = 5000;	//range 5100 to 5320
$AIWeightKillFlagCarrier[1]   = 4800;	//range 4800 to 5120
$AIWeightReturnFlag[1]        = 5001;	//range 5101 to 5321
$AIWeightDefendFlag[1]        = 3900;	//range 4000 to 4220
$AIWeightGrabFlag[1]          = 3850;	//range 3950 to 4170

$AIWeightDefendFlipFlop[1]		= 3900;  //range 4000 to 4220
$AIWeightCaptureFlipFlop[1]	= 3850;  //range 3850 to 4170

$AIWeightAttackGenerator[1]   = 3100;	//range 3200 to 3520 
$AIWeightRepairGenerator[1]   = 3200;	//range 3300 to 3620
$AIWeightDefendGenerator[1]   = 3100;	//range 3200 to 3420

$AIWeightMortarTurret[1]      = 3400;	//range 3500 to 3600
$AIWeightLazeObject[1]        = 3200;  //range 3300 to 3400
$AIWeightRepairTurret[1]      = 3100;  //range 3200 to 3420

$AIWeightAttackInventory[1]   = 2900;	//range 2800 to 2920 
$AIWeightRepairInventory[1]   = 2900;	//range 2800 to 2920

$AIWeightEscortOffense[1]     = 2900;  //range 2800 to 2920 
$AIWeightEscortCapper[1]      = 3250;	//range 3350 to 3470

//used to allow a bot to finish tasks once started.
$AIWeightContinueDeploying		= 4250;
$AIWeightContinueRepairing		= 4250;

//Objective weights from human
$AIWeightHumanIssuedCommand		= 4450;
$AIWeightHumanIssuedEscort			= 4425;

//Objective weights - level 2
$AIWeightCapFlag[2]           =    0;	//only one person can ever cap a flag
$AIWeightKillFlagCarrier[2]   = 4800;	//range 4800 to 5020
$AIWeightReturnFlag[2]        = 4100;	//range 4200 to 4320
$AIWeightDefendFlag[2]        = 2000;	//range 2100 to 2220
$AIWeightGrabFlag[2]          = 2000;	//range 2100 to 2220

$AIWeightDefendFlipFlop[2]		= 2000;  //range 2100 to 2220
$AIWeightDefendFlipFlop[3]		= 1500;  //range 1600 to 1720
$AIWeightDefendFlipFlop[4]		= 1000;  //range 1100 to 1220

$AIWeightAttackGenerator[2]   = 1600;	//range 1700 to 1920 
$AIWeightRepairGenerator[2]   = 1600;	//range 1700 to 1920
$AIWeightDefendGenerator[2]   = 1500;	//range 1600 to 1720

$AIWeightAttackInventory[2]   = 1400;	//range 1500 to 1720 
$AIWeightRepairInventory[2]   = 1400;	//range 1500 to 1720

$AIWeightMortarTurret[2]      = 1000;	//range 1100 to 1320
$AIWeightLazeObject[2]        =    0;  //no need to have more than one targetter
$AIWeightRepairTurret[2]      = 1000;  //range 1100 to 1320

$AIWeightEscortOffense[2]     = 2900;  //range 3300 to 3420 
$AIWeightEscortCapper[2]      = 3000;	//range 3100 to 3220


function AIInit()
{
   AISlicerInit();
   installNavThreats();
   NavDetectForceFields();
//   ShowFPS();

	//enable the use of grenades
	$AIDisableGrenades = false;
	$AIDisableChat = false;
										
	//create the "objective delete set"
	if(nameToId("AIBombLocationSet") <= 0)
	{
		$AIBombLocationSet = new SimSet("AIBombLocationSet");
      MissionCleanup.add($AIBombLocationSet);
	}

	//create the Inventory group
	if(nameToId("AIStationInventorySet") <= 0)
	{
		$AIInvStationSet = new SimSet("AIStationInventorySet");
      MissionCleanup.add($AIInvStationSet);
	}

	//create the Item group
	if (nameToId("AIItemSet") <= 0)
	{
		$AIItemSet = new SimSet("AIItemSet");
      MissionCleanup.add($AIItemSet);
	}

	//create the Item group
	if (nameToId("AIGrenadeSet") <= 0)
	{
		$AIGrenadeSet = new SimSet("AIGrenadeSet");
      MissionCleanup.add($AIGrenadeSet);
	}

	//create the weapon group
	if (nameToId("AIWeaponSet") <= 0)
	{
		$AIWeaponSet = new SimSet("AIWeaponSet");
      MissionCleanup.add($AIWeaponSet);
	}

	//create the deployed turret group
	if (nameToID("AIRemoteTurretSet") <= 0)
	{
		$AIRemoteTurretSet = new SimSet("AIRemoteTurretSet");
      MissionCleanup.add($AIRemoteTurretSet);
	}

	//create the deployed turret group
	if (nameToID("AIDeployedMineSet") <= 0)
	{
		$AIDeployedMineSet = new SimSet("AIDeployedMineSet");
      MissionCleanup.add($AIDeployedMineSet);
	}

	//create the deployed turret group
	if (nameToID("AIVehicleSet") <= 0)
	{
		$AIVehicleSet = new SimSet("AIVehicleSet");
      MissionCleanup.add($AIVehicleSet);
	}

   %missionGroupFolder = nameToID("MissionGroup");
   %missionGroupFolder.AIMissionInit();
}

// this is called at mission load by the specific game type
function AIInitObjectives(%team, %game)
{
   %group = nameToID("MissionGroup/Teams/team" @ %team @ "/AIObjectives");
   if(%group < 0)
      return; // opps, there is no Objectives set for this team.
   
   // add the grouped objectives to the teams Q
   %count = %group.getCount();
	for (%i = 0; %i < %count; %i++)
	{
      %objective = %group.getObject(%i);
		if (%objective.getClassName() !$= "AIObjective")
		{
			%grpCount = %objective.getCount();
			for (%j = 0; %j < %grpCount; %j++)
			{
				%grpObj = %objective.getObject(%j);
		      if (%objective.gameType $= "" || %objective.gameType $= "all")
		         %objType = "";
		      else
		         %objType = %objective.gameType @ "Game";
		      
		      if (%objType $= "" || %objType $= %game.class)
				{
					%grpObj.group = %objective;
			      $ObjectiveQ[%team].add(%grpObj);
				}
			}
		}
	}

   
   // add the non-grouped objectives to the teams Q
   %count = %group.getCount();
   for(%i = 0; %i < %count; %i++)
   {
      %objective = %group.getObject(%i);

		//if the objective is not an "AIObjective", assume it's a group and continue
		if (%objective.getClassName() !$= "AIObjective")
			continue;

      if (%objective.gameType $= "" || %objective.gameType $= "all")
         %objType = "";
      else
         %objType = %objective.gameType @ "Game";
      
      if (%objType $= "" || %objType $= %game.class)
		{
			%objective.group = "";
	      $ObjectiveQ[%team].add(%objective);
		}
	}

	// initialize the objectives
   %count = $ObjectiveQ[%team].getCount();
   for(%i = 0; %i < %count; %i++)
   {
      %objective = $ObjectiveQ[%team].getObject(%i);

		//clear out any dynamic fields
		%objective.clientLevel1 = "";
		%objective.clientLevel2 = "";
		%objective.clientLevel3 = "";
		%objective.isInvalid = false;
		%objective.repairObjective = "";

      //set the location, if required
	   if (%objective.position !$= "0 0 0")
		   %objective.location = %objective.position;

      // find targeted object ID's
      if(%objective.targetObject !$= "")
         %objective.targetObjectId = NameToId(%objective.targetObject);
      else
	      %objective.targetObjectId = -1;
   
      if(%objective.targetClientObject !$= "")
         %objective.targetClientId = NameToId(%objective.targetClient);
      else
	      %objective.targetClientId = -1;

	   if (%objective.position $= "0 0 0")
	   {
		   if (%objective.location $= "0 0 0")
		   {
			   if (%objective.targetObjectId > 0)
				   %objective.position = %objective.targetObjectId.position;
		   }
		   else
			   %objective.position = %objective.location;
	   }
   }

	//finally, sort the objectiveQ
	$ObjectiveQ[%team].sortByWeight();
}

//This function is designed to clear out the objective Q's, and clear the task lists from all the AIs
function AIMissionEnd()
{
	//disable the AI system
	AISystemEnabled(false);

	//loop through the client list, and clear the tasks of each bot
	%count = ClientGroup.getCount();
	for (%i = 0; %i < %count; %i++)
	{
		%client = ClientGroup.getObject(%i);
		if (%client.isAIControlled())
		{
			//cancel the respawn thread and the objective thread...
			cancel(%client.respawnThread);
			cancel(%client.objectiveThread);

         //reset the clients tasks, variables, etc...
	      AIUnassignClient(%client);
         %client.stop();
			%client.clearTasks();
         %client.clearStep();
         %client.lastDamageClient = -1;
         %client.lastDamageTurret = -1;
         %client.shouldEngage = -1;
         %client.setEngageTarget(-1);
         %client.setTargetObject(-1);
	      %client.pilotVehicle = false;
         %client.defaultTasksAdded = false;

	      //do the nav graph cleanup
	      %client.missionCycleCleanup();
		}
	}

	//clear the objective Q's
	for (%i = 0; %i <= Game.numTeams; %i++)
	{
		if (isObject($ObjectiveQ[%i]))
		{
			$ObjectiveQ[%i].clear();
			$ObjectiveQ[%i].delete();
		}
		$ObjectiveQ[%i] = "";
	}

	//now delete all the sets used by the AI system...
	if (isObject($AIBombLocationSet))
   	$AIBombLocationSet.delete();
	$AIBombLocationSet = "";

	if (isObject($AIInvStationSet))
   	$AIInvStationSet.delete();
	$AIInvStationSet = "";

	if (isObject($AIItemSet))
   	$AIItemSet.delete();
	$AIItemSet = "";

	if (isObject($AIGrenadeSet))
   	$AIGrenadeSet.delete();
	$AIGrenadeSet = "";

	if (isObject($AIWeaponSet))
   	$AIWeaponSet.delete();
	$AIWeaponSet = "";

	if (isObject($AIRemoteTurretSet))
   	$AIRemoteTurretSet.delete();
	$AIRemoteTurretSet = "";

	if (isObject($AIDeployedMineSet))
   	$AIDeployedMineSet.delete();
	$AIDeployedMineSet = "";

	if (isObject($AIVehicleSet))
   	$AIVehicleSet.delete();
	$AIVehicleSet = "";
}

//FUNCTIONS ON EACH OBJECT EXECUTED AT MISSION LOAD TIME
function SimGroup::AIMissionInit(%this)
{
   for(%i = 0; %i < %this.getCount(); %i++)
      %this.getObject(%i).AIMissionInit(%this);   
}

function GameBase::AIMissionInit(%this)
{
   %this.getDataBlock().AIMissionInit(%this);
}

function StationInventory::AIMissionInit(%data, %object)
{
   $AIInvStationSet.add(%object);
}

function Flag::AIMissionInit(%data, %object)
{
	if (%object.team >= 0)
		$AITeamFlag[%object.team] = %object;
}

function SimObject::AIMissionInit(%this)
{
	//this function is declared to prevent console error msg spam...
}

function ItemData::AIMissionInit(%data, %object)
{
	$AIItemSet.add(%object);
}

function AIThrowObject(%object)
{
	$AIItemSet.add(%object);
}

function AIGrenadeThrown(%object)
{
	$AIGrenadeSet.add(%object);
}

function AIDeployObject(%client, %object)
{
	//first, set the object id on the client
	%client.lastDeployedObject = %object;

	//now see if it was a turret...
	%type = %object.getDataBlock().getName();
	if (%type $= "TurretDeployedFloorIndoor" || %type $= "TurretDeployedWallIndoor" ||
				%type $= "TurretDeployedCeilingIndoor" || %type $= "TurretDeployedOutdoor")
	{
		$AIRemoteTurretSet.add(%object);
	}
}

function AIDeployMine(%object)
{
	$AIDeployedMineSet.add(%object);
}

function AIVehicleMounted(%vehicle)
{
	$AIVehicleSet.add(%vehicle);
}

function AICorpseAdded(%corpse)
{
   if (isObject(%corpse))
   {
      %corpse.isCorpse = true;
	   $AIItemSet.add(%corpse);
   }
}

//OTHER UTILITY FUNCTIONS

function AIConnection::onAIDrop(%client)
{
	//make sure we're trying to drop an AI
	if (!isObject(%client) || !%client.isAIControlled())
		return;

	//clear the ai from any objectives, etc...
	AIUnassignClient(%client);
	%client.clearTasks();
	%client.clearStep();
	%client.defaultTasksAdded = false;

	//kill the player, which should cause the Game object to perform whatever cleanup is required.
   if (isObject(%client.player))
      %client.player.scriptKill(0);

	//do the nav graph cleanup
	%client.missionCycleCleanup();
}

function AIConnection::endMission(%client)
{
	//cancel the respawn thread, and spawn them manually
	cancel(%client.respawnThread);
   cancel(%client.objectiveThread);
}

function AIConnection::startMission(%client)
{
	//assign the team
	if (%client.team <= 0)
	   Game.assignClientTeam(%client);

	//set the client's sensor group...
   setTargetSensorGroup( %client.target, %client.team );
   %client.setSensorGroup( %client.team );

	//sends a message so everyone know the bot is in the game...
	Game.AIHasJoined(%client);
   %client.matchStartReady = true;

	//spawn the bot...
	onAIRespawn(%client);
}

function AIConnection::onAIConnect(%client, %name, %team, %skill, %offense, %voice, %voicePitch)
{
   // Sex/Race defaults
   %client.sex = "Male";
   %client.race = "Human";
   %client.armor = "Light";

   //setup the voice and voicePitch
   if (%voice $= "")
      %voice = "Bot1";
   %client.voice = %voice;
   %client.voiceTag = addTaggedString(%voice);
   
   if (%voicePitch $= "" || %voicePitch < 0.5 || %voicePitch > 2.0)
      %voicePitch = 1.0;
	%client.voicePitch = %voicePitch;

   %client.name = addTaggedString( "\cp\c9" @ %name @ "\co" );
	%client.nameBase = %name;

   echo(%client.name);
   echo("CADD: " @ %client @ " " @ %client.getAddress());
   $HostGamePlayerCount++;
   
   //set the initial team - Game.assignClientTeam() should be called later on...
   %client.team = %team;
   if ( %client.team & 1 )
      %client.skin = addTaggedString( "basebot" );
   else
      %client.skin = addTaggedString( "basebbot" );

	//setup the target for use with the sensor net, etc...
   %client.target = allocClientTarget(%client, %client.name, %client.skin, %client.voiceTag, '_ClientConnection', 0, 0, %client.voicePitch);
   
   //i need to send a "silent" version of this for single player but still use the callback  -jr`
   if($currentMissionType $= "SinglePlayer")
		messageAllExcept(%client, -1, 'MsgClientJoin', "", %name, %client, %client.target, true);
   else
	   messageAllExcept(%client, -1, 'MsgClientJoin', '\c1%1 joined the game.', %name, %client, %client.target, true);

	//assign the skill
	%client.setSkillLevel(%skill);
	
	//assign the affinity
   %client.offense = %offense;
    
   //clear any flags
   %client.stop(); // this will clear the players move state
   %client.clearStep();
   %client.lastDamageClient = -1;
   %client.lastDamageTurret = -1;
   %client.setEngageTarget(-1);
   %client.setTargetObject(-1);
   %client.objective = "";

	//clear the defaulttasks flag
	%client.defaultTasksAdded = false;

	//if the mission is already running, spawn the bot
   if ($missionRunning)
      %client.startMission();
}

// This routes through C++ code so profiler can register it.  Also, the console function
// ProfilePatch1() tracks time spent (at MS resolution), # calls, average time per call.
// See console variables $patch1Total (MS so far in routine), $patch1Avg (average MS
// per call), and $patch1Calls (# of calls).  
function patchForTimeTest(%client)
{
	if( isObject( Game ) )
      Game.AIChooseGameObjective(%client);
}

function AIReassessObjective(%client)
{
   ProfilePatch1(patchForTimeTest, %client);
   // Game.AIChooseGameObjective(%client);
   %client.objectiveThread = schedule(5000, %client, "AIReassessObjective", %client);
}

function onAIRespawn(%client)
{
   %markerObj = Game.pickPlayerSpawn(%client, true);
   Game.createPlayer(%client, %markerObj);	

	//make sure the player object is the AI's control object - even during the mission warmup time
	//the function AISystemEnabled(true/false) will control whether they actually move...
	%client.setControlObject(%client.player);
   
   if (%client.objective)
      error("ERROR!!! " @ %client @ " is still assigned to objective: " @ %client.objective);
      
   //clear the objective and choose a new one
	AIUnassignClient(%client);
   %client.stop();
   %client.clearStep();
   %client.lastDamageClient = -1;
   %client.lastDamageTurret = -1;
   %client.shouldEngage = -1;
   %client.setEngageTarget(-1);
   %client.setTargetObject(-1);
	%client.pilotVehicle = false;

	//set the spawn time
	%client.spawnTime = getSimTime();
	%client.respawnThread = "";

	//timeslice the objective reassessment for the bots
	if (!isEventPending(%client.objectiveThread))
	{
		%curTime = getSimTime();
		%remainder = %curTime % 5000;
		%schedTime = $AITimeSliceReassess - %remainder;
		if (%schedTime <= 0)
			%schedTime += 5000;
		%client.objectiveThread = schedule(%schedTime, %client, "AIReassessObjective", %client);

		//set the next time slice "slot"
		$AITimeSliceReassess += 300;
		if ($AITimeSliceReassess > 5000)
			$AITimeSliceReassess -= 5000;
	}

	//call the game specific spawn function
	Game.onAIRespawn(%client);
}

function AIClientIsAlive(%client, %duration)
{
   if(%client < 0 || %client.player <= 0)
      return false;
   if (isObject(%client.player))
	{
		%state = %client.player.getState();
		if (%state !$= "Dead" && %state !$= "" && (%duration $= "" || getSimTime() - %client.spawnTime >= %duration))
			return true;
		else
			return false;
	}
	else
		return false;
}

//------------------------------
function AIFindClosestEnemy(%srcClient, %radius, %losTimeout)
{
   //see if there's an enemy near our defense location...
	if (isObject(%srcClient.player))
		%srcLocation = %srcClient.player.getWorldBoxCenter();
	else
		%srcLocation = "0 0 0";
   return AIFindClosestEnemyToLoc(%srcClient, %srcLocation, %radius, %losTimeout, false, true);
}

function AIFindClosestEnemyToLoc(%srcClient, %srcLocation, %radius, %losTimeout, %ignoreLOS, %distFromClient)
{
	if (%ignoreLOS $= "")
		%ignoreLOS = false;
	if (%distFromClient $= "")
		%distFromClient = false;

   %count = ClientGroup.getCount();
   %closestClient = -1;
   %closestDistance = 32767;
   for(%i = 0; %i < %count; %i++)
   {
		%cl = ClientGroup.getObject(%i);

		//make sure we find someone who's alive
		if (AIClientIsAlive(%cl) && %cl.team != %srcClient.team)
		{
			%clIsCloaked = !isTargetVisible(%cl.target, %srcClient.getSensorGroup());

			//make sure the client can see the enemy
			%hasLOS = %srcClient.hasLOSToClient(%cl);
			%losTime = %srcClient.getClientLOSTime(%cl);
			if (%ignoreLOS || %hasLOS || (%losTime < %losTimeout && AIClientIsAlive(%cl, %losTime + 1000)))
			{
	         %testPos = %cl.player.getWorldBoxCenter();
				if (%distFromClient)
					%distance = %srcClient.getPathDistance(%testPos);
				else
		         %distance = AIGetPathDistance(%srcLocation, %testPos);
	         if (%distance > 0 && (%radius < 0 || %distance < %radius) && %distance < %closestDistance && (!%clIsCloaked || %distance < 8))
	         {
	            %closestClient = %cl;
	            %closestDistance = %distance;
	         }
			}
      }
   }
   
   return %closestClient SPC %closestDistance;
}

function AIFindClosestEnemyPilot(%client, %radius, %losTimeout)
{
	//loop through the vehicle set, looking for pilotted vehicles...
	%closestPilot = -1;
	%closestDist = %radius;
	%count = $AIVehicleSet.getCount();
	for (%i = 0; %i < %count; %i++)
	{
		//first, make sure the vehicle is mounted by pilotted
		%vehicle = $AIVehicleSet.getObject(%i);
      %pilot = %vehicle.getMountNodeObject(0);
      if (%pilot <= 0 || !AIClientIsAlive(%pilot.client))
			continue;

		//make sure the pilot is an enemy
		if (%pilot.client.team == %client.team)
			continue;

		//see if the pilot has been seen by the client
		%hasLOS = %client.hasLOSToClient(%pilot.client);
		%losTime = %client.getClientLOSTime(%pilot.client);
		if (%hasLOS || (%losTime < %losTimeout && AIClientIsAlive(%pilot.client, %losTime + 1000)))
		{
			//see if it's the closest
			%clientPos = %client.player.getWorldBoxCenter();
			%pilotPos = %pilot.getWorldBoxCenter();
			%dist = VectorDist(%clientPos, %pilotPos);
			if (%dist < %closestDist)
			{
				%closestPilot = %pilot.client;
				%closestDist = %dist;
			}
		}
	}

	return %closestPilot SPC %closestDist;
}

function AIFindAIClientInView(%srcClient, %team, %radius)
{
	//make sure the player is alive
	if (! AIClientIsAlive(%srcClient))
		return -1;

	//get various info about the player's eye
	%srcEyeTransform = %srcClient.player.getEyeTransform();
	%srcEyePoint = firstWord(%srcEyeTransform) @ " " @ getWord(%srcEyeTransform, 1) @ " " @ getWord(%srcEyeTransform, 2);
	%srcEyeVector = VectorNormalize(%srcClient.player.getEyeVector());

   //see if there's an enemy near our defense location...
   %count = ClientGroup.getCount();
   %viewedClient = -1;
   %clientDot = -1;
   for(%i = 0; %i < %count; %i++)
   {
		%cl = ClientGroup.getObject(%i);

		//make sure we find an AI who's alive and not the srcClient
		if (%cl != %srcClient && AIClientIsAlive(%cl) && %cl.isAIControlled() && (%team < 0 || %cl.team == %team))
		{
			//make sure the player is within range
		   %clPos = %cl.player.getWorldBoxCenter();
		   %distance = VectorDist(%clPos, %srcEyePoint);
			if (%radius <= 0 || %distance <= %radius)
			{
				//create the vector from the srcClient to the client
				%clVector = VectorNormalize(VectorSub(%clPos, %srcEyePoint));

				//see if the dot product is greater than our current, and greater than 0.6
				%dot = VectorDot(%clVector, %srcEyeVector);

				if (%dot > 0.6 && %dot > %clientDot)
				{
					%viewedClient = %cl;
					%clientDot = %dot;
				}
			}
		}
   }
   
   return %viewedClient;
}

//-----------------------------------------------------------------------------
//AI VEHICLE FUNCTIONS

function Armor::AIonMount(%this, %obj, %vehicle, %node)
{
	//set the client var...
	%client = %obj.client;
	%client.turretMounted = -1;

	//make sure the AI was *supposed* to mount the vehicle
	if (!%client.isMountingVehicle())
	{
		AIDisembarkVehicle(%client);
		return;
	}

	//get the vehicle's pilot
   %pilot = %vehicle.getMountNodeObject(0);

	//make sure the bot is in node 0 if'f the bot is piloting the vehicle
	if ((%node == 0 && !%client.pilotVehicle) || (%node > 0 && %client.pilotVehicle))
	{
		AIDisembarkVehicle(%client);
		return;
	}

	//make sure the bot didn't is on the same team as the pilot
	if (%pilot > 0 && isObject(%pilot) && %pilot.client.team != %client.team)
	{
		AIDisembarkVehicle(%client);
		return;
	}

	//if we're supposed to pilot the vehicle, set the control object
	if (%client.pilotVehicle)
		%client.setControlObject(%vehicle);

	//each vehicle may be built differently...
   if (%vehicle.getDataBlock().getName() $= "AssaultVehicle")
   {
      //node 1 is this vehicle's turret seat
      if (%node == 1)
      {
         %turret = %vehicle.getMountNodeObject(10);
         %skill = %client.getSkillLevel();
         %turret.setSkill(%skill);
			%client.turretMounted = %turret;
			%turret.setAutoFire(true);
      }
	}

   else if (%vehicle.getDataBlock().getName() $= "BomberFlyer")
   {
      //node 1 is this vehicle's turret seat
      if (%node == 1)
      {
         %turret = %vehicle.getMountNodeObject(10);
         %skill = %client.getSkillLevel();
         %turret.setSkill(%skill);
			%client.turretMounted = %turret;
			%client.setTurretMounted(%turret);
			%turret.setAutoFire(true);
      }
	}
}

function Armor::AIonUnMount(%this, %obj, %vehicle, %node)
{
	//get the client var
	%client = %obj.client;

	//reset the control object
	if (%client.pilotVehicle)
		%client.setControlObject(%client.player);
	%client.pilotVehicle = false;

	//if the client had mounted a turret, turn the turret back off
	if (%client.turretMounted > 0)
		%client.turretMounted.setAutoFire(false);
	%client.turretMounted = -1;
	%client.setTurretMounted(-1);

   // reset the turret skill level
   if(%vehicle.getDataBlock().getName() $= "AssaultVehicle")
		if (%node == 1)
	      %vehicle.getMountNodeObject(10).setSkill(1.0);
   
   if(%vehicle.getDataBlock().getName() $= "BomberFlyer")
      if(%node == 1)
         %vehicle.getMountNodeObject(10).setSkill(1.0);
}

function AIDisembarkVehicle(%client)
{
	if (%client.player.isMounted())
	{
		if (%client.pilotVehicle)
			%client.setControlObject(%client.player);
	   %client.pressJump();
	}
}

function AIProcessVehicle(%client)
{
	//see if we're mounted on a turret, and if that turret has a target
	if (%client.turretMounted > 0)
	{
		%turretDB = %client.turretMounted.getDataBlock();

		//see if we're in a bomber close to a bomb site...
		if (%turretDB.getName() $= "BomberTurret")
		{
			%clientPos = getWords(%client.player.position, 0, 1) @ " 0";
			%found = false;
			%count = $AIBombLocationSet.getCount();
			for (%i = 0; %i < %count; %i++)
			{
				%bombObj = $AIBombLocationSet.getObject(%i);
				%bombLocation = %bombObj.location;

				//make sure the objective was issued by someone in the vehicle
				if (%bombObj.issuedByClientId.vehicleMounted == %client.vehicleMounted)
				{
					//find out where the bomb is going to drop... first, how high up are we...
					%bombLocation2D = getWord(%bombLocation, 0) SPC getWord(%bombLocation, 1) SPC "0";
					%height = getWord(%client.vehicleMounted.position, 2) - getWord(%bombLocation, 2);

					//find out how long it'll take the bomb to fall that far...
					//assume no initial velocity in the Z axis...
					%timeToFall = mSqrt((2.0 * %height) / 9.81);

					//how fast is the vehicle moving in the XY plane...
					%myLocation = %client.vehicleMounted.position;
					%myLocation2D = getWord(%myLocation, 0) SPC getWord(%myLocation, 1) SPC "0";
					%vel = %client.vehicleMounted.getVelocity();
					%vel2D = getWord(%vel, 0) SPC getWord(%vel, 1) SPC "0";

					%bombImpact2D = VectorAdd(%myLocation2D, VectorScale(%vel2D, %timeToFall));

					//see if the bomb inpact position is within 20m of the desired bomb site...
					%distToBombsite2D = VectorDist(%bombImpact2D, %bombLocation2D);
					if (%height > 20 && %distToBombsite2D < 25)
					{
						%found = true;
						break;
					}
				}
			}

			//see if we found a bomb site
			if (%found)
			{
				%client.turretMounted.selectedWeapon = 2;
				%turretDB.onTrigger(%client.turretMounted, 0, true);
				return;
			}
		}

		//we're not bombing, make sure we have the regular weapon selected
		%client.turretMounted.selectedWeapon = 1;
		if (isObject(%client.turretMounted.getTargetObject()))
			%turretDB.onTrigger(%client.turretMounted, 0, true);
		else
			%turretDB.onTrigger(%client.turretMounted, 0, false);
	}
}

function AIPilotVehicle(%client)
{
	//this is not very well supported, but someone will find a use for this function...
}