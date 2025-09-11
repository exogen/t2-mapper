//-----------------------------------------------
// AI functions for Capture and Hold
function aidnd()
{
   exec("scripts/aiDnD.cs");
}

function DnDGame::AIInit(%game)
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

function DnDGame::onAIRespawn(%game, %client)
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

function DnDGame::onAIDamaged(%game, %clVictim, %clAttacker, %damageType, %implement)
{
   if (%clAttacker && %clAttacker != %clVictim && %clAttacker.team == %clVictim.team)
   {
      schedule(250, %clVictim, "AIPlayAnimSound", %clVictim, %clAttacker.player.getWorldBoxCenter(), "wrn.watchit", -1, -1, 0);
      
      //clear the "lastDamageClient" tag so we don't turn on teammates...  unless it's uberbob!
      %clVictim.lastDamageClient = -1;
   }
}

function DnDGame::onAIKilledClient(%game, %clVictim, %clAttacker, %damageType, %implement)
{
   if (%clVictim.team != %clAttacker.team)
      DefaultGame::onAIKilledClient(%game, %clVictim, %clAttacker, %damageType, %implement);
}

function DnDGame::onAIKilled(%game, %clVictim, %clAttacker, %damageType, %implement)
{
   DefaultGame::onAIKilled(%game, %clVictim, %clAttacker, %damageType, %implement);
}

function DnDGame::onAIFriendlyFire(%game, %clVictim, %clAttacker, %damageType, %implement)
{
   if (%clAttacker && %clAttacker.team == %clVictim.team && %clAttacker != %clVictim)
      AIMessageThread("Sorry", %clAttacker, %clVictim);
}

function DnDGame::AIplayerCaptureFlipFlop(%game, %player, %flipFlop)
{
}
