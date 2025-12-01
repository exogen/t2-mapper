datablock ForceFieldBareData(FirnAllFastField)
{
   fadeMS           = 1000;
   baseTranslucency = 0.30;
   powerOffTranslucency = 0.0;
   teamPermiable    = true;
   otherPermiable   = true;
   color            = "0.0 0.0 1.0";   
   powerOffColor    = "0.0 0.0 0.0";
   targetTypeTag    = 'ForceField'; 

   texture[0] = "skins/forcef1";
   texture[1] = "skins/forcef2";
   texture[2] = "skins/forcef3";
   texture[3] = "skins/forcef4";
   texture[4] = "skins/forcef5";

   framesPerSec = 10;
   numFrames = 5;
   scrollSpeed = 15;
   umapping = 1.0;
   vmapping = 0.15;
};

function FirnAllFastField::onAdd(%data, %obj){
   parent::onAdd(%data,%obj);
   if(%obj.pz.getClassName() $= "PhysicalZone"){
		%obj.pz.delete(); 
   }
}

datablock ForceFieldBareData(powerMover)
{
   fadeMS           = 1000;
   baseTranslucency = 0.25;
   powerOffTranslucency = 0.0;
   teamPermiable    = true;
   otherPermiable   = false;
   // it's RGB (red green blue)
   color            = "0.305882 0.000000 1.000000";
   powerOffColor    = "0.305882 0.000000 1.000000";
   targetTypeTag    = 'ForceField';

   texture[0] = "skins/forcef1";
   texture[1] = "skins/forcef2";
   texture[2] = "skins/forcef3";
   texture[3] = "skins/forcef4";
   texture[4] = "skins/forcef5";

   framesPerSec = 10;
   numFrames = 5;
   scrollSpeed = -8;
   umapping = 1.0;
   vmapping = 0.15;
};

function powerMover::onAdd(%data, %obj){
   parent::onAdd(%data,%obj);
   if(%obj.pz.getClassName() $= "PhysicalZone"){
		%obj.pz.delete(); 
   }
}

datablock TriggerData(BoostTrigFirn){
   tickPeriodMS =  32;
};

datablock ParticleData(FCannonExplosionSmokeF){
   dragCoeffiecient     = 0.4;
   gravityCoefficient   = 1.0;   
   inheritedVelFactor   = 0.025;
   lifetimeMS           = 100;
   lifetimeVarianceMS   = 0;
   textureName          = "particleTest";
   useInvAlpha =  0;
   spinRandomMin = -200.0;
   spinRandomMax =  200.0;

   colors[0]     = "0.9 0.3 0.0 1.0";
   colors[1]     = "0.9 0.3 0.0 1";
   colors[2]     = "0.9 0.3 0.1 1";
   sizes[0]      = 16.0;
   sizes[1]      = 16.0;
   sizes[2]      = 12.0;
   times[0]      = 0.0;
   times[1]      = 0.5;
   times[2]      = 1.0;

};

datablock ParticleEmitterData(FHeavyExplosionSmokeEmitterF){
   ejectionPeriodMS = 2;
   periodVarianceMS = 0;
   ejectionVelocity = 520.25;
   velocityVariance = 0.25;
   thetaMin         = 0.0;
   thetaMax         = 35.0;
   lifetimeMS       = 200;

   particles = "FCannonExplosionSmokeF";
};

datablock ParticleData(FCannonSmokeParticleF){
   dragCoeffiecient     = 0.0;
   gravityCoefficient   = 0.1;
   inheritedVelFactor   = 0.00;

   lifetimeMS           = 2000;
   lifetimeVarianceMS   = 150;

   textureName          = "bsmoke02";

   useInvAlpha = 1;
   spinRandomMin = -30.0;
   spinRandomMax = 30.0;

   colors[0]     = "0.2 0.2 0.2 1.0";
   colors[1]     = "0.2 0.2 0.2 1.0";
   colors[2]     = "0.2 0.2 0.2 0.0";

   sizes[0]      = 0.25;
   sizes[1]      = 4.5;
   sizes[2]      = 4.5;

   times[0]      = 0.0;
   times[1]      = 0.2;
   times[2]      = 1.0;
};

datablock ParticleEmitterData(FCannonSmokeEmitterF){
   ejectionPeriodMS = 5;
   periodVarianceMS = 1;

   ejectionVelocity = 14.25;
   velocityVariance = 0.50;

   thetaMin         = 0.0;
   thetaMax         = 90.0;
   lifetimeMS       = 1000;
   particles = "FCannonSmokeParticleF";
};
datablock ExplosionData(FCannonExplosionF){
   explosionShape = "effect_plasma_explosion.dts";
   faceViewer           = true;

   delayMS = 200;

   offset = 5.0;

   playSpeed = 1.5;

   sizes[0] = "6.0 6.0 6.0";
   sizes[1] = "6.0 6.0 6.0";
   times[0] = 0.0;
   times[1] = 1.0;

   emitter[0] = FCannonSmokeEmitterF;
   emitter[1] = FHeavyExplosionSmokeEmitterF;
  //emitter[2] = HeavyCrescentEmitter;

   shakeCamera = true;
   camShakeFreq = "10.0 6.0 9.0";
   camShakeAmp = "20.0 20.0 20.0";
   camShakeDuration = 1;
   camShakeRadius = 150.0;
};

datablock LinearFlareProjectileData(CannonEffectF){
   projectileShapeName = "plasmabolt.dts";
   scale               = "0.1 0.1 0.1";
   faceViewer          = true;
   directDamage        = 0.0;
   hasDamageRadius     = false;
   indirectDamage      = 0.0;
   damageRadius        = 0.0;
   kickBackStrength    = 0.0;
   radiusDamageType    = $DamageType::Plasma;

   explosion           = "FCannonExplosionF";

   dryVelocity       = 32; 
   wetVelocity       = -1;
   velInheritFactor  = 0.3;
   fizzleTimeMS      = 0;
   lifetimeMS        = 125;
   explodeOnDeath    = true;
   reflectOnWaterImpactAngle = 0.0;
   explodeOnWaterImpact      = true;
   deflectionOnWaterImpact   = 0.0;
   fizzleUnderwaterMS        = -1;

   //activateDelayMS = 100;
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

datablock AudioProfile(boostSoundF){
   filename    = "fx/Bonuses/upward_straipass2_elevator.wav";
   description = AudioExplosion3d;
   preload = true;
};

function SimObject::getUpVectorFirn(%obj){
   %rot = getWords(%obj.getTransform(), 3, 6);  
   %tmat = VectorOrthoBasis(%rot);
   return getWords(%tMat, 6, 8);
}
datablock AudioProfile(CannonExpSoundF){
   filename    = "fx/powered/turret_mortar_explode.wav";
   description = "AudioExplosion3d";
   preload = true;
};
function BoostTrigFirn::onEnterTrigger(%data, %trigger, %player){
   
   if(!Game.firnSet){
      Game.firnSet = 1;
      seeA.setScopeAlways(); 
      seeB.setScopeAlways(); 
      seeC.setScopeAlways(); 
   }

   if(%trigger.mode == 1){
      %player.setPosition(%trigger.getWorldBoxCenter());
      %vel = VectorScale(VectorNormalize(%trigger.getUpVectorFirn()), 100);   
      %player.setVelocity(%vel);
      if(getSimTime() - %player.boostTrigTime > 2000){
         serverPlay3D(forceTrig, %trigger.getTransform());
         %player.client.play2D(boostSoundF);
      }
      %player.boostTrigTime = getSimTime();
   }
   else if(%trigger.mode == 2){
      %trigPos = %trigger.getWorldBoxCenter();
      %player.setPosition(%trigPos);
      %vel = VectorScale(VectorNormalize(%trigger.getUpVectorFirn()), 100);   
      %player.setVelocity(%vel);
      serverPlay3D(CannonExpSoundF, %trigger.getTransform());
      %p = new LinearFlareProjectile() {
         dataBlock        = CannonEffectF;
         initialDirection = %trigger.getUpVectorFirn();
         initialPosition  = %trigPos;
         sourceObject     = %player;
         sourceSlot       = 0;
         vehicleObject    = 0;
      };
      MissionCleanup.add(%p);
}
}
function BoostTrigFirn::onTickTrigger(%this, %triggerId){
 // anti spam
}


datablock ParticleData(SnowMistParticle) {
   dragCoefficient = "0";
   windCoefficient = "-1";
   gravityCoefficient = "0";
   inheritedVelFactor = "0";
   constantAcceleration = "0";
   lifetimeMS = "4000";
   lifetimeVarianceMS = "200";
   spinSpeed = "1";
   spinRandomMin = "-50";
   spinRandomMax = "50";
   useInvAlpha = "0";
   textureName = "precipitation/snowflake002";
   colors[0] = "0.3 0.3 0.3 0.0";
   colors[1] = "0.3 0.3 0.3 1";
   colors[2] = "0.3 0.3 0.3 1";
   colors[3] = "0.0787402 0.0787402 0.0787402 1";
   sizes[0] = "0.5";
   sizes[1] = "0.5";
   sizes[2] = "0.5";
   sizes[3] = "0.5";
   times[0] = "0.1";
   times[1] = "0.2";
   times[2] = "0.9";
   times[3] = "1";
};

datablock ParticleEmitterData(SnowMistEmitter) {
   ejectionPeriodMS = "12";
   periodVarianceMS = "0";
   ejectionVelocity = "140";
   velocityVariance = "50";
   ejectionOffset = "50";
   ejectionOffsetVariance = "0";
   thetaMin = "0";
   thetaMax = "15";
   phiReferenceVel = "0";
   phiVariance = "360";
   softnessDistance = "1";
   ambientFactor = "0";
   overrideAdvance = "1";
   orientParticles = "0";
   orientOnVelocity = "1";
   particles = "SnowMistParticle";
   lifetimeMS = "0";
   lifetimeVarianceMS = "0";
   reverseOrder = "0";
   alignParticles = "0";
   alignDirection = "0 1 0";
   highResOnly = "1";
};


datablock ParticleData(HvySnowMistParticle) {
   dragCoefficient = "0";
   windCoefficient = "0.05";
   gravityCoefficient = "0";
   inheritedVelFactor = "0";
   constantAcceleration = "0";
   lifetimeMS = "4000";
   lifetimeVarianceMS = "200";
   spinSpeed = "1";
   spinRandomMin = "-50";
   spinRandomMax = "50";
   useInvAlpha = "0";
   textureName = "rainmist";
   colors[0] = "0.3 0.3 0.3 0.0";
   colors[1] = "0.3 0.3 0.3 0.25";
   colors[2] = "0.3 0.3 0.3 0.25";
   colors[3] = "0.0787402 0.0787402 0.0787402 0.25";
   sizes[0] = "150";
   sizes[1] = "150";
   sizes[2] = "150";
   sizes[3] = "150";
   times[0] = "0.1";
   times[1] = "0.2";
   times[2] = "0.9";
   times[3] = "1";
};

datablock ParticleEmitterData(HvySnowMistEmitter) {
   ejectionPeriodMS = "12";
   periodVarianceMS = "0";
   ejectionVelocity = "140";
   velocityVariance = "50";
   ejectionOffset = "200";
   ejectionOffsetVariance = "100";
   thetaMin = "0";
   thetaMax = "15";
   phiReferenceVel = "0";
   phiVariance = "360";
   softnessDistance = "1";
   ambientFactor = "0";
   overrideAdvance = "1";
   orientParticles = "0";
   orientOnVelocity = "1";
   particles = "RainMistParticle";
   lifetimeMS = "0";
   lifetimeVarianceMS = "0";
   reverseOrder = "0";
   alignParticles = "0";
   alignDirection = "0 1 0";
   highResOnly = "1";
};

datablock PrecipitationData(SnowZ)
{
   type = 0;
   materialList = "snowflakes.dml";
   sizeX = 0.20;
   sizeY = 0.20;
   
   movingBoxPer = 0.35;
   divHeightVal = 1.5;
   sizeBigBox = 1;
   topBoxSpeed = 20;
   frontBoxSpeed = 30;
   topBoxDrawPer = 0.5;
   bottomDrawHeight = 40;
   skipIfPer = -0.3;
   bottomSpeedPer = 1.0;
   frontSpeedPer = 1.5;
   frontRadiusPer = 0.5;
};