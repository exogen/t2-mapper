//------------------------------
//AI Debugging functions

function aics()
{
	aidebug(-1);
   exec("scripts/ai.cs");
}

function ga(%pack)
{
	$testcheats = 1;
	giveall();
	switch$ (%pack)
	{
		case "repair":
			LocalClientConnection.player.setInventory(RepairPack, 1);
		case "charge":
			LocalClientConnection.player.setInventory(SatchelCharge, 1);
		case "energy":
			LocalClientConnection.player.setInventory(EnergyPack, 1);
		case "cloak":
			LocalClientConnection.player.setInventory(CloakingPack, 1);
		case "shield":
			LocalClientConnection.player.setInventory(ShieldPack, 1);
		case "jammer":
			LocalClientConnection.player.setInventory(SensorJammerPack, 1);
	}
}

function aiga(%client)
{
   $TestCheats = 1;
   %player = %client.player;
   %player.setInventory(RepairKit,999);
   %player.setInventory(Mine,999);
   %player.setInventory(MineAir,999);
   %player.setInventory(MineLand,999);
   %player.setInventory(MineSticky,999);
   %player.setInventory(Grenade,999);
   %player.setInventory(FlashGrenade,999);
   %player.setInventory(FlareGrenade,999);
   %player.setInventory(ConcussionGrenade,999);
   %player.setInventory(CameraGrenade, 999);
   %player.setInventory(Blaster,1);
   %player.setInventory(Plasma,1);
   %player.setInventory(Disc,1);
   %player.setInventory(Chaingun, 1);
   %player.setInventory(GrenadeLauncher, 1);
   %player.setInventory(MissileLauncher, 1);
   %player.setInventory(Mortar, 1);
   %player.setInventory(MissileLauncherAmmo, 999);
   %player.setInventory(GrenadeLauncherAmmo, 999);
   %player.setInventory(MortarAmmo, 999);
   %player.setInventory(PlasmaAmmo,999);  
   %player.setInventory(ChaingunAmmo, 999);
   %player.setInventory(DiscAmmo, 999);
   %player.setInventory(TargetingLaser, 1);
   %player.setInventory(ELFGun, 1);
   %player.setInventory(SniperRifle, 1);
   %player.setInventory(ShockLance, 1);
}

function aiCome(%from, %to)
{
	if (%to $= "")
		%to = 2;
	%from.player.setTransform(%to.player.getTransform());
}

function findBotWithInv(%item)
{
   for (%i = 0; %i < ClientGroup.getCount(); %i++)
   {
      %cl = ClientGroup.getObject(%i);
      if (isObject(%cl.player) && %cl.player.getInventory(%item))
         echo(%cl @ ":" SPC getTaggedString(%cl.name) SPC "has item" SPC %item);
   }
}

function listInv(%client)
{
   %player = %client.player;
   %count = %player.getInventory(RepairKit);
	if (%count > 0)
		echo("RepairKit: " @ %count);
   %count = %player.getInventory(Mine);
	if (%count > 0)
		echo("Mine: " @ %count);
   %count = %player.getInventory(MineAir);
	if (%count > 0)
		echo("MineAir: " @ %count);
   %count = %player.getInventory(MineLand);
	if (%count > 0)
		echo("MineLand: " @ %count);
   %count = %player.getInventory(MineSticky);
	if (%count > 0)
		echo("MineSticky: " @ %count);
   %count = %player.getInventory(Grenade);
	if (%count > 0)
		echo("Grenade: " @ %count);
   %count = %player.getInventory(FlashGrenade);
	if (%count > 0)
		echo("FlashGrenade: " @ %count);
   %count = %player.getInventory(FlareGrenade);
	if (%count > 0)
		echo("FlareGrenade: " @ %count);
   %count = %player.getInventory(ConcussionGrenade);
	if (%count > 0)
		echo("ConcussionGrenade: " @ %count);
	%count = %player.getInventory(CameraGrenade);
	if (%count > 0)
		echo("CameraGrenade: " @ %count);
   %count = %player.getInventory(Blaster);
	if (%count > 0)
		echo("Blaster: " @ %count);
   %count = %player.getInventory(Plasma);
	if (%count > 0)
		echo("Plasma: " @ %count);
   %count = %player.getInventory(Disc);
	if (%count > 0)
		echo("Disc: " @ %count);
   %count = %player.getInventory(Chaingun);
	if (%count > 0)
		echo("Chaingun: " @ %count);
   %count = %player.getInventory(GrenadeLauncher);
	if (%count > 0)
		echo("GrenadeLauncher: " @ %count);
   %count = %player.getInventory(MissileLauncher);
	if (%count > 0)
		echo("MissileLauncher: " @ %count);
   %count = %player.getInventory(Mortar);
	if (%count > 0)
		echo("Mortar: " @ %count);
   %count = %player.getInventory(MissileLauncherAmmo);
	if (%count > 0)
		echo("MissileLauncherAmmo: " @ %count);
   %count = %player.getInventory(GrenadeLauncherAmmo);
	if (%count > 0)
		echo("GrenadeLauncherAmmo: " @ %count);
   %count = %player.getInventory(MortarAmmo);
	if (%count > 0)
		echo("MortarAmmo: " @ %count);
   %count = %player.getInventory(PlasmaAmmo);
	if (%count > 0)
		echo("PlasmaAmmo: " @ %count);
   %count = %player.getInventory(ChaingunAmmo);
	if (%count > 0)
		echo("ChaingunAmmo: " @ %count);
   %count = %player.getInventory(DiscAmmo);
	if (%count > 0)
		echo("DiscAmmo: " @ %count);
   %count = %player.getInventory(TargetingLaser);
	if (%count > 0)
		echo("TargetingLaser: " @ %count);
   %count = %player.getInventory(ELFGun);
	if (%count > 0)
		echo("ELFGun: " @ %count);
   %count = %player.getInventory(SniperRifle);
	if (%count > 0)
		echo("SniperRifle: " @ %count);
   %count = %player.getInventory(ShockLance);
	if (%count > 0)
		echo("ShockLance: " @ %count);
   %count = %player.getInventory(RepairPack);
	if (%count > 0)
		echo("RepairPack: " @ %count);
   %count = %player.getInventory(EnergyPack);
	if (%count > 0)
		echo("EnergyPack: " @ %count);
   %count = %player.getInventory(ShieldPack);
	if (%count > 0)
		echo("ShieldPack: " @ %count);
   %count = %player.getInventory(CloakingPack);
	if (%count > 0)
		echo("CloakingPack: " @ %count);
   %count = %player.getInventory(SensorJammerPack);
	if (%count > 0)
		echo("SensorJammerPack: " @ %count);
}

function createAIDebugDlg()
{
	if (!isObject("AIDebugViewProfile"))
	{
		new GuiControlProfile("AIDebugViewProfile")
		{
		   fontType = "Arial Bold";
		   fontSize = 12;
		   fontColor = "255 0 255";
		   autoSizeWidth = false;
		   autoSizeHeight = false;
			modal = "false";
		};

		new GuiControl(aiDebugDlg)
		{
			profile = "GuiDefaultProfile";
			horizSizing = "width";
			vertSizing = "height";
			position = "0 0";
			extent = "640 480";
			minExtent = "8 8";
			visible = "True";
			setFirstResponder = "True";
			helpTag = "0";
         bypassHideCursor = "1";
		   
			new DebugView(aiDebug)
		   {
				profile = "AIDebugViewProfile";
				horizSizing = "width";
				vertSizing = "height";
				position = "8 8";
				extent = "624 464";
				minExtent = "8 8";
				visible = "True";
				setFirstResponder = "False";
				helpTag = "0";
			};
		};
	}
}

function ToggleAIDebug(%make)
{
   if (%make)
   {
      if ($AIDebugActive)
      {
         Canvas.popDialog(aiDebugDlg);
         $AIDebugActive = false;
      }
      else
      {
			createAIDebugDlg();
	      Canvas.pushDialog(aiDebugDlg, 70);
         $AIDebugActive = true;

         //make sure we're debuging the correct client
         if (LocalClientConnection.getControlObject() == LocalClientConnection.camera)
         {
            if (isObject(LocalClientConnection.observeClient))
               aidebug(LocalClientConnection.observeClient);
         }
      }
   }
}

GlobalActionMap.bind(keyboard, "ctrl tilde", "ToggleAIDebug");

//function showFPS()
//{
//	if (isObject(aiDebug))
//	   aiDebug.setText(0, "FPS:" SPC $fps::real SPC "                                              $patch1Avg" SPC $Patch1Avg);
//   schedule(1000, 0, "ShowFPS");
//}

function aiDebug(%client)
{
   if ($AIDebugTeam < 0 && $AIDebugClient < 0)
	{
		createAIDebugDlg();
      Canvas.pushDialog(aiDebugDlg, 70);
	}
      
   $AIDebugClient = %client;
   $AIDebugTeam = -1;
   
   if (%client > 0)
   {
		createAIDebugDlg();
      Canvas.pushDialog(aiDebugDlg, 70);
      aiDebug.clearText();
		$AIDebugActive = true;
   }
   else
	{
		$AIDebugActive = false;
      Canvas.popDialog(aiDebugDlg);
	}
}

function aiDebugText(%client, %line, %text)
{
   if (%client != $AIDebugClient)
      return;
      
   aiDebug.setText(%line, %text);
}

function aiDebugLine(%client, %startPt, %endPt, %color)
{
   if (%client != $AIDebugClient)
      return;
      
   aiDebug.addLine(%startPt, %endPt, %color);
}

function aiDebugClearLines(%client)
{
   if (%client != $AIDebugClient)
      return;
      
   aiDebug.clearLines();
}

function aiGetTaskDesc(%client)
{
	if (!%client.isAIControlled())
		%returnStr = getTaggedString(%client.name) @ ": " @ "HUMAN";

   else if (%client.objective > 0)
   {
      if (%client.objective.description !$= "")
         %returnStr = %client @ " " @ getTaggedString(%client.name) @ ": " @ %client.objective.description;
      else
         %returnStr = %client @ " " @ getTaggedString(%client.name) @ ": " @ %client.objective @ " NO DESC";
   }
   else
	{
		%curTask = %client.getTaskName();
		%curStep = %client.getStepName();
		if (%curTask !$= "")
	      %returnStr = %client @ " " @ getTaggedString(%client.name) @ ": " @ %curTask;
		else if (%curStep !$= "")
	      %returnStr = %client @ " " @ getTaggedString(%client.name) @ ": " @ %curStep;
		else
	      %returnStr = getTaggedString(%client.name) @ ": " @ "UNKNOWN";
	}

	//add in some color info
	if (Game.numTeams != 2)
		%color = "E";
	else if (%client.team == LocalClientConnection.team)
		%color = "F";
	else
		%color = "E";
      
   return %color @ ":" @ %returnStr;
}

$AIDebugTeam = -1;
$AIDebugClient = -1;
$AIDebugTasks = true;
Canvas.popDialog(aiDebugDlg);
$AIDebugActive = false;

function aiEchoObjective(%objective, %lineNum, %group)
{
	%clientAssigned = false;
	%indent = "    ";
	if (%group > 0)
	{
		%indent = "        ";
	   if (%group.clientLevel[1] > 0 && %group.clientLevel[1].objective == %objective)
		{
	      %assigned1 = getTaggedString(%group.clientLevel[1].name) @ ":" @ %group.clientLevel[1].objectiveWeight;
			%clientAssigned = true;
		}
	   else
	      %assigned1 = "           ";
	   if (%group.clientLevel[2] > 0 && %group.clientLevel[2].objective == %objective)
		{
	      %assigned2 = getTaggedString(%group.clientLevel[2].name);
			%clientAssigned = true;
		}
	   else
	      %assigned2 = "           ";
	}
	else
	{
	   if (%objective.clientLevel[1] > 0)
		{
	      %assigned1 = getTaggedString(%objective.clientLevel[1].name) @ ":" @ %objective.clientLevel[1].objectiveWeight;
			%clientAssigned = true;
		}
	   else
	      %assigned1 = "           ";
	   if (%objective.clientLevel[2] > 0)
		{
	      %assigned2 = getTaggedString(%objective.clientLevel[2].name);
			%clientAssigned = true;
		}
	   else
	      %assigned2 = "           ";
	}
      
   %text = %indent @ %objective @ "  " @ %objective.weightLevel1 @ "  " @ %assigned1 @ "  " @ %assigned2 @ "  " @ %objective.description;
	if (%clientAssigned)
		%color = "0 0 1";
	else
		%color = "1 0 1";
   aiDebug.setText(%lineNum, %text, %color);
}

function aiDebugQ(%team, %showTasks)
{
   if ($AIDebugTeam < 0 && $AIDebugClient < 0)
	{
		createAIDebugDlg();
      Canvas.pushDialog(aiDebugDlg, 70);
		$AIDebugActive = true;
	}
   
   $AIDebugTeam = %team;
   $AIDebugClient = -1;
   
   if ($AIDebugTeam < 0)
   {
      Canvas.popDialog(aiDebugDlg);
		$AIDebugActive = false;
      return;
   }

	if (%showTasks $= "")
		%showTasks = $AIDebugTasks;
	else
		$AIDebugTasks = %showTasks;
      
   aiDebug.clearText();

	if (! %showTasks)
		return;

	//make sure we have a valid objectiveQ
	if (!isObject($ObjectiveQ[%team]))
		return;

	%timeStamp = getSimTime();
	%lineNum = 1;
   %count = $ObjectiveQ[%team].getCount();

	//clear the time stamps from all groups
   for (%i = 0; %i < %count; %i++)
   {
      %objective = $ObjectiveQ[%team].getObject(%i);
		if (%objective.group > 0)
			%objective.group.debugStamp = 0;
	}

	//now loop through and echo out all the objectives...
   for (%i = 0; %i < %count; %i++)
   {
      %objective = $ObjectiveQ[%team].getObject(%i);

		//if the objective is part of a group, echo out the entire group first
		if (%objective.group > 0)
		{
			%group = %objective.group;
			if (%group.debugStamp != %timeStamp)
			{
				%group.debugStamp = %timeStamp;
				%grpCount = %group.getCount();

				//first print out the group label
		      %text = %group @ " GROUP: " @ %group.getName();
		      aiDebug.setText(%lineNum, %text);
				%lineNum++;

				//now loop through and print out the grouped objectives in the order they appear in the main list
				for (%j = 0; %j < %count; %j++)
				{
					//print them in the order they appear in the main list
					%obj = $ObjectiveQ[%team].getObject(%j);
					if  (%obj.group == %group)
					{
						aiEchoObjective(%obj, %lineNum, %group);
						%lineNum++;
					}
				}
			}
		}

		else
		{
			aiEchoObjective(%objective, %lineNum, 0);
			%lineNum++;
		}
   }
}

//------------------------------

function aioTest()
{
	//clear out the objective Q's
	$ObjectiveQ[0].clear();
	$ObjectiveQ[1].clear();
	$ObjectiveQ[2].clear();

   ///////////////////////////////
   //     team 1 objectives     //
   ///////////////////////////////
//	%newObjective = new AIObjective(AIORepairObject) {
//		position = "0 0 0";
//		rotation = "1 0 0 0";
//		scale = "1 1 1";
//		description = "Repair the generator";
//		targetObject = "Team0GeneratorLarge1";
//		targetClientId = "-1";
//		targetObjectId = nameToId("Team0GeneratorLarge1");
//		location = "0 0 0";
//		weightLevel1 = "3200";
//		weightLevel2 = "1600";
//		weightLevel3 = "0";
//		weightLevel4 = "0";
//		offense = "0";
//		defense = "1";
//		equipment = "RepairPack";
//		buyEquipmentSet = "HeavyRepairSet";
//		issuedByHuman = "0";
//		issuingClientId = "-1";
//		forceClientId = "-1";
//		locked = "0";
//	};
//   $ObjectiveQ[0].add(%newObjective);
//
//	%newObjective = new AIObjective(AIODefendLocation) {
//		position = "-178 -156 120";
//		rotation = "1 0 0 0";
//		scale = "1 1 1";
//		description = "Defend our generator";
//		targetObject = "Team0GeneratorLarge1";
//		targetClientId = "-1";
//		targetObjectId = "-1";
//		location = "-178 -156 120";
//		weightLevel1 = "3900";
//		weightLevel2 = "2000";
//		weightLevel3 = "0";
//		weightLevel4 = "0";
//		offense = "0";
//		defense = "1";
//		desiredEquipment = "ShieldPack Plasma PlasmaAmmo";
//		buyEquipmentSet = "MediumShieldSet LightShieldSet HeavyShieldSet";
//		chat = "";
//		issuedByHuman = "0";
//		issuingClientId = "-1";
//		forceClientId = "-1";
//		locked = "1";
//			radius = "0";
//			team = "0";
//	};
//   $ObjectiveQ[0].add(%newObjective);

//	%newObjective = new AIObjective(AIODefendLocation) {
//		position = "0 0 0";
//		rotation = "1 0 0 0";
//		scale = "1 1 1";
//		description = "Defend the generator";
//		targetObject = "Team0GeneratorLarge1";
//		targetClientId = "-1";
//		targetObjectId = nameToId("Team0GeneratorLarge1");
//		location = "0 0 0";
//		weightLevel1 = "3100";
//		weightLevel2 = "1500";
//		weightLevel3 = "0";
//		weightLevel4 = "0";
//		offense = "0";
//		defense = "1";
//		desiredEquipment = "ShieldPack Plasma PlasmaAmmo";
//		buyEquipmentSet = "HeavyShieldSet";
//		issuedByHuman = "0";
//		issuingClientId = "-1";
//		forceClientId = "-1";
//		locked = "0";
//	};
//   $ObjectiveQ[0].add(%newObjective);
//
//   %newObjective = new AIObjective(AIOAttackLocation)
//                        {
//                           weightLevel1 = 2000;
//                           description = "Sniper";
//                           location = "50 218 95";
//                           offense = true;
//                           defense = false;
//                           equipment = "SniperRifle EnergyPack";
//									buyEquipmentSet = "LightEnergySniper";
//                        };
//   $ObjectiveQ[0].add(%newObjective);
//
//   %newObjective = new AIObjective(AIOLazeObject)
//                        {
//                           weightLevel1 = 10000;
//                           description = "Laze the enemy turret";
//                           targetObject = NameToId("Team1Turret");
//									targetClient = %client;	//note, used to store the task requester
//                           offense = true;
//                           equipment = "TargetingLaser";
//									buyEquipmentSet = "LightEnergySniper";
//                        };
//   $ObjectiveQ[0].add(%newObjective);
//
//   %newObjective = new AIObjective(AIOMortarObject)
//                        {
//                           weightLevel1 = $AIWeightMortarTurret[1];
//                           weightLevel2 = $AIWeightMortarTurret[2];
//                           description = "Mortar the enemy turret";
//									targetObject = "Team1TurretBaseLarge1";
//									targetObjectId = nameToId("Team1TurretBaseLarge1");
//                           location = "";
//                           offense = true;
//                           defense = false;
//                           equipment = "Mortar MortarAmmo";
//									buyEquipmentSet = "HeavyShieldSet";
//                        };
//   $ObjectiveQ[0].add(%newObjective);
//   
//   %newObjective = new AIObjective(AIORepairObject)
//                        {
//                           weightLevel1 = $AIWeightRepairTurret[1];
//                           weightLevel2 = $AIWeightRepairTurret[2];
//                           description = "Repair the turret";
//                           targetObject = NameToId("Team0Turret");
//                           location = "";
//                           offense = false;
//                           defense = true;
//                           equipment = "RepairPack";
//                        };
//   $ObjectiveQ[0].add(%newObjective);
//   
//   %newObjective = new AIObjective(AIOAttackObject)
//                        {
//                           weightLevel1 = $AIWeightAttackGenerator[1];
//                           weightLevel2 = $AIWeightAttackGenerator[2];
//                           description = "Attack the enemy generator";
//                           targetObject = NameToId("Team1Generator");
//                           location = "";
//                           offense = true;
//                           defense = false;
//                           equipment = "plasma plasmaAmmo";
//									buyEquipmentSet = "HeavyShieldSet";
//                        };
//   $ObjectiveQ[0].add(%newObjective);
//   
//   %newObjective = new AIObjective(AIORepairObject)
//                        {
//                           //weightLevel1 = $AIWeightRepairGenerator[1];
//                           weightLevel1 = 10000;
//                           weightLevel2 = $AIWeightRepairGenerator[2];
//                           description = "Repair the generator";
//                           targetObject = NameToId("Team0Generator");
//                           location = "";
//                           offense = false;
//                           defense = true;
//                           equipment = "RepairPack";
//                        };
//   $ObjectiveQ[0].add(%newObjective);
//   
//   %newObjective = new AIObjective(AIODefendLocation)
//                        {
//                           weightLevel1 = $AIWeightDefendGenerator[1];
//                           weightLevel2 = $AIWeightDefendGenerator[2];
//                           description = "Defend our generator";
//                           //targetObject = NameToId("Team0Generator");
//                           location = "-20 -292 46";
//                           offense = false;
//                           defense = true;
//                        };
//   $ObjectiveQ[0].add(%newObjective);
// 	%newObjective = new AIObjective(AIOEscortPlayer)
// 	{
// 		weightLevel1 = $AIWeightEscortOffense[1];
// 		weightLevel2 = $AIWeightEscortOffense[2];
// 		targetClientId = 2;
// 		description = "Escort " @ getTaggedString(LocalClientConnection.name);
// 		offense = true;
// 		desiredEquipment = "EnergyPack";
// 		buyEquipmentSet = "LightEnergyELF";
// 	};
//    $ObjectiveQ[1].add(%newObjective);
   
   ///////////////////////////////
   //     team 2 objectives     //
   ///////////////////////////////
//	%newObjective = new AIObjective(AIODefendLocation) {
//		position = "196 461 181";
//		rotation = "1 0 0 0";
//		scale = "1 1 1";
//		description = "Missile defense";
//		targetObject = "";
//		targetClientId = "-1";
//		targetObjectId = "-1";
//		location = "196 461 181";
//		weightLevel1 = "3900";
//		weightLevel2 = "2000";
//		weightLevel3 = "0";
//		weightLevel4 = "0";
//		offense = "0";
//		defense = "1";
//		equipment = "MissileLauncher";
//		buyEquipmentSet = "MediumMissileSet HeavyMissileSet";
//		chat = "";
//		issuedByHuman = "0";
//		issuingClientId = "-1";
//		forceClientId = "-1";
//		locked = "1";
//			radius = "0";
//			team = "0";
//	};
//   $ObjectiveQ[2].add(%newObjective);
// 
//    %newObjective = new AIObjective(AIOAttackLocation)
//                         {
//                            weightLevel1 = 12000;
//                            description = "Sniper";
//                            location = "-164 381 134";
//                            offense = true;
//                            defense = false;
//                            equipment = "SniperRifle EnergyPack";
// 									buyEquipmentSet = "LightEnergySniper";
//                         };
//    $ObjectiveQ[2].add(%newObjective);
}

function aiGo(%count)
{
	%offense = true;
	for (%i = 0; %i < %count; %i++)
	{
		aiConnect(friendly @ %i, 1, 0.5, %offense);
		aiConnect(enemy @ %i, 2, 0.5, %offense);
		%offense = !%offense;
	}
}

function addBots(%count)
{
   if(%count > 0)
   {
      %count++;
      while(%count--)
         aiConnect("dude " @ %count);
   }
}

function aiGoTest(%count, %team)
{
	if (%team <= 0)
		%team = 1;

	%offense = false;
	for (%i = 0; %i < %count; %i++)
	{
		if (%offense)
			aiConnect(Offense @ %i, %team, 0.5, true);
		else
			aiConnect(Defense @ %i, %team, 0.5, false);

		%offense = !%offense;
	}
}

//------------------------------

function aiTest()
{
   //find/create an enemy
   %count = ClientGroup.getCount();
   if (%count <= 1)
   {
      %enemyCl = aiConnect(test, 1, 0.5, false);
   }
   else
      %enemyCl = ClientGroup.getObject(1);
      
   //create the objective
   if (! $testObjective)
   {
      $testObjective = new AIObjective(AIOAttackPlayer)
                           {
                              weightLevel1 = 10000;
                              description = "Attack the human!";
                              targetClient = nameToId(LocalClientConnection);
                              location = "";
                              offense = true;
                              defense = true;
                           };
      MissionCleanup.add($testObjective);
   }
   
   //set the enemy inventory
   %enemyPl = %enemyCl.player;
   %enemyPl.setInventory(RepairKit,1);
   %enemyPl.setInventory(Grenade,5);
   //%enemyPl.setInventory(Blaster,1);
   //%enemyPl.setInventory(Plasma,1);
   %enemyPl.setInventory(Disc,1);
   %enemyPl.setInventory(Chaingun, 1);
   %enemyPl.setInventory(GrenadeLauncher, 1);
   //%enemyPl.setInventory(Mortar, 1);
   %enemyPl.setInventory(ChaingunAmmo, 100);
   %enemyPl.setInventory(DiscAmmo, 15);
   %enemyPl.setInventory(PlasmaAmmo,20);  
   %enemyPl.setInventory(GrenadeLauncherAmmo, 10);
   %enemyPl.setInventory(MortarAmmo, 10);
   
	%enemyPl.setDamageLevel(0.0);
   
   //set the target inventory
   %targetCl = 2;
   %targetPl = %targetCl.player;
   %targetPl.setInventory(RepairKit,1);
   %targetPl.setInventory(Grenade,5);
   //%targetPl.setInventory(Blaster,1);
   //%targetPl.setInventory(Plasma,1);
   %targetPl.setInventory(Disc,1);
   %targetPl.setInventory(Chaingun, 1);
   %targetPl.setInventory(GrenadeLauncher, 1);
   //%targetPl.setInventory(Mortar, 1);
   %targetPl.setInventory(ChaingunAmmo, 100);
   %targetPl.setInventory(DiscAmmo, 15);
   %targetPl.setInventory(PlasmaAmmo,20);  
   %targetPl.setInventory(GrenadeLauncherAmmo, 10);
   %targetPl.setInventory(MortarAmmo, 10);
	%targetPl.setDamageLevel(0.0);
   
   //now force the attack objective
   AIForceObjective(%enemyCl, $testObjective);
   %enemyCl.stepEngage(2);
}

function aibump()
{
	%t1 = "-348 -470 142 0 0 1 0";
	%t2 = "-347 -453 142 0 0 1 3.14";

	%t3 = "-348 -462 142 0 0 1 0";
	2.player.setTransform(%t3);

	3.player.setTransform(%t1);
	4.player.setTransform(%t2);

	3.stepMove(%t2, 0.1);
	4.stepMove(%t1, 0.1);
}

function aibump2()
{
	%t1 = "-345.082 -464.229 142 0 0 1 0";
	%t2 = "-347 -453 142 0 0 1 3.14";
	%t3 = "-347.22 -463.439 142 0 0 1 1.89";
	2.player.setTransform(%t3);

	3.player.setTransform(%t1);
	3.stepMove(%t2, 0.1);
}

function aiTestDeploys(%client, %objective)
{
	//if we're just starting the test, unassign the client
	if (!isObject(%objective))
	{
		error("DEBUG begin testing deploy objectives!");
		$AITestDeployObjective = -1;
		aiUnassignClient(%client);
	}

	//if the client isn't still on the test objective, choose the next one
	if (%client.objective != $AITestDeployObjective)
	{
		//if there's a corresponding "repairObjective" for the deploy, then the deploy succeeded
		if (isobject($AITestDeployObjective))
		{
			if (!isObject($AITestDeployObjective.repairObjective))
				$AITestDeployObjective.isInvalid = true;
		}

		//loop through all the objectives, looking for next deploy ones...
		%foundCurrent = !isObject($AITestDeployObjective);
		%nextObjective = -1;
		%found = false;
		%count = $ObjectiveQ[%client.team].getCount();
		for (%i = 0; %i < %count && !%found; %i++)
		{
			%obj = $ObjectiveQ[%client.team].getObject(%i);

			//see if the objective is a group...
			if (%obj.getClassName() !$= "AIObjective")
			{
				%grpCount = %obj.getCount();
				for (%j = 0; %j < %grpCount && !%found; %j++)
				{
					%grpObj = %obj.getObject(%j);
					if (%grpObj.getName() $= "AIODeployEquipment")
					{
						if (%foundCurrent)
						{
							%nextObjective = %grpObj;
							%found = true;
						}
						else if (%grpObj == $AITestDeployObjective)
							%foundCurrent = true;
					}
				}
			}
			else if (%obj.getName() $= "AIODeployEquipment")
			{
				//see if this is the next one
				if (%foundCurrent)
				{
					%nextObjective = %obj;
					%found = true;
				}
				else if (%obj == $AITestDeployObjective)
					%foundCurrent = true;
			}
		}

		if (isObject(%nextObjective))
		{
			//kill all the turrets for your team...
			while (isObject($AIRemoteTurretSet.getObject(0)))
				$AIRemoteTurretSet.getObject(0).delete();

			//remove any associated repairobjective from this deploy
			if (isObject(%nextObjective.repairObjective))
			{
				AIClearObjective(%nextObjective.repairObjective);
				%nextObjective.repairObjective.delete();
				%nextObjective.repairObjective = "";
			}

			//assign the bot to the objective...
			error("DEBUG testing objective:" SPC %nextObjective);
			$AITestDeployObjective = %nextObjective;
			AIUnassignClient(%client);
		   AIForceObjective(%client, $AITestDeployObjective, 10000);
		}
		else
		{
			error("DEBUG testing of deploy objectives is complete:");
			%count = $ObjectiveQ[%client.team].getCount();
			for (%i = 0; %i < %count && !%found; %i++)
			{
				%obj = $ObjectiveQ[%client.team].getObject(%i);

				//see if the objective is a group...
				if (%obj.getClassName() !$= "AIObjective")
				{
					%grpCount = %obj.getCount();
					for (%j = 0; %j < %grpCount && !%found; %j++)
					{
						%grpObj = %obj.getObject(%j);
						if (%grpObj.getName() $= "AIODeployEquipment")
						{
							if (%grpObj.isInvalid)
								error(%grpObj SPC "is invalid.");
							else
								error(%grpObj SPC "passed.");
						}
					}
				}
				else if (%obj.getName() $= "AIODeployEquipment")
				{
					if (%obj.isInvalid)
						error(%obj SPC "is invalid.");
					else
						error(%obj SPC "passed.");
				}
			}
			return;
		}
	}

	//schedule the next call to see if we're still deploying...
	schedule(2000, %client.player, "aiTestDeploys", %client, $AITestDeployObjective);
}

//-----------------------------------------------------------------------------
//AI test pilot task
$TestPilotHeadings[0] = "203 -59 120";
$TestPilotHeadings[1] = "52 10 120";
$TestPilotHeadings[2] = "-112 125 120";
$TestPilotHeadings[3] = "-195 219 120";
$TestPilotHeadings[4] = "-198 323 120";
$TestPilotHeadings[5] = "-38 423 120";
$TestPilotHeadings[6] = "84 445 120";
$TestPilotHeadings[7] = "290 382 120";
$TestPilotHeadings[8] = "385 259 120";
$TestPilotHeadings[9] = "255 6 120";
$TestPilotHeadings[10] = "219 -49 120";
$TestPilotHeadings[11] = "222 -168 120";

function AITestPilot::assume(%task, %client)
{
   %task.setWeightFreq(30);
   %task.setMonitorFreq(10);

	//first, make sure the pilot is in light, and doesn't have an backpacks...
	%client.player.throwPack();
	%client.player.setArmor(Light);

	//next, start the pilot on his way to mounting the vehicle
	%client.pilotVehicle = true;
	%client.stepMove(%task.vehicle.position, 0.25, $AIModeMountVehicle);

	%task.locationIndex = -1;
}

function AITestPilot::weight(%task, %client)
{
	%task.setWeight(10000);
}

function AITestPilot::monitor(%task, %client)
{
	//see if we've mounted yet
	if (%task.locationIndex == -1)
	{
		//mount the vehicle
		%client.pilotVehicle = true;
		%client.stepMove(%task.vehicle.position, 0.25, $AIModeMountVehicle);

		if (isObject(%client.vehicleMounted))
		{
			%task.locationIndex++;
			%client.setPilotDestination($TestPilotHeadings[%task.locationIndex]);
		}
	}

	//else see if we're close enough to the current destination to choose the next
	else
	{
		%pos = %client.vehicleMounted.position;
		%pos2D = getWord(%pos, 0) SPC getWord(%pos, 1) SPC "0";
		%dest = $TestPilotHeadings[%task.locationIndex];
		%dest2D = getWord(%dest, 0) SPC getWord(%dest, 1) SPC "0";

		if (VectorDist(%dest2D, %pos2D) < 20)
		{
			if ($TestPilotHeadings[%task.locationIndex + 1] !$= "")
			{
				%task.locationIndex++;
				%client.setPilotDestination($TestPilotHeadings[%task.locationIndex]);
			}
			else
				%client.setPilotAim($TestPilotHeadings[0]);
		}
	}
}

function testPilot(%client, %vehicle)
{
	%client.clearTasks();

	if (%vehicle $= "")
		%vehicle = LocalClientConnection.vehicleMounted;

	%client.pilotTask = %client.addTask(AITestPilot);
	%client.pilotTask.vehicle = %vehicle;
}

