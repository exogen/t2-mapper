// used to automatically create all objectives for a mission

function AIgeneratorObjectiveInit(%object)
{
   if(%object.isUnderTerrain)
      return; // no objectives for generators that act as a simple power sources
   
   if(%object.team > 0)
   {
      %homeTeam = %object.team;
      if(%homeTeam == 1)
         %enemyTeam = 2;
      else
         %enemyTeam = 1;
   
      addAIObjective(%enemyTeam, createDefaultAttack(%object, $AIWeightAttackGenerator[1], $AIWeightAttackGenerator[2]));
      addAIObjective(%homeTeam, createDefaultRepair(%object, $AIWeightRepairGenerator[1], $AIWeightRepairGenerator[2]));
      addAIObjective(%homeTeam, createDefaultDefend(%object, $AIWeightDefendGenerator[1], $AIWeightDefendGenerator[2]));
   }
   else
   {
      addAIObjective(1, createDefaultRepair(%object, $AIWeightRepairGenerator[1], $AIWeightRepairGenerator[2]));
      addAIObjective(1, createDefaultAttack(%object, $AIWeightAttackGenerator[1], $AIWeightAttackGenerator[2]));
      addAIObjective(1, createDefaultDefend(%object, $AIWeightDefendGenerator[1], $AIWeightDefendGenerator[2]));
      addAIObjective(2, createDefaultRepair(%object, $AIWeightRepairGenerator[1], $AIWeightRepairGenerator[2]));
      addAIObjective(2, createDefaultAttack(%object, $AIWeightAttackGenerator[1], $AIWeightAttackGenerator[2]));
      addAIObjective(2, createDefaultDefend(%object, $AIWeightDefendGenerator[1], $AIWeightDefendGenerator[2]));
   }
}

//-------------------------------------------------------------------------------------------------------- 

function AIsensorObjectiveInit(%object)
{
   if(%object.team > 0)
   {
      %homeTeam = %object.team;
      if(%homeTeam == 1)
         %enemyTeam = 2;
      else
         %enemyTeam = 1;
   
      addAIObjective(%homeTeam, createDefaultRepair(%object, $AIWeightRepairTurret[1], $AIWeightRepairTurret[2]));
      addAIObjective(%enemyTeam, createDefaultMortar(%object, $AIWeightMortarTurret[1], $AIWeightMortarTurret[2]));
   }
   else
   {
      addAIObjective(1, createDefaultRepair(%object, $AIWeightRepairTurret[1], $AIWeightRepairTurret[2]));
      addAIObjective(1, createDefaultMortar(%object, $AIWeightMortarTurret[1], $AIWeightMortarTurret[2]));
      addAIObjective(2, createDefaultRepair(%object, $AIWeightRepairTurret[1], $AIWeightRepairTurret[2]));
      addAIObjective(2, createDefaultMortar(%object, $AIWeightMortarTurret[1], $AIWeightMortarTurret[2]));
   }
}

//-------------------------------------------------------------------------------------------------------- 

function AIflipflopObjectiveInit(%object)
{
   // this will always start out neutral (Team 0)
   addAIObjective(1, createDefaultDefend(%object, $AIWeightDefendFlipFlop[1], $AIWeightDefendFlipFlop[2])); 
   addAIObjective(1, createDefaultTouch(%object, $AIWeightCaptureFlipFlop[1], $AIWeightCaptureFlipFlop[2]));
   addAIObjective(2, createDefaultDefend(%object, $AIWeightDefendFlipFlop[1], $AIWeightDefendFlipFlop[2]));
   addAIObjective(2, createDefaultTouch(%object, $AIWeightCaptureFlipFlop[1], $AIWeightCaptureFlipFlop[2]));
}

//-------------------------------------------------------------------------------------------------------- 

function AIturretObjectiveInit(%object)
{
   if(%object.team > 0)
   {
      %homeTeam = %object.team;
      if(%homeTeam == 1)
         %enemyTeam = 2;
      else
         %enemyTeam = 1;
   
      addAIObjective(%homeTeam, createDefaultRepair(%object, $AIWeightRepairTurret[1], $AIWeightRepairTurret[2]));
      
      // attack for indoor turrets, mortar for outside turrets
      if(%object.getDataBlock().getName() $= "SentryTurret")
         addAIObjective(%enemyTeam, createDefaultAttack(%object, $AIWeightAttackInventory[1], $AIWeightAttackInventory[2]));
      else
         addAIObjective(%enemyTeam, createDefaultMortar(%object, $AIWeightMortarTurret[1], $AIWeightMortarTurret[2]));
   }
   else
   {
      addAIObjective(1, createDefaultRepair(%object, $AIWeightRepairTurret[1], $AIWeightRepairTurret[2]));
      addAIObjective(1, createDefaultMortar(%object, $AIWeightMortarTurret[1], $AIWeightMortarTurret[2]));
      addAIObjective(2, createDefaultRepair(%object, $AIWeightRepairTurret[1], $AIWeightRepairTurret[2]));
      addAIObjective(2, createDefaultMortar(%object, $AIWeightMortarTurret[1], $AIWeightMortarTurret[2]));
   }
}

//-------------------------------------------------------------------------------------------------------- 

function AIinventoryObjectiveInit(%object)
{
   if(%object.team > 0)
   {
      %homeTeam = %object.team;
      if(%homeTeam == 1)
         %enemyTeam = 2;
      else
         %enemyTeam = 1;
   
      addAIObjective(%homeTeam, createDefaultRepair(%object, $AIWeightRepairInventory[1], $AIWeightRepairInventory[2]));
      addAIObjective(%enemyTeam, createDefaultAttack(%object, $AIWeightAttackInventory[1], $AIWeightAttackInventory[2]));
   }
   else
   {
      addAIObjective(1, createDefaultRepair(%object, $AIWeightRepairInventory[1], $AIWeightRepairInventory[2]));
      addAIObjective(1, createDefaultAttack(%object, $AIWeightAttackInventory[1], $AIWeightAttackInventory[2]));
      addAIObjective(2, createDefaultRepair(%object, $AIWeightRepairInventory[1], $AIWeightRepairInventory[2]));
      addAIObjective(2, createDefaultAttack(%object, $AIWeightAttackInventory[1], $AIWeightAttackInventory[2]));
   }
}

//-------------------------------------------------------------------------------------------------------- 

function createDefaultTouch(%object, %weight1, %weight2)
{
   %objective = new AIObjective(AIOTouchObject) 
   {
      dataBlock = "AIObjectiveMarker";
      description = "Capture the " @ %object.getName();
      weightLevel1 = %weight1;
      weightLevel2 = %weight2;
      mode = "TouchFlipFlop";
		targetObject = %object.getName();
      targetClientId = -1;
      targetObjectId = -1;
      offense = true;
      location = %object.getWorldBoxCenter();
		desiredEquipment = "Light EnergyPack";
		buyEquipmentSet = "LightEnergyDefault";
	};
   
   if(%object.missionTypesList !$= "")
      %objective.gameType = %object.missionTypesList;

   %objective.position = %objective.location;
   return %objective;
}

//-------------------------------------------------------------------------------------------------------- 

function createDefaultMortar(%object, %weight1, %weight2)
{
   %objective = new AIObjective(AIOMortarObject) 
   {
      dataBlock = "AIObjectiveMarker";
      description = "Mortar the " @ %object.getDataBlock().getName();
		targetObject = %object.getName();
		targetObjectId = %object;
		targetClientId = -1;
		weightLevel1 = %weight1;
		weightLevel2 = %weight2;
      location = %object.getWorldBoxCenter();
		offense = true;
		equipment = "Mortar MortarAmmo";
		buyEquipmentSet = "HeavyAmmoSet";
	};
   
   if(%object.missionTypesList !$= "")
      %objective.gameType = %object.missionTypesList;

   %objective.position = %objective.location;
   return %objective;
}

//-------------------------------------------------------------------------------------------------------- 

function createDefaultRepair(%object, %weight1, %weight2)
{
   %objective = new AIObjective(AIORepairObject) 
   {
      dataBlock = "AIObjectiveMarker";
      description = "Repair the " @ %object.getDataBlock().getName();
		targetObject = %object.getName();
		targetObjectId = %object;
		targetClientId = -1;
		weightLevel1 = %weight1;
		weightLevel2 = %weight2;
      location = %object.getWorldBoxCenter();
		defense = true;
		equipment = "RepairPack";
		buyEquipmentSet = "MediumRepairSet";
	};

   if(%object.missionTypesList !$= "")
      %objective.gameType = %object.missionTypesList;

   %objective.position = %objective.location;
   return %objective;
}

//-------------------------------------------------------------------------------------------------------- 

function createDefaultAttack(%object, %weight1, %weight2)
{
   %objective = new AIObjective(AIOAttackObject) 
   {
      dataBlock = "AIObjectiveMarker";
      description = "Attack the " @ %object.getDataBlock().getName();
		targetObject = %object.getName();
		targetObjectId = %object;
		targetClientId = -1;
		weightLevel1 = %weight1;
		weightLevel2 = %weight2;
      location = %object.getWorldBoxCenter();
		offense = true;
		desiredEquipment = "ShieldPack";
		buyEquipmentSet = "HeavyAmmoSet";
	};

   if(%object.missionTypesList !$= "")
      %objective.gameType = %object.missionTypesList;
   
   %objective.position = %objective.location;
   return %objective;
}

//-------------------------------------------------------------------------------------------------------- 

function createDefaultDefend(%object, %weight1, %weight2)
{
	%objective = new AIObjective(AIODefendLocation) 
   {
      dataBlock = "AIObjectiveMarker";
      description = "Defend the " @ %object.getDataBlock().getName();
		targetObject = %object.getName();
		targetObjectId = %object;
		targetClientId = -1;
		weightLevel1 = %weight1;
		weightLevel2 = %weight2;
      location = %object.getWorldBoxCenter();
      defense = true;
		desiredEquipment = "ShieldPack Plasma PlasmaAmmo";
		buyEquipmentSet = "HeavyShieldSet";
	};
   
   if(%object.missionTypesList !$= "")
      %objective.gameType = %object.missionTypesList;
   
   %objective.position = %objective.location;
   return %objective;
}

//-------------------------------------------------------------------------------------------------------- 

function AIflagObjectiveInit(%flag)
{
   %homeTeam = %flag.team;
   
   if(%homeTeam == 1)
      %enemyTeam = 2;
   else
      %enemyTeam = 1;
   
   if(%flag.missionTypesList !$= "")
   {
      %missionSpecific = true;
      %misType = %flag.missionTypesList;
   }
   
   %newObjective = new AIObjective(AIODefendLocation)
   {
      dataBlock = "AIObjectiveMarker";
      weightLevel1 = $AIWeightDefendFlag[1];
      weightLevel2 = $AIWeightDefendFlag[2];
      description = "Defend our flag";
		targetObject = %flag.getName();
		targetObjectId = %flag;
		targetClientId = -1;
      location = %flag.getWorldBoxCenter();
      defense = true;
		desiredEquipment = "ShieldPack Plasma PlasmaAmmo";
		buyEquipmentSet = "HeavyShieldSet";
		chat = "ChatSelfDefendFlag DefendBase";
   };
   
   if(%missionSpecific)
      %newObjective.gameType = %misType;
   else
      %newObjective.gameType = "all";
      
   %newObjective.position = %newObjective.location;
   addAIObjective(%homeTeam, %newObjective);
   
   %newObjective = new AIObjective(AIOTouchObject)
   {
      dataBlock = "AIObjectiveMarker";
      weightLevel1 = $AIWeightGrabFlag[1];
      weightLevel2 = $AIWeightGrabFlag[2];
      description = "Grab the enemy flag";
		targetObject = %flag.getName();
		targetObjectId = %flag;
		targetClientId = -1;
      location = %flag.getWorldBoxCenter();
      mode = "FlagGrab";
      offense = true;
		desiredEquipment = "Light EnergyPack";
		buyEquipmentSet = "LightEnergyDefault";
   };
   
   if(%missionSpecific)
      %newObjective.gameType = %misType;
   else
      %newObjective.gameType = "all";
   
   %newObjective.position = %newObjective.location;
   addAIObjective(%enemyTeam, %newObjective);

	//NOTE:  for this objective, we need to fill in the targetClientId when the flag is taken
   %newObjective = new AIObjective(AIOAttackPlayer)
   {
      dataBlock = "AIObjectiveMarker";
      weightLevel1 = $AIWeightKillFlagCarrier[1];
      weightLevel2 = $AIWeightKillFlagCarrier[2];
      description = "Kill the enemy flag carrier";
      mode = "FlagCarrier";
		targetObject = %flag.getName();
		targetObjectId = -1;
		targetClientId = -1;
      offense = true;
		desiredEquipment = "Light EnergyPack";
		buyEquipmentSet = "LightEnergySniper";
   };
   
   if(%missionSpecific)
      %newObjective.gameType = %misType;
   else
      %newObjective.gameType = "all";
   
   %newObjective.position = %flag.getWorldBoxCenter();
   addAIObjective(%homeTeam, %newObjective);

	//NOTE: for this objective, we need to fill in the location when the flag is grabbed
   %newObjective = new AIObjective(AIOTouchObject)
   {
      dataBlock = "AIObjectiveMarker";
      weightLevel1 = $AIWeightCapFlag[1];
      weightLevel2 = $AIWeightCapFlag[2];
      description = "Capture the flag!";
		targetObject = %flag.getName();
		targetObjectId = %flag;
		targetClientId = -1;
      mode = "FlagCapture";
      offense = true;
      defense = true;
   };
   
   if(%missionSpecific)
      %newObjective.gameType = %misType;
   else
      %newObjective.gameType = "all";
  
   %newObjective.position = %flag.getWorldBoxCenter();
   addAIObjective(%enemyTeam, %newObjective);

   %newObjective = new AIObjective(AIOTouchObject)
   {
      dataBlock = "AIObjectiveMarker";
      weightLevel1 = $AIWeightReturnFlag[1];
      weightLevel2 = $AIWeightReturnFlag[2];
      description = "Return our flag";
		targetObject = %flag.getName();
		targetObjectId = %flag;
		targetClientId = -1;
      location = %flag.getWorldBoxCenter();
      mode = "FlagDropped";
      offense = true;
      defense = true;
   };
   
   if(%missionSpecific)
      %newObjective.gameType = %misType;
   else
      %newObjective.gameType = "all";
   
   %newObjective.position = %newObjective.location;
   addAIObjective(%homeTeam, %newObjective);
   
   %newObjective = new AIObjective(AIOTouchObject)
   {
      dataBlock = "AIObjectiveMarker";
      weightLevel1 = $AIWeightReturnFlag[1];
      weightLevel2 = $AIWeightReturnFlag[2];
      description = "Grab the dropped enemy flag";
		targetObject = %flag.getName();
		targetObjectId = %flag;
		targetClientId = -1;
      mode = "FlagDropped";
      offense = true;
      defense = true;
   };
   
   if(%missionSpecific)
      %newObjective.gameType = %misType;
   else
      %newObjective.gameType = "all";
   
   %newObjective.position = %flag.getWorldBoxCenter();
   addAIObjective(%enemyTeam, %newObjective);
}

//-------------------------------------------------------------------------------------------------------- 

function addAIObjective(%team, %objective)
{
   if(AIObjectiveExists(%objective, %team) == false)
      nameToId("MissionGroup/Teams/team" @ %team @ "/AIObjectives").add(%objective);
   else
      %objective.delete();   
}

//-------------------------------------------------------------------------------------------------------- 

function AICreateObjectives()
{
   messageBoxOkCancel("Build Objectives", "Are you sure you want to build all mission objectives?", "AIBuildObjectives();"); 
}

function AIBuildObjectives()
{
   // make sure there exists our objectives group
   for(%i = 0; %i <= Game.numTeams; %i++)
	{
      %objGroup = nameToId("MissionGroup/Teams/team" @ %i @ "/AIObjectives");   
      %teamGroup = nameToID("MissionGroup/Teams/team" @ %i);
	   
      if(%objGroup <= 0)
	   {	
         %set = new SimGroup(AIObjectives);
         %teamGroup.add(%set);
      }
      else
      {
         // there already exists a folder for AIobjectives
         // remove any objectives that are not locked
         %count = 0;
         while(%objGroup.getCount() && (%count != %objGroup.getCount()))   
         {   
            %obj = %objGroup.getObject(%count);            
            if(!%obj.locked)
               %objGroup.remove(%obj);
            else
               %count++;
         }      
      }
   }   
   
   for(%k = 0; %k <= Game.numTeams; %k++)   
   {   
      %teamGroup = nameToID("MissionGroup/Teams/team" @ %k);
      %teamGroup.AIobjectiveInit(false);
   }   
}

//-------------------------------------------------------------------------------------------------------- 

function SimGroup::AIobjectiveInit(%this)
{
   for(%i = 0; %i < %this.getCount(); %i++)
      %this.getObject(%i).AIobjectiveInit();   
}

//-------------------------------------------------------------------------------------------------------- 

function GameBase::AIobjectiveInit(%this)
{
   %this.getDataBlock().AIobjectiveInit(%this);
}

//-------------------------------------------------------------------------------------------------------- 

function AssignName(%object)
{
	%root = %object.getDataBlock().getName();
	if (%root $= "")
		%root = "Unknown";

	if (%object.team >= 0)
		%newName = "Team" @ %object.team @ %root;
	else
		%newName = "Unnamed" @ %root;
	%i = 1;
	while (isObject(%newName @ %i))
		%i++;
	%object.setName(%newName @ %i);
}

//-------------------------------------------------------------------------------------------------------- 

function StationInventory::AIobjectiveInit(%data, %object)
{
   if(%object.getName() $= "")
		AssignName(%object);

   AIinventoryObjectiveInit(%object);
}

//-------------------------------------------------------------------------------------------------------- 

function Generator::AIobjectiveInit(%data, %object)
{
   if(%object.getName() $= "")
		AssignName(%object);

   if(!%object.isUnderTerrain)
      AIgeneratorObjectiveInit(%object);
}

//-------------------------------------------------------------------------------------------------------- 

function TurretData::AIobjectiveInit(%data, %object)
{
   if(%object.getName() $= "")
		AssignName(%object);

   AIturretObjectiveInit(%object);
}

//-------------------------------------------------------------------------------------------------------- 

function Sensor::AIobjectiveInit(%data, %object)
{
   if(%object.getName() $= "")
		AssignName(%object);

   AIsensorObjectiveInit(%object);
}

//-------------------------------------------------------------------------------------------------------- 

function Flag::AIobjectiveInit(%data, %object)
{
   if(%object.getName() $= "")
		AssignName(%object);

   AIflagObjectiveInit(%object);
}

//-------------------------------------------------------------------------------------------------------- 

function FlipFlop::AIobjectiveInit(%data, %object)
{
   if(%object.getName() $= "")
		AssignName(%object);

   AIflipflopObjectiveInit(%object);
}

//-------------------------------------------------------------------------------------------------------- 

function saveObjectives()
{
   for(%i = 1; %i <= 2; %i++)
      saveObjectives(%i);
}

//-------------------------------------------------------------------------------------------------------- 

function saveObjectiveFile(%team)
{
   // check for read-only
   %fileName = $CurrentMission @ "team" @ %team @ ".cs";
   %file = "base/missions/" @ %fileName;
   
   if(!isWriteableFileName(%file))
   {
      error("Objectives file '" @ %fileName @ "' is not writeable.");
      return; 
   }
   
   // ok, were good to save.
   %objectives = nameToId("MissionGroup/Teams/team" @ %team @ "/AIObjectives");
   %objectives.save("missions/" @ %fileName);
}

//-------------------------------------------------------------------------------------------------------- 

function LoadObjectives(%numTeams)
{
   for(%i = 1; %i <= %numTeams; %i++)
      loadObjectivesFile(%i);
}

//-------------------------------------------------------------------------------------------------------- 

function LoadObjectivesFile(%team)
{
   %file = $CurrentMission @ "team" @ %team;
   exec("missions/" @ %file);
   %newObjSet = nameToId("MissionCleanup/AIObjectives");
   
   if(%newObjSet > 0)
   {
      %group = NameToId("MissionGroup/Teams/team" @ %team);
      %oldObjSet = NameToId("MissionGroup/Teams/team" @ %team @ "/AIObjectives");
      
      if(%oldObjSet > 0)
      {
         %oldObjSet.delete();
         %group.add(%newObjSet);
      }   
   }
   else
      error("no objectives file for team" @ %team @ ". Loading defaults...");     
}

//-------------------------------------------------------------------------------------------------------- 

function AIObjectiveExists(%newObjective, %team)
{
   %objGroup = nameToId("MissionGroup/Teams/team" @ %team @ "/AIObjectives");
   %objCount = %objGroup.getCount();
   %exists = false;
   
   for(%i = 0; %i < %objCount; %i++)
   {
      %obj = %objGroup.getObject(%i);
      
      if(%obj.getName() $= %newObjective.getName())
      {
         if((%obj.getName() $= "AIOMortarObject") || 
               (%obj.getName() $= "AIORepairObject") ||
                  (%obj.getName() $= "AIOAttackObject") ||
                     (%obj.getName() $= "AIODefendLocation"))
         {
            if(%obj.targetObjectId == %newObjective.targetObjectId)
               %exists = true;
         }
         else if((%obj.getName() $= "AIOTouchObject") ||
                     (%obj.getName() $= "AIOAttackPlayer"))    
         {
            if(%obj.mode $= %newObjective.mode)
               if(%obj.description $= %newObjective.description)
                  %exists = true;
         }
      }   
   }   
   return %exists;   
}
