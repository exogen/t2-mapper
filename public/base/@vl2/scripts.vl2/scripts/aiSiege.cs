//
// aiSiege.cs
//

function SiegeGame::onAIRespawn(%game, %client)
{
   //add the default tasks
	if (! %client.defaultTasksAdded)
	{
		%client.defaultTasksAdded = true;
	   %client.addTask(AIEngageTask);
	   %client.addTask(AIPickupItemTask);
	   %client.addTask(AITauntCorpseTask);
		%client.addTask(AIEngageTurretTask);
		%client.addtask(AIDetectMineTask);
	}
}

function SiegeGame::AIInit(%game)
{
   for (%i = 0; %i <= %game.numTeams; %i++)
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

function SiegeGame::AIChooseGameObjective(%game, %client)
{
	//the objectives on team1 are all offense objectives, team2 has the defensive ones..
	if (%client.team == %game.offenseTeam)
		AIChooseObjective(%client, $ObjectiveQ[1]);
	else
		AIChooseObjective(%client, $ObjectiveQ[2]);
}

function SiegeGame::AIHalfTime(%game)
{
	//clear all the bots, and clean up all the sets, objective qs, etc...
	AIMissionEnd();

	//reset everything from scratch
	%game.aiInit();

	//respawn all the bots
	for (%i = 0; %i < ClientGroup.getCount(); %i++)
	{
		%cl = ClientGroup.getObject(%i);
		if (%cl.isAIControlled())
			onAIRespawn(%cl);
	}
}
   
function SiegeGame::onAIDamaged(%game, %clVictim, %clAttacker, %damageType, %implement)
{
   if (%clAttacker && %clAttacker != %clVictim && %clAttacker.team == %clVictim.team)
   {
	   schedule(250, %clVictim, "AIPlayAnimSound", %clVictim, %clAttacker.player.getWorldBoxCenter(), "wrn.watchit", -1, -1, 0);
      
      //clear the "lastDamageClient" tag so we don't turn on teammates...  unless it's uberbob!
      %clVictim.lastDamageClient = -1;
   }
}

function SiegeGame::onAIKilledClient(%game, %clVictim, %clAttacker, %damageType, %implement)
{
	if (%clVictim.team != %clAttacker.team)
	   DefaultGame::onAIKilledClient(%game, %clVictim, %clAttacker, %damageType, %implement);
}

function SiegeGame::onAIFriendlyFire(%game, %clVictim, %clAttacker, %damageType, %implement)
{
   if (%clAttacker && %clAttacker.team == %clVictim.team && %clAttacker != %clVictim && !%clVictim.isAIControlled())
   {
      // The Bot is only a little sorry:
      if ( getRandom() > 0.9 )
		   AIMessageThread("ChatSorry", %clAttacker, %clVictim);
   }
}
