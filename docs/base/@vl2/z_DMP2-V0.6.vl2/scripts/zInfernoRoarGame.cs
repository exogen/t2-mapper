$vocTimeSec = 25 * 60;
$vocFloodAmount = 25;

function voc3Sim(){
	if(($MatchStarted + $missionRunning) == 2 && isObject(lavablock) && ($HostGamePlayerCount - $HostGameBotCount > 0) && !$testcheats){
		%amount = $vocFloodAmount / $vocTimeSec;
		if(lavablock.he  < $vocFloodAmount){
			lavablock.he += %amount;
			lavablock.setTransform(vectorAdd(lavablock.getPosition(), "0 0" SPC %amount) SPC "0 0 1 0");
		}
		lavablock.simSec++;
		if(lavablock.simSec >= (60 * 5) && !lavablock.teamOne){
			vocBoom(1);
			lavablock.teamOne = 1;
		}
		
		if(lavablock.simSec >= (60 * 10) && !lavablock.teamTwo){
			vocBoom(2);
			lavablock.teamTwo = 1;
		}
		voc3Spew();
	}
	if(isObject(infernoGameStartObj)){
		$voc3SimEvent = schedule(1000, 0, "voc3Sim");
	}
	else{// map change kill any events 
	   $InvBanList[CTF, "SniperRifle"] = 0; 
		for(%i = 0; %i < 4; %i++){
			cancel($voc3SCH[%i]);
		}
	}
}

function voc3Spew(){
  if(isObject(t1VOCEmitter) &&  isObject(t2VOCEmitter)){
      %pos = getRandom(1,2) == 1 ? "-601.444 -668.605 470" : "598.206 648.93 470"; 
  }
  else if(isObject(t1VOCEmitter) && getRandom(1,2) == 1){
      %pos = "-601.444 -668.605 470"; 
  }
  else if(isObject(t2VOCEmitter) && getRandom(1,2) == 2){
      %pos = "598.206 648.93 470";  
  }
  else{
      return;  
  }
  
  if(getRandom(1,25) == 1){
      InitContainerRadiusSearch("0 0 300",  1024, $TypeMasks::PlayerObjectType | $TypeMasks::TurretObjectType | $TypeMasks::SensorObjectType);           //| $TypeMasks::PlayerObjectType
      %listCount = 0;
      while ((%obj = containerSearchNext()) != 0){
         %listPos[%listCount] = %obj.getPosition();
         %listCount++; 
      }
      //error(%listPos[getRandom(0,%listCount-1)]);
     dropBigRock(%listPos[getRandom(0,%listCount-1)]);
  }
  
   %vec = "0 0 1";
   for(%i = 0; %i < getRandom(1,4); %i++){
      %x = (getRandom() - 0.5) * 2 * 3.1415926 * 0.25;
      %y = (getRandom() - 0.5) * 2 * 3.1415926 * 0.25;
      %z = (getRandom() - 0.5) * 2 * 3.1415926 * 0.25;
      %mat = MatrixCreateFromEuler(%x SPC %y SPC %z);
      %vector = MatrixMulVector(%mat,  %vec);
      %p = new GrenadeProjectile() {
            dataBlock        = vocBlastExplosionProj;
            initialDirection = %vector;
            initialPosition  = VectorAdd(%pos, VectorScale(%vec, 5));
            sourceObject     = -1; 
            sourceSlot       = 0;
            vehicleObject    = 0;
         };
      MissionCleanup.add(%p);
      %p.setScopeAlways();
   }  
}


function vocBoom(%team){
   if(%team == 1){
      %position = "-601.444 -668.605 470";
      %vec = "0 0 1";
      if(!isObject(t1VOCEmitter)){
         new ParticleEmissionDummy(t1VOCEmitter) {//team1
            position = "-603.371 -664.313 360";
            rotation = "1 0 0 0";
            scale = "1 1 1";
            dataBlock = "defaultEmissionDummy";
            lockCount = "0";
            homingCount = "0";
            emitter = "vocAshSmokeEmitter";
            velocity = "1";
         };  
         MissionCleanup.add(t1VOCEmitter);
         
         %ln = new Lightning() {
            position = "-603.371 -664.313 600";
            rotation = "1 0 0 0";
            scale = "200 200 800";
            dataBlock = "VocZapStorm";
            strikesPerMinute = "12";
            strikeWidth = "2.5";
            chanceToHitTarget = "0.95";
            strikeRadius = "20";
            boltStartRadius = "20";
            color = "1.000000 1.000000 1.000000 1.000000";
            fadeColor = "0.300000 0.300000 1.000000 1.000000";
            useFog = "1";
         };
         MissionCleanup.add(%ln); 
      }
   }
   else{
      %position = "598.206 648.93 470";
      %vec = "0 0 1";
      new ParticleEmissionDummy(t2VOCEmitter) {//team2
         position = "598.206 648.93 360";
         rotation = "1 0 0 0";
         scale = "1 1 1";
         dataBlock = "defaultEmissionDummy";
         lockCount = "0";
         homingCount = "0";
         emitter = "vocAshSmokeEmitter";
         velocity = "1";
      };
      MissionCleanup.add(t2VOCEmitter);
      
      %ln = new Lightning() {
            position = "598.206 648.93 600";
            rotation = "1 0 0 0";
            scale = "200 200 800";
            dataBlock = "VocZapStorm";
            strikesPerMinute = "12";
            strikeWidth = "2.5";
            chanceToHitTarget = "0.95";
            strikeRadius = "20";
            boltStartRadius = "20";
            color = "1.000000 1.000000 1.000000 1.000000";
            fadeColor = "0.300000 0.300000 1.000000 1.000000";
            useFog = "1";
         };
         MissionCleanup.add(%ln); 
   }
   
   %a = new AudioEmitter() {
			position = "0 0 200";
			rotation = "1 0 0 0";
			scale = "1 1 1";
			fileName = "thud.wav";
			useProfileDescription = "0";
			outsideAmbient = "1";
			volume = "1";
			isLooping = "0";
			is3D = "0";
			minDistance = "20";
			maxDistance = "2048";
			coneInsideAngle = "360";
			coneOutsideAngle = "360";
			coneOutsideVolume = "1";
			coneVector = "0 0 1";
			loopCount = "-1";
			minLoopGap = "0";
			maxLoopGap = "0";
			type = "EffectAudioType";
   };
   %a.schedule(1000,"delete");
   MissionCleanup.add(%a);
   %p = new LinearFlareProjectile() {
         dataBlock        = explVoc;
         initialDirection = VectorScale(%vec, -1);
         initialPosition  = VectorAdd(%position, VectorScale(%vec, 5));
         sourceObject     = -1; 
         sourceSlot       = 0;
         vehicleObject    = 0;
      };  
   MissionCleanup.add(%p);
   %p.setScopeAlways();
   $voc3SCH[0] = schedule(400,0,"vocDelayBoom",%position);
   $voc3SCH[1] = schedule(400,0,"vocPartboom",%position,%vec);
   $voc3SCH[2] = schedule(1500,0,"vocAudioEvent",%position);
   $voc3SCH[3] = schedule(5000,0,"vocSkyEvent",%position);
   for(%i = 0; %i < ClientGroup.getCount(); %i++){
      %cobj = ClientGroup.getObject(%i).getControlObject();
      %cobj.schedule(100,"setWhiteout",0.75); 
   }
}

function vocDelayBoom(%position){
    %p = new LinearFlareProjectile() {
         dataBlock        = vocExplTwo;
         initialDirection = "0 0 -1";
         initialPosition  = %position;
         sourceObject     = -1;
         sourceSlot       = 0;
         vehicleObject    = 0;
      };  
      %p.setScopeAlways();
}
function vocAudioEvent(%position){
    %a = new AudioEmitter() {
			position = %position;
			rotation = "1 0 0 0";
			scale = "1 1 1";
			fileName = "ve3.wav";
			useProfileDescription = "0";
			outsideAmbient = "1";
			volume = "0.8";
			isLooping = "0";
			is3D = "1";
			minDistance = "1024";
			maxDistance = "2048";
			coneInsideAngle = "360";
			coneOutsideAngle = "360";
			coneOutsideVolume = "1";
			coneVector = "0 0 1";
			loopCount = "-1";
			minLoopGap = "0";
			maxLoopGap = "0";
			type = "EffectAudioType";
   };
   %a.schedule(40000,"delete");
   MissionCleanup.add(%a);  
}
function vocPartboom(%position,%vec){
   %a = new AudioEmitter() {
			position = "0 0 200";
			rotation = "1 0 0 0";
			scale = "1 1 1";
			fileName = "vocBoomStr.wav";
			useProfileDescription = "0";
			outsideAmbient = "1";
			volume = "0.7";
			isLooping = "0";
			is3D = "0";
			minDistance = "20";
			maxDistance = "2048";
			coneInsideAngle = "360";
			coneOutsideAngle = "360";
			coneOutsideVolume = "1";
			coneVector = "0 0 1";
			loopCount = "-1";
			minLoopGap = "0";
			maxLoopGap = "0";
			type = "EffectAudioType";
   };
   %a.schedule(30000,"delete");
   %a = new AudioEmitter() {
			position = "0 0 200";
			rotation = "1 0 0 0";
			scale = "1 1 1";
			fileName = "lowrum.wav";
			useProfileDescription = "0";
			outsideAmbient = "1";
			volume = "1";
			isLooping = "0";
			is3D = "0";
			minDistance = "20";
			maxDistance = "2048";
			coneInsideAngle = "360";
			coneOutsideAngle = "360";
			coneOutsideVolume = "1";
			coneVector = "0 0 1";
			loopCount = "-1";
			minLoopGap = "0";
			maxLoopGap = "0";
			type = "EffectAudioType";
   };
   %a.schedule(35000,"delete");
   MissionCleanup.add(%a);
   for(%i = 0; %i < 150; %i++){
      %x = (getRandom() - 0.5) * 2 * 3.1415926 * 0.15;
      %y = (getRandom() - 0.5) * 2 * 3.1415926 * 0.15;
      %z = (getRandom() - 0.5) * 2 * 3.1415926 * 0.15;
      %mat = MatrixCreateFromEuler(%x SPC %y SPC %z);
      %vector = MatrixMulVector(%mat,  %vec);
      %p = new GrenadeProjectile() {
            dataBlock        = vocBlastExplosionProj;
            initialDirection = %vector;
            initialPosition  = VectorAdd(%position, VectorScale(%vec, 5));//vectorAdd(%position,"0 0 100");
            sourceObject     = -1; 
            sourceSlot       = 0;
            vehicleObject    = 0;
         };
      MissionCleanup.add(%p);
      %p.setScopeAlways();
   }
   %part = new ParticleEmissionDummy() {
      position =  %position;
      rotation = "1 0 0 0";
      scale = "1 1 1";
      dataBlock = manyTimeEmissionDummy;
      emitter = "vocBlastExplosionEmitterS";
      velocity = "1";
   };  
   MissionCleanup.add(%part);
   %part.setScopeAlways();
   %part.schedule(10000, "delete");
   %part = new ParticleEmissionDummy() {
      position = %position;
      rotation = "1 0 0 0";
      scale = "1 1 1";
      dataBlock = defaultEmissionDummy;
      emitter = "vocBlastShockwaveEmitter";
      velocity = "1";
   }; 
   MissionCleanup.add(%part);
   %part.setScopeAlways();
   %part.schedule(10000, "delete");
}

function vocSkyEvent(){
   if(!isObject(FireballAtmosphere)){
      %fireball = new FireballAtmosphere(FireballAtmosphere)
      {
         position = "0 0 0";
         rotation = "1 0 0 0";
         scale = "1 1 1";
         dataBlock = "fireball";
         lockCount = "1";
         homingCount = "1";
         dropRadius = 300;
         dropsPerMinute = 60;
         minDropAngle = "0";
         maxDropAngle = "50";
         startVelocity = "300";
         dropHeight = "2000";
         dropDir = "0.212 0.212 -0.953998";
      };
      MissionCleanup.add(%fireball);
      %embers = new Precipitation(Precipitation)
      {
         position = "116.059 -26.7731 156.557";
         rotation = "1 0 0 0";
         scale = "1 1 1";
         dataBlock = "Snow";
         lockCount = "0";
         homingCount = "0";
         percentage = "1";
         color1 = "0.000000 0.000000 0.000000 1.000000";
         color2 = "-1.000000 0.000000 0.000000 1.000000";
         color3 = "-1.000000 0.000000 0.000000 1.000000";
         offsetSpeed = "0";
         minVelocity = "0.02";
         maxVelocity = "0.06";
         maxNumDrops = "500";
         maxRadius = "125";
      };   
      MissionCleanup.add(%embers);
   }
}


datablock ParticleEmissionDummyData(manyTimeEmissionDummy){
   timeMultiple = 20.0;
};

datablock ParticleData(vocBlastShockwaveParticle) {
   dragCoefficient = "2";
   windCoefficient = "0";
   gravityCoefficient = "1";
   inheritedVelFactor = "0";
   constantAcceleration = "0";
   lifetimeMS = "30000";
   lifetimeVarianceMS = "100";
   spinSpeed = "0";
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
   textureName = "smoke02";
   colors[0] = "0.458824 0.458824 0.458824 1";
   colors[1] = "0.321569 0.321569 0.321569 0.496";
   colors[2] = "0.584314 0.584314 0.588235 1";
   colors[3] = "0.843137 0.847059 0.847059 0";
   sizes[0] = "150";
   sizes[1] = "150";
   sizes[2] = "150";
   sizes[3] = "150";
   times[0] = "0";
   times[1] = "0.291667";
   times[2] = "0.6875";
   times[3] = "1";
};

datablock ParticleEmitterData(vocBlastShockwaveEmitter) {
   ejectionPeriodMS = "1";
   periodVarianceMS = "0";
   ejectionVelocity = "600";
   velocityVariance = "0";
   ejectionOffset = "0";
   ejectionOffsetVariance = "0";
   thetaMin = "0";
   thetaMax = "90";
   phiReferenceVel = "0";
   phiVariance = "360";
   softnessDistance = "0.0001";
   ambientFactor = "0";
   overrideAdvance = "0";
   orientParticles = "0";
   orientOnVelocity = "1";
   particles = "vocBlastShockwaveParticle";
   lifetimeMS = "2000";
   lifetimeVarianceMS = "0";
   
   
};

datablock ParticleData(vocBlastExplosionParticleS) {
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
   animateTexture = "0";
   framesPerSec = "1";
   textureCoords[0] = "0 0";
   textureCoords[1] = "0 1";
   textureCoords[2] = "1 1";
   textureCoords[3] = "1 0";
   animTexTiling = "0 0";
   textureName = "dParticle";
   colors[0] = "0.984 0.992 0.992 0.157";
   colors[1] = "0.984 0.984 0.992 0.173";
   colors[2] = "0.996 0.996 0.992 0.197";
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

datablock ParticleEmitterData(vocBlastExplosionEmitterS) {
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
   particles = "vocBlastExplosionParticleS";
   lifetimeMS = "150";
   lifetimeVarianceMS = "0";  
};

datablock ParticleData(vocBlastFireParticle) {
   dragCoefficient = "1";
   windCoefficient = "0";
   gravityCoefficient = "0";
   inheritedVelFactor = "0";
   constantAcceleration = "0";
   lifetimeMS = "100";
   lifetimeVarianceMS = "0";
   spinSpeed = "0";
   spinRandomMin = "-90";
   spinRandomMax = "500";
   useInvAlpha = "0";
   animateTexture = "0";
   framesPerSec = "1";
   textureCoords[0] = "0 0";
   textureCoords[1] = "0 1";
   textureCoords[2] = "1 1";
   textureCoords[3] = "1 0";
   animTexTiling = "0 0";
   textureName = "dParticle";
   colors[0] = "0.996078 0.301961 0.00784314 1";
   colors[1] = "0.996078 0.301961 0.00784314 0.77";
   colors[2] = "0.996078 0.301961 0.00784314 0.761";
   colors[3] = "0.996078 0.301961 0.00784314 1";
   sizes[0] = "3";
   sizes[1] = "3";
   sizes[2] = "3";
   sizes[3] = "3";
   times[0] = "0";
   times[1] = "0.270833";
   times[2] = "0.625";
   times[3] = "1";
};

datablock ParticleEmitterData(vocBlastFireEmitter) {
   ejectionPeriodMS = "2";
   periodVarianceMS = "0";
   ejectionVelocity = "0";
   velocityVariance = "0";
   ejectionOffset = "0";
   ejectionOffsetVariance = "0";
   thetaMin = "0";
   thetaMax = "15";
   phiReferenceVel = "0";
   phiVariance = "360";
   softnessDistance = "1";
   ambientFactor = "0";
   overrideAdvance = "1";
   orientParticles = "0";
   orientOnVelocity = "0";
   particles = "vocBlastFireParticle";
   lifetimeMS = "0";
   lifetimeVarianceMS = "0";
   
   
   useInvAlpha = false;
   sortParticles = "0";
   reverseOrder = "0";
   alignParticles = "0";
   alignDirection = "0 1 0";
   highResOnly = "1";
   
   
   
   Dampening = "0.8";
   elasticity = "0.3";
   
   
   
};

datablock ParticleData(vocBlastFireParticle2) {
   dragCoefficient = "0.0";
   windCoefficient = "0";
   gravityCoefficient = "0";
   inheritedVelFactor = "0";
   constantAcceleration = "0";
   lifetimeMS = "3000";//was 9000
   lifetimeVarianceMS = "1000";
   spinSpeed = "1";
   spinRandomMin = "-90";
   spinRandomMax = "500";
   useInvAlpha = "1";
   animateTexture = "0";
   framesPerSec = "1";
   textureCoords[0] = "0 0";
   textureCoords[1] = "0 1";
   textureCoords[2] = "1 1";
   textureCoords[3] = "1 0";
   animTexTiling = "0 0";
   textureName = "smoke02";
   colors[0] = "0.458824 0.458824 0.458824 1";
   colors[1] = "0.321569 0.321569 0.321569 0.496";
   colors[2] = "0.584314 0.584314 0.588235 1";
   colors[3] = "0.843137 0.847059 0.847059 0";
   sizes[0] = "5";
   sizes[1] = "5";
   sizes[2] = "5";
   sizes[3] = "5";
   times[0] = "0";
   times[1] = "0.329412";
   times[2] = "0.666667";
   times[3] = "1";
};

datablock ParticleEmitterData(vocBlastFireEmitter2) {
   ejectionPeriodMS = "15";
   periodVarianceMS = "0";
   ejectionVelocity = "0";
   velocityVariance = "0";
   ejectionOffset = "4.583";
   ejectionOffsetVariance = "0";
   thetaMin = "0";
   thetaMax = "5";
   phiReferenceVel = "0";
   phiVariance = "360";
   softnessDistance = "1";
   ambientFactor = "0";
   overrideAdvance = "1";
   orientParticles = "0";
   orientOnVelocity = "0";
   particles = "vocBlastFireParticle2";
   lifetimeMS = "0";
   lifetimeVarianceMS = "0";  
};

datablock GrenadeProjectileData(vocBlastExplosionProj)
{
   projectileShapeName = "grenade_projectile.dts";
   emitterDelay        = -1;
   directDamage        = 0.0;
   hasDamageRadius     = true;
   indirectDamage      = 0.40;
   damageRadius        = 15.0;
   radiusDamageType    = $DamageType::Explosion;
   kickBackStrength    = 1500;
   bubbleEmitTime      = 1.0;

   //sound               = "";
   explosion           = FireballAtmosphereBoltExplosion;
   underwaterExplosion = UnderwaterMortarExplosion;
   velInheritFactor    = 0.85; 

   baseEmitter         = vocBlastFireEmitter2;
   delayEmitter        = vocBlastFireEmitter;
   emitterDelay = 32;
   bubbleEmitter       = MortarBubbleEmitter;

   grenadeElasticity = 0.30; 
   grenadeFriction   = 0.2;
   armingDelayMS     = 250;
   muzzleVelocity    = 200.00;
   gravityMod        = 3.9; 
};




datablock ExplosionData(vocBlastSmokeStack){
   lifeTimeMS = 30000;
   offset = 0;
   shakeCamera = true;
   camShakeFreq = "8.0 8.0 8.0";
   camShakeAmp = "5.0 5.0 5.0";
   camShakeDuration = 5;
   camShakeRadius = 2500.0;
};

datablock LinearFlareProjectileData(vocExplTwo){
   //projectileShapeName = "disc_explosion.dts";
   scale               = "1.0 1.0 1.0";
   faceViewer          = true;
   directDamage        = 0.0;
   hasDamageRadius     = true;
   indirectDamage      = 1.0;
   damageRadius        = 7.7;
   kickBackStrength    = 0.0;
   radiusDamageType    = $DamageType::Explosion;

   explosion           = "vocBlastSmokeStack";

   dryVelocity       = 0.1;
   wetVelocity       = -1;
   velInheritFactor  = 0.3;
   fizzleTimeMS      = 0;
   lifetimeMS        = 1000;
   explodeOnDeath    = true;
   reflectOnWaterImpactAngle = 0.0;
   explodeOnWaterImpact      = true;
   deflectionOnWaterImpact   = 0.0;
   fizzleUnderwaterMS        = -1;

   activateDelayMS = -1;

   size[0]           = 0.9;
   size[1]           = 1.0;
   size[2]           = 0.8;


   numFlares         = 80;
   flareColor        = "0.0 1.0 0.0";
   flareModTexture   = "flaremod";
   flareBaseTexture  = "flarebase";
	sound        = PlasmaProjectileSound;
   wetFireSound = PlasmaFireWetSound;

   hasLight    = true;
   lightRadius = 5.0;
   lightColor  = "0 1.0 0";
};




datablock ParticleData(vocBlastRingParticle) {
   dragCoefficient = "0.8";
   windCoefficient = "0";
   gravityCoefficient = "0";
   inheritedVelFactor = "0";
   constantAcceleration = "0";
   lifetimeMS = "9000";
   lifetimeVarianceMS = "1000";
   spinSpeed = "0.167";
   spinRandomMin = "-90";
   spinRandomMax = "500";
   useInvAlpha = "1";
   animateTexture = "0";
   framesPerSec = "1";
   textureCoords[0] = "0 0";
   textureCoords[1] = "0 1";
   textureCoords[2] = "1 1";
   textureCoords[3] = "1 0";
   animTexTiling = "0 0";
   textureName = "smoke02";
   colors[0] = "0.494118 0.494118 0.494118 0.559";
   colors[1] = "0.388235 0.388235 0.388235 0.568";
   colors[2] = "0.403922 0.403922 0.403922 0.556";
   colors[3] = "0.462745 0.462745 0.462745 0";
   sizes[0] = "50";
   sizes[1] = "50";
   sizes[2] = "50";
   sizes[3] = "50";
   times[0] = "0";
   times[1] = "0.375";
   times[2] = "0.854167";
   times[3] = "1";
};

datablock ParticleEmitterData(vocBlastRingEmitter) {
   ejectionPeriodMS = "1";
   periodVarianceMS = "0";
   ejectionVelocity = "600";
   velocityVariance = "50";
   ejectionOffset = "0";
   ejectionOffsetVariance = "0";
   thetaMin = "90";
   thetaMax = "90";
   phiReferenceVel = "0";
   phiVariance = "360";
   softnessDistance = "1";
   ambientFactor = "0";
   overrideAdvance = "1";
   orientParticles = "0";
   orientOnVelocity = "0";
   particles = "vocBlastRingParticle";
   lifetimeMS = "0";
   lifetimeVarianceMS = "0";
   
   
   blendStyle = "NORMAL";
   sortParticles = "0";
   reverseOrder = "0";
   alignParticles = "0";
   alignDirection = "0 1 0";
   highResOnly = "1";
   
   
   
   Dampening = "0.8";
   elasticity = "0.3";
   
   
   
};

datablock ParticleData(vocBlastExplosionParticle2) {
   dragCoefficient = "0.25";
   windCoefficient = "0";
   gravityCoefficient = "1";
   inheritedVelFactor = "0";
   constantAcceleration = "0";
   lifetimeMS = "20000";
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
   textureName = "smoke02";
   animTexName = "smoke02";
   colors[0] = "0.529412 0.533333 0.533333 0.495";
   colors[1] = "0.537 0.537 0.541 0.538";
   colors[2] = "0.568627 0.568627 0.564706 0.492";
   colors[3] = "0.502 0.502 0.498 0";
   sizes[0] = "150";
   sizes[1] = "150";
   sizes[2] = "150";
   sizes[3] = "150";
   times[0] = "0";
   times[1] = "0.229167";
   times[2] = "0.8875";
   times[3] = "1";
};

datablock ParticleEmitterData(vocBlastExplosionEmitter2) {
   ejectionPeriodMS = "1";
   periodVarianceMS = "0";
   ejectionVelocity = "150";
   velocityVariance = "100.83";
   ejectionOffset = "0";
   ejectionOffsetVariance = "0";
   thetaMin = "0";
   thetaMax = "90";
   phiReferenceVel = "0";
   phiVariance = "360";
   softnessDistance = "0.0001";
   ambientFactor = "0";
   overrideAdvance = "0";
   orientParticles = "0";
   orientOnVelocity = "1";
   particles = "vocBlastExplosionParticle2";
   lifetimeMS = "4000";
   lifetimeVarianceMS = "0";
   
};

datablock ParticleData(vocBlastExplosionParticle) {
   dragCoefficient = "1.8";
   windCoefficient = "0";
   gravityCoefficient = "0";
   inheritedVelFactor = "0";
   constantAcceleration = "0";
   lifetimeMS = "6188";
   lifetimeVarianceMS = "0";
   spinSpeed = "0";
   spinRandomMin = "-360";
   spinRandomMax = "720";
   useInvAlpha = "0";
   animateTexture = "0";
   framesPerSec = "1";
   textureCoords[0] = "0 0";
   textureCoords[1] = "0 1";
   textureCoords[2] = "1 1";
   textureCoords[3] = "1 0";
   animTexTiling = "0 0";
   textureName = "dParticle";
   colors[0] = "0.992 0.301961 0.0 1";
   colors[1] = "0.992 0.301961 0.0 1";
   colors[2] = "0.996078 0.301961 0.00784314 1";
   colors[3] = "0.980392 0.301961 0.0156863 0";
   sizes[0] = "100";
   sizes[1] = "100";
   sizes[2] = "100";
   sizes[3] = "100";
   times[0] = "0";
   times[1] = "0.104167";
   times[2] = "0.208333";
   times[3] = "0.354167";
};

datablock ParticleEmitterData(vocBlastExplosionEmitter) {
   ejectionPeriodMS = "1";
   periodVarianceMS = "0";
   ejectionVelocity = "655.35";
   velocityVariance = "0";
   ejectionOffset = "0";
   ejectionOffsetVariance = "0";
   thetaMin = "0";
   thetaMax = "90";
   phiReferenceVel = "0";
   phiVariance = "360";
   softnessDistance = "0.0001";
   ambientFactor = "0";
   overrideAdvance = "0";
   orientParticles = "0";
   orientOnVelocity = "1";
   particles = "vocBlastExplosionParticle";
   lifetimeMS = "2000";
   lifetimeVarianceMS = "0";
   
   
   useInvAlpha = false;
   sortParticles = "1";
   reverseOrder = "0";
   alignParticles = "0";
   alignDirection = "0 1 0";
   highResOnly = "1";
   
   glow = "1";
   
   Dampening = "0.8";
   elasticity = "0.3";
   
   
   
};


datablock ExplosionData(vocBlastExplosion)
{
   
   emitter[0] = vocBlastExplosionEmitter;
   emitter[1] = vocBlastExplosionEmitter2;
   emitter[2] = vocBlastRingEmitter;
   
   lifeTimeMS = 6000;
   
   shakeCamera = true;
   camShakeFreq = "8.0 8.0 8.0";
   camShakeAmp = "1.0 1.0 1.0";
   camShakeDuration = 5;
   camShakeRadius = 2500.0;

};

datablock LinearFlareProjectileData(explVoc){
   scale               = "1.0 1.0 1.0";
   faceViewer          = true;
   directDamage        = 0.0;
   hasDamageRadius     = true;
   indirectDamage      = 1.0;
   damageRadius        = 400.7;
   kickBackStrength    = 50000.0;
   radiusDamageType    = $DamageType::Explosion;

   explosion           = "vocBlastExplosion";

   dryVelocity       = 0.1;
   wetVelocity       = -1;
   velInheritFactor  = 0.3;
   fizzleTimeMS      = 0;
   lifetimeMS        = 256;
   explodeOnDeath    = true;
   reflectOnWaterImpactAngle = 0.0;
   explodeOnWaterImpact      = true;
   deflectionOnWaterImpact   = 0.0;
   fizzleUnderwaterMS        = -1;
   activateDelayMS = -1;

   size[0]           = 0.9;
   size[1]           = 1.0;
   size[2]           = 0.8;


   numFlares         = 80;
   flareColor        = "0.0 1.0 0.0";
   flareModTexture   = "flaremod";
   flareBaseTexture  = "flarebase";
	sound        = PlasmaProjectileSound;
   wetFireSound = PlasmaFireWetSound;

   hasLight    = true;
   lightRadius = 5.0;
   lightColor  = "0 1.0 0";
};


datablock AudioProfile(VocLightningZapSound){
   filename = "fx/misc/lightning_impact.wav";
   description = AudioExplosion3d;
};

datablock LightningData(VocZapStorm){
   directDamageType = $DamageType::Lightning;
   directDamage = 1;
   
   strikeTextures[0]  = "special/skyLightning";

   strikeSound = VocLightningZapSound;
};


datablock ParticleData(vocBlastBigFireParticle) {
   dragCoefficient = "1";
   windCoefficient = "0";
   gravityCoefficient = "0";
   inheritedVelFactor = "0";
   constantAcceleration = "0";
   lifetimeMS = "100";
   lifetimeVarianceMS = "0";
   spinSpeed = "0";
   spinRandomMin = "-90";
   spinRandomMax = "500";
   useInvAlpha = "0";
   animateTexture = "0";
   framesPerSec = "1";
   textureCoords[0] = "0 0";
   textureCoords[1] = "0 1";
   textureCoords[2] = "1 1";
   textureCoords[3] = "1 0";
   animTexTiling = "0 0";
   textureName = "dParticle";
   colors[0] = "0.996078 0.301961 0.00784314 1";
   colors[1] = "0.996078 0.301961 0.00784314 0.77";
   colors[2] = "0.996078 0.301961 0.00784314 0.761";
   colors[3] = "0.996078 0.301961 0.00784314 1";
   sizes[0] = "13";
   sizes[1] = "13";
   sizes[2] = "13";
   sizes[3] = "13";
   times[0] = "0";
   times[1] = "0.270833";
   times[2] = "0.625";
   times[3] = "1";
};

datablock ParticleEmitterData(vocBlastBigFireEmitter) {
   ejectionPeriodMS = "2";
   periodVarianceMS = "0";
   ejectionVelocity = "0";
   velocityVariance = "0";
   ejectionOffset = "0";
   ejectionOffsetVariance = "0";
   thetaMin = "0";
   thetaMax = "15";
   phiReferenceVel = "0";
   phiVariance = "360";
   softnessDistance = "1";
   ambientFactor = "0";
   overrideAdvance = "1";
   orientParticles = "0";
   orientOnVelocity = "0";
   particles = "vocBlastBigFireParticle";
   lifetimeMS = "0";
   lifetimeVarianceMS = "0";
   
   
   useInvAlpha = false;
   sortParticles = "0";
   reverseOrder = "0";
   alignParticles = "0";
   alignDirection = "0 1 0";
   highResOnly = "1";
   
   
   
   Dampening = "0.8";
   elasticity = "0.3";
   
   
   
};

datablock ParticleData(vocBlastBigFireParticle2) {
   dragCoefficient = "0.0";
   windCoefficient = "0";
   gravityCoefficient = "0";
   inheritedVelFactor = "0";
   constantAcceleration = "0";
   lifetimeMS = "3000";//was 9000
   lifetimeVarianceMS = "1000";
   spinSpeed = "1";
   spinRandomMin = "-90";
   spinRandomMax = "500";
   useInvAlpha = "1";
   animateTexture = "0";
   framesPerSec = "1";
   textureCoords[0] = "0 0";
   textureCoords[1] = "0 1";
   textureCoords[2] = "1 1";
   textureCoords[3] = "1 0";
   animTexTiling = "0 0";
   textureName = "smoke02";
   colors[0] = "0.458824 0.458824 0.458824 1";
   colors[1] = "0.321569 0.321569 0.321569 0.496";
   colors[2] = "0.584314 0.584314 0.588235 1";
   colors[3] = "0.843137 0.847059 0.847059 0";
   sizes[0] = "15";
   sizes[1] = "15";
   sizes[2] = "15";
   sizes[3] = "15";
   times[0] = "0";
   times[1] = "0.329412";
   times[2] = "0.666667";
   times[3] = "1";
};

datablock ParticleEmitterData(vocBlastBigFireEmitter2) {
   ejectionPeriodMS = "15";
   periodVarianceMS = "0";
   ejectionVelocity = "0";
   velocityVariance = "0";
   ejectionOffset = "4.583";
   ejectionOffsetVariance = "0";
   thetaMin = "0";
   thetaMax = "5";
   phiReferenceVel = "0";
   phiVariance = "360";
   softnessDistance = "1";
   ambientFactor = "0";
   overrideAdvance = "1";
   orientParticles = "0";
   orientOnVelocity = "0";
   particles = "vocBlastbigFireParticle2";
   lifetimeMS = "0";
   lifetimeVarianceMS = "0";  
};

datablock GrenadeProjectileData(vocBlastBigExplosionProj)
{
   projectileShapeName = "grenade_projectile.dts";
   emitterDelay        = -1;
   directDamage        = 0.0;
   hasDamageRadius     = true;
   indirectDamage      = 0.40;
   damageRadius        = 15.0;
   radiusDamageType    = $DamageType::Explosion;
   kickBackStrength    = 1500;
   bubbleEmitTime      = 1.0;

   //sound               = "";
   explosion           = VehicleBombExplosion;
   underwaterExplosion = UnderwaterMortarExplosion;
   velInheritFactor    = 0.85; 

   baseEmitter         = vocBlastBigFireEmitter2;
   delayEmitter        = vocBlastBigFireEmitter;
   emitterDelay = 32;
   bubbleEmitter       = MortarBubbleEmitter;

   grenadeElasticity = 0.30; 
   grenadeFriction   = 0.2;
   armingDelayMS     = 250;
   muzzleVelocity    = 200.00;
   gravityMod        = 3.9; 
};


datablock GrenadeProjectileData(vocBlastExplosionProjSlow)
{
   projectileShapeName = "grenade_projectile.dts";
   emitterDelay        = -1;
   directDamage        = 0.0;
   hasDamageRadius     = true;
   indirectDamage      = 0.40;
   damageRadius        = 15.0;
   radiusDamageType    = $DamageType::Explosion;
   kickBackStrength    = 1500;
   bubbleEmitTime      = 1.0;

   //sound               = "";
   explosion           = FireballAtmosphereBoltExplosion;
   underwaterExplosion = UnderwaterMortarExplosion;
   velInheritFactor    = 0.85; 

   baseEmitter         = vocBlastFireEmitter2;
   delayEmitter        = vocBlastFireEmitter;
   emitterDelay = 32;
   bubbleEmitter       = MortarBubbleEmitter;

   grenadeElasticity = 0.30; 
   grenadeFriction   = 0.2;
   armingDelayMS     = 250;
   muzzleVelocity    = 100.00;
   gravityMod        = 3.9; 
};



function vocBlastBigExplosionProj::onExplode(%data, %proj, %pos, %mod){
   parent::onExplode(%data, %proj, %pos, %mod);
      
   %vec = vectorScale(%proj.initialDirection,-1);
   for(%i = 0; %i < 15; %i++){
      %x = (getRandom() - 0.5) * 2 * 3.1415926 * 0.25;
      %y = (getRandom() - 0.5) * 2 * 3.1415926 * 0.25;
      %z = (getRandom() - 0.5) * 2 * 3.1415926 * 0.25;
      %mat = MatrixCreateFromEuler(%x SPC %y SPC %z);
      %vector = MatrixMulVector(%mat,  %vec);
      %p = new GrenadeProjectile() {
            dataBlock        = vocBlastExplosionProjSlow;
            initialDirection = %vector;
            initialPosition  = VectorAdd(%pos, VectorScale(%vec, 5));
            sourceObject     = -1; 
            sourceSlot       = 0;
            vehicleObject    = 0;
         };
      MissionCleanup.add(%p);
      %p.setScopeAlways();
   }  
}

function dropBigRock(%pos){
      %p = new GrenadeProjectile() {
         dataBlock        = vocBlastBigExplosionProj;
         initialDirection = "0 0 -1";
         initialPosition  = vectorAdd(%pos,"0 0 2000");
         sourceObject     = -1; 
         sourceSlot       = 0;
         vehicleObject    = 0;
      };
      MissionCleanup.add(%p);
      %p.setScopeAlways();
}


datablock ParticleData(vocAshSmokeParticle) {
   dragCoefficient = "0";
   windCoefficient = "0";
   gravityCoefficient = "0";
   inheritedVelFactor = "0";
   constantAcceleration = "0";
   lifetimeMS = "6000";
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
   textureName = "smoke02";
   colors[0] = "0.11 0.11 0.11 1.0";
   colors[1] = "0.14 0.14 0.14 0.8";
   colors[2] = "0.167 0.16 0.16 0.7";
   colors[3] = "0.102 0.102 0.198 0.1";
   sizes[0] = "150";
   sizes[1] = "150";
   sizes[2] = "150";
   sizes[3] = "150";
   times[0] = "0.01";
   times[1] = "0.229167";
   times[2] = "0.8875";
   times[3] = "1";
};

datablock ParticleEmitterData(vocAshSmokeEmitter) {
   ejectionPeriodMS = "5";
   periodVarianceMS = "0";
   ejectionVelocity = "100";
   velocityVariance = "50.83";
   ejectionOffset = "50";
   ejectionOffsetVariance = "40";
   thetaMin = "0";
   thetaMax = "30";
   phiReferenceVel = "0";
   phiVariance = "360";
   softnessDistance = "0.0001";
   ambientFactor = "0";
   overrideAdvance = "0";
   orientParticles = "0";
   orientOnVelocity = "1";
   particles = "vocAshSmokeParticle";
   
};

datablock StaticShapeData(infernoGameStart){
   catagory = "misc";
   shapeFile = "flag.dts";
};
function infernoGameStart::onAdd(%this, %obj){  
   Parent::onAdd(%this, %obj);
   $InvBanList[CTF, "SniperRifle"] = 1;// ban sniper rifles from this map 
   if(!isEventPending($voc3SimEvent)){
      lavablock.he = 0;
      lavablock.simSec = 0;
      lavablock.teamOne = 0;
      lavablock.teamTwo = 0;
      $voc3SimEvent = schedule(35000, 0, "voc3Sim");// allow time in case we open the editor 
   }
}