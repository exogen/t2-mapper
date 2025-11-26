// DisplayName = Team Rabbit 2

//--- GAME RULES BEGIN ---
//Get the flag and throw it into the other team's goal
//You can only hold onto the flag for 15 seconds
//Passing the flag increases the size of the Jackpot
//Scoring a goal awards the Jackpot to your team!
//When your health reaches zero, you are knocked down
//Replenish your ammo by pressing your suicide button
//--- GAME RULES END ---



// Team Rabbit 2
// Created by Codality, Inc.
// www.codality.com
// -------------------------------
// Michael "KineticPoet" Johnston  - Designer, Lead Programmer, Maps
// Dan "daunt" Kolta					- Physics design, Maps
// Scott "FSB-AO" Estabrook		  - Programmer
// John "CObbler" Carter			  - Bonus sound effects
// Buddy "sLaM" Pritchard			 - Sound effects
// Gregg "illy" Fellows				- 3D models and skins
// Alan "Nefilim" Schwertel;		 - Maps
// Kenneth "SONOFMAN" Cook			- Sky art


exec("scripts/TR2Packages.cs");
exec("scripts/TR2Particles.cs");
exec("scripts/TR2Physics.cs");
exec("scripts/TR2Items.cs");
exec("scripts/TR2Bonuses.cs");
exec("scripts/TR2ObserverQueue.cs");
exec("scripts/TR2Roles.cs");

$TR2::ThrownObject = "TR2Flag.dts";
//$TR2::ThrownObject = "bioderm_light.dts";  // Derm tossing
//$TR2::ThrownObject = "TR2ball.dts";		  // Ball

$TR2::DisableDeath = true;
$TR2::EnableRoles = true;
$TR2::EnableCrowd = true;
$TR2::DelayAfterKnockdown = 1800;
$TR2::MinimumKnockdownDelay = 2300;
$TR2::MaximumKnockdownDelay = 7000;
$TR2::MinSpeedForFlagSmoke = 9;
$TR2::HotPotatoTime = 14000;
$TR2::selfPassTimeout = 6500;
$TR2::CrazyFlagLifetime = 15000;
$TR2::FlagUpdateTime = 70;
$TR2::PracticeMode = false;
$TR2::GoalRespawnDelay = 4;
$TR2::TimeSlice = 2000;
$TR2::PointsPerTimeSlice = 1;
$TR2::MinimumJackpot = 40;
$TR2::MaximumJackpot = 250;
$TR2::dynamicUpdateFrequency = 1000;
$TR2::GoalieInvincibilityTime = 5000;
$TR2::FriendlyKnockdownPenalty = 15;
$TR2::MaxFlagChargeTime = 3000;
$TR2::KnockdownTimeSlice = 500;
$TR2::FlagSmokeTimeSlice = 200;
$TR2::datablockRoleChangeDelay = 400;
$TR2::DelayBetweenTeamChanges = 1000;
$TR2::OneTimerGoalBonus = 50;
$TR2::CorpseTimeoutValue = 2000;

$TR2::ObsZoomScale[0] = 1;
$TR2::ObsZoomScale[1] = 2;
$TR2::ObsZoomScale[2] = 4;
$TR2::ObsZoomScale[3] = 6;
$TR2::NumObsZoomLevels = 4;

$TR2::CrowdLevelDistance[0] = 800;
$TR2::CrowdLevelDistance[1] = 400;
$TR2::CrowdLevelDistance[2] = 210;

$DamageType::TouchedOwnGoal = 200;
$DamageType::Grid = 201;
$DamageType::RespawnAfterScoring = 202;
$DamageType::HotPotato = 203;
$DamageType::OOB = 204;

$InvincibleTime = 3;
$TR2::validatingQueue = true;

$TR2::JoinMotd = "<just:center><color:CDAD00>Team Rabbit 2 (<color:778899>build 095<color:CDAD00>)\n" @
						"Created by Codality, Inc.\nhttp://www.codality.com";


function TR2Game::sendMotd(%game, %client)
{
	bottomPrint(%client, $TR2::JoinMotd, 5, 3);
	%client.sentTR2Motd = true;
}

function TR2Game::spawnPlayer( %game, %client, %respawn )
{
	if( !isObject(%client) || %client.team <= 0 )
		return 0;
		
	%client.lastSpawnPoint = %game.pickPlayerSpawn( %client, false );
	%client.suicidePickRespawnTime = getSimTime() + 20000;
	%game.createPlayer( %client, %client.lastSpawnPoint, %respawn );

	if(!$MatchStarted && !$CountdownStarted) // server has not started anything yet
	{
		%client.camera.getDataBlock().setMode( %client.camera, "pre-game", %client.player );
		%client.setControlObject( %client.camera );
		if( $Host::TournamentMode )
		{
			%client.observerMode = "pregame";
			%client.notReady = true;
			centerprint( %client, "\nPress FIRE when ready.", 0, 3 );
			checkTourneyMatchStart();
		}		
		%client.camera.mode = "pre-game";
		//schedule(1000, 0, "commandToClient", %client, 'setHudMode', 'Observer');
		schedule(1000, 0, "commandToClient", %client, 'displayHuds');
	}
	else if(!$MatchStarted && $CountdownStarted) // server has started the countdown
	{
		%client.camera.getDataBlock().setMode( %client.camera, "pre-game", %client.player );
		%client.setControlObject( %client.camera );
		if( $Host::TournamentMode )
		{
			%client.observerMode = "pregame";
		}		
		%client.camera.mode = "pre-game";
		//schedule(1000, 0, "commandToClient", %client, 'setHudMode', 'Observer');
		schedule(1000, 0, "commandToClient", %client, 'displayHuds');
	}
	else
	{
		%client.camera.setFlyMode();
		%client.setControlObject( %client.player );
		commandToClient(%client, 'setHudMode', 'Standard'); // the game has already started
	}
}


function TR2Game::initGameVars(%game)
{
	 if (%game.oldCorpseTimeout $= "")
		 %game.oldCorpseTimeout = $CorpseTimeoutValue;

	 $CorpseTimeoutValue = $TR2::CorpseTimeoutValue;
	%game.TR2FlagSmoke = 0;
	%game.addFlagTrail = "";
	 %game.currentBonus = 0;
	 %game.updateCurrentBonusAmount(0, -1);
 
	%game.FLAG_RETURN_DELAY = 12 * 1000; //12 seconds
	%game.fadeTimeMS = 2000;
	%game.crowdLevel = -1;
	%game.crowdLevelSlot = 0;
	
	%game.resetPlayerRoles();
}

function TR2Game::onClientLeaveGame(%game, %client)
{
	//remove them from the team rank arrays
	%game.removeFromTeamRankArray(%client);	
	// First set to outer role (just to be safe)
	%game.assignOuterMostRole(%client);

	// Then release client's role
	%game.releaseRole(%client);

	if( isObject(%client.player))
		%client.player.scriptKill(0);

	if( %client.team > 0 )  // hes on a team...
	{
		%nextCl = getClientFromQueue();
		if( %nextCl != -1 )
		{
			%game.assignClientTeam(%nextCl);
			%game.spawnPlayer(%nextCl);
		}
	}
	// just in case...
	removeFromQueue(%client);

	//cancel a scheduled call...
	cancel(%client.respawnTimer);
	%client.respawnTimer = "";

	logEcho(%client.nameBase@" (cl "@%client@") dropped");
}

  // END package TR2Game

//--------------------------------------------------------------------------
// need to have this for the corporate maps which could not be fixed
function SimObject::clearFlagWaypoints(%this)
{
}

function WayPoint::clearFlagWaypoints(%this)
{
	logEcho("Removing flag waypoint: " @ %this);
	if(%this.nameTag $= "Flag")
		%this.delete();
}

function SimGroup::clearFlagWaypoints(%this)
{
	for(%i = %this.getCount() - 1; %i >= 0; %i--)
		%this.getObject(%i).clearFlagWaypoints();
}

function TR2Game::AIInit()
{
}

function TR2Game::getTeamSkin(%game, %team)
{
	 // TR2 experiment
	 switch (%team)
	 {
		 case 1:  return 'TR2-1';
		 case 2:  return 'TR2-2';
	 }

	 if(isDemo() || $host::tournamentMode)
	 {
		  return $teamSkin[%team];
	 }

	 else
	 {
	 //error("TR2Game::getTeamSkin");
	 if(!$host::useCustomSkins)
	 {
//		  %terrain = MissionGroup.musicTrack;
//		  //error("Terrain type is: " SPC %terrain);
//		  switch$(%terrain)
//		  {
//				case "lush":
//					 if(%team == 1)
//						  %skin = 'beagle';
//					 else if(%team == 2)
//						  %skin = 'dsword';
//					 else %skin = 'base';
//
//				case "badlands":
//					 if(%team == 1)
//						  %skin = 'swolf';
//					 else if(%team == 2)
//						  %skin = 'dsword';
//					 else %skin = 'base';
//
//				case "ice":
//					 if(%team == 1)
//						  %skin = 'swolf';
//					 else if(%team == 2)
//						  %skin = 'beagle';
//					 else %skin = 'base';
//
//				case "desert":
//					 if(%team == 1)
//						  %skin = 'cotp';
//					 else if(%team == 2)
//						  %skin = 'beagle';
//					 else %skin = 'base';
//
//				case "Volcanic":
//					 if(%team == 1)
//						  %skin = 'dsword';
//					 else if(%team == 2)
//						  %skin = 'cotp';
//					 else %skin = 'base';
//
//				default:
//					 if(%team == 2)
//						  %skin = 'baseb';
//					 else %skin = 'base';
//		  }
	 }
	 else %skin = $teamSkin[%team];
	 
	 //error("%skin = " SPC getTaggedString(%skin));
	 return %skin;
	 }
}

function TR2Game::getTeamName(%game, %team)
{
	if ( isDemo() || $host::tournamentMode)
		 return $TeamName[%team];

	//error("TR2Game::getTeamName");
	if(!$host::useCustomSkins)
	{
		%terrain = MissionGroup.musicTrack;
		//error("Terrain type is: " SPC %terrain);
		switch$(%terrain)
		{
			case "lush":
				if(%team == 1)
					%name = 'Blood Eagle';
				else if(%team == 2)
					%name = 'Diamond Sword';

			case "badlands":
				if(%team == 1)
					%name = 'Starwolf';
				else if(%team == 2)
					%name = 'Diamond Sword';
		  
				case "ice":
					if(%team == 1)
						%name = 'Starwolf';
					else if(%team == 2)
						%name = 'Blood Eagle';
		  
				case "desert":
					if(%team == 1)
						%name = 'Phoenix';
					else if(%team == 2)
						%name = 'Blood Eagle';
		  
				case "Volcanic":
					if(%team == 1)
						%name = 'Diamond Sword';
					else if(%team == 2)
						%name = 'Phoenix';
		  
				default:
					if(%team == 2)
						%name = 'Inferno';
					else 
						%name = 'Storm';
		}

		if(%name $= "")
		{
			//error("No team Name =============================");
			%name = $teamName[%team];
		}
	}
	else 
	  %name = $TeamName[%team];

	//error("%name = " SPC getTaggedString(%name));
	return %name;
}

//--------------------------------------------------------------------------
function TR2Game::missionLoadDone(%game)
{
	//default version sets up teams - must be called first...
	DefaultGame::missionLoadDone(%game);

	for(%i = 1; %i < (%game.numTeams + 1); %i++)
	{
		$teamScore[%i] = 0;
		$teamScoreJackpot[%i] = 0;
		$teamScoreCreativity[%i] = 0;
		$teamScorePossession[%i] = 0;
	}
	
	// AO: if there are more players on a team than open TR2 spots, we just switched from another game mode
	//	  first 12 in the clientgroup get to play, rest spec.
	%count = ClientGroup.getCount();
	%playing = 0;
	for( %i = 0; %i < %count; %i++ )
	{
		%cl = ClientGroup.getObject(%i);
		if( %cl.team > 0 )
			%playing++;
	}
	
	if( %playing > 12 )
	{
		%idx = 0;
		for( %j = 0; %j < %count; %j++ )
		{
			%cl = ClientGroup.getObject(%i);
			if( %idx < 12 )
			{ 
				if( %cl.team != 0 )
					%idx++;
				else
					addToQueue(%cl);
			}
			else
			{
				if( %cl.team != 0 )
					%game.forceObserver(%cl, "teamsMaxed");
				else
					addToQueue(%cl);
			}
		}
	}
	
		
	// KP:  Reset accumulated score
	$accumulatedScore = 0;

	// remove 
	MissionGroup.clearFlagWaypoints();

	//reset some globals, just in case...
	$dontScoreTimer[1] = false;
	$dontScoreTimer[2] = false;
 
	// KP:  Over-ride the sensor settings to remove alpha transparency
	// update colors:
	// - enemy teams are red
	// - same team is green
	// - team 0 is white
	for(%i = 0; %i < 32; %i++)
	{
		%team = (1 << %i);
		setSensorGroupColor(%i, %team, "0 255 0 -1");
		setSensorGroupColor(%i, ~%team, "255 0 0 -1");
		setSensorGroupColor(%i, 1, "255 255 255 -1");

		// setup the team targets (alwyas friendly and visible to same team)
		setTargetAlwaysVisMask(%i, %team);
		setTargetFriendlyMask(%i, %team);
	}
	setSensorGroupAlwaysVisMask(1, 0xffffffff);
	setSensorGroupFriendlyMask(1, 0xffffffff);
	setSensorGroupAlwaysVisMask(2, 0xffffffff);
	setSensorGroupFriendlyMask(2, 0xffffffff);
	
	// Init TR2 bonuses
    initializeBonuses();
	
	// Set gravity
	setGravity($TR2::Gravity);
	
	// Locate goals
	
	for (%i=1; %i<=2; %i++)
	{
		%group = nameToID("MissionGroup/Teams/team" @ %i @ "/Goal" @ %i);
		%count = %group.getCount();
		
		for (%j=0; %j<%count; %j++)
		{
			%obj = %group.getObject(%j);
			if (%obj.dataBlock $= "Goal")
			{
				$teamGoal[%i] = %obj;
				$teamGoalPosition[%i] = $teamGoal[%i].getPosition();
				break;
			}
		}
	}
	
	%sphereGroup = nameToID("MissionGroup/Sphere");
	%count = %sphereGroup.getCount();

		for (%j=0; %j<%count; %j++)
		{
			%obj = %sphereGroup.getObject(%j);
			if (%obj.interiorFile $= "sphere.dif")
			{
				$TR2::TheSphere = %obj;
				break;
			}
		}

	// Make sure everyone's spawnBuilding flag is set
	%count = ClientGroup.getCount();
	for (%i = 0; %i < %count; %i++)
	{
		%cl = ClientGroup.getObject(%i);
		if (%cl $= "" || %cl.player $= "")
			continue;

		%cl.inSpawnBuilding = true;
	}
		
	%bounds = MissionArea.area;
	%boundsWest = firstWord(%bounds);
	%boundsNorth = getWord(%bounds, 1);
		// Hack to get a permanent dynamic object for playAudio()
	//$AudioObject = new Player()
	//{
	//	datablock = TR2LightMaleHumanArmor;
	//};

	// Game threads
	%game.dynamicUpdateThread = %game.schedule(0, "dynamicUpdate");
}

function TR2Game::startMatch(%game)
{
	//serverPlay2D(GameStartSound);
	return Parent::startMatch(%game);
}

function TR2Game::dynamicUpdate(%game)
{
	//echo("DYNAMIC:  Start update");
	// Keep checking for flag and flag carrier oob because T2's enter/leave
	// mission callbacks aren't reliable
	//%game.keepFlagInBounds(true);
	
	// Only start the flag return timer if the flag is moving slowly
	if ($TheFlag.getSpeed() < 8 && $TheFlag.carrier $= "")
	{
		if (($FlagReturnTimer[$TheFlag] $= "" || $FlagReturnTimer[$TheFlag] <= 0) && !$TheFlag.onGoal && !$TheFlag.isHome)
			$FlagReturnTimer[$TheFlag] = Game.schedule(Game.FLAG_RETURN_DELAY - Game.fadeTimeMS, "flagReturnFade", $TheFlag);
	}
 
    // Little trick to alternate between queue validation and role validation with
    // each dynamic update tick
    if ($TR2::validatingQueue)
        validateQueue();
    else
        %game.validateRoles();
        
    $TR2::validatingQueue = !$TR2::validatingQueue;

	if ($TR2::enableRoles)
		%game.updateRoles();

	if ($TR2::EnableCrowd)
		%game.evaluateCrowdLevel();

	%game.dynamicUpdateThread = %game.schedule($TR2::dynamicUpdateFrequency, "dynamicUpdate");
	//echo("DYNAMIC:  End update");
}

function TR2Game::keepFlagInBounds(%game, %firstTime)
{
	if (%firstTime && ($TheFlag.isOutOfBounds() || $TheFlag.carrier.OutOfBounds))
	// Double-check, just in case we caught a gridjump
			%game.oobCheckThread = %game.schedule(500, "keepFlagInBounds", false);
	else
	{
		cancel(%game.oobCheckThread);
		if ($TheFlag.carrier.OutOfBounds)
			$TheFlag.carrier.scriptKill($DamageType::suicide);

		if ($TheFlag.isOutOfBounds())
		{
			cancel($FlagReturnTimer[$TheFlag]);
			%game.flagReturn($TheFlag);
		}
	 }
}

function TR2Game::endMission(%game)
{
	if ($DefaultGravity !$= "")
		setGravity($DefaultGravity);
		
	$CorpseTimeoutValue = %game.oldCorpseTimeout;
		
	cancel(%game.roleUpdateThread);

	// Try setting everyone's inSpawnBuilding flag to avoid weird death messages
	// between missions
	//%count = ClientGroup.getCount();
	//for (%i = 0; %i < %count; %i++)
	//{
	//	%cl = ClientGroup.getObject(%i);
	//	if (%cl $= "" || %cl.player $= "")
	//		continue;
			
	//	%cl.inSpawnBuilding = true;
	//}
	%game.forceTeamRespawn(1);
	%game.forceTeamRespawn(2);
	
	// End dynamic updates
	cancel(%game.dynamicUpdateThread);
	cancel(%game.addFlagTrail);
	cancel(%game.pointsPerTimeSliceThread);
    cancel(%game.roleValidationThread);
    
    %game.stopCrowd();
		
	Parent::endMission(%game);
}

function TR2Game::playerTouchFlag(%game, %player, %flag)
{
	//echo("playerTouchFlag()	(client = " @ %player.client @ ")");
	%client = %player.client;

   if (%player.getState() $= "Dead")
      return;

	%grabTime = getSimTime();
	%flagVel = %flag.getVelocity();
	%flagSpeed = %flag.getSpeed();
	
	if (Game.goalJustScored || %client.OutOfBounds)
		return;
		
	if (%flag.isOutOfBounds() || %player.inSpawnBuilding)
	{
		Game.flagReturn(%flag);
		return;
	}
	
	// TR2:  Try to fix the infamous flag re-catch bug
	//if (%player == %flag.dropper && %grabTime - %flag.dropTime <= 200)
	//{
	//	echo("	 RE-CATCH BUG DETECTED!");
		//%flag.setVelocity(%flag.throwVelocity);
		//return;
	//}
	
	// TR2:  don't allow players to re-grab
	if (!$TR2::PracticeMode)
		if (%player == %flag.dropper && (%grabTime - %flag.dropTime) <= $TR2::selfPassTimeout) // && %flag.oneTimer == 0)
		{
			messageClient(%client, 'MsgTR2SelfPass', '\c1You can\'t pass to yourself!');
			return;
		}
  

	if (%flag.carrier $= "")
	{
		// TR2:  Check for one-timer catches, hee
		//if (getSimTime() - %flag.oneTimer < 1500 && %flagSpeed > 3)
		//{
		//	%newVel = VectorAdd(%player.getVelocity(), VectorScale(%flagVel, 10));
		//	%player.setVelocity(%newVel);
		//	echo("  ONE-TIMER ====== " @ %flagVel);
		//}


		 // TR2:  Temporary invulnerability for goalies
		 if (%player.client.currentRole $= Goalie)
		 {
			 %player.setInvincible(true);
			 %player.schedule($TR2::GoalieInvincibilityTime, "setInvincible", false);
		 }
			 
		 
		 // Carrier health update
  		cancel(%game.updateCarrierHealth);
		game.UpdateCarrierHealth(%player);
			 
		 %chasingTeam = (%player.client.team == 1) ? 2 : 1;
			 
		 %client = %player.client;
		 %player.holdingFlag = %flag;  //%player has this flag
		 %flag.carrier = %player;  //this %flag is carried by %player

		  %player.mountImage(TR2FlagImage, $FlagSlot, true, %game.getTeamSkin(%flag.team));

		 %game.playerGotFlagTarget(%player);
		 //only cancel the return timer if the player is in bounds...
		 if (!%client.outOfBounds)
		 {
			 cancel($FlagReturnTimer[%flag]);
			 $FlagReturnTimer[%flag] = "";
		 }

		 %flag.hide(true);
		 %flag.startFade(0, 0, false);
		 %flag.isHome = false;
		 %flag.onGoal = false;
		 %flag.dropperKilled = false;
		 //if(%flag.stand)
		 //	%flag.stand.getDataBlock().onFlagTaken(%flag.stand);//animate, if exterior stand

		 $flagStatus[%flag.team] = %client.nameBase;
		 %teamName = %game.getTeamName(%flag.team);
		 setTargetSensorGroup(%flag.target, %player.team);
		 //~wfx/misc/flag_snatch.wav
		 //~wfx/misc/flag_taken.wav
		 if (!%player.flagThrowStart)
		 {
			 messageTeamExcept(%client, 'MsgTR2FlagTaken', '\c2Teammate %1 took the flag.~wfx/misc/Flagfriend.wav', %client.name, %teamName, %flag.team, %client.nameBase);
			 messageTeam(%chasingTeam, 'MsgTR2FlagTaken', '\c2%1 took the flag!~wfx/misc/Flagenemy.wav',%client.name, 0, %flag.team, %client.nameBase);
			 messageClient(%client, 'MsgTR2FlagTaken', '\c2You took the flag.~wfx/misc/Flagself.wav', %client.name, %teamName, %flag.team, %client.nameBase);

			 if (%flag.dropper $= "")
				 messageTeam(0, 'MsgTR2FlagTaken', '\c4%1 took the flag.~wfx/misc/Flagself.wav', %client.name, %teamName, %flag.team, %client.nameBase);
			 else if (%flag.dropper.team != %player.team)
				 messageTeam(0, 'MsgTR2FlagTaken', '\c2%1 intercepted the flag!~wfx/misc/Flagenemy.wav', %client.name, %teamName, %flag.team, %client.nameBase);
			 else
				 messageTeam(0, 'MsgTR2FlagTaken', '\c3%1 caught the flag.~wfx/misc/Flagfriend.wav', %client.name, %teamName, %flag.team, %client.nameBase);

			 logEcho(%client.nameBase@" (pl "@%player@"/cl "@%client@") took team "@%flag.team@" flag");
		  }

		 //call the AI function
		 //%game.AIplayerTouchEnemyFlag(%player, %flag);


		 //if the player is out of bounds, then in 3 seconds, it should be thrown back towards the in bounds area...
		 //if (%client.outOfBounds)
		 //	%game.schedule(3000, "boundaryLoseFlag", %player);
			 
		 // TR2:  Schedule new hot potato
		 if (%game.hotPotatoThread !$= "")
			 cancel(%game.hotPotatoThread);
		 if (!$TR2::PracticeMode)
		 {
			 %game.hotPotatoThread = %game.schedule($TR2::hotPotatoTime, "hotPotato", %player, true);
			 
			 // Schedule points-per-second
			 %game.pointsPerTimeSliceThread = %game.schedule($TR2::timeSlice, "awardPointsPerTimeSlice");
		 }

		 //%flag.oneTimer = 0;

		 // Set observers to flag carrier
		  for( %i = 0; %i <ClientGroup.getCount(); %i++ )
	 	{
	 		%cl = ClientGroup.getObject(%i);
	 		if(%cl.team <= 0 && %cl.tr2SpecMode == 1)
	 		{
	 			%game.observeObject(%cl, %player.client, 1);
	 		}
	 	}
	  
		 // Finally, calculate bonus (potentially processor intensive)
		 // TR2:  Flag bonus evaluation function
		 if ($TR2::PracticeMode ||
				 ($TheFlag.specialPass $= "" &&
				  %player != %flag.dropper && %player.client.name !$= %flag.dropperName)) // && !%player.flagThrowStart)
			 FlagBonus.evaluate(%flag.dropper, %player, %flag);
		 else
			 $TheFlag.specialPass = "";
			 
		 // TR2:  Check for one-timers
		 if (%player.flagThrowStart)
		 {
			 %player.flagThrowStrength = 1.2;
			 %flag.lastOneTimer = %flag.oneTimer;
			 %flag.oneTimer = getSimTime();
			 if (%flag.oneTimer - %flag.lastOneTimer < 2000)
				 $TheFlag.specialPass = "OneTimer";
			 Game.dropFlag(%player);
			 ServerPlay2D(SlapshotSound);
		 }
		 else
			 %flag.oneTimer = 0;
	}

	// toggle visibility of the flag
	//setTargetRenderMask(%flag.waypoint.getTarget(), %flag.isHome ? 0 : 1);
	
	 // TR2:  cancel a hack
	 cancel($UpdateFlagThread);
}

function TR2Game::awardPointsPerTimeSlice(%game)
{
  //echo("........TICK.......");
  cancel(%game.pointsPerTimeSliceThread);
  %game.giveInstantBonus($TheFlag.carrier.team, $TR2::pointsPerTimeSlice);
  $TeamScorePossession[$TheFlag.carrier.team] += $TR2::pointsPerTimeSlice;
  %game.pointsPerTimeSliceThread = %game.schedule($TR2::timeSlice, "awardPointsPerTimeSlice");
}

function TR2Game::UpdateCarrierHealth(%game, %player)
{
	%maxDamage = %player.getDatablock().maxDamage;
	%health = ((%maxDamage - %player.getDamageLevel()) / %maxDamage) * 200;
	%amt = mFloor(%health/10) * 5; // round to nearest 5%

	%otherTeam = %player.client.team == 1 ? 2 : 1;

	messageTeam(%player.client.team, 'MsgTR2CarrierHealth', "", %amt / 100, 1);
	messageTeam(%otherTeam, 'MsgTR2CarrierHealth', "", %amt / 100, 0);
	// update observers (green = team 1, red = team 2)
	messageTeam(0,  'MsgTR2CarrierHealth', "", %amt / 100, %player.client.team);

	//echo("Carrier health: " @ %amt @ " - Damage Level: " @ %health);
	%game.updateCarrierHealthThread = %game.schedule( 700, "UpdateCarrierHealth", %player);
}

function TR2Game::playerGotFlagTarget(%game, %player)
{
	%player.scopeWhenSensorVisible(true);
	%target = %player.getTarget();
	setTargetRenderMask(%target, getTargetRenderMask(%target) | 0x2);
	//if(%game.stalemateObjsVisible)
		setTargetAlwaysVisMask(%target, 0x7);
}

function TR2Game::playerLostFlagTarget(%game, %player)
{
	%player.scopeWhenSensorVisible(false);
	%target = %player.getTarget();
	setTargetRenderMask(%target, getTargetRenderMask(%target) & ~0x2);
	// clear his always vis target mask
	setTargetAlwaysVisMask(%target, (1 << getTargetSensorGroup(%target)));
}

function TR2Game::updateFlagTransform(%game)
{
	//%vel = $TheFlag.getVelocity();
	//echo(%vel @ " => " @ VectorLen(%vel));
	
	// Try updating its transform to force a client update
	$TheFlag.setTransform($TheFlag.getTransform());
	$updateFlagThread = %game.schedule($TR2::FlagUpdateTime, "updateFlagTransform");
}

function TR2Game::playerDroppedFlag(%game, %player)
{
	//echo("playerDroppedFlag()	(client = " @ %player.client @ ")");
	%client = %player.client;
	%flag = %player.holdingFlag;
	
	// Cancel points per time slice
	cancel(%game.pointsPerTimeSliceThread);

	%game.playerLostFlagTarget(%player);

	%player.holdingFlag = ""; //player isn't holding a flag anymore
	%flag.carrier = "";  //flag isn't held anymore 
	$flagStatus[%flag.team] = "<In the Field>";
	setTargetSensorGroup(%flag.target, 3);
	
	// Carrier health update
	cancel(%game.updateCarrierHealthThread);
	messageAll('MsgTR2CarrierHealth', "", 0);
	
	%player.unMountImage($FlagSlot);	
	%flag.hide(false); //Does the throwItem function handle this?
	
	// TR2:  Give the flag some extra oomph
	//%flagVel = %flag.getVelocity();
	//%playerVel = %player.getVelocity();
	//%playerRot = %player.getEyeVector();
	//%playerVelxy = setWord(%playerVel, 2, 0);
	//%playerVelxz = setWord(%playerVel, 1, 0);
	//%playerVelyz = setWord(%playerVel, 0, 0);
	//%playerRotxy = setWord(%playerRot, 2, 0);
	//%playerRotxz = setWord(%playerRot, 1, 0);
	//%playerRotyz = setWord(%playerRot, 0, 0);
	//%dotxy = VectorDot(VectorNormalize(%playerVelxy), VectorNormalize(%playerRotxy));
	//%dotxz = VectorDot(VectorNormalize(%playerVelxz), VectorNormalize(%playerRotxz));
	//%dotyz = VectorDot(VectorNormalize(%playerVelyz), VectorNormalize(%playerRotyz));
	//echo(" *********VEL dot ROT (xy) = " @ %dotxy);
	//echo(" *********VEL dot ROT (xz) = " @ %dotxz);
	//echo(" *********VEL dot ROT (yz) = " @ %dotyz);
	//%testDirection = VectorDot(VectorNormalize(%playerVel), VectorNormalize(%playerRot));
	//%playerVel = VectorScale(%playerVel, 80);
	//%playerRot = VectorScale(%playerRot, 975);
	//%flag.setTransform(VectorAdd(VectorNormalize(%playerRot), %player.getPosition()));

	//%newVel = VectorAdd(%newVel, %playerRot);
	
	// Don't apply the velocity impulse if the player is facing one direction
	// but travelling in the other
	//if (%testDirection > -0.85)
	//	%newVel = VectorAdd(%playerVel, %newVel);

	// apply the impulse to the flag object
	//%flag.applyImpulse(%flag.getPosition(), %newVel);
	//%player.getWorldBoxCenter()
	%flag.dropper = %player;
	%flag.dropperVelocity = %player.getVelocity();
	%flag.dropperOrientation = %player.getEyeVector();
	%flag.dropperHeight = %player.getHeight();
	%flag.dropperPosition = %player.getPosition();
	%flag.dropTime = getSimTime();

	// Argh, remember actual name to prevent self-pass exploit
	%flag.dropperName = %player.client.name;

	//%flag.setCollisionTimeout(%player);

	 %teamName = %game.getTeamName(%flag.team);
	 %chasingTeam = (%player.client.team == 1) ? 2 : 1;
	 //~wfx/misc/flag_drop.wav
	messageTeamExcept(%client, 'MsgTR2FlagDropped', '\c2Teammate %1 dropped the flag.~wfx/misc/flagflap.wav', %client.name, %teamName, %flag.team);
	messageTeam(%chasingTeam, 'MsgTR2FlagDropped', '\c2The flag has been dropped by %1!~wfx/misc/flagflap.wav', %client.name, 0, %flag.team);
	messageTeam(0, 'MsgTR2FlagDropped', '\c2%1 dropped the flag.~wfx/misc/flagflap.wav', %client.name, %teamName, %flag.team);
	if(!%player.client.outOfBounds)
		messageClient(%client, 'MsgTR2FlagDropped', '\c2You dropped the flag.~wfx/misc/flagflap.wav', 0, %teamName, %flag.team);
	logEcho(%client.nameBase@" (pl "@%player@"/cl "@%client@") dropped team "@%flag.team@" flag");

	// TR2:  Cancel hot potato thread
	cancel(%game.hotPotatoThread);


	//if( %flag.getSpeed() <= $TR2::MinSpeedForFlagSmoke && $FlagReturnTimer[%flag] <= 0)
	//	$FlagReturnTimer[%flag] = %game.schedule(%game.FLAG_RETURN_DELAY - %game.fadeTimeMS, "flagReturnFade", %flag);

	
	// Set observers
	for( %i = 0; %i <ClientGroup.getCount(); %i++ )
	{
		%cl = ClientGroup.getObject(%i);
		if(%cl.team <= 0 && %cl.tr2SpecMode)
		{
			%game.observeObject(%cl, $TheFlag, 2);
		}
	 }
	  
	//call the AI function
	//%game.AIplayerDroppedFlag(%player, %flag);

	
	// TR2:  Hack to force an update of the flag's position
	%game.updateFlagTransform();
}

function TR2Game::observeObject(%game, %client, %target, %type)
{
	 if (!isObject(%client) || !isObject(%target) || !isObject(%client.camera))
		 return;

	if( %client.tr2SpecMode != 1 )
		return;

	//echo("Camera rotation: " @ %client.camera.rotation );
	//%client.lastRot = %client.camera.rotation;
	%transform = %client.camera.getTransform();
	%lastRot = getWord(%transform, 3) SPC getWord(%transform, 4) SPC getWord(%transform, 5) SPC getWord(%transform, 6);
	%client.lastObsRot = %lastRot;
	// Ugly...oh well
	%client.observeTarget = %target;
	%client.observeType = %type;

	switch( %type )
	{
		case 1: // observing players
			%client.camera.getDataBlock().setMode(%client.camera, "observerFollow", %target.player);
			%client.setControlObject(%client.camera);
			clearBottomPrint(%client);
		case 2: // observing a dropped flag
			%client.camera.getDataBlock().setMode(%client.camera, "followFlag", $TheFlag);
			%client.setControlObject(%client.camera);
			clearBottomPrint(%client);
		default:
			clearBottomPrint(%client);
		  	return;
	}
	//%position = %client.camera.getPosition();
	//%client.camera.setTransform(%position SPC %lastRot);
}

function TR2Game::flagReturnFade(%game, %flag)
{
	$FlagReturnTimer[%flag] = %game.schedule(%game.fadeTimeMS, "flagReturn", %flag);
	%flag.startFade(%game.fadeTimeMS, 0, true);
}

function TR2Game::flagReturn(%game, %flag, %player)
{
	cancel($FlagReturnTimer[%flag]);
	$FlagReturnTimer[%flag] = "";
	
	%flag.setVelocity("0 0 0");
	%flag.setTransform(%flag.originalPosition);
	%flag.isHome = true;
	%game.flagReset(%flag);
	
	MessageAll('MsgFlagReturned', '\c2The flag has respawned in the middle of the map.~wfx/misc/flagreturn.wav');

	// TR2:  variable resets
	//%game.currentBonus = 0;
	//%game.updateCurrentBonusAmount(0, -1);
	
	// TR2:  cancel hack
	cancel($UpdateFlagThread);
}



function TR2Game::flagReset(%game, %flag)
{

	//make sure if there's a player carrying it (probably one out of bounds...), it is stripped first
	if (isObject(%flag.carrier))
	{
		//hide the target hud icon for slot 2 (a centermass flag - visible only as part of a teams sensor network)
		%game.playerLostFlagTarget(%flag.carrier);
		%flag.carrier.holdingFlag = ""; //no longer holding it.
		%flag.carrier.unMountImage($FlagSlot);
	}

	//fades, restore default position, home, velocity, general status, etc.
	%flag.carrier = "";
	%flag.grabber = "";
	%flag.dropper = "";
	$flagStatus[%flag.team] = "<At Base>";
	%flag.hide(false);
	if(%flag.stand)
		%flag.stand.getDataBlock().onFlagReturn(%flag.stand);//animate, if exterior stand

	//fade the flag in...
	%flag.startFade(%game.fadeTimeMS, 0, false);			

	// dont render base target
	setTargetRenderMask(%flag.waypoint.getTarget(), 0);
	
	FlagBonusHistory.initialize();

	//call the AI function
	//%game.AIflagReset(%flag);
}

function TR2Game::timeLimitReached(%game)
{
	logEcho("game over (timelimit)");
	%game.gameOver();
	cycleMissions();
}

function TR2Game::scoreLimitReached(%game)
{
	logEcho("game over (scorelimit)");
	%game.gameOver();
	cycleMissions();
}

function TR2Game::hotPotato(%game, %player, %firstWarning)
{
	if (!isObject(%player) || %player.getState() $= "Dead")
		return;
		
	if (%firstWarning)
	{
		// Display message
		messageAll('TR2HotPotato', "The flag is getting hot!~wfx/misc/bounty_objrem1.wav");
		%game.hotPotatoThread = %game.schedule(3000, "hotPotato", %player, false);
	} else {
		// Do damage
		messageClient(%player.client, 'TR2HotPotato', "Hot potato...pass the flag!~wfx/misc/red_alert_short.wav");
		%player.setDamageFlash(0.1);
		%player.damage(0, %player.position, 0.12, $DamageType::HotPotato);
		%game.hotPotatoThread = %game.schedule(1000, "hotPotato", %player, false);
	}
	
}

function TR2Game::gameOver(%game)
{
	//call the default
	DefaultGame::gameOver(%game);

	//send the winner message
	%winner = "";
	if ($teamScore[1] > $teamScore[2])
		%winner = %game.getTeamName(1);
	else if ($teamScore[2] > $teamScore[1])
		%winner = %game.getTeamName(2);

	//if (%winner $= 'Storm')
	//	messageAll('MsgGameOver', "Match has ended.~wvoice/announcer/ann.stowins.wav" );
	//else if (%winner $= 'Inferno')
	//	messageAll('MsgGameOver', "Match has ended.~wvoice/announcer/ann.infwins.wav" );
	//else if (%winner $= 'Starwolf')
	//	messageAll('MsgGameOver', "Match has ended.~wvoice/announcer/ann.swwin.wav" );
	//else if (%winner $= 'Blood Eagle')
	//	messageAll('MsgGameOver', "Match has ended.~wvoice/announcer/ann.bewin.wav" );
	//else if (%winner $= 'Diamond Sword')
	//	messageAll('MsgGameOver', "Match has ended.~wvoice/announcer/ann.dswin.wav" );
	//else if (%winner $= 'Phoenix')
	//	messageAll('MsgGameOver', "Match has ended.~wvoice/announcer/ann.pxwin.wav" );
	//else
	messageAll('MsgGameOver', "Match has ended.~wfx/misc/gameover.wav" );

	messageAll('MsgClearObjHud', "");
	for(%i = 0; %i < ClientGroup.getCount(); %i ++) 
	{
		%client = ClientGroup.getObject(%i);
		%game.resetScore(%client);
	}
	for(%j = 1; %j <= %game.numTeams; %j++)
		$TeamScore[%j] = 0;

	$accumulatedScore = 0;
}

function TR2Game::onClientDamaged(%game, %clVictim, %clAttacker, %damageType, %implement, %damageLoc)
{ 
	if (%game.goalJustScored)
		return;
		
	//if(%clVictim.headshot && %damageType == $DamageType::Laser && %clVictim.team != %clAttacker.team)
	//{

	//}
	
	// Try to give a free self-inflicted wound when invincible
	if (%clVictim.player.invincible && %clVictim == %clAttacker)
	{
		%clVictim.player.invincible = false;
		return;
	}
	
	//the DefaultGame will set some vars
	DefaultGame::onClientDamaged(%game, %clVictim, %clAttacker, %damageType, %implement, %damageLoc);
	
	//if victim is carrying a flag and is not on the attackers team, mark the attacker as a threat for x seconds(for scoring purposes)
	if ((%clVictim.holdingFlag !$= "") && (%clVictim.team != %clAttacker.team))
	{
		%clAttacker.dmgdFlagCarrier = true;
	}
	
	if (!%clVictim.player.invincible)
		G4Bonus.evaluate(%clAttacker.player, %clVictim.player, $TheFlag, %damageType, %damageLoc);
	//$DamageBonus.evaluate(%clAttacker, %clVictim, %damageType, %damageLoc);

}
		
////////////////////////////////////////////////////////////////////////////////////////
//function TR2Game::assignClientTeam(%game, %client, %respawn)
//{
//	DefaultGame::assignClientTeam(%game, %client, %respawn);
//	// if player's team is not on top of objective hud, switch lines
//	messageClient(%client, 'MsgCheckTeamLines', "", %client.team);
//}

function TR2Game::updateCurrentBonusAmount(%this, %bonus, %team)
{
	 %this.currentBonus += %bonus;
	 if (%this.currentBonus > $TR2::MaximumJackpot)
		 %this.currentBonus = $TR2::MaximumJackpot;

	 // Don't color the Jackpot until it's big enough
	 if (%this.currentBonus < $TR2::MinimumJackpot)
		 %team = -1;
		 
	 %this.setBonus(%this.currentBonus, %team);
	//for( %i = 0; %i < ClientGroup.getCount(); %i++ )
	//{
	//	%cl = ClientGroup.getObject(%i);
	//	%flag = %cl.team == %team ? 1 : 0;
	//	messageClient(%cl, 'MsgTR2UpdateBonus', "", %this.currentBonus, %flag);
	//}
}

function TR2Game::setBonus(%game, %bonus, %team)
{
	if( %bonus $= "0" || %team == -1 )
		messageAll('MsgTR2Bonus', "", %bonus, $TR2::NeutralColor);
	else
	{
		messageAllExcept(-1, %team, 'MsgTR2Bonus', "", %bonus, $TR2::RedColor);
		messageTeam(%team, 'MsgTR2Bonus', "", %bonus, $TR2::GreenColor);
	}
}

function TR2Game::giveInstantBonus(%this, %team, %amount)
{
	$teamScore[%team] += %amount;
	messageAll('MsgTR2SetScore', "", %team, $teamScore[%team]);
}

function TR2Game::recalcScore(%game, %cl)
{

}

function TR2Game::updateKillScores(%game, %clVictim, %clKiller, %damageType, %implement)
{

}


function TR2Game::testCarrierKill(%game, %victimID, %killerID)
{
	%flag = %victimID.plyrDiedHoldingFlag;
	return ((%flag !$= "") && (%flag.team == %killerID.team));  
}



function TR2Game::resetDontScoreTimer(%game, %team)
{
	$dontScoreTimer[%team] = false;
}

function TR2Game::checkScoreLimit(%game, %team)
{

}

function TR2Game::clientMissionDropReady(%game, %client)
{
	// TR2 specific anti-non-vchat-wav-spam-thing...
	if( getTaggedString(%client.voiceTag) $= "" )
	{
		removeTaggedString(%client.voiceTag);

		%raceGender = %client.race SPC %client.sex;
	   switch$ ( %raceGender )
	   {
	      case "Human Male":
	         %voice = "Male1";
	      case "Human Female":
	         %voice = "Fem1";
	      case "Bioderm":
	         %voice = "Derm1";
	      default:
	      	%voice = "Male1";
	   }
	   %client.voiceTag = addTaggedString(%voice);
	}
		
	 %game.sendMotd(%client);
	//error(%client @ " - " @ %client.nameBase @ " - Team: " @ %client.team @ " - Last: " @ %client.lastTeam);
	if( %client.team <= 0 || %client.team $= "" )
		addToQueue(%client);
	if( %client.tr2SpecMode $= "" )
		%client.tr2SpecMode = true;
	if( %client.specOnly $= "" )
		%client.specOnly = false;
	messageClient(%client, 'MsgClientReady',"", %game.class);
	%game.resetScore(%client);

	%score1 = $Teams[1].score != 0 ? $Teams[1].score : 0;
	%score2 = $Teams[2].score != 0 ? $Teams[2].score : 0;

	if( $TheFlag.isHome )
	{
		%flagLoc = "Center";
		%carrierHealth = 0;
	}
	else if( $TheFlag.onGoal )
	{
		%flagLoc = "On goal";
		%carrierHealth = 0;
	}
	else if( $TheFlag.carrier !$= "" )
	{
		%flagLoc = $TheFlag.carrier.client.name;
		%maxDamage = $TheFlag.carrier.getDatablock().maxDamage;
		%health = ((%maxDamage - $TheFlag.carrier.getDamageLevel()) / %maxDamage) * 200;
		%carrierHealth = mFloor(%health/10) * 5;
	}
	else
	{
		%flagLoc = "Dropped";
		%carrierHealth = 0;
	}
	

	%client.inSpawnBuilding = true;

	messageClient(%client, 'MsgTR2ObjInit', "", %game.getTeamName(1), %game.getTeamName(2), %score1, %score2, %flagLoc, %carrierHealth, %game.currentBonus );
	messageClient(%client, 'MsgMissionDropInfo', '\c0You are in mission %1 (%2).', $MissionDisplayName, $MissionTypeDisplayName, $ServerName );

	//synchronize the clock HUD
	messageClient(%client, 'MsgSystemClock', "", 0, 0);

	%game.sendClientTeamList( %client );
	%game.setupClientHuds( %client );

	%client.camera.setFlyMode();

	%observer = false;
	if( !$Host::TournamentMode )
	{
		if( 	%client.camera.mode $= "observerFly" || %client.camera.mode $= "justJoined" ||
			 	%client.camera.mode $= "followFlag" || %client.camera.mode $= "observerFollow" )
		{
			%observer = true;
			%client.observerStartTime = getSimTime();
			commandToClient(%client, 'setHudMode', 'Observer');
			%client.setControlObject( %client.camera );
		}

		if( (%client.team <= 0 || %client.team $= "") && getActiveCount() < (6 * 2) )
		{
			%observer = false;
			%game.assignClientTeam(%client, 0);
			%game.spawnPlayer(%client, 0);
		}

		if( %observer )
		{
			if( %client.tr2SpecMode == 1 )
			{
				if( $TheFlag.carrier $= "" )
					Game.observeObject(%client, $TheFlag, 2);
				else
					Game.observeObject(%client, $TheFlag.carrier.client, 1);
			}
			else
				%client.camera.getDataBlock().setMode( %client.camera, "ObserverFly" );
		}
	}
	else
	{
		// set all players into obs mode. setting the control object will handle further procedures...
		if( %client.tr2SpecMode == 1 )
		{
			if( $TheFlag.carrier $= "" )
				Game.observeObject(%client, $TheFlag, 2);
			else
				Game.observeObject(%client, $TheFlag.carrier.client, 1);
		}
		else
			%client.camera.getDataBlock().setMode( %client.camera, "ObserverFly" );
		%client.setControlObject( %client.camera );
		messageAll( 'MsgClientJoinTeam', "",%client.name, $teamName[0], %client, 0 );
		%client.team = 0;

		if( !$MatchStarted && !$CountdownStarted)
		{
			if($TeamDamage)
				%damMess = "ENABLED";
			else
				%damMess = "DISABLED";

			if( %game.numTeams > 1 && %client.lastTeam != 0 && %client.lastTeam !$= "" )
				BottomPrint(%client, "Server is Running in Tournament Mode.\nPick a Team\nTeam Damage is " @ %damMess, 0, 3 );
		}
		else
		{
			BottomPrint( %client, "\nServer is Running in Tournament Mode", 0, 3 );
		}
	}

	//make sure the objective HUD indicates your team on top and in green...
	if (%client.team > 0)
		messageClient(%client, 'MsgCheckTeamLines', "", %client.team);

	// were ready to go.
	%client.matchStartReady = true;
	echo("TR2: Client" SPC %client SPC "is ready.");

	if ( isDemo() )
	{
		if ( %client.demoJustJoined )
		{
			%client.demoJustJoined = false;
			centerPrint( %client, "Welcome to the Tribes 2 Demo." NL "You have been assigned the name \"" @ %client.nameBase @ "\"." NL "Press FIRE to join the game.", 0, 3 );
		}
	}
}
function TR2Game::resetScore(%game, %client)
{
	%client.kills = 0;
	%client.deaths = 0;
	%client.suicides = 0;
	%client.score = 0;
	%client.midairDiscs = 0;
	%client.kidneyThiefSteals = 0;
	%client.goals = 0;
	%client.assists = 0;
	%client.saves = 0;
	%client.hareHelpers = 0;
	%client.receivingScore = 0;
	%client.passingScore = 0;
	%client.interceptingScore = 0;
	%client.fcHits = 0;
	
	// Set outermost role
	%game.assignOutermostRole(%client);
	
	for (%i=o; %i<$TR2::numRoles; %i++)
	{
		%role = $TR2::role[%i];
		%client.roleChangeTicks[%role] = 0;
	}
	// etc...
}

function TR2Game::boundaryLoseFlag(%game, %player)
{
	// this is called when a player goes out of the mission area while holding
	// the enemy flag. - make sure the player is still out of bounds
	if (!%player.client.outOfBounds || !isObject(%player.holdingFlag))
		return;

	%client = %player.client;
	%flag = %player.holdingFlag;
	%flag.setVelocity("0 0 0");
	%flag.setTransform(%player.getWorldBoxCenter());
	%flag.setCollisionTimeout(%player);

	%game.playerDroppedFlag(%player);

	// now for the tricky part -- throwing the flag back into the mission area
	// let's try throwing it back towards its "home"
	%home = %flag.originalPosition;
	%vecx =  firstWord(%home) - firstWord(%player.getWorldBoxCenter());
	%vecy = getWord(%home, 1) - getWord(%player.getWorldBoxCenter(), 1);
	%vecz = getWord(%home, 2) - getWord(%player.getWorldBoxCenter(), 2);
	%vec = %vecx SPC %vecy SPC %vecz;

	// normalize the vector, scale it, and add an extra "upwards" component
	%vecNorm = VectorNormalize(%vec);
	%vec = VectorScale(%vecNorm, 1500);
	%vec = vectorAdd(%vec, "0 0 500");

	// apply the impulse to the flag object
	%flag.applyImpulse(%player.getWorldBoxCenter(), %vec);

	//don't forget to send the message
	messageClient(%player.client, 'MsgTR2FlagDropped', '\c1You have left the mission area and lost the flag.~wfx/misc/flag_drop.wav', 0, 0, %player.holdingFlag.team);
	logEcho(%player.client.nameBase@" (pl "@%player@"/cl "@%player.client@") lost flag (out of bounds)");
}

function TR2Game::dropFlag(%game, %player)
{
	if(%player.holdingFlag > 0)
	{
		if (!%player.client.outOfBounds)
			%player.throwObject(%player.holdingFlag);
		else
			%game.boundaryLoseFlag(%player);
	}
}

function TR2Game::applyConcussion(%game, %player)
{
	%game.dropFlag( %player );
}


function TR2Game::testKill(%game, %victimID, %killerID)
{
	return ((%killerID !=0) && (%victimID.team != %killerID.team));
}

function TR2Game::equip(%game, %player)
{
	%cl = %player.client;
	for(%i =0; %i<$InventoryHudCount; %i++)
		%cl.setInventoryHudItem($InventoryHudData[%i, itemDataName], 0, 1);
	%cl.clearBackpackIcon();

	//%player.setArmor("Light");
	%player.setInventory(RepairKit,1);
	%player.setInventory(TR2Disc,1);
	%player.setInventory(TR2GrenadeLauncher,1);
	%player.setInventory(TR2Chaingun, 1);
	%player.weaponCount = 3;
	
	if (%cl.restockAmmo)
	{
		%player.setInventory(TR2ChaingunAmmo, 100);
		%player.setInventory(TR2DiscAmmo, 15);
		%player.setInventory(TR2GrenadeLauncherAmmo, 10);
		%player.setInventory(Beacon, 3);
		%player.setInventory(TR2Grenade,5);
	}
	else
		%game.restockRememberedAmmo(%cl);

	%player.setInventory(TR2EnergyPack, 1);

	%targetingLaser = (%player.team == 1) ? TR2GoldTargetingLaser : TR2SilverTargetingLaser;
	%player.setInventory(%targetingLaser, 1);
	
	%player.use("TR2Disc");
}

function TR2Game::playerSpawned(%game, %player)
{
	if( %player.client.respawnTimer)
		cancel(%player.client.respawnTimer);

	%player.client.observerStartTime = "";
	%game.equip(%player);

	%player.client.spawnTime = getSimTime();
}

function TR2Game::rememberAmmo(%game, %client)
{
	%pl = %client.player;
	%client.lastChaingunAmmo = %pl.invTR2ChaingunAmmo;
	%client.lastDiscAmmo = %pl.invTR2DiscAmmo;
	%client.lastGrenadeLauncherAmmo = %pl.invTR2GrenadeLauncherAmmo;
	%client.lastGrenades = %pl.invTR2Grenade;
	%client.lastBeacons = %pl.invBeacon;
	
	// Remember role items
	for (%i=0; %i<$TR2::roleNumExtraItems[%client.currentRole]; %i++)
		%client.lastRoleItemCount[%i] = %pl.extraRoleItemCount[%i];
}

function TR2Game::restockRememberedAmmo(%game, %client)
{
	%player = %client.player;
	%player.setInventory(TR2ChaingunAmmo, %client.lastChaingunAmmo);
	%player.setInventory(TR2DiscAmmo, %client.lastDiscAmmo);
	%player.setInventory(TR2GrenadeLauncherAmmo, %client.lastGrenadeLauncherAmmo);
	%player.setInventory(TR2Grenade,%client.lastGrenades);
	%player.setInventory(Beacon, %client.lastBeacons);
	
	%game.equipRoleWeapons(%player.client);
}

function TR2Game::penalty(%game, %player, %text, %amount)
{
	$teamScore[%player.team] -= %amount;
	messageAll('MsgTR2SetScore', "", %player.team, $teamScore[%player.team]);
	messageAll('MsgTR2Penalty', "\c3-" @ %amount SPC "\c1PENALTY:  " @ %text @ " \c0(" @ getTaggedString(%player.client.name) @ ")~wfx/misc/whistle.wav");
}

function TR2Game::onClientKilled(%game, %clVictim, %clKiller, %damageType, %implement, %damageLocation)
{	  
	//echo ("CLIENT KILLED (" @ %clVictim @ ")");
	%plVictim = %clVictim.player;
	%plKiller = %clKiller.player;
	%clVictim.plyrPointOfDeath = %plVictim.position;
	%clVictim.plyrDiedHoldingFlag = %plVictim.holdingFlag;
	%clVictim.waitRespawn = 1;
	
	cancel( %plVictim.reCloak );
	cancel(%clVictim.respawnTimer);
	%clVictim.respawnTimer = %game.schedule(($Host::PlayerRespawnTimeout * 1000), "forceObserver", %clVictim, "spawnTimeout" );

	// reset the alarm for out of bounds
	if(%clVictim.outOfBounds)
		messageClient(%clVictim, 'EnterMissionArea', "");

	// TR2:  Get rid of suicide delay
	if (%damageType == $DamageType::suicide)
		%respawnDelay = 2;
	else
		%respawnDelay = 2;
		
	// TR2:  Teamkill penalty
	if (%plVictim != %plKiller && %plVictim.team == %plKiller.team)
	{
		if (%plKiller.gogoKill)
			%plKiller.gogoKill = false;
		else
		  %game.schedule(1000, "penalty", %plKiller, "Friendly knockdown", $TR2::FriendlyKnockdownPenalty);
	}
	// TR2:  Handle flag carrier kills
	// Bonus evaluation
	if (%plVictim == $TheFlag.carrier)
	{
		$TheFlag.dropperKilled = true;

		// Reset the bonus pot
		//Game.currentBonus = 0;
		//Game.updateCurrentBonusAmount(0, -1);
		
		if(%plVictim.team != %plKiller.team && %clKiller != 0)
			WeaponBonus.evaluate(%plKiller, %plVictim, %damageType);
	}

	%game.schedule(%respawnDelay*1000, "clearWaitRespawn", %clVictim);
	// if victim had an undetonated satchel charge pack, get rid of it
	if(%plVictim.thrownChargeId != 0)
		if(!%plVictim.thrownChargeId.kaboom)
			%plVictim.thrownChargeId.delete();

	 //if(%plVictim.inStation)
	 //  commandToClient(%plVictim.client,'setStationKeys', false);
	%clVictim.camera.mode = "playerDeath";

	// reset who triggered this station and cancel outstanding armor switch thread	
	//if(%plVictim.station)
	//{
	//	%plVictim.station.triggeredBy = "";
	//	%plVictim.station.getDataBlock().stationTriggered(%plVictim.station,0);
	//	if(%plVictim.armorSwitchSchedule)
	//		cancel(%plVictim.armorSwitchSchedule);
	//}

	//%clVictim.inSpawnBuilding = false;
	
	if (!$TR2::DisableDeath)
		%plVictim.inSpawnBuilding = true;
		
	if (%damageType == $DamageType::Suicide)
	{
        %clVictim.player.delayRoleChangeTime = 0;
        %game.assignOutermostRole(%clVictim);
		%clVictim.lastDeathSuicide = true;
		%clVictim.suicideRespawnTime = getSimTime() + 1000;
		%clVictim.forceRespawn = true;
		%clVictim.inSpawnBuilding = true;
		//%game.trySetRole(%plVictim, Offense);
	}
	
	else if (%damageType == $DamageType::Lava)
	{
		%clVictim.forceRespawn = true;
		%clVictim.inSpawnBuilding = true;
	}

	// TR2:  disable death
	else if ($TR2::DisableDeath && !%clVictim.forceRespawn)
	{
		%clVictim.plyrTransformAtDeath = %plVictim.getTransform();
		%clVictim.knockedDown = true;
		%clVictim.knockDownTime = getSimTime();
		%game.rememberAmmo(%clVictim);

		// Track body thread
		// Delay this slightly so that the body's speed is guaranteed
		// to be greater than 0
		%game.schedule($TR2::KnockdownTimeSlice, "trackKnockDown", %plVictim);
	}

	//Close huds if player dies...
	messageClient(%clVictim, 'CloseHud', "", 'inventoryScreen');
	messageClient(%clVictim, 'CloseHud', "", 'vehicleHud');
	commandToClient(%clVictim, 'setHudMode', 'Standard', "", 0);

	// $weaponslot from item.cs
	%plVictim.setRepairRate(0);
	%plVictim.setImageTrigger($WeaponSlot, false);
	
	playDeathAnimation(%plVictim, %damageLocation, %damageType);
	playDeathCry(%plVictim);

	%victimName = %clVictim.name;
	
	// TR2:  Force generic message for suicide-by-weapon
	if ($TR2::DisableDeath && %clVictim == %clKiller)
		%damageType = $DamageType::suicide;
		
	%game.displayDeathMessages(%clVictim, %clKiller, %damageType, %implement);
	//%game.updateKillScores(%clVictim, %clKiller, %damageType, %implement);

	// toss whatever is being carried, '$flagslot' from item.cs
	// MES - had to move this to after death message display because of Rabbit game type
	// TR2:  Only throw all items if death is enabled
	//if (!$TR2::DisableDeath || %clVictim.forceRespawn)
	//{
	//	 for(%index = 0 ; %index < 8; %index++)
	//	 {
	//		 %image = %plVictim.getMountedImage(%index);
	//		 if(%image)
	//		 {
	//			 if(%index == $FlagSlot)
	//				 %plVictim.throwObject(%plVictim.holdingFlag);
	//			 else
	//				 %plVictim.throw(%image.item);
	//		 }
	//	 }
	//}
	// TR2:  Otherwise just throw the flag if applicable
	//else
	if(%plVictim == $TheFlag.carrier)
		%plVictim.throwObject(%plVictim.holdingFlag);

	// target manager update
	setTargetDataBlock(%clVictim.target, 0);
	setTargetSensorData(%clVictim.target, 0);

	// clear the hud
	%clVictim.SetWeaponsHudClearAll();
	%clVictim.SetInventoryHudClearAll();
	%clVictim.setAmmoHudCount(-1);

	// clear out weapons, inventory and pack huds
	messageClient(%clVictim, 'msgDeploySensorOff', "");  //make sure the deploy hud gets shut off 
	messageClient(%clVictim, 'msgPackIconOff', "");  // clear the pack icon

	//clear the deployable HUD
	%plVictim.client.deployPack = false;
	cancel(%plVictim.deployCheckThread);
	deactivateDeploySensor(%plVictim);

	//if the killer was an AI...
	//if (isObject(%clKiller) && %clKiller.isAIControlled())
	//	%game.onAIKilledClient(%clVictim, %clKiller, %damageType, %implement);


	// reset control object on this player: also sets 'playgui' as content
	serverCmdResetControlObject(%clVictim);

	// set control object to the camera	
	%clVictim.player = 0;
	%transform = %plVictim.getTransform();

	//note, AI's don't have a camera...
	if (isObject(%clVictim.camera))
	{
		%clVictim.camera.setTransform(%transform);
		%obsx = getWord($TR2_playerObserveParameters, 0);
		%obsy = getWord($TR2_playerObserveParameters, 1);
		%obsz = getWord($TR2_playerObserveParameters, 2);
		%clVictim.camera.setOrbitMode(%plVictim, %plVictim.getTransform(), %obsx, %obsy, %obsz);
		//%clVictim.camera.setOrbitMode(%plVictim, %plVictim.getTransform(), 0.5, 4.5, 4.5);
		%clVictim.setControlObject(%clVictim.camera);
	}

	//hook in the AI specific code for when a client dies
	//if (%clVictim.isAIControlled())
	//{
	//	aiReleaseHumanControl(%clVictim.controlByHuman, %clVictim);
	//	%game.onAIKilled(%clVictim, %clKiller, %damageType, %implement);
	//}
	//else
	//	aiReleaseHumanControl(%clVictim, %clVictim.controlAI);

	//used to track corpses so the AI can get ammo, etc...
	//AICorpseAdded(%plVictim);

	//if the death was a suicide, prevent respawning for 5 seconds...
	%clVictim.lastDeathSuicide = false;
}

function TR2Game::trackKnockDown(%this, %player)
{
	%client = %player.client;
	%speed = %player.getSpeed();
	%time = getSimTime();
	
	//echo("		 (" @ %client @ ")  Knockdown tracking");

	if (%speed <= 0.1 && !%player.inCannon)
	{
		cancel(%client.knockDownThread);
		
		// Wait a bit longer
		%client.suicideRespawnTime = %time + $TR2::delayAfterKnockdown;
		
		// Ensure the wait was at least a certain length of time
	  if (%client.suicideRespawnTime - %client.knockDownTime < $TR2::MinimumKnockdownDelay)
			%client.suicideRespawnTime = %time + $TR2::MinimumKnockdownDelay;
		
		// Make the player spawn at his corpse's resting location
		%client.plyrTransformAtDeath = %player.getTransform();
		
		// Hmm...hack this to delete the corpse when the player presses the
		// trigger (used in TR2Game::onObserverTrigger()
		%client.playerToDelete = %player;
	}
	else if (%time - %client.knockDownTime > $TR2::MaximumKnockdownDelay)
	{
		cancel(%client.knockDownThread);
		%this.forceRespawn(%client);
	}
	else
	{
		%client.suicideRespawnTime = %time + $TR2::knockdownTimeSlice;
		%client.knockDownThread = %this.schedule($TR2::knockdownTimeSlice, "trackKnockDown", %player);
	}
}

function TR2Game::displayDeathMessages(%game, %clVictim, %clKiller, %damageType, %implement)
{
	%victimGender = (%clVictim.sex $= "Male" ? 'him' : 'her');
	%victimPoss = (%clVictim.sex $= "Male" ? 'his' : 'her');
	%killerGender = (%clKiller.sex $= "Male" ? 'him' : 'her');
	%killerPoss = (%clKiller.sex $= "Male" ? 'his' : 'her');
	%victimName = %clVictim.name;
	%killerName = %clKiller.name;
	//error("DamageType = " @ %damageType @ ", implement = " @ %implement @ ", implement class = " @ %implement.getClassName() @ ", is controlled = " @ %implement.getControllingClient());

	if(%damageType == $DamageType::TouchedOwnGoal)
	{
		messageAll('msgTouchedOwnGoal', '\c0%1 respawns for touching %3 own goal.', %victimName, %victimGender, %victimPoss, %killerName, %killerGender, %killerPoss, %damageType);
		logEcho(%clVictim.nameBase@" (pl "@%clVictim.player@"/cl "@%clVictim@") killed by own goal.");
	}
	else if(%damageType == $DamageType::Grid)
	{
		%message = $TR2::DisableDeath ?
			'\c0%1 was knocked down by the Grid.' :
			'\c0%1 was killed by the Grid.';
		messageAll('msgGrid', %message, %victimName, %victimGender, %victimPoss, %killerName, %killerGender, %killerPoss, %damageType);
		logEcho(%clVictim.nameBase@" (pl "@%clVictim.player@"/cl "@%clVictim@") killed by Grid.");
	}
	else if(%damageType == $DamageType::OOB)
	{
		%message = '\c0%1 was thrown outside the Grid.';
		messageAll('msgGrid', %message, %victimName, %victimGender, %victimPoss, %killerName, %killerGender, %killerPoss, %damageType);
		logEcho(%clVictim.nameBase@" (pl "@%clVictim.player@"/cl "@%clVictim@") killed for OOB.");
	}
	else if(%damageType == $DamageType::respawnAfterScoring)
	{
		//messageClient(%clVictim, 'msgRespawnAfterScoring', '\c0Your team scored!  Forcing respawn...', %victimName, %victimGender, %victimPoss, %killerName, %killerGender, %killerPoss, %damageType);
		logEcho(%clVictim.nameBase@" (pl "@%clVictim.player@"/cl "@%clVictim@") forced to respawn.");
	}
	else if(%damageType == $DamageType::Suicide)
	{
		%message = $TR2::DisableDeath ?
			'\c1%1 knocks %2self out.' :
			'\c1%1 is respawning...';
		messageAll('msgSuicide', %message, %victimName, %victimGender, %victimPoss, %killerName, %killerGender, %killerPoss, %damageType);
		logEcho(%clVictim.nameBase@" (pl "@%clVictim.player@"/cl "@%clVictim@") is respawning.");
	}
	else if(%damageType == $DamageType::HotPotato)
	{
		// Could display a newbie message here
		messageAll('msgHotPotato', '\c1%1 held onto the flag for too long!', %victimName, %victimGender, %victimPoss, %killerName, %killerGender, %killerPoss, %damageType);
		logEcho(%clVictim.nameBase@" (pl "@%clVictim.player@"/cl "@%clVictim@") killed by hot potato.");
	}
	else if(%damageType == $DamageType::G4)
	{
	}
	else if ($TR2::DisableDeath && %damageType != $DamageType::Ground && %damageType != $DamageType::Lava
				  && %clVictim.team != %clKiller.team)
	
	{
		messageAll('msgTR2Knockdown', '\c0%4 knocks down %1.', %victimName, %victimGender, %victimPoss, %killerName, %killerGender, %killerPoss, %damageType);
		//logEcho(%clVictim.nameBase@" (pl "@%clVictim.player@"/cl "@%clVictim@") knocked down by " @c%clKiller.nameBase);
	}
	else
		DefaultGame::displayDeathMessages(%game, %clVictim, %clKiller, %damageType, %implement);
}

function TR2Game::createPlayer(%game, %client, %spawnLoc, %respawn)
{
	// do not allow a new player if there is one (not destroyed) on this client
	if(isObject(%client.player) && (%client.player.getState() !$= "Dead"))
		return;
		
	if (%client $= "" || %client <= 0)
	{
		error("Invalid client sent to createPlayer()");
		return;
	}

	// clients and cameras can exist in team 0, but players should not
	if(%client.team == 0)
		error("Players should not be added to team0!");

	// defaultplayerarmor is in 'players.cs'
	if(%spawnLoc == -1)
		%spawnLoc = "0 0 300 1 0 0 0";
	//else
	//  echo("Spawning player at " @ %spawnLoc);

	%armorType = $TR2::roleArmor[%client.currentRole];
	if (%armorType $= "")
		%armorType = $DefaultPlayerArmor;

	// copied from player.cs
	if (%client.race $= "Bioderm")
		// No Bioderms.
		%armor = "TR2" @ %armorType @ "Male" @ "Human" @ Armor;
	else
		%armor = "TR2" @ %armorType @ %client.sex @ %client.race @ Armor;

	%client.armor = %armor;
	
	// TR2
	%client.enableZones = false;

	%player = new Player() {
		//dataBlock = $DefaultPlayerArmor;
		//scale = "2 2 2";
		// TR2
		dataBlock = %armor;
	};
	
	if (%player == 0)
	{
		error("Unable to create new player in createPlayer()");
		return;
	}
	
	%client.enableZones = true;

	if(%respawn)
	{
		%player.setInvincible(true);
		//%player.setCloaked(true);
		%player.setInvincibleMode($InvincibleTime,0.02);
		//%player.respawnCloakThread = %player.schedule($InvincibleTime * 1000, "setRespawnCloakOff");
		%player.schedule($InvincibleTime * 1000, "setInvincible", false);
	}

	%player.setTransform( %spawnLoc );
	MissionCleanup.add(%player);

	// setup some info
	%player.setOwnerClient(%client);
	%player.team = %client.team;
	%client.outOfBounds = false;
	%player.setEnergyLevel(60);
	%client.player = %player;
	%client.plyrDiedHoldingFlag = false;
	
	// TR2
	if (%client.knockedDown)
		%client.restockAmmo = false;
	else
		%client.restockAmmo = true;
		
	%client.knockedDown = false;
	%client.playerToDelete = "";
	%client.forceRespawn = false;
	%player.inCannon = false;



	// updates client's target info for this player
	%player.setTarget(%client.target);
	setTargetDataBlock(%client.target, %player.getDatablock());
	setTargetSensorData(%client.target, PlayerSensor);
	setTargetSensorGroup(%client.target, %client.team);
	%client.setSensorGroup(%client.team);

	//make sure the player has been added to the team rank array...
	%game.populateTeamRankArray(%client);

	%game.playerSpawned(%client.player);
}

function TR2Game::enableZones(%this, %client)
{
	%client.enableZones = true;
}

function TR2Game::forceRespawn(%this, %client)
{
	 %player = %client.getControlObject();
	  %client.suicideRespawnTime = 0;
	  %client.knockedDown = false;
	  %client.inSpawnBuilding = true;
	  %client.forceRespawn = true;
	  if (%player.mode $= "playerDeath")
		 %this.ObserverOnTrigger(%player, %player, 1, 1);
	  else
		  %player.scriptKill($DamageType::RespawnAfterScoring);
}

function TR2Game::forceTeamRespawn(%this, %team)
{
	// If DisableDeath is active, temporarily ignore it
	//%disableDeath = $TR2::DisableDeath;
	
	//$TR2::DisableDeath = false;
	for(%i = 0; %i < ClientGroup.getCount(); %i ++)
	{
		%client = ClientGroup.getObject(%i);
		if (%client.team == %team)
			Game.forceRespawn(%client);
	}
}

function TR2Game::pickPlayerSpawn(%game, %client, %respawn)
{
	if (%client.knockedDown && !%client.forceRespawn)
		return %client.plyrTransformAtDeath;
	else
		return Parent::pickPlayerSpawn(%game, %client, %respawn);
}

datablock AudioProfile(GridjumpSound)
{
	volume = 1.0;
	filename	 = "fx/misc/gridjump.wav";
	description = AudioClose3d;
	preload = true;
};

function TR2Game::leaveMissionArea(%game, %playerData, %player)
{
	if (%player.client.outOfBounds)
	{
		%player.client.forceRespawn = true;
		return;
	}
	
	if (%player.client.inSpawnBuilding)
		return;
	  //%player.client.inSpawnBuilding = false;
		
	// Cancel the delayed oob check in case this is a second gridjump
	//cancel(%player.checkOOBthread);
	//%player.checkOOBthread = "";
	
	if (%player.client.forceRespawn)
		return;
		
	%alreadyDead = (%player.getState() $= "Dead");

	%oldVel = %player.getVelocity();
	%player.client.outOfBounds = true;

//	//messageClient(%player.client, 'LeaveMissionArea', '\c1You left the mission area.~wfx/misc/warning_beep.wav');

	%player.bounceOffGrid(85);
	
	// Gridjump effect
	%newEmitter = new ParticleEmissionDummy(GridjumpEffect) {
			position = %player.getTransform();
			rotation = "1 0 0 0";
			scale = "1 1 1";
			dataBlock = "defaultEmissionDummy";
			emitter = "GridjumpEmitter";
			velocity = "1";
	};
	//echo("EMITTER = " @ %newEmitter);
	%newEmitter.schedule(%newEmitter.emitter.lifetimeMS, "delete");
	
	%player.playAudio(0, GridjumpSound);
 
	if (!%alreadyDead)
	{
		%player.setDamageFlash(0.75);
		%player.applyDamage(0.12);
		if(%player.getState() $= "Dead")
			Game.onClientKilled(%player.client, 0, $DamageType::Grid);
	}
	
	// If the player is going too fast, blow him up
	//if (%player.getSpeed() > $TR2_MaximumGridSpeed)
	//{
	//	%player.client.forceRespawn = true;
	//	if(!%alreadyDead)
	//	{
	//		cancel(%player.checkOOBthread);
	//		%player.applyDamage(1);
	//		//%player.blowup();
	//		Game.onClientKilled(%player.client, 0, $DamageType::Grid);
	//	}
		
	//	return;
	//}
	
	// Double-check that the player didn't squeeze out
	if (!%player.client.forceRespawn)
		%player.checkOOBthread = %game.schedule(1000, "doubleCheckOOB", %player);
}

function TR2Game::doubleCheckOOB(%this, %player)
{
	if (%player.client.outOfBounds && !%player.client.forceRespawn)
	{
		%player.client.forceRespawn = true;
		if (%player.getState() !$= "Dead")
		{
			%player.applyDamage(1);
			%player.client.inSpawnBuilding = true;
			//%player.blowup();
			Game.onClientKilled(%player.client, 0, $DamageType::OOB);
		}
	}
}

function TR2Game::enterMissionArea(%game, %playerData, %player)
{
//	if(%player.getState() $= "Dead")
//		return;

	%player.client.outOfBounds = false;
	
	// TR2:  Should probably find a better place for this
	if (!%player.client.forceRespawn)
		%player.client.inSpawnBuilding = false;
	//messageClient(%player.client, 'EnterMissionArea', '\c1You are back in the mission area.');
}


//----------------------------------------------------------------------------
// TR2Flag:
//----------------------------------------------------------------------------
datablock ShapeBaseImageData(TR2FlagImage)
{
	shapeFile = $TR2::ThrownObject;
	item = Flag;
	mountPoint = 2;
	offset = "0 0 0.1";

	lightType = "PulsingLight";
	lightColor = "0.9 0.0 0.0 1.0";
	lightTime = "500";
	lightRadius = "18";
};

// 1: red
// 2: blue
// 4: yellow
// 8: green
datablock ItemData(TR2Flag1)
{
	 // Observer stuff
	cameraDefaultFov = 90;
	cameraMaxDist = 20;
	cameraMaxFov = 120;
	cameraMinDist = 5;
	cameraMinFov = 5;
	canControl = false;
	canObserve = true;
 
	className = TR2Flag;

	shapefile = $TR2::ThrownObject;
	mass = $TR2_FlagMass;
	density = $TR2_FlagDensity;
	elasticity = $TR2_FlagElasticity;
	friction = $TR2_FlagFriction;
	drag = 0.08;//0.2; //
	maxdrag = 0.25;//0.4;
	rotate = true;

	// These don't seem to have any effect
	//pickupRadius = 10;

	isInvincible = true;
	pickUpName = "a flag";
	computeCRC = true;

	lightType = "PulsingLight";
	lightColor = "0.9 0.2 0.2 1.0";
	lightTime = "250";
	lightRadius = "18";

	category = "Objectives";
	cmdCategory = "Objectives";
	cmdIcon = CMDFlagIcon;
	cmdMiniIconName = "commander/MiniIcons/com_flag_grey";
	targetTypeTag = 'Flag';
	
	hudImageNameFriendly[1] = "commander/MiniIcons/TR2com_flag_grey";
	hudIMageNameEnemy[1] = "commander/MiniIcons/TR2com_flag_grey";
	hudRenderModulated[1] = true;
	hudRenderAlways[1] = true;
	hudRenderCenter[1] = true;
	hudRenderDistance[1] = true;
	hudRenderName[1] = false;

//	catagory = "Objectives";
//	shapefile = "flag.dts";
//	mass = 55;
//	elasticity = 0.2;
//	friction = 0.6;
//	pickupRadius = 3;
//	pickUpName = "a flag";
//	computeCRC = true;
//
//	lightType = "PulsingLight";
//	lightColor = "0.5 0.5 0.5 1.0";
//	lightTime = "1000";
//	lightRadius = "3";
//
//	isInvincible = true;
//	cmdCategory = "Objectives";
//	cmdIcon = CMDFlagIcon;
//	cmdMiniIconName = "commander/MiniIcons/com_flag_grey";
//	targetTypeTag = 'Flag';
};

datablock ItemData(TR2Flag2) : TR2Flag1
{
	lightColor = "0.1 0.1 0.9 1.0";
	className = TR2FlagFake;
	lightTime = "100";
	lightRadius = "5";
};

datablock ItemData(TR2Flag4) : TR2Flag2
{
	lightColor = "0.9 0.9 0.1 1.0";
};

datablock ItemData(TR2Flag8) : TR2Flag2
{
	lightColor = "0.1 0.9 0.1 1.0";
};

// Used as an Audio object
datablock ItemData(TR2FlagTiny) : TR2Flag2
{
	lightColor = "0.1 0.9 0.1 1.0";
	scale = "0.0001 0.0001 0.0001";
};

function TR2Flag::onRemove(%data, %obj)
{
	// dont want target removed...
}

function AddTR2FlagSmoke(%obj)
{
	 // Sneak in an oob check
	 // TO-DO:  Create a general post-throw flag thread
	 if (%obj.isOutOfBounds())
		 if (%obj.getSpeed() < $TR2_MaximumGridSpeed)
			 %obj.bounceOffGrid(3);
		 else
			 Game.flagReturn(%obj, %obj.dropper);

	%scale = VectorLen(%obj.getVelocity());

	if( %scale >= $TR2::MinSpeedForFlagSmoke || (%obj.getHeight() > 7 && !%obj.isHome && !%obj.onGoal) )
	{
		%delay = 100 - %scale;
		%x = getWord(%obj.position, 0);
		%y = getWord(%obj.position, 1);
		%z = getWord(%obj.position, 2) + 1.4;

		if( Game.TR2FlagSmoke < 20 )
			Game.TR2FlagSmoke++;
		else
			Game.TR2FlagSmoke = 0;

		if( isObject(Game.dropSmoke[Game.TR2FlagSmoke]) )
		{
			Game.dropSmoke[Game.TR2FlagSmoke].delete();
			Game.dropSmoke[Game.TR2FlagSmoke] = "";
		}

		Game.dropSmoke[Game.TR2FlagSmoke] = new ParticleEmissionDummy()
		{
			//position = getWord(%client.player.position, 0) SPC getWord(%client.player.position, 1) SPC getWord(%client.player.position, 2) + 3;
			position = %x SPC %y SPC %z;
			rotation = "0 0 0 0";
			scale = "1 1 1";
			dataBlock = defaultEmissionDummy;
			emitter = TR2FlagEmitter;
			velocity = "1";
		};
		MissionCleanup.add(Game.dropSmoke[Game.TR2FlagSmoke]);

		Game.dropSmoke[Game.TR2FlagSmoke].schedule(1000, "delete");

		Game.addFlagTrail = schedule($TR2::FlagSmokeTimeSlice, 0, "AddTR2FlagSmoke", %obj);
	}
	else
		Game.TR2FlagSmoke = 0;
}

function aodebug()
{
	for( %i = 0; %i <= 20; %i++ )
	{
		%status = isObject(Game.dropSmoke[%i]) ? "exists" : "does NOT exist";
		echo( "*** Flag smoke " @ %i @ " " @ %status );
	}
}

function TR2Flag::onThrow(%data,%obj,%src)
{
	Game.playerDroppedFlag(%src);
	AddTR2FlagSmoke(%obj);
}

function TR2Flag::onCollision(%data,%obj,%col)
{
	if (%col.getDataBlock().className $= Armor)
	{
		if (%col.isMounted())
			return;
			
		cancel(Game.addFlagTrail);

		// a player hit the flag
		Game.playerTouchFlag(%col, %obj);
	}
	else if (%obj.onGoal || %obj.getSpeed() <= 0.1)
		return;
	
	else if (%col.getDataBlock().className $= Goal)
	{
		Game.goalCollision(%obj, %col);
	}
	else if (%col.getDataBlock().className $= GoalPost ||
				%col.getDataBlock().className $= GoalCrossbar)
	{
		// Play some noise.  =)
		serverPlay2D(CrowdDisappointment1Sound);
	}
				
}

function TR2Flag::objectiveInit(%this, %flag)
{
	if (!%flag.isTeamSkinned)
	{
		%pos = %flag.getTransform();
		%group = %flag.getGroup();
	}
	%flag.originalPosition = %flag.getTransform();
	$flagPos[%flag.team] = %flag.originalPosition;
	%flag.isHome = true;
	%flag.carrier = "";
	%flag.grabber = "";
	//setTargetSkin(%flag.getTarget(), TR2Game::getTeamSkin(TR2Game, %flag.team));
	
	// TR2:  Make it red to everyone
    setTargetSensorGroup(%flag.getTarget(), 3);
	
	setTargetAlwaysVisMask(%flag.getTarget(), 0x7);
	setTargetRenderMask(%flag.getTarget(), getTargetRenderMask(%flag.getTarget()) | 0x2);
	%flag.scopeWhenSensorVisible(true);
	$flagStatus[%flag.team] = "<At Base>";

	// set the nametag on the target
	//setTargetName(%flag.getTarget(), TR2Game::getTeamName(TR2Game, %flag.team));

	// create a marker on this guy
	%flag.waypoint = new MissionMarker() {
		position = %flag.getTransform();
		dataBlock = "FlagMarker";
	};
	MissionCleanup.add(%flag.waypoint);

	// create a target for this (there is no MissionMarker::onAdd script call)
	//%target = createTarget(%flag.waypoint, TR2Game::getTeamName( TR2Game, %flag.team), "", "", 'Base', %flag.team, 0);
	//setTargetAlwaysVisMask(%target, 0xffffffff);

	//store the flag in an array
	$TeamFlag[%flag.team] = %flag;

	// KP:  Make our lives easier
	$TheFlag = %flag;
	$TheFlag.oneTimer = 0;
	//setTargetRenderMask($TheFlag, getTargetRenderMask($TheFlag) | 0x4);

	$AIRabbitFlag = %flag;
	
	// TR2
	%flag.lastKTS = 0;
	%flag.dropper = "";
	%flag.dropTime = 0;
	%flag.lastMario = 0;
	%flag.oneTimerCount = 0;
	%flag.oneTimer = 0;
}

function TR2Flag::resetOneTimerCount(%flag)
{
	%flag.oneTimerCount = 0;
}

function TR2Flag1::onEnterLiquid(%data, %obj, %coverage, %type)
{
	 if(%type > 3)  // 1-3 are water, 4+ is lava and quicksand(?)
	 {
	 //	 //error("flag("@%obj@") is in liquid type" SPC %type);
		  game.schedule(3000, flagReturn, %obj);
	 }
	 %obj.inLiquid = true;
	 //$FlagReturnTimer[%obj] = Game.schedule(Game.FLAG_RETURN_DELAY - Game.fadeTimeMS + 2000, "flagReturnFade", %obj);

	 
	 // Reset the drop time (for hangtime calculations)
	 %obj.dropTime = getSimTime();
}

function TR2Flag1::onLeaveLiquid(%data, %obj, %type)
{
	%obj.inLiquid = false;
	//cancel($FlagReturnTimer[%obj]);
}

function TR2Game::emitFlags(%game, %position, %count, %player, %ttl)	// %obj = whatever object is being used as a focus for the flag spew
																	// %count = number of flags to spew
{
	if( %position $= "" )
	{
		error("No position passed!");
		return 0;
	}
	if( %count <= 0 )
	{
		error("Number of flags to spew must be greater than 0!");
		return 0;
	}

	%flagArr[0] = TR2Flag8;
	%flagArr[1] = TR2Flag2;
	%flagArr[2] = TR2Flag4;

	while( %count > 0 )
	{
		%index = mFloor(getRandom() * 3);
		// throwDummyFlag(location, Datablock);
		throwDummyFlag(%position, %flagArr[%index], %player, %ttl);
		%count--;
	}
}

function throwDummyFlag(%position, %datablock, %player, %ttl)
{
	%client = %player.client;

	// create a flag and throw it
	%droppedflag = new Item() {
		position = %position;
		rotation = "0 0 1 " @ (getRandom() * 360);
		scale = "1 1 1";
		dataBlock = %datablock;
		collideable = "0";
		static = "0";
		rotate = "1";
		team = "0";
		isFake = 1;
	};
	MissionCleanup.add(%droppedflag);

	%vec = (-1.0 + getRandom() * 2.0) SPC (-1.0 + getRandom() * 2.0) SPC getRandom();
	%vec = VectorScale(%vec, 1000 + (getRandom() * 300));

	// Add player's velocity
	if (%player !$= "")
	{
		%droppedflag.setCollisionTimeout(%player);
		%vec = vectorAdd(%vec, %player.getVelocity());
	}

	%droppedflag.applyImpulse(%pos, %vec);

	%deleteTime = (%ttl $= "") ? $TR2::CrazyFlagLifetime : %ttl;
	%droppedFlag.die = schedule(%deleteTime, 0, "removeFlag", %droppedflag);
}

function removeFlag(%flag)
{
	%flag.startFade(600, 0, true);
	%flag.schedule(601, "delete");
}

function TR2FlagFake::onCollision(%data,%obj,%col)
{
	if (%obj.dying)
		return;

	cancel(%obj.die);
	%obj.startFade(400, 0, true);
	 %obj.dying = true;
	%obj.schedule(401, "delete");
 
	 // Message player and award bonus point here
	 messageClient(%col.client, 'MsgTR2CrazyFlag', '\c2Crazy flag!  (+3)');
	 serverPlay3D(CoinSound, %col.getPosition());
	 Game.giveInstantBonus(%col.client.team, 3);
}

function TR2Game::goalCollision(%this, %obj, %colObj)
{
	if (%obj != $TheFlag)
		return;
		
	 if (Game.currentBonus < $TR2::MinimumJackpot && !$TR2::PracticeMode)
	 {
		 messageAll('MsgTR2JackpotMinimum', "\c3NO GOAL:  Jackpot must be at least "
							 @ $TR2::MinimumJackpot @".~wfx/misc/red_alert_short.wav");
		 return;
	 }
	 
	 // Check goalie crease
	 %throwDist = VectorLen(VectorSub(%obj.dropperPosition, %colobj.getPosition()));
	 if (%throwDist < $TR2::roleDistanceFromGoal[Goalie] - 14)
	 {
		 messageAll('MsgTR2GoalieCrease', "\c3NO GOAL:  Throw was inside the goalie crease."
							 @".~wfx/misc/red_alert_short.wav");
		 return;
	 }
	 
	 if (!$TheFlag.onGoal)
	 {
			 // Award points
			%scoringTeam = (%colObj.team == 1) ? 2 : 1;

			$teamScore[%scoringTeam] += Game.currentBonus;
			$teamScoreJackpot[%scoringTeam] += Game.currentBonus;
			Game.currentBonus = 0;
			Game.updateCurrentBonusAmount(0, -1);
			messageAll('MsgTR2SetScore', "", %scoringTeam, $teamScore[%scoringTeam]);


			// Respawn the flag on top of the goal
			%newFlagPosition = %colobj.position;
			%newz = getWord(%newFlagPosition, 2) + 80;
			%newFlagPosition = setWord(%newFlagPosition, 2, %newz);
			%obj.setVelocity("0 0 0");
			%obj.setTransform(%newFlagPosition @ "0 0 0");
			%obj.onGoal = true;
			cancel($FlagReturnTimer[%obj]);

			// Allow some time for taunting
			if (!$TR2::PracticeMode)
			{
				//%obj.hide(true);
				Game.goalJustScored = true;
				%this.schedule($TR2::goalRespawnDelay*1000, "resetTheField", %scoringTeam);
			}

			// Inform players
			%this.schedule(750, "afterGoal", %scoringTeam);
			
			%scoreMessage = $TR2::PracticeMode ?
				'\c3Goal!  (Practice Mode enabled)~wfx/misc/goal.wav' :
				'\c3Your team scored!~wfx/misc/goal.wav';

			%otherMessage = $TR2::PracticeMode ?
				'\c3Goal!  (Practice Mode enabled)~wfx/misc/goal.wav' :
				'\c3You allowed the other team to score.~wfx/misc/goal.wav';

			%obsMessage = '\c3Goal!~wfx/misc/goal.wav';
				
			messageTeam(%colObj.team, 'msgTR2TeamScored', %otherMessage);
			messageTeam(%scoringTeam, 'msgTR2TeamScored', %scoreMessage);
			messageTeam(0, 'msgTR2TeamScore', %obsMessage);
			
			messageTeam(%colObj.team, 'MsgTR2FlagStatus', "", "On your goal");
			messageTeam(%scoringTeam, 'MsgTR2FlagStatus', "", "On their goal");
			messageTeam(0, 'MsgTR2FlagStatus', "", "On goal");
			
			// Schedule some delayed messages (only if they didn't score on themselves)
			if (%obj.dropper.team == %scoringTeam)
			{
				%goalScorer = %obj.dropper;
				if ($TheFlag.oneTimer)
				{
					$teamScore[%scoringTeam] += $TR2::OneTimerGoalBonus;
					messageAll('MsgTR2SetScore', "", %scoringTeam, $teamScore[%scoringTeam]);
					%message ="\c1  One-timer goal (+"
								  @ $TR2::OneTimerGoalBonus @ ") scored by \c3"
								  @ getTaggedString(%goalScorer.client.name) @ "~wfx/misc/target_waypoint.wav";
				}
				else
					%message ="\c1  Goal scored by \c3"
								  @ getTaggedString(%goalScorer.client.name) @ "~wfx/misc/target_waypoint.wav";

							  
				schedule(4000, 0, "messageAll", 'MsgTR2GoalScorer', %message);
				%goalScorer.client.goals++;

				%firstAssist = FlagBonusHistory.getRecentRecipient(1);
				%secondAssist = FlagBonusHistory.getRecentRecipient(2);
				
				if (%firstAssist !$= "" && %firstAssist.client.name !$= "" && %firstAssist != %goalScorer && %firstAssist.team == %goalScorer.team)
				{
					schedule(5000, 0, "messageAll", 'MsgTR2GoalAssist', "\c1  Assisted by \c3"
							  @ getTaggedString(%firstAssist.client.name) @ "~wfx/misc/target_waypoint.wav");
					%firstAssist.client.assists++;
				}
				
				if (%secondAssist !$= "" && %secondAssist.client.name !$= "" && %secondAssist != %firstAssist && %secondAssist != %goalScorer && %secondAssist.team == %goalScorer.team)
				{
					schedule(6000, 0, "messageAll", 'MsgTR2GoalScorer', "\c1  Assisted by \c3"
							  @ getTaggedString(%secondAssist.client.name) @ "~wfx/misc/target_waypoint.wav");
					%secondAssist.client.assists++;
				}
			}
			Game.flagReset(%obj);
	 }
}

function TR2Game::afterGoal(%this, %scoringTeam)
{
	serverPlay2d(CrowdCheer1Sound);
	
	if (!$TR2::PracticeMode)
	messageAll('MsgTR2RespawnWarning', "Forcing respawn in "
				  @ $TR2::goalRespawnDelay @ " seconds.");

	%this.schedule(1000, "afterGoal1", %scoringTeam);
}

function TR2Game::afterGoal1(%this, %scoringTeam)
{
	serverPlay2d(CrowdFlairSound);
}

function TR2Game::resetTheField(%this, %team)
{
	Game.goalJustScored = false;
	messageAll('MsgTR2ForcedRespawn', "Respawning...");

	// Force both teams to respawn
	Game.forceTeamRespawn(%team);
	//$TheFlag.hide(false);
}

function TR2Game::sendGameVoteMenu( %game, %client, %key )
{
	if( (($Host::TournamentMode && !MatchStarted) || !$Host::TournamentMode) && !$TR2::SpecLock && %client.queueSlot !$= "" && %client.queueSlot <= ((6 * 2) - getActiveCount()) )
	{
		messageClient( %client, 'MsgVoteItem', "", %key, 'tr2JoinGame', 'Join the game', 'Join the game' );
	}

	if( %client.isAdmin && $TheFlag.carrier $= "" && (getSimTime() - $TheFlag.dropTime) >= 30000 )
	{
		messageClient( %client, 'MsgVoteItem', "", %key, 'tr2ForceFlagReturn', 'Force the flag to return', 'Force the flag to return' );
	}
	
	DefaultGame::sendGameVoteMenu( %game, %client, %key );

	if( %client.isAdmin )
	{
		//if ( $TR2::DisableDeath  )
		//	messageClient( %client, 'MsgVoteItem', "", %key, 'ToggleDisableDeath', 'Enable Death', 'Enable Death' );
		//else
		//	messageClient( %client, 'MsgVoteItem', "", %key, 'ToggleDisableDeath', 'Disable Death', 'Disable Death' );

		if ( $TR2::PracticeMode  )
			messageClient( %client, 'MsgVoteItem', "", %key, 'TogglePracticeMode', 'Disable Practice Mode', 'Disable Practice Mode' );
		else
			messageClient( %client, 'MsgVoteItem', "", %key, 'TogglePracticeMode', 'Enable Practice Mode', 'Enable Practice Mode' );

		if ( $TR2::EnableRoles  )
			messageClient( %client, 'MsgVoteItem', "", %key, 'ToggleRoles', 'Disable Player Roles', 'Disable Player Roles' );
		else
			messageClient( %client, 'MsgVoteItem', "", %key, 'ToggleRoles', 'Enable Player Roles', 'Enable Player Roles' );

		if ( $TR2::EnableCrowd  )
			messageClient( %client, 'MsgVoteItem', "", %key, 'ToggleCrowd', 'Disable Crowd', 'Disable Crowd' );
		else
			messageClient( %client, 'MsgVoteItem', "", %key, 'ToggleCrowd', 'Enable Crowd', 'Enable Crowd' );
		if( $TR2::SpecLock )
			messageClient( %client, 'MsgVoteItem', "", %key, 'toggleSpecLock', 'Unlock Spectators', 'Unlock Spectators' );
		else
			messageClient( %client, 'MsgVoteItem', "", %key, 'toggleSpecLock', 'Lock Spectators', 'Lock Spectators' );

	}
 	if( %client.team == 0 )
 	{
 		if( %client.queueSlot !$= "" )
			messageClient( %client, 'MsgVoteItem', "", %key, 'getQueuePos', 'Get your queue status', 'Get your queue status' );

		if( !%client.specOnly)
			messageClient( %client, 'MsgVoteItem', "", %key, 'toggleSpecOnly', 'Lock myself as a spectator', 'Lock myself as a spectator' );
		else
			messageClient( %client, 'MsgVoteItem', "", %key, 'toggleSpecOnly', 'Enter the queue to join the game.', 'Enter the queue to join the game.' );

		if( !%client.tr2SpecMode )
			messageClient( %client, 'MsgVoteItem', "", %key, 'toggleSpecMode', 'Lock onto Flag/Carrier', 'Lock onto Flag/Carrier' );
		else
			messageClient( %client, 'MsgVoteItem', "", %key, 'toggleSpecMode', 'Free-flight Observer Mode', 'Free-flight Observer Mode' );
	}	
}

function TR2Game::clientChangeTeam(%game, %client, %team, %fromObs)
{
	%time = getSimTime();
	if (%time - %client.lastTeamChangeTime <= $TR2::delayBetweenTeamChanges)
		return;

	%client.lastTeamChangeTime = %time;
	
	// Get rid of the corpse after changing teams
	%client.forceRespawn = true;
	%client.inSpawnBuilding = true;
	
	// First set to outer role (just to be safe)
	%game.assignOuterMostRole(%client);
	
	// Then release client's role
	%game.releaseRole(%client);
	

	if( %fromObs )
		removeFromQueue(%client);
	
	return Parent::clientChangeTeam(%game, %client, %team, %fromObs);
}

function TR2Game::sendDebriefing( %game, %client )
{
	if ( %game.numTeams == 1 )
	{
		// Mission result:
		%winner = $TeamRank[0, 0];
		if ( %winner.score > 0 )
			messageClient( %client, 'MsgDebriefResult', "", '<just:center>%1 wins!', $TeamRank[0, 0].name );
		else
			messageClient( %client, 'MsgDebriefResult', "", '<just:center>Nobody wins.' );

		// Player scores:
		%count = $TeamRank[0, count];
		messageClient( %client, 'MsgDebriefAddLine', "", '<spush><color:00dc00><font:univers condensed:18>PLAYER<lmargin%%:60>SCORE<lmargin%%:80>KILLS<spop>' );
		for ( %i = 0; %i < %count; %i++ )
		{
			%cl = $TeamRank[0, %i];
			if ( %cl.score $= "" )
				%score = 0;
			else
				%score = %cl.score;
			if ( %cl.kills $= "" )
				%kills = 0;
			else
				%kills = %cl.kills;
			messageClient( %client, 'MsgDebriefAddLine', "", '<lmargin:0><clip%%:60> %1</clip><lmargin%%:60><clip%%:20> %2</clip><lmargin%%:80><clip%%:20> %3', %cl.name, %score, %kills );
		}
	}
	else
	{
		%topScore = "";
		%topCount = 0;
		for ( %team = 1; %team <= %game.numTeams; %team++ )
		{
			if ( %topScore $= "" || $TeamScore[%team] > %topScore )
			{
				%topScore = $TeamScore[%team];
				%firstTeam = %team;
				%topCount = 1;
			}
			else if ( $TeamScore[%team] == %topScore )
			{
				%secondTeam = %team;
				%topCount++;
			}
		}

		// Mission result:
		if ( %topCount == 1 )
			messageClient( %client, 'MsgDebriefResult', "", '<just:center>Team %1 wins!', %game.getTeamName(%firstTeam) );
		else if ( %topCount == 2 )
			messageClient( %client, 'MsgDebriefResult', "", '<just:center>Team %1 and Team %2 tie!', %game.getTeamName(%firstTeam), %game.getTeamName(%secondTeam) );
		else
			messageClient( %client, 'MsgDebriefResult', "", '<just:center>The mission ended in a tie.' );

		// Team scores:
		messageClient( %client, 'MsgDebriefAddLine', "", '<spush><color:00dc00><font:univers condensed:18>TEAM<lmargin%%:40>SCORE<lmargin%%:50>Jackpot<lmargin%%:60>Creativity<lmargin%%:70>Possession<spop>' );
		for ( %team = 1; %team - 1 < %game.numTeams; %team++ )
		{
			if ( $TeamScore[%team] $= "" )
			{
				%score = 0;
				%jscore = 0;
				%cscore = 0;
				%pscore = 0;
			}
			else
			{
				%score = $TeamScore[%team];
				%jscore = $TeamScoreJackpot[%team];
				%cscore = $TeamScoreCreativity[%team];
				%pscore = $TeamScorePossession[%team];
			}
			messageClient( %client, 'MsgDebriefAddLine', "", '<lmargin:0><clip%%:40> %1</clip><lmargin%%:40><clip%%:35> %2</clip><lmargin%%:50> %3<lmargin%%:60> %4<lmargin%%:70> %5', %game.getTeamName(%team), %score, %jscore, %cscore, %pscore );
		}

		// Player scores:
		messageClient( %client, 'MsgDebriefAddLine', "", '\n<lmargin:0><spush><color:00dc00><font:univers condensed:18>PLAYER<lmargin%%:20>TEAM<lmargin%%:40>GOALS<lmargin%%:48>ASSISTS<lmargin%%:56>SAVES<lmargin%%:64>PASS<lmargin%%:72>RECV<lmargin%%:80>INTC<lmargin%%:88>FC-HITS<spop>' );
		for ( %team = 1; %team - 1 < %game.numTeams; %team++ )
			%count[%team] = 0;

		%notDone = true;
		while ( %notDone )
		{
			// Get the highest remaining score:
			%highScore = "";
			for ( %team = 1; %team <= %game.numTeams; %team++ )
			{
				if ( %count[%team] < $TeamRank[%team, count] && ( %highScore $= "" || $TeamRank[%team, %count[%team]].score > %highScore ) )
				{
					%highScore = $TeamRank[%team, %count[%team]].score;
					%highTeam = %team;
				}
			}

			// Send the debrief line:
			%cl = $TeamRank[%highTeam, %count[%highTeam]];
			%score = %cl.score $= "" ? 0 : %cl.passingScore + %cl.receivingScore + %cl.interceptingScore;
			%kills = %cl.kills $= "" ? 0 : %cl.kills;
			messageClient( %client, 'MsgDebriefAddLine', "", '<lmargin:0><clip%%:17> %1</clip><lmargin%%:20><clip%%:40> %2</clip><lmargin%%:40> %3<lmargin%%:48> %4<lmargin%%:56> %5<lmargin%%:64> %6<lmargin%%:72> %7<lmargin%%:80> %8<lmargin%%:88> %9', %cl.name, %game.getTeamName(%cl.team), %cl.goals, %cl.assists, %cl.saves, %cl.passingScore, %cl.receivingScore, %cl.interceptingScore, %cl.fcHits );

			%count[%highTeam]++;
			%notDone = false;
			for ( %team = 1; %team - 1 < %game.numTeams; %team++ )
			{
				if ( %count[%team] < $TeamRank[%team, count] )
				{
					%notDone = true;
					break;
				}
			}
		}
	}

	//now go through an list all the observers:
	%count = ClientGroup.getCount();
	%printedHeader = false;
	for (%i = 0; %i < %count; %i++)
	{
		%cl = ClientGroup.getObject(%i);
		if (%cl.team <= 0)
		{
			//print the header only if we actually find an observer
			if (!%printedHeader)
			{
				%printedHeader = true;
				messageClient(%client, 'MsgDebriefAddLine', "", '\n<lmargin:0><spush><color:00dc00><font:univers condensed:18>OBSERVERS<lmargin%%:60>SCORE<spop>');
			}

			//print out the client
			%score = %cl.score $= "" ? 0 : %cl.score;
			messageClient( %client, 'MsgDebriefAddLine', "", '<lmargin:0><clip%%:60> %1</clip><lmargin%%:60><clip%%:40> %2</clip>', %cl.name, %score);
		}
	}
}

function TR2Game::updateScoreHud(%game, %client, %tag)
{
	if (Game.numTeams > 1)
	{
		// Send header:
		messageClient( %client, 'SetScoreHudHeader', "", '<tab:15,315>\t%1<rmargin:260><just:right>%2<rmargin:560><just:left>\t%3<just:right>%4',
				%game.getTeamName(1), $TeamScore[1], %game.getTeamName(2), $TeamScore[2] );

		// Send subheader:
		messageClient( %client, 'SetScoreHudSubheader', "", '<tab:15,315>\tPLAYERS (%1)<rmargin:260><just:right>SCORE<rmargin:560><just:left>\tPLAYERS (%2)<just:right>SCORE',
				$TeamRank[1, count], $TeamRank[2, count] );

		%index = 0;
		while ( true )
		{
			if ( %index >= $TeamRank[1, count]+2 && %index >= $TeamRank[2, count]+2 )
				break;

			//get the team1 client info
			%team1Client = "";
			%team1ClientScore = "";
			%col1Style = "";
			if ( %index < $TeamRank[1, count] )
			{
				%team1Client = $TeamRank[1, %index];
				%team1ClientScore = %team1Client.score $= "" ? 0 : %team1Client.score;
				%col1Style = %team1Client == %client ? "<color:dcdcdc>" : "";
				%team1playersTotalScore += %team1Client.score;
			}
			else if( %index == $teamRank[1, count] && $teamRank[1, count] != 0 && !isDemo() && %game.class $= "CTFGame")
			{
				%team1ClientScore = "--------------";
			}
			else if( %index == $teamRank[1, count]+1 && $teamRank[1, count] != 0 && !isDemo() && %game.class $= "CTFGame")
			{
				%team1ClientScore = %team1playersTotalScore != 0 ? %team1playersTotalScore : 0;
			}
			//get the team2 client info
			%team2Client = "";
			%team2ClientScore = "";
			%col2Style = "";
			if ( %index < $TeamRank[2, count] )
			{
				%team2Client = $TeamRank[2, %index];
				%team2ClientScore = %team2Client.score $= "" ? 0 : %team2Client.score;
				%col2Style = %team2Client == %client ? "<color:dcdcdc>" : "";
				%team2playersTotalScore += %team2Client.score;
			}
			else if( %index == $teamRank[2, count] && $teamRank[2, count] != 0 && !isDemo() && %game.class $= "CTFGame")
			{
				%team2ClientScore = "--------------";
			}
			else if( %index == $teamRank[2, count]+1 && $teamRank[2, count] != 0 && !isDemo() && %game.class $= "CTFGame")
			{
				%team2ClientScore = %team2playersTotalScore != 0 ? %team2playersTotalScore : 0;
			}

			//if the client is not an observer, send the message
			if (%client.team != 0)
			{
				messageClient( %client, 'SetLineHud', "", %tag, %index, '<tab:20,320>\t<spush>%5<clip:200>%1</clip><rmargin:260><just:right>%2<spop><rmargin:560><just:left>\t%6<clip:200>%3</clip><just:right>%4',
						%team1Client.name, %team1ClientScore, %team2Client.name, %team2ClientScore, %col1Style, %col2Style );
			}
			//else for observers, create an anchor around the player name so they can be observed
			else
			{
				messageClient( %client, 'SetLineHud', "", %tag, %index, '<tab:20,320>\t<spush>%5<clip:200><a:gamelink\t%7>%1</a></clip><rmargin:260><just:right>%2<spop><rmargin:560><just:left>\t%6<clip:200><a:gamelink\t%8>%3</a></clip><just:right>%4',
						%team1Client.name, %team1ClientScore, %team2Client.name, %team2ClientScore, %col1Style, %col2Style, %team1Client, %team2Client );
			}

			%index++;
		}
	}
	else
	{
		//tricky stuff here...  use two columns if we have more than 15 clients...
		%numClients = $TeamRank[0, count];
		if ( %numClients > $ScoreHudMaxVisible )
			%numColumns = 2;

		// Clear header:
		messageClient( %client, 'SetScoreHudHeader', "", "" );

		// Send header:
		if (%numColumns == 2)
			messageClient(%client, 'SetScoreHudSubheader', "", '<tab:15,315>\tPLAYER<rmargin:270><just:right>SCORE<rmargin:570><just:left>\tPLAYER<just:right>SCORE');
		else
			messageClient(%client, 'SetScoreHudSubheader', "", '<tab:15>\tPLAYER<rmargin:270><just:right>SCORE');

		%countMax = %numClients;
		if ( %countMax > ( 2 * $ScoreHudMaxVisible ) )
		{
			if ( %countMax & 1 )
				%countMax++;
			%countMax = %countMax / 2;
		}
		else if ( %countMax > $ScoreHudMaxVisible )
			%countMax = $ScoreHudMaxVisible;

		for ( %index = 0; %index < %countMax; %index++ )
		{
			//get the client info
			%col1Client = $TeamRank[0, %index];
			%col1ClientScore = %col1Client.score $= "" ? 0 : %col1Client.score;
			%col1Style = %col1Client == %client ? "<color:dcdcdc>" : "";

			//see if we have two columns
			if ( %numColumns == 2 )
			{
				%col2Client = "";
				%col2ClientScore = "";
				%col2Style = "";

				//get the column 2 client info
				%col2Index = %index + %countMax;
				if ( %col2Index < %numClients )
				{
					%col2Client = $TeamRank[0, %col2Index];
					%col2ClientScore = %col2Client.score $= "" ? 0 : %col2Client.score;
					%col2Style = %col2Client == %client ? "<color:dcdcdc>" : "";
				}
			}

			//if the client is not an observer, send the message
			if (%client.team != 0)
			{
				if ( %numColumns == 2 )
					messageClient(%client, 'SetLineHud', "", %tag, %index, '<tab:25,325>\t<spush>%5<clip:195>%1</clip><rmargin:260><just:right>%2<spop><rmargin:560><just:left>\t%6<clip:195>%3</clip><just:right>%4',
							%col1Client.name, %col1ClientScore, %col2Client.name, %col2ClientScore, %col1Style, %col2Style );
				else
					messageClient( %client, 'SetLineHud', "", %tag, %index, '<tab:25>\t%3<clip:195>%1</clip><rmargin:260><just:right>%2',
							%col1Client.name, %col1ClientScore, %col1Style );
			}
			//else for observers, create an anchor around the player name so they can be observed
			else
			{
				if ( %numColumns == 2 )
					messageClient(%client, 'SetLineHud', "", %tag, %index, '<tab:25,325>\t<spush>%5<clip:195><a:gamelink\t%7>%1</a></clip><rmargin:260><just:right>%2<spop><rmargin:560><just:left>\t%6<clip:195><a:gamelink\t%8>%3</a></clip><just:right>%4',
							%col1Client.name, %col1ClientScore, %col2Client.name, %col2ClientScore, %col1Style, %col2Style, %col1Client, %col2Client );
				else
					messageClient( %client, 'SetLineHud', "", %tag, %index, '<tab:25>\t%3<clip:195><a:gamelink\t%4>%1</a></clip><rmargin:260><just:right>%2',
							%col1Client.name, %col1ClientScore, %col1Style, %col1Client );
			}
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
	messageClient( %client, 'ClearHud', "", %tag, %index );
}

function TR2Game::selectSpawnMarker(%game, %team)
{
	if (%team <= 0)
		return;
		
	%teamDropsGroup = "MissionCleanup/TeamDrops" @ %team;

	%group = nameToID(%teamDropsGroup);
	if (%group != -1)
	{
		%count = %group.getCount();
		if (%count > 0)
		{
			for (%try =0; %try < 5; %try++)
			{
				 %done = false;
				 %markerIndex = mFloor(getRandom() * %count);
                 %markerAttempts = 0;
				 while (%markerAttempts < %count)
				 {
					  %marker = %group.getObject(%markerIndex);

					  // If nobody's at this spawn, use it
					  if (%marker > 0 && !%game.teammateNear(%team, %marker.getPosition()))
					  {
						  //echo("SPAWN FOUND for team " @ %team @ " (" @ %try @ " tries)");
						  return %marker.getTransform();
					  }

					  // Otherwise, cycle through looking for the next available slot
					  %markerIndex++;

					  // Handle circular increment
					  if (%markerIndex >= %count)
						  %markerIndex = 0;
        
                      %markerAttempts++;
				 }
			}
			echo("**SPAWN ERROR:  spawn not found.");
		}
		else
			error("No spawn markers found in " @ %teamDropsGroup);
	}
	else
		error(%teamDropsGroup @ " not found in selectSpawnMarker().");

	return -1;
}

function TR2Game::teammateNear(%game, %team, %position)
{
	%count = ClientGroup.getCount();
	
	// Only check x,y (this means we can't have one spawn directly over another,
	// but oh well...quick and dirty)
	%position = setWord(%position, 2, 0);

	for (%i = 0; %i < %count; %i++)
	{
		%cl = ClientGroup.getObject(%i);
		if (%cl $= "" || %cl.player == 0 || %cl.player $= "")
			continue;
			
		if (%cl.team == %team)
		{
			%plyrPos = %cl.player.getPosition();
			%plyrPos = setWord(%plyrPos, 2, 0);
			%diff = VectorLen(VectorSub(%position, %plyrPos));
			if (%diff <= 1)
				return true;
		 }
	}
	
	return false;
}

function TR2Game::pickTeamSpawn(%game, %team)
{
	// Oh-so simple
	return %game.selectSpawnMarker(%team);
}

function TR2Game::onClientEnterObserverMode( %game, %client )
{
	clearBottomPrint(%client);
}

function ServerPlayAudio(%slot, %profile)
{
	$TR2::audioSlot[%slot] = alxPlay(%profile, 0, 0, 0);
}

function ServerStopAudio(%slot)
{
	alxStop($TR2::audioSlot[%slot]);
}

function TR2Game::increaseCrowdLevel(%game)
{
	if (%game.crowdLevel+1 == $TR2::numCrowdLevels)
		return;
		
	%game.crowdTransition(%game.crowdLevel+1);
}

function TR2Game::decreaseCrowdLevel(%game)
{
	if (%game.crowdLevel == -1)
		return;
		
	if (%game.crowdLevel == 0)
		%game.stopCrowd();
	else
		%game.crowdTransition(%game.crowdLevel-1);
}

function TR2Game::stopCrowd(%game)
{
	//if (%game.crowdLevel == -1)
	//  return;
	  
	ServerPlay2d($TR2::crowdLoopTransitionDown[%game.crowdLevel]);
	//schedule(50, 0, "ServerStopAudio", %game.crowdLevel);
	
	// Stop all levels immediately
	ServerStopAudio(0);
	ServerStopAudio(1);
	ServerStopAudio(2);
	%game.crowdLevel = -1;
}

function TR2Game::crowdTransition(%game, %level)
{
	if (%level == %game.crowdLevel)
		return;
		
	//%newSlot = (%game.crowdLevelSlot == 2) ? 3 : 2;
	
	ServerPlay2d($TR2::crowdLoopTransitionUp[%level]);
	schedule(4000, 0, "ServerPlay2d", $TR2::crowdLoopTransitionDown[%game.crowdLevel]);

	schedule(1200, 0, "ServerPlay2d", CrowdFadeSound);
	schedule(3200, 0, "ServerPlay2d", CrowdFadeSound);

	schedule(4100, 0, "ServerStopAudio", %game.crowdLevel);
	schedule(2850, 0, "ServerPlayAudio", %level, $TR2::CrowdLoop[%level]);
	
	%game.crowdLevel = %level;
	//%game.crowdLevelSlot = %newSlot;
}

function TR2Game::evaluateCrowdLevel(%game)
{
	if (%game.currentBonus < $TR2::minimumJackpot)
	{
		%game.stopCrowd();
		return;
	}
	
	if ($TheFlag.carrier $= "")
	{
		%obj = $TheFlag;
		%distance1 = VectorLen(VectorSub(%obj.getPosition(), $teamgoal[1].getPosition()));
		%distance2 = VectorLen(VectorSub(%obj.getPosition(), $teamgoal[2].getPosition()));
		%dist = (%distance1 > %distance2) ? %distance2 : %distance1;
	}
	else
	{
	  %obj = $TheFlag.carrier;
	  %otherTeam = ($TheFlag.carrier.team == 1) ? 2 : 1;
	  %dist = VectorLen(VectorSub(%obj.getPosition(), $teamgoal[%otherTeam].getPosition()));
	}

	for (%i=0; %i<$TR2::NumCrowdLevels; %i++)
	{
		if (%dist < $TR2::CrowdLevelDistance[%i])
			%newLevel = %i;
	}

	if (%newLevel $= "")
	{
		%game.decreaseCrowdLevel();
		return;
	}
	else if (%newLevel == %game.crowdLevel)
		return;

	if (%newLevel > %game.crowdLevel)
		%game.increaseCrowdLevel();
	else
		%game.decreaseCrowdLevel();
}

// Fun stuff!
function TR2Game::startSphere(%game)
{
	//%game.preSphereGravity = getGravity();
	setGravity(0);
	%count = ClientGroup.getCount();

	%position = $TR2::TheSphere.getPosition();
	%radius = 75;
	
	// Prevent all damage
	%game.goalJustScored = true;
	
	if ($TheFlag.carrier !$= "")
		$TheFlag.carrier.throwObject($TheFlag);
	
	for (%i = 0; %i < %count; %i++)
	{
		%cl = ClientGroup.getObject(%i);
		if (%cl $= "" || %cl.player == 0 || %cl.player $= "")
			continue;
			

		%addx = mFloor(getRandom() * %radius);
		%addy = mFloor(getRandom() * %radius);
		%addy = mFloor(getRandom() * %radius);
		
		%newx = getWord(%position, 0) + %addx;
		%newy = getWord(%position, 1) + %addy;
		%newz = getWord(%position, 2) + %addz;
		%newPosition = %newx SPC %newy SPC %newz;
		%cl.inSpawnBuilding = true;

		%cl.plyrTransformAtDeath = %newPosition;
		%cl.player.setTransform(%newPosition);
	}
	
	%game.emitFlags(%position, 40, "", 60000);
}

function TR2Game::endSphere(%game)
{
	Game.goalJustScored = false;
	setGravity($TR2::Gravity);
	%game.forceTeamRespawn(1);
	%game.forceTeamRespawn(2);
}



