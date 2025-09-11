// don't want this executing when building graphs
if($OFFLINE_NAV_BUILD)
   return;

// script for training mission 2
//-------------------------------------------------------------


//init
//-------------------------------------------------------------
error("Running Mission 2 Script");

activatePackage(Training2);
activatePackage(singlePlayerMissionAreaEnforce);

$numberOfEnemies[1] = 6;
$numberOfEnemies[2] = 8;
$numberOfEnemies[3] = 11;

//globals for base defense part
$numberOfWaves[1] = 3;
$numberOfWaves[2] = 4;
$numberOfWaves[3] = 5;
$numberInWave[1] = 2;
$numberInWave[2] = 3;
$numberInWave[3] = 5;

$numberOfTeammates = 1;
$missionBotSkill[1] = 0.0;
$missionBotSkill[2] = 0.5;
$missionBotSkill[3] = 0.9;

$victimSet[1] = "0 1 6 8";
$victimSet[2] = "2 3 9";
$victimSet[3] = "4 5 7 10";

// Team
$TeammateWarnom0 = "Dogkiller";

// mount plasma, missile launcher, targeting laser-------------------
addMessageCallback('MsgWeaponMount', playerMountWeapon);

// touch with pack on
addMessageCallback('MsgItemCollisionHavePack', playerTouchItemHavePack);

//repair initial pickup
addMessageCallback('MsgPackPickup', playerPickUp);

//repair self
addMessageCallback('MsgRepairPackPlayerSelfRepair', playerRepairSelf);

//repair nothing
addMessageCallback('MsgRepairPackNoTarget', noRepair);

//repair unpowered
addMessageCallback('MsgRepairPackRepairingObj', ObjRepair);

//enter inv station
addMessageCallback('msgEnterInvStation', StationInvEnter);

// shield pack
//addMessageCallback('MsgShieldPackOn', playerTurnsOnShield);



package training2 {
//--Training2 package begin -----------------------------------------------------------------
function SinglePlayerGame::initGameVars(%game)
{
   // for many of the objectives we are going to periodically
   // check the players distance vs some object
   // you could do this much prettier but its going to be very specific
   // so a cut and paste eyesore will be fine
   echo("initializing training2 game vars");
   %game.sensor = nameToID("MissionGroup/Teams/team2/base1/initialPulseSensor");
   %game.base1 = nameToID("MissionGroup/Teams/team2/base1/base");
   %game.base1.threshold1 = 240;
   %game.base1.threshold2 = 190;
   %game.base2 = nameToID("MissionGroup/Teams/team2/base2/base");
   %game.base2.threshold1 = 300;
   %game.base2.threshold2 = 250;
   %game.base3 = nameToID("MissionGroup/Teams/team2/base3/base");
   %game.base3.threshold1 = 330;
   %game.base3.threshold2 = 130;
}

function toggleScoreScreen(%val)
{
	if ( %val )
		//error("No Score Screen in training.......");
		messageClient($player, 0, $player.miscMsg[noScoreScreen]);
}

function toggleCommanderMap(%val)
{
	if ( %val )
	messageClient($player, 0, $player.miscMsg[noCC]);
}

function toggleTaskListDlg( %val )
{
   if ( %val )
      messageClient( $player, 0, $player.miscMsg[noTaskListDlg] );
}

function toggleNetDisplayHud( %val )
{
   // Hello, McFly?  This is training!  There's no net in training!
}

function voiceCapture( %val )
{
   // Uh, who do you think you are talking to?
}

function MP3Audio::play(%this)
{
	//too bad...no mp3 in training
}

function countTurretsAllowed(%type)
{
	return $TeamDeployableMax[%type];
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

function ClientCmdSetHudMode(%mode, %type, %node)
{
	parent::ClientCmdSetHudMode(%mode, %type, %node);
	
	movemap.push();   // hopefully this works
	//TrainingMap.push();
}

function AIEngageTask::assume(%task, %client)
{
	Parent::assume(%task, %client);

	if(%client.team != $playerTeam)
		game.biodermAssume(%client);
}

// get the ball rolling
function startCurrentMission(%game)
{
	
	createText( $player);
	setFlipFlopSkins();
	schedule(2000, %game, openingSpiel);
	//$player.timeLimit = schedule(45000, $player.player, playerHurryUp1);
	schedule(2000, %game, objectiveDistanceChecks); 
   	
   	giveEscortTask($teammate0, $player);
	$AIDisableChat = true;

	buildTraining2Team2ObjectiveQs();
	updateTrainingObjectiveHud(obj1);

	createTrainingSpecificBanList();
}

function SinglePlayerGame::gameOver(%game)
{
	$InvBanList[SinglePlayer, "TurretOutdoorDeployable"] = "";
	$InvBanList[SinglePlayer, "TurretIndoorDeployable"] = "";
	$InvBanList[SinglePlayer, "ElfBarrelPack"] = "";
	$InvBanList[SinglePlayer, "MortarBarrelPack"] = "";
	$InvBanList[SinglePlayer, "PlasmaBarrelPack"] = "";
	$InvBanList[SinglePlayer, "AABarrelPack"] = "";
	$InvBanList[SinglePlayer, "MissileBarrelPack"] = "";
	$InvBanList[SinglePlayer, "InventoryDeployable"] = "";

	parent::GameOver(%game);
}

function giveEscortTask(%bot, %player)
{
	%newObjective = new AIObjective(AIOEscortPlayer)
		{
			dataBlock = "AIObjectiveMarker";
			weightLevel1 = 10000;
			description = "Escort Player";
			targetClientId = $player;
			offense = true;
		};
	//echo(%newObjective);
	MissionCleanup.add(%newObjective);
	$ObjectiveQ[$playerTeam].add(%newObjective);
	$teammate0.DogKillerEscort = %newObjective;

	schedule(6000, %game, dogKillerSpeaks, 'ChatTaskCover');
}

function dogKillerSpeaks(%line)
{
	if(isObject($teammate0.player))
		serverCmdCannedChat($teammate0, %line, true);
}

function findDogKillerNextRespawn()
{
	%num = game.respawnPoint;
	%group = nameToId("Team1/DropPoints/Respawns");
	%object = %group.getObject(%num);
	return %object;

}

function getTeammateGlobals()
{
	$TeammateWarnom0 = "Dogkiller";
	$teammateskill0 = 0.7;
   if ( isDemo() )
      $teammateVoice0 = Male1;
   else   
	   $teammateVoice0 = Male5;
	$teammateEquipment0 = 2;
	$teammateGender0 = Male;
}

function SinglePlayerGame::AIChooseGameObjective(%game, %client)
{
	if(! %client.player)
		return;
	if (%client.team == $playerTeam)
		AIChooseObjective(%client);
	else
		AIChooseObjective(%client, $T2ObjectiveQ[%client.SpecialObjectives]);
}

function SinglePlayerGame::equip(%game, %player)
{
	//ya start with nothing...NOTHING!
	%player.clearInventory();

   for(%i =0; %i<$InventoryHudCount; %i++)
      %player.client.setInventoryHudItem($InventoryHudData[%i, itemDataName], 0, 1);
   %player.client.clearBackpackIcon();

	%set = %player.client.equipment;
	//error("equping Player "@%player@" with set"@%set);
	switch (%set) {

	   case 0: 
		   %player.setArmor("Medium");
		   
		   %player.setInventory(ShieldPack, 1);
		   
		   %player.setInventory(RepairKit,1);
		   %player.setInventory(Grenade,6);

		   %player.setInventory(Plasma, 1);
		   %player.setInventory(PlasmaAmmo, 25);
		   %player.setInventory(Disc,1);
		   %player.setInventory(DiscAmmo, 20);
		   %player.setInventory(ElfGun, 1);
		   %player.setInventory(MissileLauncher,1);
		   %player.setInventory(MissileLauncherAmmo, 10);
			%player.setInventory(TargetingLaser, 1);
			%player.weaponCount = 4;
		   %player.use("Disc");
	   
	   case 1: 
		   %player.setArmor("Light");
		   
		   %player.setInventory(EnergyPack, 1);
		   
		   %player.setInventory(RepairKit,1);
		   %player.setInventory(Grenade,6);

		   %player.setInventory(Chaingun, 1);
		   %player.setInventory(ChaingunAmmo, 25);
		   %player.setInventory(Disc,1);
		   %player.setInventory(DiscAmmo, 20);
		   %player.setInventory(ElfGun, 1);
			%player.weaponCount = 3;

		   %player.use("Disc");
	   
	   case 2: 
		   %player.setArmor("Medium");
		   
		   %player.setInventory(AmmoPack, 1);
		   
		   %player.setInventory(RepairKit,2);
		   %player.setInventory(Grenade,6);

		   %player.setInventory(Plasma, 1);
		   %player.setInventory(PlasmaAmmo, 50);
		   %player.setInventory(Disc,1);
		   %player.setInventory(DiscAmmo, 40);
		   %player.setInventory(ElfGun, 1);
		   %player.setInventory(MissileLauncher,1);
		   %player.setInventory(MissileLauncherAmmo, 10);
			%player.setInventory(TargetingLaser, 1);
			%player.weaponCount = 4;
		   %player.use("Disc");
		case 3:
			//echo("Heavy Inside Attacker");

			%player.setArmor("Heavy");
		   
			%player.setInventory(ShieldPack, 1);
		   
			%player.setInventory(RepairKit,1);
			%player.setInventory(Grenade,8);
			%player.setInventory(Mine,3);

			%player.setInventory(Plasma, 1);
			%player.setInventory(PlasmaAmmo, 50);
			%player.setInventory(Disc,1);
			%player.setInventory(DiscAmmo, 15);
			%player.setInventory(Mortar, 1);
			%player.setInventory(MortarAmmo, 10);
			%player.setInventory(ShockLance,1);
			%player.setInventory(Chaingun,1);
			%player.setInventory(ChaingunAmmo,200);
			%player.setInventory(TargetingLaser, 1);

			%player.use("Mortar");
			%player.weaponCount = 5;
   }
}                  

// Mission Part 2:  Tower Defense--------------------------------------------
//===========================================================================

function missionSpawnedAI(%client)
{
	%client.specialObjectives = 2;
	
	%wave = %client.memberOfWave;
	if(!game.trainingspawnedWaveLine[%wave]) {
		game.trainingspawnedWaveLine[%wave] = true;

		switch(%wave) {
 			case 1:
 				%turret = nameToId("MissionGroup/Teams/Team2/Base3/TurtleTurret");
 				if(%turret.isDisabled || %turret.isDestroyed)
 					doText(T2_tipDefense02);
 				else doText(T2_tipDefense03);
			case 2:
				doText(T2_12);
			case 3: 
				doText(T2_defense06);
				checkForAllDead();
		}
	}
}

function pickEquipment()
{
	return 1;
}

function playerMountWeapon(%tag, %text, %image, %player, %slot)
{		   
	if( game.firstTime++ < 2 || $pref::trainingDifficulty == 3)
		return;  // initial weapon mount doesnt count

	//this also turns off after a time so it doesnt show up in real combat
	if( game.base1t1)
		return;

	//echo("the problem is the image name: "@%image.getName());
	if(%image.getName() $= "PlasmaImage" && !game.msgPlas) {
		game.msgPlas = true;
		doText(T2_TipPlasma);  
		//echo("Plasma mount");
	} 
	if(%image.getName() $= "MissileLauncherImage" && !game.msgMisl) {
		game.msgMisl = true;
		doText(T2_TipMissile);  
		//echo("Missile mount");
	}
	if(%image.getName() $= "ELFGunImage" && !game.msgElf) {
		game.msgElf = true;
		doText(T2_TipElf);  
		//echo("Elf mount");
	}
	if(%image.getName() $= "TargetingLaserImage" && !game.msgLaze) {
		game.msgLaze = true;
		doText(T2_Tiptlaser);  
	}
}

function Pack::onCollision(%data, %obj, %col)
{
	//error("ItemData::onCollision("@%data@", "@%obj@", "@%col@")");
	  if($player.player.getMountedImage($backPackSlot)){
	  	messageClient($player, 'MsgItemCollisionHavePack', "", %data, %obj, %col);
	  }
	parent::onCollision(%data,%obj,%col);

}

function FlipFlop::playerTouch(%data, %flipFlop, %player)
{
   if(!Parent::playerTouch(%data, %flipflop, %player))
      return;

	if(!game.msgFlop && %flipFlop == nameToId("Base1/CommandSwitch")) {
		game.msgFlop = true;
		doText(T2_05b);
		doText(T2_05c);
		checkObjectives();
		updateTrainingObjectiveHud(obj4);
		game.respawnPoint = 1;
	}

	schedule(1000, game, checkObjectives);
}

function shapeBase::throwpack(%this, %data)
{
	if(!game.selfDestructSpeak && %this == $player.player) {
		game.selfDestructSpeak = true;
		doText(T3_tipEquipment01);
	}
	parent::throwPack(%this, %data);
}

function WeaponImage::onMount(%this,%obj,%slot)
{
	messageClient(%obj.client, 'MsgWeaponMount', "", %this, %obj, %slot);
	parent::onMount(%this,%obj,%slot);
}


// I need to find out exactly what gets called on sensor destruction
function SensorLargePulse::onDestroyed(%dataBlock, %destroyedObj, %prevState)
{												 
	if(%destroyedObj.getName() $= "InitialPulseSensor" && !game.initialSensorMsg) {
		game.initialSensorMsg = true;
		doText(T2_02);
		updateTrainingObjectiveHud(obj1);
	}
   Parent::onDestroyed(%data, %destroyObj, %prevState);
}

function Generator::onDestroyed(%data, %destroyedObj, %prevState)
{
	if(%destroyedObj == nameToId("MissionGroup/Teams/Team2/Base1/Generator") && !game.msgGenDestroyed)
	{
		game.msgGenDestroyed = true;
		doText(T2_TipGens01);
	}
   Parent::onDestroyed(%data, %destroyObj, %prevState);
}

function TurretBaseLarge::onDestroyed(%dataBlock, %destroyedObj, %prevState)
{
	//error("Lg*Turret Disabled");
 	if(!game.turretsDestroyed) {
		doText(Any_Kudo03);
		
		game.turretsDestroyed = true;
		updateTrainingObjectiveHud(obj1);
		checkObjectives();
	}
   Parent::onDestroyed(%data, %destroyObj, %prevState);
}

function stationTrigger::onEnterTrigger(%data, %obj, %colObj)  
{
   if(%colObj == $player.player)
        messageClient(%colObj.client, 'msgEnterInvStation', "");
   
	parent::onEnterTrigger(%data, %obj, %colObj);
}

function createTrainingSpecificBanList()
{
	$InvBanList[SinglePlayer, "TurretOutdoorDeployable"] = 1;
	$InvBanList[SinglePlayer, "TurretIndoorDeployable"] = 1;
	$InvBanList[SinglePlayer, "ElfBarrelPack"] = 1;
	$InvBanList[SinglePlayer, "MortarBarrelPack"] = 1;
	$InvBanList[SinglePlayer, "PlasmaBarrelPack"] = 1;
	$InvBanList[SinglePlayer, "AABarrelPack"] = 1;
	$InvBanList[SinglePlayer, "MissileBarrelPack"] = 1;
	$InvBanList[SinglePlayer, "InventoryDeployable"] = 1;
} 		  

//im putting all the callbacks into the package... just in case
//----------------------------------------------------------------
function playerTouchItemHavePack(%this, %text, %data, %collided, %collider)
{
	//error("playerTouchItemHavePack("@%this@", "@%text@", "@%data@", "@%collided@", "@%collider@")");
	if(%collider == $player.player && !game.msghavePack && !game.tower3Secure) {
		game.msghavePack = true;
		doText(T2_TipDropit);   
	}			   
}
function RepairPack::onPickUp(%this, %obj, %player)
{
	//error("RepairPack::onPickUp("@%this@", "@%obj@", "@%player@")");
	if( !game.msgRepairPackPickUp && %player == $player.player) {
		game.msgRepairPackPickUp = true;
		//doText(T2_repairPack, 1500);
		doText(T2_tipRepair01);
		dotext(T2_TipRepair03);
	}
}

// function playerRepairSelf(%tag, %text)
// {
// 	if(!game.msgSelf){
// 		game.msgSelf = true;
// 		dotext(T2_TipRepair03);
// 	}
// }

function noRepair(%tag, %text)
{
	if(!game.msgRep){
		game.msgRep = true;
		doText(T2_TipRepair02);
	}
}
function ObjRepair(%tag, %string, %objName, %objID)
{
	if(%objID.getDatablock().classname !$= "generator" &&
	%objID.isPowered() && game.tower3Secure && !game.tipD2) {
		game.tipD2 = true;
		//doText(T2_tipDefense02);
	}
} 

// function StationInvEnter(%a1, %a2)
// {
// 	//error("Inv Enter..........");
// 	if(!game.msgEnterInv){
// 		game.msgEnterInv = true;
// 		doText(T2_tipInventory);
// 		//doText(T2_tipDefense01);
// 	}
// }

// function playerTurnsOnShield()
// {
// 	if(!game.msgShield) {
// 		game.msgShield++;
// 		doText(T2_TipShieldpack);
// 	}
// }

function openingSpiel()
{
	doText(T2_01, 6000);
	doText(T2_TipShieldpack);
}

function SinglePlayerGame::onClientKilled(%game, %clVictim, %clKiller, %damageType, %implement)
{
	if(%damageType == $DamageType::sentryTurret && !game.sentryTurretKill && %clVictim.team != $playerTeam)
	{
		game.sentryTurretKill = true;
		doText(T2_tipDefense05);
	}
	
 	if(%clVictim == $player && game.respawnPoint != 3)
 	{
 		%point = findDogKillerNextRespawn();
  		%DKdefend = new AIObjective(AIODefendLocation)
  		{
 			datablock = "AIObjectiveMarker";
 			position = %point.position;
 			rotation = "1 0 0 0";
 			scale = "1 1 1";
 			description = "Defend the players next respawn";
 			location = %point.position;
 			weightLevel1 = 7000;
 			targetClientId = "-1";
 			targetObjectId = %point;
 		};
  		MissionCleanup.add(%DKdefend);
  		$ObjectiveQ[$playerTeam].add(%DKdefend);
  		game.dogKillersPlayerDefend = %DKdefend;
 	}

	Parent::onClientKilled(%game, %clVictim, %clKiller, %damageType, %implement);
}

function spawnSinglePlayer()
{
	if(isObject(game.dogKillersPlayerDefend))
	{
		AIClearObjective($teammate0.dogKillersPlayerDefend);
	   	$teammate0.dogKillersPlayerDefend.weightLevel1 = 0;
		
		game.dogKillersPlayerDefend.delete();
	}
	
	parent::spawnSinglePlayer();
}

function missionClientKilled(%clVictim, %killer)
{

	if(%killer == $player && %clVictim.team == $enemyTeam)
		schedule(3000, $player.player, adviseHealthKit);
		
	if(%killer == $teammate0 && %clVictim.team == $enemyTeam)
		%random = getRandom(50);
		if(%random  == 1) {
			schedule(500, game, dogKillerSpeaks, 'ChatBrag');
		}
		else if(%random  == 2) {
			schedule(500, game, dogKillerSpeaks, 'ChatAwesome');
		}
			 
	
	%set = checkForSequenceSkillCompletion(%clvictim);
	game.victimSetKilled[%set] = true;
	
	if(%set == 1 && nameToId("base1/CommandSwitch").team != $playerTeam)
		if(%killer == $player)
			schedule(800, $player.player, doText, Any_Jingo03);  //no mercy, remember Ymir

	schedule(3000, game, checkObjectives);	
}

function adviseHealthKit()
{
	if($player.player.getdamageLevel() > 0.3
		&& $player.player.getInventory(RepairKit) && !game.useHeath) {
		game.useHealth = true;
		doText(Any_HealthKit);
	}
}

function checkForSequenceSkillCompletion(%victim)
{
	%set = findVictimSet(%victim);
	//how is everbody esle in the set doing
	for(%i = 0; %i < getWordCount($victimSet[%set]); %i++){
		%enemy = getWord($victimSet[%set], %i);
		if($enemy[%enemy] && $enemy[%enemy].player && $enemy[%enemy] != %victim) {
			error("There is $Enemy"@%enemy@" still in set "@ %set);
			return 0;
		}
	}
	return %set;

}

function findVictimSet(%victim)
{
	for(%i = 1; %i <= 3; %i++) {
		for(%word = 0; %word < getWordCount($victimSet[%i]); %word++) {
			%num = getWord($victimSet[%i], %word);
			if($enemy[%num] == %victim) {
				error("Victim is member of victim set "@%i);
				return %i;
			}
		}
	}
}


function checkObjectives()
{
	if( !isSafe($player, 100) ) {
		error("player is not safe");
		schedule(10000, game, checkObjectives);
		return;  //objectives cannot be met if enemies are near
	}

	else if(nameToId("base1/CommandSwitch").team == $playerTeam && !game.train07) {
		game.initialSensorMsg = true;  //so you cant double back to get the sensorDestoyed msg
		game.train07 = true;
		schedule(5000, $player, doText, T2_07);
	}
	else if(game.turretsDestroyed && !game.train10 && game.victimSetKilled2) {
		game.train10 = true;
		tower2clean();
	}
	else if(nameToId("base3/EasternFortification").team == $playerTeam && game.victimSetKilled3
		&& !game.tower3Secure) {
		game.tower3Secure = true;
	   	
		//Dogkiller can now pick up team objectives
		AIClearObjective($teammate0.DogKillerEscort);
	   	$teammate0.DogKillerEscort.weightLevel1 = 0;
				
		schedule(6000, game, dogKillerSpeaks, 'ChatSelfDefendBase');

	   	doText(T2_10);
	   	doText(T2_10a);
	   	doText(T2_11, 2000);

		// first get the gens up
		if( ! nameToId("base3/EasternFortification").isPowered() )
		{
			//echo("switch is not powered");
			doText(t2_TipDefense02, 1000);
		
		}

		// now the inventory stuff
	   	doText(T2_inventory01);
	   	doText(T2_tipInventory01);
	   	doText(T2_tipInventory03);
		%timeToFirstWave = (2.1 - $pref::trainingDifficulty) * 10000;
		schedule(%timeToFirstWave, game, spawnWave, 1);  //beginTowerDefense
		convertPassedEnemies();
		
		updateTrainingObjectiveHud(obj2);
		game.respawnPoint = 3;
	}
}

function missionWaveDestroyed()
{
	// there have been cases where this didnt seem to get called
	// lets try again
	convertPassedEnemies();
}


function tower2clean()
{
	doText(ANY_Waypoint02);
	%newWaypoint = "797.596 -652.19 162.924";
	schedule(2000, game, setWaypointAt, %newWaypoint, "Control Switch");
	updateTrainingObjectiveHud(obj3);
	game.respawnPoint = 2;
}

function convertPassedEnemies()
{
	%num = clientGroup.getCount();
	for(%i = 0; %i < %num; %i++) {
		%client = clientGroup.getObject(%i);
		if(%client.player) {
			if(%client.specialObjectives != 2) {
				%client.specialObjectives = 2;
				// and to make sure the bot doesnt THINK what its
				// currently doing is more important
				aiUnassignClient(%client);
			}
		}
	}
}

function singlePlayerGame::pickTeamSpawn(%game, %client, %respawn)
{
	if(game.tower3Secure && %client.team == $enemyTeam)
	   Training2LaterPickTeamSpawn(%game, %client);
	else parent::pickTeamSpawn(%game, %client, %respawn);	
}


function Training2LaterPickTeamSpawn(%game, %client)
{
	%dp = game.pickRandomDropPoint(%client);
	InitContainerRadiusSearch(%dp.position, 2, $TypeMasks::PlayerObjectType);
  	if( containerSearchNext() ) {
		//error("Too close object, picking again?");
		if(game.DPRetries++ > 100)
			return "0 0 300";
		else return game.pickTeamSpawn(%client);
	}

	else {
		game.DPRetries = 0;
		return %dp.getTransform();
	}
}

function singlePlayerGame::pickRandomDropPoint(%game, %client)
{
	//error("picking random point for "@%client);
	%group = nameToID("MissionGroup/Teams/team2/DropPoints/Respawns");
	%num = %group.getCount();
	%random = getRandom(1,%num);
	%dp = %group.getObject( %random );

	return %dp;
}


function checkForAllDead()
{
	//none of this matters if you're dead
 	if(!$player.player) {
		//error("You have no player!");
		schedule(5000, game, checkForAllDead);
 		return;
	}


	%num = clientGroup.getCount();
	for(%i = 0; %i < %num; %i++)
	{
		%client =  ClientGroup.getObject(%i);
		if(%client.player && %client.team == $enemyTeam) {
			//error("Client " @ %client @ " is still alive.");
			schedule(5000, game, checkForAllDead);
			return;
		}
	}
	//messageAll(0, "Debug: I dont think there are any enemies alive");
	doText(T2_13);
	schedule(2000, game, missionComplete, $player.miscMsg[training2win]);
}

function objectiveDistanceChecks()
{
	%playerPosition = $player.player.getTransform();
	if(!%playerPosition) {
		schedule(5000, game, objectiveDistanceChecks);
		return;
	}
	
	
	%sensorDist = vectorDist(%playerPosition, game.sensor.position);
	if(%sensorDist < 250 && !game.sensorText) {
		game.sensorText = true;
		cancel($player.timeLimit);
		doText(T2_01a, 3000);
		doText(T2_01b);
		doText(T2_tipScanned);
		schedule(4000, game, updateTrainingObjectiveHud, obj5);
	}
	%base1distance = vectorDist( %playerPosition, game.base1.position ); 
	//error("debug distance: base1- "@%base1distance);
	if(%base1distance < game.base1.threshold1 && !game.base1t1 )
	{
		game.base1t1 = true;
		doText(T2_03);
		cancel($player.timeLimit);	
	}
	if(%base1distance < game.base1.threshold2 && !game.base1t2 )
	{
		game.base1t2 = true;
		doText(T2_04);	
		doText(T2_04a);	
		doText(T2_05);	
		updateTrainingObjectiveHud(obj3);
	}
	
	%base2distance = vectorDist( %playerPosition, game.base2.position ); 
	//error("debug distance: base2- "@%base2distance);
	if(%base2distance < game.base2.threshold1 && !game.base2t1 && !game.turretsDestroyed)
	{
		game.base2t1 = true;
		doText(T2_08);	
		updateTrainingObjectiveHud(obj6);
	}
//error(game.turretsDestroyed);
	if(%base2distance < game.base2.threshold2 && !game.base2t2 && !game.turretsDestroyed)
	{
		game.base2t2 = true;
		doText(T2_TipTurret02);	
		
		if( getPlayersOnTeam($playerTeam) < 2)
			doText(T2_Cya01);	
	}
	
	%base3distance = vectorDist( %playerPosition, game.base3.position ); 
	//error("debug distance: base3- "@%base3distance);
	if(%base3distance < game.base3.threshold1 && !game.base3t1)
	{
		game.base3t1 = true;
		doText(T2_09a);	
	}
	
	if(%base3distance < game.base3.threshold2 && !game.base3t2) {
		game.base3t2 = true;
		doText(T2_09b);
		if($player.player.getMountedImage($backpackSlot) $= "ShieldPackImage")
			doText(T2_ShieldPack02);
	}
	
	schedule(4000, game, objectiveDistanceChecks); 
}


function buildTraining2Team2ObjectiveQs()
{
	$T2ObjectiveQ[0] = new AIObjectiveQ();
	MissionCleanup.add($T2ObjectiveQ[0]);

	$T2ObjectiveQ[1] = new AIObjectiveQ();
	MissionCleanup.add($T2ObjectiveQ[1]);

	$T2ObjectiveQ[2] = new AIObjectiveQ();
	MissionCleanup.add($T2ObjectiveQ[2]);


	//////////////////objectiveQ 0--------------------------------------------------------------
	%newObjective = new AIObjective(AIORepairObject) {
		datablock = "AIObjectiveMarker";
		position = "-163.766 126.029 103.831";
		rotation = "1 0 0 0";
		scale = "1 1 1";
		description = "Repair the initial SensorLargePulse";
		targetObject = "InitialPulseSensor";
		targetClientId = "-1";
		targetObjectId = nameToId("InitialPulseSensor");
		location = "-163.766 126.029 103.831";
		weightLevel1 = "4000";
		weightLevel2 = "0";
		weightLevel3 = "0";
		weightLevel4 = "0";
		offense = "0";
		defense = "1";
		equipment = "Light RepairPack";
		buyEquipmentSet = "";
		issuedByHuman = "0";
		issuingClientId = "-1";
		forceClientId = "-1";
		locked = "0";
	};
	MissionCleanup.add(%newObjective);
	$T2ObjectiveQ[0].add(%newObjective);

	%newObjective = new AIObjective(AIORepairObject) {
		datablock = "AIObjectiveMarker";
		position = "-33.7195 -131.864 133.096";
		rotation = "1 0 0 0";
		scale = "1 1 1";
		description = "Repair the base1 Gen";
		targetObject = "generator";
		targetClientId = "-1";
		targetObjectId = nameToId("base1/generator");
		location = "-33.7195 -131.864 133.096";
		weightLevel1 = "3200";
		weightLevel2 = "1600";
		weightLevel3 = "0";
		weightLevel4 = "0";
		offense = "0";
		defense = "1";
		equipment = "RepairPack";
		buyEquipmentSet = "";
		issuedByHuman = "0";
		issuingClientId = "-1";
		forceClientId = "-1";
		locked = "0";
	};
	MissionCleanup.add(%newObjective);
	$T2ObjectiveQ[0].add(%newObjective);

	%newObjective = new AIObjective(AIODefendLocation) {
		datablock = "AIObjectiveMarker";
		position = "-33.7195 -131.864 133.096";
		rotation = "1 0 0 0";
		scale = "1 1 1";
		description = "Defend the base1 gen";
		targetObject = "generator";
		targetClientId = "-1";
		targetObjectId = nameToId("base1/generator");
		location = "-12 -131.864 133.096";
		weightLevel1 = "3100";
		weightLevel2 = "1500";
		weightLevel3 = "0";
		weightLevel4 = "0";
		offense = "0";
		defense = "1";
		desiredEquipment = "";
		buyEquipmentSet = "";
		issuedByHuman = "0";
		issuingClientId = "-1";
		forceClientId = "-1";
		locked = "0";
	};
	MissionCleanup.add(%newObjective);
	$T2ObjectiveQ[0].add(%newObjective);

	%newObjective = new AIObjective(AIODefendLocation) {
		datablock = "AIObjectiveMarker";
		position = "-8.82616 -131.779 121.39";
		rotation = "1 0 0 0";
		scale = "1 1 1";
		description = "Defend the base 1 flipflop";
		targetObject = "CommandSwitch";
		targetClientId = "-1";
		targetObjectId =  nameToId("CommandSwitch");
		location = "-8.82616 -131.779 121.39";
		weightLevel1 = "3900";
		weightLevel2 = "2000";
		weightLevel3 = "0";
		weightLevel4 = "0";
		offense = "0";
		defense = "1";
		desiredEquipment = "";
		buyEquipmentSet = "";
		issuedByHuman = "0";
		issuingClientId = "-1";
		forceClientId = "-1";
		locked = "0";
	};
	MissionCleanup.add(%newObjective);
	$T2ObjectiveQ[0].add(%newObjective);

	%newObjective = new AIObjective(AIOTouchObject) {
		datablock = "AIObjectiveMarker";
		position = "-8.82616 -131.779 121.39";
		rotation = "1 0 0 0";
		scale = "1 1 1";
		description = "Capture the base1 FlFlop";
		mode = "TouchFlipFlop";
		targetObject = "CommandSwitch";
		targetClientId = "-1";
		targetObjectId = nameToID("CommandSwitch");
		location = "-8.82616 -131.779 121.39";
		weightLevel1 = "3850";
		weightLevel2 = "0";
		weightLevel3 = "0";
		weightLevel4 = "0";
		offense = "1";
		defense = "0";
		equipment = "light";
		desiredEquipment = "";
		buyEquipmentSet = "";
		issuedByHuman = "0";
		issuingClientId = "-1";
		forceClientId = "-1";
		locked = "0";
	};
	MissionCleanup.add(%newObjective);
	if($pref::trainingDifficulty != 1)
		$T2ObjectiveQ[0].add(%newObjective);

	%newObjective = new AIObjective(AIORepairObject) {
		datablock = "AIObjectiveMarker";
		position = "-11.5761 -131.662 172.204";
		rotation = "1 0 0 0";
		scale = "1 1 1";
		description = "Repair the Sensor Pulsation";
		targetObject = "Team2SensorMediumPulse1";
		targetClientId = "-1";
		targetObjectId =  nameToId("Team2SensorMediumPulse1");
		location = "-11.5761 -131.662 172.204";
		weightLevel1 = "3100";
		weightLevel2 = "1000";
		weightLevel3 = "0";
		weightLevel4 = "0";
		offense = "0";
		defense = "1";
		equipment = "RepairPack";
		buyEquipmentSet = "";
		issuedByHuman = "0";
		issuingClientId = "-1";
		forceClientId = "-1";
		locked = "0";
	};
	MissionCleanup.add(%newObjective);
	$T2ObjectiveQ[0].add(%newObjective);


	///////////////objectiveQ 1---------------------------------------------------------------
	%newObjective = new AIObjective(AIODefendLocation) {
		datablock = "AIObjectiveMarker";
		position = "380.576 -301.298 101.843";
		rotation = "1 0 0 0";
		scale = "1 1 1";
		description = "Defend the Base2 Gen";
		targetObject = "generator";
		targetClientId = "-1";
		targetObjectId =  nameToId("base2/generator");
		location = "380.576 -301.298 101.843";
		weightLevel1 = "3100";
		weightLevel2 = "1500";
		weightLevel3 = "1000";
		weightLevel4 = "0";
		offense = "0";
		defense = "1";
		desiredEquipment = "";
		buyEquipmentSet = "";
		issuedByHuman = "0";
		issuingClientId = "-1";
		forceClientId = "-1";
		locked = "0";
	};
	MissionCleanup.add(%newObjective);
	$T2ObjectiveQ[1].add(%newObjective);

	///////////////objectiveQ 2---------------------------------------------------------------
	%newObjective = new AIObjective(AIORepairObject) {
		datablock = "AIObjectiveMarker";
		position = "787.866 -647.605 164.343";
		rotation = "1 0 0 0";
		scale = "1 1 1";
		description = "Repair gen3";
		targetObject = "Generator3";
		targetClientId = "-1";
		targetObjectId =  nameToId("Generator3");
		location = "787.866 -647.605 164.343";
		weightLevel1 = "4000";
		weightLevel2 = "";
		weightLevel3 = "0";
		weightLevel4 = "0";
		offense = "0";
		defense = "1";
		equipment = "RepairPack";
		buyEquipmentSet = "";
		issuedByHuman = "0";
		issuingClientId = "-1";
		forceClientId = "-1";
		locked = "0";
	};
	MissionCleanup.add(%newObjective);
	$T2ObjectiveQ[2].add(%newObjective);

	%newObjective = new AIObjective(AIODefendLocation) {
		datablock = "AIObjectiveMarker";
		position = "787.866 -647.605 164.343";
		rotation = "1 0 0 0";
		scale = "1 1 1";
		description = "Defend gen3";
		targetObject = "Generator3";
		targetClientId = "-1";
		targetObjectId =  nameToId("Generator3");
		location = "787.866 -647.605 164.343";
		weightLevel1 = "3400";
		weightLevel2 = "0";
		weightLevel3 = "0";
		weightLevel4 = "0";
		offense = "0";
		defense = "1";
		desiredEquipment = "";
		buyEquipmentSet = "";
		issuedByHuman = "0";
		issuingClientId = "-1";
		forceClientId = "-1";
		locked = "0";
	};
	MissionCleanup.add(%newObjective);
	$T2ObjectiveQ[2].add(%newObjective);

	%newObjective = new AIObjective(AIOAttackObject) {
		datablock = "AIObjectiveMarker";
		position = "785.96 -659.402 138.593";
		rotation = "1 0 0 0";
		scale = "1 1 1";
		description = "Attack the Station Alpha";
		targetObject = "Inventory_Alpha";
		targetClientId = "-1";
		targetObjectId =  nameToId("Inventory_Alpha");
		location = "785.96 -659.402 138.593";
		weightLevel1 = "2900";
		weightLevel2 = "1400";
		weightLevel3 = "0";
		weightLevel4 = "0";
		offense = "1";
		defense = "0";
		desiredEquipment = "";
		buyEquipmentSet = "";
		issuedByHuman = "0";
		issuingClientId = "-1";
		forceClientId = "-1";
		locked = "0";
	};
	MissionCleanup.add(%newObjective);
	$T2ObjectiveQ[2].add(%newObjective);

	%newObjective = new AIObjective(AIOAttackObject) {
		datablock = "AIObjectiveMarker";
		position = "793.435 -647.88 138.499";
		rotation = "1 0 0 0";
		scale = "1 1 1";
		description = "Attack the Station Beta";
		targetObject = "Inventory_Beta";
		targetClientId = "-1";
		targetObjectId =  nameToId("Inventory_Beta");
		location = "793.435 -647.88 138.499";
		weightLevel1 = "2900";
		weightLevel2 = "1400";
		weightLevel3 = "0";
		weightLevel4 = "0";
		offense = "1";
		defense = "0";
		desiredEquipment = "";
		buyEquipmentSet = "";
		issuedByHuman = "0";
		issuingClientId = "-1";
		forceClientId = "-1";
		locked = "0";
	};
	MissionCleanup.add(%newObjective);
	$T2ObjectiveQ[2].add(%newObjective);

	%newObjective = new AIObjective(AIORepairObject) {
		datablock = "AIObjectiveMarker";
		position = "792.748 -656.036 143.914";
		rotation = "1 0 0 0";
		scale = "1 1 1";
		description = "Repair the SentryTurret";
		targetObject = "TurtleTurret";
		targetClientId = "-1";
		targetObjectId = nameToId("TurtleTurret");
		location = "792.748 -656.036 143.914";
		weightLevel1 = "3100";
		weightLevel2 = "0";
		weightLevel3 = "0";
		weightLevel4 = "0";
		offense = "0";
		defense = "1";
		equipment = "RepairPack";
		buyEquipmentSet = "";
		issuedByHuman = "0";
		issuingClientId = "-1";
		forceClientId = "-1";
		locked = "0";
	};
	MissionCleanup.add(%newObjective);
	$T2ObjectiveQ[2].add(%newObjective);

	%newObjective = new AIObjective(AIOTouchObject) {
		datablock = "AIObjectiveMarker";
		position = "797.596 -652.19 164.558";
		rotation = "1 0 0 0";
		scale = "1 1 1";
		description = "Capture the Base3 FlipFlop";
		mode = "TouchFlipFlop";
		targetObject = "EasternFortification";
		targetClientId = "-1";
		targetObjectId = nameToId("EasternFortification");
		location = "797.596 -652.19 164.558";
		weightLevel1 = "3850";
		weightLevel2 = "3400";
		weightLevel3 = "3000";
		weightLevel4 = "0";
		offense = "1";
		defense = "0";
		desiredEquipment = "Light";
		buyEquipmentSet = "";
		issuedByHuman = "0";
		issuingClientId = "-1";
		forceClientId = "-1";
		locked = "0";
	};
	MissionCleanup.add(%newObjective);
	if($pref::trainingDifficulty != 1)
		$T2ObjectiveQ[2].add(%newObjective);

	%newObjective = new AIObjective(AIOAttackObject) {
		datablock = "AIObjectiveMarker";
		position = "787.866 -647.605 164.343";
		rotation = "1 0 0 0";
		scale = "1 1 1";
		description = "Attack the generatorLarge";
		targetObject = "Generator3";
		targetClientId = "-1";
		targetObjectId = nameToId("Generator3");
		location = "787.866 -647.605 164.343";
		weightLevel1 = "3100";
		weightLevel2 = "1600";
		weightLevel3 = "0";
		weightLevel4 = "0";
		offense = "1";
		defense = "0";
		desiredEquipment = "ShieldPack";
		buyEquipmentSet = "HeavyAmmoSet";
		issuedByHuman = "0";
		issuingClientId = "-1";
		forceClientId = "-1";
		locked = "0";
	};
	MissionCleanup.add(%newObjective);
	$T2ObjectiveQ[2].add(%newObjective);

	%newObjective = new AIObjective(AIORepairObject) {
		datablock = "AIObjectiveMarker";
		position = "785.96 -659.402 138.593";
		rotation = "1 0 0 0";
		scale = "1 1 1";
		description = "Repair the StationInventory";
		targetObject = "Inventory_Alpha";
		targetClientId = "-1";
		targetObjectId = nameToId("Inventory_Alpha");
		location = "785.96 -659.402 138.593";
		weightLevel1 = "3500";
		weightLevel2 = "1400";
		weightLevel3 = "0";
		weightLevel4 = "0";
		offense = "0";
		defense = "1";
		equipment = "RepairPack";
		buyEquipmentSet = "MediumRepairSet";
		issuedByHuman = "0";
		issuingClientId = "-1";
		forceClientId = "-1";
		locked = "0";
	};
	MissionCleanup.add(%newObjective);
	$T2ObjectiveQ[2].add(%newObjective);

	%newObjective = new AIObjective(AIORepairObject) {
		datablock = "AIObjectiveMarker";
		position = "793.435 -647.88 138.499";
		rotation = "1 0 0 0";
		scale = "1 1 1";
		description = "Repair the StationInventory";
		targetObject = "Inventory_Beta";
		targetClientId = "-1";
		targetObjectId = nameToId("Inventory_Beta");
		location = "793.435 -647.88 138.499";
		weightLevel1 = "3500";
		weightLevel2 = "1400";
		weightLevel3 = "0";
		weightLevel4 = "0";
		offense = "0";
		defense = "1";
		equipment = "RepairPack";
		buyEquipmentSet = "MediumRepairSet";
		issuedByHuman = "0";
		issuingClientId = "-1";
		forceClientId = "-1";
		locked = "0";
	};
	MissionCleanup.add(%newObjective);
	$T2ObjectiveQ[2].add(%newObjective);

	%newObjective = new AIObjective(AIODefendLocation) {
		datablock = "AIObjectiveMarker";
		position = "791.311 -655.22 156.159";
		rotation = "1 0 0 0";
		scale = "1 1 1";
		description = "Defend the Base 3FlipFlop";
		targetObject = "EasternFortification";
		targetClientId = "-1";
		targetObjectId = nameToId("EasternFortification");
		//location = "797.596 -652.19 164.558";
		location = "791.311 -655.22 156.159";
		weightLevel1 = "3900";
		weightLevel2 = "2900";
		weightLevel3 = "300";
		weightLevel4 = "100";
		offense = "0";
		defense = "1";
		desiredEquipment = "ShieldPack Plasma PlasmaAmmo";
		buyEquipmentSet = "HeavyShieldSet";
		issuedByHuman = "0";
		issuingClientId = "-1";
		forceClientId = "-1";
		locked = "0";
	};
	MissionCleanup.add(%newObjective);
	$T2ObjectiveQ[2].add(%newObjective);
	
	%newObjective = new AIObjective(AIORepairObject) {
		datablock = "AIObjectiveMarker";
		position = "556.144 -411.448 133.224";
		rotation = "1 0 0 0";
		scale = "1 1 1";
		description = "Repair the SensorMediumPulse";
		targetObject = "MidwaySensor";
		targetClientId = "-1";
		targetObjectId = nameToId("MidwaySensor");
		location = "556.144 -411.448 133.224";
		weightLevel1 = "4000";
		weightLevel2 = "0";
		weightLevel3 = "0";
		weightLevel4 = "0";
		offense = "0";
		defense = "1";
		equipment = "RepairPack";
		buyEquipmentSet = "";
		issuedByHuman = "0";
		issuedByClientId = "-1";
		forceClientId = "-1";
		locked = "0";
	};
	MissionCleanup.add(%newObjective);
	$T2ObjectiveQ[2].add(%newObjective);
	
	%newObjective = new AIObjective(AIODefendLocation) {
		datablock = "AIObjectiveMarker";
		position = "785.96 -659.402 138.593";
		rotation = "1 0 0 0";
		scale = "1 1 1";
		description = "Defend the Downstairs//Stations";
		targetObject = "Inventory_Alpha";
		targetClientId = "-1";
		targetObjectId = nameToId("Inventory_Alpha");
		location = "785.96 -659.402 138.593";
		weightLevel1 = "3700";
		weightLevel2 = "0";
		weightLevel3 = "0";
		weightLevel4 = "0";
		offense = "0";
		defense = "1";
		desiredEquipment = "ShieldPack Plasma PlasmaAmmo";
		buyEquipmentSet = "HeavyShieldSet";
		issuedByHuman = "0";
		issuingClientId = "-1";
		forceClientId = "-1";
		locked = "0";
	};
	MissionCleanup.add(%newObjective);
	$T2ObjectiveQ[2].add(%newObjective);
	
}


//--Training2 package END -----------------------------------------------------------------
};

