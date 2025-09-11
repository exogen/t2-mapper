
function aiAddHumanObjective(%client, %objective, %targetClient, %fromCmdMap)
{
	//first, make sure the objective Q for the given team exists
	if (!isObject($ObjectiveQ[%client.team]))
		return 0;

	//if a target client is specified, create a link if we can...
	if (%targetClient > 0)
	{
		if (aiHumanHasControl(%client, %targetClient) || (%targetClient.isAIControlled() && !aiAlreadyControlled(%targetClient)))
			aiSetHumanControl(%client, %targetClient);
		else
			return 0;
	}

	//special (hacky) case here for AIOBombLocation objectives
	if (%objective.getName() $= "AIOBombLocation")
	{
		if (!isObject($AIBombLocationSet))
			return 0;

		%objective.team = %client.team;
		$AIBombLocationSet.add(%objective);
		return %objective;
	}

	//parse the type of objective, and see if it already exists...
	%useThisObjective = -1;
	%objQ = $ObjectiveQ[%client.team];
	if (%objective.getName() $= "AIOEscortPlayer" || %objective.getName() $= "AIOAttackPlayer")
	{
		//first, make sure the objective is legit
		if (!AIClientIsAlive(%objective.targetClientId))
			return 0;

		//fill in the description:
		%objective.description = %objective.getName() SPC getTaggedString(%objective.targetClientId.name);

		//now see if the objective already exists...
		%count = %objQ.getCount();
		for (%i = 0; %i < %count; %i++)
		{
			%obj = %objQ.getObject(%i);
			if (%obj.getName() $= %objective.getName())
			{
				//if we've found a previously existing version, use it instead of the new objective
				if (%obj.issuedByClientId == %client && %obj.targetClientId == %objective.targetClientId)
				{
					%useThisObjective = %obj;
					break;
				}
			}
		}
	}

	else if (%objective.getName() $= "AIODefendLocation" || %objective.getName() $= "AIOAttackLocation")
	{
		//make sure it's a valid objective
		if (%objective.location $= "" || %objective.location $= "0 0 0")
			return 0;

		//fill in the description:
		%objective.description = %objective.getName() @ " at" SPC %objective.location;

		//look for a duplicate...
		%count = %objQ.getCount();
		for (%i = 0; %i < %count; %i++)
		{
			%obj = %objQ.getObject(%i);
			if (%obj.getName() $= %objective.getName())
			{
				if (%obj.issuedByClientId == %client && VectorDist(%objective.location, %obj.location) < 30)
				{
					%useThisObjective = %obj;
					break;
				}
			}
		}
	}

	else if (%objective.getName() $= "AIOAttackObject" || %objective.getName() $= "AIORepairObject" ||
				%objective.getName() $= "AIOLazeObject" || %objective.getName() $= "AIOMortarObject" ||
				%objective.getName() $= "AIOTouchObject")
	{
		//make sure it's a valid objective
		if (!isObject(%objective.targetObjectId))
			return 0;

		//fill in the description:
		%objective.description = %objective.getName() SPC %objective.targetObjectId.getDataBlock().getName();

		//look for a duplicate...
		%count = %objQ.getCount();
		for (%i = 0; %i < %count; %i++)
		{
			%obj = %objQ.getObject(%i);
			if (%obj.getName() $= %objective.getName())
			{
				if (%obj.issuedByClientId == %client && %objective.targetObjectId == %obj.targetObjectId)
				{
					%useThisObjective = %obj;
					break;
				}
			}
		}
	}
	else if (%objective.getName() $= "AIODeployEquipment")
	{
		//make sure it's a valid objective
		if (%objective.location $= "" || %objective.location $= "0 0 0" || %objective.equipment $= "")
			return 0;

		//fill in the description:
		%objective.description = %objective.getName() SPC %objective.equipment SPC "at" SPC %objective.location;

		//look for a duplicate...
		%count = %objQ.getCount();
		for (%i = 0; %i < %count; %i++)
		{
			%obj = %objQ.getObject(%i);
			if (%obj.getName() $= %objective.getName())
			{
				if (%obj.issuedByClientId == %client && VectorDist(%objective.location, %obj.location) < 8 && %objective.equipment == %obj.equipment)
				{
					%useThisObjective = %obj;
					break;
				}
			}
		}
	}

	//if we found a previously added objective, delete the submitted one
	if (%useThisObjective > 0)
	{
		%objective.delete();
	}

	//otherwise add it to the objective Q
	else
	{
		%useThisObjective = %objective;
	 	$ObjectiveQ[%client.team].add(%useThisObjective);
      %objective.shouldAcknowledge = true;
		//now that it's been added, see if anyone picks it up within 10 seconds
		schedule(10000, %objective, "AIReassessHumanObjective", %objective); 
	}

	//now see if we're supposed to force the target to the objective
	//the link will have already been checked at the top...
	if (%targetClient > 0)
	{
		//if we were previously assigned to an objective which was forced on this client, we need to delete it...
		%prevObjective = %targetClient.objective;
		if (%prevObjective != %useThisObjective && %prevObjective.issuedByClientId == %targetClient.controlByHuman)
		{
	      AIClearObjective(%prevObjective);
	      %prevObjective.delete();
		}

		//if the command is an escort command, issue it at the forced escort weight instead
		%forcedWeight = $AIWeightHumanIssuedCommand;
		if (%useThisObjective.getName() $= "AIOEscortPlayer")
			%forcedWeight = $AIWeightHumanIssuedEscort;

		//reweight the client's objective
		%testWeight = 0;
		if (isObject(%client.objective))
			%testWeight = %client.objective.weight(%client, %client.objectiveLevel, 0, %inventoryStr);
		if (%testWeight <= 0 || %testWeight > %client.objectiveWeight)
			%client.objectiveWeight = %testWeight;

		//see if we should force the objective
		if (%targetClient.objectiveWeight <= %forcedWeight)
		{
			AIForceObjective(%targetClient, %useThisObjective, %forcedWeight);

			//clearing the prev objective will undo the link - re-do it here
			aiSetHumanControl(%client, %targetClient);

			//send the "command accepted response"
			if (!%fromCmdMap)
			{
				if (isObject(%client.player) && VectorDist(%targetClient.player.position, %client.player.position) <= 40)
				   schedule(250, %targetClient.player, "AIPlayAnimSound", %targetClient, %client.player.getWorldBoxCenter(), "cmd.acknowledge", 1, 1, 0);
			}
			else
				serverCmdAcceptTask(%targetClient, %client, -1, %useThisObjective.ackDescription);
		}
		else
		{
			//send the "command declined response"
			if (!%fromCmdMap)
			{
				if (isObject(%client.player) && VectorDist(%targetClient.player.position, %client.player.position) <= 40)
            {
				   schedule(250, %targetClient.player, "AIPlayAnimSound", %targetClient, %client.player.getWorldBoxCenter(), "cmd.decline", -1, -1, 0);
               schedule(2000, %client.player, "AIRespondToEvent", %client, 'ChatCmdWhat', %targetClient);
            }
			}
			else
				serverCmdDeclineTask(%targetClient, %client, %useThisObjective.ackDescription);
		}
	}

	//return the objective used, so the calling function can know whether to delete the parameter one...
	return %useThisObjective;
}

function AIReassessHumanObjective(%objective)
{
	if (%objective.issuedByHuman)
	{
		//see if there's anyone still assigned to this objective
		if (!AIClientIsAlive(%objective.clientLevel1) && !AIClientIsAlive(%objective.clientLevel2) && !AIClientIsAlive(%objective.clientLevel3))
		{
			AIClearObjective(%objective);
			%objective.delete();
		}

		//else reassess this objective in another 10 seconds
		else
			schedule(10000, %objective, "AIReassessHumanObjective", %objective); 
	}
}

function aiAttemptHumanControl(%humanClient, %aiClient)
{
	if (!aiAlreadyControlled(%aiClient))
	{
		aiSetHumanControl(%humanClient, %aiClient);
		return true;
	}
	else
		return false;
}

function aiHumanHasControl(%humanClient, %aiClient)
{
	if (AIClientIsAlive(%humanClient) && AIClientIsAlive(%aiClient))
		if (%humanClient.controlAI == %aiClient && %aiClient.controlByHuman == %humanClient)
			return true;

	return false;
}

function aiAlreadyControlled(%aiClient)
{
	if (AIClientIsAlive(%aiClient) && AIClientIsAlive(%aiClient.controlByHuman))
		if (%aiClient.controlByHuman.controlAI == %aiClient)
			return true;

	return false;
}

function aiReleaseHumanControl(%humanClient, %aiClient)
{
	//make sure they were actually linked
	if (!aiHumanHasControl(%humanClient, %aiClient))
		return;

	aiBreakHumanControl(%humanClient, %aiClient);
}

function aiSetHumanControl(%humanClient, %aiClient)
{
	//make sure it's from a human to an ai
	if (%humanClient.isAIControlled() || !%aiClient.isAIControlled())
		return;

	//these checks should be redundant, but...
	if (%humanClient.controlAI > 0)
		aiBreakHumanControl(%humanClient, %humanClient.controlAI);

	if (%aiClient.controlByHuman > 0)
		aiBreakHumanControl(%aiClient.controlByHuman, %aiClient);

	//create the link
	%humanClient.controlAI = %aiClient;
	%aiClient.controlByHuman = %humanClient;
}

function aiBreakHumanControl(%humanClient, %aiClient)
{
	//make sure they were actually linked
	if (!aiHumanHasControl(%humanClient, %aiClient))
		return;

	//for now, just break the link, and worry about unassigning objectives later...
	%humanClient.controlAI = "";
	%aiClient.controlByHuman = "";
}