//+++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++ AIO Missile Object +++
// - Lagg... 4-12-2003

function AIOMissileObject::weight(%this, %client, %level, %minWeight, %inventoryStr)
{
   // if were playing CnH, check who owns this
   if (!isObject(%this.targetObjectId) || %this.targetObjectId.isHidden() || %this.targetObjectId.team == %client.team)
      return 0;

   //don't attack team 0 stuffs
   if (%this.targetObjectId.team <= 0)
      return 0;      
   
   //make sure the player is still alive!!!!!
   if (! AIClientIsAlive(%client))
      return 0;

   //lets check the range on this one
   if (vectorDist(%client.Player.getWorldBoxCenter(), %this.getWorldBoxCenter()) < 50)
      return 0;
    
   //no need to attack if the object is already destroyed
   if (!isObject(%this.targetObjectId) || %this.targetObjectId.getDamageState() $= "Destroyed")
      return 0;
   else
   {
      //if this bot is linked to a human who has issued this command, up the weight
      if (%this.issuedByClientId == %client.controlByHuman)
      {
         //make sure we have the potential to reach the minWeight
         if (!AIODefault::QuickWeight(%this, %client, %level, %minWeight))
         {
            if ($AIWeightHumanIssuedCommand < %minWeight)
               return 0;
            else
               %weight = $AIWeightHumanIssuedCommand;
         }
         else
         {
            // calculate the default...
            %weight = AIODefault::weight(%this, %client, %level, %inventoryStr);
            if (%weight < $AIWeightHumanIssuedCommand)
               %weight = $AIWeightHumanIssuedCommand;
         }
      }
      else
      {
         //make sure we have the potential to reach the minWeight
         if (!AIODefault::QuickWeight(%this, %client, %level, %minWeight))
            return 0;

         // calculate the default...
         %weight = AIODefault::weight(%this, %client, %level, %inventoryStr);
      }
      return %weight;
   }
}

function AIOMissileObject::assignClient(%this, %client)
{
   %client.objectiveTask = %client.addTask(AIMissileObject);
   %client.objectiveTask.initFromObjective(%this, %client);
}

function AIOMissileObject::unassignClient(%this, %client)
{
   %client.removeTask(%client.objectiveTask);
   %client.objectiveTask = "";
}

//----------------------------------------------------------------------------------------------- AI Missile Object ---
// - Lagg... 4-12-2003

function AIMissileObject::initFromObjective(%task, %objective, %client)
{
   %task.baseWeight = %client.objectiveWeight;
   %task.targetObject = %objective.targetObjectId;
   %task.location = %objective.location;
   %task.equipment = %objective.equipment;
   %task.buyEquipmentSet = %objective.buyEquipmentSet;
   %task.desiredEquipment = %objective.desiredEquipment;
   %task.issuedByClient = %objective.issuedByClientId;

   //initialize other task vars
   %task.sendMsg = true;
   %task.sendMsgTime = 0;
   %task.useTeleport = false;
}

function AIMissileObject::assume(%task, %client)
{
   %task.setWeightFreq(15);
   %task.setMonitorFreq(5);
   %task.needToRangeTime = 0;
   %client.needEquipment = AINeedEquipment(%task.equipment, %client);

   //even if we don't *need* equipemnt, see if we should buy some... 
   if (! %client.needEquipment && %task.buyEquipmentSet !$= "")
   {
      //see if we could benefit from inventory
      %needArmor = AIMustUseRegularInvStation(%task.desiredEquipment, %client);
      %result = AIFindClosestInventory(%client, %needArmor);
      %closestInv = getWord(%result, 0);
      %closestDist = getWord(%result, 1);
      if (AINeedEquipment(%task.desiredEquipment, %client) && %closestInv > 0)
      {
         //find where we are
         %clientPos = %client.player.getWorldBoxCenter();
         %objPos = %task.targetObject.getWorldBoxCenter();
         %distToObject = %client.getPathDistance(%objPos);
         if (%distToObject < 0 || %closestDist < 100)//%distToObject)-modified - Lagg...
            %client.needEquipment = true;
      }
   }

   //mark the current time for the buy inventory state machine
   %task.buyInvTime = getSimTime();

   //--------------------------------------------------- assume telporter - start -
   //if the MPB Teleporter is online - Lagg... 9-30-2003
   // ZOD: Less code this way...
   if(MPBTeleporterCheck(%client, %task))
      %task.useTeleport = true;
   else
      %task.useTeleport = false;
   //--------------------------------------------------- assume telporter - end -
}

function AIMissileObject::retire(%task, %client)
{
   %client.setTargetObject(-1);
}

function AIMissileObject::weight(%task, %client)
{
   if (VectorDist(%task.location, %client.Player.getWorldBoxCenter) < 41)
   {
      //echo(" Too Close to missile object set baseweight (0)");
      %task.baseWeight = 0;
   }
   else if (%task == %client.objectiveTask)
      %task.baseWeight = %client.objectiveWeight;

   //let the monitor decide when to stop attacking
   %task.setWeight(%task.baseWeight);
}

function AIMissileObject::monitor(%task, %client)
{
   //first, buy the equipment
   if (%client.needEquipment)
   {
      %task.setMonitorFreq(5);
      if (%task.equipment !$= "")
         %equipmentList = %task.equipment;
      else
         %equipmentList = %task.desiredEquipment;

      %result = AIBuyInventory(%client, %equipmentList, %task.buyEquipmentSet, %task.buyInvTime);
      if (%result $= "InProgress")
      {
         //force a nervous reaction every 15 sec - Lagg...
         if (getSimTime() - %task.buyInvTime > 15000)
         {
            %client.setDangerLocation(%client.player.getWorldBoxCenter(), 15);
            %task.buyInvTime = getSimTime();
         }
         return;
      }
      else if (%result $= "Finished")
      {
         %task.setMonitorFreq(15);
         %client.needEquipment = false;
      }
      else if (%result $= "Failed")
      {
         //if this task is the objective task, choose a new objective
         if (%task == %client.objectiveTask)
         {
            AIUnassignClient(%client);
            Game.AIChooseGameObjective(%client);
         }
         return;
      }
   }
   //if we made it past the inventory buying, reset the inv time
   %task.buyInvTime = getSimTime();
   
   //chat
   if (%task.sendMsg)
   {
      if (%task.sendMsgTime == 0)
         %task.sendMsgTime = getSimTime();
      else if (getSimTime() - %task.sendMsgTime > 7000)
      {
         %task.sendMsg = false;
         if (%client.isAIControlled())
         {
            if (%task.chat !$= "")
            {
               %chatMsg = getWord(%task.chat, 0);
               %chatTemplate = getWord(%task.chat, 1);
               if (%chatTemplate !$= "")
                  AIMessageThreadTemplate(%chatTemplate, %chatMsg, %client, -1);
               else
                  AIMessageThread(%task.chat, %client, -1);
            }
            else if (%task.targetObject > 0)
            {
               %type = %task.targetObject.getDataBlock().getName();
               if (%type $= "GeneratorLarge")
                  AIMessageThreadTemplate("AttackBase", "ChatSelfAttackGenerator", %client, -1);
               else if (%type $= "SensorLargePulse")
                  AIMessageThreadTemplate("AttackBase", "ChatSelfAttackSensors", %client, -1);
               else if (%type $= "SensorMediumPulse")
                  AIMessageThreadTemplate("AttackBase", "ChatSelfAttackSensors", %client, -1);
               else if (%type $= "TurretBaseLarge")
                  AIMessageThreadTemplate("AttackBase", "ChatSelfAttackTurrets", %client, -1);
               else if (%type $= "StationVehicle")
                  AIMessageThreadTemplate("AttackBase", "ChatSelfAttackVehicle", %client, -1);
            }
         }
      }
   }

   //--------------------------------------------------- monitor telporter - start -
   //are we using teleporter
   if (%task.useTeleport)
   {
      %result = AIFindDeployedMPB(%client);//new function in aiVehicle.cs
      %closestMPB = getWord(%result, 0);
      %closestMPBDist = getWord(%result, 1);
      %result = SweepForTeleporters(%client);//new function in aiVehicle.cs
      %closestTel = getWord(%result, 0);
      %closestTelDist = getWord(%result, 1);
      if (%closestMPB > 0 && %closestTel > 0)
      {
         //we are done teleporting
         if (%closestMPBDist < %closestTelDist)
         {
            //reset the clients inventory status
            if (%client.needEquipment)
            {
               %result = AIFindClosestInventory(%client, 0);
	       %closestInv = getWord(%result, 0);
               %client.invToUse = %closestInv;
            }
            %task.useTeleport = false;
            return;
         }

         if (%closestTelDist < 2)
            %client.pressJump();
         else
         {
            %client.stepMove(%closestTel.getWorldBoxCenter(), 0.25);
            return;
         }
      }
      else
         %task.useTeleport = false;
   }
   //--------------------------------------------------- monitor telporter - end -

   //set the target object
   if (isObject(%task.targetObject) && %task.targetObject.getDamageState() !$= "Destroyed")
   {
      //make sure we still have equipment
		%client.needEquipment = AINeedEquipment(%task.equipment, %client);
      if (%client.needEquipment)
      {
         //if this task is the objective task, choose a new objective
         if (%task == %client.objectiveTask)
         {
            AIUnassignClient(%client);
            Game.AIChooseGameObjective(%client);
            return;
         }
      }

      %clientPos = %client.player.getWorldBoxCenter();
      %targetPos = %task.targetObject.getWorldBoxCenter();
      %distance = %client.getPathDistance(%targetPos);
      if (%distance < 0)
         %distance = 32767;

      //next move to within 300 
      if (%distance > 300)
      {
         %client.setTargetObject(-1);
         %client.stepMove(%task.targetObject.getWorldBoxCenter(), 15);
      }
      else
      {
         //move to LOS location to objective marker(not to target)
         //(that makes the LOS location adjustable!)
         %firePos = %client.getLOSLocation(%task.location, 50, 290);
         %client.stepMove(%firePos);
         //check for LOS
         %missileLOS = "false";
         %mask = $TypeMasks::TerrainObjectType | $TypeMasks::InteriorObjectType | $TypeMasks::TSStaticShapeObjectType | $TypeMasks::ForceFieldObjectType;
         %missileLOS = !containerRayCast(%client.player.getWorldBoxCenter(), %task.location, %mask, 0);
         %inRange = %client.getPathDistance(%task.location);

         //modified here in case bot gets stuck trying to get LOS to target - Lagg... - 4-21-2003
         %currentTime = getSimTime();
         if (%currentTime > %task.needToRangeTime)
         {
            //force a rangeObject every 20 seconds...
            %task.needToRangeTime = %currentTime + 20000;
            %client.setDangerLocation(%firePos, 30);
            return;
         }
      
         if ((%inRange > 49) && (%inRange < 291) && %missileLOS)
         {
            %client.setTargetObject(%task.targetObject, 300, "Missile");
            //dissolve the human control link
            if (%task == %client.objectiveTask)
            {
               aiReleaseHumanControl(%client.controlByHuman, %client);
               %client.stop();
            }
            return;
         }
         else if ((%inRange > 49) && (%inRange < 291) && !%missileLOS && (%client.getPathDistance(%client.player.getWorldBoxCenter(), %firePos) < 10))
         {     
            //if this task is the objective task, choose a new objective
            if (%task == %client.objectiveTask)
            {
               %task.baseWeight = 0;
               %task.setWeight(%task.baseWeight);
               return;
            }
         }
         else if (%client.getStepStatus() !$= "Finished")
         {
            %client.stepMove(%firePos);
            return;
         }
      }     
   }
   else
   {     
      //if this task is the objective task, choose a new objective
      if (%task == %client.objectiveTask)
      {
         %client.setTargetObject(-1);
         %client.stop();
         AIUnassignClient(%client);
         Game.AIChooseGameObjective(%client);
      }
   }
}

//+++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++ AIO Defense Patrol +++
//this is a new objective in beta. bot will walk from location to location doing the default defense stuff.
//*** note to lagg redo this for more than 1 path like you did for vehicle objectives ***

//Requires a simgroup titled T<%team#>PatrolPath<#> (example: T1PatrolPath1)  including 'markers' to set as locations to defend.

function AIODefensePatrol::weight(%this, %client, %level, %minWeight, %inventoryStr)
{
   // if were playing CnH, check who owns this
   if (%this.targetObjectId > 0)
   {
   	if (!isObject(%this.targetObjectId) || %this.targetObjectId.isHidden() || %this.targetObjectId.team != %client.team)
	      return 0;
   }
   
   //make sure the player is still alive!!!!!
   if (! AIClientIsAlive(%client))
      return 0;

   //do a quick check to disqualify this objective if it can't meet the minimum weight
   if (!AIODefault::QuickWeight(%this, %client, %level, %minWeight))
   {
      if (%this.targetObjectId > 0 && %this.issuedByClientId == %client.controlByHuman)
      {
         if ($AIWeightHumanIssuedCommand < %minWeight)
            return 0;
      }
      else
         return 0;
   }
   %weight = AIODefault::weight(%this, %client, %level, %inventoryStr);

   //if the object has been destroyed, reduce the weight
   if (%this.targetObjectId > 0)
   {
      //see if we were forced on the objective
      if (%this.issuedByClientId == %client.controlByHuman && %weight < $AIWeightHumanIssuedCommand)
         %weight = $AIWeightHumanIssuedCommand;

      //else see if the object has been destroyed - slight modification here - Lagg... 11-7-2003
	//else if (!isObject(%this.targetObjectId) || %this.targetObjectId.getDamageState() $= "Destroyed")
      else if (!isObject(%this.targetObjectId) || %this.targetObjectId.isDisabled())
         %weight -= 320;
   }
   return %weight;
}

function AIODefensePatrol::assignClient(%this, %client)
{
   %client.objectiveTask = %client.addTask(AIDefensePatrol);
   %client.objectiveTask.initFromObjective(%this, %client);
}

function AIODefensePatrol::unassignClient(%this, %client)
{
   %client.removeTask(%client.objectiveTask);
   %client.objectiveTask = "";
}

//----------------------------------------------------------------------------------------------- AI Defense Patrol ---

function AIDefensePatrol::initFromObjective(%task, %objective, %client)
{
   //initialize the task vars from the objective
   %task.baseWeight = %client.objectiveWeight;
   %task.targetObject = %objective.targetObjectId;
   if (%objective.Location !$= "")
      %task.location = %objective.location;
   else
      %task.location = %objective.targetObjectId.getWorldBoxCenter();

   %task.equipment = %objective.equipment;
   %task.desiredEquipment = %objective.desiredEquipment;
   %task.buyEquipmentSet = %objective.buyEquipmentSet;

   if (%task.buyEquipmentSet $= "randomSet")
   {
      //pick a random equipment set...
	%randNum = getRandom();
	if (%randNum < 0.2)
      {
         %task.desiredEquipment = "Plasma PlasmaAmmo";
         %task.buyEquipmentSet = "HeavyEnergySet";
      }
	else if (%randNum < 0.4)
      {
         %task.desiredEquipment = "Plasma PlasmaAmmo";
         %task.buyEquipmentSet = "MediumEnergySet";
      } 
	else if (%randNum < 0.6)
      {
         %task.desiredEquipment = "Plasma PlasmaAmmo";
         %task.buyEquipmentSet = "LightCloakSet";
      }
      else if (%randNum < 0.8)
      {
         %task.desiredEquipment = "Plasma PlasmaAmmo";
         %task.buyEquipmentSet = "HeavyShieldSet";
      }
      else
      {
         %task.desiredEquipment = "Plasma PlasmaAmmo";
         %task.buyEquipmentSet = "HeavyRepairSet";
      }
   }
   %task.issuedByClient = %objective.issuedByClientId;
   %task.chat = %objective.chat;

   //initialize other task vars
   %task.sendMsg = true;
   %task.sendMsgTime = 0;
   %task.engageTarget = -1;
   %task.timeCheck = true;
}

function AIDefensePatrol::assume(%task, %client)
{
   %task.setWeightFreq(15);
   %task.setMonitorFreq(15);
   %client.inPerimeter = false;
   %client.needEquipment = AINeedEquipment(%task.desiredEquipment, %client);

   //even if we don't *need* equipemnt, see if we should buy some... 
   if (! %client.needEquipment && %task.buyEquipmentSet !$= "")
   {
      //see if we could benefit from inventory
      %needArmor = AIMustUseRegularInvStation(%task.desiredEquipment, %client);
      %result = AIFindClosestInventory(%client, %needArmor);
      %closestInv = getWord(%result, 0);
      %closestDist = getWord(%result, 1);
      if (AINeedEquipment(%task.desiredEquipment, %client) && %closestInv > 0)
      {
         %result = AIFindClosestEnemy(%client, 200, $AIClientLOSTimeout);
	 %closestEnemy = getWord(%result, 0);
	 %closestEnemydist = getWord(%result, 1);

	 if (%closestEnemy <= 0 || (%closestEnemyDist > %closestDist * 1.5))
            %client.needEquipment = true;
      }
   }

   //mark the current time for the buy inventory state machine
   %task.buyInvTime = getSimTime();

   //set a flag to determine if the objective should be re-aquired when the object is destroyed
   %task.reassignOnDestroyed = false;

   //--------------------------------------------------- assume telporter - start -
   //if the MPB Teleporter is online - Lagg... 9-30-2003
   // ZOD: Less code this way...
   if(MPBTeleporterCheck(%client, %task))
      %task.useTeleport = true;
   else
      %task.useTeleport = false;
   //--------------------------------------------------- assume telporter - end -

   //error("AIDefensePatrol::assume - client = " @ getTaggedString(%client.name));
}

function AIDefensePatrol::retire(%task, %client)
{
   %task.engageVehicle = -1;
   %client.setTargetObject(-1);
}

function AIDefensePatrol::weight(%task, %client)
{
   //update the task weight
   if (%task == %client.objectiveTask)
      %task.baseWeight = %client.objectiveWeight;//this will reaccess on destroyed if targetobjectid > 0

   %player = %client.player;
   if (!isObject(%player))
      return;

   %hasMissile = (%player.getInventory("MissileLauncher") > 0) && (%player.getInventory("MissileLauncherAmmo") > 0);

   //if we're defending with a missile launcher, our first priority is to take out vehicles...
   //see if we're already attacking a vehicle...
   if (%task.engageVehicle > 0 && isObject(%task.engageVehicle) && %hasMissile)
   {
      //set the weight
      %task.setWeight(%task.baseWeight);
		return;
   }

   //search for a new vehicle to attack
   %task.engageVehicle = -1;
   %losTimeout = $AIClientMinLOSTime + ($AIClientLOSTimeout * %client.getSkillLevel());
   %result = AIFindClosestEnemyPilot(%client, 300, %losTimeout);
   %pilot = getWord(%result, 0);
   %pilotDist = getWord(%result, 1);

   //if we've got missiles, and a vehicle to attack...
   if (%hasMissile && AIClientIsAlive(%pilot))
   {
      %task.engageVehicle = %pilot.vehicleMounted;
      %client.needEquipment = false;
   }

   //otherwise look for a regular enemy to fight...
   else
   {
      %result = AIFindClosestEnemyToLoc(%client, %task.location, 100, %losTimeout);
      %closestEnemy = getWord(%result, 0);
      %closestdist = getWord(%result, 1);
	   
      //see if we found someone
      if (%closestEnemy > 0)
         %task.engageTarget = %closestEnemy;
      else
      {
         %task.engageTarget = -1;

	 //see if someone is near me...
	 %result = AIFindClosestEnemy(%client, 100, %losTimeout);
		   %closestEnemy = getWord(%result, 0);
		   %closestdist = getWord(%result, 1);
			if (%closestEnemy <= 0 || %closestDist > 70)
				%client.setEngageTarget(-1);
      }
   }

   //set the weight
   %task.setWeight(%task.baseWeight);
}

function AIDefensePatrol::monitor(%task, %client)
{
   //first, buy the equipment
   if (%client.needEquipment)
   {
      %task.setMonitorFreq(5);
      if (%task.equipment !$= "")
         %equipmentList = %task.equipment;
      else
         %equipmentList = %task.desiredEquipment;

      %result = AIBuyInventory(%client, %equipmentList, %task.buyEquipmentSet, %task.buyInvTime);
      if (%result $= "InProgress")
      {
         //force a nervous reaction every 15 sec - Lagg...
         if (getSimTime() - %task.buyInvTime > 15000)
         {
            %client.setDangerLocation(%client.player.getWorldBoxCenter(), 20);
            %task.buyInvTime = getSimTime();
            %client.buyInvTime = %task.buyInvTime;
         }
         return;
      }
      else if (%result $= "Finished")
      {
         %task.setMonitorFreq(15);
	 %client.needEquipment = false;
      }
      else if (%result $= "Failed")
      {
         //if this task is the objective task, choose a new objective
	 if (%task == %client.objectiveTask)
	 {
	    AIUnassignClient(%client);
	    Game.AIChooseGameObjective(%client);
	 }
	 return;
      }
   }
   //if we made it past the inventory buying, reset the inv time
   %task.buyInvTime = getSimTime();

   //chat
   if (%task.sendMsg)
   {
      if (%task.sendMsgTime == 0)
         %task.sendMsgTime = getSimTime();
      else if (getSimTime() - %task.sendMsgTime > 7000)
      {
         %task.sendMsg = false;
         if (%client.isAIControlled())
	 {
	    if (%task.chat !$= "")
	    {
	       %chatMsg = getWord(%task.chat, 0);
	       %chatTemplate = getWord(%task.chat, 1);
	       if (%chatTemplate !$= "")
                  AIMessageThreadTemplate(%chatTemplate, %chatMsg, %client, -1);
	       else
		  AIMessageThread(%task.chat, %client, -1);
	    }
	    else if (%task.targetObject > 0)
	    {
	       %type = %task.targetObject.getDataBlock().getName();
	       if (%type $= "Flag")
	          AIMessageThreadTemplate("DefendBase", "ChatSelfDefendFlag", %client, -1);
	       else if (%type $= "GeneratorLarge")
		  AIMessageThreadTemplate("DefendBase", "ChatSelfDefendBase", %client, -1);
	       else if (%type $= "StationVehicle")
		  AIMessageThreadTemplate("DefendBase", "ChatSelfDefendVehicle", %client, -1);
	       else if (%type $= "SensorLargePulse")
		  AIMessageThreadTemplate("DefendBase", "ChatSelfDefendSensors", %client, -1);
	       else if (%type $= "SensorMediumPulse")
		  AIMessageThreadTemplate("DefendBase", "ChatSelfDefendSensors", %client, -1);
	       else if (%type $= "TurretBaseLarge")
		  AIMessageThreadTemplate("DefendBase", "ChatSelfDefendTurrets", %client, -1);
	    }
         }
      }
   }

   //--------------------------------------------------- monitor telporter - start -
   //are we using teleporter
   if (%task.useTeleport)
   {
      %result = AIFindDeployedMPB(%client);//new function in aiVehicle.cs
      %closestMPB = getWord(%result, 0);
      %closestMPBDist = getWord(%result, 1);
      %result = SweepForTeleporters(%client);//new function in aiVehicle.cs
      %closestTel = getWord(%result, 0);
      %closestTelDist = getWord(%result, 1);
      if (%closestMPB > 0 && %closestTel > 0)
      {
         //we are done teleporting
         if (%closestMPBDist < %closestTelDist)
         {
            //reset the clients inventory status
            if (%client.needEquipment)
            {
               %result = AIFindClosestInventory(%client, 0);
	           %closestInv = getWord(%result, 0);
               %client.invToUse = %closestInv;
            }
            %task.useTeleport = false;
            return;
         }

         if (%closestTelDist < 2)
            %client.pressJump();
         else
         {
            %client.stepMove(%closestTel.getWorldBoxCenter(), 0.25);
            return;
         }
      }
      else
         %task.useTeleport = false;
   }
   //--------------------------------------------------- monitor telporter - end -       

   //if the defend location task has an object, set the "reset" flag
   if (%task == %client.objectiveTask && isObject(%task.targetObject))
   {
      //if (%task.targetObject.getDamageState() !$= "Destroyed")
      if (%task.targetObject.isDisabled())
         %task.reassignOnDestroyed = true;
      else
      {
         if (%task.reassignOnDestroyed)
         {
            AIUnassignClient(%client);
	    Game.AIChooseGameObjective(%client);
	    return;
         }
      }
   }

   //first, check for a vehicle to engage
   if (%task.engageVehicle > 0 && isObject(%task.engageVehicle))
   {
      %client.stop();
      %client.clearStep();
      %client.setEngageTarget(-1);
      %client.setTargetObject(%task.engageVehicle, 300, "Missile");
   }
   else
   {
      //clear the target vehicle...
      %client.setTargetObject(-1);

      //see if we're engaging a player
      if (%client.getEngageTarget() > 0)
      {
         //too far, or killed the enemy - return home
	 if (%client.getStepStatus() !$= "InProgress" || %distance > 100)
	 {
	    %client.setEngageTarget(-1);
	    %client.stepMove(%task.location, 4.0);
	 } 
      }
	   
      //else see if we have a target to begin attacking
      else if (%task.engageTarget > 0)
         %client.stepEngage(%task.engageTarget);
	      
      //else move to a random location around where we are defending
      else
      {
         %dist = VectorDist(%client.player.getWorldBoxCenter(), %task.location);
	 if (%dist < 6)
	 {
            //random time update task location - Lagg...
            if (%task.timeCheck)
            {
               %task.watTime = getSimTime();
               %task.ranTime = getRandom(0, 20) * 1000;//random time to stepidle at defense points
               %task.timeCheck = false;
            }
            if (getSimTime() > (%task.watTime + %task.ranTime))
            {
               if (Game.class !$= "SiegeGame")
                  %patrolSpots = nameToId("T" @ %client.team @ "PatrolPath1");
               else
                  %patrolSpots = nameToId("T2PatrolPath1");
               %count = %patrolSpots.getCount();
               %ranSpot = mFloor(getRandom(0, %count - 1));
               %task.location = %patrolSpots.getObject(%ranSpot).position;
               %task.timeCheck = true;
            }
            //dissolve the human control link and re-evaluate the weight
	    if (%task == %client.objectiveTask)
	    {
	       if (aiHumanHasControl(%task.issuedByClient, %client))
	       {
	          aiReleaseHumanControl(%client.controlByHuman, %client);

		  //should re-evaluate the current objective weight
		  %inventoryStr = AIFindClosestInventories(%client);
		  %client.objectiveWeight = %client.objective.weight(%client, %client.objectiveLevel, 0, %inventoryStr);
               }
            }
	    %client.stepIdle(%task.location);
	 }
	 else
            %client.stepMove(%task.location, 4.0, $AIModeWalk);
      }
   }

   //see if we're supposed to be engaging anyone...
   if (!AIClientIsAlive(%client.getEngageTarget()) && AIClientIsAlive(%client.shouldEngage))
      %client.setEngageTarget(%client.shouldEngage);
}

//+++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++ AIO Deploy Vehicle +++
//This objective buys a MPB and deploys it at a selected desired location, follows a path of markers
//set in a simgroup named "T2MPBPath1" for team 2 or "T1MPBPath1" for team 1, also can have 2 paths
//choosen at random by just making another simgroup called "T2MPBPath2" or "T1MPBPath2" for each team - Lagg... 10-4-2003 

function AIODeployVehicle::weight(%this, %client, %level, %minWeight, %inventoryStr)
{ 
   //make sure the player is still alive!!!!!
   if (! AIClientIsAlive(%client))
      return 0;

   //do a quick check to disqualify this objective if it can't meet the minimum weight
   if (!AIODefault::QuickWeight(%this, %client, %level, %minWeight))
   {
      if (%this.targetObjectId > 0 && %this.issuedByClientId == %client.controlByHuman)
      {
         if ($AIWeightHumanIssuedCommand < %minWeight)
	    return 0;
      }
      else
         return 0;
   }

   //check for Vehicle station near buy of forget it - Lagg...
   %clVs = AIFindClosestVStation(%client);
   if (%clVs > 0)
   {
      %closestVs = getWord(%clVs, 0);
      %closestVsDist = getWord(%clVs, 1);
      if (%closestVsDist > 250)
         return 0;
   }
   else
      return 0;

   //check how many vehicles of this type are in the field
   %blockName = "MobileBaseVehicle";
   if (!vehicleCheck(%blockName, %client.team))
      return 0;

   %weight = AIODefault::weight(%this, %client, %level, %inventoryStr);

   return %weight;
}

function AIODeployVehicle::assignClient(%this, %client)
{
   %client.objectiveTask = %client.addTask(AIDeployVehicle);
   %client.objectiveTask.initFromObjective(%this, %client);
}

function AIODeployVehicle::unassignClient(%this, %client)
{ 
   if(%client.pilotVehicle)
   {
      AIDisembarkVehicle(%client);
   }  
   %client.removeTask(%client.objectiveTask);
   %client.objectiveTask = "";
}

//----------------------------------------------------------------------------------------------- AI Deploy Vehicle ---

function AIDeployVehicle::initFromObjective(%task, %objective, %client)
{
   //initialize the task vars from the objective
   %task.baseWeight = %client.objectiveWeight;
   %task.targetObject = %objective.targetObjectId;
   if (%objective.Location !$= "")
      %task.location = %objective.location;
   else
      %task.location = %objective.targetObjectId.getWorldBoxCenter();

   %task.equipment = %objective.equipment;
   %task.buyEquipmentSet = %objective.buyEquipmentSet;
   %task.desiredEquipment = %objective.desiredEquipment;
   %task.issuedByClient = %objective.issuedByClientId;
   %task.chat = %objective.chat;

   //initialize other task vars
   %task.sendMsg = true;
   %task.sendMsgTime = 0;
   %task.path = "";
   %task.offense = %objective.offense;//if task is offensive create def the MPB objective - some day - Lagg... *
   %task.unassignTime = 0;
}

function AIDeployVehicle::assume(%task, %client)
{
   %task.setWeightFreq(30);
   %task.setMonitorFreq(50);
   
   %client.needEquipment = AINeedEquipment(%task.equipment, %client);

   //even if we don't *need* equipemnt, see if we should buy some... 
   if (! %client.needEquipment && %task.buyEquipmentSet !$= "")
   {
      //see if we could benefit from inventory
      %needArmor = AIMustUseRegularInvStation(%task.desiredEquipment, %client);
      %result = AIFindClosestInventory(%client, %needArmor);
      %closestInv = getWord(%result, 0);
      %closestDist = getWord(%result, 1);
      if (AINeedEquipment(%task.desiredEquipment, %client) && %closestInv > 0)
      {
         %result = AIFindClosestEnemy(%client, 100, $AIClientLOSTimeout);
	   %closestEnemy = getWord(%result, 0);
	   %closestEnemydist = getWord(%result, 1);

	   if (%closestEnemy <= 0 || (%closestEnemyDist > %closestDist * 1.5))
	    %client.needEquipment = true;
      }
   }

   //mark the current time for the buy inventory state machine
   %task.buyInvTime = getSimTime();

   //reset the vehicle station wait time
   %client.vsWaitTime = "";

   //set the destination paths for each team and game type

   %team = %client.team;
   %random = mFloor(getRandom(1, 2));
   if (Game.class $= "SiegeGame")
   {
      if (%team == Game.offenseTeam)
      {         
         if (%random == 1)
            %task.group = nameToId(T1MPBPath1);
         else if (isObject(nameToId(T1MPBPath2)))
            %task.group = nameToId(T1MPBPath2);
         else
            %task.group = nameToId(T1MPBPath1);
      }      
      else
      {
         if (%random == 1)
            %task.group = nameToId(T2MPBPath1);
         else if (isObject(nameToId(T2MPBPath2)))
            %task.group = nameToId(T2MPBPath2);
         else
            %task.group = nameToId(T2MPBPath1);
      }
   }
   else
   {
      if (%team == 1)
      {         
         if (%random == 1)
            %task.group = nameToId(T1MPBPath1);
         else if (isObject(nameToId(T1MPBPath2)))
            %task.group = nameToId(T1MPBPath2);
         else
            %task.group = nameToId(T1MPBPath1);
      }      
      else
      {
         if (%random == 1)
            %task.group = nameToId(T2MPBPath1);
         else if (isObject(nameToId(T2MPBPath2)))
            %task.group = nameToId(T2MPBPath2);
         else
            %task.group = nameToId(T2MPBPath1);
      }      
   }

   %task.locationIndex = -1;
   %client.needVehicle = true;
}

function AIDeployVehicle::retire(%task, %client)
{
   if (aiClientIsAlive(%client))
   {
      %client.clearStep();
      if(%client.player.isMounted())
      {
         AIDisembarkVehicle(%client);
      }
   }
}

function AIDeployVehicle::weight(%task, %client)
{
   //let the monitor decide when to quit :)
   %task.setWeight(%task.baseWeight);
}

function AIDeployVehicle::monitor(%task, %client)
{   
   //first, buy equipment
   if (%client.needEquipment)
   {
      %task.setMonitorFreq(5);
      if (%task.equipment !$= "")
         %equipmentList = %task.equipment;
      else
         %equipmentList = %task.desiredEquipment;
      %result = AIBuyInventory(%client, %equipmentList, %task.buyEquipmentSet, %task.buyInvTime);
      if (%result $= "InProgress")
      {
         //force a nervous reaction every 30 sec - Lagg...
         if (getSimTime() - %task.buyInvTime > 30000)
         {
            %client.setDangerLocation(%client.player.getWorldBoxCenter(), 15);
            %task.buyInvTime = getSimTime();
         }
         return;
      }
      else if (%result $= "Finished")
      {
         %task.setMonitorFreq(30);
	 %client.needEquipment = false;
      }
      else if (%result $= "Failed")
      {
         //if this task is the objective task, choose a new objective
	 if (%task == %client.objectiveTask)
	 {
	    AIUnassignClient(%client);
	    Game.AIChooseGameObjective(%client);
	 }
	 return;
      }
   }
   //if we made it past the inventory buying, reset the inv time
   %task.buyInvTime = getSimTime();

   //chat
   if (%task.sendMsg)
   {
      if (%task.sendMsgTime == 0)
         %task.sendMsgTime = getSimTime();
      else if (getSimTime() - %task.sendMsgTime > 7000)
      {
         %task.sendMsg = false;
         if (%client.isAIControlled())
	   {
	      if (%task.chat !$= "")
	      {
	         %chatMsg = getWord(%task.chat, 0);
	         %chatTemplate = getWord(%task.chat, 1);
	         if (%chatTemplate !$= "")
		      AIMessageThreadTemplate(%chatTemplate, %chatMsg, %client, -1);
	         else
		      AIMessageThread(%task.chat, %client, -1);
	      }
         }
      }
   }

   if (%client.needVehicle)
   {
      %clVs = AIFindClosestVStation(%client);
      if (%clVs > 0)
      {
         %closestVs = getWord(%clVs, 0);
         %closestVsDist = getWord(%clVs, 1);
      }
      if (%closestVs > 0 && %closestVsDist < 250 && !isObject(%client.player.mVehicle))
      {
         //If we're in light or medium armor, buy the vehicle - Lagg...
         if (%client.player.getArmorSize() !$= "Heavy")
         {        
            %task.baseWeight = $AIWeightVehicleMountedEscort + 1000;//set high - lagg...
            %task.setMonitorFreq(9);
            %buyResult = aiBuyVehicle(MobileBaseVehicle, %client);
         }
         else
         {
            //if ai in heavy armor buy equipment
            if (%task == %client.objectiveTask)
            {
               %task.baseWeight = %client.objectiveWeight;
               %task.equipment = "Medium";
               %task.buyEquipmentSet = "MediumRepairSet";
               %client.needEquipment = true;
               return;
            }
         }
           
         if (%buyResult $= "InProgress")
         {
            //clear offensive tags
            %client.lastDamageClient = -1;
            %client.lastDamageTurret = -1;
            %client.shouldEngage = -1;
            %client.setEngageTarget(-1);
            %client.setTargetObject(-1);
            %client.engageRemeq = -1;
            %client.pickUpItem = -1;
            return;
         }
         else if (%buyResult $= "Finished")
         {
            //mount the vehicle and go - Lagg...
            %task.setMonitorFreq(50);
            %client.stop();
            %client.pilotVehicle = true;//needed to allow ai to get in pilot seat
                           
            //throw away any packs that won't fit
            if (%client.player.getInventory(InventoryDeployable) > 0)
               %client.player.throwPack();
            else if (%client.player.getInventory(TurretIndoorDeployable) > 0)
               %client.player.throwPack();
            else if (%client.player.getInventory(TurretOutdoorDeployable) > 0)
               %client.player.throwPack();
         }
         else if (%buyResult $= "Failed")
         {
            //if this task is the objective task, choose a new objective
            if (%task == %client.objectiveTask)
            {
               AIUnassignClient(%client);            
               Game.AIChooseGameObjective(%client);
               return;
            }
         }
      }
   }   

   //if we managed to get in vehicle then go
   if (%client.player.isMounted() && isObject(%client.player.mVehicle))
   {
      %vehicle = %client.vehicleMounted;
      if (%vehicle.getDataBlock().getName() !$= "mobileBaseVehicle")
      {
         error("opps we got in wrong vehicle");
         if (%task == %client.objectiveTask)
         {
            if (%client.player.isMounted())
            {
               AIDisembarkVehicle(%client);//Hop off...
               %client.needVehicle = true;
               return;
            }
            //else
            //{
               //AIUnassignClient(%client);
	       //Game.AIChooseGameObjective(%client);
               //return;
            //}
         }
      }

      //if we managed to get in vehicle then go
      if(%task.locationIndex < 0)
         %task.locationIndex++;

      //set the locations
      %location = %task.group.getObject(%task.locationIndex);
  
      //%client.setPilotPitchRange(-0.2, 0.05, 0.05);//use later +++
      %client.setPilotDestination(%location.position, 20);//slow
      
      //%vehicle = %Client.vehicleMounted;

      //else see if we're close enough to the current destination to choose the next
      %pos = %client.vehicleMounted.position;
      %pos2D = getWord(%pos, 0) SPC getWord(%pos, 1) SPC "0";
      %dest = %location.position;
      %dest2D = getWord(%dest, 0) SPC getWord(%dest, 1) SPC "0";

      if (VectorDist(%dest2D, %pos2D) < 35)
      {
         if ((%task.group > 0) && (%task.group.getCount()-1 > %task.locationIndex)) // ZOD: Spam fix, added group check
            %task.locationIndex++;
         else
         {                  
            //we are finished, choose a new objective
	      if (%task == %client.objectiveTask)
	      {               
               if (%client.vehicleMounted )
               {
                   %task.setMonitorFreq(9);
                   AIDisembarkVehicle(%client); //Hop off...
                   %client.stepMove(%location.position, 0.25); //Resume walking to our objective
                   %task.unassignTime = getSimTime();
                   return;
               }
            }
         }
      }          
   }
   else if (!%client.player.isMounted())
   {
      //if we at end of path and we hopped out
      if(%task.group > 0)
      {
         if (%task.group.getCount()-1 <= %task.locationIndex)
         {
            //give the MPB a chance to deploy
            if (getSimTime() - %task.unassignTime > 8000)
            {
               AIUnassignClient(%client);
               Game.AIChooseGameObjective(%client);
               return;
            }
            return;
         }
      }
      //did we fall off our bike? if so get back on!
      if (isObject(%client.player.mVehicle) && %client.player.mVehicle.getDamageState() !$= "Destroyed")
      {
         //throw away any packs that won't fit
         if (%client.player.getInventory(InventoryDeployable) > 0)
            %client.player.throwPack();
         else if (%client.player.getInventory(TurretIndoorDeployable) > 0)
            %client.player.throwPack();
         else if (%client.player.getInventory(TurretOutdoorDeployable) > 0)
            %client.player.throwPack();

         %client.pilotVehicle = true;//needed to let ai mount pilot seat
         %client.stepMove(%client.player.mVehicle.position, 0.25, $AIModeMountVehicle);
      }
      //did someone shoot our legs out? if so we are done!
      else if (isObject(%client.player.mVehicle) && %client.player.mVehicle.getDamageState() $= "Destroyed")
      {
         if (%task == %client.objectiveTask)
         {
            AIUnassignClient(%client);
            Game.AIChooseGameObjective(%client);
            return;
         }				
      }
   }
}

//+++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++ AIO Place Camera +++
// have to fix this so a repair object objective is created for the newly deployed thingy?? - ZOD, nah, no one repairs cameras
//rotate the objective marker, bot will place on the "Y" same as all other deploy objectives
//                                                                            - Lagg... 1-14-2003

function AIOPlaceCamera::weight(%this, %client, %level, %minWeight, %inventoryStr)
{
   //make sure the player is still alive!!!!!
   if (! AIClientIsAlive(%client))
      return 0;

   //make sure the deploy objective is valid
   //if (%this.isInvalid)
   //return 0;

   //first, make sure we haven't deployed too many...
   if (%this.equipment $= "CameraGrenade")
      %maxAllowed = $TeamDeployableMax[DeployedCamera];
   else
      return 0;
   
   if ($TeamDeployedCount[%client.team, %this.equipment] >= %maxAllowed)
      return 0;

   //now make sure there are no other items in the way...
   InitContainerRadiusSearch(%this.location, 1, $TypeMasks::VehicleObjectType |
  	                                          $TypeMasks::MoveableObjectType |
  	                                          $TypeMasks::StaticShapeObjectType |
  	                                          $TypeMasks::TSStaticShapeObjectType |
  	                                          $TypeMasks::ForceFieldObjectType |
  	                                          $TypeMasks::ItemObjectType |
  	                                          $TypeMasks::PlayerObjectType | $TypeMasks::TurretObjectType);                   
   %objSearch = containerSearchNext();

   //make sure we're not invalidating the deploy location with the client's own player object
   if (%objSearch == %client.player)
      %objSearch = containerSearchNext();

   //did we find an object which would block deploying the equipment?
   if (isObject(%objSearch))
      return 0;

 	

   //check equipment requirement
   %needEquipment = AINeedEquipment(%this.equipment, %client);
	
   //if don't need equipment, see if we've past the "point of no return", and should continue regardless
   if (! %needEquipment)
   {
      %needArmor = AIMustUseRegularInvStation(%this.equipment, %client);
      %result = AIFindClosestInventory(%client, %needArmor);
      %closestInv = getWord(%result, 0);
      %closestDist = getWord(%result, 1);
 
      //if we're too far from the inv to go back, or we're too close to the deploy location, force continue
      if (%closestDist > 50 && VectorDist(%client.player.getWorldBoxCenter(), %task.location) < 150)
      {
         %weight = AIODefault::weight(%this, %client, %level, %inventoryStr);
         if (%weight < $AIWeightContinueDeploying)
            %weight = $AIWeightContinueDeploying;

         return %weight;
       }
    }

   //if this bot is linked to a human who has issued this command, up the weight
   if (%this.issuedByClientId == %client.controlByHuman)
   {
      //make sure we have the potential to reach the minWeight
      if (!AIODefault::QuickWeight(%this, %client, %level, %minWeight))
      {
         if ($AIWeightHumanIssuedCommand < %minWeight)
            return 0;
         else
            %weight = $AIWeightHumanIssuedCommand;
      }
      else
      {
         // calculate the default...
         %weight = AIODefault::weight(%this, %client, %level, %inventoryStr);
         if (%weight < $AIWeightHumanIssuedCommand)
            %weight = $AIWeightHumanIssuedCommand;
      }
   }
   else
   {
      //make sure we have the potential to reach the minWeight
      if (!AIODefault::QuickWeight(%this, %client, %level, %minWeight))
         return 0;

      // calculate the default...
      %weight = AIODefault::weight(%this, %client, %level, %inventoryStr);
   }
   return %weight;
}

function AIOPlaceCamera::assignClient(%this, %client)
{
   %client.objectiveTask = %client.addTask(AIPlaceCamera);
   %task = %client.objectiveTask;
   %task.initFromObjective(%this, %client);
}

function AIOPlaceCamera::unassignClient(%this, %client)
{
   %client.removeTask(%client.objectiveTask);
   %client.objectiveTask = "";
}

//----------------------------------------------------------------------------------------------- AI Place Camera ---

function AIPlaceCamera::initFromObjective(%task, %objective, %client)
{
   //initialize the task vars from the objective
   %task.baseWeight = %client.objectiveWeight;
   %task.location = %objective.location;
   %task.equipment = %objective.equipment;
   %task.buyEquipmentSet = %objective.buyEquipmentSet;
   %task.desiredEquipment = %objective.desiredEquipment;
   %task.issuedByClient = %objective.issuedByClientId;
   %task.chat = %objective.chat;

   //initialize other task vars
   %task.sendMsg = true;
   %task.sendMsgTime = 0;

   //use the Y-axis of the rotation as the desired direction of deployement,
   //and calculate a walk to point 3 m behind the deploy point. 
   %task.deployDirection = MatrixMulVector("0 0 0 " @ getWords(%objective.getTransform(), 3, 6), "0 1 0");
   %task.deployDirection = VectorNormalize(%task.deployDirection);
}

function AIPlaceCamera::assume(%task, %client)
{
   %task.setWeightFreq(15);
   %task.setMonitorFreq(15);
	
   %client.needEquipment = AINeedEquipment(%task.equipment, %client);
   
   //mark the current time for the buy inventory state machine
   %task.buyInvTime = getSimTime();

   %task.passes = 0;
   %task.deployAttempts = 0;
   %task.checkObstructed = false;
   %task.waitMove = 0;
}

function AIPlaceCamera::retire(%task, %client)
{
}

function AIPlaceCamera::weight(%task, %client)
{
   //update the task weight
   if (%task == %client.objectiveTask)
      %task.baseWeight = %client.objectiveWeight;

   %task.setWeight(%task.baseWeight);
}

function AIPlaceCamera::monitor(%task, %client)
{
   //first, buy the equipment
   if (%client.needEquipment)
   {
      %task.setMonitorFreq(5);
      if (%task.equipment !$= "")
         %equipmentList = %task.equipment;
      else
         %equipmentList = %task.desiredEquipment;

      %result = AIBuyInventory(%client, %equipmentList, %task.buyEquipmentSet, %task.buyInvTime);
      if (%result $= "InProgress")
      {
         //force a nervous reaction every 15 sec - Lagg...
         if (getSimTime() - %task.buyInvTime > 15000)
         {
            %client.setDangerLocation(%client.player.getWorldBoxCenter(), 20);
            %task.buyInvTime = getSimTime();
         }
         return;
      }
      else if (%result $= "Finished")
      {	
         %task.setMonitorFreq(30);
         %client.needEquipment = false;
         //if we made it past the inventory buying, reset the inv time
	   %task.buyInvTime = getSimTime();
      }
      else if (%result $= "Failed")
      {
         //if this task is the objective task, choose a new objective
         if (%task == %client.objectiveTask)
         {
            AIUnassignClient(%client);
            Game.AIChooseGameObjective(%client);
         }
         return;
      }
   }

   //chat
   if (%task.sendMsg)
   {
      if (%task.sendMsgTime == 0)
         %task.sendMsgTime = getSimTime();
      else if (getSimTime() - %task.sendMsgTime > 7000)
      {
         %task.sendMsg = false;
         if (%client.isAIControlled())
         {
            if (%task.chat !$= "")
            {
               %chatMsg = getWord(%task.chat, 0);
               %chatTemplate = getWord(%task.chat, 1);
               if (%chatTemplate !$= "")
                  AIMessageThreadTemplate(%chatTemplate, %chatMsg, %client, -1);
               else
                  AIMessageThread(%task.chat, %client, -1);
            }
         }
      }
   }

   //see if we're supposed to be engaging anyone...
   if (AIClientIsAlive(%client.shouldEngage))
   {
      %hasLOS = %client.hasLOSToClient(%client.shouldEngage);
      %losTime = %client.getClientLOSTime(%client.shouldEngage);
      if (%hasLOS || %losTime < 1000)
         %client.setEngageTarget(%client.shouldEngage);
      else
         %client.setEngageTarget(-1);
   }
   else
      %client.setEngageTarget(-1);

   //calculate the deployFromLocation
   %factor = -4;// * (3 - (%task.passes * 0.5));
   %task.deployFromLocation = VectorAdd(%task.location,VectorScale(%task.deployDirection, %factor));

   //see if we're within range of the deploy location
   %clLoc = %client.player.position;
   %distance = VectorDist(%clLoc, %task.deployFromLocation);
   %dist2D = VectorDist(%clLoc, getWords(%task.deployFromLocation, 0, 1) SPC getWord(%clLoc, 2));

   //set the aim when we get near the target...  this will be overwritten when we're actually trying to deploy
   if (%distance < 10 && %dist2D < 10)
      %client.aimAt(%task.location, 1000);

   if ((%client.pathDistRemaining(20) > %distance + 0.25) || %dist2D > 0.5)
   {
      %task.deployAttempts = 0;
      %task.checkObstructed = false;
      %task.waitMove = 0;
      %client.stepMove(%task.deployFromLocation, 0.25);
      %task.setMonitorFreq(15);
      return;
   }
   
   if (%task.deployAttempts < 1 && %task.passes < 1 && !AIClientIsAlive(%client.getEngageTarget()))
   {
      //dissolve the human control link
      if (%task == %client.objectiveTask)
         aiReleaseHumanControl(%client.controlByHuman, %client);

      %task.setMonitorFreq(3);
      %client.stop();
      if (%task.deployAttempts == 0)
         %deployPoint = %task.location;
      else
         %deployPoint = findTurretDeployPoint(%client, %task.location, %task.deployAttempts);

      if(%deployPoint !$= "")
      {
         // we have possible point
         %task.deployAttempts++;
         %client.aimAt(%deployPoint, 2000);

         //try to place the camera
         //%client.deployPack = true;
         %client.lastThrownObject = -1;
         %client.player.throwStrength = 2;
         %client.player.use(CameraGrenade);
         
         // check if camera deployed
         if (isObject(%client.lastDeployedObject))
         {
            //see if there's a "repairObject" objective for the newly deployed thingy...
            if (%task == %client.objectiveTask)
            {
               %deployedObject = %client.lastDeployedObject;

               //search the current objective group and search for a "repair Object" task...
               %objective = %client.objective;

               //delete any previously associated "AIORepairObject" objective
               if (isObject(%objective.repairObjective))
               {
                  clearObjectiveFromTable(%objective.repairObjective); // New function - Lagg...
                  AIClearObjective(%objective.repairObjective);
                  %objective.repairObjective.delete();
                  %objective.repairObjective = "";
               }

               //add the repair objective
               %objective.repairObjective = new AIObjective(AIORepairObject)
               {
                  dataBlock = "AIObjectiveMarker";
                  weightLevel1 = %objective.weightLevel1 - 100;
                  weightLevel2 = 0;
                  description = "Repair the Deployed Camera";
                  targetObjectId = %deployedObject;
                  issuedByClientId = %client;
                  offense = false;
                  defense = true;
                  equipment = "RepairPack";
                  buyEquipmentSet = "LightRepairSet";
               };
               %objective.repairObjective.deployed = true;
               %objective.repairObjective.setTransform(%objective.getTransform());
               %objective.repairObjective.group = %objective.group;
               MissionCleanup.add(%objective.repairObjective);
               $ObjectiveQ[%client.team].add(%objective.repairObjective);

               //finally, unassign the client so he'll go do something else...
               AIUnassignClient(%client);
               Game.AIChooseGameObjective(%client);
            }
            //finished
            return;
         }
      }
   }
   else if (!%task.checkObstructed)
   {
      %task.checkObstructed = true;

      //see if anything is in our way
      InitContainerRadiusSearch(%task.location, 4, $TypeMasks::MoveableObjectType | $TypeMasks::VehicleObjectType | $TypeMasks::PlayerObjectType);
      %objSrch = containerSearchNext();
      if (%objSrch == %client.player)
         %objSrch = containerSearchNext();

      if (%objSrch)
         AIMessageThread("ChatMove", %client, -1);
   }
   else if (%task.waitMove < 5 && %task.passes < 1)
   {
      %task.waitMove++;

      //try another pass at deploying 
      if (%task.waitMove == 5)
      {
         %task.waitMove = 0;
         %task.passes++;
         %task.deployAttempts = 0;

         //see if we're *right* underneath the deploy point
         %deployDist2D = VectorDist(getWords(%client.player.position, 0, 1) @ "0", getWords(%task.location, 0, 1) @ "0");
         if (%deployDist2D < 0.25)
         {
            %client.pressjump();
            %client.player.throwStrength = 2;
            %client.player.use(CameraGrenade);

            // check if camera deployed
            //don't add a "repairObject" objective for ceiling turrets
            if (%task == %client.objectiveTask)
            {
               AIUnassignClient(%client);
               Game.AIChooseGameObjective(%client);
            }
         }
      }
   }
   else
   {
      //find a new assignment - and remove this one from the Queue
      if (%task == %client.objectiveTask)
      {
         //error(%client SPC "from team" SPC %client.team SPC "is invalidating objective:" SPC %client.objective SPC "UNABLE TO DEPLOY EQUIPMENT");
         %client.objective.isInvalid = false;
         AIUnassignClient(%client);
         Game.AIChooseGameObjective(%client);
      }
   }
}

//+++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++ AIO Tank Patrol  +++

function AIOTankPatrol::weight(%this, %client, %level, %minWeight, %inventoryStr)
{
   // if were playing CnH, check who owns this
   if (%this.targetObjectId > 0)
   {
      if (!isObject(%this.targetObjectId) || %this.targetObjectId.isHidden() || %this.targetObjectId.team != %client.team)
         return 0;
   }
   
   //make sure the player is still alive!!!!!
   if (! AIClientIsAlive(%client))
      return 0;

   //do a quick check to disqualify this objective if it can't meet the minimum weight
   if (!AIODefault::QuickWeight(%this, %client, %level, %minWeight))
   {
      if (%this.targetObjectId > 0 && %this.issuedByClientId == %client.controlByHuman)
      {
         if ($AIWeightHumanIssuedCommand < %minWeight)
	    return 0;
      }
      else
         return 0;
   }

   //check for Vehicle station near buy of forget it - Lagg...
   %clVs = AIFindClosestVStation(%client);
   if (%clVs > 0)
   {
      %closestVs = getWord(%clVs, 0);
      %closestVsDist = getWord(%clVs, 1);
      if (%closestVsDist > 250)
         return 0;
   }
   else 
      return 0;

   //check how many vehicles of this type are in the field - Lagg..
   %blockName = "AssaultVehicle";
   if (!vehicleCheck(%blockName, %client.team))
   {
      error("AIOTankSpam::weight 2 - To many Tanks in the field return 0");
      return 0;
   }

   %weight = AIODefault::weight(%this, %client, %level, %inventoryStr);

   //if the object has been destroyed, reduce the weight
   if (%this.targetObjectId > 0)
   {
      //see if we were forced on the objective
      if (%this.issuedByClientId == %client.controlByHuman && %weight < $AIWeightHumanIssuedCommand)
         %weight = $AIWeightHumanIssuedCommand;

      //else see if the object has been destroyed
      else if (!isObject(%this.targetObjectId) || %this.targetObjectId.getDamageState() $= "Destroyed")
         %weight -= 320;
   }

   return %weight;
}

function AIOTankPatrol::assignClient(%this, %client)
{
   %client.objectiveTask = %client.addTask(AITankPatrol);
   %client.objectiveTask.initFromObjective(%this, %client);
   
   //create the escort objective (require a gunner in this case...)
   %client.escort = new AIObjective(AIOEscortPlayer)
   {
      dataBlock = "AIObjectiveMarker";
      weightLevel1 = $AIWeightVehicleMountedEscort;
      weightLevel2 = 0;
      description = "Escort " @ getTaggedString(%client.name);
      targetClientId = %client;
      offense = true;
      chat = "ChatNeedHold";
      equipment = "FlareGrenade";
      buyEquipmentSet = "MediumRepairSet";
   };
   MissionCleanup.add(%client.escort);

   //the objectives on team1 are all offense objectives, team2 has the defensive ones..
   if(Game.class $= "SeigeGame")
   {
      if (%client.team == game.offenseTeam)
         $ObjectiveQ[1].add(%client.escort);
      else
         $ObjectiveQ[2].add(%client.escort);
   }
   else
      $ObjectiveQ[%client.team].add(%client.escort);
}

function AIOTankPatrol::unassignClient(%this, %client)
{
   //kill the escort objective
   if (%client.escort)
   {
      AIClearObjective(%client.escort);
      clearObjectiveFromTable(%client.escort); // New function - Lagg...
      %client.escort.delete();
      %client.escort = "";
   }   
   if(%client.pilotVehicle)
   {
      AIDisembarkVehicle(%client);
   }  
   %client.removeTask(%client.objectiveTask);
   %client.objectiveTask = "";
}

//----------------------------------------------------------------------------------------------- AI Tank Patrol ---

function AITankPatrol::initFromObjective(%task, %objective, %client)
{
   //initialize the task vars from the objective
   %task.baseWeight = %client.objectiveWeight;
   %task.targetObject = %objective.targetObjectId;
   if (%objective.Location !$= "")
      %task.location = %objective.location;
   else
      %task.location = %objective.targetObjectId.getWorldBoxCenter();

   %task.equipment = %objective.equipment;
   %task.buyEquipmentSet = %objective.buyEquipmentSet;
   %task.desiredEquipment = %objective.desiredEquipment;
   %task.issuedByClient = %objective.issuedByClientId;
   %task.chat = %objective.chat;

   //initialize other task vars
   %task.sendMsg = true;
   %task.sendMsgTime = 0;
   %task.path = "";
}

function AITankPatrol::assume(%task, %client)
{
   %task.setWeightFreq(30);
   %task.setMonitorFreq(40);
   
   %client.needEquipment = AINeedEquipment(%task.equipment, %client);

   //even if we don't *need* equipemnt, see if we should buy some... 
   if (! %client.needEquipment && %task.buyEquipmentSet !$= "")
   {
      //see if we could benefit from inventory
      %needArmor = AIMustUseRegularInvStation(%task.desiredEquipment, %client);
      %result = AIFindClosestInventory(%client, %needArmor);
      %closestInv = getWord(%result, 0);
      %closestDist = getWord(%result, 1);
      if (AINeedEquipment(%task.desiredEquipment, %client) && %closestInv > 0)
      {
         %result = AIFindClosestEnemy(%client, 100, $AIClientLOSTimeout);
         %closestEnemy = getWord(%result, 0);
         %closestEnemydist = getWord(%result, 1);

         if (%closestEnemy <= 0 || (%closestEnemyDist > %closestDist * 1.5))
            %client.needEquipment = true;
      }
   }

   //mark the current time for the buy inventory state machine
   %task.buyInvTime = getSimTime();

   //reset the vehicle station wait time
   %client.vsWaitTime = "";

   //set the destination paths for each team and game type

   %team = %client.team;
   %random = mFloor(getRandom(1, 2));
   if (Game.class $= "SiegeGame")
   {
      if (%team == Game.offenseTeam)
      {
         if (%random == 1)
            %task.group = nameToId(T1TankPath1);
         //if we have an alternate route random path
         else if (isObject(nameToId(T1TankPath2)))
            %task.group = nameToId(T1TankPath2);
         else
            %task.group = nameToId(T1TankPath1);
      }
      else
      {
         if (%random == 1)
            %task.group = nameToId(T2TankPath1);
         else if (isObject(nameToId(T2TankPath2)))
            %task.group = nameToId(T2TankPath2);
         else
            %task.group = nameToId(T2TankPath1);
      }
   }
   else
   {
      if (%team == 1)
      {
         if (%random == 1)
            %task.group = nameToId(T1TankPath1);
         else if (isObject(nameToId(T1TankPath2)))
            %task.group = nameToId(T1TankPath2);
         else
            %task.group = nameToId(T1TankPath1);
      }
      else
      {
         if (%random == 1)
            %task.group = nameToId(T2TankPath1);
         else if (isObject(nameToId(T2TankPath2)))
            %task.group = nameToId(T2TankPath2);
         else
            %task.group = nameToId(T2TankPath1);
      }
   }
   
   %task.count = %task.group.getCount();
   %task.locationIndex = 0;
   %client.needVehicle = true;
}

function AITankPatrol::retire(%task, %client)
{
   if (aiClientIsAlive(%client))
   {
      %client.needVehicle = false;
      %client.clearStep();
      if(%client.player.isMounted())
         AIDisembarkVehicle(%client);
   }
}

function AITankPatrol::weight(%task, %client)
{
   //let the monitor decide when to quit :)
   %task.setWeight(%task.baseWeight);
}

function AITankPatrol::monitor(%task, %client)
{   
   //first, buy equipment
   if (%client.needEquipment)
   {
      %task.setMonitorFreq(5);
      if (%task.equipment !$= "")
         %equipmentList = %task.equipment;
      else
         %equipmentList = %task.desiredEquipment;

      %result = AIBuyInventory(%client, %equipmentList, %task.buyEquipmentSet, %task.buyInvTime);
      if (%result $= "InProgress")
      {
         //force a nervous reaction every 30 sec - Lagg...
         if (getSimTime() - %task.buyInvTime > 30000)
         {
            %client.setDangerLocation(%client.player.getWorldBoxCenter(), 15);
            %task.buyInvTime = getSimTime();
         }
         return;
      }
      else if (%result $= "Finished")
      {
         %task.setMonitorFreq(50);
         %client.needEquipment = false;
      }
      else if (%result $= "Failed")
      {
         //if this task is the objective task, choose a new objective
         if (%task == %client.objectiveTask)
         {
            AIUnassignClient(%client);
            Game.AIChooseGameObjective(%client);
         }
         return;
      }
   }
   //if we made it past the inventory buying, reset the inv time
   %task.buyInvTime = getSimTime();

   //chat - send the message
   if (%task.sendMsg)
   {
      if (%task.sendMsgTime == 0)
         %task.sendMsgTime = getSimTime();
      else if (getSimTime() - %task.sendMsgTime > 7000)
      {
         %task.sendMsg = false;
         if (%client.isAIControlled())
         {
            if (%task.chat !$= "")
            {
               %chatMsg = getWord(%task.chat, 0);
               %chatTemplate = getWord(%task.chat, 1);
               if (%chatTemplate !$= "")
                  AIMessageThreadTemplate(%chatTemplate, %chatMsg, %client, -1);
               else
                  AIMessageThread(%task.chat, %client, -1);
            }
         }
      }
   }

   if (%client.needVehicle)
   {
      %clVs = AIFindClosestVStation(%client);
      if (%clVs > 0)
      {
         %closestVs = getWord(%clVs, 0);
         %closestVsDist = getWord(%clVs, 1);
      }
      if (%closestVs > 0 && %closestVsDist < 250 && !isObject(%client.player.mVehicle))
      {
         //If we're in light or medium armor, buy the vehicle - Lagg...
         if (%client.player.getArmorSize() !$= "Heavy")
         {        
            %task.baseWeight = 5500;//set high - lagg...
            %task.setMonitorFreq(9);
            %buyResult = aiBuyVehicle(AssaultVehicle, %client);
         }
         else
         {
            //if ai in heavy armor buy equipment
            if (%task == %client.objectiveTask)
            {
               %task.baseWeight = %client.objectiveWeight;
               %task.equipment = "Medium";
               %task.buyEquipmentSet = "MediumMissileSet";
               %client.needEquipment = true;
               return;
            }
         }
           
         if (%buyResult $= "InProgress")
         {
            //clear offensive tags
            %client.lastDamageClient = -1;
            %client.lastDamageTurret = -1;
            %client.shouldEngage = -1;
            %client.setEngageTarget(-1);
            %client.setTargetObject(-1);
            %client.engageRemeq = -1;
            %client.pickUpItem = -1;
            return;
         }
         else if (%buyResult $= "Finished")
         {
            %client.needVehicle = false;//needed duh!
            //mount the vehicle and go - Lagg...
            %task.setMonitorFreq(40);
            %client.stop();
            %client.pilotVehicle = true;//needed to allow ai to get in pilot seat

            //throw away any packs that won't fit
            if (%client.player.getInventory(InventoryDeployable) > 0)
               %client.player.throwPack();
            else if (%client.player.getInventory(TurretIndoorDeployable) > 0)
               %client.player.throwPack();
            else if (%client.player.getInventory(TurretOutdoorDeployable) > 0)
               %client.player.throwPack();
         }
         else if (%result $= "Failed")
         {
            //if this task is the objective task, choose a new objective
            if (%task == %client.objectiveTask)
            {
               AIUnassignClient(%client);
               Game.AIChooseGameObjective(%client);
               return;
            }
         }
      }
      //else if (%closestVs <= 0 && !isObject(%client.player.mVehicle))
      //{
         //error("waiting for vehicle to materialize");
      //   if (%task == %client.objectiveTask)
      //   {
            //AIUnassignClient(%client);
	      //Game.AIChooseGameObjective(%client);
            //return;
      //   }
      //}
   }

   //let set some variables

   //if we managed to get in vehicle then go
   if (%client.player.isMounted() && isObject(%client.player.mVehicle))
   { 
      //get the vehicle
      %vehicle = %Client.vehicleMounted;

      //get the gunner seat: 0 = empty 1 = full
      %nodeGun = %vehicle.getMountNodeObject(1);

      //should we wait for a gunner?
      if (%nodeGun <= 0)
      {
         %pos = %client.vehicleMounted.position;
         %pos2D = getWord(%pos, 0) SPC getWord(%pos, 1) SPC "0";
         %dest = %task.location;
         %dest2D = getWord(%dest, 0) SPC getWord(%dest, 1) SPC "0";
         if (VectorDist(%dest2D, %pos2D) < 20)
            %client.stop();//doen't seem to work if ai is pilot
         else
         {      
            %client.setPilotPitchRange(-0.2, 0.05, 0.05);
            %client.setPilotDestination(%task.location, 10); //move to wait spot
         }         
      }
      else 
      {
         //little check to see if anybody around

         //first check turret potential targets
         %vehicle = %Client.vehicleMounted;
         %turret = %vehicle.getMountNodeObject(10);
         %target = %turret.getTargetObject();

         //driver see if anybody close to run down (cheat ignor LOS) :) - Lagg...
         %losTimeout = $AIClientMinLOSTime + ($AIClientLOSTimeout * %client.getSkillLevel());
         %result = AIFindClosestEnemyToLoc(%client, %client.player.getWorldBoxCenter(), 70, %losTimeout, true, false);
         %closestEnemy = getWord(%result, 0);
         %closestdist = getWord(%result, 1);

         //check for obstacles
         %vLoc = %vehicle.getWorldBoxCenter();
         //%mask = $TypeMasks::InteriorObjectType | $TypeMasks::TSStaticShapeObjectType;
         InitContainerRadiusSearch(%vLoc, 30, $TypeMasks::InteriorObjectType | $TypeMasks::TSStaticShapeObjectType |
           $TypeMasks::VehicleObjectType);
         %obs = containerSearchNext();
         //if (%obs)
         //{
            //echo("we got an interior close by");
            //if (getRandom() > 0.95)
            //{
               //if (%task.locationIndex > 1)
               //{
                  //echo("Random change to last dest index :)");
                  //%task.locationIndex--;
               //}
            //}
         //}

         if (%target > 0)
            %dist = vectorDist(%vehicle.getWorldBoxCenter(), %target.getWorldBoxCenter());

         //if driver spotted a target
         if (%closestEnemy > 0 && %closestdist < 70 && !%obs) //run em dowm even if gunner has target
         {
            %client.setPilotDestination(%closestEnemy.position, 60); //run em down!
            %client.aimAt(%closestEnemy.position, 1000); 
         }
         else if (%closestEnemy > 0 && %target <= 0 && %closestdist < 200 && !%obs) //only move if gunner has no target
         {
            %client.setPilotDestination(%closestEnemy.position, 10);//shoot em
            %client.aimAt(%closestEnemy.position, 5000);
         }
         else if (%target > 0 && %dist > 250 && !%obs) //if gunner has target - move to target
         {
            %client.setPilotDestination(%target.position, 20); //if gunner has target move slow
            %client.aimAt(%target.position, 5000); 
         }
         //slow down so gunner can hit something
         //else if (%target > 0 && %dist <= 250 && !%obs)
         else if (%target > 0 && %dist <= 250) //don't check for obstacles, just stop
         {
            %client.setPilotDestination(%client.vehicleMounted.position, 0); //this stops him
            %client.aimAt(%target.position, 10000);
         }
         //stop so gunner can chaingun target
         //else if (%target > 0 && %dist < 25 && !%obs)
         else if (%target > 0 && %dist < 35)//since we are stopped no check for %obs
         {
            %client.setPilotDestination(%client.vehicleMounted.position, 0);  //this stops him
            %client.aimAt(%target.position, 10000);
         }
         //if there is no enemy, continue on path
         else
         {
            //set the locations
            %location = %task.group.getObject(%task.locationIndex);

            %pos = %client.vehicleMounted.position;
            %pos2D = getWord(%pos, 0) SPC getWord(%pos, 1) SPC "0";
            %dest = %location.position;
            %dest2D = getWord(%dest, 0) SPC getWord(%dest, 1) SPC "0";

            //are we close to location index marker?
            if (VectorDist(%dest2D, %pos2D) < 25)//25 meters from marker
            {
	         //if we have another location index
               if ((%task.count - 1) > %task.locationIndex)//has to be -1 on the groups count
                  %task.locationIndex++;
               //we are at end of trail
               else
               {
                  if (%task == %client.objectiveTask)
                  {                  
                     if (%client.vehicleMounted )
                     {
                         AIDisembarkVehicle(%client); //Hop off...
                         %client.stepMove(%location.position, 0.25);
                         return;
                     }
                  }
               }
            }
            %client.setPilotDestination(%location.position, 20);
         }
      }
   }
   else if (!%client.player.isMounted())
   {
      //if we at end of path and we hopped out
      if ((%task.count - 1) == %task.locationIndex)//has to be -1 on the groups count
      {
         if (%task == %client.objectiveTask)
         {
            AIUnassignClient(%client);
            Game.AIChooseGameObjective(%client);
         }
      }
            
      //did we fall off our bike? if so get back on!
      if (isObject(%client.player.mVehicle) && %client.player.mVehicle.getDamageState() !$= "Destroyed" && %client.pilotVehicle)
      {
         //if ai in heavy armor buy equipment
         if (%task == %client.objectiveTask)
         {
            %task.baseWeight = %client.objectiveWeight;
            %task.equipment = "Medium";
            %task.buyEquipmentSet = "MediumMissileSet";
            %client.needEquipment = true;
            return;
         }

         //check if someone stole our bike
         if (%client.player.mVehicle.getMountNodeObject(0) > 0)
         {
            if (%task == %client.objectiveTask)
            {
               error("Tank Stolen !");
               AIUnassignClient(%client);
               Game.AIChooseGameObjective(%client);
               return;
            }
         }

         //throw away any packs that won't fit
         if (%client.player.getInventory(InventoryDeployable) > 0)
            %client.player.throwPack();
         else if (%client.player.getInventory(TurretIndoorDeployable) > 0)
            %client.player.throwPack();
         else if (%client.player.getInventory(TurretOutdoorDeployable) > 0)
            %client.player.throwPack();

         %client.pilotVehicle = true;//needed to let ai mount pilot seat
         %client.stepMove(%client.player.mVehicle.position, 0.25, $AIModeMountVehicle);
      }
      //did someone shoot our legs out? if so we are done!
      else if (isObject(%client.player.mVehicle) && %client.player.mVehicle.getDamageState() $= "Destroyed")
      {
         if (%task == %client.objectiveTask)
         {
            AIUnassignClient(%client);
            Game.AIChooseGameObjective(%client);
         }				
      }
   }
}
