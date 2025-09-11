// updated ObserverQueue

// Create queue container...
if( !isObject("ObserverQueue") )
{
	new SimGroup("ObserverQueue");
	//ObserverQueue.setPersistent(1); // whats this do..?
}

function validateQueue()
{
	if( !$TR2::SpecLock && !$Host::TournamentMode )
	{
		%active = GetActiveCount();
		%count = 12 - %active;
		for( %i = 0; %i < %count && ObserverQueue.getCount() > 0; %i++ )
		{
			%cl = getClientFromQueue();
			if( isObject(%cl) )
			{
				Game.assignClientTeam(%cl, $MatchStarted);
				Game.spawnPlayer(%cl, $MatchStarted);
				reindexQueue();
			}
		}
	}
}
		

function getActiveCount()
{
	%count = 0;
	for( %i = 0; %i < ClientGroup.getCount(); %i++)
	{
		%cl = ClientGroup.getObject(%i);
		if( %cl.team > 0 )
			%count++;
	}
	return %count;
}
	
function addToQueue(%client)
{
	if( %client.team > 0 )
		return 0;
	if( !isObject(%client) )
		return 0;
	%unique = 1;
	%count = ObserverQueue.getCount();
	for( %i = 0; %i < %count; %i++ )
	{
		%node = ObserverQueue.getObject(%i);
		if( %node.id == %client )
		{
			%unique = 0;
		}
	}	
	reindexQueue();
	if( %unique == 1 )
	{
		%node = new ScriptObject()
		{
			id = %client.getId();
			name = %client.nameBase;
		};
		ObserverQueue.add(%node);
		ObserverQueue.pushToBack(%node);
	}
	%client.allowedToJoinTeam = 1;
	reindexQueue();
	messageQueue();
	return %unique;  // 0 = client already added to queue, 1 = client successfully added
}

function removeFromQueue(%client)
{
//	if( !isObject(%client) )
//		return 0;
	// we shouldn't have duplicates in the queue, but why take a chance..
	%idx = 0;
	%count = ObserverQueue.getCount();
	

	for( %i = 0; %i < %count; %i++ )
	{
		%node = ObserverQueue.getObject(%i);
		if( %node.id == %client.getId() )
		{
			ObserverQueue.pushToBack(%node);
			%node.delete();
			break;
		}
	}
	reindexQueue();
	messageQueue();
//	schedule(100, 0, "reindexQueue");
//	schedule(101, 0, "messageQueue");
	return %idx; // 0 if client not found to remove
}

function messageQueue()
{
	%total = reindexQueue();
	%count = ObserverQueue.getCount();
	for( %i = 0; %i < %count; %i++ )
	{
		%cl = ObserverQueue.getObject(%i).id;
		if( !%cl.specOnly )
		{
			if( %cl.queueSlot == 1 )
				messageClient(%cl, 'MsgTR2QueuePos', '\c0You are currently \c1NEXT\c0 of \c1%2\c0 in the Observer Queue.~wfx/misc/bounty_objrem2.wav', %cl.queueSlot, %total);
			else
				messageClient(%cl, 'MsgTR2QueuePos', '\c0You are currently \c1%1\c0 of \c1%2\c0 in the Observer Queue.', %cl.queueSlot, %total);
		}
	}
}

function messageQueueClient(%client)
{
	if( %client.team != 0 )
	{
		messageClient(%client, 'MsgNotObserver', '\c0You are not currently in observer mode.~wfx/powered/station_denied.wav');
		return;
	}
	if( %client.specOnly )
	{
		messageClient(%client, 'MsgSpecOnly', '\c0You are currently in individual spectator only mode.~wfx/powered/station_denied.wav');
		return;
	}
	
	%total = reindexQueue();
	%pos = %client.queueSlot;
	
	if( %pos $= "" )
		return;
	
	if( %pos == 1 )
		messageClient(%client, 'MsgTR2QueuePos', '\c0You are currently \c1NEXT\c0 of \c1%2\c0 in the Observer Queue.!~wfx/misc/bounty_objrem2.wav', %pos, %total);
	else
		messageClient(%client, 'MsgTR2QueuePos', '\c0You are currently \c1%1\c0 of \c1%2\c0 in the Observer Queue.', %pos, %total);
}

function reindexQueue()
{
	// reassigns client 'slots' in the queue
	// returns the current number of assigned 'slots'
	// only people who are actively in the queue (not spec locked) are counted.
	
	%slot = 0;
	//%count = ObserverQueue.getCount();
	for( %i = 0; %i < ObserverQueue.getCount(); %i++ )
	{
		%node = ObserverQueue.getObject(%i);
		%client = %node.id;
		if( !isObject(%client) )
		{
			error("Client " @ %client @ " does not exist!! Removing from queue.");
			if( isObject(%node) )
			{
				ObserverQueue.pushToBack(%node);
				%node.delete();
			}
		}
		else
		{
			if( %node.id.team > 0 )
			{
				ObserverQueue.pushToBack(%node);
				%node.delete();
			}
			else if( !%client.specOnly )
			{
				%slot++;
				%client.queueSlot = %slot;
			}
			else
			{
				%client.queueSlot = "";
			}
		}
	}
	return %slot;
}

function getClientFromQueue()
{
	reindexQueue();
	%count = ObserverQueue.getCount();
	%client = -1;
	for( %i = 0; %i < %count; %i++ )
	{
		%cl = ObserverQueue.getObject(%i).id;
		if( %cl.queueSlot == 1 )
		{
			%client = %cl;
			break;
		}
	}
	return %client;
}

function TR2Game::forceObserver(%game, %client, %reason)
{
  //make sure we have a valid client...
	if (%client <= 0 || %client.team == 0)
		return;

	 // TR2
	 // First set to outer role (just to be safe)
	 %game.assignOuterMostRole(%client);

	 // Then release client's role
	 %game.releaseRole(%client);
  
 	// Get rid of the corpse after the force
	%client.forceRespawn = true;
	%client.inSpawnBuilding = true;

	// first kill this player
	if(%client.player)
		%client.player.scriptKill(0);
  
    // TR2:  Fix observer timeouts; for some reason %client.player is already 0
    //       in that case, so scriptKill() won't get called
    if (%client.playerToDelete !$= "")
    {
       %client.enableZones = false;
       %client.playerToDelete.delete();
    }
	
	if( %client.respawnTimer )
		cancel(%client.respawnTimer);
	
	%client.respawnTimer = "";
	
	// remove them from the team rank array
	%game.removeFromTeamRankArray(%client);

	// place them in observer mode
	%client.lastObserverSpawn = -1;
	%client.observerStartTime = getSimTime();
	%adminForce = 0;
	
	switch$ ( %reason )
	{
		case "playerChoose":
			messageClient(%client, 'MsgClientJoinTeam', '\c2You have become an observer.', %client.name, %game.getTeamName(0), %client, 0 );
			echo(%client.nameBase@" (cl "@%client@") entered observer mode");
			%client.lastTeam = %client.team;
			%client.specOnly = true; // this guy wants to sit out...
		
		case "AdminForce":
			messageClient(%client, 'MsgClientJoinTeam', '\c2You have been forced into observer mode by the admin.', %client.name, %game.getTeamName(0), %client, 0 );
			echo(%client.nameBase@" (cl "@%client@") was forced into observer mode by admin");
			%client.lastTeam = %client.team;
			%adminForce = 1;
			
			if($Host::TournamentMode)
			{
				if(!$matchStarted)
				{	
					if(%client.camera.Mode $= "pickingTeam")
					{
						commandToClient( %client, 'processPickTeam');
						clearBottomPrint( %client );
					}
					else
					{
						clearCenterPrint(%client);
						%client.notReady = true;
					}
				}
			}
			
		case "spawnTimeout":
			messageClient(%client, 'MsgClientJoinTeam', '\c2You have been placed in observer mode due to delay in respawning.', %client.name, %game.getTeamName(0), %client, 0 );
			echo(%client.nameBase@" (cl "@%client@") was placed in observer mode due to spawn delay");
			// save the team the player was on - only if this was a delay in respawning
			%client.lastTeam = %client.team;
			%client.specOnly = true; // why force an afk player back into the game?
		
		case "specLockEnabled":
			messageClient(%client, 'MsgClientJoinTeam', '\c2Spectator lock is enabled. You were automatically forced to observer.', %client.name, %game.getTeamName(0), %client, 0 );
			%client.lastTeam = %client.team;	

		case "teamsMaxed":
			messageClient(%client, 'MsgClientJoinTeam', '\c2Teams are at capacity. You were automatically forced to observer.', %client.name, %game.getTeamName(0), %client, 0 );
			%client.lastTeam = %client.team;
		
		case "gameForce":
			messageClient(%client, 'MsgClientJoinTeam', '\c2You have become an observer.', %client.name, %game.getTeamName(0), %client, 0 );
			%client.lastTeam = %client.team;										 
	}
	
	// switch client to team 0 (observer)
	%client.team = 0;
	%client.player.team = 0;
	setTargetSensorGroup( %client.target, %client.team );
	%client.setSensorGroup( %client.team );

	// set their control to the obs. cam
	%client.setControlObject( %client.camera );
	commandToClient(%client, 'setHudMode', 'Observer');
	
	// display the hud
	//displayObserverHud(%client, 0);
	updateObserverFlyHud(%client);

	
	// message everyone about this event
	if( !%adminForce )
		messageAllExcept(%client, -1, 'MsgClientJoinTeam', '\c2%1 has become an observer.', %client.name, %game.getTeamName(0), %client, 0 );
	else
		messageAllExcept(%client, -1, 'MsgClientJoinTeam', '\c2The admin has forced %1 to become an observer.', %client.name, %game.getTeamName(0), %client, 0 );

	updateCanListenState( %client );
	
	// call the onEvent for this game type
	%game.onClientEnterObserverMode(%client);  //Bounty uses this to remove this client from others' hit lists

	if( !%client.tr2SpecMode )
	{
		%client.camera.getDataBlock().setMode( %client.camera, "observerFly" );
	}
	else
	{
		if( $TheFlag.carrier.client !$= "" )
			%game.observeObject(%client, $TheFlag.carrier.client, 1);
		else
			%game.observeObject(%client, $TheFlag, 2);
	}

// Queuing...
	if( %reason !$= "specLockEnabled" && %reason !$= "teamsMaxed" && !$Host::TournamentMode )
	{
		%vacant = ((6 * 2) - getActiveCount());
		%nextCl = getClientFromQueue();
		
		if( isObject(%nextCl) && %vacant > 0 && %nextCl.queueSlot <= %vacant )
		{
			%game.assignClientTeam(%nextCl, $MatchStarted );
			%game.spawnPlayer(%nextCl, $MatchStarted);
		}
	}
	addToQueue(%client);
	%client.allowedToJoinTeam = 1;
}

function TR2Game::clientJoinTeam( %game, %client, %team, %fromObs )
{
	//%game.assignClientTeam(%client, $MatchStarted);
	if( (12 - getActiveCount()) > 0 || $Host::TournamentMode )
	{
		%client.allowedToJoinTeam = 1;
		
	   //first, remove the client from the team rank array
	   //the player will be added to the new team array as soon as he respawns...
	   %game.removeFromTeamRankArray(%client);
	   
	   %pl = %client.player;
	   if(isObject(%pl))
	   {
	      if(%pl.isMounted())
	         %pl.getDataBlock().doDismount(%pl);
	      %pl.scriptKill(0);
	   }
	
	   // reset the client's targets and tasks only
	   clientResetTargets(%client, true);
	
	   // give this client a new handle to disassociate ownership of deployed objects
	   if( %team $= "" && (%team > 0 && %team <= %game.numTeams))
	   {
	      if( %client.team == 1 )
	         %client.team = 2;
	      else
	         %client.team = 1;
	   }
	   else
	      %client.team = %team;
	
	   // Set the client's skin:
	   if (!%client.isAIControlled())
	      setTargetSkin( %client.target, %game.getTeamSkin(%client.team) );
	   setTargetSensorGroup( %client.target, %client.team );
	   %client.setSensorGroup( %client.team );
	
	   // Spawn the player:
		%game.spawnPlayer(%client, $MatchStarted);
	
	   if(%fromObs $= "" || !%fromObs)
	   {   
	      messageAllExcept( %client, -1, 'MsgClientJoinTeam', '\c1%1 switched to team %2.', %client.name, %game.getTeamName(%client.team), %client, %client.team );
	      messageClient( %client, 'MsgClientJoinTeam', '\c1You switched to team %2.', $client.name, %game.getTeamName(%client.team), %client, %client.team );
	   }
	   else
	   {
	      messageAllExcept( %client, -1, 'MsgClientJoinTeam', '\c1%1 joined team %2.', %client.name, %game.getTeamName(%client.team), %client, %team );
	      messageClient( %client, 'MsgClientJoinTeam', '\c1You joined team %2.', $client.name, %game.getTeamName(%client.team), %client, %client.team );
	   }
	
	   updateCanListenState( %client );
	   
	   // MES - switch objective hud lines when client switches teams
	   messageClient(%client, 'MsgCheckTeamLines', "", %client.team);
	   logEcho(%client.nameBase@" (cl "@%client@") switched to team "@%client.team);
	   
	   
		removeFromQueue(%client);
	}
	else
	{
		//error("Forced to observer: " @%client.nameBase @ " via JoinTeam");
		%game.forceObserver(%client, "gameForce");
	}
}
//	if( %client.allowedToJoinTeam == 1 )
//	{
//		DefaultGame::clientJoinTeam( %game, %client, %team, %respawn );
//		removeFromQueue(%client);
//	}
//	else
//	{
//		%game.forceObserver(%client, "gameForce");
//	}


function TR2Game::assignClientTeam(%game, %client, %respawn )
{
	if( %client.team > 0 )
		return;
	%size[0] = 0;
	%size[1] = 0;
	%size[2] = 0;
	%leastTeam = 0;
	for( %i = 0; %i < ClientGroup.getCount(); %i++ )
	{
		%cl = ClientGroup.getObject(%i);
		if( %cl != %client )
			%size[%cl.team]++;
	}
	%playing = %size[1] + %size[2];
		
	if( %playing < (6 << 1) ) // HEH HEH
	{
		%game.removeFromTeamRankArray(%client);
		%leastTeam = (%size[1] <= %size[2]) ? 1 : 2;
		removeFromQueue(%client);
	
		%client.lastTeam = %client.team;
		%client.team = %leastTeam;
		
		
		// Assign the team skin:
		if ( %client.isAIControlled() )
		{
			if ( %leastTeam & 1 )
			{
				%client.skin = addTaggedString( "basebot" );
				setTargetSkin( %client.target, 'basebot' );
			}
			else
			{
				%client.skin = addTaggedString( "basebbot" );
				setTargetSkin( %client.target, 'basebbot' );
			}
		}
		else
			setTargetSkin( %client.target, %game.getTeamSkin(%client.team) );
	
		messageAllExcept( %client, -1, 'MsgClientJoinTeam', '\c1%1 joined %2.', %client.name, %game.getTeamName(%client.team), %client, %client.team );
		messageClient( %client, 'MsgClientJoinTeam', '\c1You joined the %2 team.', %client.name, %game.getTeamName(%client.team), %client, %client.team );
	
		updateCanListenState( %client );
			
		clearBottomPrint(%client); // clear out the observer hud...
	
		echo(%client.nameBase@" (cl "@%client@") joined team "@%client.team);
		//error("Assigned: " @%client.nameBase @ " to team: " @ %team @ " via AssignTeam");
	}
	else
	{
		//error("Forced to observer: " @%client.nameBase @ " via AssignTeam");
		%game.forceObserver(%client, "teamsMaxed");
	}
	// hes been checked for team join ability..
	%client.allowedToJoinTeam = 1;
}

function TR2Game::ObserverOnTrigger(%game, %data, %obj, %trigger, %state)
{
	//trigger types:	0:fire 1:altTrigger 2:jump 3:jet 4:throw
	if (!$missionRunning)
	{
		return false;
	}

	%client = %obj.getControllingClient();

	if (!isObject(%client))
	{
		return false;
	}

	// Knockdowns
	// Moved up since players in the game should have a little priority over observers
	// save a little execution time and effort :
	if (%obj.mode $= "playerDeath")
	{
		if(!%client.waitRespawn && getSimTime() > %client.suicideRespawnTime)
		{
			commandToClient(%client, 'setHudMode', 'Standard');
			if (%client.playerToDelete !$= "")
			{
				%client.enableZones = false;
				%client.playerToDelete.delete();
			}

			// Use current flymode rotation
			%transform = %client.camera.getTransform();
			%oldTrans = %client.plyrTransformAtDeath;
			%oldPos = getWord(%oldTrans, 0) SPC getWord(%oldTrans, 1) SPC getWord(%oldTrans, 2);
			%newRot = getWord(%transform, 3) SPC getWord(%transform, 4) SPC getWord(%transform, 5) SPC getWord(%transform, 6);
			%client.plyrTransformAtDeath = %oldPos SPC %newRot;

			Game.spawnPlayer( %client, true );
			%client.camera.setFlyMode();
			%client.setControlObject(%client.player);
		}
		return false;
 	}

	 // Observer zoom
	if( %obj.mode $= "followFlag" || %obj.mode $= "observerFollow" )
	{
		if( %trigger == 3 )
		{
			%client.obsZoomLevel++;
			if (%client.obsZoomLevel >= $TR2::numObsZoomLevels)
				%client.obsZoomLevel = 0;

			// Move the camera
			%game.observeObject(%client, %client.observeTarget, %client.observeType);

			//%pos = %client.camera.getPosition();
			//%rot = %client.camera
			return false;
		}
		else
			return false;
	}

	if( %obj.mode $= "observerFly" )
	{
		// unfortunately, it seems that sometimes the "observer speed up" thing doesn't always happen...
		if (%trigger == 0)
		{
			clearBottomPrint(%client);
			return false;
		}
		//press JET
		else if (%trigger == 3)
		{
			%markerObj = Game.pickObserverSpawn(%client, true);
			%transform = %markerObj.getTransform();
			%obj.setTransform(%transform);
			%obj.setFlyMode();
			clearBottomPrint(%client);
			return false;
		}
			//press JUMP
		else if (%trigger == 2)
		{
			clearBottomPrint(%client);
			return false;
		}
	}

	if( %obj.mode $= "pre-game" )
	{
		return true; // use default action
	}

	if( %obj.mode $= "justJoined" )
	{
		if( !$TR2::SpecLock && !$Host::TournamentMode )
		{
			if( %client.team <= 0 )
			{
				if( getActiveCount() < ($TR2::DefaultTeamSize * 2) )
				{
					%game.assignClientTeam(%client, 0);
					%game.spawnPlayer(%client, 0);
				}
				else
				{
					%game.forceObserver(%client, "teamsMaxed");
				}
			}
			else if( %client.team >= 1 )
			{
				%game.spawnPlayer(%client, 0);
			}

			if( isObject(%client.player) ) // player was successfully created...
			{
				if(!$MatchStarted && !$CountdownStarted)
					%client.camera.getDataBlock().setMode( %client.camera, "pre-game", %client.player );
				else if(!$MatchStarted && $CountdownStarted)
					%client.camera.getDataBlock().setMode( %client.camera, "pre-game", %client.player );
				else
				{
					%client.camera.setFlyMode();
					commandToClient(%client, 'setHudMode', 'Standard');
					%client.setControlObject( %client.player );
				}
			}
		}
		else
		{
			// kind of weak, but tourney mode *is* a form of spec lock :/
			%game.forceObserver(%client, "specLockEnabled");
		}
		return false;
	}

	 // Queue
	if( %trigger == 0 )
	{
		if( %obj.mode !$= "playerDeath" )
		{
			return false;
		}
	}
	return true;
}



