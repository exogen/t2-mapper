// possible commands:
//---------------------------------------------------------------------------
$TaskDescription['EscortPlayer']       = 'Escort player %1';
$TaskDescription['RepairPlayer']       = 'Repair player %1';
$TaskDescription['AttackPlayer']       = 'Attack enemy player %1';
$TaskDescription['DefendFlag']         = 'Defend the flag';
$TaskDescription['ReturnFlag']         = 'Return our flag';
$TaskDescription['CaptureFlag']        = 'Capture the enemy flag';
$TaskDescription['CaptureObjective']   = 'Capture the %1';
$TaskDescription['DefendObjective']    = 'Defend the %1';
$TaskDescription['DefendLocation']     = 'Defend location';
$TaskDescription['MeetLocation']       = 'Meet at location';
$TaskDescription['BombLocation']       = 'Bomb at location';
$TaskDescription['AttackLocation']     = 'Attack at location';
$TaskDescription['LazeTarget']         = 'Laze the target';
$TaskDescription['DeployTurretBarrel'] = 'Deploy turret barrels';
$TaskDescription['DeployTurret']       = 'Deploy turrets';
$TaskDescription['DeployEquipment']    = 'Deploy stations';
$TaskDescription['DeploySensor']       = 'Deploy sensors';
$TaskDescription['RepairObject']       = 'Repair the %1';
$TaskDescription['DefendObject']       = 'Defend the %1';
$TaskDescription['AttackObject']       = 'Attack the enemy %1';
$TaskDescription['MortarObject']       = 'Mortar the enemy %1';
$TaskDescription['LazeObject']         = 'Laze the enemy %1';
$TaskDescription['BombObject']         = 'Bomb the %1';
$TaskDescription['TakeFlag']       		= 'Take flag from %1';
$TaskDescription['GiveFlag']       		= 'Give flag to %1';
$TaskDescription['NeedRide']       		= '%1 needs a ride.';
$TaskDescription['NeedPassenger']		= '%1 needs vehicle support.';

// AIObjectives for commands:
//---------------------------------------------------------------------------
$ObjectiveTable['AttackLocation', type]               = "AIOAttackLocation";
$ObjectiveTable['AttackLocation', weightLevel1]       = 2500;
$ObjectiveTable['AttackLocation', weightLevel2]       = 1000;
$ObjectiveTable['AttackLocation', weightLevel3]       = 500;
$ObjectiveTable['AttackLocation', weightLevel4]       = 100;
$ObjectiveTable['AttackLocation', equipment]          = "";
$ObjectiveTable['AttackLocation', desiredEquipment]   = "ShieldPack";
$ObjectiveTable['AttackLocation', buyEquipmentSet]    = "LightShieldSet MediumShieldSet HeavyShieldSet";
$ObjectiveTable['AttackLocation', offense]            = "true";
$ObjectiveTable['AttackLocation', defense]            = "false";
$ObjectiveTable['AttackLocation', assignTimeout]      = "5000";   // period allowed for humans to ack
$ObjectiveTable['AttackLocation', maxAssigned]        = "2";      // not added if at least this many playrs have ack'd

$ObjectiveTable['DefendLocation', type]               = "AIODefendLocation";
$ObjectiveTable['DefendLocation', weightLevel1]       = 2500;
$ObjectiveTable['DefendLocation', weightLevel2]       = 1000;
$ObjectiveTable['DefendLocation', weightLevel3]       = 500;
$ObjectiveTable['DefendLocation', weightLevel4]       = 100;
$ObjectiveTable['DefendLocation', equipment]          = "";
$ObjectiveTable['DefendLocation', desiredEquipment]   = "ShieldPack";
$ObjectiveTable['DefendLocation', buyEquipmentSet]    = "MediumShieldSet LightShieldSet HeavyShieldSet";
$ObjectiveTable['DefendLocation', offense]            = "false";
$ObjectiveTable['DefendLocation', defense]            = "true";
$ObjectiveTable['DefendLocation', assignTimeout]      = "5000";   // period allowed for humans to ack
$ObjectiveTable['DefendLocation', maxAssigned]        = "2";      // not added if at least this many playrs have ack'd

$ObjectiveTable['MeetLocation', type]               = "AIODefendLocation";
$ObjectiveTable['MeetLocation', weightLevel1]       = 2500;
$ObjectiveTable['MeetLocation', weightLevel2]       = 1000;
$ObjectiveTable['MeetLocation', weightLevel3]       = 500;
$ObjectiveTable['MeetLocation', weightLevel4]       = 100;
$ObjectiveTable['MeetLocation', equipment]          = "";
$ObjectiveTable['MeetLocation', desiredEquipment]   = "";
$ObjectiveTable['MeetLocation', buyEquipmentSet]    = "";
$ObjectiveTable['MeetLocation', offense]            = "false";
$ObjectiveTable['MeetLocation', defense]            = "true";
$ObjectiveTable['MeetLocation', assignTimeout]      = "5000";   // period allowed for humans to ack
$ObjectiveTable['MeetLocation', maxAssigned]        = "2";      // not added if at least this many playrs have ack'd

$ObjectiveTable['DefendObjective', type]               = "AIODefendLocation";
$ObjectiveTable['DefendObjective', weightLevel1]       = 2500;
$ObjectiveTable['DefendObjective', weightLevel2]       = 1000;
$ObjectiveTable['DefendObjective', weightLevel3]       = 500;
$ObjectiveTable['DefendObjective', weightLevel4]       = 100;
$ObjectiveTable['DefendObjective', equipment]          = "";
$ObjectiveTable['DefendObjective', desiredEquipment]   = "ShieldPack";
$ObjectiveTable['DefendObjective', buyEquipmentSet]    = "MediumShieldSet LightShieldSet HeavyShieldSet";
$ObjectiveTable['DefendObjective', offense]            = "false";
$ObjectiveTable['DefendObjective', defense]            = "true";
$ObjectiveTable['DefendObjective', assignTimeout]      = "5000";   // period allowed for humans to ack
$ObjectiveTable['DefendObjective', maxAssigned]        = "2";      // not added if at least this many playrs have ack'd

$ObjectiveTable['DefendObject', type]               = "AIODefendLocation";
$ObjectiveTable['DefendObject', weightLevel1]       = 2500;
$ObjectiveTable['DefendObject', weightLevel2]       = 1000;
$ObjectiveTable['DefendObject', weightLevel3]       = 500;
$ObjectiveTable['DefendObject', weightLevel4]       = 100;
$ObjectiveTable['DefendObject', equipment]          = "";
$ObjectiveTable['DefendObject', desiredEquipment]   = "ShieldPack";
$ObjectiveTable['DefendObject', buyEquipmentSet]    = "MediumShieldSet LightShieldSet HeavyShieldSet";
$ObjectiveTable['DefendObject', offense]            = "false";
$ObjectiveTable['DefendObject', defense]            = "true";
$ObjectiveTable['DefendObject', assignTimeout]      = "5000";   // period allowed for humans to ack
$ObjectiveTable['DefendObject', maxAssigned]        = "2";      // not added if at least this many playrs have ack'd

$ObjectiveTable['AttackObject', type]               = "AIOAttackObject";
$ObjectiveTable['AttackObject', weightLevel1]       = 2500;
$ObjectiveTable['AttackObject', weightLevel2]       = 1000;
$ObjectiveTable['AttackObject', weightLevel3]       = 500;
$ObjectiveTable['AttackObject', weightLevel4]       = 100;
$ObjectiveTable['AttackObject', equipment]          = "";
$ObjectiveTable['AttackObject', desiredEquipment]   = "ShieldPack Plasma PlasmaAmmo";
$ObjectiveTable['AttackObject', buyEquipmentSet]    = "MediumShieldSet LightShieldSet HeavyShieldSet";
$ObjectiveTable['AttackObject', offense]            = "false";
$ObjectiveTable['AttackObject', defense]            = "true";
$ObjectiveTable['AttackObject', assignTimeout]      = "5000";   // period allowed for humans to ack
$ObjectiveTable['AttackObject', maxAssigned]        = "2";      // not added if at least this many playrs have ack'd

$ObjectiveTable['EscortPlayer', type]               = "AIOEscortPlayer";
$ObjectiveTable['EscortPlayer', weightLevel1]       = 2500;
$ObjectiveTable['EscortPlayer', weightLevel2]       = 1000;
$ObjectiveTable['EscortPlayer', weightLevel3]       = 500;
$ObjectiveTable['EscortPlayer', weightLevel4]       = 100;
$ObjectiveTable['EscortPlayer', equipment]          = "";
$ObjectiveTable['EscortPlayer', desiredEquipment]   = "EnergyPack";
$ObjectiveTable['EscortPlayer', buyEquipmentSet]    = "LightDefaultSet";
$ObjectiveTable['EscortPlayer', offense]            = "true";
$ObjectiveTable['EscortPlayer', defense]            = "true";
$ObjectiveTable['EscortPlayer', assignTimeout]      = "5000";   // period allowed for humans to ack
$ObjectiveTable['EscortPlayer', maxAssigned]        = "2";      // not added if at least this many playrs have ack'd

$ObjectiveTable['AttackPlayer', type]               = "AIOAttackPlayer";
$ObjectiveTable['AttackPlayer', weightLevel1]       = 2500;
$ObjectiveTable['AttackPlayer', weightLevel2]       = 1000;
$ObjectiveTable['AttackPlayer', weightLevel3]       = 500;
$ObjectiveTable['AttackPlayer', weightLevel4]       = 100;
$ObjectiveTable['AttackPlayer', equipment]          = "";
$ObjectiveTable['AttackPlayer', desiredEquipment]   = "EnergyPack";
$ObjectiveTable['AttackPlayer', buyEquipmentSet]    = "LightDefaultSet";
$ObjectiveTable['AttackPlayer', offense]            = "true";
$ObjectiveTable['AttackPlayer', defense]            = "true";
$ObjectiveTable['AttackPlayer', assignTimeout]      = "5000";   // period allowed for humans to ack
$ObjectiveTable['AttackPlayer', maxAssigned]        = "2";      // not added if at least this many playrs have ack'd

$ObjectiveTable['RepairPlayer', type]               = "AIORepairObject";
$ObjectiveTable['RepairPlayer', weightLevel1]       = 2500;
$ObjectiveTable['RepairPlayer', weightLevel2]       = 1000;
$ObjectiveTable['RepairPlayer', weightLevel3]       = 500;
$ObjectiveTable['RepairPlayer', weightLevel4]       = 100;
$ObjectiveTable['RepairPlayer', equipment]          = "RepairPack";
$ObjectiveTable['RepairPlayer', desiredEquipment]   = "RepairPack";
$ObjectiveTable['RepairPlayer', buyEquipmentSet]    = "LightRepairSet MediumRepairSet HeavyRepairSet";
$ObjectiveTable['RepairPlayer', offense]            = "true";
$ObjectiveTable['RepairPlayer', defense]            = "true";
$ObjectiveTable['RepairPlayer', assignTimeout]      = "5000";   // period allowed for humans to ack
$ObjectiveTable['RepairPlayer', maxAssigned]        = "2";      // not added if at least this many playrs have ack'd

$ObjectiveTable['RepairObject', type]               = "AIORepairObject";
$ObjectiveTable['RepairObject', weightLevel1]       = 2500;
$ObjectiveTable['RepairObject', weightLevel2]       = 1000;
$ObjectiveTable['RepairObject', weightLevel3]       = 500;
$ObjectiveTable['RepairObject', weightLevel4]       = 100;
$ObjectiveTable['RepairObject', equipment]          = "RepairPack";
$ObjectiveTable['RepairObject', desiredEquipment]   = "RepairPack";
$ObjectiveTable['RepairObject', buyEquipmentSet]    = "LightRepairSet MediumRepairSet HeavyRepairSet";
$ObjectiveTable['RepairObject', offense]            = "true";
$ObjectiveTable['RepairObject', defense]            = "true";
$ObjectiveTable['RepairObject', assignTimeout]      = "5000";   // period allowed for humans to ack
$ObjectiveTable['RepairObject', maxAssigned]        = "2";      // not added if at least this many playrs have ack'd

$ObjectiveTable['MortarObject', type]               = "AIOMortarObject";
$ObjectiveTable['MortarObject', weightLevel1]       = 2500;
$ObjectiveTable['MortarObject', weightLevel2]       = 1000;
$ObjectiveTable['MortarObject', weightLevel3]       = 500;
$ObjectiveTable['MortarObject', weightLevel4]       = 100;
$ObjectiveTable['MortarObject', equipment]          = "Mortar MortarAmmo";
$ObjectiveTable['MortarObject', desiredEquipment]   = "";
$ObjectiveTable['MortarObject', buyEquipmentSet]    = "HeavyAmmoSet";
$ObjectiveTable['MortarObject', offense]            = "true";
$ObjectiveTable['MortarObject', defense]            = "true";
$ObjectiveTable['MortarObject', assignTimeout]      = "5000";   // period allowed for humans to ack
$ObjectiveTable['MortarObject', maxAssigned]        = "2";      // not added if at least this many playrs have ack'd

$ObjectiveTable['LazeObject', type]               = "AIOLazeObject";
$ObjectiveTable['LazeObject', weightLevel1]       = 2500;
$ObjectiveTable['LazeObject', weightLevel2]       = 1000;
$ObjectiveTable['LazeObject', weightLevel3]       = 500;
$ObjectiveTable['LazeObject', weightLevel4]       = 100;
$ObjectiveTable['LazeObject', equipment]          = "TargetingLaser";
$ObjectiveTable['LazeObject', desiredEquipment]   = "";
$ObjectiveTable['LazeObject', buyEquipmentSet]    = "LightEnergyDefault";
$ObjectiveTable['LazeObject', offense]            = "true";
$ObjectiveTable['LazeObject', defense]            = "true";
$ObjectiveTable['LazeObject', assignTimeout]      = "5000";   // period allowed for humans to ack
$ObjectiveTable['LazeObject', maxAssigned]        = "2";      // not added if at least this many playrs have ack'd

$ObjectiveTable['BombObject', type]               = "AIOBombLocation";
$ObjectiveTable['BombObject', weightLevel1]       = 2500;
$ObjectiveTable['BombObject', weightLevel2]       = 2500;
$ObjectiveTable['BombObject', weightLevel3]       = 2500;
$ObjectiveTable['BombObject', weightLevel4]       = 2500;
$ObjectiveTable['BombObject', equipment]          = "";
$ObjectiveTable['BombObject', desiredEquipment]   = "";
$ObjectiveTable['BombObject', buyEquipmentSet]    = "";
$ObjectiveTable['BombObject', offense]            = "false";
$ObjectiveTable['BombObject', defense]            = "false";
$ObjectiveTable['BombObject', assignTimeout]      = "5000";   // period allowed for humans to ack
$ObjectiveTable['BombObject', maxAssigned]        = "2";      // not added if at least this many playrs have ack'd

$ObjectiveTable['DeployTurret', type]               = "AIODeployEquipment";
$ObjectiveTable['DeployTurret', weightLevel1]       = 2500;
$ObjectiveTable['DeployTurret', weightLevel2]       = 1000;
$ObjectiveTable['DeployTurret', weightLevel3]       = 500;
$ObjectiveTable['DeployTurret', weightLevel4]       = 100;
$ObjectiveTable['DeployTurret', equipment]          = "TurretOutdoorDeployable";
$ObjectiveTable['DeployTurret', desiredEquipment]   = "TurretOutdoorDeployable";
$ObjectiveTable['DeployTurret', buyEquipmentSet]    = "MediumOutdoorTurretSet";
$ObjectiveTable['DeployTurret', offense]            = "false";
$ObjectiveTable['DeployTurret', defense]            = "true";
$ObjectiveTable['DeployTurret', assignTimeout]      = "5000";   // period allowed for humans to ack
$ObjectiveTable['DeployTurret', maxAssigned]        = "2";      // not added if at least this many playrs have ack'd

$ObjectiveTable['DeployEquipment', type]               = "AIODeployEquipment";
$ObjectiveTable['DeployEquipment', weightLevel1]       = 2500;
$ObjectiveTable['DeployEquipment', weightLevel2]       = 1000;
$ObjectiveTable['DeployEquipment', weightLevel3]       = 500;
$ObjectiveTable['DeployEquipment', weightLevel4]       = 100;
$ObjectiveTable['DeployEquipment', equipment]          = "InventoryDeployable";
$ObjectiveTable['DeployEquipment', desiredEquipment]   = "InventoryDeployable";
$ObjectiveTable['DeployEquipment', buyEquipmentSet]    = "MediumInventorySet";
$ObjectiveTable['DeployEquipment', offense]            = "false";
$ObjectiveTable['DeployEquipment', defense]            = "true";
$ObjectiveTable['DeployEquipment', assignTimeout]      = "5000";   // period allowed for humans to ack
$ObjectiveTable['DeployEquipment', maxAssigned]        = "2";      // not added if at least this many playrs have ack'd

$ObjectiveTable['BombLocation', type]               = "AIOBombLocation";
$ObjectiveTable['BombLocation', weightLevel1]       = 2500;
$ObjectiveTable['BombLocation', weightLevel2]       = 2500;
$ObjectiveTable['BombLocation', weightLevel3]       = 2500;
$ObjectiveTable['BombLocation', weightLevel4]       = 2500;
$ObjectiveTable['BombLocation', equipment]          = "";
$ObjectiveTable['BombLocation', desiredEquipment]   = "";
$ObjectiveTable['BombLocation', buyEquipmentSet]    = "";
$ObjectiveTable['BombLocation', offense]            = "false";
$ObjectiveTable['BombLocation', defense]            = "false";
$ObjectiveTable['BombLocation', assignTimeout]      = "5000";   // period allowed for humans to ack
$ObjectiveTable['BombLocation', maxAssigned]        = "2";      // not added if at least this many playrs have ack'd

$ObjectiveTable['TakeFlag', type]               = "AIOEscortPlayer";
$ObjectiveTable['TakeFlag', weightLevel1]       = 2500;
$ObjectiveTable['TakeFlag', weightLevel2]       = 1000;
$ObjectiveTable['TakeFlag', weightLevel3]       = 500;
$ObjectiveTable['TakeFlag', weightLevel4]       = 100;
$ObjectiveTable['TakeFlag', equipment]          = "";
$ObjectiveTable['TakeFlag', desiredEquipment]   = "EnergyPack";
$ObjectiveTable['TakeFlag', buyEquipmentSet]    = "LightDefaultSet";
$ObjectiveTable['TakeFlag', offense]            = "true";
$ObjectiveTable['TakeFlag', defense]            = "true";
$ObjectiveTable['TakeFlag', assignTimeout]      = "5000";   // period allowed for humans to ack
$ObjectiveTable['TakeFlag', maxAssigned]        = "0";      // not added if at least this many playrs have ack'd

$ObjectiveTable['GiveFlag', type]               = "AIOEscortPlayer";
$ObjectiveTable['GiveFlag', weightLevel1]       = 2500;
$ObjectiveTable['GiveFlag', weightLevel2]       = 1000;
$ObjectiveTable['GiveFlag', weightLevel3]       = 500;
$ObjectiveTable['GiveFlag', weightLevel4]       = 100;
$ObjectiveTable['GiveFlag', equipment]          = "";
$ObjectiveTable['GiveFlag', desiredEquipment]   = "EnergyPack";
$ObjectiveTable['GiveFlag', buyEquipmentSet]    = "LightDefaultSet";
$ObjectiveTable['GiveFlag', offense]            = "true";
$ObjectiveTable['GiveFlag', defense]            = "true";
$ObjectiveTable['GiveFlag', assignTimeout]      = "5000";   // period allowed for humans to ack
$ObjectiveTable['GiveFlag', maxAssigned]        = "0";      // not added if at least this many playrs have ack'd

$ObjectiveTable['NeedRide', type]               = "AIOEscortPlayer";
$ObjectiveTable['NeedRide', weightLevel1]       = 2500;
$ObjectiveTable['NeedRide', weightLevel2]       = 1000;
$ObjectiveTable['NeedRide', weightLevel3]       = 500;
$ObjectiveTable['NeedRide', weightLevel4]       = 100;
$ObjectiveTable['NeedRide', equipment]          = "";
$ObjectiveTable['NeedRide', desiredEquipment]   = "EnergyPack";
$ObjectiveTable['NeedRide', buyEquipmentSet]    = "LightDefaultSet";
$ObjectiveTable['NeedRide', offense]            = "true";
$ObjectiveTable['NeedRide', defense]            = "true";
$ObjectiveTable['NeedRide', assignTimeout]      = "5000";   // period allowed for humans to ack
$ObjectiveTable['NeedRide', maxAssigned]        = "0";      // not added if at least this many playrs have ack'd

$ObjectiveTable['NeedPassenger', type]               = "AIOEscortPlayer";
$ObjectiveTable['NeedPassenger', weightLevel1]       = 2500;
$ObjectiveTable['NeedPassenger', weightLevel2]       = 1000;
$ObjectiveTable['NeedPassenger', weightLevel3]       = 500;
$ObjectiveTable['NeedPassenger', weightLevel4]       = 100;
$ObjectiveTable['NeedPassenger', equipment]          = "";
$ObjectiveTable['NeedPassenger', desiredEquipment]   = "";
$ObjectiveTable['NeedPassenger', buyEquipmentSet]    = "";
$ObjectiveTable['NeedPassenger', offense]            = "true";
$ObjectiveTable['NeedPassenger', defense]            = "true";
$ObjectiveTable['NeedPassenger', assignTimeout]      = "5000";   // period allowed for humans to ack
$ObjectiveTable['NeedPassenger', maxAssigned]        = "2";      // not added if at least this many playrs have ack'd

//---------------------------------------------------------------------------
// *** temp ai hooks...  are in aiHumanTasks.cs
//---------------------------------------------------------------------------
//---------------------------------------------------------------------------
new SimSet("PendingAIObjectives");
$MAX_OBJECTIVE_ASSIGN_TIMEOUT    = 30000;

//---------------------------------------------------------------------------
function isAIActive(%team)
{
   %count = ClientGroup.getCount();
   for(%i = 0; %i < %count; %i++)
   {
      %client = ClientGroup.getObject(%i);
      if(%client.isAIControlled() && (%client.getSensorGroup() == %team))
         return(true);
   }
   return(false);
}

function humanTeammatesExist(%client)
{
   %team = %client.getSensorGroup();
   %count = ClientGroup.getCount();
   for(%i = 0; %i < %count; %i++)
   {
      %cl = ClientGroup.getObject(%i);
      if(%cl != %client && !%cl.isAIControlled() && (%cl.getSensorGroup() == %team))
         return(true);
   }
   return(false);
}

function AIObjective::assignObjective(%this)
{
   PendingAIObjectives.remove(%this);
   %this.issuedByClientId.currentAIObjective = -1;
   aiAddHumanObjective(%this.issuedByClientId, %this, -1, false);
}

//---------------------------------------------------------------------------
function serverCmdBuildClientTask(%client, %task, %team)
{
   %description = $TaskDescription[getWord(%task, 0)];
   if(%description $= "")
   {
      %client.currentTaskDescription = "";
      return;
   }

   // build an ai objective from this task
   %client.currentAIObjective = -1;
   if(isAIActive(%client.getSensorGroup()))
   {
      %objective = buildAIObjective(%client, %task);
      if(%objective > 0)
      {
         if((%objective.assignTimeout) < 0 || (%objective.assignTimeout > $MAX_OBJECTIVE_ASSIGN_TIMEOUT))
            %objective.assignTimeout = $MAX_OBJECTIVE_ASSIGN_TIMEOUT;

         //add the acknowledge description on to the objective
         %targetId = %client.getTargetId();
         if(%targetId < 0)
            %targetName = "";
         else
         {
            %targetName = getTargetGameName(%targetId);
            if(%targetName $= "")
               return;
         }  
         %objective.ackDescription = buildTaggedString(%description, %targetName);

         //override the assignTimeout if there are no human teammates
         if (!humanTeammatesExist(%client))
            %objective.assignTimeout = 1;
         
			//only send the command to the AI if maxAssigned is > 0
			if (%objective.maxAssigned > 0)
			{
	         PendingAIObjectives.add(%objective);
	         %client.currentAIObjective = %objective;
	         %objective.assignThread = %objective.schedule(%objective.assignTimeout, assignObjective);
			}
      }
   }

   %client.currentTaskIsTeam = %team;
   %client.currentTaskDescription = %description;
}

function serverCmdSendTaskToClientTarget(%client, %clientTargetID)
{
   %targetClient = $TargetToClient[%clientTargetID];
	serverCmdSendTaskToClient(%client, %targetClient, true);
}

function serverCmdSendTaskToClient(%client, %targetClient, %fromCmdMap)
{
   if(!isObject(%targetClient))
      return;

   if(%client.getSensorGroup() != %targetClient.getSensorGroup())
      return;

   if(%client.currentTaskDescription $= "")
      return;

   if(%client.currentTaskIsTeam)
      return;

   if(%targetClient.isAIControlled())
   {
      if(%client.currentAIObjective != -1)
      {
         %objective = aiAddHumanObjective(%client, %client.currentAIObjective, %targetClient, %fromCmdMap);

         if(%objective == %client.currentAIObjective)
         {
            PendingAIObjectives.remove(%client.currentAIObjective);
            cancel(%client.currentAIObjective.assignThread);
         }

         if(%objective > 0)
            %client.currentAIObjective = -1;
      }
   }
   else
   {
      %targetId = %client.getTargetId();
      if(%targetId < 0)
         %targetName = "";
      else
      {
         %targetName = getTargetGameName(%targetId);
         if(%targetName $= "")
            return;
      }  

      commandToClient(%targetClient, 'TaskInfo', %client, -1, false, %client.currentTaskDescription, %targetName);
      commandToClient(%targetClient, 'PotentialTask', %client.name, %client.currentTaskDescription, %targetName);
      %client.sendTargetTo(%targetClient, false);
   }
}

//---------------------------------------------------------------------------
function serverCmdSendTaskToTeam(%client)
{
   if(%client.currentTaskDescription $= "")
      return;

   if(!%client.currentTaskIsTeam)
      return;

   %targetId = %client.getTargetId();

   if(%targetId < 0)
      %targetName = "";
   else
   {
      %targetName = getTargetGameName(%targetId);
      if(%targetName $= "")
         return;
   }  

   %count = ClientGroup.getCount();
   for(%i = 0; %i < %count; %i++)
   {
      %recipient = ClientGroup.getObject(%i);
      if(%recipient.getSensorGroup() == %client.getSensorGroup())
      {
         if(!%recipient.isAIControlled())
         {
            commandToClient(%recipient, 'TaskInfo', %client, %client.currentAIObjective, true, %client.currentTaskDescription, %targetName);
            commandToClient(%recipient, 'PotentialTeamTask', %client.currentTaskDescription, %targetName);

            %client.sendTargetTo(%recipient, false);
         }
      }
   }   
}

//---------------------------------------------------------------------------
function serverCmdAcceptTask(%client, %issueClient, %AIObjective, %description)
{
   if(%client.getSensorGroup() != %issueClient.getSensorGroup())
      return;

   if(%description $= "")
      return;

   // handle an aiobjective:
   if(%AIObjective != -1)
   {
      %count = PendingAIObjectives.getCount();
      for(%i = 0; %i < %count; %i++)
      {
         %obj = PendingAIObjectives.getObject(%i);
         if((%obj == %AIObjective) && (%obj.sensorGroup == %client.getSensorGroup))
         {
            // inc the ack count and remove if past max
            %obj.ackCount++;
            if(%obj.ackCount >= %obj.maxAssigned)
            {
               if(%issueClient.currentAIObjective == %obj)
                  %issueClient.currentAIObjective = -1;
               %obj.delete();
            }
         }
      }
   }

   commandToClient(%issueClient, 'TaskAccepted', %client.name, %description);
   commandToClient(%client, 'TaskInfo', %issueClient, -1, %issueClient.name, %description);
   commandToClient(%client, 'AcceptedTask', %description);
   %client.sendTargetTo(%client, true);

	//audio feedback - if the client is not the issuer...
   if (%client != %issueClient)
   {
	   %wavFile = "~wvoice/" @ %client.voice @ "/cmd.acknowledge.wav";
	   MessageClient(%issueClient, 'MsgTaskCompleted', addTaggedString(%wavFile));
   }
}

function serverCmdDeclineTask(%client, %issueClient, %description, %teamCmd)
{
   if(%client.getSensorGroup() != %issueClient.getSensorGroup())
      return;

   if(%description $= "")
      return;

	//no need to be spammed by the entire team declining your team command
	if (%teamCmd)
		return;

   commandToClient(%issueClient, 'TaskDeclined', %client.name, %description);

	//audio feedback
	%wavFile = "~wvoice/" @ %client.voice @ "/cmd.decline.wav";
	MessageClient(%issueClient, 'MsgTaskCompleted', addTaggedString(%wavFile));
}

function serverCmdCompletedTask(%client, %issueClient, %description)
{
   if(%client.getSensorGroup() != %issueClient.getSensorGroup())
      return;

   if(%description $= "")
      return;

   commandToClient(%issueClient, 'TaskCompleted', %client.name, %description);

	//audio feedback
	%wavFile = "~wvoice/" @ %client.voice @ "/cmd.completed.wav";
	MessageClient(%issueClient, 'MsgTaskCompleted', addTaggedString(%wavFile));
}
   
//---------------------------------------------------------------------------
function buildAIObjective(%client, %command)
{
   %targetId = %client.getTargetId();
   %targetPos = %client.getTargetPos();

   %targetObj = -1;
   if(%targetId != -1)
      %targetObj = getTargetObject(%targetId);

   // create a new objective
   %tableIndex = getWord(%command, 0);
   %objective = new AIObjective($ObjectiveTable[%tableIndex, type])
   {
      dataBlock            = "AIObjectiveMarker";
      weightLevel1         = $ObjectiveTable[%tableIndex, weightLevel1];
      weightLevel2         = $ObjectiveTable[%tableIndex, weightLevel2];
      weightLevel3         = $ObjectiveTable[%tableIndex, weightLevel3];
      weightLevel4         = $ObjectiveTable[%tableIndex, weightLevel4];
      equipment            = $ObjectiveTable[%tableIndex, equipment];
      desiredEquipment     = $ObjectiveTable[%tableIndex, desiredEquipment];
      buyEquipmentSet      = $ObjectiveTable[%tableIndex, buyEquipmentSet];
      offense              = $ObjectiveTable[%tableIndex, offense];
      defense              = $ObjectiveTable[%tableIndex, defense];
      issuedByHuman        = true;
      issuedByClientId     = %client;
      targetObjectId       = %targetObj;
      targetClientId       = %targetObj.client;
      location             = %targetPos;
		position					= %targetPos;
   };

   %objective.assignTimeout = $ObjectiveTable[%tableIndex, assignTimeout];
   %objective.maxAssigned = $ObjectiveTable[%tableIndex, maxAssigned];
   %objective.ackCount = 0;
   %objective.sensorGroup = %client.getSensorGroup();

   MissionCleanup.add(%objective);
   return(%objective);
}

//-----------------------------------------------------------------------------
//VOICE command hooks here...
function findClientInView(%client, %maxDist)
{
	//make sure the player is alive
	if (!AIClientIsAlive(%client))
		return -1;

	//get various info about the player's eye
	%srcEyeTransform = %client.player.getEyeTransform();
	%srcEyePoint = firstWord(%srcEyeTransform) @ " " @ getWord(%srcEyeTransform, 1) @ " " @ getWord(%srcEyeTransform, 2);
	%srcEyeVector = VectorNormalize(%client.player.getEyeVector());

   //see if there's an enemy near our defense location...
   %clientCount = 0;
   %count = ClientGroup.getCount();
   %viewedClient = -1;
   %clientDot = -1;
   for(%i = 0; %i < %count; %i++)
   {
		%cl = ClientGroup.getObject(%i);

		//make sure we find an AI who's alive and not the client
		if (%cl != %client && isObject(%cl.player) && %cl.team == %client.team)
		{
			//make sure the player is within range
		   %clPos = %cl.player.getWorldBoxCenter();
		   %distance = VectorDist(%clPos, %srcEyePoint);
			if (%distance <= %maxDist)
			{
				//create the vector from the client to the client
				%clVector = VectorNormalize(VectorSub(%clPos, %srcEyePoint));

				//see if the dot product is greater than our current, and greater than 0.6
				%dot = VectorDot(%clVector, %srcEyeVector);

				if (%dot > 0.6 && %dot > %clientDot)
				{
					//make sure we're not looking through walls...
					%mask = $TypeMasks::TerrainObjectType | $TypeMasks::InteriorObjectType | $TypeMasks::StaticShapeObjectType;
					%losResult = containerRayCast(%srcEyePoint, %clPos, %mask);
					%losObject = GetWord(%losResult, 0);
					if (!isObject(%losObject))
					{
						%viewedClient = %cl;
						%clientDot = %dot;
					}
				}
			}
		}
   }
   
   return %viewedClient;
}

function findTargetInView(%client, %maxDist)
{
   if (!AIClientIsAlive(%client))
      return -1;

   // look from player's eye position for objects
   %mask = $TypeMasks::TerrainObjectType | $TypeMasks::InteriorObjectType | $TypeMasks::StaticShapeObjectType | $TypeMasks::GameBaseObjectType;
   %eyeVec = %client.player.getEyeVector();
   %eyeTrans = %client.player.getEyeTransform();
   %eyePos = posFromTransform(%eyeTrans);
   %nEyeVec = VectorNormalize(%eyeVec);
   %scEyeVec = VectorScale(%nEyeVec, %maxDist);
   %eyeStart = VectorAdd(%eyePos, VectorScale(%nEyeVec, 1));
   %eyeEnd = VectorAdd(%eyePos, %scEyeVec);
   %losResult = containerRayCast(%eyeStart, %eyeEnd, %mask);
   %losObject = GetWord(%losResult, 0);
   if (!isObject(%losObject) || !(%losObject.getType() & $TypeMasks::GameBaseObjectType) || %losObject.getTarget() == -1)
      return -1;
   else
      return %losObject;
}

//-----------------------------------------------------------------------------------------------------
//It would be nice to create server tasks for these voice commands

// installChatItem( 'ChatCmdDefendCarrier', "Cover our flag carrier!", "def.carrier", true );
// installChatItem( 'ChatCmdAttackFlag', "Get the enemy flag!", "att.flag", true );
// installChatItem( 'ChatCmdAttackGenerator', "Destroy the enemy generator!", "att.generator", true );
// installChatItem( 'ChatCmdAttackVehicle', "Destroy the enemy vehicle!", "att.vehicle", true );
// 
// installChatItem( 'ChatCmdDefendCarrier', "Cover our flag carrier!", "def.carrier", true );
// installChatItem( 'ChatCmdDefendFlag', "Defend our flag!", "def.flag", true );
// installChatItem( 'ChatCmdDefendGenerator', "Protect the generator!", "def.generator", true );
// installChatItem( 'ChatCmdDefendSensors', "Defend our sensors!", "def.sensors", true );
// installChatItem( 'ChatCmdDefendTurrets', "Defend our turrets!", "def.turrets", true );
// installChatItem( 'ChatCmdDefendVehicle', "Defend our vehicle!", "def.vehicle", true );
// installChatItem( 'ChatCmdDefendNexus', "Defend the nexus!", "def.nexus", true );
// 
// installChatItem( 'ChatCmdGiveMeFlag', "Give me the flag!", "flg.give", true );
// installChatItem( 'ChatCmdReturnFlag', "Retrieve our flag!", "flg.retrieve", true );
// installChatItem( 'ChatCmdTakeFlag', "Take the flag from me!", "flg.take", true );
// installChatItem( 'ChatCmdHunterGiveFlags', "Give your flags to me!", "flg.huntergive", true );
// installChatItem( 'ChatCmdHunterTakeFlags', "Take my flags!", "flg.huntertake", true );
//-----------------------------------------------------------------------------------------------------

$LookAtClientDistance = 35;
$LookAtObjectDistance = 400;
function CreateVoiceServerTask(%client, %cmdCode)
{
   //switch on the different voice binds we can create a task for:
   %losObj = findTargetInView(%client, $LookAtObjectDistance);
   %targetClient = findClientInView(%client, $LookAtClientDistance);
   %cmdSent = false;
   switch$ (%cmdCode)
   {
		//these have an object as the target of the command
      case 'ChatRepairBase':
         if (isObject(%losObj) && %losObj.getDamagePercent() > 0 && isTargetFriendly(%losObj.getTarget(), %client.getSensorGroup()))
         {
            %client.setTargetId(%losObj.getTarget());
            %client.setTargetPos(%losObj.position);
            serverCmdBuildClientTask(%client, 'RepairObject', true);
            serverCmdSendTaskToTeam(%client);
            %cmdSent = true;
         }

      case 'ChatRepairGenerator':
         if (isObject(%losObj) && %losObj.getDamagePercent() > 0 && isTargetFriendly(%losObj.getTarget(), %client.getSensorGroup()))
         {
            //make sure the target actually is a generator
            if (%losObj.getDataBlock().getName() $= "GeneratorLarge" || %losObj.getDataBlock().getName() $= "SolarPanel")
            {
               %client.setTargetId(%losObj.getTarget());
               %client.setTargetPos(%losObj.position);
               serverCmdBuildClientTask(%client, 'RepairObject', true);
               serverCmdSendTaskToTeam(%client);
               %cmdSent = true;
            }
         }

      case 'ChatRepairSensors':
         if (isObject(%losObj) && %losObj.getDamagePercent() > 0 && isTargetFriendly(%losObj.getTarget(), %client.getSensorGroup()))
         {
            //make sure the target actually is a sensor
            if (%losObj.getDataBlock().getName() $= "SensorLargePulse" || %losObj.getDataBlock().getName() $= "SensorMediumPulse")
            {
               %client.setTargetId(%losObj.getTarget());
               %client.setTargetPos(%losObj.position);
               serverCmdBuildClientTask(%client, 'RepairObject', true);
               serverCmdSendTaskToTeam(%client);
               %cmdSent = true;
            }
         }

      case 'ChatRepairTurrets':
         if (isObject(%losObj) && %losObj.getDamagePercent() > 0 && isTargetFriendly(%losObj.getTarget(), %client.getSensorGroup()))
         {
            //make sure the target actually is a turret
            if (%losObj.getDataBlock().getName() $= "TurretBaseLarge" || %losObj.getDataBlock().getName() $= "TurretDeployedFloorIndoor" ||
                  %losObj.getDataBlock().getName() $= "TurretDeployedWallIndoor" || %losObj.getDataBlock().getName() $= "TurretDeployedCeilingIndoor" ||
                  %losObj.getDataBlock().getName() $= "TurretDeployedOutdoor" || %losObj.getDataBlock().getName() $= "SentryTurret")
            {
               %client.setTargetId(%losObj.getTarget());
               %client.setTargetPos(%losObj.position);
               serverCmdBuildClientTask(%client, 'RepairObject', true);
               serverCmdSendTaskToTeam(%client);
               %cmdSent = true;
            }
         }

      case 'ChatRepairVehicle':
         if (isObject(%losObj) && %losObj.getDamagePercent() > 0 && isTargetFriendly(%losObj.getTarget(), %client.getSensorGroup()))
         {
            //make sure the target actually is a vehicle station
            if (%losObj.getDataBlock().getName() $= "StationVehicle")
            {
               %client.setTargetId(%losObj.getTarget());
               %client.setTargetPos(%losObj.position);
               serverCmdBuildClientTask(%client, 'RepairObject', true);
               serverCmdSendTaskToTeam(%client);
               %cmdSent = true;
            }
         }

      case 'ChatCmdTargetBase' or 'ChatTargetNeed':
         if (isObject(%losObj) && %losObj.getDamagePercent() < 1 && !isTargetFriendly(%losObj.getTarget(), %client.getSensorGroup()))
         {
            %client.setTargetId(%losObj.getTarget());
            %client.setTargetPos(%losObj.position);
            serverCmdBuildClientTask(%client, 'LazeObject', true);
            serverCmdSendTaskToTeam(%client);
            %cmdSent = true;
         }

      case 'ChatCmdTargetTurret':
         if (isObject(%losObj) && %losObj.getDamagePercent() < 1 && !isTargetFriendly(%losObj.getTarget(), %client.getSensorGroup()))
         {
            //make sure the target actually is a turret
            if (%losObj.getDataBlock().getName() $= "TurretBaseLarge" || %losObj.getDataBlock().getName() $= "TurretDeployedFloorIndoor" ||
                  %losObj.getDataBlock().getName() $= "TurretDeployedWallIndoor" || %losObj.getDataBlock().getName() $= "TurretDeployedCeilingIndoor" ||
                  %losObj.getDataBlock().getName() $= "TurretDeployedOutdoor" || %losObj.getDataBlock().getName() $= "SentryTurret")
            {
               %client.setTargetId(%losObj.getTarget());
               %client.setTargetPos(%losObj.position);
               serverCmdBuildClientTask(%client, 'LazeObject', true);
               serverCmdSendTaskToTeam(%client);
               %cmdSent = true;
            }
         }

      case 'ChatCmdTargetSensors':
         if (isObject(%losObj) && %losObj.getDamagePercent() < 1 && !isTargetFriendly(%losObj.getTarget(), %client.getSensorGroup()))
         {
            //make sure the target actually is a sensor
            if (%losObj.getDataBlock().getName() $= "SensorLargePulse" || %losObj.getDataBlock().getName() $= "SensorMediumPulse")
            {
               %client.setTargetId(%losObj.getTarget());
               %client.setTargetPos(%losObj.position);
               serverCmdBuildClientTask(%client, 'LazeObject', true);
               serverCmdSendTaskToTeam(%client);
               %cmdSent = true;
            }
         }

      case 'ChatTargetFire':
         if (isObject(%losObj) && %losObj.getDamagePercent() < 1 && !isTargetFriendly(%losObj.getTarget(), %client.getSensorGroup()))
         {
            %client.setTargetId(%losObj.getTarget());
            %client.setTargetPos(%losObj.position);
            serverCmdBuildClientTask(%client, 'mortarObject', true);
            serverCmdSendTaskToTeam(%client);
            %cmdSent = true;
         }

      case 'ChatCmdAttackSensors':
         if (isObject(%losObj) && %losObj.getDamagePercent() < 1 && !isTargetFriendly(%losObj.getTarget(), %client.getSensorGroup()))
         {
            //make sure the target actually is a sensor
            if (%losObj.getDataBlock().getName() $= "SensorLargePulse" || %losObj.getDataBlock().getName() $= "SensorMediumPulse")
            {
               %client.setTargetId(%losObj.getTarget());
               %client.setTargetPos(%losObj.position);
               serverCmdBuildClientTask(%client, 'mortarObject', true);
               serverCmdSendTaskToTeam(%client);
               %cmdSent = true;
            }
         }

      case 'ChatCmdAttackTurrets':
         if (isObject(%losObj) && %losObj.getDamagePercent() < 1 && !isTargetFriendly(%losObj.getTarget(), %client.getSensorGroup()))
         {
            //make sure the target actually is a turret
            if (%losObj.getDataBlock().getName() $= "TurretBaseLarge")
            {
               %client.setTargetId(%losObj.getTarget());
               %client.setTargetPos(%losObj.position);
               serverCmdBuildClientTask(%client, 'mortarObject', true);
               serverCmdSendTaskToTeam(%client);
               %cmdSent = true;
            }
         }

      case 'ChatCmdDefendBase':
         if (isObject(%losObj) && isTargetFriendly(%losObj.getTarget(), %client.getSensorGroup()))
         {
            %client.setTargetId(%losObj.getTarget());
            %client.setTargetPos(%losObj.position);
            serverCmdBuildClientTask(%client, 'DefendLocation', true);
            serverCmdSendTaskToTeam(%client);
            %cmdSent = true;
         }

      case 'ChatCmdDefendGenerator':
         if (isObject(%losObj) && isTargetFriendly(%losObj.getTarget(), %client.getSensorGroup()))
         {
            //make sure the target actually is a generator
            if (%losObj.getDataBlock().getName() $= "GeneratorLarge" || %losObj.getDataBlock().getName() $= "SolarPanel")
            {
               %client.setTargetId(%losObj.getTarget());
               %client.setTargetPos(%losObj.position);
               serverCmdBuildClientTask(%client, 'DefendLocation', true);
               serverCmdSendTaskToTeam(%client);
               %cmdSent = true;
            }
         }

      case 'ChatCmdDefendSensors':
         if (isObject(%losObj) && isTargetFriendly(%losObj.getTarget(), %client.getSensorGroup()))
         {
            //make sure the target actually is a sensor
            if (%losObj.getDataBlock().getName() $= "SensorLargePulse" || %losObj.getDataBlock().getName() $= "SensorMediumPulse")
            {
               %client.setTargetId(%losObj.getTarget());
               %client.setTargetPos(%losObj.position);
               serverCmdBuildClientTask(%client, 'DefendLocation', true);
               serverCmdSendTaskToTeam(%client);
               %cmdSent = true;
            }
         }

      case 'ChatCmdDefendTurrets':
         if (isObject(%losObj) && isTargetFriendly(%losObj.getTarget(), %client.getSensorGroup()))
         {
            //make sure the target actually is a turret
            if (%losObj.getDataBlock().getName() $= "TurretBaseLarge" || %losObj.getDataBlock().getName() $= "TurretDeployedFloorIndoor" ||
                  %losObj.getDataBlock().getName() $= "TurretDeployedWallIndoor" || %losObj.getDataBlock().getName() $= "TurretDeployedCeilingIndoor" ||
                  %losObj.getDataBlock().getName() $= "TurretDeployedOutdoor" || %losObj.getDataBlock().getName() $= "SentryTurret")
            {              
               %client.setTargetId(%losObj.getTarget());
               %client.setTargetPos(%losObj.position);
               serverCmdBuildClientTask(%client, 'DefendLocation', true);
               serverCmdSendTaskToTeam(%client);
               %cmdSent = true;
            }
         }

      case 'ChatCmdDefendVehicle':
         if (isObject(%losObj) && isTargetFriendly(%losObj.getTarget(), %client.getSensorGroup()))
         {
            //make sure the target actually is a vehicle station
            if (%losObj.getDataBlock().getName() $= "StationVehicle")
            {
               %client.setTargetId(%losObj.getTarget());
               %client.setTargetPos(%losObj.position);
               serverCmdBuildClientTask(%client, 'DefendLocation', true);
               serverCmdSendTaskToTeam(%client);
               %cmdSent = true;
            }
         }

      //this one is special, it will create a task for the issuer instead of the person you're looking at...
      case 'ChatTaskCover':
         %cmdSent = true;
         if (AIClientIsAlive(%targetClient) && %targetClient.team == %client.team)
         {
            %client.setTargetId(%targetClient.player.getTarget());
            %client.setTargetPos(%targetClient.player.position);

            //build and send the command to the target player
            serverCmdBuildClientTask(%client, 'EscortPlayer', false);
            serverCmdSendTaskToClient(%client, %client, false);
				serverCmdAcceptTask(%client, %client, -1, "Escort player" SPC getTaggedString(%targetClient.name));
         }

		//These all have the speaker as the target of the command
      case 'ChatCmdDefendMe' or 'ChatHelp' or 'ChatNeedCover':
         %client.setTargetId(%client.player.getTarget());
         %client.setTargetPos(%client.player.position);
         %cmdSent = true;
         if (AIClientIsAlive(%targetClient))
         {
            //build and send the command to the target player
            serverCmdBuildClientTask(%client, 'EscortPlayer', false);
            serverCmdSendTaskToClient(%client, %targetClient, false);
         }
         else
         {
            serverCmdBuildClientTask(%client, 'EscortPlayer', true);
            serverCmdSendTaskToTeam(%client);
         }

      case 'ChatRepairMe':
         if (%client.player.getDamagePercent() > 0)
         {
	         %client.setTargetId(%client.player.getTarget());
	         %client.setTargetPos(%client.player.position);
            %cmdSent = true;
	         if (AIClientIsAlive(%targetClient))
	         {
	            //build and send the command to the target player
	            serverCmdBuildClientTask(%client, 'RepairPlayer', false);
	            serverCmdSendTaskToClient(%client, %targetClient, false);
	         }
	         else
	         {
	            serverCmdBuildClientTask(%client, 'RepairPlayer', true);
	            serverCmdSendTaskToTeam(%client);
	         }
			}

      case 'ChatFlagGotIt':
         //send this only to the AI we're controlling...
         %cmdSent = true;
         if (aiHumanHasControl(%client, %client.controlAI))
         {
            %client.setTargetId(%client.player.getTarget());
            %client.setTargetPos(%client.player.position);
            serverCmdBuildClientTask(%client, 'EscortPlayer', false);
            serverCmdSendTaskToClient(%client, %client.controlAI, false);
         }

      case 'ChatCmdTakeFlag' or 'ChatCmdHunterTakeFlags':
         %client.setTargetId(%client.player.getTarget());
         %client.setTargetPos(%client.player.position);
         %cmdSent = true;
         if (AIClientIsAlive(%targetClient))
         {
            //build and send the command to the target player
            serverCmdBuildClientTask(%client, 'TakeFlag', false);
            serverCmdSendTaskToClient(%client, %targetClient, false);
         }
         else
         {
            serverCmdBuildClientTask(%client, 'TakeFlag', true);
            serverCmdSendTaskToTeam(%client);
         }

      case 'ChatCmdGiveMeFlag' or 'ChatCmdHunterGiveFlags':
         %client.setTargetId(%client.player.getTarget());
         %client.setTargetPos(%client.player.position);
         %cmdSent = true;
         if (AIClientIsAlive(%targetClient))
         {
         	if (!%targetClient.isAIControlled())
	         {
	            //build and send the command to the target player
	            serverCmdBuildClientTask(%client, 'GiveFlag', false);
	            serverCmdSendTaskToClient(%client, %targetClient, false);
	         }
				else
				{
	            //send the response to the ai...
	            AIRespondToEvent(%client, %cmdCode, %targetClient);
				}
			}
         else
         {
            serverCmdBuildClientTask(%client, 'GiveFlag', true);
            serverCmdSendTaskToTeam(%client);
         }

		case 'ChatNeedDriver' or 'ChatNeedPilot' or 'ChatNeedRide' or 'ChatNeedHold':
         %client.setTargetId(%client.player.getTarget());
         %client.setTargetPos(%client.player.position);
         %cmdSent = true;
         if (AIClientIsAlive(%targetClient) && !%targetClient.isAIControlled())
         {
            //build and send the command to the target player
            serverCmdBuildClientTask(%client, 'NeedRide', false);
            serverCmdSendTaskToClient(%client, %targetClient, false);
         }
         else
         {
            serverCmdBuildClientTask(%client, 'NeedRide', true);
            serverCmdSendTaskToTeam(%client);
         }

		//vehicle passengers - these commands are for either air or ground
		case 'ChatNeedEscort' or 'ChatNeedPassengers' or 'ChatNeedBombardier' or 'ChatNeedSupport' or 'ChatNeedTailgunner':
         %client.setTargetId(%client.player.getTarget());
         %client.setTargetPos(%client.player.position);
         %cmdSent = true;
			//find out if the client is in a ground vehicle or not...
         if (AIClientIsAlive(%targetClient) && !%targetClient.isAIControlled())
         {
            //build and send the command to the target player
            serverCmdBuildClientTask(%client, 'NeedPassenger', false);
            serverCmdSendTaskToClient(%client, %targetClient, false);
         }
         else
         {
            serverCmdBuildClientTask(%client, 'NeedPassenger', true);
            serverCmdSendTaskToTeam(%client);
         }

      default:
         %cmdSent = true;
         if (AIClientIsAlive(%targetClient) && %targetClient.isAIControlled())
         {
            //the bot should detect the client
            %targetClient.clientDetected(%client);

            //only respond if the client is on the same team
            AIRespondToEvent(%client, %cmdCode, %targetClient);
         }
   }

   //handle any rejected commands by the bots
   if (!%cmdSent && isObject(%targetClient) && %targetClient.isAIControlled())
   {
		schedule(250, %client.player, "AIPlayAnimSound", %targetClient, %client.player.getWorldBoxCenter(), "cmd.decline", -1, -1, 0);
      schedule(2000, %client.player, "AIRespondToEvent", %client, 'ChatCmdWhat', %targetClient);
   }
}

