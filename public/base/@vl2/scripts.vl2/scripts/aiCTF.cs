//-----------------------------------------------
// AI functions for CTF

function CTFGame::onAIRespawn(%game, %client)
{
   //add the default task
	if (! %client.defaultTasksAdded)
	{
		%client.defaultTasksAdded = true;
	   %client.addTask(AIEngageTask);
	   %client.addTask(AIPickupItemTask);
	   %client.addTask(AITauntCorpseTask);
		%client.addtask(AIEngageTurretTask);
		%client.addtask(AIDetectMineTask);
	}
}
   
function CTFGame::AIInit(%game)
{
   // load external objectives files
   loadObjectives();
   
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

function CTFGame::AIplayerCaptureFlipFlop(%game, %player, %flipFlop)
{
}

function CTFGame::AIplayerTouchEnemyFlag(%game, %player, %flag)
{
}

function CTFGame::AIplayerTouchOwnFlag(%game, %player, %flag)
{
}

function CTFGame::AIflagCap(%game, %player, %flag)
{
	//signal the flag cap event
	AIRespondToEvent(%player.client, 'EnemyFlagCaptured', %player.client);
	// MES - changed above line - did not pass args in correct order
}

function CTFGame::AIplayerDroppedFlag(%game, %player, %flag)
{
}

function CTFGame::AIflagReset(%game, %flag)
{
}

function CTFGame::onAIDamaged(%game, %clVictim, %clAttacker, %damageType, %implement)
{
   if (%clAttacker && %clAttacker != %clVictim && %clAttacker.team == %clVictim.team)
   {
	   schedule(250, %clVictim, "AIPlayAnimSound", %clVictim, %clAttacker.player.getWorldBoxCenter(), "wrn.watchit", -1, -1, 0);
      
      //clear the "lastDamageClient" tag so we don't turn on teammates...  unless it's uberbob!
      %clVictim.lastDamageClient = -1;
   }
}

function CTFGame::onAIKilledClient(%game, %clVictim, %clAttacker, %damageType, %implement)
{
	if (%clVictim.team != %clAttacker.team)
	   DefaultGame::onAIKilledClient(%game, %clVictim, %clAttacker, %damageType, %implement);
}

function CTFGame::onAIKilled(%game, %clVictim, %clAttacker, %damageType, %implement)
{
	DefaultGame::onAIKilled(%game, %clVictim, %clAttacker, %damageType, %implement);
}

function CTFGame::onAIFriendlyFire(%game, %clVictim, %clAttacker, %damageType, %implement)
{
   if (%clAttacker && %clAttacker.team == %clVictim.team && %clAttacker != %clVictim && !%clVictim.isAIControlled())
   {
      // The Bot is only a little sorry:
      if ( getRandom() > 0.9 )
		   AIMessageThread("ChatSorry", %clAttacker, %clVictim);
   }
}
