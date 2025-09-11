// don't want this executing when building graphs
if($OFFLINE_NAV_BUILD)
   return;
   
echo("-----------------Running Training5");
activatePackage(Training5);

//BaseExplosion sound
datablock EffectProfile(Training5BaseExplosionEffect)
{
   effectname = "explosions/explosion.xpl27";
   minDistance = 20;
   maxDistance = 100;
};

datablock AudioProfile(Training5BaseExplosionSound)
{
   filename    = "fx/explosions/explosion.xpl27.wav";
   description = AudioDefault3d;
   effect = Training5BaseExplosionEffect;
   preload = true;
};


//mission variables
$numberOfTeammates = 0;
$numberOfEnemies[1] = 6;
$numberOfEnemies[2] = 6;
$numberOfEnemies[3] = 8;
$missionBotSkill[1] = 0.0;
$missionBotSkill[2] = 0.5;
$missionBotSkill[3] = 0.9;
$missionEnemyThreshold[1] = 1;
$missionEnemyThreshold[2] = 3;
$missionEnemyThreshold[3] = 8;
$bridgeTime[1] = 30;
$bridgeTime[2] = 20;
$bridgeTime[3] = 5;

package Training5 {
//Training5 package functions begin=======================================================

function SinglePlayerGame::initGameVars(%game)
{
   // for many of the objectives we are going to periodically
   // check the players distance vs some object
   // you could do this much prettier but its going to be very specific
   // so a cut and paste eyesore will be fine
   echo("initializing training5 game vars");
   %game.targetObject1 = nameToId("ObjectiveGen1");  
   %game.targetObject2 = nameToId("ObjectiveGen2");  
   %game.tower =  nameToId("MissionGroup/Teams/Team2/tower/tower");
   %game.base = nameToId("DBase2");
   %game.minimumSafeDistance = 500;
   %game.West = nameToId(WestBridgeGen);
   %game.East = nameToId(EastBridgeGen);
   %game.North = nameToId(NorthBridgeGen);
   %game.South = nameToId(SouthBridgeGen);
}

function MP3Audio::play(%this)
{
	//too bad...no mp3 in training
}


function toggleScoreScreen(%val)
{
	if ( %val )
		//error("No Score Screen in training.......");
		messageClient($player, 0, $player.miscMsg[noScoreScreen]);
}

function toggleNetDisplayHud( %val )
{
   // Hello, McFly?  This is training!  There's no net in training!
}

function voiceCapture( %val )
{
   // Uh, who do you think you are talking to?
}

function ClientCmdSetHudMode(%mode, %type, %node)
{
	parent::ClientCmdSetHudMode(%mode, %type, %node);
	//TrainingMap.push();
}

// get the ball rolling
function startCurrentMission(%game)
{
	setFlipFlopSkins();
	doText(Any_Waypoint01, 2000);
	if(getRandom(3) == 1)
		doText(Any_warning01);
	setWaypointAt(nameToId(TowerSwitch).position, "Periphery Tower Control");
	objectiveDistanceChecks();
	updateTrainingObjectiveHud(obj1);

	// adding a little something for the players followers to do
	//training5AddEscort($teammate0);

	// Tower FFs all start off by default
	// we cheat and disable their hidden generators
	nameToId(CatwalkFFGen).setDamageState(Disabled);
	game.West.setDamageState(Disabled); 
	game.East.setDamageState(Disabled); 
	game.North.setDamageState(Disabled);
	game.South.setDamageState(Disabled);

	// but we start the rotation
	%skill = $pref::trainingDifficulty;
	//%time = 1000 * (10 - %skill * skill );
	%time = $bridgeTime[%skill] * 1000;
	rotateDrawbridgeFFs(%time);

	setUpDifficultySettings($pref::trainingDifficulty);
}

function setUpDifficultySettings(%skill)
{
	if(%skill < 2)
	{
		nameToId(DownStairsSentry).hide(true);
      freeTarget(nameToId(DownStairsSentry).getTarget());
		nameToId(UpstairsTurret).hide(true);
      freeTarget(nameToId(UpstairsTurret).getTarget());
	}
	if(%skill == 3)
		nameToId(SatchelChargePack).hide(true);
}

function countTurretsAllowed(%type)
{
	return $TeamDeployableMax[%type];
}

function getTeammateGlobals()
{
	echo("You have no teammates in this mission");
}

function FlipFlop::objectiveInit(%data, %flipflop)
{
}

function giveall()
{
	error("When the going gets tough...wussies like you start cheating!");
	messageClient($player, 0, "Cheating eh?  What\'s next?  Camping?");
}

function kobayashi_maru()
{
   $testCheats = true;
   commandToServer('giveAll');
}


// Distance Check =============================================================
//  Ive never done this before :P but im going to use a periodic self-scheduling
//	distance checking mechanism in this mission also

function objectiveDistanceChecks()
{
	%playerLocation = $player.player.position;
	if(!%playerLocation) {
		schedule(5000, game, objectiveDistanceChecks);
		return;
	}
	
// 	%baseDist = vectorDist(%playerLocation, %game.base.position);
// 	if(%baseDist < 600 && !%game.training5SwitchObjective && !%game.turretsWarn){
// 		%game.turretsWarn = true;
// 		doText(Any_warning06);
// 	}

	%baseDist = vectorDist(%playerLocation, game.base.position);
	if(%baseDist < 200 && game.respawnPoint == 1) {
		game.respawnPoint = 2;
		return;  // kill the distCheck
	}


	%dist = vectorDist(%playerLocation, game.tower.position);
	//error("Tower Dist = "@%dist);

	if( %dist < 400 && !game.t5distcheck1) {
 		game.t5distcheck1 = true;
		doText(T5_04);
 		return;
 	}
	
	if( %dist > 200 && game.training5SwitchObjective && !game.tipFirepower) {
		
		%packImage = $player.player.getMountedImage($backPackSlot).getName();
		if(%packImage !$= "SatchelChargeImage" && %packImage !$= "InventoryDeployableImage") {
			game.tipFirepower = true;
			doText(T5_tipFirepower);
		}
	
	}

	schedule(5000, game, objectiveDistanceChecks);
}

//======================================================================================
// Objective Generators
//======================================================================================
function GeneratorLarge::damageObject(%data, %targetObject, %sourceObject, %position, %amount, %damageType)
{
	if(%targetObject == game.targetObject1 || %targetObject == game.targetObject2)
		%message = training5ObjectiveGenDamaged(%targetObject, %damageType);
	else
		Parent::damageObject(%data, %targetObject, %sourceObject, %position, %amount, %damageType); 

	if(%message)
		training5messageDamageFailed();
}

function training5ObjectiveGenDamaged(%targetObject, %damageType)
{
//error("training5ObjectiveGenDamaged("@%targetObject@", "@%damageType@")");
	
	if(game.genDestroyed[%targetObject])
		return false;

	if(%damageType != $DamageType::SatchelCharge)
	{
		return true;
	}
	
	game.objectiveDestroyed = true;
	%targetObject.applyDamage(%targetObject.getDataBlock().maxDamage);
	return false;
} 

function training5messageDamageFailed()
{
	if(!game.tooSoonMsg && !game.objectiveDestroyed) {
		game.tooSoonMsg = true;
		schedule(15000, game, eval, "game.tooSoonMsg = false;");
		messageClient($player, 0, $player.miscMsg[genAttackNoSatchel]);

		training5easySatchelWaypoint();
	}
}

function training5easySatchelWaypoint()
{
	if($pref::trainingDifficulty == 1 &&
	$player.player.getMountedImage($backPackSlot).getName() !$= "SatchelChargeImage" && !game.satchelWaypointSet) {

		%waypoint = new WayPoint() {
			position = nameToId(SatchelChargePack).position;
			rotation = "1 0 0 0";
			scale = "1 1 1";
			dataBlock = "WayPointMarker";
			lockCount = "0";
			homingCount = "0";
			name = "Satchel Charge";
			team = 1;
				locked = "true";
		};
		$player.satchelWaypoint = %waypoint;
		game.satchelWaypointSet = true;
	}
}

//======================================================================================


function AIEngageTask::assume(%task, %client)
{
	Parent::assume(%task, %client);

	if(%client.team != $playerTeam)
		game.biodermAssume(%client);
}


// ============================================================================
function singlePlayerGame::onAIRespawn(%game, %client)
{
	if(! isObject("MissionCleanup/TeamDrops2")) {
		//this is the snippet of script from default games that puts teamdrops
		// into the mission cleanup group...slightly modified to suit our needs
		%dropSet = new SimSet("TeamDrops2");
		MissionCleanup.add(%dropSet);

		%spawns = nameToID("MissionGroup/Teams/team2/TeamDrops");
		if(%spawns != -1)
		{
			%count = %spawns.getCount();
			for(%i = 0; %i < %count; %i++)
				%dropSet.add(%spawns.getObject(%i));
		}
	}
	
	parent:: onAIRespawn(%game, %client);
}



// ============================================================================
function singlePlayerGame::onAIKilled(%game, %clVictim, %clAttacker, %damageType, %implement)
{
	%teamCount = getPlayersOnTeam(%clVictim.team);
	//echo("Team count:" SPC %teamCount);
	%maintNum = $missionEnemyThreshold[$pref::trainingDifficulty];
	//echo("Maintain:" SPC %maintNum); 

	%clVictim.useSpawnSphere = true;

	// this will respawn the AI if
	if( %teamCount < %maintNum )
		DefaultGame::onAIKilled(%game, %clVictim, %clAttacker, %damageType, %implement);

}

function singleplayerGame::pickTeamSpawn(%game, %client, %respawn)
{
	if(%client.useSpawnSphere)
		DefaultGame::pickTeamSpawn(%game, %client.team);
	else
		parent::pickTeamSpawn(%game, %client, %respawn); 
}

function SinglePlayerGame::equip(%game, %player, %set)
{
	if(!isObject(%player))
		return;
	
	%player.clearInventory();
	if(!%set)
		%set = %player.client.equipment;

	for(%i =0; %i<$InventoryHudCount; %i++)
	  %player.client.setInventoryHudItem($InventoryHudData[%i, itemDataName], 0, 1);
   %player.client.clearBackpackIcon();

	%player.setArmor("Medium");

	%player.setInventory(SatchelCharge, 1);

	%player.setInventory(RepairKit, 1);
	%player.setInventory(ConcussionGrenade, 8);
	%player.setInventory(Mine, 3);

	%player.setInventory(Plasma, 1);
	%player.setInventory(PlasmaAmmo, 40);
	%player.setInventory(Chaingun, 1);
	%player.setInventory(ChaingunAmmo, 200);
	%player.setInventory(Disc, 1);
	%player.setInventory(DiscAmmo, 15);
	%player.setInventory(GrenadeLauncher, 1);
	%player.setInventory(GrenadeLauncherAmmo, 15);
	%player.setInventory(TargetingLaser, 1);

	%player.use("Disc");

	%player.weaponCount = 4;
}


//the generator destroyed trigers the detonation sequence
function Generator::onDestroyed(%data, %destroyedObj)
{												 
	//error("GeneratorLarge::onDestroyed");
	if(%destroyedObj == game.targetObject1 || %destroyedObj == game.targetObject2)
		if(!game.detonationSequenceStarted) {
			game.detonationSequenceStarted = true;
			
			error("The satchel waypoint is:" SPC $player.satchelWaypoint);
			$player.satchelWaypoint.delete();
			detonationSequence();
			updateTrainingObjectiveHud(obj4);
			game.respawnPoint = 3;
		
			$missionEnemyThreshold[1] = 0;
			$missionEnemyThreshold[2] = 0;
			$missionEnemyThreshold[3] = 0;
		}

   Parent::onDestroyed(%data, %destroyedObj);
}

function FlipFlop::objectiveInit(%data, %flipflop)
{

}

function FlipFlop::playerTouch(%data, %flipFlop, %player)
{
	//error("singlePlayer::playerTouchFlipFlop Training5");
	//echo("has been touched before? " SPC game.training5SwitchObjective);
	
	Parent::playerTouch(%data, %flipFlop, %player);

	//This disables the base door FFs
	%state = (%flipFlop.team == $playerTeam ? "Disabled" : "Enabled");
	game.targetObject2.setDamageState(%state);
	
	if(!game.training5SwitchObjective) {
		game.training5SwitchObjective = true;
		doText(T5_05, 10000);
		doText(T5_05b);
		doText(T5_05a);
		schedule(10000, game, setWaypointAt, game.targetObject2.getWorldBoxCenter(), "Reactor Regulator" );
		schedule(10000, game, updateTrainingObjectiveHud , obj2);
	
		//start the distance check again
		objectiveDistanceChecks();
		game.respawnPoint = 1;

		rotateDrawbridgeFFs(false);	
	}
}


//EndingExplosionStuff=========================================================================


function detonationSequence()
{
	// first a little eye candy
	%oldEmitter = nameToId(LavaSmoke);
	%oldEmitter.delete();

	%newEmitter = new ParticleEmissionDummy(LavaSmoke) {
			position = "-462.4 -366.791 5.12867";
			rotation = "1 0 0 0";
			scale = "1 1 1";
			dataBlock = "defaultEmissionDummy";
			emitter = "AfterT5";
			velocity = "1";
	};
	
	%detonationTime = 1000 * 90; // 90 is a guess, at least 67 before you cut lines
	schedule(3000, game, doText, T5_06);  						  		//Get Out Hurry!
	schedule(%detonationTime, game, detonateBase );		 		  		//BOOM  //moved to t5_08d,eval
	schedule(%detonationTime - 5000, game, doText, T5_08urgent);  		//5..4..3..2..1
	schedule(%detonationTime - 9000, game, doText, T5_07);	   	  		//ComeOn	
	schedule(%detonationTime - 10000, game, doText, T5_06d);	  		//10
	schedule(%detonationTime - 30000, game, doText, T5_06c);	  		// 30 secs
	schedule(%detonationTime - 64000, game, doText, T5_06a);	  		//reaction building fast
	schedule(%detonationTime - 60000, game, doText, T5_06b);	  		//1 min

}

function detonateBase()
{
	%playerDist = vectorDist($player.player.position, game.base.position);
	//BOOM
	//schedule(0.33 * %playerDist, game, serverplay2d, Training5BaseExplosionSound);
	schedule(0.33 * %playerDist, game, damagePlayersInBlast, game.minimumSafeDistance);
	$player.player.setWhiteOut(8);
	//messageAll(0, "You were "@%playerDist@"meters away.  Minimum safe distance is "@game.minimumSafeDistance);
	
	if( %playerDist < game.minimumSafeDistance || !$player.player) {
		schedule(5000, game, missionFailed, $player.miscMsg[training5loss] );
		moveMap.pop();
	}
   else {
		//messageAll(0, "You won!");
		schedule(5000, game, doText, T5_09, 3000);
		schedule(13000, game, messageBoxOK, "Victory", $player.miscMsg[training5win], "Canvas.popDialog(MessageBoxOKDlg); schedule(1000, game, trainingComplete);");
		moveMap.schedule(13000, "pop");
	}
} 

function trainingComplete()
{
	
	%skill = $pref::trainingDifficulty;
	switch (%skill)
	{
		case 2:
			%msg = "trainingOverMed";
		case 3:
			%msg = "trainingOverHard";
		default:
			%msg = "trainingOverEasy";
	}
	missionComplete( $player.miscMsg[%msg] );
}


function damagePlayersInBlast(%minDist)
{
	Canvas.popDialog(MessageBoxOKDlg);
	Canvas.popDialog(MessageBoxYesNoDlg);
	serverPlay2d(Training5BaseExplosionSound);
	
	%num = ClientGroup.getCount();
	for(%i = 0; %i < %num; %i++)
	{
		%client = clientGroup.getObject(%i);
		if(%client.player)
		{
			%Dist = vectorDist(%client.player.position, game.base.position);
			if(%dist < %minDist)
			{
				if(%client != $player)
					%client.player.scriptKill($DamageType::Explosion);
				else {
					moveMap.pop();
					
					if($firstperson)
						toggleFirstPerson($player);
						
					serverConnection.setBlackout(true, 3000);
					%client.player.setActionThread(Death11, true);
					%client.player.setDamageFlash(0.75);
				}
			}
			else
				$player.player.setWhiteOut(12);
		}
	}
}


// turninig off the Mission area on this one too folks
function SinglePlayerGame::leaveMissionArea(%game, %player)
{
}
function SinglePlayerGame::enterMissionArea(%game, %player)
{
}


function rotateDrawbridgeFFs(%time)
{
	if(%time == 0)
	{
		// catwalks on
		nameToId(CatwalkFFGen).setDamageState(Enabled);

		// stop rotation
		cancel(game.FFRotate);
		
		// set Enabled All bridges
		game.West.setDamageState(Enabled); 
		game.East.setDamageState(Enabled); 
		game.North.setDamageState(Enabled);
		game.South.setDamageState(Enabled);
	
	}
	else
	{
		// start these bad boys rotating
		
		if(game.activeBridgeSet == 1) {
			game.West.setDamageState(Enabled); 
			game.East.setDamageState(Enabled); 
			game.North.setDamageState(Disabled);
			game.South.setDamageState(Disabled);
			game.activeBridgeSet = 2;
		}
		else {
			game.West.setDamageState(Disabled); 
			game.East.setDamageState(Disabled); 
			game.North.setDamageState(Enabled);
			game.South.setDamageState(Enabled);
			game.activeBridgeSet = 1;
		}

		game.FFRotate = schedule(%time, game, rotateDrawbridgeFFs, %time);
	}
}

// helpful satchel charge instructions
function armSatchelCharge(%satchel)
{
	%deployer = %satchel.sourceObject;
	messageClient(%deployer.client, 0, "\c2Satchel Charge Armed! Press" SPC findTrainingControlButtons(useBackPack) SPC"to detonate.");
	if(!game.msgSatchelActivate)
	{
		game.msgSatchelActivate = true;
		doText(T5_tipSatchel01);	
	}
	parent::armSatchelCharge(%satchel);
}

function Pack::onInventory(%data, %obj, %amount)
{
	%oldSatchelCharge = (%obj.thrownChargeId ? true : false);
	Parent::onInventory(%data, %obj, %amount);
	%nowSatchelCharge = (%obj.thrownChargeId ? true : false);

	if(%oldSatchelCharge && !%nowSatchelCharge)
		messageClient(%obj.client, 0, "\c2You got a pack and nullified your satchel charge.");
}

function singlePlayerGame::onClientKilled(%game, %clVictim, %clKiller, %damageType, %implement)
{
	%hadSatchelCharge = (%clvictim.player.thrownChargeId ? true : false);
	if(%hadSatchelCharge)
		schedule(1500, game, messageClient, %clVictim, 0, "Your satchel charge has been nullified.");
		
	Parent::onClientKilled(%game, %clVictim, %clKiller, %damageType, %implement);
}

function missionClientKilled()
{
	//no console spam
}

//Training5 package functions end=======================================================
};

