// Sound datablocks
datablock EffectProfile(SentryTurretSwitchEffect)
{
   effectname = "powered/turret_sentry_activate";
   minDistance = 2.5;
   maxDistance = 5.0;
};

datablock EffectProfile(SentryTurretFireEffect)
{
   effectname = "powered/turret_sentry_fire";
   minDistance = 2.5;
   maxDistance = 5.0;
};

datablock AudioProfile(SentryTurretSwitchSound)
{
   filename    = "fx/powered/turret_sentry_activate.wav";
   description = AudioClose3d;
   preload = true;
   effect = SentryTurretSwitchEffect;
};

datablock AudioProfile(SentryTurretFireSound)
{
   filename    = "fx/powered/turret_sentry_fire.wav";
   description = AudioDefault3d;
   preload = true;
   effect = SentryTurretFireEffect;
};

datablock AudioProfile(SentryTurretExpSound)
{
   filename    = "fx/powered/turret_sentry_impact.WAV";
   description = AudioClosest3d;
   preload = true;
};

datablock AudioProfile(SentryTurretProjectileSound)
{
   filename    = "fx/weapons/blaster_projectile.WAV";
   description = AudioExplosion3d;
   preload = true;
};

// Explosion

datablock ParticleData(SentryTurretExplosionParticle1)
{
   dragCoefficient      = 0.65;
   gravityCoefficient   = 0.3;
   inheritedVelFactor   = 0.0;
   constantAcceleration = 0.0;
   lifetimeMS           = 500;
   lifetimeVarianceMS   = 150;
   textureName          = "particleTest";
   colors[0]     = "0.26 0.36 0.56 1.0";
   colors[1]     = "0.26 0.36 0.56 0.0";
   sizes[0]      = 0.0425;
   sizes[1]      = 0.15;
};

datablock ParticleEmitterData(SentryTurretExplosionEmitter)
{
   ejectionPeriodMS = 10;
   periodVarianceMS = 0;
   ejectionVelocity = 0.75;
   velocityVariance = 0.25;
   ejectionOffset   = 0.0;
   thetaMin         = 0;
   thetaMax         = 60;
   phiReferenceVel  = 0;
   phiVariance      = 360;
   overrideAdvances = false;
   particles = "SentryTurretExplosionParticle1";
};

datablock ExplosionData(SentryTurretExplosion)
{
   explosionShape = "energy_explosion.dts";
   soundProfile   = SentryTurretExpSound;

   particleEmitter = SentryTurretExplosionEmitter;
   particleDensity = 120;
   particleRadius = 0.15;

   faceViewer           = false;
};

// Projectile

datablock LinearFlareProjectileData(SentryTurretEnergyBolt)
{
   directDamage        = 0.1;
   directDamageType    = $DamageType::SentryTurret;

   explosion           = "SentryTurretExplosion";
   kickBackStrength  = 0.0;

   dryVelocity       = 200.0;
   wetVelocity       = 150.0;
   velInheritFactor  = 0.5;
   fizzleTimeMS      = 2000;
   lifetimeMS        = 3000;
   explodeOnDeath    = false;
   reflectOnWaterImpactAngle = 0.0;
   explodeOnWaterImpact      = false;
   deflectionOnWaterImpact   = 0.0;
   fizzleUnderwaterMS        = 3000;

   numFlares         = 10;
   size              = 0.35;
   flareColor        = "0.35 0.35 1";
   flareModTexture   = "flaremod";
   flareBaseTexture  = "flarebase";

   sound = SentryTurretProjectileSound;

   hasLight    = true;
   lightRadius = 1.5;
   lightColor  = "0.35 0.35 1";
};

// Turret data

datablock SensorData(SentryMotionSensor)
{
   detects = true;
   detectsUsingLOS = true;
   detectsActiveJammed = false;
   detectsPassiveJammed = true;
   detectsCloaked = true;
   detectionPings = false;
   detectRadius = 60;
   detectMinVelocity = 2;
};

datablock TurretData(SentryTurret) : TurretDamageProfile
{
   //className = Turret;
   catagory = "Turrets";
   shapeFile = "turret_sentry.dts";

   //Uses the same stats as an outdoor deployable turret (balancing info for Dave)
   mass = 5.0;

   barrel = SentryTurretBarrel;

   maxDamage = 1.2;
   destroyedLevel = 1.2;
   disabledLevel = 0.84;
   explosion      = ShapeExplosion;
   expDmgRadius = 5.0;
   expDamage = 0.4;
   expImpulse = 1000.0;
   repairRate = 0;

   thetaMin = 89;
   thetaMax = 175;
   emap = true;
   

   isShielded           = true;
   energyPerDamagePoint = 100;
   maxEnergy = 150;
   rechargeRate = 0.40;

   canControl = true;
   cmdCategory = "Tactical";
   cmdIcon = CMDTurretIcon;
   cmdMiniIconName = "commander/MiniIcons/com_turret_grey";
   targetNameTag = 'Sentry';
   targetTypeTag = 'Turret';
   sensorData = SentryMotionSensor;
   sensorRadius = SentryMotionSensor.detectRadius;
   sensorColor = "9 136 255";
   firstPersonOnly = true;
};

datablock TurretImageData(SentryTurretBarrel)
{
   shapeFile = "turret_muzzlepoint.dts";

   projectile = SentryTurretEnergyBolt;
   projectileType = LinearFlareProjectile;
   usesEnergy = true;
   fireEnergy = 6.00;
   minEnergy = 6.00;
   emap = true;

   // Turret parameters
   activationMS      = 300;
   deactivateDelayMS = 500;
   thinkTimeMS       = 200;
   degPerSecTheta    = 520;
   degPerSecPhi      = 960;
   attackRadius      = 60;

   // State transitions
   stateName[0]                     = "Activate";
   stateTimeoutValue[0]             = 0.01;
   stateTransitionOnTimeout[0]      = "Ready";
   stateSound[0]                    = SentryTurretSwitchSound;

   stateName[1]                     = "Ready";
   stateTransitionOnTriggerDown[1]  = "Fire";
   stateTransitionOnNoAmmo[1]       = "NoAmmo";

   stateName[2]                     = "Fire";
   stateTransitionOnTimeout[2]      = "Reload";
   stateTimeoutValue[2]             = 0.13;
   stateFire[2]                     = true;
   stateRecoil[2]                   = LightRecoil;
   stateAllowImageChange[2]         = false;
   stateSequence[2]                 = "Fire";
   stateSound[2]                    = SentryTurretFireSound;
   stateScript[2]                   = "onFire";

   stateName[3]                     = "Reload";
   stateTimeoutValue[3]             = 0.40;
   stateAllowImageChange[3]         = false;
   stateTransitionOnTimeout[3]      = "Ready";
   stateTransitionOnNoAmmo[3]       = "NoAmmo";

   stateName[4]                     = "NoAmmo";
   stateTransitionOnAmmo[4]         = "Reload";
   stateSequence[4]                 = "NoAmmo";
};

