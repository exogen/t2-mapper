//------------------------------
//AI Objective Q functions...

$ObjectiveClientsSet = 0;
function AIObjectiveFindClients(%objective)
{
   //create and clear the set
   if (! $ObjectiveClientsSet)
   {
      $ObjectiveClientsSet = new SimSet();
      MissionCleanup.add($ObjectiveClientSet);
   }
   $ObjectiveClientsSet.clear();
   
   %clientCount = 0;
   %count = ClientGroup.getCount();
   for(%i = 0; %i < %count; %i++)
   {
		%cl = ClientGroup.getObject(%i);
      if (%cl.objective == %objective)
         $ObjectiveClientsSet.add(%cl);
   }
   return $ObjectiveClientsSet.getCount();
}

function AIObjectiveGetClosestClient(%location, %team)
{
   if (%location $= "")
      return -1;
      
   if (%team $= "")
      %team = 0;
      
   %closestClient = -1;
   %closestDistance = 32767;
   %count = ClientGroup.getCount();
   for(%i = 0; %i < %count; %i++)
   {
		%cl = ClientGroup.getObject(%i);
      if (%cl.isAIControlled() && (%cl.team == %team || %team == 0) && AIClientIsAlive(%cl))
      {
         %testPos = %cl.player.getWorldBoxCenter();
         %distance = VectorDist(%location, %testPos);
         if (%distance < %closestDistance)
         {
            %closestDistance = %distance;
            %closestClient = %cl;
         }
      }
	}
   
   return %closestClient;
}

function AICountObjectives(%team)
{
	%objCount = 0;
	%count = $ObjectiveQ[%team].getCount();
	for (%i = 0; %i < %count; %i++)
	{
		%grp = $ObjectiveQ[%team].getObject(%i);
		if (%grp.getClassName() !$= "AIObjective")
			%objCount += %grp.getCount();
		else
			%objCount++;
	}
	error("DEBUG" SPC %team SPC "has" SPC %objCount SPC "objectives.");
}

function AIAddTableObjective(%objective, %weight, %level, %bump, %position)
{
	$objTable[%position, objective] = %objective;
	$objTable[%position, weight] = %weight;
	$objTable[%position, level] = %level;
	$objTable[%position, bump] = %bump;
	$objTableCount = %position + 1;
}

function AIChooseObjective(%client, %useThisObjectiveQ)
{
	//pick which objectiveQ to use, or use the default
	if (%useThisObjectiveQ <= 0 && %client.team < 0)
		return;

	if (%useThisObjectiveQ <= 0)
		%useThisObjectiveQ = $ObjectiveQ[%client.team];

	if (!isObject(%useThisObjectiveQ) || %useThisObjectiveQ.getCount() <= 0)
		return;

	//since most objectives check for inventory, find the closest inventory stations first
	%inventoryStr = AIFindClosestInventories(%client);

   //find the most appropriate objective
   if (!%client.objective)
	{
		//note, the table is never empty, during the course of this function
		AIAddTableObjective(0, 0, 0, 0, 0);
	}
   else
	{
		//should re-evaluate the current objective weight - but never decrease the weight!!!
		%testWeight = %client.objective.weight(%client, %client.objectiveLevel, 0, %inventoryStr);
		if (%testWeight <= 0 || %testWeight > %client.objectiveWeight)
			%client.objectiveWeight = %testWeight;

		if (%client.objectiveWeight > 0)
			AIAddTableObjective(%client.objective, %client.objectiveWeight, %client.objectiveLevel, 0, 0);
		else
			AIAddTableObjective(0, 0, 0, 0, 0);
	}

   %objCount = %useThisObjectiveQ.getCount();
 	for (%i = 0; %i < %objCount; %i++)
 	{
	   %objective = %useThisObjectiveQ.getObject(%i);

		//don't re-evaluate the client's own
		if (%objective == %client.objective)
			continue;

		//try this objective at each of the 4 weight levels to see if it is weighted higher
		for (%level = 1; %level <= 4; %level++)
		{
			%minWeight = 0;
			%bumpWeight = 0;
			%bumpClient = "";

			//we can bump clients off the objective for the first three levels
			if (%level <= 3)
			{
				//if the objective is part of a group, check the whole group
				if (%objective.group > 0)
				{
					%bumpClient = %objective.group.clientLevel[%level];
					%bumpWeight = %bumpClient.objectiveWeight;
				}
				else
				{
					%bumpClient = %objective.clientLevel[%level];
					%bumpWeight = %bumpClient.objectiveWeight;
				}
			}

			//find the minimum weight the objective must have to be considered
			%minWeight = (%bumpWeight > $objTable[0, weight] ? %bumpWeight : $objTable[0, weight]);

			//evaluate the weight
	      %weight = %objective.weight(%client, %level, %minWeight, %inventoryStr);

			//make sure we got a valid weight
			if (%weight <= 0)
				break;

			//if it's the highest so far, it now replaces anything else in the table
			if (%weight > $objTable[0, weight])
			{
				//never bump someone unless you out- weight them
				if (%weight > %bumpWeight)
				{
					AIAddTableObjective(%objective, %weight, %level, %bumpClient, 0);

					//no need to keep checking the other levels
					break;
				}
			}

			//else if it's equal to the highest objective we've seen so far, and higher from our current objective
			else if (%weight == $objTable[0, weight] && %weight > %client.objectiveWeight)
			{
				//never bump someone unless you outweigh them
				if (%weight > %bumpWeight)
				{
					//if this wouldn't require us to bump someone, or the table is empty
					if (%bumpWeight <= 0 || $objTable[0, weight] <= 0)
					{
						//if the table currently contains objectives which would require bumping someone, clear it
						if ($objTable[0, bump] > 0)
							%position = 0;
						else
							%position = $objTableCount;

						//add it to the table
						AIAddTableObjective(%objective, %weight, %level, %bumpClient, %position);

						//no need to keep checking the other levels
						break;
					}

					//otherwise, the table is not empty, and this would require us to bump someone
					//only add it if everything else in the table would also require us to bump someone
					else if ($objTable[0, bump] > 0)
					{
						AIAddTableObjective(%objective, %weight, %level, %bumpClient, $objTableCount);

						//no need to keep checking the other levels
						break;
					}
				}
			}

			//else it must have been less than our highest objective so far- again, no need to keep checking other levels...
			else
				break;
		}
	}

	//if we have a table of possible objectives which are higher than our current- choose one at random
	if ($objTableCount > 0 && $objTable[0, objective] != %client.objective)
	{
		//choose the new one
		%index = mFloor(getRandom() * ($objTableCount - 0.01));

		//clear the old objective
      if (%client.objective)
      {
         if (%client.objectiveLevel <= 3)
			{
				if (%client.objective.group > 0)
				{
					if (%client.objective.group.clientLevel[%client.objectiveLevel] == %client)
						%client.objective.group.clientLevel[%client.objectiveLevel] = "";
				}
				else
				{
					if (%client.objective.clientLevel[%client.objectiveLevel] == %client)
		            %client.objective.clientLevel[%client.objectiveLevel] = "";
				}
			}
         %client.objective.unassignClient(%client);
      }
		
		//assign the new
      %chooseObjective = $objTable[%index, objective];
      %client.objective = %chooseObjective;
      %client.objectiveWeight = $objTable[%index, weight];
      %client.objectiveLevel = $objTable[%index, level];
		if (%client.objectiveLevel <= 3)
		{
			if (%chooseObjective.group > 0)
		      %chooseObjective.group.clientLevel[%client.objectiveLevel] = %client;
			else
		      %chooseObjective.clientLevel[%client.objectiveLevel] = %client;
		}
      %chooseObjective.assignClient(%client);

      //see if this objective needs to be acknowledged
      if (%chooseObjective.shouldAcknowledge && %chooseObjective.issuedByHuman && isObject(%chooseObjective.issuedByClientId))
      {
         //cancel any pending acknowledgements - a bot probably just got bumped off this objective
         cancel(%chooseObjective.ackSchedule);
         %chooseObjective.ackSchedule = schedule(5500, %chooseObjective, "AIAcknowledgeObjective", %client, %chooseObjective);
      }

      //if we had to bump someone off this objective, 
		%bumpClient = $objTable[%index, bump];
      if (%bumpClient > 0)
      {
         //unassign the bumped client and choose a new objective
			AIUnassignClient(%bumpClient);
         Game.AIChooseGameObjective(%bumpClient);
      }
	}

   //debuging - refresh aidebugq() if required
   //if ($AIDebugTeam >= 0)
   //   aiDebugQ($AIDebugTeam);
}

function AIAcknowledgeObjective(%client, %objective)
{
   %objective.shouldAcknowledge = false;
   //make sure the client is still assigned to this objective
   if (%client.objective == %objective)
	   serverCmdAcceptTask(%client, %objective.issuedByClientId, -1, %objective.ackDescription);
}

function AIForceObjective(%client, %newObjective, %useWeight)
{
   //if we found a new objective, release the old, and assign the new
   if (%newObjective && %newObjective != %client.objective)
   {
      //see if someone was already assigned to this objective
		if (%newObjective.group > 0)
	      %prevClient = newObjective.group.clientLevel[1];
		else
	      %prevClient = newObjective.clientLevel[1];
      if (%prevClient > 0)
         AIUnassignClient(%prevClient);

		//see if we should override the weight
		if (%useWeight < %newObjective.weightLevel1)
			%useWeight = %newObjective.weightLevel1;
      
      //release the client, and force the assignment
      AIUnassignClient(%client);
      %client.objective = %newObjective;
      %client.objectiveWeight = %useWeight;
      %client.objectiveLevel = 1;
		if (%newObjective.group > 0)
	      %newObjective.group.clientLevel[1] = %client;
		else
	      %newObjective.clientLevel[1] = %client;
		%newObjective.forceClientId = %client;
      %newObjective.assignClient(%client);

      //don't acknowledge anything that's been forced...
      %newObjective.shouldAcknowledge = false;
      
      //now reassign the prev client
      if (%prevClient)
         Game.AIChooseGameObjective(%prevClient);
   }
   
   //debuging - refresh aidebugq() if required
   //if ($AIDebugTeam >= 0)
   //   aiDebugQ($AIDebugTeam);
}

function AIUnassignClient(%client)
{
	//first, dissolve any link with a human
	aiReleaseHumanControl(%client.controlByHuman, %client);

   if (%client.objective)
   {
      if (%client.objectiveLevel <= 3)
		{
			if (%client.objective.group > 0)
			{
				//make sure the clientLevel was actually this client
				if (%client.objective.group.clientLevel[%client.objectiveLevel] == %client)
					%client.objective.group.clientLevel[%client.objectiveLevel] = "";
			}
			else
			{
				if (%client.objective.clientLevel[%client.objectiveLevel] == %client)
		         %client.objective.clientLevel[%client.objectiveLevel] = "";
			}
		}
      %client.objective.unassignClient(%client);
      %client.objective = "";
		%client.objectiveWeight = 0;
   }
   
   //debuging - refresh aidebugq() if required
   //if ($AIDebugTeam >= 0)
   //   aiDebugQ($AIDebugTeam);
}
  
function AIClearObjective(%objective)
{
   %count = ClientGroup.getCount();
   for(%i = 0; %i < %count; %i++)
   {
		%cl = ClientGroup.getObject(%i);
      if (%cl.objective == %objective)
         AIUnassignClient(%cl);
   }
   
   //debuging - refresh aidebugq() if required
   //if ($AIDebugTeam >= 0)
   //   aiDebugQ($AIDebugTeam);
}
 
//------------------------------
//TASKS AND OBJECTIVES

function AIDefendLocation::initFromObjective(%task, %objective, %client)
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
   
   %task.engageTarget = -1;
}

function AIDefendLocation::assume(%task, %client)
{
   %task.setWeightFreq(15);
   %task.setMonitorFreq(15);
   %client.inPerimeter = false;
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
}

function AIDefendLocation::retire(%task, %client)
{
	%task.engageVehicle = -1;
	%client.setTargetObject(-1);
}

function AIDefendLocation::weight(%task, %client)
{
	//update the task weight
	if (%task == %client.objectiveTask)
		%task.baseWeight = %client.objectiveWeight;

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

function AIDefendLocation::monitor(%task, %client)
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
			return;
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
						AIMessageThreadTemplate("DefendBase", "ChatSelfDefendGenerator", %client, -1);
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

	//if the defend location task has an object, set the "reset" flag
	if (%task == %client.objectiveTask && isObject(%task.targetObject))
	{
		if (%task.targetObject.getDamageState() !$= "Destroyed")
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
	      if (%client.getStepStatus() !$= "InProgress" || %distance > 75)
	      {
	         %client.setEngageTarget(-1);
	         %client.stepMove(%task.location, 8.0);
	      } 
	   }
	   
	   //else see if we have a target to begin attacking
	   else if (%task.engageTarget > 0)
	      %client.stepEngage(%task.engageTarget);
	      
	   //else move to a random location around where we are defending
	   else if (%client.getStepName() !$= "AIStepIdlePatrol")
		{
			%dist = VectorDist(%client.player.getWorldBoxCenter(), %task.location);
			if (%dist < 10)
			{
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
		      %client.stepMove(%task.location, 8.0);
		}
	}

   //see if we're supposed to be engaging anyone...
   if (!AIClientIsAlive(%client.getEngageTarget()) && AIClientIsAlive(%client.shouldEngage))
      %client.setEngageTarget(%client.shouldEngage);
}

//------------------------------

function AIAttackLocation::initFromObjective(%task, %objective, %client)
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
   %task.engageTarget = -1;
}

function AIAttackLocation::assume(%task, %client)
{
   %task.setWeightFreq(30);
   %task.setMonitorFreq(30);
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
			%result = AIFindClosestEnemyToLoc(%client, %task.location, 50, $AIClientLOSTimeout);
	      %closestEnemy = getWord(%result, 0);

			if (%closestEnemy <= 0)
				%client.needEquipment = true;
		}
	}

	//mark the current time for the buy inventory state machine
	%task.buyInvTime = getSimTime();

	%task.snipeLocation = "";
	%task.hideLocation = "";
	%task.moveToPosition = true;
	%task.moveToSnipe = false;
	%task.nextSnipeTime = 0;
}

function AIAttackLocation::retire(%task, %client)
{
}

function AIAttackLocation::weight(%task, %client)
{
	//update the task weight
	if (%task == %client.objectiveTask)
		%task.baseWeight = %client.objectiveWeight;

	//if we're a sniper, we're going to cheat, and see if there are clients near the attack location
   %losTimeout = $AIClientMinLOSTime + ($AIClientLOSTimeout * %client.getSkillLevel());
	%distToLoc = VectorDist(%client.player.getWorldBoxCenter(), %task.location);
	if (%client.player.getInventory(SniperRifle) > 0 && %client.player.getInventory(EnergyPack) > 0 && %distToLoc > 60)
		%result = AIFindClosestEnemyToLoc(%client, %task.location, 50, $AIClientLOSTimeout, true);

	//otherwise, do the search normally.  (cheat ignores LOS)...
	else
		%result = AIFindClosestEnemyToLoc(%client, %task.location, 50, %losTimeout, false);

   %closestEnemy = getWord(%result, 0);
   %closestdist = getWord(%result, 1);
   %task.setWeight(%task.baseWeight);
   
   //see if we found someone
   if (%closestEnemy > 0)
      %task.engageTarget = %closestEnemy;
   else
      %task.engageTarget = -1;
}

function AIAttackLocation::monitor(%task, %client)
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
			return;
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
				else
					AIMessageThreadTemplate("AttackBase", "ChatSelfAttack", %client, -1);
			}
		}
	}

   //how far are we from the location we're defending
   %myPos = %client.player.getWorldBoxCenter();
   %distance = %client.getPathDistance(%task.location);
	if (%distance < 0)
		%distance = 32767;

	if (%client.player.getInventory(SniperRifle) > 0 && %client.player.getInventory(EnergyPack) > 0)
	{
		//first, find an LOS location
		if (%task.snipeLocation $= "")
		{
			%task.snipeLocation = %client.getLOSLocation(%task.location, 150, 250);
			%task.hideLocation = %client.getHideLocation(%task.location, VectorDist(%task.location, %task.snipeLocation), %task.snipeLocation, 1); 
			%client.stepMove(%task.hideLocation, 4.0);
			%task.moveToPosition = true;
		}
		else
		{
			//see if we can acquire a target
			%energy = %client.player.getEnergyPercent();
			%distToSnipe = VectorDist(%task.snipelocation, %client.player.getWorldBoxCenter());
			%distToHide = VectorDist(%task.hidelocation, %client.player.getWorldBoxCenter());

			//until we're in position, we can move using the AIModeExpress, after that, we only want to walk...
			if (%task.moveToPosition)
			{
				if (%distToHide < 4.0)
				{
					//dissolve the human control link
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

					%task.moveToPosition = false;
				}
			}

			else if (%task.moveToSnipe)
			{
				if (%energy > 0.75 && %client.getStepStatus() $= "Finished")
				{
					%client.stepMove(%task.snipeLocation, 4.0, $AIModeWalk);
					%client.setEngageTarget(%task.engageTarget);
				}
				else if (%energy < 0.4)
				{
					%client.setEngageTarget(-1);
					%client.stepMove(%task.hideLocation, 4.0);
					%task.nextSnipeTime = getSimTime() + 4000 + (getRandom() * 4000);
					%task.moveToSnipe = false;
				}
			}

			else if (%energy > 0.5 && %task.engageTarget > 0 && getSimTime() > %task.nextSnipeTime)
			{ 
			   %client.stepRangeObject(%task.engageTarget.player.getWorldBoxCenter(), "BasicSniperShot", 150, 250, %task.snipelocation);
				%client.aimAt(%task.engageTarget.player.getWorldBoxCenter(), 8000);
				%task.moveToSnipe = true;
			}
		}
	}
	else
	{
	   //else see if we have a target to begin attacking
	   if (%client.getEngageTarget() <= 0 && %task.engageTarget > 0)
	      %client.stepEngage(%task.engageTarget);

	   //else move to the location we're defending
	   else if (%client.getEngageTarget() <= 0)
		{
	      %client.stepMove(%task.location, 8.0);
			if (VectorDist(%client.player.position, %task.location) < 10)
			{
				//dissolve the human control link
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
			}
		}
	}

   //see if we're supposed to be engaging anyone...
   if (!AIClientIsAlive(%client.getEngageTarget()) && AIClientIsAlive(%client.shouldEngage))
      %client.setEngageTarget(%client.shouldEngage);
}

//------------------------------

function AIAttackPlayer::initFromObjective(%task, %objective, %client)
{
   %task.baseWeight = %client.objectiveWeight;
   %task.targetClient = %objective.targetClientId;
   %task.equipment = %objective.equipment;
	%task.buyEquipmentSet = %objective.buyEquipmentSet;
	%task.desiredEquipment = %objective.desiredEquipment;
	%task.issuedByClient = %objective.issuedByClientId;
}

function AIAttackPlayer::assume(%task, %client)
{
   %task.setWeightFreq(15);
   %task.setMonitorFreq(15);
   %client.needEquipment = AINeedEquipment(%task.equipment, %client);
	if (! %client.needEquipment)
	   %client.stepEngage(%task.targetClient);

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
			%distToTarg = %client.getPathDistance(%task.targetClient.player.getWorldBoxCenter());
			if (%distToTarg < 0 || %distToTarg > 100)
				%client.needEquipment = true;
		}
	}

	//mark the current time for the buy inventory state machine
	%task.buyInvTime = getSimTime();
}

function AIAttackPlayer::retire(%task, %client)
{
	//dissolve the human control link
	if (%task == %client.objectiveTask)
		aiReleaseHumanControl(%client.controlByHuman, %client);
}

function AIAttackPlayer::weight(%task, %client)
{
	//update the task weight
	if (%task == %client.objectiveTask)
		%task.baseWeight = %client.objectiveWeight;

   %task.setWeight(%task.baseWeight);
}

function AIAttackPlayer::monitor(%task, %client)
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
			return;
		else if (%result $= "Finished")
		{
		   %task.setMonitorFreq(15);
			%client.needEquipment = false;
		   %client.stepEngage(%task.targetClient);
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

	//cheap hack for now...   make the bot always know where you are...
	%client.clientDetected(%task.targetClient);

	//make sure we're still attacking...
   if (%client.getStepName() !$= "AIStepEngage")
	   %client.stepEngage(%task.targetClient);

	//make sure we're still attacking the right target
	%client.setEngageTarget(%task.targetClient);

   if (%client.getStepStatus() !$= "InProgress" && %task == %client.objectiveTask)
	{
      AIUnassignClient(%client);
      Game.AIChooseGameObjective(%client);
	}
}

//------------------------------

function AITouchObject::initFromObjective(%task, %objective, %client)
{
   %task.baseWeight = %client.objectiveWeight;
   %task.targetObject = %objective.targetObjectId;
	%task.mode = %objective.mode;
	if (%objective.mode $= "FlagCapture")
		%task.location = %objective.location;
	else if(%objective.mode $= "TouchFlipFlop")
      %task.location = %objective.location;
   else
		%task.location = "";
   %task.equipment = %objective.equipment;
	%task.buyEquipmentSet = %objective.buyEquipmentSet;
	%task.desiredEquipment = %objective.desiredEquipment;
	%task.issuedByClient = %objective.issuedByClientId;

	%task.sendMsgTime = 0;
	if (%task.mode $= "FlagGrab")
		%task.sendMsg = true;
	else
		%task.sendMsg = false;
}

function AITouchObject::assume(%task, %client)
{
   %task.setWeightFreq(15);
   %task.setMonitorFreq(15);
   %task.engageTarget = 0;
   %client.needEquipment = AINeedEquipment(%task.equipment, %client);

	//even if we don't *need* equipemnt, see if we should buy some... 
	if (! %client.needEquipment && (%task.mode $= "FlagGrab" || %task.mode $= "TouchFlipFlop") && %task.buyEquipmentSet !$= "")
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
			%distToObject = %client.getPathDistance(%task.location);
			if (%distToObject < 0 || %closestDist < %distToObject)
				%client.needEquipment = true;
		}
	}

	//mark the current time for the buy inventory state machine
	%task.buyInvTime = getSimTime();
}

function AITouchObject::retire(%task, %client)
{
}

function AITouchObject::weight(%task, %client)
{
	//update the task weight
	if (%task == %client.objectiveTask)
		%task.baseWeight = %client.objectiveWeight;

   //see if we can find someone to shoot at...
   if (%client.getEngageTarget() <= 0)
   {
      %losTimeout = $AIClientMinLOSTime + ($AIClientLOSTimeout * %client.getSkillLevel());
      %myLocation = %client.player.getWorldBoxCenter();
		%result = AIFindClosestEnemy(%client, 40, %losTimeout);
      %task.engageTarget = getWord(%result, 0);
   }
   
   %task.setWeight(%task.baseWeight);
}

function AITouchObject::monitor(%task, %client)
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
			return;
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
				if (%task.mode $= "FlagGrab")
					AIMessageThreadTemplate("AttackBase", "ChatSelfAttackFlag", %client, -1);
			}
		}
	}

   //keep updating the position, in case the flag is flying through the air...
	if (%task.location !$= "")
		%touchPos = %task.location;
	else
	   %touchPos = %task.targetObject.getWorldBoxCenter();
      
   //see if we need to engage a new target
   %engageTarget = %client.getEngageTarget();
   if (!AIClientIsAlive(%engageTarget) && %task.engageTarget > 0)
      %client.setEngageTarget(%task.engageTarget);
   
   //else see if we should abandon the engagement
   else if (AIClientIsAlive(%engageTarget))
   {
      %myPos = %client.player.getWorldBoxCenter();
      %testPos = %engageTarget.player.getWorldBoxCenter();
      %distance = %client.getPathDistance(%testPos);
      if (%distance < 0 || %distance > 70)
         %client.setEngageTarget(-1);
   }

	//see if we have completed our objective
   if (%task == %client.objectiveTask)
   {
		%completed = false;
		switch$ (%task.mode)
		{
	      case "TouchFlipFlop":
	         if (%task.targetObject.team == %client.team)
					%completed = true;
	      case "FlagGrab":
				if (!%task.targetObject.isHome)
					%completed = true;
	      case "FlagDropped":
				if ((%task.targetObject.isHome) || (%task.targetObject.carrier !$= ""))
					%completed = true;
	      case "FlagCapture":
				if (%task.targetObject.carrier != %client.player)
					%completed = true;
		}
		if (%completed)
		{
	      AIUnassignClient(%client);
	      Game.AIChooseGameObjective(%client);
			return;
		}
	}

	if (%task.mode $= "FlagCapture")
	{
		%homeFlag = $AITeamFlag[%client.team];

		//if we're within range of the flag's home position, and the flag isn't home, start idling...
		if (VectorDist(%client.player.position, %touchPos) < 40 && !%homeFlag.isHome)
		{
	   	if (%client.getStepName() !$= "AIStepIdlePatrol")
				%client.stepIdle(%touchPos);
		}
		else
		   %client.stepMove(%touchPos, 0.25);
	}
	else
	   %client.stepMove(%touchPos, 0.25);

	if (VectorDist(%client.player.position, %touchPos) < 10)
	{
		//dissolve the human control link
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
	}

   //see if we're supposed to be engaging anyone...
   if (!AIClientIsAlive(%client.getEngageTarget()) && AIClientIsAlive(%client.shouldEngage))
      %client.setEngageTarget(%client.shouldEngage);
}

//------------------------------

function AIEscortPlayer::initFromObjective(%task, %objective, %client)
{
   %task.baseWeight = %client.objectiveWeight;
   %task.targetClient = %objective.targetClientId;
   %task.equipment = %objective.equipment;
	%task.buyEquipmentSet = %objective.buyEquipmentSet;
	%task.desiredEquipment = %objective.desiredEquipment;
	%task.issuedByClient = %objective.issuedByClientId;
	%task.forceClient = %objective.forceClientId;
}

function AIEscortPlayer::assume(%task, %client)
{
   %task.setWeightFreq(15);
   %task.setMonitorFreq(15);
	%task.rangedTarget = false;
	if (%task == %client.objectiveTask && %client == %task.forceClient && %task.issuedByClient == %task.targetClient)
	{
	   %client.needEquipment = false;
      %client.mountVehicle = false;
	}
	else
	{
	   %client.needEquipment = AINeedEquipment(%task.equipment, %client);
		if (! %client.needEquipment)
		   %client.stepEscort(%task.targetClient);

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
				%targPos = %task.targetClient.player.getWorldBoxCenter();
				%distToTarg = %client.getPathDistance(%targPos);
				
				if (%closestDist < 50 && (%distToTarg < 0 || %distToTarg > 100))
					%client.needEquipment = true;
			}
		}
	}

	//mark the current time for the buy inventory state machine
	%task.buyInvTime = getSimTime();
}

function AIEscortPlayer::retire(%task, %client)
{
	%client.clearStep();
   if(%client.player.isMounted())
      AIDisembarkVehicle(%client);

	//clear the target object
	%client.setTargetObject(-1);
}

function AIEscortPlayer::weight(%task, %client)
{
	//update the task weight
	if (%task == %client.objectiveTask)
		%task.baseWeight = %client.objectiveWeight;

   //make sure we still have someone to escort
   if (!AiClientIsAlive(%task.targetClient))
   {
		%task.setWeight(0);
      return;
   }

   //always shoot at the closest person to the client being escorted
   %targetPos = %task.targetClient.player.getWorldBoxCenter();
   %losTimeout = $AIClientMinLOSTime + ($AIClientLOSTimeout * %client.getSkillLevel());
	%result = AIFindClosestEnemyToLoc(%client, %targetPos, 50, %losTimeout);
   %task.engageTarget = getWord(%result, 0);
   if (!AIClientIsAlive(%task.engageTarget))
   {
      if (AIClientIsAlive(%task.targetClient.lastDamageClient, %losTimeout) && getSimTime() - %task.targetClient.lastDamageTime < %losTimeout)
         %task.engageTarget = %task.targetClient.lastDamageClient;
   }
   if (!AIClientIsAlive(%task.engageTarget))
   {
      %myPos = %client.player.getWorldBoxCenter();
		%result = AIFindClosestEnemy(%client, 50, %losTimeout);
      %task.engageTarget = getWord(%result, 0);
   }

	//if both us and the person we're escorting are in a vehicle, set the weight high!
	if (%task.targetClient.player.isMounted() && %client.player.isMounted())
	{
		%vehicle = %client.vehicleMounted;
		if (%vehicle > 0 && isObject(%vehicle) && %vehicle.getDamagePercent() < 0.8)
			%task.setWeight($AIWeightVehicleMountedEscort);
		else
		   %task.setWeight(%task.baseWeight);
	}
	else
	   %task.setWeight(%task.baseWeight);

	//find out if our escortee is lazing a target... 
	%task.missileTarget = -1;
	%targetCount = ServerTargetSet.getCount();
	for (%i = 0; %i < %targetCount; %i++)
	{
		%targ = ServerTargetSet.getObject(%i);
		if (%targ.sourceObject == %task.targetClient.player)
		{
			//find out which item is being targetted...
			%targPoint = %targ.getTargetPoint();
		   InitContainerRadiusSearch(%targPoint, 10, $TypeMasks::TurretObjectType | $TypeMasks::StaticShapeObjectType);
		   %task.missileTarget = containerSearchNext();
			break;
		}
	}
}

function AIEscortPlayer::monitor(%task, %client)
{
   //make sure we still have someone to escort
   if (!AiClientIsAlive(%task.targetClient))
   {
	   if (%task == %client.objectiveTask)
	   {
	      AIUnassignClient(%client);
	      Game.AIChooseGameObjective(%client);
	   }
      return;
   }

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
			return;
		else if (%result $= "Finished")
		{
		   %task.setMonitorFreq(15);
			%client.needEquipment = false;
		   %client.stepEscort(%task.targetClient);
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
   
	//see if our target is mounted in a vehicle...
	if (%task.targetClient.player.isMounted())
	{
		//find the passenger seat the bot will take
		%vehicle = %task.targetClient.vehicleMounted;
		%node = findAIEmptySeat(%vehicle, %client.player);

		//make sure there is an empty seat
		if (%node < 0 && %client.vehicleMounted != %task.targetClient.vehicleMounted)
		{
	      if (%task == %client.objectiveTask)
	      {
	         AIUnassignClient(%client);
	         Game.AIChooseGameObjective(%client);
	      }
			return;
		}

		//find the passenger seat location...
		%slotPosition = %vehicle.getSlotTransform(%node);

		//make sure we're in the correct armor - assault tanks cannot have a heavy...
		if (%task.targetClient.vehicleMounted.getDataBlock().getName() $= "AssaultVehicle")
		{
			//if the bot is in a heavy, break off the escort...
			if (%client.player.getArmorSize() $= "Heavy")
			{
		      if (%task == %client.objectiveTask)
		      {
		         AIUnassignClient(%client);
		         Game.AIChooseGameObjective(%client);
		      }
				return;
			}

			//throw away any packs that won't fit
			if (%client.player.getInventory(InventoryDeployable) > 0)
				%client.player.throwPack();
			else if (%client.player.getInventory(TurretIndoorDeployable) > 0)
				%client.player.throwPack();
			else if (%client.player.getInventory(TurretOutdoorDeployable) > 0)
				%client.player.throwPack();
		}
		
		if (%client.player.isMounted())
		{
			//make sure it's the same vehicle :)
			if (%client.vehicleMounted != %vehicle)
				AIDisembarkVehicle(%client);
		}
		else
		{
			//mount the vehicle
			%client.stepMove(%slotPosition, 0.25, $AIModeMountVehicle);
		}
	}
	else
	{
		//disembark if we're mounted, but our target isn't (anymore)
		if (%client.player.isMounted())
			AIDisembarkVehicle(%client);
	}
   
	//see if we're supposed to be mortaring/missiling something...
   %hasMortar = (%client.player.getInventory("Mortar") > 0) && (%client.player.getInventory("MortarAmmo") > 0);
   %hasMissile = (%client.player.getInventory("MissileLauncher") > 0) && (%client.player.getInventory("MissileLauncherAmmo") > 0);
   if (!isObject(%task.engageTarget) && isobject(%task.missileTarget) && %task.missileTarget.getDamageState() !$= "Destroyed" && (%hasMortar || %hasMissile))
	{
		if (%task.rangedTarget)
		{
			%client.stop();
			%client.clearStep();
			%client.setEngageTarget(-1);
			if (%hasMortar)
            %client.setTargetObject(%task.missileTarget, 250, "Mortar");
			else
				%client.setTargetObject(%task.missileTarget, 500, "MissileNoLock");
		}
		else if (%client.getStepName() !$= "AIStepRangeObject")
		{
			if (%hasMortar)
	         %client.stepRangeObject(%task.missileTarget, "MortarShot", 100, 200);
			else
				%client.stepRangeObject(%task.missileTarget, "BasicTargeter", 50, 500);
		}
		else if (%client.getStepStatus() $= "Finished")
			%task.rangedTarget = true;
	}
	else
	{
		%task.rangedTarget = false;
		%client.setTargetObject(-1);
	   if (%client.getStepName() !$= "AIStepEscort")
			%client.stepEscort(%task.targetClient);
	}

   //make sure we're still shooting...
   %client.setEngageTarget(%task.engageTarget);

   //see if we're supposed to be engaging anyone...
   if (!AIClientIsAlive(%client.getEngageTarget()) && AIClientIsAlive(%client.shouldEngage))
      %client.setEngageTarget(%client.shouldEngage);
}

//------------------------------

function AIAttackObject::initFromObjective(%task, %objective, %client)
{
   %task.baseWeight = %client.objectiveWeight;
   %task.targetObject = %objective.targetObjectId;
   %task.equipment = %objective.equipment;
	%task.buyEquipmentSet = %objective.buyEquipmentSet;
	%task.desiredEquipment = %objective.desiredEquipment;
	%task.issuedByClient = %objective.issuedByClientId;

	//initialize other task vars
	%task.sendMsg = true;
	%task.sendMsgTime = 0;
}

function AIAttackObject::assume(%task, %client)
{
   %task.setWeightFreq(15);
   %task.setMonitorFreq(5);
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
			
			if (%distToObject < 0 || %closestDist < %distToObject)
				%client.needEquipment = true;
		}
	}

	//mark the current time for the buy inventory state machine
	%task.buyInvTime = getSimTime();
}

function AIAttackObject::retire(%task, %client)
{
   %client.setTargetObject(-1);
}

function AIAttackObject::weight(%task, %client)
{
	//update the task weight
	if (%task == %client.objectiveTask)
		%task.baseWeight = %client.objectiveWeight;

   //let the monitor decide when to stop attacking
   %task.setWeight(%task.baseWeight);
}

function AIAttackObject::monitor(%task, %client)
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
			return;
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

   //set the target object
   if (isObject(%task.targetObject) && %task.targetObject.getDamageState() !$= "Destroyed")
   {
      %client.setTargetObject(%task.targetObject, 40, "Destroy");
   
      //move towards the object until we're within range
      if (! %client.targetInRange())
         %client.stepMove(%task.targetObject.getWorldBoxCenter(), 8.0);
      else
		{
			//dissolve the human control link
			if (%task == %client.objectiveTask)
				aiReleaseHumanControl(%client.controlByHuman, %client);

         %client.stop();
		}
   }
   else
   {
      %client.setTargetObject(-1);
      %client.stop();
      
      //if this task is the objective task, choose a new objective
      if (%task == %client.objectiveTask)
      {
         AIUnassignClient(%client);
         Game.AIChooseGameObjective(%client);
      }
   }
}

//------------------------------

function AIRepairObject::initFromObjective(%task, %objective, %client)
{
   %task.baseWeight = %client.objectiveWeight;
   %task.targetObject = %objective.targetObjectId;
	//need to force this objective to only require a repair pack
   //%task.equipment = %objective.equipment;
   %task.equipment = "RepairPack";
	%task.buyEquipmentSet = %objective.buyEquipmentSet;
	%task.desiredEquipment = %objective.desiredEquipment;
	%task.issuedByClient = %objective.issuedByClientId;

	%task.deployed = %objective.deployed;
	if (%task.deployed)
	{
		%task.location = %objective.position;
		%task.deployDirection = MatrixMulVector("0 0 0 " @ getWords(%objective.getTransform(), 3, 6), "0 1 0");
		%task.deployDirection = VectorNormalize(%task.deployDirection);
	}
}

function AIRepairObject::assume(%task, %client)
{
   %task.setWeightFreq(15);
   %task.setMonitorFreq(15);
   %client.needEquipment = AINeedEquipment(%task.equipment, %client);
   
   //clear the target object, and range it
   %client.setTargetObject(-1);
	if (! %client.needEquipment)
	{
		if (%task.deployed)
		{
		   %task.repairLocation = VectorAdd(%task.location,VectorScale(%task.deployDirection, -4.0));
			%client.stepMove(%task.repairLocation, 0.25);
		}
		else
		   %client.stepRangeObject(%task.targetObject, "DefaultRepairBeam", 3, 8);
	}

	//mark the current time for the buy inventory state machine
	%task.buyInvTime = getSimTime();
	%task.needToRangeTime = 0;
	%task.pickupRepairPack = -1;
	%task.usingInv = false;

	//set a tag to help the repairPack.cs script fudge acquiring a target
	%client.repairObject = %task.targetObject;
}

function AIRepairObject::retire(%task, %client)
{
   %client.setTargetObject(-1);
	%client.repairObject = -1;
}

function AIRepairObject::weight(%task, %client)
{
	//update the task weight
	if (%task == %client.objectiveTask)
		%task.baseWeight = %client.objectiveWeight;

   //let the monitor decide when to stop repairing
   %task.setWeight(%task.baseWeight);
}

function AIRepairObject::monitor(%task, %client)
{
   //first, buy the equipment
   if (%client.needEquipment)
   {
	   %task.setMonitorFreq(5);

		//first, see if we still need a repair pack
		if (%client.player.getInventory(RepairPack) > 0)
		{
			%client.needEquipment = false;
		   %task.setMonitorFreq(15);

			//if this is to repair a deployed object, walk to the deploy point...
			if (%task.deployed)
			{
			   %task.repairLocation = VectorAdd(%task.location,VectorScale(%task.deployDirection, -4.0));
				%client.stepMove(%task.repairLocation, 0.25);
			}
			//otherwise, we'll need to range it...
			else
			   %client.stepRangeObject(%task.targetObject, "DefaultRepairBeam", 3, 8);
		}
		else
		{
			// check to see if there's a repair pack nearby
			%closestRepairPack = -1;
			%closestRepairDist = 32767;

			//search the AIItemSet for a repair pack (someone might have dropped one...)
			%itemCount = $AIItemSet.getCount();
			for (%i = 0; %i < %itemCount; %i++)
			{
				%item = $AIItemSet.getObject(%i);
				if (%item.getDataBlock().getName() $= "RepairPack" && !%item.isHidden())
				{
					%dist = %client.getPathDistance(%item.getWorldBoxCenter());
					if (%dist > 0 && %dist < %closestRepairDist)
					{
						%closestRepairPack = %item;
						%closestRepairDist = %dist;
					}
				}
			}

			//choose whether we're picking up the closest pack, or buying from an inv station...
			if ((isObject(%closestRepairPack) && %closestRepairPack != %task.pickupRepairPack) || (%task.buyInvTime != %client.buyInvTime))
			{
				%task.pickupRepairPack = %closestRepairPack;

				//initialize the inv buying
				%task.buyInvTime = getSimTime();
				AIBuyInventory(%client, "RepairPack", %task.buyEquipmentSet, %task.buyInvTime);

				//now decide which is closer
				if (isObject(%closestRepairPack))
				{
					if (isObject(%client.invToUse))
					{
						%dist = %client.getPathDistance(%item.position);
						if (%dist > %closestRepairDist)
							%task.usingInv = true;
						else
							%task.usingInv = false;
					}
					else
					%task.usingInv = false;
				}
				else
					%task.usingInv = true;
			}

			//now see if we found a closer repair pack
			if (!%task.usingInv)
			{
				%client.stepMove(%task.pickupRepairPack.position, 0.25);
				%distToPack = %client.getPathDistance(%task.pickupRepairPack.position);
				if (%distToPack < 10 && %client.player.getMountedImage($BackpackSlot) > 0)
					%client.player.throwPack();

				//and we're finished until we actually have a repair pack...
				return;
			}
			else
			{
		      %result = AIBuyInventory(%client, "RepairPack", %task.buyEquipmentSet, %task.buyInvTime);
				if (%result $= "InProgress")
					return;
				else if (%result $= "Finished")
				{
					%client.needEquipment = false;
				   %task.setMonitorFreq(15);

					//if this is to repair a deployed object, walk to the deploy point...
					if (%task.deployed)
					{
					   %task.repairLocation = VectorAdd(%task.location,VectorScale(%task.deployDirection, -4.0));
						%client.stepMove(%task.repairLocation, 0.25);
					}
					//otherwise, we'll need to range it...
					else
					   %client.stepRangeObject(%task.targetObject, "DefaultRepairBeam", 3, 8);
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
						AIMessageThreadTemplate("RepairBase", "ChatSelfRepairGenerator", %client, -1);
					else if (%type $= "StationVehicle")
						AIMessageThreadTemplate("RepairBase", "ChatSelfRepairVehicle", %client, -1);
					else if (%type $= "SensorLargePulse")
						AIMessageThreadTemplate("RepairBase", "ChatSelfRepairSensors", %client, -1);
					else if (%type $= "SensorMediumPulse")
						AIMessageThreadTemplate("RepairBase", "ChatSelfRepairSensors", %client, -1);
					else if (%type $= "TurretBaseLarge")
						AIMessageThreadTemplate("RepairBase", "ChatSelfRepairTurrets", %client, -1);
				}
			}
		}
	}

   //set the target object
   if (%task.targetObject.getDamagePercent() > 0)
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
      
		if (%task.deployed)
		{
			//see if we're within range of the deploy location
		   %clLoc = %client.player.position;
		   %distance = VectorDist(%clLoc, %task.repairLocation);
			%dist2D = VectorDist(%client.player.position, getWords(%task.repairLocation, 0, 1) SPC getWord(%client.player.position, 2));

			//set the aim when we get near the target...  this will be overwritten when we're actually trying to deploy
 			if (%distance < 10 && %dist2D < 10)
 		      %client.aimAt(%task.location, 1000);

			//see if we're at the deploy location
		   if ((%client.pathDistRemaining(20) > %distance + 0.25) || %dist2D > 0.3)
			{
	         %client.setTargetObject(-1);
		      %client.stepMove(%task.repairLocation, 0.25);
			}
			else
			{
				%client.stop();
	         %client.setTargetObject(%task.targetObject, 8.0, "Repair");
			}
		}
		else
		{
			%currentTime = getSimTime();
			if (%currentTime > %task.needToRangeTime)
			{
				//force a rangeObject every 10 seconds...
				%task.needToRangeTime = %currentTime + 6000;
				%client.setTargetObject(-1);
			   %client.stepRangeObject(%task.targetObject, "DefaultRepairBeam", 3, 8);
			}

	      //if we've ranged the object, start repairing, else unset the object
	      else if (%client.getStepStatus() $= "Finished")
			{
				//dissolve the human control link
				if (%task == %client.objectiveTask)
					aiReleaseHumanControl(%client.controlByHuman, %client);

	         %client.setTargetObject(%task.targetObject, 8.0, "Repair");
			}
	      else
	         %client.setTargetObject(-1);
		}
   }
   else
   {
      %client.setTargetObject(-1);
      
      //if this task is the objective task, choose a new objective
      if (%task == %client.objectiveTask)
		{
         AIUnassignClient(%client);
			Game.AIChooseGameObjective(%client);
		}
   }
}

//------------------------------

function AILazeObject::initFromObjective(%task, %objective, %client)
{
   %task.baseWeight = %client.objectiveWeight;
   %task.targetObject = %objective.targetObjectId;
   %task.equipment = %objective.equipment;
	%task.buyEquipmentSet = %objective.buyEquipmentSet;
	%task.desiredEquipment = %objective.desiredEquipment;
	%task.issuedByClient = %objective.issuedByClientId;
	%task.msgAck = true;
	%task.msgFire = true;
}

function AILazeObject::assume(%task, %client)
{
   %task.setWeightFreq(30);
   %task.setMonitorFreq(30);
   %client.needEquipment = AINeedEquipment(%task.equipment, %client);
   
   //clear the target object, and range it
   %client.setTargetObject(-1);
	if (! %client.needEquipment)
	   %client.stepRangeObject(%task.targetObject, "BasicTargeter", 80, 300, %task.issuedByClient.player.getWorldBoxCenter());

	//set up some task vars
	%task.celebrate = false;
	%task.waitTimerMS = 0;

	//mark the current time for the buy inventory state machine
	%task.buyInvTime = getSimTime();
}

function AILazeObject::retire(%task, %client)
{
   %client.setTargetObject(-1);
}

function AILazeObject::weight(%task, %client)
{
	//update the task weight
	if (%task == %client.objectiveTask)
		%task.baseWeight = %client.objectiveWeight;

   //let the monitor decide when to stop lazing
   %task.setWeight(%task.baseWeight);
}

function AILazeObject::monitor(%task, %client)
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
			return;
		else if (%result $= "Finished")
		{
		   %task.setMonitorFreq(30);
			%client.needEquipment = false;
		   %client.stepRangeObject(%task.targetObject, "BasicTargeter", 80, 300);
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
      
		//look to see if anyone else is also targetting...
		%foundTarget = false;
		%numTargets = ServerTargetSet.getCount();
		for (%i = 0; %i < %numTargets; %i++)
		{
			%targ = ServerTargetSet.getObject(%i);
			if (%targ.sourceObject != %client.player)
			{
				%targDist = VectorDist(%targ.getTargetPoint(), %task.targetObject.getWorldBoxCenter());
				if (%targDist < 10)
				{
					%foundTarget = true;
					break;
				}
			}
		}

		if (%foundTarget)
		{
	      //if this task is the objective task, choose a new objective
	      if (%task == %client.objectiveTask)
	         AIUnassignClient(%client);
		}

      else if (%client.getStepStatus() $= "Finished")
		{
			//dissolve the human control link
			if (%task == %client.objectiveTask)
				aiReleaseHumanControl(%client.controlByHuman, %client);

         %client.setTargetObject(%task.targetObject, 300, "Laze");
			%task.celebrate = true;
			%task.waitTimerMS = 0;

			//make sure we only say "fire..." once
			if (%task.msgFire)
			{
				AIMessageThread("FireOnTarget", %client, -1);
				%task.msgFire = false;
			}
		}
      else
		{
			%client.aimAt(%task.targetObject.getWorldBoxCenter(), 1000);
         %client.setTargetObject(-1);
		}
   }
   else
   {
      %client.setTargetObject(-1);

		if (%task.celebrate)
		{
			if (%task.waitTimerMS == 0)
			{
				//add in a "woohoo"!  :)
				//choose the animation range
				%minCel = 3;
				%maxCel = 8;

				//pick a random sound
				if (getRandom() > 0.25)
					%sound = "gbl.awesome";
				else if (getRandom() > 0.5)
					%sound = "gbl.thanks";
				else if (getRandom() > 0.75)
					%sound = "gbl.nice";
				else
					%sound = "gbl.rock";
			  	%randTime = mFloor(getRandom() * 500) + 1;
			   schedule(%randTime, %client, "AIPlayAnimSound", %client, %task.targetObject.getWorldBoxCenter(), %sound, %minCel, %maxCel, 0);

				//set the timer
            %task.waitTimerMS = getSimTime();
			}

			//else see if the celebration period is over
			else if (getSimTime() - %task.waitTimerMS > 3000)
				%task.celebrate = false;
		}
		else
		{
	      //if this task is the objective task, choose a new objective
	      if (%task == %client.objectiveTask)
			{
	         AIUnassignClient(%client);
				Game.AIChooseGameObjective(%client);
			}
		}
   }
}

//------------------------------

function AIMortarObject::initFromObjective(%task, %objective, %client)
{
   %task.baseWeight = %client.objectiveWeight;
   %task.targetObject = %objective.targetObjectId;
   %task.equipment = %objective.equipment;
	%task.buyEquipmentSet = %objective.buyEquipmentSet;
	%task.desiredEquipment = %objective.desiredEquipment;
	%task.issuedByClient = %objective.issuedByClientId;
	%task.mode = %task.targetObject.getDataBlock().getName();

	%task.sendMsgTime = 0;
	%task.sendMsg = true;
}

function AIMortarObject::assume(%task, %client)
{
   %task.setWeightFreq(30);
   %task.setMonitorFreq(30);
   %task.state = moveToRange;
   %task.waitForTargetter = true;
	%task.celebrate = false;
   %task.waitTimerMS = 0;
	%task.targetAcquired = false;
	%task.sayAcquired = true;
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
			
			if (%distToObject < 0 || %closestDist < %distToObject)
				%client.needEquipment = true;
		}
	}

	//mark the current time for the buy inventory state machine
	%task.buyInvTime = getSimTime();
}

function AIMortarObject::retire(%task, %client)
{
   %client.setTargetObject(-1);
   
   //remove the associated lazeObjective
   if (%task.targetterObjective)
   {
      AIClearObjective(%task.targetterObjective);
      %task.targetterObjective.delete();
      %task.targetterObjective = "";
   }
}

function AIMortarObject::weight(%task, %client)
{
	//update the task weight
	if (%task == %client.objectiveTask)
		%task.baseWeight = %client.objectiveWeight;

   //let the monitor decide when to stop mortaring
   %task.setWeight(%task.baseWeight);
}

function AIMortarObject::monitor(%task, %client)
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
			return;
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

   //make sure we still have something to destroy
   if (isObject(%task.targetObject) && %task.targetObject.getDamageState() !$= "Destroyed")
   {
      %clientPos = %client.player.getWorldBoxCenter();
      %targetPos = %task.targetObject.getWorldBoxCenter();
      %distance = %client.getPathDistance(%targetPos);
		if (%distance < 0)
			%distance = 32767;
      
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
      
      //next move to within 220 
      else if (%distance > 220)
      {
         %client.setTargetObject(-1);
         %client.stepMove(%task.targetObject.getWorldBoxCenter(), 15);
      }
      
      //now start ask for someone to laze the target, and start a 20 sec timer
      else if (%task.waitForTargetter)
      {
         //see if we've started the timer
         if (%task.waitTimerMS == 0)
         {
				//range the object
	         %client.stepRangeObject(%task.targetObject, "MortarShot", 100, 200);

            //now ask for a targeter...
				%targetType = %task.targetObject.getDataBlock().getName();
				if (%targetType $= "TurretBaseLarge")
					AIMessageThread("ChatCmdTargetTurret", %client, -1);
				else if (%targetType $= "SensorLargePulse")
					AIMessageThread("ChatCmdTargetSensors", %client, -1);
				else if (%targetType $= "SensorMediumPulse")
					AIMessageThread("ChatCmdTargetSensors", %client, -1);
				else
					AIMessageThread("ChatNeedTarget", %client, -1);

            %task.waitTimerMS = getSimTime();

            //create the objective
				if (! %task.targetterObjective)
				{
	            %task.targetterObjective = new AIObjective(AIOLazeObject)
	                              {
										      dataBlock = "AIObjectiveMarker";
	                                 weightLevel1 = $AIWeightLazeObject[1];
	                                 weightLevel2 = $AIWeightLazeObject[2];
	                                 description = "Laze the " @ %task.targetObject.getName();
	                                 targetObjectId = %task.targetObject;
												issuedByClientId = %client;
	                                 offense = true;
	                                 equipment = "TargetingLaser";
	                              };
			      MissionCleanup.add(%task.targetterObjective);
	            $ObjectiveQ[%client.team].add(%task.targetterObjective);
				}
				%task.targetterObjective.lastLazedTime = 0;

				//remove the escort (want a targetter instead)
				if (%client.escort)
				{
			      AIClearObjective(%client.escort);
			      %client.escort.delete();
			      %client.escort = "";
				}
         }									
         else
         {
            %elapsedTime = getSimTime() - %task.waitTimerMS;
				if (%task.targetterObjective.group > 0)
					%targetter = %task.targetterObjective.group.clientLevel[1];
				else
	            %targetter = %task.targetterObjective.clientLevel[1];

				//see if we can find a target near our objective
				%task.targetAcquired = false;
				%numTargets = ServerTargetSet.getCount();
				for (%i = 0; %i < %numTargets; %i++)
				{
					%targ = ServerTargetSet.getObject(%i);
					%targDist = VectorDist(%targ.getTargetPoint(), %task.targetObject.getWorldBoxCenter());
					if (%targDist < 20)
					{
						%task.targetAcquired = true;
						break;
					}
				}

				if (%task.targetAcquired)
            {
               %task.waitForTargetter = false;
					%task.waitTimerMS = 0;
					%task.celebrate = true;
					%task.sayAcquired = false;
					AIMessageThread("ChatTargetAcquired", %client, -1);
            }

				//else see if we've run out of time
				else if ((! %targetter || ! %targetter.isAIControlled()) && %elapsedTime > 20000)
				{
               %task.waitForTargetter = false;
					%task.waitTimerMS = 0;
					%task.celebrate = true;
				}  
         }
      }
      
      //now we should finally be attacking with or without a targetter
      //eventually, the target will be destroyed, or we'll run out of ammo...
      else
      {
			//dissolve the human control link
			if (%task == %client.objectiveTask)
				aiReleaseHumanControl(%client.controlByHuman, %client);

			//see if we didn't acquired a spotter along the way
			if (%task.targetterObjective.group > 0)
	         %targetter = %task.targetterObjective.group.clientLevel[1];
			else
	         %targetter = %task.targetterObjective.clientLevel[1];
			if (! %task.targetAcquired && AIClientIsAlive(%targetter) && %targetter.isAIControlled())
			{
				%client.setTargetObject(-1);
		      %task.waitForTargetter = true;
			}
			else
			{
				//see if we can find a target near our objective
				if (! %task.targetAcquired)
				{
					%numTargets = ServerTargetSet.getCount();
					for (%i = 0; %i < %numTargets; %i++)
					{
						%targ = ServerTargetSet.getObject(%i);
						%targDist = VectorDist(%targ.getTargetPoint(), %task.targetObject.getWorldBoxCenter());
						if (%targDist < 20)
						{
							%task.targetAcquired = true;
							break;
						}
					}
					//see if we found a target (must be by a human)
					if (%task.targetAcquired && %task.sayAcquired)
					{
						%task.sayAcquired = false;
						AIMessageThread("ChatTargetAcquired", %client, -1);
					}
				}
				
	         //set the target object, and keep attacking it
	         if (%client.getStepStatus() $= "Finished")
	            %client.setTargetObject(%task.targetObject, 250, "Mortar");
	         else
	            %client.setTargetObject(-1);
			}
      }
   }

	//the target must have been destroyed  :)
   else
   {
		//dissolve the human control link
		if (%task == %client.objectiveTask)
			aiReleaseHumanControl(%client.controlByHuman, %client);

      %client.setTargetObject(-1);
      %client.clearStep();
      %client.stop();

		if (%task.celebrate)
		{
			if (%task.waitTimerMS == 0)
			{
				//client animation "woohoo"!  :)
				//choose the animation range
				%minCel = 3;
				%maxCel = 8;

				//pick a random sound
				if (getRandom() > 0.25)
					%sound = "gbl.awesome";
				else if (getRandom() > 0.5)
					%sound = "gbl.thanks";
				else if (getRandom() > 0.75)
					%sound = "gbl.nice";
				else
					%sound = "gbl.rock";
			  	%randTime = mFloor(getRandom() * 500) + 1;
			   schedule(%randTime, %client, "AIPlayAnimSound", %client, %task.targetObject.getWorldBoxCenter(), %sound, %minCel, %maxCel, 0);

				//team message
				AIMessageThread("ChatEnemyTurretsDestroyed", %client, -1);

				//set the timer
            %task.waitTimerMS = getSimTime();
			}

			//else see if the celebration period is over
			else if (getSimTime() - %task.waitTimerMS > 3000)
				%task.celebrate = false;
		}
		else
		{
	      //if this task is the objective task, choose a new objective
	      if (%task == %client.objectiveTask)
			{
	         AIUnassignClient(%client);
				Game.AIChooseGameObjective(%client);
			}
		}
   }
}

//------------------------------

function AIDeployEquipment::initFromObjective(%task, %objective, %client)
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

function AIDeployEquipment::assume(%task, %client)
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

function AIDeployEquipment::retire(%task, %client)
{
}

function AIDeployEquipment::weight(%task, %client)
{
	//update the task weight
	if (%task == %client.objectiveTask)
		%task.baseWeight = %client.objectiveWeight;

   %task.setWeight(%task.baseWeight);
}

function findTurretDeployPoint(%client, %location, %attempt)
{
   %player = %client.player;
	if (!isObject(%player))
		return "0 0 0";

	%feetPos = posFromTransform(%player.getTransform());
	%temp = VectorSub(%location, %feetPos);
   %temp2 = getWord(%temp, 0) @ " " @ getWord(%temp, 1) @ " 0";
	%facingVector = VectorNormalize(%temp2);
	%aimPoint = VectorAdd(%feetPos, %facingVector);
	//assume that there will be 10 attempts
	%height = getWord(%location, 2) + 1.0 - (0.2 * %attempt);
   %aimAt = getWord(%aimPoint, 0) @ " " @ getWord(%aimPoint, 1) @ " " @ %height;
   return %aimAt;
}

function AIDeployEquipment::monitor(%task, %client)
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
			return;
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
	%factor = -1 * (3 - (%task.passes * 0.5));
   %task.deployFromLocation = VectorAdd(%task.location,VectorScale(%task.deployDirection, %factor));

	//see if we're within range of the deploy location
   %clLoc = %client.player.position;
   %distance = VectorDist(%clLoc, %task.deployFromLocation);
	%dist2D = VectorDist(%client.player.position, getWords(%task.deployFromLocation, 0, 1) SPC getWord(%client.player.position, 2));

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
   
	if (%task.deployAttempts < 10 && %task.passes < 5 && !AIClientIsAlive(%client.getEngageTarget()))
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

			//try to deploy the backpack
			%client.deployPack = true;
         %client.lastDeployedObject = -1;
         %client.player.use(Backpack);
         
         // check if pack deployed
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
						AIClearObjective(%objective.repairObjective);
						%objective.repairObjective.delete();
						%objective.repairObjective = "";
					}

					//add the repair objective
	            %objective.repairObjective = new AIObjective(AIORepairObject)
		                              {
											      dataBlock = "AIObjectiveMarker";
		                                 weightLevel1 = %objective.weightLevel1 - 60;
		                                 weightLevel2 = 0;
		                                 description = "Repair the " @ %deployedObject.getDataBlock().getName();
													targetObjectId = %deployedObject;
													issuedByClientId = %client;
		                                 offense = false;
													defense = true;
		                                 equipment = "RepairPack";
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
	   InitContainerRadiusSearch(%task.location, 4, $TypeMasks::MoveableObjectType | $TypeMasks::VehicleObjectType |
																					                      $TypeMasks::PlayerObjectType);
	   %objSrch = containerSearchNext();
		if (%objSrch == %client.player)
		   %objSrch = containerSearchNext();
	   if (%objSrch)
			AIMessageThread("ChatMove", %client, -1);
	}
	else if (%task.waitMove < 5 && %task.passes < 5)
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
				%client.deployPack = true;
	         %client.player.use(Backpack);

	         // check if pack deployed
	         if(%client.player.getMountedImage($BackpackSlot) == 0)
				{
					//don't add a "repairObject" objective for ceiling turrets
					if (%task == %client.objectiveTask)
					{
						AIUnassignClient(%client);
						Game.AIChooseGameObjective(%client);
					}
				}
			}
		}
	}
	else
	{
		//find a new assignment - and remove this one from the Queue
      if (%task == %client.objectiveTask)
		{
			error(%client SPC "from team" SPC %client.team SPC "is invalidating objective:" SPC %client.objective SPC "UNABLE TO DEPLOY EQUIPMENT");
			%client.objective.isInvalid = true;
	      AIUnassignClient(%client);
			Game.AIChooseGameObjective(%client);
		}
	}
}

//------------------------------
//AI Objective functions
function ClientHasAffinity(%objective, %client)
{
   if (%objective.offense && %client.offense)
      return true;
   else if (%objective.defense && !%client.offense)
      return true;
   else
      return false;
}

function ClientHasRequiredEquipment(%objective, %client)
{
   return true;
}

function AIODefault::weight(%objective, %client, %level, %inventoryStr)
{
   //make sure the player is still alive!!!!!
   if (! AIClientIsAlive(%client))
      return 0;

   //set the base weight
   switch (%level)
   {
      case 1:
         %weight = %objective.weightLevel1;
      case 2:
         %weight = %objective.weightLevel2;
      case 3:
         %weight = %objective.weightLevel3;
      default:
         %weight = %objective.weightLevel4;
   }
   
   //check Affinity
   if (ClientHasAffinity(%objective, %client))
      %weight += 40;

	//if the objective doesn't require any equipment, it automatically get's the +100...
	if (%objective.equipment $= "" && %objective.desiredEquipment $= "")
		%weight += 100;
	else
	{
		//check equipment requirement
		%needEquipment = AINeedEquipment(%objective.equipment, %client);
	      
	   //check Required equipment
	   if (%objective.equipment !$= "" && !%needEquipment)
	      %weight += 100;

		//figure out the percentage of desired equipment the bot has
		else if (%objective.desiredEquipment !$= "")
		{
			%count = getWordCount(%objective.desiredEquipment);
			%itemCount = 0;
			for (%i = 0; %i < %count; %i++)
			{
				%item = getWord(%objective.desiredEquipment, %i);
				if (!AINeedEquipment(%item, %client))
					%itemCount++;
			}

			//add to the weight
			%weight += mFloor((%itemCount / %count) * 75);
		}
	}
      
   //find the distance to target
   if (%objective.targetClientId !$= "" || %objective.targetObjectId !$= "")
   {
      if (AIClientIsAlive(%objective.targetClientId))
      {   
         %targetPos = %objective.targetClientId.player.getWorldBoxCenter();
      }
      else if (VectorDist(%objective.location, "0 0 0") > 1)
         %targetPos = %objective.location;
      else
      {   
         if(%objective.targetObjectId > 0)
            %targetPos = %objective.targetObjectId.getWorldBoxCenter();
      }
   }

	//make sure the destination is accessible
   %distance = %client.getPathDistance(%targetPos);
	if (%distance < 0)
		return 0;

	%closestInvIsRemote = (getWordCount(%inventoryStr) == 4);
	%closestInv = getWord(%inventoryStr, 0);
	%closestDist = getWord(%inventoryStr, 1);
	%closestRemoteInv = getWord(%inventoryStr, 2);
	%closestRemoteDist = getWord(%inventoryStr, 3);
	
   //if we need equipment, the distance is from the client, to an inv, then to the target
 	if (%needEquipment)
 	{
		//if we need a regular inventory station, and one doesn't exist, exit
		if (!isObject(%closestInv) && %needArmor)
			return 0;

		//find the closest inv based on whether we require armor (from a regular inv station)
		if (!%closestInvIsRemote)
		{
			%needArmor = false;
			%weightDist = %closestDist;
			%weightInv = %closestInv;
		}
		else
		{
	 		%needArmor = AIMustUseRegularInvStation(%objective.equipment, %client);
			if (%needArmor)
			{
				%weightDist = %closestDist;
				%weightInv = %closestInv;
			}
			else
			{
				%weightDist = %closestRemoteDist;
				%weightInv = %closestRemoteInv;
			}
		}

		//if we don't need armor, and there's no inventory station, see if the equipment we need
		//is something we can pick up off the ground (likely this would be a repair pack...)
		if (%weightDist >= 32767)
		{
  			%itemType = getWord(%objective.equipment, 0);
  			%found = false;
  			%itemCount = $AIItemSet.getCount();
  			for (%i = 0; %i < %itemCount; %i++)
  			{
  				%item = $AIItemSet.getObject(%i);
  				if (%item.getDataBlock().getName() $= %itemType && !%item.isHidden())
  				{
					%weightDist = %client.getPathDistance(%item.getWorldBoxCenter());
					if (%weightDist > 0)
					{
						%weightInv = %item;  //set the var so the distance function will work...
	  					%found = true;
	  					break;
					}
  				}
  			}
  			if (! %found)
  				return 0;
  		}
 
		//now find the distance used for weighting the objective
		%tempDist = AIGetPathDistance(%targetPos, %weightInv.getWorldBoxCenter());
		if (%tempDist < 0)
			%tempDist = 32767;
		%distance = %weightDist + %tempDist;
 	}
   
   //see if we're within 200 m
   if (%distance < 200)
      %weight += 30;
      
   //see if we're within 90 m
   if (%distance < 90)
      %weight += 30;

   //see if we're within 45 m
   if (%distance < 45)
      %weight += 30;
      
   //see if we're within 20 m
   if (%distance < 20)
      %weight += 30;
   
   //final return, since we've made it through all the rest
   return %weight;
}

function AIODefault::QuickWeight(%objective, %client, %level, %minWeight)
{
	//can't do a quick weight when re-evaluating a client's current objective
	if (%client.objective == %objective)
		return true;

	//do a quick check to disqualify this objective if it can't meet the minimum weight
	switch (%level)
	{
	   case 1:
	      %testWeight = %objective.weightLevel1;
	   case 2:
	      %testWeight = %objective.weightLevel2;
	   case 3:
	      %testWeight = %objective.weightLevel3;
	   default:
	      %testWeight = %objective.weightLevel4;
	}
	if (%testWeight + 260 < %minWeight)
		return false;
	else
		return true;
}

//------------------------------

function AIODefendLocation::weight(%this, %client, %level, %minWeight, %inventoryStr)
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

		//else see if the object has been destroyed
	   else if (!isObject(%this.targetObjectId) || %this.targetObjectId.getDamageState() $= "Destroyed")
			%weight -= 320;
	}

	return %weight;
}

function AIODefendLocation::assignClient(%this, %client)
{
   %client.objectiveTask = %client.addTask(AIDefendLocation);
   %client.objectiveTask.initFromObjective(%this, %client);
}

function AIODefendLocation::unassignClient(%this, %client)
{
   %client.removeTask(%client.objectiveTask);
   %client.objectiveTask = "";
}

//------------------------------

function AIOAttackLocation::weight(%this, %client, %level, %minWeight, %inventoryStr)
{
   //make sure the player is still alive!!!!!
   if (! AIClientIsAlive(%client))
      return 0;
      
	//now, if this bot is linked to a human who has issued this command, up the weight
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

function AIOAttackLocation::assignClient(%this, %client)
{
   %client.objectiveTask = %client.addTask(AIAttackLocation);
   %client.objectiveTask.initFromObjective(%this, %client);
}

function AIOAttackLocation::unassignClient(%this, %client)
{
   %client.removeTask(%client.objectiveTask);
   %client.objectiveTask = "";
}

//------------------------------

function AIOTouchObject::weight(%this, %client, %level, %minWeight, %inventoryStr)
{
   //make sure the player is still alive!!!!!
   if (! AIClientIsAlive(%client))
      return 0;

	if (!AIODefault::QuickWeight(%this, %client, %level, %minWeight))
		return 0;

   switch$ (%this.mode)
   {
      case "TouchFlipFlop":
         if(%this.targetObjectId.team == %client.team || %this.targetObjectId.isHidden())
				return 0;
			else
				return AIODefault::weight(%this, %client, %level, %inventoryStr);
      case "FlagGrab":
			if (! %this.targetObjectId.isHome)
				return 0;
			else
	         return AIODefault::weight(%this, %client, %level, %inventoryStr);
      case "FlagDropped":
			if ((%this.targetObjectId.isHome) || (%this.targetObjectId.carrier !$= ""))
				return 0;
			else
	         return AIODefault::weight(%this, %client, %level, %inventoryStr);
      case "FlagCapture":
			if (%this.targetObjectId.carrier != %client.player)
            return 0;
         else
			{
				//find our home flag location
				%homeTeam = %client.team;
				%homeFlag = $AITeamFlag[%homeTeam];
				%this.location = %homeFlag.originalPosition;
				return AIODefault::weight(%this, %client, %level, %inventoryStr);
			}
   }
   return 0;
}

function AIOTouchObject::assignClient(%this, %client)
{
   %client.objectiveTask = %client.addTask(AITouchObject);
   %client.objectiveTask.initFromObjective(%this, %client);

   //create an AIOEscortPlayer objective to help out, if required
   if (%this.mode $= "FlagGrab")
   {
      %client.escort = new AIObjective(AIOEscortPlayer)
                        {
							      dataBlock = "AIObjectiveMarker";
                           weightLevel1 = $AIWeightEscortOffense[1];
                           weightLevel2 = $AIWeightEscortOffense[2];
                           description = "Escort " @ getTaggedString(%client.name);
                           targetClientId = %client;
                           offense = true;
									desiredEquipment = "EnergyPack";
									buyEquipmentSet = "LightEnergyELF";
                        };
      MissionCleanup.add(%client.escort);
      $ObjectiveQ[%client.team].add(%client.escort);
   }
   
   else if (%this.mode $= "FlagCapture")
   {
      %client.escort = new AIObjective(AIOEscortPlayer)
                        {
							      dataBlock = "AIObjectiveMarker";
                           weightLevel1 = $AIWeightEscortCapper[1];
                           weightLevel2 = $AIWeightEscortCapper[2];
                           description = "Escort " @ getTaggedString(%client.name);
                           targetClientId = %client;
                           offense = true;
									desiredEquipment = "EnergyPack";
									buyEquipmentSet = "LightEnergyDefault";
                        };
      MissionCleanup.add(%client.escort);
      $ObjectiveQ[%client.team].add(%client.escort);
   }
}

function AIOTouchObject::unassignClient(%this, %client)
{
   //kill the escort objective
   if (%client.escort)
   {
      AIClearObjective(%client.escort);
      %client.escort.delete();
      %client.escort = "";
   }
   
   %client.removeTask(%client.objectiveTask);
   %client.objectiveTask = "";
}

//------------------------------

function AIOAttackPlayer::weight(%this, %client, %level, %minWeight, %inventoryStr)
{
   //make sure the player is still alive!!!!!
   if (! AIClientIsAlive(%client))
      return 0;

	//if we're attacking the flag carrier, make sure a flag carrier exists
	if (%this.mode $= "FlagCarrier")
	{
		if (%this.targetObjectId.carrier $= "")
			return 0;
		else
			%this.targetClientId = %this.targetObjectId.carrier.client;
	}
      
	//now, if this bot is linked to a human who has issued this command, up the weight
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

function AIOAttackPlayer::assignClient(%this, %client)
{
   %client.objectiveTask = %client.addTask(AIAttackPlayer);
   %client.objectiveTask.initFromObjective(%this, %client);
}

function AIOAttackPlayer::unassignClient(%this, %client)
{
   %client.removeTask(%client.objectiveTask);
   %client.objectiveTask = "";
}

//------------------------------

function AIOEscortPlayer::weight(%this, %client, %level, %minWeight, %inventoryStr)
{
   //make sure the player is still alive!!!!!
   if (! AIClientIsAlive(%client) || ! AIClientIsAlive(%this.targetClientId))
      return 0;

   //can't escort yourself
   if (%client == %this.targetClientId)
      return 0;

	//make sure the class is appropriate
	if (%this.forceClientId <= 0 && %this.issuedByClientId != %client.controlByHuman)
	{
		%targArmor = %this.targetClientId.player.getArmorSize();
      %myArmor = %client.player.getArmorSize();
      
		if ((%targArmor $= "Light" && %myArmor !$= "Light") || %myArmor $= "Heavy")
	      return 0;
	}

	//can't bump a forced client from level 1
	if (%this.forceClientId > 0 && %this.forceClientId != %client && %level == 1)
      return 0;

	//if this bot is linked to a human who has issued this command, up the weight
	if (%this.issuedByClientId == %client.controlByHuman)
	{
		//make sure we have the potential to reach the minWeight
		if (!AIODefault::QuickWeight(%this, %client, %level, %minWeight))
		{
			if ($AIWeightHumanIssuedEscort < %minWeight)
				return 0;
			else
				%weight = $AIWeightHumanIssuedEscort;
		}
		else
		{
			// calculate the default...
			%weight = AIODefault::weight(%this, %client, %level, %inventoryStr);
			if (%weight < $AIWeightHumanIssuedEscort)
				%weight = $AIWeightHumanIssuedEscort;
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

function AIOEscortPlayer::assignClient(%this, %client)
{
   %client.objectiveTask = %client.addTask(AIEscortPlayer);
   %client.objectiveTask.initFromObjective(%this, %client);
}

function AIOEscortPlayer::unassignClient(%this, %client)
{
   %client.removeTask(%client.objectiveTask);
   %client.objectiveTask = "";
}

//------------------------------

function AIOAttackObject::weight(%this, %client, %level, %minWeight, %inventoryStr)
{
   // if were playing CnH, check who owns this
   if (!isObject(%this.targetObjectId) || %this.targetObjectId.isHidden() || %this.targetObjectId.team == %client.team)
      return 0;      
   
   //make sure the player is still alive!!!!!
   if (! AIClientIsAlive(%client))
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

function AIOAttackObject::assignClient(%this, %client)
{
   %client.objectiveTask = %client.addTask(AIAttackObject);
   %client.objectiveTask.initFromObjective(%this, %client);
}

function AIOAttackObject::unassignClient(%this, %client)
{
   %client.removeTask(%client.objectiveTask);
   %client.objectiveTask = "";
}

//------------------------------

function AIORepairObject::weight(%this, %client, %level, %minWeight, %inventoryStr)
{
   // if were playing CnH, check who owns this
   if (!isObject(%this.targetObjectId) || %this.targetObjectId.isHidden() || %this.targetObjectId.team != %client.team)
      return 0;      
   
   //make sure the player is still alive!!!!!
   if (! AIClientIsAlive(%client))
      return 0;
      
   //no need to repair if the object isn't in need
   if (!isObject(%this.targetObjectId) || %this.targetObjectId.getDamagePercent() <= 0)
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

function AIORepairObject::assignClient(%this, %client)
{
   %client.objectiveTask = %client.addTask(AIRepairObject);
   %client.objectiveTask.initFromObjective(%this, %client);
}

function AIORepairObject::unassignClient(%this, %client)
{
   %client.removeTask(%client.objectiveTask);
   %client.objectiveTask = "";
}

//------------------------------
   
function AIOLazeObject::weight(%this, %client, %level, %minWeight, %inventoryStr)
{
   //make sure the player is still alive!!!!!
   if (! AIClientIsAlive(%client))
      return 0;
      
	//see if it's already being lazed
	%numTargets = ServerTargetSet.getCount();
	for (%i = 0; %i < %numTargets; %i++)
	{
		%targ = ServerTargetSet.getObject(%i);
		if (%targ.sourceObject != %client.player)
		{
			%targDist = VectorDist(%targ.getTargetPoint(), %this.targetObjectId.getWorldBoxCenter());
			if (%targDist < 10)
			{
				%this.lastLazedTime = getSimTime();
				%this.lastLazedClient = %targ.sourceObject.client;
				break;
 			}
		}
	}

   //no need to laze if the object is already destroyed
   if (!isObject(%this.targetObjectId) || %this.targetObjectId.getDamageState() $= "Destroyed")
      return 0;
	else if (%this.targetObjectId.isHidden() || %this.targetObjectId.team != %client.team)
      return 0;      
	else if (getSimTime() - %this.lastLazedTime <= 15000 && %this.lastLazedClient != %client)
		return 0;
   else
	{
	   //set the base weight
	   switch (%level)
	   {
	      case 1:
	         %weight = %this.weightLevel1;
	      case 2:
	         %weight = %this.weightLevel2;
	      case 3:
	         %weight = %this.weightLevel3;
	      default:
	         %weight = %this.weightLevel4;
	   }
   
	   //check Affinity
	   if (ClientHasAffinity(%this, %client))
	      %weight += 100;
      
		//for now, do not deviate from the current assignment to laze a target, if you don't
		//already have a targeting laser.
		%needEquipment = AINeedEquipment(%this.equipment, %client);
		if (!%needEquipment)
			%weight += 100;
		else if (!aiHumanHasControl(%client.controlByHuman, %client))
			return 0;

		//see if this client is close to the issuing client
		if (%this.issuedByClientId > 0)
		{
			if (! AIClientIsAlive(%this.issuedByClientId))
				return 0;

		   %distance = %client.getPathDistance(%this.issuedByClientId.player.getWorldBoxCenter());
			if (%distance < 0)
				%distance = 32767;

		   //see if we're within 200 m
		   if (%distance < 200)
		      %weight += 30;

		   //see if we're within 90 m
		   if (%distance < 90)
		      %weight += 30;

		   //see if we're within 45 m
		   if (%distance < 45)
		      %weight += 30;
		}

		//now, if this bot is linked to a human who has issued this command, up the weight
		if (%this.issuedByClientId == %client.controlByHuman && %weight < $AIWeightHumanIssuedCommand)
			%weight = $AIWeightHumanIssuedCommand;

		return %weight;
	}
}

function AIOLazeObject::assignClient(%this, %client)
{
   %client.objectiveTask = %client.addTask(AILazeObject);
   %client.objectiveTask.initFromObjective(%this, %client);
}

function AIOLazeObject::unassignClient(%this, %client)
{
   %client.removeTask(%client.objectiveTask);
   %client.objectiveTask = "";
}

//------------------------------

function AIOMortarObject::weight(%this, %client, %level, %minWeight, %inventoryStr)
{
   // if were playing CnH, check who owns this
   if (!isObject(%this.targetObjectId) || %this.targetObjectId.isHidden() || %this.targetObjectId.team == %client.team)
      return 0;
   
   //make sure the player is still alive!!!!!
   if (! AIClientIsAlive(%client))
      return 0;
      
   //no need to attack if the object is already destroyed
   if (%this.targetObjectId.getDamageState() $= "Destroyed")
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

function AIOMortarObject::assignClient(%this, %client)
{
   %client.objectiveTask = %client.addTask(AIMortarObject);
   %client.objectiveTask.initFromObjective(%this, %client);
   
   //create the escort objective (require a targeting laser in this case...)
   %client.escort = new AIObjective(AIOEscortPlayer)
                     {
						      dataBlock = "AIObjectiveMarker";
                        weightLevel1 = $AIWeightEscortOffense[1];
                        weightLevel2 = $AIWeightEscortOffense[2];
                        description = "Escort " @ getTaggedString(%client.name);
                        targetClientId = %client;
                        offense = true;
                        equipment = "TargetingLaser";
								buyEquipmentSet = "LightEnergyDefault";
                     };
   MissionCleanup.add(%client.escort);
   $ObjectiveQ[%client.team].add(%client.escort);
}

function AIOMortarObject::unassignClient(%this, %client)
{
   //kill the escort objective
   if (%client.escort)
   {
      AIClearObjective(%client.escort);
      %client.escort.delete();
      %client.escort = "";
   }
   
   %client.removeTask(%client.objectiveTask);
   %client.objectiveTask = "";
}

//------------------------------------------------------------------------
//If the function ShapeBaseImageData::testInvalidDeployConditions() changes at all, those changes need to be reflected here
function AIODeployEquipment::weight(%this, %client, %level, %minWeight, %inventoryStr)
{
   //make sure the player is still alive!!!!!
   if (! AIClientIsAlive(%client))
      return 0;

	//make sure the deploy objective is valid
	if (%this.isInvalid)
		return 0;

	//first, make sure we haven't deployed too many...
 	if (%this.equipment $= "TurretOutdoorDeployable" || %this.equipment $= "TurretIndoorDeployable")
      %maxAllowed = countTurretsAllowed(%this.equipment);
   else
      %maxAllowed = $TeamDeployableMax[%this.equipment];

	if ($TeamDeployedCount[%client.team, %this.equipment] >= %maxAllowed)
		return 0;

	//now make sure there are no other items in the way...
  	InitContainerRadiusSearch(%this.location, $MinDeployableDistance, $TypeMasks::VehicleObjectType |
  	                                             $TypeMasks::MoveableObjectType |
  	                                             $TypeMasks::StaticShapeObjectType |
  	                                             $TypeMasks::TSStaticShapeObjectType | 
  	                                             $TypeMasks::ForceFieldObjectType |
  	                                             $TypeMasks::ItemObjectType | 
  	                                             $TypeMasks::PlayerObjectType | 
  	                                             $TypeMasks::TurretObjectType);
	%objSearch = containerSearchNext();

	//make sure we're not invalidating the deploy location with the client's own player object
	if (%objSearch == %client.player)
		%objSearch = containerSearchNext();

	//did we find an object which would block deploying the equipment?
	if (isObject(%objSearch))
		return 0;

 	//now run individual checks based on the equipment type...
 	if (%this.equipment $= "TurretIndoorDeployable")
 	{
 		//check if there's another turret close to the deploy location
 	   InitContainerRadiusSearch(%this.location, $TurretIndoorSpaceRadius, $TypeMasks::StaticShapeObjectType);
 	   %found = containerSearchNext();
 	   if (isObject(%found))
 	   {
 			%foundName = %found.getDataBlock().getName();
 			if ((%foundName $= TurretDeployedFloorIndoor) || (%foundName $= "TurretDeployedWallIndoor") || (%foundName $= "TurretDeployedCeilingIndoor") || (%foundName $= "TurretDeployedOutdoor"))
 				return 0;
 		}
 
 		//now see if there are too many turrets in the area...
 	   %highestDensity = 0;
 	   InitContainerRadiusSearch(%this.location, $TurretIndoorSphereRadius, $TypeMasks::StaticShapeObjectType);
 	   %found = containerSearchNext();
 	   while (isObject(%found))
 	   {
 	      %foundName = %found.getDataBlock().getName();
 	      if ((%foundName $= "TurretDeployedFloorIndoor") || (%foundName $= "TurretDeployedWallIndoor") || (%foundName $= "TurretDeployedCeilingIndoor") || (%foundName $= "TurretDeployedOutdoor"))
 	      {
 				//found one
 				%numTurretsNearby++;
 
 				%nearbyDensity = testNearbyDensity(%found, $TurretIndoorSphereRadius);
 				if (%nearbyDensity > %highestDensity)
 					%highestDensity = %nearbyDensity;     
 	      }
 			%found = containerSearchNext();
 	   }
 
 	   if (%numTurretsNearby > %highestDensity)
 	      %highestDensity = %numTurretsNearby;
 
 		//now see if the area is already saturated
 		if (%highestDensity > $TurretIndoorMaxPerSphere)
 			return 0;
 	}
 
 	else if (%this.equipment $= "TurretOutdoorDeployable")
 	{
 		//check if there's another turret close to the deploy location
 	   InitContainerRadiusSearch(%this.location, $TurretOutdoorSpaceRadius, $TypeMasks::StaticShapeObjectType);
 	   %found = containerSearchNext();
 	   if (isObject(%found))
 		{
 			%foundName = %found.getDataBlock().getName();     
 			if ((%foundName $= "TurretDeployedFloorIndoor") || (%foundName $= "TurretDeployedWallIndoor") || (%foundName $= "TurretDeployedCeilingIndoor") || (%foundName $= "TurretDeployedOutdoor"))
 				return 0;
 		}
 
 		//now see if there are too many turrets in the area...
 	   %highestDensity = 0;
 	   InitContainerRadiusSearch(%this.location, $TurretOutdoorSphereRadius, $TypeMasks::StaticShapeObjectType);
 	   %found = containerSearchNext();
 	   while (isObject(%found))
 	   {
 	      %foundName = %found.getDataBlock().getName();
 	      if ((%foundName $= "TurretDeployedFloorIndoor") || (%foundName $= "TurretDeployedWallIndoor") || (%foundName $= "TurretDeployedCeilingIndoor") || (%foundName $= "TurretDeployedOutdoor"))
 	      {
 				//found one
 				%numTurretsNearby++;
 
 				%nearbyDensity = testNearbyDensity(%found, $TurretOutdoorSphereRadius);
 				if (%nearbyDensity > %highestDensity)
 					%highestDensity = %nearbyDensity;     
 	      }
 	     %found = containerSearchNext();
 	   }
 
 		if (%numTurretsNearby > %highestDensity)
 			%highestDensity = %numTurretsNearby;
 
 		//now see if the area is already saturated
 		if (%highestDensity > $TurretOutdoorMaxPerSphere)
 			return 0;
 	}

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
 		if (%closestDist > 50 && VectorDist(%client.player.getWorldBoxCenter(), %task.location) < 50)
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

function AIODeployEquipment::assignClient(%this, %client)
{
   %client.objectiveTask = %client.addTask(AIDeployEquipment);
   %task = %client.objectiveTask;
   %task.initFromObjective(%this, %client);
}

function AIODeployEquipment::unassignClient(%this, %client)
{
   %client.removeTask(%client.objectiveTask);
   %client.objectiveTask = "";
}

//------------------------------------------------------------------------
