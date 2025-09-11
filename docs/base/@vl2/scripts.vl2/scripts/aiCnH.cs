//-----------------------------------------------
// AI functions for Capture and Hold
function aicnh()
{
	exec("scripts/aiCnH.cs");
}

function CnHGame::AIInit(%game)
{
   for (%i = 1; %i <= %game.numTeams; %i++)
   {
      if (!isObject($ObjectiveQ[%i]))
      {
         $ObjectiveQ[%i] = new AIObjectiveQ();
         MissionCleanup.add($ObjectiveQ[%i]);
      }

      error("team " @ %i @ " objectives load...");
		$ObjectiveQ[%i].clear();
      AIInitObjectives(%i, %game);
   }
   
   //call the default AIInit() function
   AIInit();
}

function CnHGame::onAIRespawn(%game, %client)
{
   //add the default tasks
	if (! %client.defaultTasksAdded)
	{
		%client.defaultTasksAdded = true;
	   %client.addTask(AIEngageTask);
	   %client.addTask(AIPickupItemTask);
	   %client.addTask(AITauntCorpseTask);
	   %client.addTask(AIPatrolTask);
		%client.addtask(AIEngageTurretTask);
		%client.addtask(AIDetectMineTask);
	}
}

function CnHGame::onAIDamaged(%game, %clVictim, %clAttacker, %damageType, %implement)
{
   if (%clAttacker && %clAttacker != %clVictim && %clAttacker.team == %clVictim.team)
   {
	   schedule(250, %clVictim, "AIPlayAnimSound", %clVictim, %clAttacker.player.getWorldBoxCenter(), "wrn.watchit", -1, -1, 0);
      
      //clear the "lastDamageClient" tag so we don't turn on teammates...  unless it's uberbob!
      %clVictim.lastDamageClient = -1;
   }
}

function CnHGame::onAIKilledClient(%game, %clVictim, %clAttacker, %damageType, %implement)
{
	if (%clVictim.team != %clAttacker.team)
	   DefaultGame::onAIKilledClient(%game, %clVictim, %clAttacker, %damageType, %implement);
}

function CnHGame::onAIKilled(%game, %clVictim, %clAttacker, %damageType, %implement)
{
	DefaultGame::onAIKilled(%game, %clVictim, %clAttacker, %damageType, %implement);
}

function CnHGame::onAIFriendlyFire(%game, %clVictim, %clAttacker, %damageType, %implement)
{
   if (%clAttacker && %clAttacker.team == %clVictim.team && %clAttacker != %clVictim && !%clVictim.isAIControlled())
   {
      // The Bot is only a little sorry:
      if ( getRandom() > 0.9 )
		   AIMessageThread("ChatSorry", %clAttacker, %clVictim);
   }
}

function CnHGame::AIplayerCaptureFlipFlop(%game, %player, %flipFlop)
{
}

