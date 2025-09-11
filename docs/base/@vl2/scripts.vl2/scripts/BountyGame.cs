//--- GAME RULES BEGIN ---
//Eliminate Targets in order assigned; eliminate Pursuer(s) without penalty
//Killing a Bystander who was a former Target returns him to your Target pool
//Killing 3 or more Targets in a row without dying earns a bonus
//Killing all Targets first earns a bonus
//Red = Target, Green = Bystander
//--- GAME RULES END ---

//Spec Note:  Upon entry to game - 
//  All opponents have green triangles.
//  Once you select your target, that player's triangle appears red (for you).
//  If someone who has you as a target (a Pursuer) damages you, his triangle disappears altogether (for you).
//  Once your target is eliminated, he respawns with a green triangle.
//  If your Pursuer kills you, he has a green triangle again when you respawn (unless he becomes your target). 

exec("scripts/aiBountyGame.cs");

$InvBanList[Bounty, "TurretOutdoorDeployable"] = 1;
$InvBanList[Bounty, "TurretIndoorDeployable"] = 1;
$InvBanList[Bounty, "ElfBarrelPack"] = 1;
$InvBanList[Bounty, "MortarBarrelPack"] = 1;
$InvBanList[Bounty, "PlasmaBarrelPack"] = 1;
$InvBanList[Bounty, "AABarrelPack"] = 1;
$InvBanList[Bounty, "MissileBarrelPack"] = 1;
$InvBanList[Bounty, "Mine"] = 1;

//-----------------Bounty Game score inits --------------
// .objectiveTargetKills .bystanderKills .predatorKills .suicides .deaths
function BountyGame::initGameVars(%game)
{
   %game.SCORE_PER_TARGETKILL = 1;
   %game.SCORE_PER_BYSTANDERKILL = -1;
   %game.SCORE_PER_SUICIDE = -1; 
   %game.SCORE_PER_DEATH = 0;
   %game.SCORE_PER_COMPLETION_BONUS = 5;
   %game.SIZE_STREAK_TO_AWARD = 3;  //award bonus for a winning streak this big or better
   %game.WARN_AT_NUM_OBJREM = 2; //display warning when player has only this many or less objectives left
   %game.MAX_CHEATDEATHS_ALLOWED = 1;  //number of times a player can die by cntrl-k or die by leaving mission area before being labeled a cheater

   %game.waypointFrequency = 24000;
   %game.waypointDuration = 6000;
}

function BountyGame::startMatch(%game)
{
   //call the default
   DefaultGame::startMatch(%game);

   //now give everyone who's already playing a target
   %count = ClientGroup.getCount();
   for (%i = 0; %i < %count; %i++)
   {
      %cl = ClientGroup.getObject(%i);
      %game.nextObjective(%cl);
   }
}

function BountyGame::allowsProtectedStatics(%game)
{
   return true;
}

function BountyGame::setUpTeams(%game)
{  
   if ((%group = nameToID("MissionGroup/Teams")) == -1)
     return;   

   %dropSet = new SimSet("TeamDrops0");
   MissionCleanup.add(%dropSet);

   %group.setTeam(0);

   game.numTeams = 1;  
   setSensorGroupCount(32);

   //now set up the sensor group colors - specific for bounty - everyone starts out green to everone else...
   for(%i = 0; %i < 32; %i++)
      setSensorGroupColor(%i, 0xfffffffe, "0 255 0 255");
}

function BountyGame::pickTeamSpawn(%game, %team)
{
   DefaultGame::pickTeamSpawn(%game, 0);
}

function BountyGame::claimSpawn(%game, %obj, %newTeam, %oldTeam)
{
   %newSpawnGroup = nameToId("MissionCleanup/TeamDrops0");  
   %newSpawnGroup.add(%obj);   
}

function BountyGame::clientJoinTeam( %game, %client, %team, %respawn )
{
   %game.assignClientTeam( %client );
   
   // Spawn the player:
   %game.spawnPlayer( %client, %respawn );
}
      
function BountyGame::assignClientTeam(%game, %client)
{
   %client.team = 0;

   //initialize the team array
   for (%i = 1; %i < 32; %i++)
      %game.teamArray[%i] = false;

   %count = ClientGroup.getCount();
   for (%i = 0; %i < %count; %i++)
   {
      %cl = ClientGroup.getObject(%i);
      if (%cl.team != 0)
         %game.teamArray[%cl.team] = true;
   }

   //now loop through the team array, looking for an empty team
   for (%i = 1; %i < 32; %i++)
   {
      if (! %game.teamArray[%i])
      {
         %client.team = %i;
         break;
      }
   }

   // set player's skin pref here
   setTargetSkin(%client.target, %client.skin);
   %client.justEntered = true;

   // Let everybody know you are no longer an observer:
   messageAll( 'MsgClientJoinTeam', '\c1%1 has joined the fray.', %client.name, "", %client, 1 );

   updateCanListenState( %client );

   logEcho(%client.nameBase@" (cl "@%client@") entered game");
}

function BountyGame::playerSpawned(%game, %player, %armor)
{
   DefaultGame::playerSpawned(%game, %player, %armor);
   
   %client = %player.client;
   if (%client.justEntered)
   {
      %client.justEntered = "";
      %game.updateHitLists();
   }
   %client.isPlaying = true;
   // if client spawned and has no target (e.g. when first enters game), give him one
   // if client came from observer mode, should still have a target
   if (!%client.objectiveTarget && $MatchStarted)
      %game.nextObjective(%client);

   //make sure the colors for this client are correct
   %game.updateColorMask(%client);

   //show the waypoint for this player...
   %client.damagedTargetTime = 0;
   cancel(%client.waypointSchedule);
   %game.showTargetWaypoint(%client);

   //also, anyone who has this client as an objective target, update their waypoint as well...
   for (%i = 0; %i < ClientGroup.getCount(); %i++)
   {
      %cl = ClientGroup.getObject(%i);
      if (%cl.objectiveTarget == %client)
      {
         %cl.damagedTargetTime = 0;
         cancel(%cl.waypointSchedule);
         %game.showTargetWaypoint(%cl);
      }
   }
}

function BountyGame::equip(%game, %player)
{
   for(%i =0; %i<$InventoryHudCount; %i++)
      %player.client.setInventoryHudItem($InventoryHudData[%i, itemDataName], 0, 1);
   %player.client.clearBackpackIcon();

   //%player.setArmor("Light");
   %player.setInventory(EnergyPack, 1);
   %player.setInventory(RepairKit,1);
   %player.setInventory(Grenade,6);
   %player.setInventory(Blaster,1);
   %player.setInventory(Disc,1);
   %player.setInventory(Chaingun, 1);
   %player.setInventory(ChaingunAmmo, 100);
   %player.setInventory(DiscAmmo, 20);
   %player.setInventory(Beacon, 3);
   %player.setInventory(TargetingLaser, 1);
   %player.weaponCount = 3;
   
   %player.use("Blaster");
}                  

function BountyGame::updateColorMask(%game, %client)
{
   //set yourself to red, so your objectives will be red
   %redMask = 0;
   %blueMask = 0;

   %count = ClientGroup.getCount();
   for (%i = 0; %i < %count; %i++)
   {
      %cl = ClientGroup.getObject(%i);

      //first, see if the client is your target
      if (%cl == %client.objectiveTarget)
         %redMask |= (1 << %cl.team);

      //else see if the have you as a target, and have damaged you...
      else if (%cl.objectiveTarget == %client && %cl.damagedObjectiveTarget)
         %blueMask |= (1 << %cl.team);
   }

   //first everyone to green
   setSensorGroupColor(%client.team, 0xfffffffe, "0 255 0 255");

   //now set the red mask (your target)
   setSensorGroupColor(%client.team, %redMask, "255 0 0 255");

   //finally, set the blue mask (by setting alpha to 0 the damage/triangle will not appear, though
   // names still can).. if none were desired then making this group never visible would be
   // the better solution
   setSensorGroupColor(%client.team, %blueMask, "0 0 255 0");
}

function BountyGame::showTargetWaypoint(%game, %client)
{
   //AI's simply detect their target
   if (%client.isAIControlled())
   {
      if (AIClientIsAlive(%client.objectiveTarget))
         %client.clientDetected(%client.objectiveTarget);
      return;
   }

   //only show the target waypoint if the target hasn't been damaged within the frequency period
   if (getSimTime() - %client.damagedTargetTime < %game.waypointFrequency)
   {
      %client.waypointSchedule = %game.schedule(%game.waypointFrequency, "showTargetWaypoint", %client);
      return;
   }

   //flash a waypoint on the %client's current objective
   %clTarget = %client.objectiveTarget;
   if (!AIClientIsAlive(%clTarget) || !AIClientIsAlive(%client))
      return;

   //set the vis mask
   %visMask = getSensorGroupAlwaysVisMask(%clTarget.getSensorGroup());
   %visMask |= (1 << %client.getSensorGroup());
   setSensorGroupAlwaysVisMask(%clTarget.getSensorGroup(), %visMask);

   //scope the client, then set the always vis mask...
   if (isObject(%clTarget.player))
   {
      //always keep the target in scope...
      %clTarget.player.scopeToClient(%client);

      //now issue a command to kill the target
      %client.setTargetId(%clTarget.target);
      commandToClient(%client, 'TaskInfo', %client, -1, false, "Attack Target");
      %client.sendTargetTo(%client, true);

      //send the "waypoint is here sound" - QIX, need a sound!
      messageClient(%client, 'MsgBountyWaypoint', '~wfx/misc/target_waypoint.wav');
   }

   //schedule the time to hide the waypoint
   %client.waypointSchedule = %game.schedule(%game.waypointDuration, "hideTargetWaypoint", %client);
}

function BountyGame::hideTargetWaypoint(%game, %client)
{
   //AI's simply detect their target
   if (%client.isAIControlled())
   {
      if (AIClientIsAlive(%client.objectiveTarget))
         %client.clientDetected(%client.objectiveTarget);
      return;
   }

   //flash a waypoint on the %client's current objective
   %clTarget = %client.objectiveTarget;
   if (!isObject(%clTarget))
      return;

   //clear scope the client, then unset the always vis mask...
   %visMask = getSensorGroupAlwaysVisMask(%clTarget.getSensorGroup());
   %visMask &= ~(1 << %client.getSensorGroup());
   setSensorGroupAlwaysVisMask(%clTarget.getSensorGroup(), %visMask);

   //kill the actually task...
   removeClientTargetType(%client, "AssignedTask");

   //schedule the next time the waypoint should flash
   %client.waypointSchedule = %game.schedule(%game.waypointFrequency, "showTargetWaypoint", %client);
}

function BountyGame::nextObjective(%game, %client)
{
   %numValidTargets = %game.buildListValidTargets(%client);
   
   if (%numValidTargets > 0)
   {
      // if there are valid targets (other players that client hasn't killed)
      %client.objectiveTarget = %game.selectNewTarget(%client, %numValidTargets);
      %client.objectiveTargetName = detag((%client.objectiveTarget).name);
      %client.damagedObjectiveTarget = false;

      // this client has now been assigned a target
      %client.hasHadTarget = true;
      messageClient(%client, 'msgBountyTargetIs', '\c2Your target is %1.', %client.objectiveTarget.name);

      //for the client, set his mask to see his target as red, anyone who as him as a target and has damaged him is blue 
      //and everyone else is green...
      %game.updateColorMask(%client);

      //set a temporary waypoint so you can find your new target
      if (%client.isAIControlled())
         %game.aiBountyAssignTarget(%client, %client.objectiveTarget);

      //show the waypoint...
      %client.damagedTargetTime = 0;
      cancel(%client.waypointSchedule);
      %game.showTargetWaypoint(%client);
	   logEcho(%client.nameBase@" (pl "@%client.player@"/cl "@%client@") assigned objective");
   }
   else
   {
      if (%client.hasHadTarget)
      {
         // if there aren't any more valid targets and you've been assigned one,
         // that means you've killed everyone -- game over!
         %game.awardScoreCompletionBonus(%client);
         %game.gameOver();
         cycleMissions();
      }
      else
      {
         cancel(%client.awaitingTargetThread);
         %client.awaitingTargetThread = %game.schedule(500, "nextObjective", %client);  //waiting for an opponent to join, keep checking 2x per second.
      }
   }
}

function BountyGame::buildListValidTargets(%game, %cl)
{
   %availTargets = 0;
   %numClients = ClientGroup.getCount();
   for (%cIndex = 0; %cIndex < %numClients; %cIndex++)
   {
      %opponent = ClientGroup.getObject(%cIndex);
      //make sure the target isn't yourself, or an observer
      if (%opponent != %cl && %opponent.team > 0 && !%opponent.isNotInGame)
      {
         //make sure candidate for list has not already been killed by client
         if (!%cl.eliminated[%opponent])
         {
            %cl.validList[%availTargets] = %opponent;
            %availTargets++;  
         }
      }
   }

   //returns length of list (number of players eligible as targets to this client)
   %game.hudUpdateObjRem(%cl, %availTargets);
   if ((%availTargets <= %game.WARN_AT_NUM_OBJREM) && (%cl.hasHadTarget))
      %game.announceEminentWin(%cl, %availTargets);
   return %availTargets;
}

function BountyGame::selectNewTarget(%game, %cl, %numValidTargets)
{
   // pick a player at random from eligible target list
   %targetIndex = mFloor(getRandom() * (%numValidTargets - 0.01));
   //echo("picking index " @ %targetIndex @ " from ValidList");
   return %cl.validList[%targetIndex];
}

function BountyGame::updateHitLists(%game)
{
   %numClients = ClientGroup.getCount();
   for (%cIndex = 0; %cIndex < %numClients; %cIndex++)
   {
      %cl = ClientGroup.getObject(%cIndex);
      %game.buildListValidTargets(%cl);
   }
}

function BountyGame::timeLimitReached(%game)
{
   %game.gameOver();
   cycleMissions();
}

function BountyGame::gameOver(%game)
{
   //call the default
   DefaultGame::gameOver(%game);

   //send the message
   messageAll('MsgGameOver', "Match has ended.~wvoice/announcer/ann.gameover.wav" );

   messageAll('MsgClearObjHud', "");
   for(%i = 0; %i < ClientGroup.getCount(); %i++) {
      %client = ClientGroup.getObject(%i);
      %game.resetScore(%client);
      cancel(%client.waypointSchedule);
      cancel(%client.forceRespawnThread);
   }  
}

function BountyGame::clientMissionDropReady(%game, %client)
{
   %game.resetScore(%client);
   messageClient(%client, 'MsgClientReady', "", %game.class);
   messageClient(%client, 'MsgBountyTargetIs', "", "");
   messageClient(%client, 'MsgYourScoreIs', "", 0);
   //%objRem = %game.buildListValidTargets(%client);
   //messageClient(%client, 'MsgBountyObjRem', "", %objRem);
   //messageClient(%client, 'MsgYourRankIs', "", -1);

   messageClient(%client, 'MsgMissionDropInfo', '\c0You are in mission %1 (%2).', $MissionDisplayName, $MissionTypeDisplayName, $ServerName ); 

   DefaultGame::clientMissionDropReady(%game, %client);
}

function BountyGame::AIHasJoined(%game, %client)
{
   //let everyone know the player has joined the game
   //messageAllExcept(%client, -1, 'MsgClientJoinTeam', '%1 has joined the fray.', %client.name, "", %client, 1);
}

function BountyGame::forceRespawn(%game, %client)
{
   //make sure the player hasn't already respawned
   if (isObject(%client.player))
      return;

	commandToClient(%client, 'setHudMode', 'Standard');
   Game.spawnPlayer( %client, true );
   %client.camera.setFlyMode();
   %client.setControlObject(%client.player);
}

function BountyGame::onClientKilled(%game, %clVictim, %clKiller, %damageType, %implement, %damageLoc)
{
   DefaultGame::onClientKilled(%game, %clVictim, %clKiller, %damageType, %implement, %damageLoc);

   // you had your shot
   %clVictim.isPlaying = false;
   cancel(%clVictim.awaitingTargetThread);   

   // any time a person dies, the kill streak is reset
   %clVictim.killStreak = 0;

   //force the player to respawn
   if (!%clVictim.isAIControlled())
      %clVictim.forceRespawnThread = %game.schedule(5000, forceRespawn, %clVictim);
}

function BountyGame::onClientLeaveGame(%game, %clientId)
{
   DefaultGame::onClientLeaveGame(%game, %clientId);
   %clientId.isNotInGame = true;

   %numClients = ClientGroup.getCount();
   for (%index = 0; %index < %numClients; %index++)
   {
      %possPredator = ClientGroup.getObject(%index);
      // make sure this guy gets erased from everyone's eliminated list
      %possPredator.eliminated[%clientId] = "";

      //no need for this - anyone who has him as a target will have their colors reset in game.nextObjective()
      //reset everyones triangles to friendly and visible so the next guy that joins, doesn't get the old settings
      //setTargetFriendlyMask(%possPredator.target, getTargetFriendlyMask(%possPredator.target) | (1<<getTargetSensorGroup(%clientID.target)));
      //setTargetNeverVisMask(%possPredator.target, getTargetNeverVisMask(%possPredator.target) & ~(1<<getTargetSensorGroup(%clientID.target)));

      // if anyone had this client as a target, get them a new target
      if (%possPredator.objectiveTarget == %clientID)
      {
         messageClient(%possPredator, 'msgBountyTargetDropped', '\c2%1 has left the game and is no longer a target', %clientId.name); 
         %game.nextObjective(%possPredator);
      }
   }  
}

function BountyGame::onClientEnterObserverMode(%game, %clientId)
{
   //cancel the respawn schedule
   cancel(%clientId.forceRespawnThread);

   //notify everyone else, and choose a new objective if required...
   %numClients = ClientGroup.getCount();
   for (%index = 0; %index < %numClients; %index++)
   {
      // if anyone had this guy as a target, pick new target
      %possPredator = ClientGroup.getObject(%index);
      if (%possPredator.objectiveTarget == %clientId)
      {
         messageClient(%possPredator, 'msgBountyTargetEntObs', '\c2%1 has left the playfield and is no longer a target', %clientId.name);
         %game.nextObjective(%possPredator);
      }
   }
}

function BountyGame::onClientDamaged(%game, %clVictim, %clAttacker, %damageType, %sourceObject)
{ 
   DefaultGame::onClientDamaged(%game, %clVictim, %clAttacker, %damageType, %sourceObject);
   
   //the updateColorMask function chooses red over blue, so no need to check if each is the other's target
   if (%clAttacker.objectiveTarget == %clVictim && !%clAttacker.damagedObjectiveTarget)
   {
      %clAttacker.damagedObjectiveTarget = true;
      %game.updateColorMask(%clVictim);
   }

   //update the time at which the attacker damaged his target
   if (%clAttacker.objectiveTarget == %clVictim)
      %clAttacker.damagedTargetTime = getSimTime();
}

function BountyGame::updateKillScores(%game, %clVictim, %clKiller, %damageType, %implement)
{
   
   if (%game.testSuicide(%clVictim, %clKiller, %damageType))
      %game.awardScoreSuicide(%clVictim, %damageType);     
   else if (%game.testTargetKill(%clVictim, %clKiller)) 
      %game.awardScoreTargetKill(%clVictim, %clKiller);
   else if (%game.testPredatorKill(%clVictim, %clKiller))
      %game.awardScorePredatorKill(%clVictim, %clKiller);
   else  
      %game.awardScoreBystanderKill(%clVictim, %clKiller);
      
   if (%game.testCheating(%clVictim))
      %game.announceCheater(%clVictim);       
   
   %game.recalcScore(%clKiller);
   %game.recalcScore(%clVictim);          
}

function BountyGame::testCheating(%game, %client)
{
   return (%client.cheated > %game.MAX_CHEATDEATHS_ALLOWED);   
}  

function BountyGame::testSuicide(%game, %victimID, %killerID, %damageType)
{     
   return ((%victimID == %killerID) || (%damageType == $DamageType::Ground) || (%damageType == $DamageType::Suicide) || (%damageType == $DamageType::OutOfBounds));      
}

function BountyGame::testTargetKill(%game, %clVictim, %clKiller)
{
   // was the person you just killed your target?
   return (%clKiller.objectiveTarget == %clVictim);   
}  

function BountyGame::testPredatorKill(%game, %clVictim, %clKiller)
{
   // were you the target of the person you just killed?
   return (%clVictim.objectiveTarget == %clKiller);   
}  

function BountyGame::awardScoreSuicide(%game, %clVictim, %damageType)
{
   //now loop through the client, and award the kill to any attacker who damaged the client within 20 secs...
   for (%i = 0; %i < ClientGroup.getCount(); %i++)
   {
      %cl = ClientGroup.getObject(%i);
      if (%cl.objectiveTarget == %clVictim)
      {
         %game.awardScoreTargetKill(%clVictim, %cl, true);
         messageClient(%clVictim, 'msgBountyTarKil', '\c2You eliminated yourself.  %1 has been awarded the bounty!', %cl.name);
      }
   }

   //update the "cheated" count
   if (%damageType == $DamageType::Suicide)
   {
      %clVictim.cheated++;
      DefaultGame::awardScoreSuicide(%game, %clVictim);
   }

   %game.recalcScore(%clVictim); 
   %clVictim.killStreak = 0;
}

function BountyGame::awardScoreTargetKill(%game,%clVictim, %clKiller, %victimSuicided)
{
   // congratulations, you killed your target
   %clKiller.objectiveTargetKills++;
   %clKiller.kills = %clKiller.objectiveTargetKills;   
   %clKiller.eliminated[%clVictim] = true;

   if (%victimSuicided)
   {
      if (%clVictim.gender $= "Female")
         messageClient(%clKiller, 'msgBountyTarKil', '\c2Target %1 helped you out by eliminating herself!', %clVictim.name);
      else
         messageClient(%clKiller, 'msgBountyTarKil', '\c2Target %1 helped you out by eliminating himself!', %clVictim.name);
   }
   else
      messageClient(%clKiller, 'msgBountyTarKil', '\c2You eliminated target %1!', %clVictim.name);
   
   if (%game.SCORE_PER_TARGETKILL != 0)
      %game.recalcScore(%clKiller);
   
   %clKiller.killStreak++;
   %clVictim.killStreak = 0;
   if (%clKiller.killStreak >= %game.SIZE_STREAK_TO_AWARD) //award points for a kill streak
      %game.awardScoreKillStreak(%clKiller);

   //the victim is no longer the objective of the killer, reset his colors.
   //The colors for the killer will be reset in game.nextObjective()
   %clKiller.objectiveTarget = "";
   %game.updateColorMask(%clVictim);
   
   %game.nextObjective(%clKiller);

   //since the killer scored, update everyone who's got him as a target...
   for (%i = 0; %i < ClientGroup.getCount(); %i++)
   {
      %cl = ClientGroup.getObject(%i);
      if (%cl.objectiveTarget == %clKiller)
      {
         %cl.damagedTargetTime = 0;
         cancel(%cl.waypointSchedule);
         %game.showTargetWaypoint(%cl);
      }
   }
}  

function BountyGame::awardScoreBystanderKill(%game, %clVictim, %clKiller)
{
   // uh oh, you killed someone other than your target or the person targeting you
   %clKiller.bystanderKills++;
   //%clVictim.killStreak = 0;  //don't penalize the bystander right now, maybe change this later
   // if you'd already killed him legally, he's back on your prospective target list    

   if (mAbs(%game.SCORE_PER_BYSTANDERKILL) > 1)
     %plural = (%game.SCORE_PER_BYSTANDERKILL > 1 ? "s" : "");   
   
   if (%game.SCORE_PER_BYSTANDERKILL != 0)
   {
      messageClient(%clKiller, 'msgBountyBysKil', '\c0You have been penalized %1 point%2 for killing bystander %3.', mAbs(%game.SCORE_PER_BYSTANDERKILL), %plural, %clVictim.name); 
      messageClient(%clVictim, 'msgBountyBystander', '\c2You were the victim of %1\'s lousy aim!  He was penalized.', %clKiller.name);
      %game.recalcScore(%clKiller);
   }

   //add a target back to your list (any target)
   %targetCount = 0;
   for (%i = 0; %i < ClientGroup.getCount(); %i++)
   {
      %cl = ClientGroup.getObject(%i);
      if (%clKiller.eliminated[%cl])
      {
         %addTargetsArray[%targetCount] = %cl;
         %targetCount++;
      }
   }

   //see if we found any targets we can add back on...
   if (%targetCount > 0)
   {
      %clKiller.eliminated[%addTargetsArray[mFloor(getRandom() * (%targetCount - 0.01))]] = false;
      messageClient(%clKiller, 'msgBountyBysRedo', '\c2One target has been added back onto your Bounty list.');
   }

   %clKiller.killStreak = 0;
}

function BountyGame::awardScorePredatorKill(%game, %clVictim, %clKiller)
{   
   %clVictim.killStreak = 0;
   messageClient(%clKiller, 'msgBountyPredKill', '\c0You have temporarily fended off %1.', %clVictim.name);

   //now, try to assign a new objective target for clVictim...
   %game.nextObjective(%clVictim);

   //also update the color mask for the killer...
   %game.updateColorMask(%clKiller);
}  

function BountyGame::awardScoreKillStreak(%game, %cl)
{
   %bonus = (%cl.killStreak - %game.SIZE_STREAK_TO_AWARD) + 1;
   %cl.streakPoints += %bonus;

   messageClient(%cl,'msgBountyPlrStrkBonus', '\c0You received a %1 point bonus for a %2 kill streak!', %bonus, %cl.killStreak);
   messageAll('msgBountyStreakBonus', '\c0%1 has eliminated %2 targets in a row!', %cl.name, %cl.killStreak, %bonus); //send bonus for sound parsing     
    //callback exists in client.cs for 'msgBountyStreakBonus', to play repeating bell sound length dependent on streak
}

function BountyGame::awardScoreCompletionBonus(%game, %cl)
{
   // you killed everybody who was on your list
   %cl.compBonus = 1;
   if (%game.SCORE_PER_COMPLETION_BONUS != 0)   
      messageAll('msgBountyCompBonus', '\c2%1 receives a %2 point bonus for completing all objectives.', %cl.name, %game.SCORE_PER_COMPLETION_BONUS); 

   %game.recalcScore(%cl); 
}  


function BountyGame::announceEminentWin(%game, %cl, %objRem)
{
     %wav = "~wfx/misc/bounty_objRem" @ %objRem @ ".wav";
     %plural = (%objRem > 1 ? "s" : "");
     if (%objRem > 0)
      messageAll('msgBountyEminent', '\c2%1 has only %2 target%3 left!%4', %cl.name, %objRem, %plural, %wav);
     else
      messageAll('msgBountyOver', '\c2%1 has eliminated all targets!~wfx/misc/bounty_completed.wav', %cl.name);
}

function BountyGame::announceCheater(%game, %client)
{
   if (%client.cheated > 1)
      %plural = "s";
   else
      %plural = "";
   messageAll('msgCheater', '%1 has suicided \c2%2 \c0time%3!', %client.name, %client.cheated, %plural);
}  

function BountyGame::recalcScore(%game, %cl)
{
   %cl.score = %cl.objectiveTargetKills * %game.SCORE_PER_TARGETKILL;
   %cl.score += %cl.bystanderKills * %game.SCORE_PER_BYSTANDERKILL;
   %cl.score += %cl.suicides * %game.SCORE_PER_SUICIDE;
   %cl.score += %cl.compBonus * %game.SCORE_PER_COMPLETION_BONUS;
   %cl.score += %cl.streakPoints;  //this awarded in awardScoreKillStreak

   messageClient(%cl, 'MsgYourScoreIs', "", %cl.score);

   %game.recalcTeamRanks(%cl);      
}  

function BountyGame::resetScore(%game, %cl)
{
   %cl.score = 0;
   %cl.kills = 0;
   %cl.objectiveTargetKills = 0;
   %cl.bystanderKills = 0;
   %cl.suicides = 0;
   %cl.compBonus = 0;
   %cl.streakPoints = 0;

   cancel(%cl.awaitingTargetThread);

   %cl.killstreak = "";
   %cl.cheated = "";
   %cl.hasHadTarget = false;

   //reset %cl's hit list
   //note that although this only clears clients (enemies) currently in the game, 
   //clients (enemies) who left early should have been cleared at that time.
   %numClients = ClientGroup.getCount();
   for (%count = 0; %count < %numClients; %count++)
   {
      %enemy = ClientGroup.getObject(%count);
      %cl.eliminated[%enemy] = "";
   }  
}

function BountyGame::hudUpdateObjRem(%game, %client, %availTargets)
{
   // how many people do you have left to kill?     
    messageClient(%client, 'msgBountyObjRem', "", %availTargets);
}  

function BountyGame::enterMissionArea(%game, %playerData, %player)
{
   %player.client.outOfBounds = false; 
   messageClient(%player.client, 'EnterMissionArea', '\c1You are back in the mission area.');
   cancel(%player.alertThread);
	logEcho(%player.client.nameBase@" (pl "@%player@"/cl "@%player.client@") entered mission area");
}

function BountyGame::leaveMissionArea(%game, %playerData, %player)
{
   if(%player.getState() $= "Dead")
      return;

   %player.client.outOfBounds = true;
   messageClient(%player.client, 'LeaveMissionArea', '\c1You have left the mission area. Return or take damage.~wfx/misc/warning_beep.wav');
   %player.alertThread = %game.schedule(1000, "AlertPlayer", 3, %player);
	logEcho(%player.client.nameBase@" (pl "@%player@"/cl "@%player.client@") left mission area");
}

function BountyGame::AlertPlayer(%game, %count, %player)
{
   if(%count > 1)
      %player.alertThread = %game.schedule(1000, "AlertPlayer", %count - 1, %player);
   else 
      %player.alertThread = %game.schedule(1000, "MissionAreaDamage", %player);
}

function BountyGame::MissionAreaDamage(%game, %player)
{
   if(%player.getState() !$= "Dead") {                                   
      %player.setDamageFlash(0.1);
      %prevHurt = %player.getDamageLevel();
      %player.setDamageLevel(%prevHurt + 0.05);
      // a little redundancy to see if the lastest damage killed the player
      if(%player.getState() $= "Dead")
         %game.onClientKilled(%player.client, 0, $DamageType::OutOfBounds);
      else
         %player.alertThread = %game.schedule(1000, "MissionAreaDamage", %player);
   }
   else  
   {
      %game.onClientKilled(%player.client, 0, $DamageType::OutOfBounds);
   }  
}


function BountyGame::updateScoreHud(%game, %client, %tag)
{
   // clear the header:
   messageClient( %client, 'SetScoreHudHeader', "", "" );

   // send the subheader:
   messageClient( %client, 'SetScoreHudSubheader', "", '<tab:15,235,335>\tPLAYER\tSCORE\tTARGETS LEFT' );

   for ( %index = 0; %index < $TeamRank[0, count]; %index++ )
   {
      //get the client info
      %cl = $TeamRank[0, %index];
      %clScore = %cl.score $= "" ? 0 : %cl.score;

      //find out how many targets this client has left
      %clTargets = 0;
      for (%cIndex = 0; %cIndex < ClientGroup.getCount(); %cIndex++)
      {
         %opponent = ClientGroup.getObject(%cIndex);
         if (!%opponent.isNotInGame && %opponent.team > 0 && %opponent != %cl && !%cl.eliminated[%opponent])
            %clTargets++;
      }

      //find out if we've killed this target
      %clKilled = "";
      if ( %client.eliminated[%cl] )
         %clKilled = "<font:univers condensed:18>ELIMINATED";

      %clStyle = %cl == %client ? "<color:dcdcdc>" : "";
 
      //if the client is not an observer, send the message
      if (%client.team != 0)
      {
         messageClient( %client, 'SetLineHud', "", %tag, %index, '%5<tab:20,430>\t<clip:200>%1</clip><rmargin:280><just:right>%2<rmargin:400><just:right>%3<rmargin:610><just:left>\t<color:FF0000>%4', 
               %cl.name, %clScore, %clTargets, %clKilled, %clStyle );
      }
      //else for observers, create an anchor around the player name so they can be observed
      else
      {
         messageClient( %client, 'SetLineHud', "", %tag, %index, '%5<tab:20,430>\t<clip:200><a:gamelink\t%6>%1</a></clip><rmargin:280><just:right>%2<rmargin:400><just:right>%3<rmargin:610><just:left>\t<color:FF0000>%4', 
               %cl.name, %clScore, %clTargets, %clKilled, %clStyle, %cl );
      }
   }

   // Tack on the list of observers:
   %observerCount = 0;
   for (%i = 0; %i < ClientGroup.getCount(); %i++)
   {
      %cl = ClientGroup.getObject(%i);
      if (%cl.team == 0)
         %observerCount++;
   }

   if (%observerCount > 0)
   {
	   messageClient( %client, 'SetLineHud', "", %tag, %index, "");
      %index++;
		messageClient(%client, 'SetLineHud', "", %tag, %index, '<tab:10, 310><spush><font:Univers Condensed:22>\tOBSERVERS (%1)<rmargin:260><just:right>TIME<spop>', %observerCount);
      %index++;
      for (%i = 0; %i < ClientGroup.getCount(); %i++)
      {
         %cl = ClientGroup.getObject(%i);
         //if this is an observer
         if (%cl.team == 0)
         {
            %obsTime = getSimTime() - %cl.observerStartTime;
            %obsTimeStr = %game.formatTime(%obsTime, false);
		      messageClient( %client, 'SetLineHud', "", %tag, %index, '<tab:20, 310>\t<clip:150>%1</clip><rmargin:260><just:right>%2',
		                     %cl.name, %obsTimeStr );
            %index++;
         }
      }
   }

   //clear the rest of Hud so we don't get old lines hanging around...
   messageClient(%client, 'ClearHud', "", %tag, %index);
}

function BountyGame::applyConcussion(%game, %player)
{
}
