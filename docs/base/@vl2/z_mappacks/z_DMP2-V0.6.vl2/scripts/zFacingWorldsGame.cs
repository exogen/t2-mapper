$FW::RedeemerRespawnTime  = 3 * 60000;// its 2 min in unreal

datablock StaticShapeData(faceBox){
   catagory = "MISC";
   shapeFile = "faceBox.dts";
   alwaysAmbient = true;
   isInvincible = true;
};

datablock TriggerData(faceDeathTrigger){
   tickPeriodMS =  1000;
};

function faceBox::onAdd(%this, %obj){
   Parent::onAdd(%this, %obj);
   if (!isActivePackage(deployfix)){
         activatePackage(deployfix);
   }
   if(!isEventPending($faceEvent)){
      faceFlagReset();
   }
   
}
function faceBox::onRemove(%this, %obj){
   if (isActivePackage(deployfix)){
      deactivatePackage(deployfix);
   }
}
 
 package deployfix{
   function ShapeBaseImageData::testObjectTooClose(%item)
   {
      %obj = parent::testObjectTooClose(%item);
      if(%obj.getDatablock().getName() $= "faceBox"){
         return 0;
      }

   }

 };

function faceDeathTrigger::onEnterTrigger(%data, %trigger, %player){
	%player.damage(0, %player.getPosition(), 100, $DamageType::Suicide);
}

function faceDeathTrigger::onleaveTrigger(%data, %trigger, %player){
	return;
}

function faceDeathTrigger::onTickTrigger(%data, %trig){
	return;
}

function faceFlagReset(){
	if(Game.class $= "CTFGame" || Game.class $= "LCTFGame" || Game.class $= "SCtFGame" || Game.class $= "PracticeCTFGame"){
		if(isObject($TeamFlag[1]) && isObject($TeamFlag[2])){
			%z1 = getWords($TeamFlag[1].getPosition(),2);
			%z2 = getWords($TeamFlag[2].getPosition(),2);
			if(%z1 < 1700){
				Game.flagReturn($TeamFlag[1]);
			}
			if(%z2 < 1700){
				Game.flagReturn($TeamFlag[2]);
			}
		}
		if(isObject(mapStartObj)){
			$faceEvent = schedule(1000, 0, "faceFlagReset");
		}
	}
}


package lctfDelete{
   //AutoRemove assets, sensors, and turrets from non-LT maps
   function deleteNonLCTFObjects()
   {
      %c = 0;
      InitContainerRadiusSearch("0 0 0", 9999, $TypeMasks::ItemObjectType |
      $TypeMasks::TurretObjectType | $TypeMasks::VehicleObjectType | $TypeMasks::StaticShapeObjectType); //For FF: $TypeMasks::ForceFieldObjectType
      while ((%obj = containerSearchNext()) != 0)
      {
         if(%obj.Datablock !$= "flag" && 
         %obj.Datablock !$= "RepairKit" && 
         %obj.Datablock !$= "RepairPatch" && 
         %obj.Datablock !$= "ExteriorFlagStand" && 
         %obj.Datablock !$= "InteriorFlagStand" && 
         %obj.Datablock !$= "NexusBase" &&
         %obj.dontDelete != 1) //Dont delete these...
         {
            %deleteList[%c] = %obj;
            %c++;
         }
      }
      for(%i = 0; %i  < %c; %i++)
      {
          %deleteList[%i].delete();
      }

      //Delete all ForceField PhysicalZones (PZones)
      // if(isObject(PZones))
      //    PZones.schedule(1500,"delete");
   }   
   
};
if(!isActivePackage(lctfDelete))
      activatePackage(lctfDelete);





 datablock ItemData(Redeemer){
   className = Weapon;
   catagory = "Spawn Items";
   shapeFile = "redeemer.dts";
   image = RedeemerImage;
   mass = 1;
   elasticity = 0.2;
   friction = 0.6;
   pickupRadius = 2;
   pickUpName = "a redeemer weapon";
   computeCRC = false; 
   
   description = "The Redeemer is a portable thermonuclear warhead launcher."; 
};

datablock ItemData(RedeemerAmmo){
   className = Ammo;
   catagory = "Ammo";
   shapeFile = "ammo_disc.dts";
   mass = 1;
   elasticity = 0.2;
   friction = 0.6;
   pickupRadius = 2;
	pickUpName = "a redeemer ammo";
};

datablock ShapeBaseImageData(RedeemerImage){
   className = WeaponImage;
   shapeFile = "redeemer.dts";
   item = Redeemer;
   ammo = RedeemerAmmo;
   offset = "0 0 0";
   projectile = PlasmaBolt;
   projectileType = LinearFlareProjectile;
   
   stateName[0] = "Activate";
   stateTransitionOnTimeout[0] = "ActivateReady";
   stateTimeoutValue[0] = 0.5;
   stateSequence[0] = "Activate";
   stateSound[0] = PlasmaSwitchSound;
   stateName[1] = "ActivateReady";
   stateTransitionOnLoaded[1] = "Ready";
   stateTransitionOnNoAmmo[1] = "NoAmmo";
   stateName[2] = "Ready";
   stateTransitionOnNoAmmo[2] = "NoAmmo";
   stateTransitionOnTriggerDown[2] = "CheckWet";
   stateName[3] = "Fire";
   stateTransitionOnTimeout[3] = "Reload";
   stateTimeoutValue[3] = 0.1;
   stateFire[3] = true;
   stateRecoil[3] = LightRecoil;
   stateAllowImageChange[3] = false;
   stateScript[3] = "onFire";
   stateEmitterTime[3] = 0.2;
   stateSound[3] = PlasmaFireSound;
   stateName[4] = "Reload";
   stateTransitionOnNoAmmo[4] = "NoAmmo";
   stateTransitionOnTimeout[4] = "Ready";
   stateTimeoutValue[4] = 0.6;
   stateAllowImageChange[4] = false;
   stateSequence[4] = "Reload";
   stateSound[4] = PlasmaReloadSound;
   stateName[5] = "NoAmmo";
   stateTransitionOnAmmo[5] = "Reload";
   stateSequence[5] = "NoAmmo";
   stateTransitionOnTriggerDown[5] = "DryFire";
   stateName[6]       = "DryFire";
   stateSound[6]      = PlasmaDryFireSound;
   stateTimeoutValue[6]        = 1.5;
   stateTransitionOnTimeout[6] = "NoAmmo";
   stateName[7]       = "WetFire";
   stateSound[7]      = PlasmaFireWetSound;
   stateTimeoutValue[7]        = 1.5;
   stateTransitionOnTimeout[7] = "Ready";
   stateName[8]               = "CheckWet";
   stateTransitionOnWet[8]    = "WetFire";
   stateTransitionOnNotWet[8] = "Fire";
};

datablock AudioProfile(BotDroneEngineSound){
   filename    = "fx/weapons/missile_projectile.wav";
   description = AudioDefaultLooping3d;
   preload = true;
};


datablock ParticleData(RedeemerExplosionParticle) {//fire
   dragCoefficient = "9";
   windCoefficient = "0";
   gravityCoefficient = "0";
   inheritedVelFactor = "0";
   constantAcceleration = "0";
   lifetimeMS = "3000";
   lifetimeVarianceMS = "0";
   spinSpeed = "0";
   spinRandomMin = "-360";
   spinRandomMax = "720";
   useInvAlpha = "0";
   textureName = "particleTest";
   colors[0] = "0.992 0.4 0 1";
   colors[1] = "0.992 0.301961 0.00784314 1";
   colors[2] = "0.996078 0.301961 0.00784314 0";
   colors[3] = "0.980392 0.301961 0.0156863 0";
   sizes[0] = "100";
   sizes[1] = "100";
   sizes[2] = "100";
   sizes[3] = "100";
   times[0] = "0";
   times[1] = "0.1";
   times[2] = "0.2";
   times[3] = "0.3";
};

datablock ParticleEmitterData(RedeemerExplosionEmitter) {//fire
   ejectionPeriodMS = "1";
   periodVarianceMS = "0";
   ejectionVelocity = "655.35";
   velocityVariance = "0";
   ejectionOffset = "20";
   ejectionOffsetVariance = "0";
   thetaMin = "0";
   thetaMax = "180";
   phiReferenceVel = "0";
   phiVariance = "360";
   ambientFactor = "0";
   overrideAdvance = "0";
   orientParticles = "0";
   orientOnVelocity = "1";
   particles = "RedeemerExplosionParticle";
   lifetimeMS = "500";
   lifetimeVarianceMS = "0";
   useInvAlpha = false;
   reverseOrder = "0";
   alignParticles = "0";
   alignDirection = "0 1 0";
};

datablock ParticleData(RedeemerExplosionParticle2) {//smoke
   dragCoefficient = "7";
   windCoefficient = "0";
   gravityCoefficient = "0";
   inheritedVelFactor = "0";
   constantAcceleration = "0";
   lifetimeMS = "15000";
   lifetimeVarianceMS = "0";
   spinSpeed = "0.083";
   spinRandomMin = "-10";
   spinRandomMax = "10";
   useInvAlpha = "1";
   animateTexture = "0";
   framesPerSec = "1";
   textureCoords[0] = "0 0";
   textureCoords[1] = "0 1";
   textureCoords[2] = "1 1";
   textureCoords[3] = "1 0";
   animTexTiling = "0 0";
   textureName = "particleTest";
   colors[0] = "0.529412 0.533333 0.533333 0.295";
   colors[1] = "0.537 0.537 0.541 0.238";
   colors[2] = "0.568627 0.568627 0.564706 0.292";
   colors[3] = "0.502 0.502 0.498 0";
   sizes[0] = "150";
   sizes[1] = "150";
   sizes[2] = "150";
   sizes[3] = "150";
   times[0] = "0";
   times[1] = "0.229167";
   times[2] = "0.6875";
   times[3] = "1";
};

datablock ParticleEmitterData(RedeemerExplosionEmitter2) {//smoke
   ejectionPeriodMS = "2";
   periodVarianceMS = "0";
   ejectionVelocity = "150";
   velocityVariance = "100.83";
   ejectionOffset = "0";
   ejectionOffsetVariance = "0";
   thetaMin = "0";
   thetaMax = "180";
   phiReferenceVel = "0";
   phiVariance = "360";
   softnessDistance = "0.0001";
   ambientFactor = "0";
   overrideAdvance = "0";
   orientParticles = "0";
   orientOnVelocity = "1";
   particles = "RedeemerExplosionParticle2";
   lifetimeMS = "1000";
   lifetimeVarianceMS = "0";
   
   
   blendStyle = "NORMAL";
   sortParticles = "1";
   reverseOrder = "0";
   alignParticles = "0";
   alignDirection = "0 1 0";
};

datablock ParticleData(RedeemerExplosionParticleS) {
   dragCoefficient = "1";
   windCoefficient = "0";
   gravityCoefficient = "0";
   inheritedVelFactor = "0";
   constantAcceleration = "1";
   lifetimeMS = "5376";
   lifetimeVarianceMS = "0";
   spinSpeed = "0";
   spinRandomMin = "-360";
   spinRandomMax = "720";
   useInvAlpha = "0";
   textureName = "particleTest";
   colors[0] = "0.984 0.992 0.992 0.1";
   colors[1] = "0.984 0.984 0.992 0.1";
   colors[2] = "0.996 0.996 0.992 0.1";
   colors[3] = "0.996 0.996 0.992 0";
   sizes[0] = "150";
   sizes[1] = "150";
   sizes[2] = "150";
   sizes[3] = "150";
   times[0] = "0";
   times[1] = "0.0416667";
   times[2] = "0.125";
   times[3] = "0.375";
};

datablock ParticleEmitterData(RedeemerExplosionEmitterS) { //wave
   ejectionPeriodMS = "1";
   periodVarianceMS = "0";
   ejectionVelocity = "655.34";
   velocityVariance = "0";
   ejectionOffset = "100";
   ejectionOffsetVariance = "0";
   thetaMin = "0";
   thetaMax = "180";
   phiReferenceVel = "0";
   phiVariance = "360";
   softnessDistance = "0.0001";
   ambientFactor = "0";
   overrideAdvance = "0";
   orientParticles = "0";
   orientOnVelocity = "1";
   particles = "RedeemerExplosionParticleS";
   lifetimeMS = "150";
   lifetimeVarianceMS = "0";
   
   
   useInvAlpha = false;
   sortParticles = "1";
   reverseOrder = "0";
   alignParticles = "0";
   alignDirection = "0 1 0";
};

datablock ExplosionData(RedeemerStrikeExplosion2){
   emitter[0] = RedeemerExplosionEmitterS;
   emitter[1] = RedeemerExplosionEmitterS;
   emitter[2] = RedeemerExplosionEmitterS;
   emitter[3] = RedeemerExplosionEmitterS;
   emitter[4] = RedeemerExplosionEmitterS;
};

datablock ExplosionData(RedeemerStrikeExplosion){
   explosionShape = "effect_plasma_explosion.dts";
   soundProfile   = BombExplosionSound;
   faceViewer           = true;
   emitter[0] = RedeemerExplosionEmitter;
   emitter[1] = RedeemerExplosionEmitter2;
   subExplosion[0] = RedeemerStrikeExplosion2;
   subExplosion[1] = RedeemerStrikeExplosion2;
   subExplosion[2] = RedeemerStrikeExplosion2;
   subExplosion[3] = RedeemerStrikeExplosion2;
   subExplosion[4] = RedeemerStrikeExplosion2;
   //emitter[2] = BlastRingEmitter;
   delayMS = 150;
   offset = 4.0;
   playSpeed = 0.8;

   sizes[0] = "70 70 70";
   sizes[1] = "70 70 70";
   times[0] = 0.0;
   times[1] = 1.0;
   shakeCamera = true;
   camShakeFreq = "8.0 9.0 7.0";
   camShakeAmp = "10.0 10.0 10.0";
   camShakeDuration = 2;
   camShakeRadius = 300.0;
};  

datablock FlyingVehicleData(RedeemerVeh) : ShrikeDamageProfile{
   spawnOffset = "0 0 0";
   catagory = "Vehicles";
   shapeFile = "turret_missile_large.dts";
   multipassenger = false;
   computeCRC = false;

   debrisShapeName = "debris_generic_small.dts";
   debris = ShapeDebris;
   renderWhenDestroyed = false;

   drag    = 0.4;
   density = 0.54;

   mountPose[0] = null;
   numMountPoints = 0;
   isProtectedMountPoint[0] = false;
   cameraMaxDist = 15;
   cameraOffset = 0.5;
   cameraLag = 0.8;
   explosion = RedeemerStrikeExplosion;
	explosionDamage = 0.0;
	explosionRadius = 0;

   maxDamage = 0.4;
   destroyedLevel = 0.4;

   isShielded = false;
   energyPerDamagePoint = 0;
   maxEnergy = 500;      // Afterburner and any energy weapon pool
   rechargeRate = 1.0;

   minDrag = 10;           // Linear Drag (eventually slows you down when not thrusting...constant drag)
   rotationalDrag = 200;        // Anguler Drag (dampens the drift after you stop moving the mouse...also tumble drag)

   maxAutoSpeed = 0;       // Autostabilizer kicks in when less than this speed. (meters/second)
   autoAngularForce = 400;       // Angular stabilizer force (this force levels you out when autostabilizer kicks in)
   autoLinearForce = 300;        // Linear stabilzer force (this slows you down when autostabilizer kicks in)
   autoInputDamping = 0.45;      // Dampen control input so you don't` whack out at very slow speeds

   // Maneuvering
   maxSteeringAngle = 4;    // Max radiens you can rotate the wheel. Smaller number is more maneuverable.
   horizontalSurfaceForce = 6;   // Horizontal center "wing" (provides "bite" into the wind for climbing/diving and turning)
   verticalSurfaceForce = 6;     // Vertical center "wing" (controls side slip. lower numbers make MORE slide.)
   maneuveringForce = 1800;      // Horizontal jets (W,S,D,A key thrust)
   steeringForce = 450;         // Steering jets (force applied when you move the mouse)
   steeringRollForce = 400;      // Steering jets (how much you heel over when you turn)
   rollForce = 8;                // Auto-roll (self-correction to right you after you roll/invert)
   hoverHeight = 3;        // Height off the ground at rest
   createHoverHeight = 8;  // Height off the ground when created
   maxForwardSpeed = 130;  // speed in which forward thrust force is no longer applied (meters/second)

   // Turbo Jet
   jetForce = 130;      // Afterburner thrust (this is in addition to normal thrust)
   minJetEnergy = 25;     // Afterburner can't be used if below this threshhold.
   jetEnergyDrain = 0.0;       // Energy use of the afterburners (low number is less drain...can be fractional)                                                                                                                                                                                                                                                                                          // Auto stabilize speed
   vertThrustMultiple = 9.5;

   // Rigid body
   mass = 30;        // Mass of the vehicle
   bodyFriction = 0;     // Don't mess with this.
   bodyRestitution = 2.2;   // When you hit the ground, how much you rebound. (between 0 and 1)
   minRollSpeed = 0;     // Don't mess with this.
   softImpactSpeed = 14;       
   hardImpactSpeed = 25;    

   
   minImpactSpeed = 100;     
   speedDamageScale = 0.06;

   
   collDamageThresholdVel = 23.0;
   collDamageMultiplier   = 0.02;

   minTrailSpeed = 15;      
   trailEmitter = ContrailEmitter;
   forwardJetEmitter = FlyerJetEmitter;
   downJetEmitter = FlyerJetEmitter;

   jetSound = ScoutFlyerThrustSound;
   engineSound = BotDroneEngineSound;
   softImpactSound = SoftImpactSound;
   hardImpactSound = HardImpactSound;

   softSplashSoundVelocity = 5.0;
   mediumSplashSoundVelocity = 15.0;
   hardSplashSoundVelocity = 20.0;
   exitSplashSoundVelocity = 10.0;

   exitingWater      = VehicleExitWaterMediumSound;
   impactWaterEasy   = VehicleImpactWaterSoftSound;
   impactWaterMedium = VehicleImpactWaterMediumSound;
   impactWaterHard   = VehicleImpactWaterMediumSound;
   waterWakeSound    = VehicleWakeMediumSplashSound;

   damageEmitter[0] = LightDamageSmoke;
   damageEmitter[2] = DamageBubbles;
   damageEmitterOffset[0] = "0.0 -3.0 0.0";
   damageLevelTolerance[0] = 0.1;
   numDmgEmitterAreas = 1;

   minMountDist = 4;

   splashEmitter[0] = VehicleFoamDropletsEmitter;
   splashEmitter[1] = VehicleFoamEmitter;

   shieldImpact = VehicleShieldImpact;

   cmdCategory = "Tactical";
   cmdIcon = CMDFlyingScoutIcon;
   cmdMiniIconName = "commander/MiniIcons/com_scout_grey";
   targetNameTag = '';
   targetTypeTag = 'RC Bomb';
   sensorData = AWACPulseSensor;
   sensorRadius = AWACPulseSensor.detectRadius;
   sensorColor = "255 194 9";

   checkRadius = 1.5;
   observeParameters = "1 10 10";

   shieldEffectScale = "0.337 0.825 0.30";
};


datablock StaticShapeData(FrakeRedeemer){
   shapeFile = "weapon_missile_projectile.dts";
};


function RedeemerVeh::onDestroyed(%this, %veh, %prevState){
   %pos = %veh.getPosition();
   %player = %veh.client.player;
   Parent::onDestroyed(%this, %veh, %prevState);
   RadiusExplosion(%veh, %pos, 100, 100, 9000, %player, $DamageType::Missile);
   // InitContainerRadiusSearch(%pos,  100, $TypeMasks::PlayerObjectType); 
   // while ((%targetObject = containerSearchNext()) != 0){
   //    %targetObject.setdamageflash(0.3);
   //    %targetObject.damage(%player, %pos, 50, $DamageType::Missile);
   // }
   resetControlObject(%veh.client);  
   %fakeflyer = %veh.getMountNodeObject(1);
   %fakeflyer.schedule(10, "delete");
}

function RedeemerVeh::onAdd(%this, %veh){ 
   Parent::onAdd(%this, %veh);
   %veh.startFade(0,0,true); 
   %fakeflyer = new StaticShape(){ 
      datablock = FrakeRedeemer; 
      scale = "3 5 3";
   };
   MissionCleanUp.add(%fakeflyer); 
   %veh.mountObject(%fakeflyer, 1);
}

function RedeemerVeh::onTrigger(%data, %vehicle, %trigger, %state){
   if (%Trigger == 3 || %Trigger == 2){
      if (%state){
         %vehicle.setDamagestate(Destroyed);
      }
      %vehicle.setImageTrigger(0, false);
   }
}

function RedeemerImage::onFire(%data, %obj, %slot){
   %obj.decInventory(%data.ammo, 1);
   %veh = new FlyingVehicle(){ 
      datablock = RedeemerVeh; 
      position =  vectorAdd(%obj.getMuzzlePoint(%slot), VectorScale(%obj.getMuzzleVector(%slot), 8));
      rotation =  %obj.rotation; 
      team = %obj.client.team; 
      owner= %obj.client; 
   };
   setTargetSensorGroup(%veh.getTarget(), %veh.team);
   %veh.client = %obj.client;
   %obj.client.veh = %veh;
   %obj.client.setControlObject(%veh);
   %objVel = %obj.getVelocity();

   %vehMass = %veh.getDataBlock().mass;
   %inheritImpulse = vectorScale(%objVel, %vehMass);

   // --- Add a forward launch impulse ---
   %forwardImpulse = vectorScale(%obj.getMuzzleVector(%slot), 600); // tweak this launch power

   // --- Combine both impulses ---
   %totalImpulse = vectorAdd(%inheritImpulse, %forwardImpulse);

   // Apply at a small offset to avoid torque weirdness
   %veh.applyImpulse(vectorAdd(%veh.getPosition(), "0 0 0.01"), %totalImpulse);
}

function Item::respawnRedeemer(%this){
   %this.startFade(0, 0, true);
   %this.schedule($FW::RedeemerRespawnTime + 100, "startFade", 1000, 0, false);
   %this.hide(true);
   %this.schedule($FW::RedeemerRespawnTime, "hide", false);
}

function Redeemer::onCollision(%data,%obj,%col){
   if (%col.getDataBlock().className $= Armor && %col.getState() !$= "Dead" && !%col.isMounted()){
      if (%col.client){
         messageClient(%col.client, 'MsgItemPickup', '\c0You picked up %1.', %data.pickUpName);
         serverPlay3D(ItemPickupSound, %col.getTransform());
      }
      if (%obj.isStatic()){
         %obj.respawnRedeemer();
      }
      else{
         %obj.delete();
      }
      %col.setInventory(Redeemer, 1, true);
      %col.setInventory(RedeemerAmmo, 1, true);
      %col.use(Redeemer);
   }
}


function RedeemerImage::onMount(%this,%obj,%slot){
   Parent::onMount(%this, %obj, %slot);
   commandToClient( %obj.client, 'BottomPrint', %this.item.wepNameID SPC %this.item.wepName NL %this.item.description, 4, 3);
   %obj.client.setWeaponsHudActive("Blaster");
}

function RedeemerImage::onUnmount(%this,%obj,%slot){
   Parent::onUnmount(%this, %obj, %slot);
   %obj.client.setWeaponsHudActive("Blaster", 1);
}