// don't want this executing when building graphs
if($OFFLINE_NAV_BUILD)
   return;

echo("Running Mission 4 Script");
activatePackage(Training4);
activatePackage(singlePlayerMissionAreaEnforce);


//special sound
datablock AudioProfile(HudFlashSound)
{
   filename    = "gui/buttonover.wav";
   description = AudioDefault3d;
   preload = true;
};

$numberOfEnemies[1] = 0;
$numberOfEnemies[2] = 0;
$numberOfEnemies[3] = 0;

// Mission Variables
$numberOfWaves[1] = 3;
$numberOfWaves[2] = 5;
$numberOfWaves[3] = 7;

$numberInWave[1] = 3;
$numberInWave[2] = 5;
$numberInWave[3] = 7;

$delayBeforeFirstWave[1] = 300000;
$delayBeforeFirstWave[2] = 200000;
$delayBeforeFirstWave[3] =   20000;

$missionBotSkill[1] = 0.0;
$missionBotSkill[2] = 0.5;
$missionBotSkill[3] = 0.8;

$numberOfTeammates = 2;

package training4 {
//===============================================begin the training 4 package stuff====
function getTeammateGlobals()
{
	$TeammateWarnom0 = "Firecrow";
	$teammateskill0 = 0.5;
	$teammateVoice0 = Fem3;
	$teammateEquipment0 = 0;
	$teammateGender0 = Female;

	$TeammateWarnom1 = "Proteus";
	$teammateSkill1 = 0.5;
	$teammateVoice1 = Male4;
	$teammateEquipment1 = 0;
	$teammateGender1 = Male;
}


function MP3Audio::play(%this)
{
	//too bad...no mp3 in training
}


function ClientCmdSetHudMode(%mode, %type, %node)
{
	parent::ClientCmdSetHudMode(%mode, %type, %node);
	//TrainingMap.push();
}

// get the ball rolling
function startCurrentMission(%game)
{
	game.equip($player.player);

	if($pref::TrainingDifficulty == 3)
		updateTrainingObjectiveHud(obj10);
	else{
		schedule(5000, game, repairSensorTower);
		updateTrainingObjectiveHud(obj1);
	}
	$player.beginSpawn = schedule($delayBeforeFirstWave[$pref::TrainingDifficulty], %game, spawnWave, 1);
	$AIDisableChat = true;
	game.missionTime = getSimTime();
	activateskillSpecificTrainingSettings();
}

function activateskillSpecificTrainingSettings()
{
	%skill = $pref::TrainingDifficulty;

	// all
	nameToId("Team1SensorLargePulse1").setDamageLevel(1.5);
	nameToId("Team1SensorLargePulse2").setDamageLevel(1.5);
	
	//skill 2 & 3 :
		//no forcefield, no upstairs Inventory deploy, aaturret(in the mis file)
	if(%skill > 1) {

		%invDepObj = findObjByDescription("Deploy Upstairs Station", 1);
		removeDescribedObj(%invDepObj, 1);
	}
	// skill 3: no turret, no destroy turret or upstairs gen objectives
	if(%skill > 2) {
		nameToId(Team1TurretBaseLarge1).hide(true);
      freeTarget(nameToId(Team1TurretBaseLarge1).getTarget());
		nameToId(GenForceField).delete();
	}
}

function countTurretsAllowed(%type)
{
	return $TeamDeployableMax[%type];
}

function giveall()
{
	error("When the going gets tough...wussies like you start cheating!");
	messageClient($player, 0, "Cheating eh?  What\'s next?  Camping?");
}

function kobayashi_maru()
{
   $testcheats = true;
   commandToServer('giveAll');
}


function pickEquipment()
{
	return getRandom(10);
}

function AIEngageTask::assume(%task, %client)
{
	Parent::assume(%task, %client);

	if(%client.team != $playerTeam)
		game.biodermAssume(%client);
}

function toggleScoreScreen(%val)
{
	if ( %val )
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

function singlePlayerGame::pickTeamSpawn(%game, %client)
{
	if(%client.team == $player.team)
		return parent::pickTeamSpawn(%game, %client);
	%dp = game.pickRandomDropPoint(%client);
	InitContainerRadiusSearch(%dp.position, 2, $TypeMasks::PlayerObjectType);
  	if( containerSearchNext() ) {
		//echo("Too close object, picking again?");
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
	error("picking random point for "@%client);
	%group = nameToID("MissionGroup/Teams/team" @ %client.team @ "/DropPoints");
	%num = %group.getCount();
	%random = getRandom(1,%num);
	%dp = %group.getObject( %random );

	return %dp;
}

function spawnSinglePlayer()
{
	$player.lives--;
	
	%spawn = DefaultGame::pickTeamSpawn(game, $playerTeam);
	game.createPlayer($player, %spawn);
	$player.setControlObject($player.player);
	//messageClient($player, 0, "Respawns Remaining: "@$player.lives);
	game.equip($player.player, 0);
}

function Generator::onDisabled(%data, %obj, %prevState)
{
   Parent::onDisabled(%data, %obj, %prevState);
	if(%obj == nameToId(BaseGen))  //its our primary gen
	{
		doText(T4_Warning02);
		game.MissionCounter = schedule(60000,  0, MissionFailedTimer);
		setWaypointAt(%obj.position, "Repair Generator");
		clockHud.setTime(1);
		updateTrainingObjectiveHud(obj5);
	}
	else if($pref::trainingDifficulty < 2)
	{
		if (getRandom() < 0.5 )
			doText(T4_ForceFields01);
		else doText(T4_FFGenDown01); 
	}

}

function Generator::onEnabled(%data, %obj, %prevState)
{
   Parent::onEnabled(%data, %obj, %prevState);
	//error("Gen up somewhere");
	if(%obj == nameToId(BaseGen)) {
		cancel(game.MissionCounter);
		objectiveHud.trainingTimer.setVisible(false);
		updateTrainingObjectiveHud(obj10);
		$player.currentWaypoint.delete();
		cancel($player.player.trainingTimerHide);
		doText(T4_GenUp);
		checkForWin();
		//error("its the main gen");

		//restore the clock
		%time = getSimTime() - game.missionTime;
		%dif = %time /60000;
		clockHud.setTime(%dif * -1);
	}
}



// mortar mount 
function playerMountWeapon(%tag, %text, %image, %player, %slot)
{		   
	if( game.firstTime++ < 2)
		return;  // initial weapon mount doesnt count
	if(%image.getName() $= "MortarImage" && !game.msgMortar) {
		game.msgMortar = true;
		doText(T4_TipMortar);
	}  
}

// station use
function StationInvEnter(%a1, %a2, %data, %obj, %colObj)
{
	if(%colObj != $player.player)
		return;
	//clearQueue();
	//if(!game.blowoff)
		//blowoff();
	if(game.msgEnterInv++ == 1){
		doText(T4_tipDefense05);
	}
}

function stationTrigger::onEnterTrigger(%data, %obj, %colObj)  
{
	Parent::onEnterTrigger(%data, %obj, %colObj);
	messageClient(%colObj.client, 'msgEnterInvStation', "", %data, %obj, %colObj);
}


function serverCmdBuildClientTask(%client, %task, %team)
{
     parent::serverCmdBuildClientTask(%client, %task, %team);
     error("serverCmdBuildClientTask(" @%client@", "@%task@", "@%team@")");
	
	if($pref::trainingDifficulty > 2)
		return;
	
	//hack: we have to get %objective from the parent function
	// this seems to work	
	%objective = %client.currentAIObjective;
	error(%client.currentAIObjective SPC %objective.getName());

	if ((%objective.getName() $= "AIORepairObject") && 
        (%objective.targetObjectId.getDataBlock().getName() $= "SensorLargePulse")) {
        
        //error("repair order issued and forced");
        // force the ai
        %objective.weightLevel1 = 10000;

     	if(!game.issueRepairOrder && game.expectingRepairOrder) { 
			game.issueRepairOrder = true;
			doText(Any_good, 2000);
			cameraSpiel();
		}
	}
}

function CommanderMapGui::onWake(%this)
{
	
	parent::onWake(%this);
	if(game.firstSpawn)
		return;	
	//error("Waking the command map.");
	messageClient($player, 'commandMapWake', "");
}

function CommanderTree::onCategoryOpen(%this, %category, %open)
{
	//error("commander tree button pressed");
	parent::onCategoryOpen(%this, %category, %open);
 	
 	if(%category $= "Support" && game.ExpectiongSupportButton) {
 		game.ExpectiongSupportButton = false;
		doText(ANY_check01);
		doText(T4_03i, 1000);
		doText(T4_03j);
 	}
 	if(%category $= "Tactical" && game.ExpectiongTacticalButton) {
 		game.ExpectiongTacticalButton = false;
		doText(ANY_check02);
		messageClient($player, 0, "Click on the control box after the turrets name to control the turret.");
	 	game.CheckingTurretControl = true;
	 }
}

// control turret/camera
//------------------------------------------------------------------------------
function serverCmdControlObject(%client, %targetId)
{
   parent::serverCmdControlObject(%client, %targetId);
	
	if(game.firstSpawn)
		return;	

	error("Training 4 serverCmdControlObject");
  	 %obj = getTargetObject(%targetId);
	echo("what do we get back from the parent funtion ?   "@%obj);
	%objType = %obj.getDataBlock().getName();
	echo("it is a "@%objType);   

   if(game.CheckingTurretControl) {
      if(%objType $= "TurretBaseLarge") {
			game.CheckingTurretControl = false;
			schedule(3000, game, turretSpielEnd);
			//error("Debug: You are controlling a turret f00!");
		}
	}
//    if(game.CheckingCameraControl) {
//       if(%objType $= "TurretDeployedCamera") {
// 			game.CheckingCameraControl = false;
// 			schedule(3000, $player.player, cameraSpielEnd);
// 			//error("Debug: You are controlling a camera, w00t!");
// 		}
// 	}
}

function singlePlayerGame::sensorOnRepaired(%obj, %objName)
{
	//error("singlePlayerGame::sensorOnRepaired called");
	Parent::sensorOnRepaired(%obj, %objName);
	if(game.expectingTowerRepair && !game.playedOpening && !game.firstSpawn)
		openingSpiel();
}

function cameraSpiel()
{
	if(game.firstSpawn)
		return;	
	
	doText(T4_tipCamera01);
	updateTrainingObjectiveHud(obj3);
	$player.player.setInventory(CameraGrenade , 8);  // cheating just in case the player is a dufas
	game.CheckingCameraControl = true;

}

function CameraGrenadeThrown::onThrow(%this, %camGren)
{
	Parent::onThrow(%this, %camGren);
	if(game.CheckingCameraControl && !game.firstSpawn) {
		messageClient($player, 0, "Go back to the command map to access camera view.");
		game.CheckingCameraControl = false;
		game.wakeExpectingCamera = true;
		updateTrainingObjectiveHud(obj2);
		doText(T4_tipCamera02);
	}
}

//like mission 1 and 2 there is a spiel at the begining
function repairSensorTower()
{
	if(game.firstSpawn)
		return;
			
	setWaypointAt(nameToId(Team1SensorLargePulse2).position, "Repair Sensor");
	game.expectingTowerRepair = true;
	doText(T4_01);
	doText(T4_01b);
}

function openingSpiel()
{
	if(game.firstSpawn)
		return;

	$player.currentWaypoint.delete();
	updateTrainingObjectiveHud(obj7);
	
	game.playedOpening = true;
	//doText(T4_01c);
	doText(T4_02a);
	doText(T4_03);
	doText(T4_02);
	//doText(T4_02b);
	doText(T4_03a);
}

function ThreeAEval()
{
	if(game.firstSpawn)
		return;
	
	game.wakeExpectingSquadOrder = true;	
	updateTrainingObjectiveHud(obj2);
}

function missionSpawnedAI()
{
	if(!game.firstSpawn) {
		game.firstspawn = true;
		doText(ANY_warning05);
		doText(ANY_warning03);  // does a playgui check
		
		//updateTrainingObjectiveHud(obj5);
	}
}

function singlePlayerPlayGuiCheck()
{
   if(CommanderMapGui.open)
      CommanderMapGui.close();
		
	updateTrainingObjectiveHud(obj10);
}


function missionWaveDestroyed(%wave)
{
	if(%wave == 1) {
		doText(T4_06);
		doText(T4_tipDefense02);
	}
	else if(%wave == 2)
		doText(T4_08);

	else if( %wave == $numberOfWaves[$pref::TrainingDifficulty] ) {
		//MessageAll(0, "The last wave is destroyed.  This mission would end.");
		game.allEnemiesKilled = true;
		checkForWin();
	}
}

function checkForWin()
{
	if(game.allEnemiesKilled && nameToId(BaseGen).isEnabled()) {
			clearQueue();
			doText(T4_10);
			doText(T4_11);
			schedule(4000, game, missionComplete, $player.miscMsg[training4win]);
	}
}


function cameraSpielEnd()
{
	if(game.firstSpawn)
		return;
			
	doText(T4_tipCamera03);
	doText(T4_tipCamera04, 2000);
	doText(T4_controlTurret);
	game.CheckingTurretControl = true;
	game.wakeExpectingTurret = true;
	updateTrainingObjectiveHud(obj4);
}

function turretSpielEnd()
{
	if(game.firstSpawn)
		return;
			
	doText(T4_tipObjects);
	doText(T4_CCend, 4000);
	
	doText(T4_TipGenerator01, 2000);
	doText(T4_TipGenerator01a);
	doText(T4_TipGenerator01b);
	doText(T4_TipGenerator02, 2000);
	
	
	doText(T4_tipDefense01);
// 	doText(T4_tipDefense06);
// 	doText(T4_tipDefense07);
// 	doText(T4_tipDefense08);
// 	doText(T4_tipDefense09);
	updateTrainingObjectiveHud(obj9);
	//game.blowOff = true;   //feel free to use the inventory stations
}


// turret deployment advice and messages
function singlePlayerFailDeploy(%tag, %message)
{
	%text = detag(%message);
	%phrase = getWord(%text, 0) SPC getWord(%text, 1);
	//echo(%phrase);

	switch$(%phrase) {
		case "\c2Item must":
			if(!game.tipDep1) {
				game.tipDep1 = true;
				doText(T4_tipDeploy01);
			}
		case "\c2You cannot":
			if(!game.tipDep2) {
				game.tipDep2 = true;
				doText(T4_tipDeploy02);
			}
		case "\c2Interference from":
			if(!game.tipDepT) {
				game.tipDepT = true;
				doText(T4_tipDepTurret);
			}
	}
}


// not really a callback but this prolly goes here
function cloakingUnitAdded()
{
	if(game.addedCloak++ < 2) {
		doText(T4_TipDefense03);
	}
}

function RepairingObj(%tag, %text, %name, %obj)
{
	if(%obj.getDataBlock().getName() $= "SensorLargePulse" && !game.repairingSensor) {
		game.repairingSensor = true;
		schedule(2000, $player.player, doText, T4_01c);		
	}
}

// equipment =======================================================================
//===================================================================================

//there are a plethora of configs in this mission

function SinglePlayerGame::equip(%game, %player, %set)
{
	if(!isObject(%player))
		return;

	//ya start with nothing...NOTHING!
	%player.clearInventory();

	for(%i =0; %i<$InventoryHudCount; %i++)
	  %player.client.setInventoryHudItem($InventoryHudData[%i, itemDataName], 0, 1);
   %player.client.clearBackpackIcon();

	//error("equping Player "@%player@" with set"@%set);
	switch (%set)
	{
		case 0:
			//echo("player Heavy");

			%player.setArmor("Heavy");
		   
			%player.setInventory(RepairPack, 1);
		   
			%player.setInventory(RepairKit,1);
			%player.setInventory(CameraGrenade,8);
			%player.setInventory(Mine,3);

			%player.setInventory(Chaingun, 1);
			%player.setInventory(ChaingunAmmo, 200);
			%player.setInventory(Disc,1);
			%player.setInventory(DiscAmmo, 15);
			%player.setInventory(Mortar, 1);
			%player.setInventory(MortarAmmo, 10);
			%player.setInventory(Blaster,1);
			%player.setInventory(GrenadeLauncher,1);
			%player.setInventory(GrenadeLauncherAmmo,15);
			%player.setInventory(TargetingLaser, 1);

			%player.use("Disc");
			%player.weaponCount = 5;

		case 1:
			//echo("Light Skirmisher");

			%player.setArmor("Light");

			%player.setInventory(EnergyPack, 1);

			%player.setInventory(RepairKit,1);
			%player.setInventory(ConcussionGrenade,5);

			%player.setInventory(Blaster,1);
			%player.setInventory(Disc,1);
			%player.setInventory(DiscAmmo, 15);
			%player.setInventory(Chaingun, 1);
			%player.setInventory(ChaingunAmmo, 100);
			%player.setInventory(TargetingLaser, 1);

			%player.use("Chaingun");
			%player.weaponCount = 3;

		case 2:
			//script hook in our equip stuff also
			cloakingUnitAdded();
			
			//echo("Light Assassin Config");

			%player.setArmor("Light");
		   
			%player.setInventory(CloakingPack, 1);
		   
			%player.setInventory(RepairKit,1);
			%player.setInventory(FlashGrenade,5);
			%player.setInventory(Mine,3);

			%player.setInventory(Plasma, 1);
			%player.setInventory(PlasmaAmmo, 20);
			%player.setInventory(Disc,1);
			%player.setInventory(DiscAmmo, 15);
			%player.setInventory(ShockLance,1);
			%player.setInventory(TargetingLaser, 1);

			%player.use("Disc");
			%player.weaponCount = 3;

		case 3:
			//echo("Light Sniper");

			%player.setArmor("Light");

			%player.setInventory(EnergyPack, 1);

			%player.setInventory(RepairKit,1);
			%player.setInventory(ConcussionGrenade,5);

			%player.setInventory(Chaingun,1);
			%player.setInventory(ChaingunAmmo,100);
			%player.setInventory(Disc,1);
			%player.setInventory(DiscAmmo, 15);
			%player.setInventory(SniperRifle, 1);
			%player.setInventory(TargetingLaser, 1);

			%player.use("SniperRifle");
			%player.weaponCount = 3;

		case 4:
			echo("Medium Base Rape");

			%player.setArmor("Medium");
		   
			%player.setInventory(ShieldPack, 1);
		   
			%player.setInventory(RepairKit,1);
			%player.setInventory(Grenade,6);
			%player.setInventory(Mine,3);

			%player.setInventory(Plasma, 1);
			%player.setInventory(PlasmaAmmo, 40);
			%player.setInventory(Disc,1);
			%player.setInventory(DiscAmmo, 15);
			%player.setInventory(ElfGun, 1);
			%player.setInventory(GrenadeLauncher,1);
			%player.setInventory(GrenadeLauncherAmmo, 10);
			%player.setInventory(TargetingLaser, 1);

			%player.use("GrenadeLauncher");
			%player.weaponCount = 4;

		case 5:
			//echo("Medium Killing Machine");

			%player.setArmor("Medium");
		   
			%player.setInventory(AmmoPack, 1);
		   
			%player.setInventory(RepairKit,1);
			%player.setInventory(Grenade,6);
			%player.setInventory(Mine,3);

			%player.setInventory(Plasma, 1);
			%player.setInventory(PlasmaAmmo, 40);
			%player.setInventory(Disc,1);
			%player.setInventory(DiscAmmo, 15);
			%player.setInventory(GrenadeLauncher, 1);
			%player.setInventory(GrenadeLauncherAmmo, 10);
			%player.setInventory(MissileLauncher,1);
			%player.setInventory(MissileLauncherAmmo, 10);
			%player.setInventory(TargetingLaser, 1);

			%player.use("Plasma");
			%player.weaponCount = 4;

		case 6:
			//echo("Medium Wuss");

			%player.setArmor("Medium");
		   
			%player.setInventory(EnergyPack, 1);
		   
			%player.setInventory(RepairKit,1);
			%player.setInventory(ConcussionGrenade,6);

			%player.setInventory(Blaster, 1);
			%player.setInventory(Disc,1);
			%player.setInventory(DiscAmmo, 15);
			%player.setInventory(Elf, 1);
			%player.setInventory(Chaingun,1);
			%player.setInventory(ChaingunAmmo, 150);
			%player.setInventory(TargetingLaser, 1);

			%player.use("Disc");
			%player.weaponCount = 4;

		case 7:
			//echo("Heavy Long Range");

			%player.setArmor("Heavy");
		   
			%player.setInventory(EnergyPack, 1);
		   
			%player.setInventory(RepairKit,1);
			%player.setInventory(Grenade,8);
			%player.setInventory(Mine,3);

			%player.setInventory(Plasma, 1);
			%player.setInventory(PlasmaAmmo, 50);
			%player.setInventory(Disc,1);
			%player.setInventory(DiscAmmo, 15);
			%player.setInventory(Mortar, 1);
			%player.setInventory(MortarAmmo, 10);
			%player.setInventory(MissileLauncher,1);
			%player.setInventory(MissileLauncherAmmo, 15);
			%player.setInventory(GrenadeLauncher,1);
			%player.setInventory(GrenadeLauncherAmmo,15);
			%player.setInventory(TargetingLaser, 1);

			%player.use("Mortar");
			%player.weaponCount = 5;

		case 8:
			//echo("Default Config");

			%player.setArmor("Light");

			%player.setInventory(RepairKit,1);

			%player.setInventory(Blaster,1);
			%player.setInventory(Disc,1);
			%player.setInventory(DiscAmmo, 15);
			%player.setInventory(Chaingun, 1);
			%player.setInventory(ChaingunAmmo, 100);
			%player.setInventory(TargetingLaser, 1);

			%player.use("Blaster");
			%player.weaponCount = 3;

		case 9:
			//echo("Heavy Rate of Fire");

			%player.setArmor("Heavy");
		   
			%player.setInventory(AmmoPack, 1);
		   
			%player.setInventory(RepairKit,1);
			%player.setInventory(Grenade,8);
			%player.setInventory(Mine,3);

			%player.setInventory(Chaingun, 1);
			%player.setInventory(ChaingunAmmo, 200);
			%player.setInventory(Disc,1);
			%player.setInventory(DiscAmmo, 15);
			%player.setInventory(Mortar, 1);
			%player.setInventory(MortarAmmo, 10);
			%player.setInventory(Plasma,1);
			%player.setInventory(PlasmaAmmo, 50);
			%player.setInventory(GrenadeLauncher,1);
			%player.setInventory(GrenadeLauncherAmmo,15);
			%player.setInventory(TargetingLaser, 1);

			%player.use("Mortar");
			%player.weaponCount = 5;
		
		case 10:
			//echo("Heavy Inside Attacker");

			%player.setArmor("Heavy");
		   
			%player.setInventory(ShieldPack, 1);
		   
			%player.setInventory(RepairKit,1);
			%player.setInventory(ConcussionGrenade,8);
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

// silly littly functions 
function flashButton(%buttonName)
{
	%time = 800;
	%num = 6;
	for(%i=0; %i<%num; %i++) {
		schedule( %time*%i, $player.player, "eval", %buttonName@".setVisible(false);");
		
		schedule(%time*%i + %time/2, $player.player, "eval", %buttonName@".setVisible(true);");
		schedule(%time*%i, $player.player, serverPlay2d, HudFlashSound);
	}
}

function showCommandPulldown(%button)
{
	//this is what I hacked in to make pretty with the showing off of the command tree
	commanderTree.openCategory(%button, true);
	mentionPulldown(%button);
	commanderTree.schedule(3000, openCategory, %button, false);
}

function affectAllCommandPulldown(%open)
{
	commanderTree.openCategory(Clients, %open);
	commanderTree.openCategory(Tactical, %open);
	commanderTree.openCategory(Support, %open);
	commanderTree.openCategory(Waypoints, %open);
	commanderTree.openCategory(Objectives, %open);
}

function mentionPulldown(%button)
{
	switch$(%button)
	{
		case "Clients":
			doText(T4_03b);
			 
		case "Tactical":
			doText(T4_03c);
			 
		case "Support":
			doText(T4_03d);
			 
		case "Waypoints":
			doText(T4_03e);
			 
		case "Objectives":
			doText(T4_03f);
			doText(T4_03g);
			doText(t4_03h);
	}
}

function training4CommandMapWake()
{
	error("training4CommandMapWake Called");
	if(game.wakeExpectingSquadOrder && !game.firstSpawn) {
		game.wakeExpectingSquadOrder = false;

		// commander map waypoint
		%pos = nameToId(Base).position;
		%obj = createClientTarget(-1, %pos);
		%obj.createWaypoint("Nagakhun Base");

 		// cmap objective
 		commanderTree.registerEntryType("Objectives", getTag('Base'), false, "commander/MiniIcons/com_flag_grey", "255 255 255");
 		createTarget(%id, 'Defend', "", "", 'Base', $player.getSensorGroup());
 
		affectAllCommandPulldown(false);

 		//here we go...drop down the thingies
 		schedule( 2500, $player.player, showCommandPulldown, Clients);
 		schedule( 6000, $player.player, showCommandPulldown, Tactical);
 		schedule(10000, $player.player, showCommandPulldown, Support);
 		schedule(14000, $player.player, showCommandPulldown, Waypoints);
 		schedule(18000, $player.player, showCommandPulldown, Objectives);

		//schedule(24000, $player.player, affectAllCommandPulldown, true);
	}
	else if(game.wakeExpectingTurret && !game.firstSpawn) {
		messageClient($player, 0, "Click on \"Tactical Assets\" to view turrets.");
		//flashButton(CMDTacticalButton);
 		game.ExpectiongTacticalButton = true;
		game.wakeExpectingTurret = false;
	}
	else if(game.wakeExpectingCamera && !game.firstSpawn) {
		messageClient($player, 0, "Click on the control box to the  right of the camera\'s name to control the camera.");
		cameraSpielEnd();
		game.wakeExpectingCamera = false;
	}
}

// Objectives ==================================================================
//================================================================================
function missionFailedTimer()
{
	missionFailed($player.miscMsg[training4GenLoss]);
}


function blowoff()
{
	game.blowoff = true;
	clearQueue();
	doText(Any_Blowoff02, 2000, 1);
	
	// okay, the player wants to play huh?
	// if we are still waiting for the enemies to spawn at this point
	// cancel that and spawn them now...well, soon
	if($player.beginSpawn){
		cancel($player.beginSpawn);	
		%time = getRandom(1, 20);
		//error("Blowing off the training: spawning enemies in "@ %time * 1000 @" seconds.");
		schedule(%time*1000, game, beginTraining4Enemies);
	}

}

function findObjbyDescription(%desc, %team)
{
	%q = $objectiveQ[%team];
	for(%i = 0; %i < %q.getCount(); %i++)
	{
		%objective = %q.getObject(%i);
		if(%objective.description $= %desc)
			return %objective;
	}
}

function removeDescribedObj( %obj )
{
	%invDepObj.weightLevel1 = 0;
	%invDepObj.weightLevel2 = 0;
	%invDepObj.weightLevel3 = 0;
	%invDepObj.weightLevel4 = 0;
	$ObjectiveQ[1].remove(%invDepObj);
	// clear it in case anyone has picked it up
	AIClearObjective(%invDepObj);
}

//===============================================END the training 4 package stuff====
};

// Dialog stuff ===================================================================
//=================================================================================



// Callbacks //==================================================================
//================================================================================

//add callbacks
addMessageCallback('MsgDeployFailed', singlePlayerFailDeploy);
addMessageCallback('MsgWeaponMount', playerMountWeapon);
addMessageCallback('msgEnterInvStation', StationInvEnter);
addMessageCallback('MsgRepairPackRepairingObj', RepairingObj);
addMessageCallback('commandMapWake', training4CommandMapWake);

