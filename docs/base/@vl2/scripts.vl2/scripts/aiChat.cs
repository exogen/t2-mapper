//------------------------------
//AI Message functions

function AIFindCommanderAI(%omitClient)
{
	%count = ClientGroup.getCount();
	for (%i = 0; %i < %count; %i++)
	{
		%client = ClientGroup.getObject(%i);
		if (%client != %omitClient && AIClientIsAlive(%client) && %client.isAIControlled())
			return %client;
 	}

	//didn't find anyone
	return -1;
}

$AIMsgThreadId = 0;
$AIMsgThreadActive = false;

$AIMsgThreadIndex = 0;
$AIMsgThreadDelay = 0;
$AIMsgThreadTable[0] = "";

function AIProcessMessageTable(%threadId)
{
	//make sure we're still on the same thread
	if (%threadId != $AIMsgThreadId)
		return;

	//get the speaker, the message, and the delay
	%speaker = getWord($AIMsgThreadTable[$AIMsgThreadIndex], 0);
	%msg = getWord($AIMsgThreadTable[$AIMsgThreadIndex], 1);
	%delay = getWord($AIMsgThreadTable[$AIMsgThreadIndex], 2);

	//make sure the speaker is still alive
	if (%speaker $= "" || ! AIClientIsAlive(%speaker, $AIMsgThreadDelay))
		AIEndMessageThread(%threadId);
	else
	{
		//play the msg, schedule the next msg, and increment the index
      %tag = addTaggedString( %msg );
		serverCmdCannedChat(%speaker, %tag, true);
      removeTaggedString( %tag );
		schedule(%delay, 0, "AIProcessMessageTable", %threadId);
		$AIMsgThreadDelay = %delay;
		$AIMsgThreadIndex++;
	}
}

function AIEndMessageThread(%threadId)
{
	if (%threadId == $AIMsgThreadId)
		$AIMsgThreadActive = false;
}

function AIMessageThreadTemplate(%type, %msg, %clSpeaker, %clListener)
{
	//abort if AI chat has been disabled
	if ($AIDisableChat)
		return;

	//initialize the params
	if (%clListener $= "")
		%clListener = 0;

	//abort if we're already in a thread
	if ($AIMsgThreadActive)
		return;

	//initialize the new thread vars
	$AIMsgThreadId++;
	$AIMsgThreadActive = true;
	$AIMsgThreadIndex = 0;
	$AIMsgThreadTable[1] = "";

	switch$ (%type)
	{
		case "DefendBase":
			if (%clListener < 0)
				%clListener = AIFindCommanderAI(%clSpeaker);

			if (%clListener > 0)
			{
				//we have two people, create a semi-random conversation:
				%index = -1;

				//see if we issue a command first
				if (getRandom() < 0.30)
				{
					//which version of "defend our base"?
					%randNum = getRandom();
					if (%randNum < 0.33)
						$AIMsgThreadTable[%index++] = %clListener @ " ChatCmdDefendBase " @ 1250;
					else if (%randNum < 0.66)
						$AIMsgThreadTable[%index++] = %clListener @ " ChatCmdDefendReinforce " @ 1500;
					else
						$AIMsgThreadTable[%index++] = %clListener @ " ChatCmdDefendEntrances " @ 1250;

					//do we acknowledge the command first?
					if (getRandom() < 0.5)
					{
						if (getRandom() < 0.5)
							$AIMsgThreadTable[%index++] = %clSpeaker @ " ChatCmdAcknowledged " @ 1500;
						else
							$AIMsgThreadTable[%index++] = %clSpeaker @ " ChatTeamYes " @ 1500;
					}
				}

				//the actual msg to be used
				$AIMsgThreadTable[%index++] = %clSpeaker @ " " @ %msg @ " " @ 1750;
					 
				//do we say "thanks"?
				if (getRandom() < 0.3)
				{
					$AIMsgThreadTable[%index++] = %clListener @ " ChatTeamThanks " @ 1000;

					//do we say "you're welcom?"
					if (getRandom() < 0.5)
						$AIMsgThreadTable[%index++] = %clSpeaker @ " ChatWelcome " @ 1500;
				}	

				//end the thread
				$AIMsgThreadTable[%index++] = "";
			}
			else
			{
				//just stick with the original
				$AIMsgThreadTable[0] = %clSpeaker @ " " @ %msg @ " " @ 1750;
			}

			//now process the table
			AIProcessMessageTable($AIMsgThreadId);

		case "AttackBase":
			if (%clListener < 0)
				%clListener = AIFindCommanderAI(%clSpeaker);

			if (%clListener > 0)
			{
				//we have two people, create a semi-random conversation:
				%index = -1;

				//see if we issue a command first
				if (getRandom() < 0.30)
				{
					//which version of "attack the enemy base"?
					%randNum = getRandom();
					if (%randNum < 0.33)
						$AIMsgThreadTable[%index++] = %clListener @ " ChatCmdAttack " @ 1250;
					else if (%randNum < 0.66)
						$AIMsgThreadTable[%index++] = %clListener @ " ChatCmdAttackBase " @ 1500;
					else
						$AIMsgThreadTable[%index++] = %clListener @ " ChatCmdAttackReinforce " @ 1250;

					//do we acknowledge the command first?
					if (getRandom() < 0.5)
					{
						if (getRandom() < 0.5)
							$AIMsgThreadTable[%index++] = %clSpeaker @ " ChatCmdAcknowledged " @ 1500;
						else
							$AIMsgThreadTable[%index++] = %clSpeaker @ " ChatTeamYes " @ 1500;
					}
				}

				//the actual msg to be used
				$AIMsgThreadTable[%index++] = %clSpeaker @ " " @ %msg @ " " @ 1750;

				//do we say "thanks"?
				if (getRandom() < 0.3)
				{
					$AIMsgThreadTable[%index++] = %clListener @ " ChatTeamThanks " @ 1000;

					//do we say "you're welcom?"
					if (getRandom() < 0.5)
						$AIMsgThreadTable[%index++] = %clSpeaker @ " ChatWelcome " @ 1500;
				}	

				//end the thread
				$AIMsgThreadTable[%index++] = "";
			}
			else
			{
				//just stick with the original
				$AIMsgThreadTable[0] = %clSpeaker @ " " @ %msg @ " " @ 1750;
			}

			//now process the table
			AIProcessMessageTable($AIMsgThreadId);

		case "RepairBase":
			if (%clListener < 0)
				%clListener = AIFindCommanderAI(%clSpeaker);

			if (%clListener > 0)
			{
				//we have two people, create a semi-random conversation:
				%index = -1;

				//see if we issue a command first
				if (getRandom() < 0.30)
				{
					//which version of "repair"?
					$AIMsgThreadTable[%index++] = %clListener @ " ChatRepairBase " @ 1250;

					//do we acknowledge the command first?
					if (getRandom() < 0.5)
					{
						if (getRandom() < 0.5)
							$AIMsgThreadTable[%index++] = %clSpeaker @ " ChatCmdAcknowledged " @ 1500;
						else
							$AIMsgThreadTable[%index++] = %clSpeaker @ " ChatTeamYes " @ 1500;
					}
				}

				//the actual msg to be used
				$AIMsgThreadTable[%index++] = %clSpeaker @ " " @ %msg @ " " @ 1750;

				//do we say "thanks"?
				if (getRandom() < 0.3)
				{
					$AIMsgThreadTable[%index++] = %clListener @ " ChatTeamThanks " @ 1000;

					//do we say "you're welcom?"
					if (getRandom() < 0.5)
						$AIMsgThreadTable[%index++] = %clSpeaker @ " ChatWelcome " @ 1500;
				}	

				//end the thread
				$AIMsgThreadTable[%index++] = "";
			}
			else
			{
				//just stick with the original
				$AIMsgThreadTable[0] = %clSpeaker @ " " @ %msg @ " " @ 1750;
			}

			//now process the table
			AIProcessMessageTable($AIMsgThreadId);
	}
}

function AIMessageThread(%msg, %clSpeaker, %clListener, %force, %index, %threadId)
{
	//abort if AI chat has been disabled
	if ($AIDisableChat)
		return;

	//initialize the params
	if (%index $= "")
		%index = 0;

	if (%clListener $= "")
		%clListener = 0;

	if (%force $= "")
		%force = false;

	//if this is the initial call, see if we're already in a thread, and if we should force this one
	if (%index == 0 && $AIMsgThreadActive && !%force)
	{
		error("DEBUG msg thread already in progress - aborting: " @ %msg @ " from client: " @ %clSpeaker);
		return;
	}

	//if this is an ongoing thread, make sure it wasn't pre-empted
	if (%index > 0 && %threadId != $AIMsgThreadId)
		return;

	//if this is a new thread, set a new thread id
	if (%index == 0)
	{
		$AIMsgThreadId++;
		$AIMsgThreadActive = true;
		%threadId = $AIMsgThreadId;
	}
	switch$ (%msg)
	{
		//this is an example of how to use the chat system without using the table...
		case "ChatHi":
			serverCmdCannedChat(%clSpeaker, 'ChatHi', true);
			%responsePending = false;
			if (%index == 0)
			{
				if (%clListener < 0)
					%clListener = AIFindCommanderAI(%clSpeaker);
				if (%clListener > 0 && (getRandom() < 0.5))
				{
					%responsePending = true;
               schedule(1000, 0, "AIMessageThread", %msg, %clListener, 0, false, 1, %threadId);
				}
			}
			if (! %responsePending)
				schedule(1000, 0, "AIEndMessageThread", $AIMsgThreadId);

		//this method of using the chat system sets up a table instead...
		//the equivalent is commented out below - same effect - table is much better.
		case "ChatSelfDefendGenerator":
			if (%index == 0)
			{
				//initialize the table
				$AIMsgThreadIndex = 0;
				$AIMsgThreadTable[1] = "";

				%commander = AIFindCommanderAI(%clSpeaker);
				if (%commander > 0)
				{
					$AIMsgThreadTable[0] = %commander @ " ChatCmdDefendBase " @ 1000;
					$AIMsgThreadTable[1] = %clSpeaker @ " ChatCmdAcknowledged " @ 1250;
					$AIMsgThreadTable[2] = %clSpeaker @ " " @ %msg @ " " @ 1000;
					$AIMsgThreadTable[3] = "";
				}
				else
					$AIMsgThreadTable[0] = %clSpeaker @ " " @ %msg @ " " @ 1000;

				//now process the table
				AIProcessMessageTable(%threadId);
			}
		
//		case "ChatSelfDefendGenerator":
//			%responsePending = false;
//			if (%index == 0)
//			{
//				//find the commander
//				%commander = AIFindCommanderAI(%clSpeaker);
//				if (%commander > 0)
//				{
//					%responsePending = true;
//					serverCmdCannedChat(%commander, "ChatCmdDefendBase", true);
//					schedule("AIMessageThread(" @ %msg @ ", " @ %clSpeaker @ ", 0, 1, " @ %type @ ", false, " @ %threadId @ ");", 1000);
//				}
//				else
//					serverCmdCannedChat(%commander, "ChatSelfDefendGenerator", true);
//			}
//			else if (%index == 1)
//			{
//				//make sure the client is still alive
//				if (AIClientIsAlive(%clSpeaker, 1000))
//				{
//					%responsePending = true;
//					serverCmdCannedChat(%clSpeaker, "ChatCmdAcknowledged", true);
//					schedule("AIMessageThread(" @ %msg @ ", " @ %clSpeaker @ ", 0, 2, " @ %type @ ", false, " @ %threadId @ ");", 1000);
//				}
//				else
//					AIEndMessageThread($AIMsgThreadId);
//			}
//			else if (%index == 2)
//			{
//				//make sure the client is still alive
//				if (AIClientIsAlive(%clSpeaker, 1000))
//					serverCmdCannedChat(%clSpeaker, "ChatSelfDefendGenerator", true);
//				else
//					AIEndMessageThread($AIMsgThreadId);
//			}
//			if (! %responsePending)
//				schedule("AIEndMessageThread(" @ $AIMsgThreadId @ ");", 1000);
			
		default:
         %tag = addTaggedString( %msg );
			serverCmdCannedChat( %clSpeaker, %tag, true );
         removeTaggedString( %tag );   // Don't keep incrementing the string ref count...
			schedule( 1500, 0, "AIEndMessageThread", $AIMsgThreadId );
	}
}

function AIPlay3DSound(%client, %sound)
{
   %player = %client.player;
	if (!isObject(%player))
		return;

	playTargetAudio(%client.target, addTaggedString(%sound), AudioClosest3d, true);
}

function AIPlayAnimSound(%client, %location, %sound, %minCel, %maxCel, %index)
{
	//make sure the client is still alive
	if (! AIClientIsAlive(%client, 500))
		return;

	switch (%index)
	{
		case 0:
			//if we can set the client's aim, we can also try the animation
			if (%client.aimAt(%location, 2500))
			   schedule(250, %client, "AIPlayAnimSound", %client, %location, %sound, %minCel, %maxCel, 1);
			else
				schedule(750, %client, "AIPlay3DSound", %client, %sound);

		case 1:
			//play the animation and schedule the next phase
			%randRange = %maxCel - %minCel + 1;
		  	%celNum = %minCel + mFloor(getRandom() * (%randRange - 0.1));
			if (%celNum > 0)
			   %client.player.setActionThread("cel" @ %celNum);
		   schedule(500, %client, "AIPlayAnimSound", %client, %location, %sound, %minCel, %maxCel, 2);

		case 2:
			//say 'hi'
			AIPlay3DSound(%client, %sound);
	}
}

$AIAnimSalute = 1;
$AIAnimWave = 2;

function AIRespondToEvent(%client, %eventTag, %targetClient)
{
	//record the event time
	$EventTagTimeArray[%eventTag] = getSimTime();

	//abort if AI chat has been disabled
	if ($AIDisableChatResponse)
		return;

	%clientPos = %client.player.getWorldBoxCenter();
  	switch$ (%eventTag)
	{
		case 'ChatHi' or 'ChatAnimWave':
			if (AIClientIsAlive(%targetClient) && %targetClient.isAIControlled())
			{
				%setHumanControl = false;
	 			if (!%client.isAIControlled() && %client.controlAI != %targetClient)
					%setHumanControl = aiAttemptHumanControl(%client, %targetClient);
				if (%setHumanControl)
				   schedule(250, %targetClient, "AIPlayAnimSound", %targetClient, %clientPos, "gbl.hi", $AIAnimSalute, $AIAnimSalute, 0);
				else
				   schedule(250, %targetClient, "AIPlayAnimSound", %targetClient, %clientPos, "gbl.hi", $AIAnimWave, $AIAnimWave, 0);
			}

		case 'ChatBye' or 'ChatTeamDisembark' or 'ChatAnimBye':
			if (AIClientIsAlive(%targetClient) && %targetClient.isAIControlled())
			{
			   schedule(250, %targetClient, "AIPlayAnimSound", %targetClient, %clientPos, "gbl.bye", $AIAnimWave, $AIAnimWave, 0);

				//see if we need to release the bot
				if (aiHumanHasControl(%client, %targetClient))
				{
					%objective = %targetClient.objective;
					if (%objective.issuedByClientId == %client && %objective.targetClientId == %client && %objective.getName() $= "AIOEscortPlayer")
					{
						AIClearObjective(%objective);
						%objective.delete();
					}
					aiReleaseHumanControl(%client, %targetClient);
				}
			}

		case 'ChatTeamYes' or 'ChatGlobalYes' or 'ChatCheer' or 'ChatAnimDance':
			if (AIClientIsAlive(%targetClient) && %targetClient.isAIControlled())
			{
				//choose the animation range
				%minCel = 5;
				%maxCel = 8;
				if (getRandom() > 0.5)
					%sound = "gbl.thanks";
				else
					%sound = "gbl.awesome";
			   schedule(500, %targetClient, "AIPlayAnimSound", %targetClient, %clientPos, %sound, %minCel, %maxCel, 0);
			}

		case 'ChatAnimSalute':
			if (AIClientIsAlive(%targetClient) && %targetClient.isAIControlled())
			   schedule(500, %targetClient, "AIPlayAnimSound", %targetClient, %clientPos, "gbl.thanks", $AIAnimSalute, $AIAnimSalute, 0);

		case 'ChatAwesome' or 'ChatGoodGame' or 'ChatGreatShot' or 'ChatNice' or 'ChatYouRock' or 'ChatAnimSpec3':
			if (AIClientIsAlive(%targetClient) && %targetClient.isAIControlled())
			{
				//choose the animation range
				%minCel = 5;
				%maxCel = 8;
				if (getRandom() > 0.5)
					%sound = "gbl.thanks";
				else
					%sound = "gbl.yes";
			   schedule(250, %targetClient, "AIPlayAnimSound", %targetClient, %clientPos, %sound, %minCel, %maxCel, 0);
			}

		case 'ChatAww' or 'ChatObnoxious' or 'ChatSarcasm' or 'ChatAnimSpec1' or 'ChatAnimSpec2':
			if (AIClientIsAlive(%targetClient) && %targetClient.isAIControlled())
			{
				if (%targetClient.controlByHuman == %client)
				   schedule(1500, %targetClient, "AIPlayAnimSound", %targetClient, %clientPos, "gbl.oops", $AIAnimSalute, $AIAnimSalute, 0);
				else
				   schedule(1500, %targetClient, "AIPlayAnimSound", %targetClient, %clientPos, "gbl.quiet", -1, -1, 0);
			}

		case 'ChatBrag' or 'ChatAnimGetSome':
			if (AIClientIsAlive(%targetClient) && %targetClient.isAIControlled())
			{
				if (%targetClient.controlByHuman == %client)
				   schedule(1500, %targetClient, "AIPlayAnimSound", %targetClient, %clientPos, "gbl.yes", $AIAnimSalute, $AIAnimSalute, 0);
				else
				   schedule(1500, %targetClient, "AIPlayAnimSound", %targetClient, %clientPos, "gbl.no", -1, -1, 0);
			}

		case 'ChatAnimAnnoyed' or 'ChatMove':
			if (AIClientIsAlive(%targetClient) && %targetClient.isAIControlled())
			{
				if (%targetClient.controlByHuman == %client)
				{
				   schedule(750, %targetClient, "AIPlayAnimSound", %targetClient, %clientPos, "vqk.sorry", $AIAnimSalute, $AIAnimSalute, 0);
					%targetClient.schedule(2750, "setDangerLocation", %clientPos , 20);
				}
				else
				   schedule(750, %targetClient, "AIPlayAnimSound", %targetClient, %clientPos, "gbl.no", -1, -1, 0);
			}

		case 'ChatQuiet':
			if (AIClientIsAlive(%targetClient) && %targetClient.isAIControlled())
			{
				if (%targetClient.controlByHuman == %client)
				   schedule(250, %targetClient, "AIPlayAnimSound", %targetClient, %clientPos, "gbl.yes", $AIAnimSalute, $AIAnimSalute, 0);
				else
				   schedule(250, %targetClient, "AIPlayAnimSound", %targetClient, %clientPos, "gbl.no", -1, -1, 0);
			}

		case 'ChatWait' or 'ChatShazbot':
			if (AIClientIsAlive(%targetClient) && %targetClient.isAIControlled())
			{
				if (%targetClient.controlByHuman == %client)
				   schedule(250, %targetClient, "AIPlayAnimSound", %targetClient, %clientPos, "gbl.yes", $AIAnimSalute, $AIAnimSalute, 0);
				else
				   schedule(250, %targetClient, "AIPlayAnimSound", %targetClient, %clientPos, "gbl.no", -1, -1, 0);
			}

		case 'ChatLearn' or 'ChatIsBaseSecure':
		   schedule(750, %targetClient, "AIPlayAnimSound", %targetClient, %clientPos, "gbl.dunno", -1, -1, 0);

		case 'ChatWelcome' or 'ChatSorry' or 'ChatAnyTime':
		   schedule(250, %targetClient, "AIPlayAnimSound", %targetClient, %clientPos, "gbl.thanks", $AIAnimWave, $AIAnimWave, 0);

		case 'ChatDunno' or 'ChatDontKnow':
		   schedule(250, %targetClient, "AIPlayAnimSound", %targetClient, %clientPos, "gbl.yes", -1, -1, 0);

		case 'ChatTeamNo' or 'ChatOops' or 'ChatGlobalNo':
		   schedule(250, %targetClient, "AIPlayAnimSound", %targetClient, %clientPos, "gbl.shazbot", -1, -1, 0);

		case 'ChatTeamThanks' or 'ChatThanks':
		   schedule(250, %targetClient, "AIPlayAnimSound", %targetClient, %clientPos, "vqk.anytime", $AIAnimWave, $AIAnimWave, 0);

		case 'ChatWarnShoot':
		   schedule(250, %targetClient, "AIPlayAnimSound", %targetClient, %clientPos, "vqk.sorry", -1, -1, 0);
		  
		case 'ChatCmdWhat':
			//see if the weight for the escort is higher than what he might otherwise be doing
			if (AIClientIsAlive(%targetClient) && %targetClient.isAIControlled())
			{
				//first, find the chat message
				%objective = %targetClient.objective;
				if (%objective > 0)
				{
					if (%objective.chat)
						%sound = getWord(%objective.chat, 0) @ "Sound";
					else
					{
						%type = %objective.getName();
						switch$ (%type)
						{
							case "AIOAttackLocation":
								%sound = "att.base";
							case "AIOAttackObject":
								if (%objective.targetObjectId > 0)
								{
									%objType = %objective.targetObjectId.getDataBlock().getName();
									switch$ (%objType)
									{
										case "GeneratorLarge":
											%sound = "slf.att.generator";
										case "SensorLargePulse":
											%sound = "slf.att.sensors";
										case "SensorMediumPulse":
											%sound = "slf.att.sensors";
										case "TurretBaseLarge":
											%sound = "slf.att.turrets";
										case "StationVehicle":
											%sound = "slf.att.vehicle";
										default:
											%sound = "slf.att.base";
									}
								}
								else
									%sound = "slf.att.base";
							case "AIODefendLocation":
								if (%objective.targetObjectId > 0)
								{
									%objType = %objective.targetObjectId.getDataBlock().getName();
									switch$ (%objType)
									{
										case "Flag":
											%sound = "slf.def.flag";
										case "GeneratorLarge":
											%sound = "slf.def.generator";
										case "SensorLargePulse":
											%sound = "slf.def.sensors";
										case "SensorMediumPulse":
											%sound = "slf.def.sensors";
										case "TurretBaseLarge":
											%sound = "slf.def.turrets";
										case "StationVehicle":
											%sound = "slf.def.vehicle";
										default:
											%sound = "slf.def.base";
									}
								}
								else
									%sound = "slf.def.defend";
							case "AIOAttackPlayer":
								%sound = "slf.att.attack";
							case "AIOEscortPlayer":
								%sound = "slf.def.defend";
							case "AIORepairObject":
								if (%objective.targetObjectId > 0)
								{
									%objType = %objective.targetObjectId.getDataBlock().getName();
									switch$ (%objType)
									{
										case "GeneratorLarge":
											%sound = "slf.rep.generator";
										case "SensorLargePulse":
											%sound = "slf.rep.sensors";
										case "SensorMediumPulse":
											%sound = "slf.rep.sensors";
										case "TurretBaseLarge":
											%sound = "slf.rep.turrets";
										case "StationVehicle":
											%sound = "slf.rep.vehicle";
										default:
											%sound = "slf.rep.equipment";
									}
								}
								else
									%sound = "slf.rep.base";
							case "AIOLazeObject":
									%sound = "slf.att.base";
							case "AIOMortarObject":
								if (%objective.targetObjectId > 0)
								{
									%objType = %objective.targetObjectId.getDataBlock().getName();
									switch$ (%objType)
									{
										case "GeneratorLarge":
											%sound = "slf.att.generator";
										case "SensorLargePulse":
											%sound = "slf.att.sensors";
										case "SensorMediumPulse":
											%sound = "slf.att.sensors";
										case "TurretBaseLarge":
											%sound = "slf.att.turrets";
										case "StationVehicle":
											%sound = "slf.att.vehicle";
										default:
											%sound = "slf.att.base";
									}
								}
								else
									%sound = "slf.att.base";
							case "AIOTouchObject":
								if (%objective.mode $= "FlagGrab")
									%sound = "slf.att.flag";
								else if (%objective.mode $= "FlagCapture")
									%sound = "flg.flag";
								else 
									%sound = "slf.att.base";

							case "AIODeployEquipment":
									%sound = "slf.tsk.defense";
								  
							default:
								%sound = "gbl.dunno";
						}
					}
				}
				else
					%sound = "gbl.dunno";

				//now that we have a sound, play it with the salute animation
			   schedule(250, %targetClient, "AIPlayAnimSound", %targetClient, %clientPos, %sound, 1, 1, 0);
			}

		//these here are all "self" messages requiring a "thank you"
		case 'ChatRepairBase' or 'ChatSelfAttack' or 'ChatSelfAttackBase' or 'ChatSelfAttackFlag' or 'ChatSelfAttackGenerator' or 'ChatSelfAttackSensors' or 'ChatSelfAttackTurrets' or 'ChatSelfAttackVehicle':
		   schedule(750, %targetClient, "AIPlayAnimSound", %targetClient, %clientPos, "gbl.thanks", 1, 1, 0);

		case 'ChatSelfDefendBase' or 'ChatSelfDefend' or 'ChatSelfDefendFlag' or 'ChatSelfDefendGenerator' or 'ChatSelfDefendNexus' or 'ChatSelfDefendSensors' or 'ChatSelfDefendTurrets' or 'ChatSelfDefendVehicle':
		   schedule(750, %targetClient, "AIPlayAnimSound", %targetClient, %clientPos, "gbl.thanks", 1, 1, 0);

		case 'ChatSelfRepairBase' or 'ChatSelfRepairEquipment' or 'ChatSelfRepairGenerator' or 'ChatSelfRepair' or 'ChatSelfRepairSensors' or 'ChatSelfRepairTurrets' or 'ChatSelfRepairVehicle':
		   schedule(750, %targetClient, "AIPlayAnimSound", %targetClient, %clientPos, "gbl.thanks", 1, 1, 0);

		case 'ChatTaskCover' or 'ChatTaskSetupD' or 'ChatTaskOnIt' or 'ChatTaskSetupRemote' or 'ChatTaskSetupSensors' or 'ChatTaskSetupTurrets' or 'ChatTaskVehicle':
		   schedule(750, %targetClient, "AIPlayAnimSound", %targetClient, %clientPos, "gbl.thanks", 1, 1, 0);

		case 'EnemyFlagCaptured':
			//find all the clients within 100 m of the home flag, and get them all to cheer
			%flagPos = %client.player.getWorldBoxCenter();
		   %count = ClientGroup.getCount();
		   for(%i = 0; %i < %count; %i++)
		   {
				%cl = ClientGroup.getObject(%i);

				//make sure the client is alive, and on the same team
				if (%cl.isAIControlled() && %cl.team == %client.team && AIClientIsAlive(%cl))
				{
					//see if they're within 100 m
					%distance = %cl.getPathDistance(%flagPos);
		         if (%distance > 0 && %distance < 100)
		         {
						//choose the animation range
						%minCel = 5;
						%maxCel = 8;
					  	%randTime = mFloor(getRandom() * 1500) + 1;

						//pick a random sound
						if (getRandom() > 0.25)
							%sound = "gbl.awesome";
						else if (getRandom() > 0.5)
							%sound = "gbl.thanks";
						else if (getRandom() > 0.75)
							%sound = "gbl.nice";
						else
							%sound = "gbl.rock";
					   schedule(%randTime, %cl, "AIPlayAnimSound", %cl, %flagPos, %sound, %minCel, %maxCel, 0);
					}
				}
			}

		case 'ChatCmdHunterGiveFlags' or 'ChatCmdGiveMeFlag':
			if (AIClientIsAlive(%targetClient) && %targetClient.isAIControlled())
			{
			   schedule(250, %targetClient, "AIPlayAnimSound", %targetClient, %clientPos, "cmd.acknowledge", $AIAnimSalute, $AIAnimSalute, 0);
			   schedule(750, %targetClient.player, "serverCmdThrowFlag", %targetClient);
			}

	}
}

