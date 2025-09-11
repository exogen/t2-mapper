function DMGame::AIInit(%game)
{
   //call the default AIInit() function
   AIInit();
}

function DMGame::onAIRespawn(%game, %client)
{
   //add the default task
	if (! %client.defaultTasksAdded)
	{
		%client.defaultTasksAdded = true;
	   %client.addTask(AIEngageTask);
	   %client.addTask(AIPickupItemTask);
	   %client.addTask(AIUseInventoryTask);
	   %client.addTask(AITauntCorpseTask);
		%client.addTask(AIEngageTurretTask);
		%client.addtask(AIDetectMineTask);
	   %client.addTask(AIPatrolTask);
	}

   //set the inv flag
   %client.spawnUseInv = true;
}
   
