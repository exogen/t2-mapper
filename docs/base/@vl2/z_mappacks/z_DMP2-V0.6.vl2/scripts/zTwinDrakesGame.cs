//autoExec("scripts/twinDrakesGame.cs",0,0);

$dragon::fireTime = 1000 * 20;
$dragon::burn = 0;//leave zero
$dragon::burnBoltEnable = 0; // enable burning on dragon bolt
$dragon::dwUnlockTime = 8; // dark weapon unlock
$dragon::dragonTimer = 3; // dragon fire use
datablock ParticleData(midMapSmokeParticle) {
   dragCoefficient = "0";
   windCoefficient = "0";
   gravityCoefficient = "-0.5";
   inheritedVelFactor = "0";
   constantAcceleration = "0";
   lifetimeMS = "6000";
   lifetimeVarianceMS = "500";
   spinSpeed = "1";
   spinRandomMin = "-50";
   spinRandomMax = "50";
   useInvAlpha = "1";
   textureName = "hotSmoke";
   colors[0] = "0.604724 0.604724 0.604724 0.2";
   colors[1] = "0.6291339 0.691339 0.691339 0.2";
   colors[2] = "0.659843 0.659843 0.659843 0.2";
   colors[3] = "0.0787402 0.0787402 0.0787402 0.0";
   sizes[0] = "50";
   sizes[1] = "50";
   sizes[2] = "50";
   sizes[3] = "50";
   times[0] = "0.1";
   times[1] = "0.4";
   times[2] = "0.8";
   times[3] = "1";
};

datablock ParticleEmitterData(midMapSmokeEmitter) {
   ejectionPeriodMS = "10";
   periodVarianceMS = "0";
   ejectionVelocity = "5";
   velocityVariance = "3";
   ejectionOffset = "100";
   ejectionOffsetVariance = "50";
   thetaMin = "20";
   thetaMax = "90";
   phiReferenceVel = "0";
   phiVariance = "360";
   overrideAdvance = "1";
   orientParticles = "0";
   orientOnVelocity = "1";
   particles = "midMapSmokeParticle";
   lifetimeMS = "0";
   lifetimeVarianceMS = "0";
   reverseOrder = "0";
   alignParticles = "0";
   alignDirection = "0 1 0";
   highResOnly = "1";
};

datablock TriggerData(DragonFireTrig){
   tickPeriodMS =  32;
};

datablock StaticShapeData(fireFireSwitch)
{
   catagory = "misc";
   shapefile = "switch.dts";
   isInvincible = true;
   alwaysAmbient = true;
   needsNoPower = true;
   emap = true;
};
function fireFireSwitch::onCollision(%data,%obj,%col)
{
   if (%col.getDataBlock().className $= Armor && (!game.burnTrigTime || (getSimTime() - game.burnTrigTime) > (60000 * $dragon::dragonTimer))){
      burnStart();   
      game.burnTrigTime = getSimTime();
      game.dragonTrigPlr = %col;
   }
   else{
      %timeMS = (60000 * $dragon::dragonTimer) - (getSimTime() - game.burnTrigTime);
      if(%timeMS > 0){
         messageClient(%col.client, 'MsgClient', '\c0Dragon fire ready in %1.~wfx/powered/station_denied.wav', game.formatTime(%timeMS));
      }
   }

}

function DragonFireTrig::onEnterTrigger(%data, %trigger, %player){
   if(isObject(PZones)){
      PZones.delete();
   } 
   if(!game.firstTrig){
      game.firstTrig = getSimTime();
   }
   if(%trigger.mode == 1){
      %strike = 1;
      if(getSimTime() - game.firstTrig > (60000 * $dragon::dwUnlockTime)){// enable after 15 min
         game.firstTrig = getSimTime();
         %strike = 0;
         SEStrike::onCollision(SEStrike, bigWep, %player, 1);
      }
      if(%strike){
         %minLeft = (60000 * $dragon::dwUnlockTime) - (getSimTime() - game.firstTrig);
         if(%minLeft > 0){
            messageTeam(%player.client.team, 'MsgClient', '\c1The dark weapon unlocks in %1.~wfx/powered/station_denied.wav', game.formatTime(%minLeft), %client.name);
         }

         %pos = "201.062 -22.3359 315.09";
         %p = new (SniperProjectile)() {
            dataBlock        = dragonEyeBeam;
            initialDirection = vectorNormalize(vectorSub(%player.getWorldBoxCenter(), %pos));
            initialPosition  = %pos;
            sourceObject     = -1;
            damageFactor     = 1;
            sourceSlot       = 0;
         };
         MissionCleanup.add(%p);
         %p.setEnergyPercentage(1);

         %pos = "201.062 14.7641 315.09";
         %p = new (SniperProjectile)() {
            dataBlock        = dragonEyeBeam;
            initialDirection = vectorNormalize(vectorSub(%player.getWorldBoxCenter(), %pos));
            initialPosition  = %pos;
            sourceObject     = -1;
            damageFactor     = 1;
            sourceSlot       = 0;
         };
         MissionCleanup.add(%p);
         %p.setEnergyPercentage(1);

         %pos = "-203.715 -23.9615 319.711";
         %p = new (SniperProjectile)() {
            dataBlock        = dragonEyeBeam;
            initialDirection = vectorNormalize(vectorSub(%player.getWorldBoxCenter(), %pos));
            initialPosition  = %pos;
            sourceObject     = -1;
            damageFactor     = 1;
            sourceSlot       = 0;
         };
         MissionCleanup.add(%p);
         %p.setEnergyPercentage(1);

         %pos = "-203.715 13.3385 319.711";
         %p = new (SniperProjectile)() {
            dataBlock        = dragonEyeBeam;
            initialDirection = vectorNormalize(vectorSub(%player.getWorldBoxCenter(), %pos));
            initialPosition  = %pos;
            sourceObject     = -1;
            damageFactor     = 1;
            sourceSlot       = 0;
         };
         MissionCleanup.add(%p);
         %p.setEnergyPercentage(1);
      }
   }
   else{
      %player.burnZone = 1;
      if($dragon::burn && (getSimTime() - $dragon::burn) < $dragon::fireTime){
         if(!%player.isBurning){
            %source = isObject(game.dragonTrigPlr) == 1 ? game.dragonTrigPlr : %player;
            burnObjectD(%player, %source);
         }
      }
   }
}

function DragonFireTrig::onTickTrigger(%this, %triggerId){
 // anti spam
}

function DragonFireTrig::onleaveTrigger(%data, %trigger, %player){
    %player.burnZone = 0;
}


datablock ParticleData(DragonFirePart){
   dragCoeffiecient     = 0.4;
   gravityCoefficient   = 1.0;   
   inheritedVelFactor   = 0.025;
   lifetimeMS           = 1000;
   lifetimeVarianceMS   = 0;
   textureName          = "particleTest";
   useInvAlpha =  0;
   spinRandomMin = -200.0;
   spinRandomMax =  200.0;

   colors[0]     = "0.9 0.3 0.0 1";
   colors[1]     = "0.9 0.3 0.0 1";
   colors[2]     = "0.9 0.3 0.1 1";
   sizes[0]      = 16.0;
   sizes[1]      = 32.0;
   sizes[2]      = 100.0;
   times[0]      = 0.0;
   times[1]      = 0.5;
   times[2]      = 1.0;

};

datablock ParticleEmitterData(DragonFireEmitter){
   ejectionPeriodMS = 2;
   periodVarianceMS = 0;
   ejectionVelocity = 520.25;
   velocityVariance = 0.25;
   thetaMin         = 0.0;
   thetaMax         = 30.0;
   //lifetimeMS       = 60000;

   particles = "DragonFirePart";
};

function burnStart(){
   if( getSimTime() - $dragon::burn > $dragon::fireTime){
      $dragon::burn = getSimTime();
      schedule(4000,0,"startFire");
      %id = new AudioEmitter() {
         position = "220.026 -3.85971 289.112";
         rotation = "1 0 0 0";
         scale = "1 1 1";
         fileName = "fx/Bonuses/TRex.wav";
         useProfileDescription = "0";
         outsideAmbient = "1";
         volume = "1";
         isLooping = "0";
         is3D = "1";
         minDistance = "400";
         maxDistance = "600";
         coneInsideAngle = "360";
         coneOutsideAngle = "360";
         coneOutsideVolume = "1";
         coneVector = "0 0 1";
         loopCount = "-1";
         minLoopGap = 0;
         maxLoopGap = 0;
         type = "EffectAudioType";

         locked = "true";
      };  
      MissionCleanup.add(%id);
      %id.schedule(3000,"delete");
      %id = new AudioEmitter() {
         position = "-223.944 -5.31371 294.324";
         rotation = "1 0 0 0";
         scale = "1 1 1";
         fileName = "fx/Bonuses/TRex.wav";
         useProfileDescription = "0";
         outsideAmbient = "1";
         volume = "1";
         isLooping = "0";
         is3D = "1";
         minDistance = "400";
         maxDistance = "600";
         coneInsideAngle = "360";
         coneOutsideAngle = "360";
         coneOutsideVolume = "1";
         coneVector = "0 0 1";
         loopCount = "-1";
         minLoopGap = 0;
         maxLoopGap = 0;
         type = "EffectAudioType";

         locked = "true";
      };  
      MissionCleanup.add(%id);
      %id.schedule(3000,"delete");
   }
}

function startFire(){
   %center = 0;
   for(%i = 0; %i < ClientGroup.getCount(); %i++){
      %player = ClientGroup.getObject(%i).player;
      if(isObject(%player)){
         %pos = %player.getPosition();
         %x = getWord(%pos,0);
         %y = getWord(%pos,1);
         %z = getWord(%pos,2);
         if(%player.burnZone && !%player.isBurning){
            burnObjectD(%player, %player);
         }
      }
   }
      %id = new ParticleEmissionDummy() {
			position = "220.026 -3.85971 289.112";
			rotation = "0 1 0 119.175";
			scale = "1 1 1";
			dataBlock = "doubleTimeEmissionDummy";
			lockCount = "0";
			homingCount = "0";
			emitter = "DragonFireEmitter";
			velocity = "1";
		};
		MissionCleanup.add(%id);
		%id.schedule(10000,"delete");
		%id = new AudioEmitter() {
         position = "220.026 -3.85971 289.112";
         rotation = "1 0 0 0";
         scale = "1 1 1";
         fileName = "fx/vehicles/htransport_boost.wav";
         //profile = HAPCFlyerThrustSound;
         useProfileDescription = "0";
         outsideAmbient = "1";
         volume = "1";
         isLooping = "1";
         is3D = "1";
         minDistance = "50";
         maxDistance = "600";
         coneInsideAngle = "360";
         coneOutsideAngle = "360";
         coneOutsideVolume = "1";
         coneVector = "0 0 1";
         loopCount = "-1";
         minLoopGap = 0;
         maxLoopGap = 0;
         type = "EffectAudioType";

         locked = "true";
      };  
      MissionCleanup.add(%id);
      %id.schedule(10000,"delete");
 		%id = new ParticleEmissionDummy() {
			position = "-223.944 -5.31371 294.324";
			rotation = "0 -1 0 115.92";
			scale = "1 1 1";
			dataBlock = "doubleTimeEmissionDummy";
			lockCount = "0";
			homingCount = "0";
			emitter = "DragonFireEmitter";
			velocity = "1";
		};
		MissionCleanup.add(%id);
		%id.schedule(10000,"delete");
		%id = new AudioEmitter() {
         position = "-223.944 -5.31371 294.324";
         rotation = "1 0 0 0";
         scale = "1 1 1";
         fileName = "fx/vehicles/htransport_boost.wav";
         //profile = HAPCFlyerThrustSound;
         useProfileDescription = "0";
         outsideAmbient = "1";
         volume = "1";
         isLooping = "1";
         is3D = "1";
         minDistance = "50";
         maxDistance = "600";
         coneInsideAngle = "360";
         coneOutsideAngle = "360";
         coneOutsideVolume = "1";
         coneVector = "0 0 1";
         loopCount = "-1";
         minLoopGap = 0;
         maxLoopGap = 0;
         type = "EffectAudioType";

         locked = "true";
      };  
      MissionCleanup.add(%id);
      %id.schedule(10000,"delete");
}

datablock ParticleData(BurnParticleD){
   dragCoeffiecient     = 0.4;
   gravityCoefficient   = -1;
   inheritedVelFactor   = 0.025;

   lifetimeMS           = 512;
   lifetimeVarianceMS   = 0;

   textureName          = "particleTest";

   useInvAlpha =  false;
   spinRandomMin = -200.0;
   spinRandomMax =  200.0;

   textureName = "special/Smoke/smoke_001";

   colors[0]     = "1.0 0.2 0.0 1.0";
   colors[1]     = "0.8 0.2 0.0 1.0";
   colors[2]     = "0.5 0.2 0.2 0.0";
   sizes[0]      = 1.0;
   sizes[1]      = 2.0;
   sizes[2]      = 2.5;
   times[0]      = 0.0;
   times[1]      = 0.5;
   times[2]      = 1.0;

};

datablock ParticleEmitterData(BurnEmitterD)
{
   ejectionPeriodMS = 10;
   periodVarianceMS = 0;

   ejectionVelocity = 5.25;
   velocityVariance = 0;

   thetaMin = "0";
   thetaMax = "90";
   phiReferenceVel = "0";
   phiVariance = "360";
   particles = "BurnParticleD";
};


function burnObjectD(%obj, %source, %part){
   %burnloop = 128;
   %damageMasks = $TypeMasks::PlayerObjectType | $TypeMasks::StationObjectType | $TypeMasks::GeneratorObjectType |
                  $TypeMasks::SensorObjectType | $TypeMasks::TurretObjectType | $TypeMasks::CorpseObjectType;
   if(isObject(%obj) && (%obj.getType() & %damageMasks) && !isObject(%obj.holdingflag)){
      %pos = %obj.getPosition(); 
      if(!isObject(%part)){
         %part = new ParticleEmissionDummy() {
            position =  %pos;
            rotation = "1 0 0 0";
            scale = "1 1 1";
            dataBlock = defaultEmissionDummy;
            emitter = "BurnEmitterD";
            velocity = "1";
         };  
         MissionCleanup.add(%part);  
         %obj.burnCount = 0;
         %obj.fireDmg =  %obj.getDamagePercent();

         if(!%obj.isBurning && (%obj.getType() & $TypeMasks::PlayerObjectType)){
            messageClient(%obj.client, 'MsgClient', '\c1You are on fire, find water or use health pack!~wfx/misc/warning_beep.wav');
         }
      }
      else if(isObject(%part) &&(%obj.getType() & ($TypeMasks::PlayerObjectType | $TypeMasks::CorpseObjectType))){
          %part.delete();
          %part = new ParticleEmissionDummy() {
            position =  %pos;
            rotation = "1 0 0 0";
            scale = "1 1 1";
            dataBlock = defaultEmissionDummy;
            emitter = "BurnEmitterD";
            velocity = "1";
         };  
         MissionCleanup.add(%part); 
      }
      %obj.isBurning = 1;
      %hit = ContainerRayCast(vectorAdd(%pos,"0 0 1000"), %pos, $TypeMasks::WaterObjectType, %obj);
      if(%hit)
         %wet  = (getWord(%hit,3) - getWord(%pos,2)) > 0.5; 
      else
         %wet = 0;  
      if(%obj.burnCount < 10000 && !%wet && ((%obj.getDamagePercent()+0.001) - %obj.fireDmg) >= 0){
         %obj.damage(%source, %pos, 0.03, $DamageType::Plasma);
         %obj.burnEvent = schedule(%burnloop, 0, "burnObjectD", %obj, %source, %part); 
      }
      else{
         if(isObject(%part)){
            %part.delete();
         }
         %obj.isBurning = 0;
      }
      %obj.fireDmg =  %obj.getDamagePercent();
      %obj.burnCount += %burnloop;
   }
   else if(isObject(%part)){//obj is no more
      %part.delete();
   }
}

function isDead(%obj){
   if((%obj.getType() & $TypeMasks::PlayerObjectType)){
      if(%obj.getState() $= "Dead")
         return 1;   
   }
   else if(%obj.getDamageState() $= "Destroyed"){
      return 1;  
   }
   return 0;
}

function DragonsFireWep::onCollision(%data,%obj,%col){
   if (%col.getDataBlock().className $= Armor && %col.getState() !$= "Dead" && !%col.isMounted()){
      if (%col.client){
         messageClient(%col.client, 'MsgItemPickup', '\c0You picked up %1.', %data.pickUpName);
         serverPlay3D(ItemPickupSound, %col.getTransform());
      }
      if (%obj.isStatic()){
         %obj.respawn();
      }
      else{
         %obj.delete();
      }
      %col.setInventory(DragonsFireWep, 1, true);
      %col.use(DragonsFireWep);
   }
}

datablock ItemData(DragonsFireWep){
   className = Weapon;
   catagory = "Spawn Items";
   shapeFile = "weapon_plasma.dts";
   image = DragonsFireWepImage;
   mass = 1;
   elasticity = 0.2;
   friction = 0.6;
   pickupRadius = 2;
	pickUpName = "a dark weapon";
	
	wepClass = "PW";
   wepNameID = "PW-2100";
   wepName = "Dragon Fire";
   light = 0;
   medium = 50;
   heavy = 80;
   description = "A heavy plasma flame thrower that applies a fire dot to targets.";
};

datablock ParticleData(DFireExplosionParticle){ 
   dragCoefficient      = 2;
   gravityCoefficient   = 0.2;
   inheritedVelFactor   = 0.2;
   constantAcceleration = 0.0;
   lifetimeMS           = 750;
   lifetimeVarianceMS   = 250;
   textureName          = "particleTest";
   colors[0]     = "0.9 0.3 0.0 0.0";
   colors[1]     = "0.9 0.3 0.0 0.0";
   sizes[0]      = 1.0;
   sizes[1]      = 1;
};

datablock ParticleEmitterData(DFireExplosionEmitter){
   ejectionPeriodMS = 15;
   periodVarianceMS = 0;
   ejectionVelocity = 5;
   velocityVariance = 1.0;
   ejectionOffset   = 0.0;
   thetaMin         = 0;
   thetaMax         = 60;
   phiReferenceVel  = 0;
   phiVariance      = 360;
   overrideAdvances = false;
   particles = "DFireExplosionParticle";
};

datablock ExplosionData(DFireBoltExplosion){
   particleEmitter = DFireExplosionEmitter;
   particleDensity = 150;
   particleRadius = 1.25;
   faceViewer = true;

   sizes[0] = "2.0 2.0 2.0";
   sizes[1] = "2.0 2.0 2.0";
   times[0] = 0.0;
   times[1] = 1.5;
};



datablock LinearFlareProjectileData(DragonsFireWepBolt){
   //projectileShapeName = "";
   scale               = "0.1 0.1 0.1";
   faceViewer          = false;
   directDamage        = 0.0;
   hasDamageRadius     = true;
   indirectDamage      = 0.08;
   damageRadius        = 8.0;
   kickBackStrength    = 0.0;
   radiusDamageType    = $DamageType::Plasma;
   explosion           = "DFireBoltExplosion";
   dryVelocity       = 135.0;
   wetVelocity       = 1;
   velInheritFactor  = 1.0;
   fizzleTimeMS      = 150;
   lifetimeMS        = 150;
   explodeOnDeath    = true;
   reflectOnWaterImpactAngle = 0.0;
   explodeOnWaterImpact      = true;
   deflectionOnWaterImpact   = 0.0;
   fizzleUnderwaterMS        = 100;

   //activateDelayMS = 100;
   activateDelayMS = -1;

   size[0]           = 0.1;
   size[1]           = 0.1;
   size[2]           = 0.1;


   numFlares         = 1;
   flareColor        = "1 0.0 0.0";
   flareModTexture   = "flaremod";
   flareBaseTexture  = "flarebase";

	sound        = PlasmaProjectileSound;
   fireSound    = PlasmaFireSound;
   wetFireSound = PlasmaFireWetSound;
   
   hasLight    = true;
   lightRadius = 1.0;
   lightColor  = "0.9 0.3 0.0";
};

datablock AudioProfile(dragonRoar)
{
   filename    = "fx/Bonuses/TRex.wav";
   description = AudioDefault3d;
};

datablock ShapeBaseImageData(DragonsFireWepImage)
{
   className = WeaponImage;
   shapeFile = "weapon_plasma.dts";
   item = DragonsFireWep;
   offset = "0 0 0";
   
   usesEnergy = true;
   fireEnergy = 1.10;
   minEnergy = 4;

   projectile = DragonsFireWepBolt;
   projectileType = LinearFlareProjectile;

   projectileSpread = 4.0 / 1000.0;

   
   stateName[0]             = "Activate";
   stateSequence[0]         = "Activate";
   stateSound[0]            = dragonRoar;
   stateAllowImageChange[0] = false;

   stateTimeoutValue[0]        = 0.2;
   stateTransitionOnTimeout[0] = "Ready";
   stateTransitionOnNoAmmo[0]  = "NoAmmo";

   stateName[1]       = "Ready";
   stateSpinThread[1] = Stop;
   stateTransitionOnTriggerDown[1] = "CheckWet";
   
   stateName[2]               = "NoAmmo";
   stateTransitionOnAmmo[2]   = "Ready";
   stateSpinThread[2]         = Stop;
   stateTransitionOnTriggerDown[2] = "DryFire";
   
   stateName[3]         = "Spinup";
   stateScript[3]       = "onSpinup";
   stateSpinThread[3]   = SpinUp;
   stateSound[3]        = PlasmaReloadSound;

   stateTimeoutValue[3]          = 0.01;
   stateWaitForTimeout[3]        = false;
   stateTransitionOnTimeout[3]   = "Fire";
   stateTransitionOnTriggerUp[3] = "Spindown";

   
   stateName[4]             = "Fire";
   stateSequence[4]            = "Fire";
   stateSequenceRandomFlash[4] = true;
   stateSpinThread[4]       = FullSpeed;
   stateSound[4]            = HAPCFlyerThrustSound;
   stateAllowImageChange[4] = false;
   stateScript[4]           = "onFire";
   stateFire[4]             = true;
   stateEjectShell[4]       = false;
   stateTimeoutValue[4]          = 0.1;
   stateTransitionOnTimeout[4]   = "Fire";
   stateTransitionOnTriggerUp[4] = "Spindown";
   stateTransitionOnNoAmmo[4]    = "EmptySpindown";
   stateTransitionOnWet[4]    = "Spindown";
   
   stateName[5]       = "Spindown";
   stateSound[5]      = PlasmaDryFireSound;
   stateSpinThread[5] = SpinDown;
   stateScript[5]     = "onSpindown";
   stateTimeoutValue[5]            = 0.0;
   stateWaitForTimeout[5]          = true;
   stateTransitionOnTimeout[5]     = "Ready";
   stateTransitionOnTriggerDown[5] = "CheckWet";
   
   stateName[6]       = "EmptySpindown";
   stateSound[6]      = PlasmaDryFireSound;
   stateSpinThread[6] = SpinDown;
   stateScript[6]     = "onSpindown";
   stateTimeoutValue[6]        = 0.5;
   stateTransitionOnTimeout[6] = "NoAmmo";

   stateName[7]       = "DryFire";
   stateSound[7]      = PlasmaFireWetSound;
   stateTimeoutValue[7]        = 0.5;
   stateTransitionOnTimeout[7] = "NoAmmo";
   
   stateName[8]       = "WetFire";
   stateSound[8]      = PlasmaFireWetSound;
   stateScript[8]     = "onWetFire";
   stateTimeoutValue[8]        = 1.5;
   stateTransitionOnTimeout[8] = "Ready";
   
   stateName[9]               = "CheckWet";
   stateTransitionOnWet[9]    = "WetFire";
   stateTransitionOnNotWet[9] = "Spinup"; 
};

datablock ParticleData(DragonFlameParticle) {
   dragCoefficient = "0";
   windCoefficient = "0";
   gravityCoefficient = "0";
   inheritedVelFactor = "0";
   constantAcceleration = "0";
   lifetimeMS = "256";
   lifetimeVarianceMS = "0";
   spinSpeed = "1";
   spinRandomMin = "-80";
   spinRandomMax = "80";
   useInvAlpha = "0";
   textureName = "particleTest";
   
   colors[0] = "0 0 1 1";
   colors[1] = "1 0.3 0 1";
   colors[2] = "1 0.3 0 0.8";
   colors[3] = "1 0.3 0 0.5";
   
   sizes[0] = "0.7";
   sizes[1] = "2";
   sizes[2] = "3";
   sizes[3] = "4";
   
   times[0] = "0.0";
   times[1] = "0.3";
   times[2] = "0.8";
   times[3] = "1";
};

datablock ParticleEmitterData(DragonFlameEmitter) {
   ejectionPeriodMS = "1";
   periodVarianceMS = "0";
   ejectionVelocity = "130";
   velocityVariance = "30";
   ejectionOffset = "0";
   ejectionOffsetVariance = "0";
   thetaMin = "0";
   thetaMax = "5";
   phiReferenceVel = "0";
   phiVariance = "360";
   softnessDistance = "1";
   ambientFactor = "0";
   overrideAdvance = "1";
   orientParticles = "0";
   orientOnVelocity = "1";
   particles = "DragonFlameParticle";
   lifetimeMS = "0";
   lifetimeVarianceMS = "0";
};

datablock ShapeBaseImageData(DragonsFireWepFlameImage){
   shapeFile = "weapon_plasma.dts";
   emap = true;
   correctMuzzleVector = true; 
   
   class = "WeaponImage";

   item = DragonsFireWep;


   projectile = DragonsFireWepBolt;
   projectileType = Projectile;
   projectileSpread = "0";

   lightType = "WeaponFireLight";
   lightColor = "1 0 0 1";
   lightRadius = 1.0;
   lightDuration = "400";
   lightBrightness = 1;
   shakeCamera = false;
   camShakeFreq = "10.0 6.0 9.0";
   camShakeAmp = "0.01 0.01 0.01";

   useRemainderDT = false;
   
   stateName[0] = "Activate";
   stateTransitionOnTimeout[0] = "ActivateReady";
   stateTimeoutValue[0] = 0.001;
   stateSequence[0] = "Activate";

   stateName[1] = "ActivateReady";
   stateTransitionOnLoaded[1] = "Ready";

   stateName[2] = "Ready";
   stateTransitionOnTriggerDown[2] = "Fire";

   stateName[3] = "Fire";
   stateTransitionOnTimeout[3] = "Reload";
   stateTimeoutValue[3] = 0.001;
   stateFire[3] = true;
   stateRecoil[3] = NoRecoil;
   stateAllowImageChange[3] = false;
   stateSequence[3] = "Fire";
   stateScript[3] = "onFire";
   stateEmitter[3] = "DragonFlameEmitter";
   stateEmitterNode[3] = "muzzlepoint1";
   stateEmitterTime[3] = 0.1;
   
   stateName[4]                     = "Reload";
   stateTransitionOnTimeout[4]      = "Ready";
   stateTimeoutValue[4]             = 0.1;
   stateAllowImageChange[4]         = false;


   offset = "0 0.3 0.02";
   rotation = "0 1 0 0";
};


datablock ShapeBaseImageData(DragonsFireWepImage4){
   offset = "0 0.15 0.01";
   rotation = "0 0 0 0";
   shapeFile = "weapon_plasma.dts";
    emap = true;
};

// datablock ShapeBaseImageData(DragonsFireWepImage5){
//    offset = "0 0.3 0.02";
//    rotation = "0 0 0 0";
//    shapeFile = "weapon_plasma.dts";
//     emap = true;
// };

function DragonsFireWepImage::onFire(%data, %obj, %slot){
   parent::onFire(%data, %obj, %slot);
}
function DragonsFireWepFlameImage::onFire(%data, %obj, %slot){
// not needed
   //if(%obj.getImageState(0) $= "Ready"){
   //   %obj.setImageTrigger(6, false);   
   //}
}

function DragonsFireWepImage::onWetFire(%this,%obj,%slot){
   %obj.setImageTrigger(6, false);
}

function DragonsFireWepImage::onSpindown(%this,%obj,%slot){
   %obj.setImageTrigger(6, false);
}

function DragonsFireWepImage::onSpinup(%this,%obj,%slot){   
   %obj.schedule(32,"setImageTrigger",6,true); 
}

function DragonsFireWepImage::onMount(%this,%obj,%slot){
   Parent::onMount(%this, %obj, %slot);
   %obj.mountImage(DragonsFireWepImage4, 4);
  // %obj.mountImage(DragonsFireWepImage5, 5);
   %obj.mountImage(DragonsFireWepFlameImage, 6);
   commandToClient( %obj.client, 'BottomPrint', %this.item.wepNameID SPC %this.item.wepName NL %this.item.description, 4, 3);
   %obj.client.setWeaponsHudActive("Plasma");
   %obj.client.setWeaponsHudActive(%this.item);  
}

function DragonsFireWepImage::onUnmount(%this,%obj,%slot){
   parent::onUnmount(%this,%obj,%slot);
   %obj.unmountImage(4);
   %obj.unmountImage(5);
   %obj.unmountImage(6);
   %obj.client.setWeaponsHudActive("Plasma", 1);
   %obj.client.setWeaponsHudActive(%this.item, 1);  
}

function DragonsFireWepBolt::onCollision(%data, %projectile, %targetObject, %modifier, %position, %normal){
   parent::onCollision(%data, %projectile, %targetObject, %modifier, %position, %normal);
   if(!%targetObject.isBurning)
      burnObjectD(%targetObject, %projectile.sourceObject);
}


datablock ItemData(dragonBoltWep){
   className = Weapon;
   catagory = "Spawn Items";
   shapeFile = "weapon_plasma.dts";
   image = dragonBoltImage;
   mass = 1;
   elasticity = 0.2;
   friction = 0.6;
   pickupRadius = 2;
   pickUpName = "a dark weapon";
   computeCRC = false; 
   
   wepClass = "PW";
   wepNameID = "PW-800";
   wepName = "Quad-Flare Incinerator";
   light = 12;
   medium = 16;
   heavy = 24;
   description = "A weapon that fires multiple plasma projectiles";
};

function dragonBoltWep::onCollision(%data,%obj,%col){
   if (%col.getDataBlock().className $= Armor && %col.getState() !$= "Dead" && !%col.isMounted()){
      if (%col.client){
         messageClient(%col.client, 'MsgItemPickup', '\c0You picked up %1.', %data.pickUpName);
         serverPlay3D(ItemPickupSound, %col.getTransform());
      }
      if (%obj.isStatic()){
         %obj.respawn();
      }
      else{
         %obj.delete();
      }
      %col.setInventory(dragonBoltWep, 1, true);
      %col.use(dragonBoltWep);
   }
}

datablock ParticleData(PWIncineratorTrailParticle){
    dragCoefficient = 0.15;
    gravityCoefficient = 0;
    windCoefficient = 0;
    inheritedVelFactor = 0.23;
    constantAcceleration = 0;
    lifetimeMS = 256;
    lifetimeVarianceMS = 0;
    useInvAlpha = 0;
    spinRandomMin = 0;
    spinRandomMax = 0;
    textureName = "particleTest";
    
    times[0] = 0;
    times[1] = 1;
    colors[0] = "1 0.6 0.0 0.3";
    colors[1] = "1 0.6 0.0 0.3";
    sizes[0] = 1.25;
    sizes[1] = 0.34;
};

datablock ParticleEmitterData(PWIncineratorTrailEmitter){
   ejectionPeriodMS = 5;
   periodVarianceMS = 0;
   ejectionVelocity = 5.8;
   velocityVariance = 3.8;
   thetaMin = 0;
   thetaMax = 6;
   phiReferenceVel = 0;
   phiVariance = 360;
   overrideAdvances = 0;
   orientParticles= 0;
   orientOnVelocity = 1;
   particles = PWIncineratorTrailParticle;
};

datablock ExplosionData(PlasmaBoltExplosionNoSound){
   explosionShape = "effect_plasma_explosion.dts";
   //soundProfile   = plasmaExpSound;
   particleEmitter = PlasmaExplosionEmitter;
   particleDensity = 150;
   particleRadius = 1.25;
   faceViewer = true;

   sizes[0] = "1.0 1.0 1.0";
   sizes[1] = "1.0 1.0 1.0";
   times[0] = 0.0;
   times[1] = 1.5;
};

datablock LinearFlareProjectileData(dragonBolt){
   projectileShapeName = "plasmabolt.dts";
   scale               = "1 1 1";
   faceViewer          = true;
   directDamage        = 0.0;
   hasDamageRadius     = true;
   indirectDamage      = 0.075;
   damageRadius        = 4.0;
   kickBackStrength    = 0.0;
   radiusDamageType    = $DamageType::Dark;

   explosion           = "PlasmaBoltExplosionNoSound";
   splash              = PlasmaSplash;

   dryVelocity       = 300.0; 
   wetVelocity       = -1;
   velInheritFactor  = 0.3;
   fizzleTimeMS      = 2000;
   lifetimeMS        = 3000;
   explodeOnDeath    = false;
   reflectOnWaterImpactAngle = 0.0;
   explodeOnWaterImpact      = true;
   deflectionOnWaterImpact   = 0.0;
   fizzleUnderwaterMS        = -1;

   baseEmitter = PWIncineratorTrailEmitter;
   activateDelayMS = -1;

   size[0]           = 0.2;
   size[1]           = 0.5;
   size[2]           = 0.1;


   numFlares         = 35;
   flareColor        = "1 0.75 0.25";
   flareModTexture   = "flaremod";
   flareBaseTexture  = "flarebase";

	sound        = PlasmaProjectileSound;
   fireSound    = PlasmaFireSound;
   wetFireSound = PlasmaFireWetSound;
   
   hasLight    = true;
   lightRadius = 3.0;
   lightColor  = "1 0.75 0.25";
};

datablock ShapeBaseImageData(dragonBoltImage){
   className = WeaponImage;
   shapeFile = "weapon_plasma.dts";
   item = dragonBoltWep;
   usesEnergy = true;
   fireEnergy = 4;
   minEnergy = 4;
   offset = "0 0 0";
   projectile = dragonBolt;
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

function dragonBoltImage::onMount(%this,%obj,%slot){
   Parent::onMount(%this,%obj,%slot);
   commandToClient( %obj.client, 'BottomPrint', %this.item.wepNameID SPC %this.item.wepName NL %this.item.description, 4, 3);
   %obj.client.setWeaponsHudActive("Plasma");
   %obj.client.setWeaponsHudActive(%this.item);  
}

function dragonBoltImage::onUnmount(%this,%obj,%slot){
   Parent::onUnmount(%this, %obj, %slot);
   %obj.client.setWeaponsHudActive("Plasma", 1);
   %obj.client.setWeaponsHudActive(%this.item, 1);  
}

function dragonBoltImage::onFire(%data, %obj, %slot){
   %div = 4;
   for(%i = 0; %i < %div; %i++){
      %vector = %obj.getMuzzleVector(%slot);
      %mp = %obj.getMuzzlePoint(%slot);
      %endPos = VectorAdd(%mp, VectorScale(VectorNormalize(%vector), 100));
      %cycPos = tubeDK(getRandom()*4, %div, %mp, %endPos, %i); 
      %vec = vectorNormalize(vectorSub(%cycPos, %mp));
       %p = new LinearFlareProjectile() {
         dataBlock        = dragonBolt;
         initialDirection = %vec;
         initialPosition  = %mp;
         sourceObject     = %obj;
         sourceSlot       = %slot;
       };
      MissionCleanup.add(%p);
   }  
}

function dragonBolt::onCollision(%data, %projectile, %targetObject, %modifier, %position, %normal){
   parent::onCollision(%data, %projectile, %targetObject, %modifier, %position, %normal);
   if(!%targetObject.isBurning && $dragon::burnBoltEnable && getRandom(1,20) == 1){
      burnObjectD(%targetObject, %projectile.sourceObject);
   }
}

//Base ammo type
datablock ItemData(SEStrikeAmmo){
   className = Ammo;
   catagory = "Ammo";
   shapeFile = "ammo_disc.dts";
   mass = 1;
   elasticity = 0.2;
   friction = 0.6;
   pickupRadius = 2;
	pickUpName = "a dark weapon ammo";
};


datablock ItemData(SEStrike){
   className = Weapon;
   catagory = "Spawn Items";
   shapeFile = "weapon_grenade_launcher.dts";
   image = SEStrikeImage;
   mass = 1;
   elasticity = 0.2;
   friction = 0.6;
   pickupRadius = 2;
	pickUpName = "a dark weapon";
	
	wepClass = "EX";
   wepNameID = "PW-9600";
   wepName = "Scorched Earth";
   light = 1;
   medium = 1;
   heavy = 1;
   description = "A weapon that fires a projectile that bursts into an array of smaller projectiles that fall in a spiral pattern, covering a large area.";
};

function SEStrike::onCollision(%data,%obj,%col,%enable){
   if (%col.getDataBlock().className $= Armor && %col.getState() !$= "Dead" && !%col.isMounted() && !%col.hasStrike && %enable){
      if (%col.client){
         messageClient(%col.client, 'MsgItemPickup', '\c0You picked up %1.', %data.pickUpName);
         serverPlay3D(ItemPickupSound, %col.getTransform());
      }
      if (%obj.isStatic()){
         %obj.respawn();
      }
      else{
         %obj.delete();
      }
      %col.hasStrike = 1;
      %col.setInventory(SEStrike, 1, true);
      %col.setInventory(SEStrikeAmmo, 1, true);
      %col.use(SEStrike);
   }
}

function testStrike(%col){
   %col.setInventory(SEStrike, 1, true);
   %col.setInventory(SEStrikeAmmo, 222, true);
   %col.use(SEStrike);
}

datablock ExplosionData(SESubExplosion1){
   explosionShape = "effect_plasma_explosion.dts";
   faceViewer           = true;

   delayMS = 128;
   offset = "0 0 0";

   playSpeed = 0.6;

   sizes[0] = "20.0 20.0 20.0";
   sizes[1] = "20.0 20.0 20.0";
   times[0] = 0.0;
   times[1] = 1.0;

};             

datablock ExplosionData(SESubExplosion2){
   explosionShape = "effect_plasma_explosion.dts";
   faceViewer           = true;
   delayMS = 64;
   offset = "0 64 0";
   playSpeed = 0.4;

   sizes[0] = "40.0 40.0 40.0";
   sizes[1] = "40.0 40.0 40.0";
   times[0] = 0.0;
   times[1] = 1.0;
};

datablock ExplosionData(SEStrikeExplosion){
   explosionShape = "effect_plasma_explosion.dts";
   faceViewer           = true;
   delayMS = 0;
   offset = "0 128 0";
   playSpeed = 0.3;
   sizes[0] = "30.0 30.0 30.0";
   sizes[1] = "60.0 60.0 6.0";
   times[0] = 0.0;
   times[1] = 1.0;
   
   //soundProfile   = SEExplosionSound;

   subExplosion[0] = SESubExplosion1;
   subExplosion[1] = SESubExplosion2;

      
   shakeCamera = true;
   camShakeFreq = "4.0 8.0 9.0";
   camShakeAmp = "10.0 10.0 10.0";
   camShakeDuration = 2;
   camShakeRadius = 300.0;
};

datablock LinearFlareProjectileData(SEShot){
   projectileShapeName = "plasmabolt.dts";
   scale               = "6 6 6";
   faceViewer          = true;
   directDamage        = 0.0;
   hasDamageRadius     = true;
   indirectDamage      = 10;
   damageRadius        = 150;
   kickBackStrength    = 9000.0;
   radiusDamageType    = $DamageType::Dark;
   Impulse = true;
   explosion           = "SEStrikeExplosion";
   underwaterExplosion = "UnderwaterMortarExplosion";
   splash              = PlasmaSplash;

   dryVelocity       = 900.0;
   wetVelocity       =  600;
   velInheritFactor  = 1;
   fizzleTimeMS      = 5000;
   lifetimeMS        = 5000;
   explodeOnDeath    = true;
   reflectOnWaterImpactAngle = 15.0;
   explodeOnWaterImpact      = true;
   deflectionOnWaterImpact   = 20.0; 
   fizzleUnderwaterMS        = -1;

   //activateDelayMS = 100;
   activateDelayMS = -1;

   size[0]           = 6;
   size[1]           = 6;
   size[2]           = 6;


   numFlares         = 35;
   flareColor        = "1 0.75 0.25";
   flareModTexture   = "flaremod";
   flareBaseTexture  = "flarebase";

   hasLight    = true;
   lightRadius = 3.0;
   lightColor  = "1 0.75 0.25";
   ignoreExEffects = 1;
};

datablock ShapeBaseImageData(SEStrikeImage){
   className = WeaponImage;
   shapeFile = "weapon_grenade_launcher.dts";
   item = SEStrike;
   ammo = SEStrikeAmmo;
   offset = "0 0 0";
   
   projectile = SEShot;
   projectileType = LinearFlareProjectile;

   stateName[0] = "Activate";
   stateTransitionOnTimeout[0] = "ActivateReady";
   stateTimeoutValue[0] = 0.5;
   stateSequence[0] = "Activate";
   stateSound[0] = BomberBombDryFireSound;//SEStrikeSwitchSound;

   stateName[1] = "ActivateReady";
   stateTransitionOnLoaded[1] = "Ready";
   stateTransitionOnNoAmmo[1] = "NoAmmo";

   stateName[2] = "Ready";
   stateTransitionOnNoAmmo[2] = "NoAmmo";
   stateTransitionOnTriggerDown[2] = "CheckWet";

   stateName[3] = "Fire";
   stateTransitionOnTimeout[3] = "Reload";
   stateTimeoutValue[3] = 1.0;
   stateFire[3] = true;
   stateRecoil[3] = LightRecoil;
   stateAllowImageChange[3] = false;
   stateScript[3] = "onFire";
   stateSound[3] = PlasmaBarrelExpSound;
   stateSequence[3] = "Fire";
   
   stateName[4] = "Reload";
   stateTransitionOnNoAmmo[4] = "NoAmmo";
   stateTransitionOnTimeout[4] = "Ready";
   stateTimeoutValue[4] = 0.3;
   stateAllowImageChange[4] = false;
   //stateSequence[4] = "Reload";
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


datablock ParticleData(SERSmokeParticle){
   dragCoefficient      = 0.1;
   gravityCoefficient   = -0.1;
   inheritedVelFactor   = 1.0;
   constantAcceleration = 0.1;
   lifetimeMS           = 250;
   lifetimeVarianceMS   = 0;
   useInvAlpha =  false;
   textureName          = "particleTest";
   colors[0]     = "1.0 0.0 0.0 1.0";
   colors[1]     = "1.0 0.0 0.0 0";
   sizes[0]      = 2.0;
   sizes[1]      = 2.15;

};

datablock ParticleEmitterData(SERSmokeEmitter){
   ejectionPeriodMS = 3;
   periodVarianceMS = 0;
   ejectionVelocity = 3;
   velocityVariance = 2.9;
   ejectionOffset   = 0.3;
   thetaMin         = 0;
   thetaMax         = 5;
   phiReferenceVel  = 0;
   phiVariance      = 360;
   overrideAdvances = false;

   particles = "SERSmokeParticle";
};

datablock ParticleData(SERExplosionParticle){
   dragCoefficient      = 3.64;
   gravityCoefficient   = 0;
   inheritedVelFactor   = 0;
   constantAcceleration = 0.0;
   lifetimeMS           = 900;
   lifetimeVarianceMS   = 200;
   spinRandomMin = "-560";
   useInvAlpha          =  false;
   spinRandomMax =  "720";
   textureName          = "special/shockLightning02";
   colors[0]     = "1 0 0 1";
   colors[1]     = "1 0 0 0.35";
   colors[2]     = "0.1 0 0 0";
   sizes[0]      = 14.5;
   sizes[1]      = 16.8;
   sizes[2]      = 17.8;
   times[0]      = 0;
   times[1]      = 0.5;
   times[2]      = 1;
};

datablock ParticleEmitterData(SERExplosionEmitter){
   ejectionPeriodMS = 1;
   periodVarianceMS = 0;
   ejectionVelocity = 62.5;
   velocityVariance = 33.5;
   ejectionOffset   = 0.0;
   thetaMin         = 0;
   lifetimeMS       = 50;
   phiReferenceVel  = 0;
   blendStyle = "ADDITIVE";
   phiVariance      = 360;
   orientParticles  = false;
   reverseOrder = true;
   sortParticles    = true;
   overrideAdvance = true;
   softnessDistance = "0.0001";
   orientOnVelocity = 1;
   particles = "SERExplosionParticle";
};

datablock ParticleData(SERShockwaveParticle){
   windCoefficient 		= -1;
   dragCoefficient      = 0.2;
   gravityCoefficient   = 0;
   inheritedVelFactor   = 0;
   constantAcceleration = 0;
   lifetimeMS           = 10000;
   lifetimeVarianceMS   = 2500;
   spinRandomMin    = "-90";
   spinRandomMax    = "90";
   textureName          = "particleTest";
   colors[0]     = "1 0 0 0.6";
   colors[1]     = "1 0.1 0 0.3";
   colors[2]     = "0.5 0.5 0 0";
   sizes[0]      = 5.5;
   sizes[1]      = 17.8;
   sizes[2]      = 27.8;
   times[0]      = 0;
   times[1]      = 0.6;
   times[2]      = 1;
};

datablock ParticleEmitterData(SERShockwaveEmitter){
   ejectionPeriodMS = 1;
   periodVarianceMS = 0;
   ejectionVelocity = 4;
   velocityVariance = 3.9;
   ejectionOffset   = 0.0;
   thetaMin         = 0;
   thetaMax         = 180;
   lifetimeMS       = 50;
   phiReferenceVel  = 0;
   phiVariance      = 360;
   orientParticles  = false;
   overrideAdvance = false;
   sortParticles    = true;
   softnessDistance = "0.0001";
   orientOnVelocity = 1;
   ambientFactor = "0.85";
   particles = "SERShockwaveParticle";
};

datablock ExplosionData(SERExplosion){
   explosionShape = "effect_plasma_explosion.dts";
   soundProfile   = FusionExpSound;
   faceViewer           = true;

   playSpeed = 1;

   emitter[0] = SERShockwaveEmitter;
   emitter[1] = SERExplosionEmitter;
   
   sizes[0] = "20.0 20.0 20.0";
   sizes[1] = "20.0 20.0 20.0";
   times[0] = 0.0;
   times[1] = 1.0;
   shakeCamera = true;
   camShakeFreq = "8.0 9.0 7.0";
   camShakeAmp = "100.0 100.0 100.0";
   camShakeDuration = 1.3;
   camShakeRadius = 25.0;
};

datablock GrenadeProjectileData(SERShot){
   projectileShapeName = "mortar_projectile.dts";
   scale               = "2.0 2.0 2.0";
   emitterDelay        = 1;
   directDamage        = 0.0;
   hasDamageRadius     = true;
   indirectDamage      = 50;
   damageRadius        = 50.0;
   radiusDamageType    = $DamageType::Plasma;
   kickBackStrength    = 2000;

   explosion           = SERExplosion;
   underwaterExplosion = UnderwaterMortarExplosion;
   velInheritFactor    = 0.5;
   splash              = MortarSplash;
   depthTolerance      = 30.0;
   fizzleTimeMS = 50000;
   lifetimeMS = 50000;
   explodeOnDeath = true;

   baseEmitter         = SERSmokeEmitter;
   bubbleEmitter       = MortarBubbleEmitter;

   grenadeElasticity = 0.35;
   grenadeFriction   = 0.2;
   armingDelayMS     = 500;
   muzzleVelocity    = 50;
   drag              = 0.1;

   sound			 = HAPCFlyerThrustSound;

   hasLight    = true;
   lightRadius = 10.0;
   lightColor  = "1 0 0 1.0";

   hasLightUnderwaterColor = true;
   underWaterLightColor = "0.05 0.075 0.2";
   ignoreExEffects = 1;
};

datablock ParticleData(SEGroundFirePart) {
   dragCoefficient = "0";
   windCoefficient = "0";
   gravityCoefficient = "0";
   inheritedVelFactor = "0";
   constantAcceleration = "0";
   lifetimeMS = "400";
   lifetimeVarianceMS = "250";
   spinSpeed = "1";
   spinRandomMin = "0";
   spinRandomMax = "0";
   useInvAlpha = "0";
   textureName = "particleTest";
   colors[0] = "1 1 0.897638 0.19685";
   colors[1] = "1 1 0.897638 0.393701";
   colors[2] = "1 1 0.897638 0.795276";
   colors[3] = "1 1 0.897638 0";
   sizes[0] = "0.0915583";
   sizes[1] = "0.494415";
   sizes[2] = "0.128182";
   sizes[3] = "0.192272";
   times[0] = "0";
   times[1] = "0.298039";
   times[2] = "0.698039";
   times[3] = "1";
};

datablock ParticleEmitterData(SEGroundFire) {
   ejectionPeriodMS = "60";
   periodVarianceMS = "5";
   ejectionVelocity = "0";
   velocityVariance = "0";
   ejectionOffset = "0";
   ejectionOffsetVariance = "0";
   thetaMin = "0";
   thetaMax = "90";
   phiReferenceVel = "0";
   phiVariance = "360";
   softnessDistance = "1";
   ambientFactor = "0";
   overrideAdvance = "1";
   orientParticles = "0";
   orientOnVelocity = "1";
   particles = "SEGroundFirePart";
   lifetimeMS = "0";
   lifetimeVarianceMS = "0";
   useEmitterSizes = "0";
   useEmitterColors = "0";
   blendStyle = "ADDITIVE";
   sortParticles = "0";
   reverseOrder = "0";
   alignParticles = "0";
   alignDirection = "0 1 0";
   highResOnly = "1";
};
datablock ParticleData(SEGroundFireTrailPart) {
   dragCoefficient = "0";
   windCoefficient = "0.2";
   gravityCoefficient = "-0.300366";
   inheritedVelFactor = "0";
   constantAcceleration = "0";
   lifetimeMS = "2439";
   lifetimeVarianceMS = "500";
   spinSpeed = "1";
   spinRandomMin = "-100";
   spinRandomMax = "83";
   useInvAlpha = "1";
   textureName = "particleTest";
   colors[0] = "0 0 0 0.496063";
   colors[1] = "0 0 0 0.795276";
   colors[2] = "0 0 0 0.188976";
   colors[3] = "1 1 1 0.03";
   sizes[0] = "0.393701";
   sizes[1] = "0.292987";
   sizes[2] = "0.0915583";
   sizes[3] = "0.0915583";
   times[0] = "0";
   times[1] = "0.498039";
   times[2] = "0.788235";
   times[3] = "0.831373";
};


datablock ParticleEmitterData(SEGroundFireTrail) {
   ejectionPeriodMS = "5";
   periodVarianceMS = "0";
   ejectionVelocity = "0.5";
   velocityVariance = "0.1";
   ejectionOffset = "0";
   ejectionOffsetVariance = "0";
   thetaMin = "90";
   thetaMax = "90";
   phiReferenceVel = "360";
   phiVariance = "0";
   softnessDistance = "1";
   ambientFactor = "0";
   overrideAdvance = "1";
   orientParticles = "0";
   orientOnVelocity = "1";
   particles = "SEGroundFireTrailPart";
   lifetimeMS = "0";
   lifetimeVarianceMS = "0";
   useEmitterSizes = "0";
   useEmitterColors = "0";
   blendStyle = "NORMAL";
   sortParticles = "0";
   reverseOrder = "0";
   alignParticles = "0";
   alignDirection = "0 1 0";
};
function SEShot::onExplode(%data, %proj, %pos, %mod){
   parent::onExplode(%data, %proj, %pos, %mod);
   expFlash(vectorAdd(%pos,"0 0 0.5"), 600, 0.7);
   %burstCount = 256;
   %obj =  %proj.sourceObject;
   InitContainerRadiusSearch(%pos, 350, $TypeMasks::PlayerObjectType | $TypeMasks::TurretObjectType | $TypeMasks::SensorObjectType);
   while ((%burnObj = containerSearchNext()) != 0){
      if(!%burnObj.isBurning){
         burnObjectD(%burnObj, %obj);
      }
   }
   for(%i = 0; %i < %burstCount; %i++){
      %cycPos = tubeDK(%i+50, 32, %pos, vectorAdd(%pos,"0 0 1"), %i % 32);
      %p = new GrenadeProjectile() 
      {
         dataBlock = SERShot;
         initialDirection = %vector;
         initialPosition  = vectorAdd(%cycPos, "0 0" SPC %i * 4);
         sourceObject = -1;
         sourceSlot = 0;
         sObj = %obj;
      };
      MissionCleanup.add(%p);
   }
}

function SERShot::onExplode(%data, %proj, %pos, %mod){
   %proj.sourceObject = %proj.sObj;
   parent::onExplode(%data, %proj, %pos, %mod);
   if(getRandom(1,8) == 1){
      %trail = new ParticleEmissionDummy() {
         position = vectorAdd(%pos, "0 0 0.3");
         rotation = "1 0 0 0";
         scale = "1 1 1";
         dataBlock = defaultEmissionDummy;
         emitter = "SEGroundFireTrail";
         velocity = "1";
      };
      MissionCleanup.add(%trail); 
      %fire = new ParticleEmissionDummy() {
         position = vectorAdd(%pos, "0 0 0.1");
         rotation = "1 0 0 0";
         scale = "1 1 1";
         dataBlock = defaultEmissionDummy;
         emitter = "SEGroundFire";
         velocity = "1";
      }; 
      MissionCleanup.add(%fire); 
      %time = getRandom(10000,30000);
      %trail.schedule(%time,"delete");
      %fire.schedule(%time,"delete");
   }
}
function lerpRemapValue(%val, %min, %max, %limit) {//lerpRemapValue(0.8,0,1,244);
    %dif = %max - %min;
    %range = %limit / %dif;
    %remap = (%val - %min) * %range;
    %remap = %remap > %limit ? %limit : %remap;
    return %remap;
}

function expFlash(%pos, %rad, %maxWhiteout){ 
   //all this stuff below ripped from projectiles.cs
   InitContainerRadiusSearch(%pos, %rad, $TypeMasks::PlayerObjectType | $TypeMasks::TurretObjectType);
   while ((%damage = containerSearchNext()) != 0){
      %dist = containerSearchCurrDist();
      %eyeXF = %damage.getEyeTransform();
      %epX   = firstword(%eyeXF);
      %epY   = getWord(%eyeXF, 1);
      %epZ   = getWord(%eyeXF, 2);
      %eyePos = %epX @ " " @ %epY @ " " @ %epZ;
      %eyeVec = %damage.getEyeVector();

      if (ContainerRayCast(%eyePos, %pos, $TypeMasks::TerrainObjectType | $TypeMasks::InteriorObjectType | $TypeMasks::StaticObjectType, %damage) !$= "0"){
         continue;
      }


      %dif = VectorNormalize(VectorSub(%pos, %eyePos));
      %dot = VectorDot(%eyeVec, %dif);
      %whiteoutVal = 0;
      if (%dot > 0.7)
        %whiteoutVal = %maxWhiteout;
      else if (%dot > 0.4)
         %whiteoutVal = 0.5;
      else
         %whiteoutVal = %damage.getWhiteOut();
		
      error(%damage SPC %whiteoutVal SPC %dot);
      %damage.setWhiteOut( %whiteoutVal );
   }
}

datablock ShapeBaseImageData(SEStrike2Image){
   offset = "0.0 0.8 0.13";
   rotation = "0 1 0 0";
   shapeFile = "pack_upgrade_repair.dts";
   emap = true;
   stateName[0] = "Activate";
   stateSequence[0] = "fire";
};

datablock ShapeBaseImageData(SEStrike3Image){
   offset = "0.0 1.0 0.13";
   shapeFile = "pack_upgrade_repair.dts";
   emap = true;
   stateName[0] = "Activate";
   stateSequence[0] = "fire";
};

datablock ShapeBaseImageData(SEStrike4Image){
   offset = "0.0 1.2 0.13";
   rotation = "0 1 0 0";
   shapeFile = "pack_upgrade_repair.dts";
   emap = true;
   stateName[0] = "Activate";
   stateSequence[0] = "fire";
};

datablock ShapeBaseImageData(SEStrike5Image){
   offset = "0.0 1.4 0.13";
   rotation = "0 1 0 0";
   shapeFile = "pack_upgrade_repair.dts";
   emap = true;
   stateName[0] = "Activate";
   stateSequence[0] = "fire";
};

function SEStrikeImage::onMount(%this,%obj,%slot){
   Parent::onMount(%this, %obj, %slot);
   %obj.mountImage(SEStrike2Image, 4);
   %obj.mountImage(SEStrike3Image, 5);
   %obj.mountImage(SEStrike4Image, 6);
   %obj.mountImage(SEStrike5Image, 7);
   commandToClient( %obj.client, 'BottomPrint', %this.item.wepNameID SPC %this.item.wepName NL %this.item.description, 4, 3);
   %obj.client.setWeaponsHudActive("Plasma");
   %obj.client.setWeaponsHudActive(%this.item); 
   
}

function SEStrikeImage::onUnmount(%this,%obj,%slot){
   Parent::onUnmount(%this, %obj, %slot);
   %obj.unmountImage(4);
   %obj.unmountImage(5);
   %obj.unmountImage(6);
   %obj.unmountImage(7);
   %obj.client.setWeaponsHudActive("Plasma", 1);
   %obj.client.setWeaponsHudActive(%this.item, 1); 
}

function SEStrikeImage::onFire(%data, %obj, %slot){
   %p =  parent::onFire(%data, %obj, %slot);
   %obj.applyImpulse(%obj.getPosition(), VectorScale(%obj.getMuzzleVector(0), -4000));
}

datablock ShockwaveData(dragonEyeShockwave){
   width = 30;
   numSegments = 32;
   numVertSegments = 7;
   velocity = 40;
   acceleration = 10.0;
   lifetimeMS = 1000;
   height = 6;
   verticalCurve = 0.375;

   mapToTerrain = false;
   renderBottom = true;
   orientToNormal = true;

   texture[0] = "special/shockwave5";
   texture[1] = "special/gradient";
   texWrap = 3.0;

   times[0] = 1.0;
   times[1] = 0.5;
   times[2] = 1.0;

   colors[0] = "0.9 0.3 0.0 1.0";
   colors[1] = "0.9 0.3 0.0 1.0";
   colors[2] = "1.0 0.0 0.0 0.0";
};

datablock ExplosionData(dragonEyeExplosion){
   explosionShape = "effect_plasma_explosion.dts";
   soundProfile   = PlasmaBarrelExpSound;
   shockwave      = dragonEyeShockwave;
   faceViewer     = true;
   sizes[0] = "4.0 4.0 4.0";
   sizes[1] = "4.0 4.0 4.0";
   times[0] = 0.0;
   times[1] = 1.0;
};

datablock SniperProjectileData(dragonEyeBeam){

   directDamage        = 10.0;
   hasDamageRadius     = true;
   indirectDamage      = 10.0;
   damageRadius        = 1.0;
   velInheritFactor    = 1.0;
   sound 			   = BlasterProjectileSound;
   explosion           = "dragonEyeExplosion";
   splash              = PlasmaSplash;
   directDamageType    = $DamageType::Lava;

   maxRifleRange       = 500;
   rifleHeadMultiplier = 1;   
   beamColor           = "1 0.0 0.0";
   fadeTime            = 2.0;

   startBeamWidth		  = 1.5;
   endBeamWidth 	     = 1.5;
   pulseBeamWidth 	  = 0.5;
   beamFlareAngle 	  = 3.0;
   minFlareSize        = 0.0;
   maxFlareSize        = 400.0;
   pulseSpeed          = 6.0;
   pulseLength         = 0.150;

   lightRadius         = 1.0;
   lightColor          = "1 0.0 0.0";

   textureName[0]      = "special/flare";
   textureName[1]      = "special/nonlingradient";
   textureName[2]      = "special/laserrip01";
   textureName[3]      = "special/laserrip02";
   textureName[4]      = "special/laserrip03";
   textureName[5]      = "special/laserrip04";
   textureName[6]      = "special/laserrip05";
   textureName[7]      = "special/laserrip06";
   textureName[8]      = "special/laserrip07";
   textureName[9]      = "special/laserrip08";
   textureName[10]     = "special/laserrip09";
   textureName[11]     = "special/sniper00";
   

};


function vectorPerpDK(%vec){//perpendicular vector
   %x = getWord(%vec,1) * -1;
   %y = getWord(%vec,2) * -1;
   %z = getWord(%vec,0) * -1;
   return %x SPC %y SPC %z;
}

function tubeDK(%radius, %segments, %pos1, %pos2, %i){
   %qxyz = vectorSub(%pos2,%pos1);//main vector
   %uxyz = vectorPerpDK(%qxyz); //perpendicular vector 
   %vxyz = vectorCross(%qxyz,%uxyz);//find the cross vector 
   %uxyz = vectorNormalize(%uxyz);// normlize main and cross vector
   %vxyz = vectorNormalize(%vxyz);
   
   %theta = 2*3.1415926*%i/%segments;  
   %x = %radius *(mCos(%theta)*getWord(%uxyz,0) + mSin(%theta)*getWord(%vxyz,0)); // rotate around main vector 
   %y = %radius *(mCos(%theta)*getWord(%uxyz,1) + mSin(%theta)*getWord(%vxyz,1));
   %z = %radius *(mCos(%theta)*getWord(%uxyz,2) + mSin(%theta)*getWord(%vxyz,2));
   return (getWord(%pos2,0) + %x SPC getWord(%pos2,1) + %y  SPC  getWord(%pos2,2) + %z);//sum are offset 
}