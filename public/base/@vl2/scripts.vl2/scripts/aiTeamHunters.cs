exec("scripts/aiHunters.cs");

//---------------------------------------------------------------------------//
//AI functions for playing TEAM HUNTERS

function TeamHuntersGame::AIInit(%game)
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

function TeamHuntersGame::onAIRespawn(%game, %client)
{
	HuntersGame::onAIRespawn(%game, %client);
}

function TeamHuntersGame::onAIDamaged(%game, %clVictim, %clAttacker, %damageType, %implement)
{
   if (%clAttacker && %clAttacker != %clVictim && %clAttacker.team == %clVictim.team)
   {
	   schedule(250, %clVictim, "AIPlayAnimSound", %clVictim, %clAttacker.player.getWorldBoxCenter(), "wrn.watchit", -1, -1, 0);
      
      //clear the "lastDamageClient" tag so we don't turn on teammates...  unless it's uberbob!
      %clVictim.lastDamageClient = -1;
   }
}

function TeamHuntersGame::onAIFriendlyFire(%game, %clVictim, %clAttacker, %damageType, %implement)
{
   if (%clAttacker && %clAttacker.team == %clVictim.team && %clAttacker != %clVictim && !%clVictim.isAIControlled())
   {
      // The Bot is only a little sorry:
      if ( getRandom() > 0.9 )
		   AIMessageThread("ChatSorry", %clAttacker, %clVictim);
   }
}


