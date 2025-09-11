// SkiFreeOverrides.cs

package SkiFreeGame {
	
// players can only damage themselves. however they can apply impulse to others
function Armor::damageObject(%data, %targetObject, %sourceObject, %position, %amount, %damageType, %momVec, %mineSC) {
	//error("Armor::damageObject( "@%data@", "@%targetObject@", "@%sourceObject@", "@%position@", "@%amount@", "@%damageType@", "@%momVec@" )");
	%oldVector = %targetObject.getVelocity();
	%sourceClient = isObject(%sourceObject) ? %sourceObject.getOwnerClient() : 0; // don't hurt others

	if( isObject(%targetObject.client) && %targetObject.client == $SkiFreeYeti ) {
		if( %damageType $= $DamageType::Disc ) {
			// stun the yeti
			$SkiFreeYeti.stunned = 1;
			%amount = 0;
		}
		
		if( %damageType != 0 ) {
			// yeti don't take damage except from scriptkill
			return;
		}
	}

	// absolutely devasate someone hit by teh yeti
	if( %damageType == $DamageType::Shocklance ) {
		%amount = 100;
		%sourceClient.yetiTaunt = 1;

		%targetObject.blowup();
		%targetObject.setVelocity("0 0 0");

		%yetiKill = 1;
	}
	
	// why did i even write this shite
	if( %damageType == $DamageType::Ground ) {
		Game.schedule(0, checkDeadstop, %targetObject, %oldVector);
	}
	
	// check interference
	if( %damageType == $DamageType::Disc && %targetObject != %sourceObject ) {
		Game.schedule(0, checkInterference, %targetObject, %sourceObject, %oldVector);
	}
	
	// players cannot damage each other (except the yeti who can destroy everything in its path)
	if( !%sourceClient || %targetObject == %sourceObject || %yetiKill ) {
		// copy/pasta from classix 1.5.2, with modifications
				
		   if(%targetObject.invincible || %targetObject.getState() $= "Dead")
			  return;

		   //----------------------------------------------------------------
		   // z0dd - ZOD, 6/09/02. Check to see if this vehicle is destroyed, 
		   // if it is do no damage. Fixes vehicle ghosting bug. We do not
		   // check for isObject here, destroyed objects fail it even though
		   // they exist as objects, go figure.
		   if(%damageType == $DamageType::Impact)
			  if(%sourceObject.getDamageState() $= "Destroyed")
				 return;

		   if (%targetObject.isMounted() && %targetObject.scriptKilled $= "")
		   {
			  %mount = %targetObject.getObjectMount();
			  if(%mount.team == %targetObject.team)
			  {
				 %found = -1;
				 for (%i = 0; %i < %mount.getDataBlock().numMountPoints; %i++)
				 {
					if (%mount.getMountNodeObject(%i) == %targetObject)
					{
					   %found = %i;
					   break;
					}
				 }

				 if (%found != -1)
				 {
					if (%mount.getDataBlock().isProtectedMountPoint[%found])
					{
					   // z0dd - ZOD, 5/07/04. Let players be damaged if gameplay changes in affect.
					   if(!$Host::ClassicLoadPlayerChanges)
					   {
						  %mount.getDataBlock().damageObject(%mount, %sourceObject, %position, %amount, %damageType);
						  return;
					   }
					   else
					   {
						  if(%damageType != $DamageType::Laser && %damageType != $DamageType::Bullet && %damageType != $DamageType::Blaster) 
							 return;
					   }
					}
				 }
			  }
		   }

		   %targetClient = %targetObject.getOwnerClient();
		   if(isObject(%mineSC))
			  %sourceClient = %mineSC;   
		   else
			  %sourceClient = isObject(%sourceObject) ? %sourceObject.getOwnerClient() : 0;

		   %targetTeam = %targetClient.team;

		   //if the source object is a player object, player's don't have sensor groups
		   // if it's a turret, get the sensor group of the target
		   // if its a vehicle (of any type) use the sensor group
		   if (%sourceClient)
			  %sourceTeam = %sourceClient.getSensorGroup();
		   else if(%damageType == $DamageType::Suicide)
			  %sourceTeam = 0;
		   //--------------------------------------------------------------------------------------------------------------------
		   // z0dd - ZOD, 4/8/02. Check to see if this turret has a valid owner, if not clear the variable. 
		   else if(isObject(%sourceObject) && %sourceObject.getClassName() $= "Turret")
		   {
			  %sourceTeam = getTargetSensorGroup(%sourceObject.getTarget());
			  if(%sourceObject.owner !$="" && (%sourceObject.owner.team != %sourceObject.team || !isObject(%sourceObject.owner)))
			  {
				 %sourceObject.owner = "";
			  }
		   }
		   //--------------------------------------------------------------------------------------------------------------------
		   else if( isObject(%sourceObject) &&
			( %sourceObject.getClassName() $= "FlyingVehicle" || %sourceObject.getClassName() $= "WheeledVehicle" || %sourceObject.getClassName() $= "HoverVehicle"))
			  %sourceTeam = getTargetSensorGroup(%sourceObject.getTarget());
		   else
		   {
			  if (isObject(%sourceObject) && %sourceObject.getTarget() >= 0 )
			  {
				 %sourceTeam = getTargetSensorGroup(%sourceObject.getTarget());
			  }
			  else
			  {
				 %sourceTeam = -1;
			  }
		   }

		   // if teamdamage is off, and both parties are on the same team
		   // (but are not the same person), apply no damage
		   if(!$teamDamage && (%targetClient != %sourceClient) && (%targetTeam == %sourceTeam))
			  return;

		   if(%targetObject.isShielded && %damageType != $DamageType::Blaster)
			  %amount = %data.checkShields(%targetObject, %position, %amount, %damageType);

		   if(%amount == 0)
			  return;
			  
		   // Set the damage flash
		   %damageScale = %data.damageScale[%damageType];
		   if(%damageScale !$= "")
			  %amount *= %damageScale;
			  
   		   // if the damage of a discjump would kill, override
		   if( %damageType == $DamageType::Disc ) {
			   %targetObject.hasDiscjumped = 1;
			   if( %targetObject.getDamageLevel() + %amount > 0.66 ) {
				   if( %targetObject.launchTime $= "" ) {
					   %amount = (0.65 - %targetObject.getDamageLevel());
					   if( %amount <= 0 ) return;
				   }
				   else {
					   if( %targetObject.safetyFeature $= "" ) {
						   %targetObject.safetyFeature = 1;
						   messageClient(%targetClient, 0, 'NOT ENOUGH HEALTH FOR DISCJUMP~wfx/misc/red_alert_short.wav');
					   }
					   else {
						   messageClient(%targetClient, 0, '~wfx/misc/red_alert_short.wav');
					   }
					   %targetObject.schedule(0, setVelocity, %oldVector);
					   return;
				   }
			   }
		   }
		   
		   %flash = %targetObject.getDamageFlash() + (%amount * 2);
		   if (%flash > 0.75)
			  %flash = 0.75;
		   
		   %previousDamage = %targetObject.getDamagePercent();
		   %targetObject.setDamageFlash(%flash);
		   
		   %targetObject.applyDamage(%amount);
		   Game.onClientDamaged(%targetClient, %sourceClient, %damageType, %sourceObject);

		   %targetClient.lastDamagedBy = %damagingClient;
		   %targetClient.lastDamaged = getSimTime();
		   
		   //now call the "onKilled" method if the client was... you know...  
		   if(%targetObject.getState() $= "Dead")
		   {
			  // where did this guy get it?
			  %damLoc = %targetObject.getDamageLocation(%position);
			  
			  // should this guy be blown apart?
			  if( %damageType == $DamageType::Explosion || 
				  %damageType == $DamageType::TankMortar ||
				  %damageType == $DamageType::Mortar ||
				  %damageType == $DamageType::MortarTurret ||
				  %damageType == $DamageType::BomberBombs ||
				  %damageType == $DamageType::SatchelCharge ||
				  %damageType == $DamageType::Missile )     
			  {
				 if( %previousDamage >= 0.35 ) // only if <= 35 percent damage remaining
				 {
					%targetObject.setMomentumVector(%momVec);
					%targetObject.blowup(); 
				 }
			  }
		   
			  // this should be funny...
			  if( %damageType == $DamageType::VehicleSpawn )
			  {   
				 %targetObject.setMomentumVector("0 0 1");
				 %targetObject.blowup();
			  }
			  
			  // If we were killed, max out the flash
			  %targetObject.setDamageFlash(0.75);
			  
			  %damLoc = %targetObject.getDamageLocation(%position);
			  Game.onClientKilled(%targetClient, %sourceClient, %damageType, %sourceObject, %damLoc);
		   }
		   else if ( %amount > 0.1 )
		   {   
			  if( %targetObject.station $= "" && %targetObject.isCloaked() )
			  {
				 %targetObject.setCloaked( false );
				 %targetObject.reCloak = %targetObject.schedule( 500, "setCloaked", true ); 
			  }
			  
			  playPain( %targetObject );
		   }
	}
}

function ForceFieldBareData::onAdd(%data, %obj) {
	// skip ForceFieldBareData::onAdd - keeps it from creating a physical zone
	GameBaseData::onAdd(%data, %obj);
	%obj.open();
}

// can't get items back after tossing them - this prevents cheating the handicap modes
function EnergyPack::onCollision(%data, %obj, %col) {}
function Disc::onCollision(%data, %obj, %col) {}
function DiscAmmo::onCollision(%data, %obj, %col) {}
function RepairKit::onCollision(%data, %obj, %col) {}
function ShockLance::onCollision(%data, %obj, %col) {}

// no looting either
function Armor::onCollision(%this,%obj,%col,%forceVehicleNode) {}

// turn the player to glass if they throw their repair kit away
function ShapeBase::throwItem(%this, %data) {
	Parent::throwItem(%this, %data);
	if( %data $= RepairKit && %this.launchTime $= "" ) {
		// turn the player to glass
		%this.setDamageLevel(0.65);
	}
}

// turn phasing on/off
function serverCmdStartNewVote(%client, %typeName, %arg1, %arg2, %arg3, %arg4, %playerVote) {
	Parent::serverCmdStartNewVote(%client, %typeName, %arg1, %arg2, %arg3, %arg4, %playerVote);
	
	if( %client.isAdmin ) {
		Game.checkSkiFreeVote(%client, %typeName);
	}
}

// turn off phasing (this is a client method used for listen servers only - you do NOT want this to stay on)
function lobbyDisconnect() {
	Game.phaseThroughPlayers(false); // make sure this is OFF
	Parent::lobbyDisconnect();
}

// show the things
function toggleEditor(%make) {
	if( %make ) Game.runEditorTasks();
	Parent::toggleEditor(%make);
}

// surpress yeti's quit message ($SkiFreeYeti will be 0 outside single player)
function GameConnection::onDrop(%client, %reason) {
	if( %client == $SkiFreeYeti ) {
		%lastMissionType = $currentMissionType;
		$currentMissionType = "SinglePlayer";
		Parent::onDrop(%client, %reason);
		$currentMissionType = %lastMissionType;
	}
	else {
		Parent::onDrop(%client, %reason);
	}
}

};
