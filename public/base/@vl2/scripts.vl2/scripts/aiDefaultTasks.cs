//All tasks for deathmatch, hunters, and tasks that coincide with the current objective task live here...

//Weights for tasks that override the objective task: must be between 4300 and 4700
$AIWeightVehicleMountedEscort	= 4700;
$AIWeightReturnTurretFire		= 4675;
$AIWeightNeedItemBadly    		= 4650;
$AIWeightReturnFire        	= 4600;
$AIWeightDetectMine				= 4500;
$AIWeightTauntVictim        	= 4400;
$AIWeightNeedItem    			= 4350;
$AIWeightDestroyTurret			= 4300;

//Weights that allow the objective task to continue:  must be 3000 or less
$AIWeightFoundEnemy        	= 3000;
$AIWeightFoundItem    			= 2500;
$AIWeightFoundToughEnemy     	= 1000;
$AIWeightPatrolling        	= 2000;

//Hunters weights...
$AIHuntersWeightMustCap			= 4690;
$AIHuntersWeightNeedHealth		= 4625;
$AIHuntersWeightShouldCap		= 4425;
$AIHuntersWeightMustEngage		= 4450;
$AIHuntersWeightShouldEngage	= 4325;
$AIHuntersWeightPickupFlag		= 4425;

//Rabbit weights...
$AIRabbitWeightDefault			= 4625;
$AIRabbitWeightNeedInv			= 4325;

//Bounty weights...
$AIBountyWeightShouldEngage	= 4325;

//-----------------------------------------------------------------------------
//AIEngageTask is responsible for anything to do with engaging an enemy

function AIEngageWhoWillWin(%client1, %client2)
{
	//assume both clients are alive - gather some info
	if (%client1.isAIControlled())
		%skill1 = %client1.getSkillLevel();
	else
		%skill1 = 0.5;

	if (%client2.isAIControlled())
		%skill2 = %client2.getSkillLevel();
	else
		%skill2 = 0.5;

	%damage1 = %client1.player.getDamagePercent();
	%damage2 = %client2.player.getDamagePercent();

	//first compare health
	%tolerance1 = 0.5 + ((%skill1 - %skill2) * 0.3);
	%tolerance2 = 0.5 + ((%skill2 - %skill1) * 0.3);
	if (%damage1 - %damage2 > %tolerance1)
		return %client2;
	else if (%damage2 - %damage1 > %tolerance2)
		return %client1;

	//health not a problem, see how the equipment compares for the two...
	%weaponry1 = AIEngageWeaponRating(%client1);
	%weaponry2 = AIEngageWeaponRating(%client2);
	%effective = 20;
	if (%weaponry1 < %effective && %weaponry2 >= %effective)
		return %client2;
	else if (%weaponry1 >= %effective && %weaponry2 < %effective)
		return %client1;

	//no other criteria for now...  return -1 to indicate a tie...
	return -1;
}

function AIEngageTask::init(%task, %client)
{
}

function AIEngageTask::assume(%task, %client)
{
	%task.setWeightFreq(9);
	%task.setMonitorFreq(9);
	%task.searching = false;
	if (isObject(%client.shouldEngage.player))
		%task.searchLocation = %client.shouldEngage.player.getWorldBoxCenter();
}

function AIEngageTask::retire(%task, %client)
{
}

function AIEngageTask::weight(%task, %client)
{
   %player = %client.player;
	if (!isObject(%player))
		return;

   %clientPos = %player.getWorldBoxCenter();
   %currentTarget = %client.shouldEngage;
	if (!AIClientIsAlive(%currentTarget))
		%currentTarget = %client.getEngageTarget();
   %client.shouldEngage = -1;
	%mustEngage = false;
	%tougherEnemy = false;

	//first, make sure we actually can engage
	if (AIEngageOutOfAmmo(%client))
	{
		%client.shouldEngage = -1;
		%task.setWeight(0);
		return;
	}

	//see if anyone has fired on us recently...
   %losTimeout = $AIClientMinLOSTime + ($AIClientLOSTimeout * %client.getSkillLevel());
   if (AIClientIsAlive(%client.lastDamageClient, %losTimeout) && getSimTime() - %client.lastDamageTime < %losTimeout)
   {
      //see if we should turn on the new attacker
      if (AIClientIsAlive(%currentTarget))
      {
         %targPos = %currentTarget.player.getWorldBoxCenter();
         %curTargDist = %client.getPathDistance(%targPos);
      
         %newTargPos = %client.lastDamageClient.player.getWorldBoxCenter();
         %newTargDist = %client.getPathDistance(%newTargPos);
      
         //see if the new targ is no more than 30 m further
         if (%newTargDist > 0 && %newTargDist < %curTargDist + 30)
         {
            %client.shouldEngage = %client.lastDamageClient;
				%mustEngage = true;
         }
      }
      else
      {
         %client.shouldEngage = %client.lastDamageClient;
			%mustEngage = true;
      }
   }

   //no one has fired at us recently, see if we're near an enemy
   else
   {
		%result = AIFindClosestEnemy(%client, 100, %losTimeout);
      %closestEnemy = getWord(%result, 0);
      %closestdist = getWord(%result, 1);
      if (%closestEnemy > 0)
      {
         //see if we're right on top of them
         %targPos = %closestEnemy.player.getWorldBoxCenter();
         %dist = %client.getPathDistance(%targPos);
         
         if (%dist > 0 && %dist < 20)
         {
            %client.shouldEngage = %closestEnemy;
				%mustEngage = true;
         }
         
         //else choose them only if we're not already attacking someone
         else if (%currentTarget <= 0)
         {
            %client.shouldEngage = %closestEnemy;
				%mustEngage = false;

				//Make sure the odds are not overwhelmingly in favor of the enemy...
				if (AIEngageWhoWillWin(%client, %closestEnemy) == %closestEnemy)
					%tougherEnemy = true;
         }
      }
   }
   
   //if we still haven't found a new target, keep fighting the old one
   if (%client.shouldEngage <= 0)
   {
      if (AIClientIsAlive(%currentTarget))
		{
			//see if we still have sight of the current target
			%hasLOS = %client.hasLOSToClient(%currentTarget);
			%losTime = %client.getClientLOSTime(%currentTarget);
			if (%hasLOS || %losTime < %losTimeout)
		      %client.shouldEngage = %currentTarget;
			else
				%client.shouldEngage = -1;
		}
      else
			%client.shouldEngage = -1;
		%mustEngage = false;
   }

   //finally, set the weight
	if (%client.shouldEngage > 0)
	{
		if (%mustEngage)
		   %task.setWeight($AIWeightReturnFire);
		else if (%tougherEnemy)
		   %task.setWeight($AIWeightFoundToughEnemy);
		else
		   %task.setWeight($AIWeightFoundEnemy);
	}
	else
	   %task.setWeight(0);
}

function AIEngageTask::monitor(%task, %client)
{
	if (!AIClientIsAlive(%client.shouldEngage))
	{
		%client.stop();
		%client.clearStep();
		%client.setEngageTarget(-1);
		return;
	}

	%hasLOS = %client.hasLOSToClient(%client.shouldEngage);
	%losTime = %client.getClientLOSTime(%client.shouldEngage);
	//%detectLocation = %client.getDetectLocation(%client.shouldEngage);
	%detectPeriod = %client.getDetectPeriod();

	//if we can see the target, engage...
	if (%hasLOS || %losTime < %detectPeriod)
	{
		%client.stepEngage(%client.shouldEngage);
		%task.searching = false;
		%task.searchLocation = %client.shouldEngage.player.getWorldBoxCenter();
	}

	//else if we haven't for approx 5 sec...  move to the last known location
	else
	{
		//clear the engage target
		%client.setEngageTarget(-1);

		if (! %task.searching)
		{
			%dist = VectorDist(%client.player.getWorldBoxCenter(), %task.searchLocation);
			if (%dist < 4)
			{
				%client.stepIdle(%task.searchLocation);
				%task.searching = true;
			}
			else
				%client.stepMove(%task.searchLocation, 4.0);
		}
	}
}

//-----------------------------------------------------------------------------
//AIPickupItemTask is responsible for anything to do with picking up an item

function AIPickupItemTask::init(%task, %client)
{
}

function AIPickupItemTask::assume(%task, %client)
{
	%task.setWeightFreq(10);
	%task.setMonitorFreq(10);

	%task.pickUpItem = -1;
}

function AIPickupItemTask::retire(%task, %client)
{
}

function AIPickupItemTask::weight(%task, %client)
{
	//if we're already picking up an item, make sure it's still valid, then keep the weight the same...
	if (%task.pickupItem > 0)
	{
		if (isObject(%task.pickupItem) && !%task.pickupItem.isHidden() && AICouldUseItem(%client, %task.pickupItem))
			return;
		else
			%task.pickupItem = -1;
	}

	//otherwise, search for objects
   //first, see if we can pick up health
	%player = %client.player;
	if (!isObject(%player))
		return;

	%damage = %player.getDamagePercent();
	%healthRad = %damage * 100;
	%closestHealth = -1;
	%closestHealthDist = %healthRad;
	%closestHealthLOS = false;
	%closestItem = -1;
	%closestItemDist = 32767;
	%closestItemLOS = false;

	//loop through the item list, looking for things to pick up
	%itemCount = $AIItemSet.getCount();
	for (%i = 0; %i < %itemCount; %i++)
	{
		%item = $AIItemSet.getObject(%i);
		if (!%item.isHidden())
		{
         %dist = %client.getPathDistance(%item.getWorldBoxCenter());
			if (((%item.getDataBlock().getName() $= "RepairKit" || %item.getDataBlock().getName() $= "RepairPatch") ||
                                                            (%item.isCorpse && %item.getInventory("RepairKit") > 0)) &&
                                                            %player.getInventory("RepairKit") <= 0 && %damage > 0.3)
			{
				if (%dist > 0 && %dist < %closestHealthDist)
				{
					%closestHealth = %item;
					%closestHealthDist = %dist;

					//check for LOS
				   %mask = $TypeMasks::TerrainObjectType | $TypeMasks::InteriorObjectType;
				   %closestHealthLOS = !containerRayCast(%client.player.getWorldBoxCenter(), %item.getWorldBoxCenter(), %mask, 0);
				}
			}
			else
			{
				//only pick up stuff within 35m
				if (%dist < 35)
				{
					if (AICouldUseItem(%client, %item))
					{
						if (%dist < %closestItemDist)
						{
							%closestItem = %item;
							%closestItemDist = %dist;

							//check for LOS
						   %mask = $TypeMasks::TerrainObjectType | $TypeMasks::InteriorObjectType;
						   %closestItemLOS = !containerRayCast(%client.player.getWorldBoxCenter(), %item.getWorldBoxCenter(), %mask, 0);
						}
					}
				}
			}
		}
	}

	//now set the weight
	if (%closestHealth > 0)
	{
		//only choose an item if it's at least 25 m closer than health...
		//and we're not engageing someone or not that badly in need
	   %currentTarget = %client.getEngageTarget();
		if (%closestItem > 0 && %closetItemDist < %closestHealthDist - 25 && (%damage < 0.6 || %currentTarget <= 0) && %closestItemLOS)
		{
			%task.pickupItem = %closestItem;
         if (AIEngageWeaponRating(%client) < 20)
				%task.setWeight($AIWeightNeedItemBadly);
			else if (%closestItemDist < 10 && %closestItemLOS)
				%task.setWeight($AIWeightNeedItem);
			else if (%closestItemLOS)
				%task.setWeight($AIWeightFoundItem);
			else
				%task.setWeight(0);
		}
		else
		{
			if (%damage > 0.8)
			{
				%task.pickupItem = %closestHealth;
				%task.setWeight($AIWeightNeedItemBadly);
			}
			else if (%closestHealthLOS)
			{
				%task.pickupItem = %closestHealth;
				%task.setWeight($AIWeightNeedItem);
			}
			else
				%task.setWeight(0);
		}
	}
	else if (%closestItem > 0)
	{
		%task.pickupItem = %closestItem;
      if (AIEngageWeaponRating(%client) < 20)
			%task.setWeight($AIWeightNeedItemBadly);
		else if (%closestItemDist < 10 && %closestItemLOS)
			%task.setWeight($AIWeightNeedItem);
		else if (%closestItemLOS)
			%task.setWeight($AIWeightFoundItem);
		else
			%task.setWeight(0);
	}
	else
		%task.setWeight(0);
}

function AIPickupItemTask::monitor(%task, %client)
{
	//move to the pickup location
	if (isObject(%task.pickupItem))
	   %client.stepMove(%task.pickupItem.getWorldBoxCenter(), 0.25);

	//this call works in conjunction with AIEngageTask
	%client.setEngageTarget(%client.shouldEngage);
}

//-----------------------------------------------------------------------------
//AIUseInventoryTask will cause them to use an inv station if they're low
//on ammo.  This task should be used only for DM and Hunters - most objectives
//have their own logic for when to use an inv station...

function AIUseInventoryTask::init(%task, %client)
{
}

function AIUseInventoryTask::assume(%task, %client)
{
	%task.setWeightFreq(15);
	%task.setMonitorFreq(5);

	//mark the current time for the buy inventory state machine
	%task.buyInvTime = getSimTime();
}

function AIUseInventoryTask::retire(%task, %client)
{
	//reset the state machine time stamp...
	%task.buyInvTime = getSimTime();
}

function AIUseInventoryTask::weight(%task, %client)
{
   //first, see if we can pick up health
	%player = %client.player;
	if (!isObject(%player))
		return;

	%damage = %player.getDamagePercent();
	%weaponry = AIEngageWeaponRating(%client);

   //if there's an inv station, and we haven't used an inv station since we
   //spawned, the bot should use an inv once regardless
   if (%client.spawnUseInv)
   {
      //see if we're already heading there
      if (%client.buyInvTime != %task.buyInvTime)
      {
	      //see if there's an inventory we can use
         %result = AIFindClosestInventory(%client, false);
         %closestInv = getWord(%result, 0);
	      if (isObject(%closestInv))
         {
            %task.setWeight($AIWeightNeedItem);
            return;
         }
         else
            %client.spawnUseInv = false;
      }
      else
      {
         %task.setWeight($AIWeightNeedItem);
         return;
      }
   }

	//first, see if we need equipment or health
	if (%damage < 0.3 && %weaponry >= 40)
	{
		%task.setWeight(0);
		return;
	}

	//don't use inv stations if we're not that badly damaged, and we're in the middle of a fight
	if (%damage < 0.6 && %client.getEngageTarget() > 0 && !AIEngageOutOfAmmo(%client))
	{
		%task.setWeight(0);
		return;
	}

	//if we're already buying, continue
	if (%task.buyInvTime == %client.buyInvTime)
	{
		//set the weight - if our damage is above 0.8 or our we're out of ammo
		if (%damage > 0.8 || AIEngageOutOfAmmo(%client))
			%task.setWeight($AIWeightNeedItemBadly);
		else
			%task.setWeight($AIWeightNeedItem);
		return;
	}

	//we need to search for an inv station near us...
	%result = AIFindClosestInventory(%client, false);
	%closestInv = getWord(%result, 0);
	%closestDist = getWord(%result, 1);

	//only use inv stations if we're right near them...  patrolTask will get us nearer if required
	if (%closestDist > 35)
	{
		%task.setWeight(0);
		return;
	}

	//set the weight...
	%task.closestInv = %closestInv;
	if (%damage > 0.8 || AIEngageOutOfAmmo(%client))
		%task.setWeight($AIWeightNeedItemBadly);
	else if (%closestDist < 20 && (AIEngageWeaponRating(%client) <= 30 || %damage > 0.4))
		%task.setWeight($AIWeightNeedItem);
	else if (%hasLOS)
		%task.setWeight($AIWeightFoundItem);
	else
		%task.setWeight(0);
}

function AIUseInventoryTask::monitor(%task, %client)
{
	//make sure we still need equipment
	%player = %client.player;
	if (!isObject(%player))
		return;

	%damage = %player.getDamagePercent();
	%weaponry = AIEngageWeaponRating(%client);
	if (%damage < 0.3 && %weaponry >= 40 && !%client.spawnUseInv)
	{
		%task.buyInvTime = getSimTime();
		return;
	}

	//pick a random set based on armor...
	%randNum = getRandom();
	if (%randNum < 0.4)
		%buySet = "LightEnergyDefault MediumEnergySet HeavyEnergySet";
	else if (%randNum < 0.6)
		%buySet = "LightShieldSet MediumShieldSet HeavyShieldSet"; 
	else if (%randNum < 0.8)
		%buySet = "LightEnergyELF MediumRepairSet HeavyAmmoSet";
   else
      %buySet = "LightEnergySniper MediumEnergySet HeavyEnergySet";

	//process the inv buying state machine
   %result = AIBuyInventory(%client, "", %buySet, %task.buyInvTime);

   //if we succeeded, reset the spawn flag
   if (%result $= "Finished")
      %client.spawnUseInv = false;

   //if we succeeded or failed, reset the state machine...
	if (%result !$= "InProgress")
		%task.buyInvTime = getSimTime();


	//this call works in conjunction with AIEngageTask
	%client.setEngageTarget(%client.shouldEngage);
}

//-----------------------------------------------------------------------------
//AITauntCorpseTask is should happen only after an enemy is freshly killed

function AITauntCorpseTask::init(%task, %client)
{
}

function AITauntCorpseTask::assume(%task, %client)
{
	%task.setWeightFreq(11);
	%task.setMonitorFreq(11);
}

function AITauntCorpseTask::retire(%task, %client)
{
}

function AITauntCorpseTask::weight(%task, %client)
{
   %task.corpse = %client.getVictimCorpse();
   if (%task.corpse > 0 && getSimTime() - %client.getVictimTime() < 15000)
	{
		//see if we're already taunting, and if it's time to stop
		if ((%task.tauntTime > %client.getVictimTime()) && (getSimTime() - %task.tauntTime > 5000))
			%task.corpse = -1;
		else
		{
			//if the corpse is within 50m, taunt
         %distToCorpse = %client.getPathDistance(%task.corpse.getWorldBoxCenter());
			if (%dist < 0 || %distToCorpse > 50)
				%task.corpse = -1;
		}
	}
	else
		%task.corpse = -1;

	//set the weight
	if (%task.corpse > 0)
	{
		//don't taunt someone if there's an enemy right near by...
		%result = AIFindClosestEnemy(%client, 40, 15000);
      %closestEnemy = getWord(%result, 0);
      %closestdist = getWord(%result, 1);
      if (%closestEnemy > 0)
			%task.setWeight(0);
		else
			%task.setWeight($AIWeightTauntVictim);
	}
	else
		%task.setWeight(0);
}

$AITauntChat[0] = "gbl.aww";
$AITauntChat[1] = "gbl.brag";
$AITauntChat[2] = "gbl.obnoxious";
$AITauntChat[3] = "gbl.sarcasm";
$AITauntChat[4] = "gbl.when";
function AITauntCorpseTask::monitor(%task, %client)
{
	//make sure we still have a corpse, and are not fighting anyone
	if (%client.getEngageTarget() <= 0 && %task.corpse > 0 && isObject(%task.corpse))
	{
      %clientPos = %client.player.getWorldBoxCenter();
		%corpsePos = %task.corpse.getWorldBoxCenter();
		%distToCorpse = VectorDist(%clientPos, %corpsePos);
		if (%distToCorpse < 2.0)
		{
			//start the taunt!
			if (%task.tauntTime < %client.getVictimTime())
			{
				%task.tauntTime = getSimTime();
				%client.stop();

				if (getRandom() > 0.2)
				{
					//pick the sound and taunt cels
					%sound = $AITauntChat[mFloor(getRandom() * 3.99)];
					%minCel = 2;
					%maxCel = 8;
				   schedule(250, %client, "AIPlayAnimSound", %client, %corpsePos, %sound, %minCel, %maxCel, 0);
				}
				//say 'bye'  :)
				else
				   schedule(250, %client, "AIPlayAnimSound", %client, %corpsePos, "gbl.bye", 2, 2, 0);
			}
		}
		else
			%client.stepMove(%task.corpse.getWorldBoxCenter(), 1.75);
	}
}

//-----------------------------------------------------------------------------
//AIPatrolTask used to wander around the map (DM and Hunters mainly) looking for something to do...

function AIPatrolTask::init(%task, %client)
{
}

function AIPatrolTask::assume(%task, %client)
{
	%task.setWeightFreq(13);
	%task.setMonitorFreq(13);
	%task.findLocation = true;
	%task.patrolLocation = "0 0 0";
	%task.idleing = false;
	%task.idleEndTime = 0;
}

function AIPatrolTask::retire(%task, %client)
{
}

function AIPatrolTask::weight(%task, %client)
{
	%task.setWeight($AIWeightPatrolling);
}

function AIPatrolTask::monitor(%task, %client)
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
			if (getRandom() < (%skill * %skill) && ClientGroup.getCount() > 1)
			{
				//find a random client
				%count = ClientGroup.getCount();
				%index = (getRandom() * (%count - 0.1));
				%cl = ClientGroup.getObject(%index);
				if (%cl != %client && AIClientIsAlive(%cl))
				{
					%task.patrolLocation = %cl.player.getWorldBoxCenter();
					%pickGraphNode = false;
					%pickPlayerLocation = true;
				}
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

//-----------------------------------------------------------------------------
//AIEngageTurretTask is responsible for returning turret fire...

function AIEngageTurretTask::init(%task, %client)
{
}

function AIEngageTurretTask::assume(%task, %client)
{
	%task.setWeightFreq(4);
	%task.setMonitorFreq(4);
}

function AIEngageTurretTask::retire(%task, %client)
{
	%client.engageTurret = -1;
	%client.setEngagetarget(-1);
}

function AIEngageTurretTask::weight(%task, %client)
{
	//see if we're still fighting a turret
	%elapsedTime = getSimTime() - %task.startAttackTime;
	if (isObject(%task.engageTurret) && %task.engageTurret.getDataBlock().getClassName() $= "TurretData")
	{
		if (%task.engageTurret == %client.lastdamageTurret)
		{
			if (%task.engageTurret.isEnabled() && getSimTime() - %client.lastDamageTurretTime < 5000)
				%task.setWeight($AIWeightReturnTurretFire);
			else
				%task.setWeight($AIWeightDestroyTurret);
		}
		else if (AIClientIsAlive(%client, %elapsedTime))
		{
			//if another turret is shooting us, disable this one first...
			if (isObject(%client.lastDamageTurret) && %client.lastDamageTurret.getDataBlock().getClassName() $= "TurretData")
			{
				if (%task.engageTurret.isEnabled())
					%task.setWeight($AIWeightReturnTurretFire);
				else
				{
					//see if we need to switch to the new turret
					if (%client.lastDamageTurret.isEnabled() && %client.lastDamageTurretTime < 5000)
					{
						%task.engageTurret = %client.lastDamageTurret;
						%task.attackInitted = false;
						%task.setWeight($AIWeightDestroyTurret);
					}

					else
						%task.setWeight($AIWeightReturnTurretFire);
				}
			}
			else
			{
				if (%task.engageTurret.isEnabled() && getSimTime() - %client.lastDamageTurretTime < 5000)
					%task.setWeight($AIWeightReturnTurretFire);
				else
					%task.setWeight($AIWeightDestroyTurret);
			}
		}

		//else we died since - clear out the vars
		else
		{
			%task.engageTurret = -1;
			%task.setWeight(0);
		}
	}

	//else see if we have a new target
	else if (isObject(%client.lastDamageTurret) && %client.lastDamageTurret.getDataBlock().getClassName() $= "TurretData")
	{
		%task.engageTurret = %client.lastDamageTurret;
		%task.attackInitted = false;

		if (%client.lastDamageTurret.isEnabled() && %client.lastDamageTurretTime < 5000)
			%task.setWeight($AIWeightReturnTurretFire);
		else
			%task.setWeight($AIWeightDestroyTurret);
	}

	//else no turret to attack...  (later, do a query to find turrets before they attack)
	else
	{
		%task.engageTurret = -1;
		%task.setWeight(0);
	}

}

function AIEngageTurretTask::monitor(%task, %client)
{
	if (isObject(%task.engageTurret) && %task.engageTurret.getDataBlock().getClassName() $= "TurretData")
	{
		//set the AI to fire at the turret
		%client.setEngageTarget(-1);
		%client.setTargetObject(%task.engageTurret);

		%clientPos = %client.player.getWorldBoxCenter();
		%turretPos = %task.engageTurret.getWorldBoxCenter();

		//control the movement - first, hide, then wait, then attack
		if (!%task.attackInitted)
		{
			%task.attackInitted = true;
			%task.startAttackTime = getSimTime();
			%task.hideLocation = %client.getHideLocation(%turretPos, 40.0, %clientPos, 4.0); 
			%client.stepMove(%task.hideLocation, 2.0);
		}
		else if (getSimTime() - %task.startAttackTime > 5000)
		{
			%client.stepMove(%task.engageTurret.getWorldBoxCenter(), 8.0);
		}
	}
}

//-----------------------------------------------------------------------------
//AIAvoidMineTask is responsible for detecting/destroying enemy mines...

function AIDetectMineTask::init(%task, %client)
{
}

function AIDetectMineTask::assume(%task, %client)
{
	%task.setWeightFreq(7);
	%task.setMonitorFreq(7);
}

function AIDetectMineTask::retire(%task, %client)
{
	%task.engageMine = -1;
	%task.attackInitted = false;
   %client.setTargetObject(-1);
}

function AIDetectMineTask::weight(%task, %client)
{
	//crappy hack, but they need the proper weapon before they can destroy a mine...
	%player = %client.player;
	if (!isObject(%player))
		return;

   %hasPlasma = (%player.getInventory("Plasma") > 0) && (%player.getInventory("PlasmaAmmo") > 0);
   %hasDisc = (%player.getInventory("Disc") > 0) && (%player.getInventory("DiscAmmo") > 0);

	if (!%hasPlasma && !%hasDisc)
	{
		%task.setWeight(0);
		return;
	}

	//if we're already attacking a mine, 
	if (%task.engageMine > 0 && isObject(%task.engageMine))
	{
		%task.setWeight($AIWeightDetectMine);
		return;
	}
	//see if we're within the viscinity of a new (enemy) mine
	%task.engageMine = -1;
	%closestMine = -1;
	%closestDist = 15;	//initialize so only mines within 15 m will be detected...
	%mineCount = $AIDeployedMineSet.getCount();
	for (%i = 0; %i < %mineCount; %i++)
	{
		%mine = $AIDeployedMineSet.getObject(%i);
		%mineTeam = %mine.sourceObject.team;

		%minePos = %mine.getWorldBoxCenter();
		%clPos = %client.player.getWorldBoxCenter();

		//see if the mine is the closest...
		%mineDist = VectorDist(%minePos, %clPos);
		if (%mineDist < %closestDist)
		{
			//now see if we're more or less heading towards the mine...
			%clVelocity = %client.player.getVelocity();
			%clVelocity = getWord(%clVelocity, 0) SPC getWord(%clVelocity, 1) SPC "0";
			%mineVector = VectorSub(%minePos, %clPos);
			%mineVector = getWord(%mineVector, 0) SPC getWord(%mineVector, 1) SPC "0";
			if (VectorLen(%clVelocity) > 2.0 && VectorLen(%mineVector > 2.0))
			{
				%clNormal = VectorNormalize(%clVelocity);
				%mineNormal = VectorNormalize(%mineVector);
				if (VectorDot(%clNormal, %mineNormal) > 0.3)
				{
					%closestMine = %mine;
					%closestDist = %mineDist;
				}
			}
		}
	}

	//see if we found a mine to attack
	if (%closestMine > 0)
	{
		%task.engageMine = %closestMine;
		%task.attackInitted = false;
		%task.setWeight($AIWeightDetectMine);
	}
	else
		%task.setWeight(0);
}

function AIDetectMineTask::monitor(%task, %client)
{
	if (%task.engageMine > 0 && isObject(%task.engageMine))
	{
		if (!%task.attackInitted)
		{
			%task.attackInitted = true;
		   %client.stepRangeObject(%task.engageMine, "DefaultRepairBeam", 6, 12);
			%client.setEngageTarget(-1);
			%client.setTargetObject(-1);
		}

      else if (%client.getStepStatus() $= "Finished")
		{
			%client.stop();
         %client.setTargetObject(%task.engageMine);
		}
	}
}

//-----------------------------------------------------------------------------
