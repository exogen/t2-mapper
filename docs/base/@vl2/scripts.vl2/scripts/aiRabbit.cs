//-----------------------------------------------
// AI functions for Rabbit
//---------------------------------------------------------------------------

//---------------------------------------------------------------------------

function RabbitGame::onAIRespawn(%game, %client)
{
   //add the default task
	if (! %client.defaultTasksAdded)
	{
		%client.defaultTasksAdded = true;
	   %client.addTask(AIPickupItemTask);                                             
	   %client.addTask(AIUseInventoryTask);
	   %client.addTask(AITauntCorpseTask);
      %client.rabbitTask = %client.addTask(AIRabbitTask);
	}

   //set the inv flag
   %client.spawnUseInv = true;
}

//---------------------------------------------------------------------------
   
function RabbitGame::AIInit(%game)
{
   //call the default AIInit() function
   AIInit();
}

//---------------------------------------------------------------------------
//AIRabbitTask functions
//---------------------------------------------------------------------------
function AIRabbitTask::init(%task, %client)
{
}

//---------------------------------------------------------------------------

function AIRabbitTask::assume(%task, %client)
{
   %task.setWeightFreq(20);
   %task.setMonitorFreq(20);
	%task.findLocation = true;
}

function AIRabbitTask::retire(%task, %client)
{
}

//---------------------------------------------------------------------------

function AIRabbitTask::weight(%task, %client)
{
	%player = %client.player;

	//see if I have the flag
	if ($AIRabbitFlag.carrier == %player)
		%task.setWeight($AIRabbitWeightDefault);

	//else see if I'm close to the flag
	else
	{
		if (isObject($AIRabbitFlag.carrier))
			%distToFlag = %client.getPathDistance($AIRabbitFlag.carrier.getWorldBoxCenter());
		else
			%distToFlag = %client.getPathDistance($AIRabbitFlag.getWorldBoxCenter());

		//if the flag is pretty close, or the inv station is quite far...
		if (%distToFlag > 0 && %distToFlag < 50)
			%task.setWeight($AIRabbitWeightDefault);
		else
			%task.setWeight($AIRabbitWeightNeedInv);

      //see if the spawnUseInv flag should be reset
      if (%client.spawnUseInv)
      {
         if (!isObject($AIRabbitFlag.carrier))
         {
            //see if there are any bots closer to a dropped flag
            %found = false;
            for (%i = 0; %i < ClientGroup.getCount(); %i++)
            {
               %cl = ClientGroup.getObject(%i);
               if (%cl != %client && %cl.isAIControlled() && isObject(%cl.player))
               {
                  %dist = VectorDist(%cl.player.position, $AIRabbitFlag.position);
                  if (%dist < %distToFlag)
                  {
                     %found = true;
                     break;
                  }
               }
            }

            //reset the spawnUseInv flag if we're the closest
            if (!%found)
               %client.spawnUsInv = false;
         }
      }
	}
}

//---------------------------------------------------------------------------

function AIRabbitTask::monitor(%task, %client)
{
	%player = %client.player;

	//if we have the flag - run
	if ($AIRabbitFlag.carrier == %player)
	{
		if (%task.findLocation)
		{
			%damage = %player.getDamagePercent();
			if (%damage > 0.3)
			{
				//search for a health kit
				%closestHealth = AIFindSafeItem(%client, "Health");
				if (%closestHealth > 0)
				{
					%task.seekLocation = %closestHealth.getWorldBoxCenter();
					%foundItemLocation = true;
				}
			}
			else if (!%foundItemLocation && AIEngageOutOfAmmo(%client))
			{
				//search for a Ammo or a weapon...
				%closestItem = AIFindSafeItem(%client, "Ammo");
				if (%closestItem > 0)
				{
					%task.seekLocation = %closestItem.getWorldBoxCenter();
					%foundItemLocation = true;
				}
			}

			//now see if we don't really have good equipment...
			else if (!%foundItemLocation && AIEngageWeaponRating(%client) < 20)
			{
				//search for any useful item
				%closestItem = AIFindSafeItem(%client, "Any");
				if (%closestItem > 0)
				{
					%task.seekLocation = %closestItem.getWorldBoxCenter();
					%foundItemLocation = true;
				}
			}

			//else, search for any spot on the map that isn't covered with enemies...
			else
			{
				//try 10 times
				%task.seekLocation = %player.position;
				%farthestLocation = "";
				%farthestDist = 0;
				%occupiedLocation = "";

				for (%i = 0; %i < 10; %i++)
				{
				   %testLocation = Game.pickPlayerSpawn(%client, true);
					if (%testLocation == -1)
						break;

					%dist = %client.getPathDistance(%testLocation);
					if (%dist < 0 || %dist > %farthestDist)
					{
						//see if it's unoccupied...
						%result = AIFindClosestEnemyToLoc(%client, %task.location, 50, $AIClientLOSTimeout, true);
					   %closestEnemy = getWord(%result, 0);
					   %closestdist = getWord(%result, 1);

						if (!AIClientIsAlive(%closestEnemy))
							%farthestLocation = %testLocation;
						else
							%occupiedLocation = %testLocation;
					}
				}

				if (%farthestLocation $= "")
					%task.seekLocation = %occupiedLocation;
				else
					%task.seekLocation = %farthestLocation;
			}

			//set the flag and go there
			%task.findLocation = false;
			%client.stepMove(%task.seekLocation, 8);
		}
		else
		{
			//keep going there...
			%client.stepMove(%task.seekLocation, 8);

			//see if we've arrived 
			%distToDest = %client.getPathDistance(%task.seekLocation);
			if (%distToDest > 0 && %distToDest < 10)
			{
				%task.findLocation = true;
			}
		}

		//don't forget to shoot back at whoever shot me last
		if (%client.lastDamageClient != %client)
			%client.setEngageTarget(%client.lastDamageClient);
	}

	//else if someone else has the flag - shoot them
	else if (isObject($AIRabbitFlag.carrier))
	{
		%client.clientDetected($AIRabbitFlag.carrier.client);
		%client.stepEngage($AIRabbitFlag.carrier.client);
	}

	//else the flag has been dropped
	else
	{
		%client.stepMove($AIRabbitFlag.position, 0.25);
		%client.setEngageTarget(-1);
	}
}

//---------------------------------------------------------------------------
// AIRabbit utility functions
//---------------------------------------------------------------------------
function air()
{
	exec("scripts/aiRabbit.cs");
}


