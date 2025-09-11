// bounty game support

function BountyGame::onAIRespawn(%game, %client)
{
   //add the default task
	if (! %client.defaultTasksAdded)
	{
		%client.defaultTasksAdded = true;
	   %client.addTask(AIPickupItemTask);                                             
	   %client.addTask(AIUseInventoryTask);
	   %client.addTask(AITauntCorpseTask);
		%client.addTask(AIEngageTurretTask);
		%client.addTask(AIDetectMineTask);
		%client.addTask(AIBountyPatrolTask);
		%client.bountyTask = %client.addTask(AIBountyEngageTask);
	}

   //set the inv flag
   %client.spawnUseInv = true;
}

function BountyGame::AIInit(%game)
{
   AIInit();
}

function BountyGame::aiBountyAssignTarget(%game, %client, %target)
{
	if (!isObject(%client.bountyTask))
		%client.bountyTask = %client.addTask(AIBountyEngageTask);
	%task = %client.bountyTask;

   %task.baseWeight = $AIWeightKillFlagCarrier[1];
	%task.buyEquipmentSet = "LightEnergySniper";
}

function AIBountyEngageTask::assume(%task, %client)
{
   %task.setWeightFreq(15);
   %task.setMonitorFreq(15);
}

function AIBountyEngageTask::retire(%task, %client)
{
	%client.setEngageTarget(-1);
}

function AIBountyEngageTask::weight(%task, %client)                              
{
   %player = %client.player;
	if (!isObject(%player))
		return;

   %clientPos = %player.getWorldBoxCenter();
   %client.shouldEngage = -1;

	//first, make sure we actually can fight
	if (AIEngageOutOfAmmo(%client))
	{
		%task.setWeight(0);
		return;
	}

	//see if anyone has fired on us recently...
   %mustEngage = false;
   %losTimeout = $AIClientMinLOSTime + ($AIClientLOSTimeout * %client.getSkillLevel());
   if (AIClientIsAlive(%client.lastDamageClient, %losTimeout) && getSimTime() - %client.lastDamageTime < %losTimeout)
   {
		//see if the attacker is either our target or, we are their target
		if (%client.lastDamageClient == %client.objectiveTarget || %client.lastDamageClient.objectiveTarget == %client)
		{
         %mustEngage = true;
			%currentTarget = %client.getEngageTarget();

			//see if this is a new attacker
			if (AIClientIsAlive(%currentTarget) && %currentTarget != %client.lastDamageClient)
			{
	         %targPos = %currentTarget.player.getWorldBoxCenter();
	         %curTargDist = %client.getPathDistance(%targPos);
	      
	         %newTargPos = %client.lastDamageClient.player.getWorldBoxCenter();
	         %newTargDist = %client.getPathDistance(%newTargPos);
	      
	         //see if the new targ is no more than 30 m further
	         if (%newTargDist > 0 && %newTargDist < %curTargDist + 30)
	            %client.shouldEngage = %client.lastDamageClient;
				else
					%client.shouldEngage = %currentTarget;
	      }
	      else
	         %client.shouldEngage = %client.lastDamageClient;
		}

		//otherwise we should run react to an attacker who is not really supposed to be attacking us...
		else
			%client.setDangerLocation(%client.player.position, 20);
	}

   //no one has fired at us recently, see if we're near our objective target...
   else
   {
		//see if we still have sight of the current target
		%hasLOS = %client.hasLOSToClient(%client.objectiveTarget);
		%losTime = %client.getClientLOSTime(%client.objectiveTarget);
		if (%hasLOS || %losTime < %losTimeout)
	      %client.shouldEngage = %client.objectiveTarget;
		else
			%client.shouldEngage = -1;
	}

	//now set the weight
	if (%client.shouldEngage > 0)
   {
      //if we've been fired upon...
      if (%mustEngage)
	      %task.setWeight($AIWeightReturnFire);

      //see if we can allow the bot to use an inv station...
      else if (%client.spawnUseInv)
      {
         //see if there's an available inv station
         %result = AIFindClosestInventory(%client, false);
         %closestInv = getWord(%result, 0);
	      %closestDist = getWord(%result, 1);
	      if (isObject(%closestInv))
         {
            if (isObject(%client.shouldEngage.player))
            {
               %dist = %client.getPathDistance(%client.shouldEngage.player.position);
               if (%dist < 70 || %closestDist > 200)
	               %task.setWeight($AIWeightReturnFire);
               else
	               %task.setWeight($AIBountyWeightShouldEngage);
            }
            else
	            %task.setWeight($AIBountyWeightShouldEngage);
         }
         else
         {
            %client.spawnUseInv = false;
	         %task.setWeight($AIWeightReturnFire);
         }
      }
      else
	      %task.setWeight($AIWeightReturnFire);
   }
	else
	   %task.setWeight(0);
}

function AIBountyEngageTask::monitor(%task, %client)
{
   if (AIClientIsAlive(%client.shouldEngage))
      %client.stepEngage(%client.shouldEngage);
}

//-----------------------------------------------------------------------------
//AIPatrolTask used to wander around the map (DM and Hunters mainly) looking for something to do...

function AIBountyPatrolTask::init(%task, %client)
{
}

function AIBountyPatrolTask::assume(%task, %client)
{
	%task.setWeightFreq(13);
	%task.setMonitorFreq(13);
	%task.findLocation = true;
	%task.patrolLocation = "0 0 0";
	%task.idleing = false;
	%task.idleEndTime = 0;
}

function AIBountyPatrolTask::retire(%task, %client)
{
}

function AIBountyPatrolTask::weight(%task, %client)
{
	%task.setWeight($AIWeightPatrolling);
}

function AIBountyPatrolTask::monitor(%task, %client)
{
	//this call works in conjunction with AIEngageTask
	%client.setEngageTarget(%client.shouldEngage);

	//see if we're close enough to our patrol point
	if (%task.idleing)
	{
		if (getSimTime() > %task.idleEndTime)
		{
			%task.findLocation = true;
			%task.idleing = false;
		}
	}

	//see if we need to find a place to go...
	else if (%task.findLocation)
	{
		//first, see if we're in need of either health, or ammo
		//note: normally, I'd be tempted to put this kind of "looking for health" code
		//into the AIPickupItemTask, however, that task will be used in CTF, where you
		//don't want people on AIDefendLocation to leave their post to hunt for health, etc...
		//AIPickupItemTask only deals with items within a 30m radius around the bot.
		//AIPatrolTask will move the bot to the vicinity of an item, then AIPickUpItemTask
		//will finish the job...
		%foundItemLocation = false;
		%damage = %client.player.getDamagePercent();
		if (%damage > 0.7)
		{
			//search for a health kit
			%closestHealth = AIFindSafeItem(%client, "Health");
			if (%closestHealth > 0)
			{
				%task.patrolLocation = %closestHealth.getWorldBoxCenter();
				%foundItemLocation = true;
			}
		}
		else if (AIEngageOutOfAmmo(%client))
		{
			//search for a Ammo or a weapon...
			%closestItem = AIFindSafeItem(%client, "Ammo");
			if (%closestItem > 0)
			{
				%task.patrolLocation = %closestItem.getWorldBoxCenter();
				%foundItemLocation = true;
			}
		}

		//now see if we don't really have good equipment...
		if (!%foundItemLocation && AIEngageWeaponRating(%client) < 20)
		{
			//search for any useful item
			%closestItem = AIFindSafeItem(%client, "Any");
			if (%closestItem > 0)
			{
				%task.patrolLocation = %closestItem.getWorldBoxCenter();
				%foundItemLocation = true;
			}
		}
		//choose a randomish location only if we're not in need of health or ammo
		if (!%foundItemLocation)
		{
			//find a random item/inventory in the map, and pick a spawn point near it...
			%pickGraphNode = false;
			%chooseSet = 0;
			if ($AIInvStationSet.getCount() > 0)
				%chooseSet = $AIInvStationSet;
			else if ($AIWeaponSet.getCount() > 0)
				%chooseSet = $AIWeaponSet;
			else if ($AIItemSet.getCount() > 0)
				%chooseSet = $AIItemSet;

			if (!%chooseSet)
				%pickGraphNode = true;

			//here we pick whether we choose a random map point, or a point based on an item...
			if (getRandom() < 0.3)
				%pickGraphNode = true;

			//here we decide whether we should choose a player location...  a bit of a cheat but
			//it's scaled by the bot skill level
			%pickPlayerLocation = false;
			%skill = %client.getSkillLevel();
			if (%skill < 1.0)
				%skill = %skill / 2.0;
			if (getRandom() < (%skill * %skill) && AIClientIsAlive(%client.objectiveTarget))
			{
				%task.patrolLocation = %client.objectiveTarget.player.getWorldBoxCenter();
				%pickGraphNode = false;
				%pickPlayerLocation = true;
			}
			
			if (!%pickGraphNode && !%pickPlayerLocation)
			{
				%itemCount = %chooseSet.getCount();
				%item = %chooseSet.getObject(getRandom() * (%itemCount - 0.1));
		      %nodeIndex = navGraph.randNode(%item.getWorldBoxCenter(), 10, true, true);
				if (%nodeIndex <= 0)
					%pickGraphNode = true;
				else
					%task.patrolLocation = navGraph.randNodeLoc(%nodeIndex);
			}

			//see if we failed above or have to pick just a random spot on the graph - use the spawn points...
			if (%pickGraphNode)
			{
			   %task.patrolLocation = Game.pickPlayerSpawn(%client, true);
				if (%task.patrolLocation == -1)
				{
					%client.stepIdle(%client.player.getWorldBoxCenter());
					return;
				}
			}
		}

		//now that we have a new location - move towards it
		%task.findLocation = false;
		%client.stepMove(%task.patrolLocation, 8.0);
	}

	//else we're on patrol - see if we're close to our destination
	else
	{
		%client.stepMove(%task.patrolLocation, 8.0);
		%distToDest = %client.getPathDistance(%task.patrolLocation);
		if (%distToDest > 0 && %distToDest < 10)
		{
			%task.idleing = true;
			%task.idleEndTime = 4000 + getSimTime() + (getRandom() * 6000);
			%client.stepIdle(%client.player.getWorldBoxCenter());
		}
	}
}

function aiB()
{
   exec("scripts/aiBountyGame");
}