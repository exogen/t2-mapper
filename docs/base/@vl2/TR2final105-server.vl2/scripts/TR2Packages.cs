package TR2Game {

function Player::scriptKill(%player, %damageType)
{
   if (%damageType == $DamageType::suicide ||
       %damageType == $DamageType::RespawnAfterScoring ||
       %damageType == 0)
   {
      %player.client.forceRespawn = true;
      %player.client.inSpawnBuilding = true;
      %player.knockedDown = false;
   }

   Parent::scriptKill(%player, %damageType);
}

function Player::isAboveSomething(%player, %searchrange)
{
   // Borrow some deployment code to determine whether the player is
   // above something.
   %mask = $TypeMasks::InteriorObjectType | $TypeMasks::StaticShapeObjectType | $TypeMasks::ForceFieldObjectType;
   %eyeVec = "0 0 -1";//%player.getEyeVector();
   %eyeTrans = %player.getEyeTransform();
   // extract the position of the player's camera from the eye transform (first 3 words)
   %eyePos = posFromTransform(%eyeTrans);
   // normalize the eye vector
   %nEyeVec = VectorNormalize(%eyeVec);
   // scale (lengthen) the normalized eye vector according to the search range
   %scEyeVec = VectorScale(%nEyeVec, %searchRange);
   // add the scaled & normalized eye vector to the position of the camera
   %eyeEnd = VectorAdd(%eyePos, %scEyeVec);
   // see if anything gets hit
   return containerRayCast(%eyePos, %eyeEnd, %mask, 0);
}

function ShapeBase::hasAmmo( %this, %weapon )
{
   switch$ ( %weapon )
   {
      // TR2
      case TR2Disc:
         return( %this.getInventory( TR2DiscAmmo ) > 0 );
      case TR2GrenadeLauncher:
         return( %this.getInventory( TR2GrenadeLauncherAmmo ) > 0 );
      case TR2Chaingun:
         return( %this.getInventory( TR2ChaingunAmmo ) > 0);
      case TR2Mortar:
         return( %this.getInventory( TR2MortarAmmo ) > 0 );
      case TR2Shocklance:
         return( true );
      case TR2GoldTargetingLaser:
         return( false );
      case TR2SilverTargetingLaser:
         return( false );
      default:
         return Parent::hasAmmo(%this, %weapon);
   }
}

function ShapeBase::clearInventory(%this)
{
   // TR2
   %this.setInventory(TR2Disc,0);
   %this.setInventory(TR2GrenadeLauncher,0);
   %this.setInventory(TR2Chaingun,0);
   %this.setInventory(TR2Mortar,0);
   %this.setInventory(TR2Shocklance,0);
   %this.setInventory(TR2GoldTargetingLaser,0);
   %this.setInventory(TR2SilverTargetingLaser,0);
   %this.setInventory(TR2DiscAmmo,0);
   %this.setInventory(TR2GrenadeLauncherAmmo,0);
   %this.setInventory(TR2MortarAmmo, 0);
   %this.setInventory(TR2ChaingunAmmo,0);
   %this.setInventory(TR2Grenade,0);
   
   Parent::clearInventory(%this);
}

function serverCmdUse(%client,%data)
{
   	if( %data $= Disc )
   		%client.getControlObject().use(TR2Disc);
   	else if( %data $= GrenadeLauncher )
   		%client.getControlObject().use(TR2GrenadeLauncher);
    else if( %data $= Chaingun )
        %client.getControlObject().use(TR2Chaingun);
    else if( %data $= Shocklance )
        %client.getControlObject().use(TR2Shocklance);
    else if( %data $= Grenade )
        %client.getControlObject().use(TR2Grenade);
    else if( %data $= Mortar )
        %client.getControlObject().use(TR2Mortar);
    else if( %data $= TargetingLaser )
        %client.getControlObject().use((%client.team == 1) ? TR2GoldTargetingLaser : TR2SilverTargetingLaser);
   	// etc...
   	else
   		%client.getControlObject().use(%data);
}

function serverCmdStartNewVote(%client, %typeName, %arg1, %arg2, %arg3, %arg4, %playerVote)
{
	parent::serverCmdStartNewVote(%client, %typeName, %arg1, %arg2, %arg3, %arg4, %playerVote);

	//if( %typeName $= "ToggleDisableDeath" && %client.isAdmin )
	//	ToggleDisableDeath(%client);

	if ( %typeName $= "TogglePracticeMode" && %client.isAdmin )
		  TogglePracticeMode(%client);

	if( %typeName $= "ToggleRoles" && %client.isAdmin )
		TogglePlayerRoles(%client);

	if( %typeName $= "ToggleCrowd" && %client.isAdmin )
		ToggleCrowd(%client);
  
   	if( %typeName $= "getQueuePos" )
	{
		messageQueueClient(%client);
	}
 	if( %typeName $= "toggleSpecLock" && %client.isAdmin )
	{
		toggleSpectatorLock(%client);
	}

	if( %typeName $= "toggleSpecOnly" )
		toggleSpecOnly(%client);

	if( %typeName $= "toggleSpecMode" )
		toggleSpectatorMode(%client);
  
   if( %typeName $= "tr2JoinGame" )
   {
		reindexQueue();
		if( !$TR2::SpecLock && %client.queueSlot !$= "" && %client.queueSlot <= ((6 * 2) - getActiveCount()) )
	   {
			Game.assignClientTeam(%client);
			Game.spawnPlayer(%client, $MatchStarted);			
		}
   }
   if( %typeName $= "tr2ForceFlagReturn" )
   {
		if( %client.isAdmin && $TheFlag.carrier $= "" && (getSimTime() - $TheFlag.dropTime) >= 30000 )
	   {
			messageAll('MsgAdminForce', '\c0%1 forced the flag to return to the stand.', %client.name);
			Game.flagReturn($TheFlag, 0);			
		}
   }
}

function toggleSpectatorMode(%client)
{
	if( %client.team <= 0 )
	{
		%client.tr2SpecMode = !%client.tr2SpecMode;
		if( %client.tr2SpecMode )
		{
			%target = $TheFlag.carrier $= "" ? $TheFlag : $TheFlag.carrier.client;
			%type = $TheFlag.carrier $= "" ? 2 : 1;
			Game.observeObject(%client, %target, %type);
		}
		else
		{
			if( %client.camera.mode !$= "observerFly" )
				%client.camera.getDataBlock().setMode(%client.camera, "observerFly");
		}
	}
}

function toggleSpectatorLock(%client)
{
	$TR2::SpecLock = !$TR2::SpecLock;
	%status = $TR2::SpecLock ? "locked spectators in observer mode." : "enabled the spectator queue.";
	messageAll('MsgAdminForce', '\c0%1 %2.', %client.name, %status);
}

function toggleSpecOnly(%client)
{
	%time = getSimTime() - %client.specOnlyTime;
	if( %time > 10000 )
	{
		%client.specOnly = !%client.specOnly;
		%status = %client.specOnly ? "You have locked yourself as a spectator." : "You have entered the queue.";
		messageClient(%client, 'MsgAdminForce', '\c2%1', %status);
		reindexQueue();
		messageQueueClient(%client);
		%client.specOnlyTime = getSimTime();

		%vacant = ((6 * 2) - getActiveCount());
		if( !%client.specOnly && %vacant > 0 && %client.queueSlot <= %vacant )
		{
			Game.assignClientTeam(%client, 0);
			Game.spawnPlayer(%client, 0);
		}
	}
	else
		messageClient(%client, 'MsgTR2Wait', '\c0You must wait %1 seconds before using this option again!~wfx/powered/station_denied.wav', mFloor((10000 - %time)/1000) );
}

function TogglePlayerRoles(%client)
{
	$TR2::EnableRoles = !$TR2::EnableRoles;
	%status = $TR2::EnableRoles ? "enabled player roles." : "disabled player roles.";
	messageAll('MsgAdminForce', '\c2%1 %2', %client.name, %status);
}

function ToggleCrowd(%client)
{
    if ($TR2::EnableCrowd)
       Game.stopCrowd();
       
	$TR2::EnableCrowd = !$TR2::EnableCrowd;
	%status = $TR2::EnableCrowd ? "enabled the crowd." : "disabled the crowd";
	messageAll('MsgAdminForce', '\c2%1 %2', %client.name, %status);
}

function ToggleDisableDeath(%client)
{
	$TR2::DisableDeath = !$TR2::DisableDeath;
	%status = $TR2::DisableDeath ? "disabled Death." : "enabled Death.";
	messageAll('MsgAdminForce', '\c2%1 %2', %client.name, %status);
 
    // Reset all players' knockdown status
   for(%i = 0; %i < ClientGroup.getCount(); %i ++)
   {
      %cl = ClientGroup.getObject(%i);
      %cl.knockedDown = false;
      cancel(%cl.knockdownThread);
   }
}

function TogglePracticeMode(%client)
{
	$TR2::PracticeMode = !$TR2::PracticeMode;
	%status = $TR2::PracticeMode ? "enabled Practice Mode." : "disabled Practice Mode.";
	messageAll('MsgAdminForce', '\c2%1 %2', %client.name, %status);
}

function Flag::shouldApplyImpulse(%data, %obj)
{
   // TR2:  Get rid of flag discing
   return false;
}

function TR2ShockLanceImage::onFire(%this, %obj, %slot)
{
   if( %obj.isCloaked() )
   {
      if( %obj.respawnCloakThread !$= "" )
      {
         Cancel(%obj.respawnCloakThread);
         %obj.setCloaked( false );
      }
      else
      {
         if( %obj.getEnergyLevel() > 20 )
         {
            %obj.setCloaked( false );
            %obj.reCloak = %obj.schedule( 500, "setCloaked", true );
         }
      }
   }

   %muzzlePos = %obj.getMuzzlePoint(%slot);
   %muzzleVec = %obj.getMuzzleVector(%slot);

   %endPos    = VectorAdd(%muzzlePos, VectorScale(%muzzleVec, %this.projectile.extension));

   %damageMasks = $TypeMasks::PlayerObjectType | $TypeMasks::VehicleObjectType |
      $TypeMasks::StationObjectType | $TypeMasks::GeneratorObjectType |
      $TypeMasks::SensorObjectType | $TypeMasks::TurretObjectType;

   %everythingElseMask = $TypeMasks::TerrainObjectType |
                         $TypeMasks::InteriorObjectType |
                         $TypeMasks::ForceFieldObjectType |
                         $TypeMasks::StaticObjectType |
                         $TypeMasks::MoveableObjectType |
                         $TypeMasks::DamagableItemObjectType;

   // did I miss anything? players, vehicles, stations, gens, sensors, turrets
   %hit = ContainerRayCast(%muzzlePos, %endPos, %damageMasks | %everythingElseMask, %obj);

   %noDisplay = true;

   if (%hit !$= "0")
   {
      %obj.setEnergyLevel(%obj.getEnergyLevel() - %this.hitEnergy);

      %hitobj = getWord(%hit, 0);
      %hitpos = getWord(%hit, 1) @ " " @ getWord(%hit, 2) @ " " @ getWord(%hit, 3);

      if ( %hitObj.getType() & %damageMasks )
      {
         // TR2:  Don't allow friendly lances
         if (%obj.team == %hitobj.team)
            return;
            
         %hitobj.applyImpulse(%hitpos, VectorScale(%muzzleVec, %this.projectile.impulse));
         %obj.playAudio(0, ShockLanceHitSound);

         // This is truly lame, but we need the sourceobject property present...
         %p = new ShockLanceProjectile() {
            dataBlock        = %this.projectile;
            initialDirection = %obj.getMuzzleVector(%slot);
            initialPosition  = %obj.getMuzzlePoint(%slot);
            sourceObject     = %obj;
            sourceSlot       = %slot;
            targetId         = %hit;
         };
         MissionCleanup.add(%p);

         %damageMultiplier = 1.0;

         if(%hitObj.getDataBlock().getClassName() $= "PlayerData")
         {
            // Now we see if we hit from behind...
            %forwardVec = %hitobj.getForwardVector();
            %objDir2D   = getWord(%forwardVec, 0) @ " " @ getWord(%forwardVec,1) @ " " @ "0.0";
            %objPos     = %hitObj.getPosition();
            %dif        = VectorSub(%objPos, %muzzlePos);
            %dif        = getWord(%dif, 0) @ " " @ getWord(%dif, 1) @ " 0";
            %dif        = VectorNormalize(%dif);
            %dot        = VectorDot(%dif, %objDir2D);

            // 120 Deg angle test...
            // 1.05 == 60 degrees in radians
            if (%dot >= mCos(1.05)) {
               // Rear hit
               %damageMultiplier = 3.0;
            }
         }

         %totalDamage = %this.Projectile.DirectDamage * %damageMultiplier;
         %hitObj.getDataBlock().damageObject(%hitobj, %p.sourceObject, %hitpos, %totalDamage, $DamageType::ShockLance);

         %noDisplay = false;
      }
   }

   if( %noDisplay )
   {
      // Miss
      %obj.setEnergyLevel(%obj.getEnergyLevel() - %this.missEnergy);
      %obj.playAudio(0, ShockLanceMissSound);

      %p = new ShockLanceProjectile() {
         dataBlock        = %this.projectile;
         initialDirection = %obj.getMuzzleVector(%slot);
         initialPosition  = %obj.getMuzzlePoint(%slot);
         sourceObject     = %obj;
         sourceSlot       = %slot;
      };
      MissionCleanup.add(%p);

   }
}


function Armor::onCollision(%this,%obj,%col,%forceVehicleNode)
{
   // Don't allow corpse looting
   %dataBlock = %col.getDataBlock();
   %className = %dataBlock.className;
   if (%className $= "Armor")
      if (%col.getState() $= "Dead")
         return;
      
   Parent::onCollision(%this, %obj, %col, %forceVehicleNode);
   
   if (%obj.getState() $= "Dead")
      return;
      
   %obj.delayRoleChangeTime = getSimTime();

   %dataBlock = %col.getDataBlock();
   %className = %dataBlock.className;
   %client = %obj.client;
   if (%className $= "Armor")
   {
         if (%col.getState() $= "Dead" || %obj.invincible)
            return;
            
         CollisionBonus.evaluate(%obj, %col);
   }
}

function Armor::onDisabled(%this, %obj, %state)
{
   Game.assignOutermostRole(%obj.client);
   if (!$TR2::DisableDeath || %obj.client.forceRespawn)
      Parent::onDisabled(%this, %obj, %state);
}

function Armor::damageObject(%data, %targetObject, %sourceObject, %position, %amount, %damageType, %momVec, %mineSC)
{
   //echo("Armor::damageObject()   (targetClient = " @ getTaggedString(%targetObject.client.name) @ ")");
   //echo("Armor::damageObject()   (sourceClient = " @ getTaggedString(%sourceObject.client.name) @ ")");
   //echo("Armor::damageObject()   (sourceObj = " @ %sourceObject @ ")");

   if (Game.goalJustScored)
      return;
      
   //if (%sourceObject == 0)
   //{
      //%targetObject.schedule(2, "setDataBlock", TR2HeavyMaleHumanArmor);
      %targetObject.delayRoleChangeTime = getSimTime();
   //}
   return Parent::DamageObject(%data, %targetObject, %sourceObject, %position, %amount, %damageType, %momVec, %mineSC);
}

function ShapeBase::getHeight(%this)
{
   %z = getWord(%this.getPosition(), 2);
   return (%z - getTerrainHeight(%this.getPosition()));
}

function ShapeBase::getSpeed(%this)
{
   return (VectorLen(%this.getVelocity()));
}

function ShapeBase::isOutOfBounds(%this)
{
   %shapePos = %this.getPosition();
   %shapex = firstWord(%shapePos);
   %shapey = getWord(%shapePos, 1);
   %bounds = MissionArea.area;
   %boundsWest = firstWord(%bounds);
   %boundsNorth = getWord(%bounds, 1);
   %boundsEast = %boundsWest + getWord(%bounds, 2);
   %boundsSouth = %boundsNorth + getWord(%bounds, 3);
   
   return (%shapex < %boundsWest  || %shapex > %boundsEast ||
       %shapey < %boundsNorth || %shapey > %boundsSouth);
}

function ShapeBase::bounceOffGrid(%this, %bounceForce)
{
   if (%bounceForce $= "")
      %bounceForce = 85;
      
   %oldVel = %this.getVelocity();
   %this.setVelocity("0 0 0");

   %vecx = firstWord(%oldVel);
   %vecy = getWord(%oldVel, 1);
   %vecz = getWord(%oldVel, 2);

   %shapePos = %this.getPosition();
   %shapex = firstWord(%shapePos);
   %shapey = getWord(%shapePos, 1);
   %bounds = MissionArea.area;
   %boundsWest = firstWord(%bounds);
   %boundsNorth = getWord(%bounds, 1);
   %boundsEast = %boundsWest + getWord(%bounds, 2);
   %boundsSouth = %boundsNorth + getWord(%bounds, 3);

   // Two cases:  1) object is at E or W side; 2) object is at N or S side
   if((%shapex <= %boundsWest) || (%shapex >= %boundsEast))
      %vecx = -%vecx;
   else
      %vecy = -%vecy;

   %vec = %vecx SPC %vecy SPC %vecz;

   // normalize the vector, scale it
   //%vecNorm = VectorNormalize(%vec);
   //%vec = VectorScale(%vecNorm, 100 * %bounceForce);

   // If the object's speed was pretty slow, give it a boost
   %oldSpeed = VectorLen(%oldVel);
   if (%oldSpeed < $TR2_MinimumGridBoost)
   {
      %vec = VectorNormalize(%vec);
      %vec = VectorScale(%vec, $TR2_MinimumGridBoost);
   }
   else
      %vec = VectorScale(%vec, $TR2_GridVelocityScale);

   // apply the impulse to the flag object
   //%this.applyImpulse(%this.getWorldBoxCenter(), %vec);
   %this.setVelocity(%vec);
}

function Observer::setMode(%data, %obj, %mode, %targetObj)
{
   if(%mode $= "")
      return;

   %client = %obj.getControllingClient();
   
   %obsVector = $TR2_playerObserveParameters;
   
   if (%client > 0 && %client.obsZoomLevel !$= "")
      %zoomLevel = %client.obsZoomLevel;
   else
      %zoomLevel = 0;
   %obsVector = VectorScale(%obsVector, $TR2::ObsZoomScale[%zoomLevel]);
   
   %obsx = getWord(%obsVector, 0);
   %obsy = getWord(%obsVector, 1);
   %obsz = getWord(%obsVector, 2);

   switch$ (%mode) {
      case "justJoined":
		   commandToClient(%client, 'setHudMode', 'Observer');
         %markerObj = Game.pickObserverSpawn(%client, true);
         %transform = %markerObj.getTransform();
         %obj.setTransform(%transform);
         %obj.setFlyMode();
         
      case "followFlag":
         // Follow the dropped flag (hopefully)
    	 %position = %targetObj.getPosition();
	     %newTransform = %position SPC %client.lastObsRot;
         %obj.setOrbitMode(%targetObj, %newTransform, %obsx, %obsy, %obsz);
         //%obj.setOrbitMode(%targetObj, %targetObj.getTransform(), %obsx, %obsy, %obsz);
         %obj.mode = %mode;
         
         
      case "pre-game":
		   commandToClient(%client, 'setHudMode', 'Observer');
         %obj.setOrbitMode( %targetObj, %targetObj.getTransform(), %obsx, %obsy, %obsz);

      case "observerFollow":
         // Observer attached to a moving object (assume player for now...)
       	 %position = %targetObj.getPosition();
	     %transform = %position SPC %client.lastObsRot;

         //%obj.setOrbitMode(%targetObj, %newTransform, %obsx, %obsy, %obsz);
         //%transform = %targetObj.getTransform();

         if( !%targetObj.isMounted() )
            %obj.setOrbitMode(%targetObj, %transform, %obsx, %obsy, %obsz);
         else
         {
            %mount = %targetObj.getObjectMount();
            if( %mount.getDataBlock().observeParameters $= "" )
               %params = %transform;
            else
               %params = %mount.getDataBlock().observeParameters;

            %obj.setOrbitMode(%mount, %mount.getTransform(), getWord( %params, 0 ), getWord( %params, 1 ), getWord( %params, 2 ));
         }
      case "observerFly":
         // Free-flying observer camera
		   commandToClient(%client, 'setHudMode', 'Observer');
         %markerObj = Game.pickObserverSpawn(%client, true);
         %transform = %markerObj.getTransform();
         %obj.setTransform(%transform);
         %obj.setFlyMode();
      
      case "observerStatic" or "observerStaticNoNext":
         // Non-moving observer camera
         %markerObj = Game.pickObserverSpawn(%client, true);
         %transform = %markerObj.getTransform();
         %obj.setTransform(%transform);
      
      case "observerTimeout":
		   commandToClient(%client, 'setHudMode', 'Observer');
         %markerObj = Game.pickObserverSpawn(%client, true);
         %transform = %markerObj.getTransform();
         %obj.setTransform(%transform);
         %obj.setFlyMode();
   }
   %obj.mode = %mode;   
}

function ShapeBaseImageData::onFire(%data, %obj, %slot)
{
   //if (Game.goalJustScored)
   //   return;
      
   %data.lightStart = getSimTime();

   // TR2:  No need for cloak logic
   //if( %obj.station $= "" && %obj.isCloaked() )
   //{
   //   if( %obj.respawnCloakThread !$= "" )
   //   {
   //      Cancel(%obj.respawnCloakThread);
   //      %obj.setCloaked( false );
   //      %obj.respawnCloakThread = "";
   //   }
   //   else
   //   {
   //      if( %obj.getEnergyLevel() > 20 )
   //      {
   //         %obj.setCloaked( false );
   //         %obj.reCloak = %obj.schedule( 500, "setCloaked", true );
   //     }
   //   }
   //}

   // TR2:  Delay the disabling of invincibility to allow one free disc jump
   if( %obj.client > 0 )
   {
      %obj.setInvincibleMode(0 ,0.00);
      %obj.schedule(200, "setInvincible", false ); // fire your weapon and your invincibility goes away.
   }

   %vehicle = 0;
   if(%data.usesEnergy)
   {
      if(%data.useMountEnergy)
      {
         %useEnergyObj = %obj.getObjectMount();
         if(!%useEnergyObj)
            %useEnergyObj = %obj;
         %energy = %useEnergyObj.getEnergyLevel();
         %vehicle = %useEnergyObj;
      }
      else
         %energy = %obj.getEnergyLevel();

      if(%data.useCapacitor && %data.usesEnergy)
      {
         if( %useEnergyObj.turretObject.getCapacitorLevel() < %data.minEnergy )
         {
            return;
         }
      }
      else if(%energy < %data.minEnergy)
         return;
   }
   if(%data.projectileSpread)
   {
      %vector = %obj.getMuzzleVector(%slot);
      %x = (getRandom() - 0.5) * 2 * 3.1415926 * %data.projectileSpread;
      %y = (getRandom() - 0.5) * 2 * 3.1415926 * %data.projectileSpread;
      %z = (getRandom() - 0.5) * 2 * 3.1415926 * %data.projectileSpread;
      %mat = MatrixCreateFromEuler(%x @ " " @ %y @ " " @ %z);
      %vector = MatrixMulVector(%mat, %vector);

      %p = new (%data.projectileType)() {
         dataBlock        = %data.projectile;
         initialDirection = %vector;
         initialPosition  = %obj.getMuzzlePoint(%slot);
         sourceObject     = %obj;
         sourceSlot       = %slot;
         vehicleObject    = %vehicle;
      };
   }
   else
   {
      %p = new (%data.projectileType)() {
         dataBlock        = %data.projectile;
         initialDirection = %obj.getMuzzleVector(%slot);
         initialPosition  = %obj.getMuzzlePoint(%slot);
         sourceObject     = %obj;
         sourceSlot       = %slot;
         vehicleObject    = %vehicle;
      };
     // echo("blah");
   }

   if (isObject(%obj.lastProjectile) && %obj.deleteLastProjectile)
      %obj.lastProjectile.delete();

   %obj.lastProjectile = %p;
   %obj.deleteLastProjectile = %data.deleteLastProjectile;
   MissionCleanup.add(%p);

   // AI hook
   if(%obj.client)
      %obj.client.projectile = %p;

   if(%data.usesEnergy)
   {
      if(%data.useMountEnergy)
      {
         if( %data.useCapacitor )
         {
            %vehicle.turretObject.setCapacitorLevel( %vehicle.turretObject.getCapacitorLevel() - %data.fireEnergy );
         }
         else
            %useEnergyObj.setEnergyLevel(%energy - %data.fireEnergy);
      }
      else
         %obj.setEnergyLevel(%energy - %data.fireEnergy);
   }
   else
      %obj.decInventory(%data.ammo,1);
   return %p;
}

function updateScores()
{
   if ( !isObject( Game ) )
      return;

   %numTeams = Game.numTeams;

   // Initialize the team counts:
   for ( %teamIndex = 0; %teamIndex <= %numTeams; %teamIndex++ )
      Game.teamCount[%teamIndex] = 0;

   %count = ClientGroup.getCount();
   for ( %clientIndex = 0; %clientIndex < %count; %clientIndex++ )
   {
      %cl = ClientGroup.getObject( %clientIndex );
      %team = %cl.getSensorGroup();
      if ( %numTeams == 1 && %team != 0 )
         %team = 1;
      Game.teamScores[%team, Game.teamCount[%team], 0] = %cl.name;
      if ( %cl.score $= "" )
         Game.teamScores[%team, Game.teamCount[%team], 1] = 0;
      else
         Game.teamScores[%team, Game.teamCount[%team], 1] = %cl.passingScore + %cl.receivingScore;
      Game.teamCount[%team]++;
   }
}

// Ugly, non-gametype specific code to deal with tourney mode :/
function serverCmdClientPickedTeam( %client, %option )
{
	if( Game.class $= "TR2Game" && %client.lastTeam <= 0 )
	{
		Game.forceObserver( %client, "playerChoose" );
		return;
	}
				
	switch(%option)
	{
		case 1:
			if ( isObject(%client.player) )
			{
				%client.player.scriptKill(0);
				Game.clientChangeTeam(%client, %option, 0);
			}
			else
				Game.clientJoinTeam( %client, %option, false );
		case 2:
			if ( isObject(%client.player) )
			{
				%client.player.scriptKill(0);
				Game.clientChangeTeam(%client, %option, 0);
			}
			else
				Game.clientJoinTeam( %client, %option, false );
		case 3:
			if( !isObject(%client.player) )
			{
				Game.assignClientTeam( %client, $MatchStarted );
				Game.spawnPlayer( %client, false );	
			}
		default:	
			if( isObject(%client.player) )
			{
				%client.player.scriptKill(0);
				ClearBottomPrint(%client);
			}
			Game.forceObserver( %client, "playerChoose" );
			%client.observerMode = "observer";
			%client.notReady = false;
			return;
	}
	// End z0dd - ZOD
	// ------------------------------------------------------------------------------------
	ClearBottomPrint(%client);
	%client.observerMode = "pregame";
	%client.notReady = true;
	%client.camera.getDataBlock().setMode( %client.camera, "pre-game", %client.player );
	commandToClient(%client, 'setHudMode', 'Observer');


	%client.setControlObject( %client.camera );
	centerprint( %client, "\nPress FIRE when ready.", 0, 3 );
}

function playerPickTeam( %client )
{
	if( Game.class $= "TR2Game" )
	{
		if( %client.lastTeam > 0 )
			schedule( 0, 0, "commandToClient", %client, 'pickTeamMenu', Game.getTeamName(1), Game.getTeamName(2));
	}
	else
	{
		%numTeams = Game.numTeams;
		if(%numTeams > 1)
		{
			%client.camera.mode = "PickingTeam";
			schedule( 0, 0, "commandToClient", %client, 'pickTeamMenu', Game.getTeamName(1), Game.getTeamName(2));
		}
		else
		{
			Game.clientJoinTeam(%client, 0, 0);
			%client.observerMode = "pregame";
			%client.notReady = true;
			%client.camera.getDataBlock().setMode( %client.camera, "pre-game", %client.player );
			centerprint( %client, "\nPress FIRE when ready.", 0, 3 );
			%client.setControlObject( %client.camera );
		}
	}
}

function Beacon::onUse(%data, %obj)
{
   // look for 3 meters along player's viewpoint for interior or terrain
   // TR2:  increased
   //%searchRange = 3.0;
   %searchRange = 5.2;
   %mask = $TypeMasks::TerrainObjectType | $TypeMasks::InteriorObjectType | $TypeMasks::StaticShapeObjectType | $TypeMasks::ForceFieldObjectType;
   // get the eye vector and eye transform of the player
   %eyeVec = %obj.getEyeVector();
   %eyeTrans = %obj.getEyeTransform();
   // extract the position of the player's camera from the eye transform (first 3 words)
   %eyePos = posFromTransform(%eyeTrans);
   // normalize the eye vector
   %nEyeVec = VectorNormalize(%eyeVec);
   // scale (lengthen) the normalized eye vector according to the search range
   %scEyeVec = VectorScale(%nEyeVec, %searchRange);
   // add the scaled & normalized eye vector to the position of the camera
   %eyeEnd = VectorAdd(%eyePos, %scEyeVec);
   // see if anything gets hit
   %searchResult = containerRayCast(%eyePos, %eyeEnd, %mask, 0);
   if(!%searchResult )
   {
      // no terrain/interior collision within search range
      if(%obj.inv[%data.getName()] > 0)
         messageClient(%obj.client, 'MsgBeaconNoSurface', '\c2Cannot place beacon. Too far from surface.');
      return 0;
   }
   else
   {
      %searchObj = GetWord(%searchResult, 0);
      if(%searchObj.getType() & ($TypeMasks::StaticShapeObjectType | $TypeMasks::ForceFieldObjectType) )
      {
         // if there's already a beacon where player is aiming, switch its type
         // otherwise, player can't deploy a beacon there
         if(%searchObj.getDataBlock().getName() $= TR2DeployedBeacon)
            switchBeaconType(%searchObj);
         else
            messageClient(%obj.client, 'MsgBeaconNoSurface', '\c2Cannot place beacon. Not a valid surface.');
         return 0;
      }
      else if(%obj.inv[%data.getName()] <= 0)
         return 0;
   }
   // newly deployed beacons default to "target" type
   //if($TeamDeployedCount[%obj.team, TargetBeacon] >= $TeamDeployableMax[TargetBeacon])
   //{
   //   messageClient(%obj.client, 'MsgDeployFailed', '\c2Your team\'s control network has reached its capacity for this item.~wfx/misc/misc.error.wav');
   //   return 0;
   //}
   %terrPt = posFromRaycast(%searchResult);
   %terrNrm = normalFromRaycast(%searchResult);

   %intAngle = getTerrainAngle(%terrNrm);  // getTerrainAngle() function found in staticShape.cs
   %rotAxis = vectorNormalize(vectorCross(%terrNrm, "0 0 1"));
   if (getWord(%terrNrm, 2) == 1 || getWord(%terrNrm, 2) == -1)
      %rotAxis = vectorNormalize(vectorCross(%terrNrm, "0 1 0"));
   %rotation = %rotAxis @ " " @ %intAngle;

   // TR2:  T1-style beacon stop
   %playerSpeed = %obj.getSpeed();
   if (%obj.isJetting)
      %obj.setVelocity("0 0 " @ %playerSpeed * $TR2_beaconStopScale);
   else
      %obj.setVelocity("0 0 0");
   if (%playerSpeed > 17)
      serverPlay3D(CarScreechSound, %obj.getPosition());

   %obj.decInventory(%data, 1);
   %depBeac = new BeaconObject() {
      dataBlock = "DeployedBeacon";
      position = VectorAdd(%terrPt, VectorScale(%terrNrm, 0.05));
      rotation = %rotation;
   };
   //$TeamDeployedCount[%obj.team, TargetBeacon]++;

   // TR2:  Auto-delete beacon
   %depBeac.startFade(2 * 1000, 0, true);
   %depBeac.schedule(3 * 1000, "delete");


   %depBeac.playThread($AmbientThread, "ambient");
   %depBeac.team = %obj.team;
   %depBeac.sourceObject = %obj;

   // give it a team target
   %depBeac.setTarget(%depBeac.team);
   MissionCleanup.add(%depBeac);
}

function ShapeBase::throwObject(%this,%obj)
{
   //if the object is being thrown by a corpse, use a random vector
   if (%this.getState() $= "Dead" && %obj.getDataBlock().getName() !$= "TR2Flag1" )
   {
      %vec = (-1.0 + getRandom() * 2.0) SPC (-1.0 + getRandom() * 2.0) SPC getRandom();
      %vec = vectorScale(%vec, 10);
   }

   // else Initial vel based on the dir the player is looking
   else
   {
      %eye = %this.getEyeVector();
      %vec = vectorScale(%eye, 20);
   }

   // Add player's velocity
   %vec = vectorAdd(%vec, %this.getVelocity());
   %pos = getBoxCenter(%this.getWorldBox());

   // Add a vertical component to give the item a better arc
   %dot = vectorDot("0 0 1",%eye);
   if (%dot < 0)
      %dot = -%dot;



   //since flags have a huge mass (so when you shoot them, they don't bounce too far)
   //we need to up the %vec so that you can still throw them...
   if (%obj.getDataBlock().getName() $= "TR2Flag1")
   {
      // Add the throw strength, which ranges from 0.2 - 1.2
      // Make it range from 0 - 1
      //%addedStrength = %this.flagThrowStrength/1.25 - 0.2;
      %addedStrength = %this.flagThrowStrength - 0.2;
      %addedStrength *= $TR2_FlagThrowScale;

      %vec = vectorAdd(%vec,vectorScale("0 0 " @ $TR2_UpwardFlagThrust,1 - %dot));
      %flagVel = %this.getVelocity();
      %playerRot = %this.getEyeVector();
      %testDirection = VectorDot(VectorNormalize(%playerVel), VectorNormalize(%playerRot));
   //%flagVel = VectorScale(%flagVel, 50);
      %playerVel = VectorNormalize(%this.getVelocity());
      if (%obj.oneTimer)
      {
         %playerVel = VectorScale(%playerVel, $TR2_PlayerVelocityAddedToFlagThrust / 1.3);
         %addedStrength *= 1.1;
         //%obj.oneTimer = 0;
      }
      else
         %playerVel = VectorScale(%playerVel, $TR2_PlayerVelocityAddedToFlagThrust);
      %playerRot = VectorScale(%playerRot, $TR2_ForwardFlagThrust * %addedStrength);
      //%pos = VectorAdd(VectorNormalize(%playerRot), %this.getPosition());

      %vec = VectorAdd(%vec, %playerVel);
      %vec = VectorAdd(%vec, %playerRot);


   // Don't apply the velocity impulse if the player is facing one direction
   // but travelling in the other
   //if (%testDirection > -0.85)
      %newVel = VectorAdd(%playerVel, %newVel);

   // apply the impulse to the flag object
   //%flag.applyImpulse(%flag.getPosition(), %newVel);
      %vec = vectorScale(%vec, $TR2_GeneralFlagBoost);
        //%vec = %newVel;
      //echo("applying flag impulse:  " @ %vec);
      
      // Remember the throw velocity in case T2's flag re-catch bug rears
      // its ugly head, and we need to re-boost it
      //%obj.throwVelocity = %vec;
      
      // Try adjust the flag to start further away from the player in order to
      // bypass T2's re-catch bug
      %extend = VectorScale(VectorNormalize(%this.getEyeVector()), 2);
      %pos = VectorAdd(%extend, %pos);

      %this.throwStrength = 0;
   }

   %obj.setTransform(%pos);
   %obj.applyImpulse(%pos,%vec);
   %obj.setCollisionTimeout(%this);
   %data = %obj.getDatablock();
   %data.onThrow(%obj,%this);

   //call the AI hook
   //AIThrowObject(%obj);
}

// classic hoses this up.
// using the grenade throw from 24834
function HandInventory::onUse(%data, %obj)
{
   // %obj = player  %data = datablock of what's being thrown
   if(Game.handInvOnUse(%data, %obj))
   {
      //AI HOOK - If you change the %throwStren, tell Tinman!!!
      //Or edit aiInventory.cs and search for: use(%grenadeType);

      %tossTimeout = getSimTime() - %obj.lastThrowTime[%data];
      if(%tossTimeout < $HandInvThrowTimeout)
         return;

      %throwStren = %obj.throwStrength;

      %obj.decInventory(%data, 1);
      %thrownItem = new Item()
      {
         dataBlock = %data.thrownItem;
         sourceObject = %obj;
      };
      MissionCleanup.add(%thrownItem);
      
      // throw it
      %eye = %obj.getEyeVector();
      %vec = vectorScale(%eye, (%throwStren * 20.0));
      
      // add a vertical component to give it a better arc
      %dot = vectorDot("0 0 1", %eye);
      if(%dot < 0)
         %dot = -%dot;
      %vec = vectorAdd(%vec, vectorScale("0 0 4", 1 - %dot));
      
      // add player's velocity
      %vec = vectorAdd(%vec, vectorScale(%obj.getVelocity(), 0.4));
      %pos = getBoxCenter(%obj.getWorldBox());
      

      %thrownItem.sourceObject = %obj;
      %thrownItem.team = %obj.team;
      %thrownItem.setTransform(%pos);
      
      %thrownItem.applyImpulse(%pos, %vec);
      %thrownItem.setCollisionTimeout(%obj);
      serverPlay3D(GrenadeThrowSound, %pos);
      %obj.lastThrowTime[%data] = getSimTime();

      %thrownItem.getDataBlock().onThrow(%thrownItem, %obj);
      %obj.throwStrength = 0;
   }
}

};
