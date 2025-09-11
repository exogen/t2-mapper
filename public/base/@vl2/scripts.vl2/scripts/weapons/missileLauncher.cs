//--------------------------------------
// Missile launcher
//--------------------------------------

//--------------------------------------------------------------------------
// Force-Feedback Effects
//--------------------------------------
datablock EffectProfile(MissileSwitchEffect)
{
   effectname = "weapons/missile_launcher_activate";
   minDistance = 2.5;
   maxDistance = 2.5;
};

datablock EffectProfile(MissileFireEffect)
{
   effectname = "weapons/missile_fire";
   minDistance = 2.5;
   maxDistance = 5.0;
};

datablock EffectProfile(MissileDryFireEffect)
{
   effectname = "weapons/missile_launcher_dryfire";
   minDistance = 2.5;
   maxDistance = 2.5;
};

datablock EffectProfile(MissileExplosionEffect)
{
   effectname = "explosions/explosion.xpl23";
   minDistance = 10;
   maxDistance = 30;
};

//--------------------------------------------------------------------------
// Sounds
//--------------------------------------
datablock AudioProfile(MissileSwitchSound)
{
   filename    = "fx/weapons/missile_launcher_activate.wav";
   description = AudioClosest3d;
   preload = true;
   effect = MissileSwitchEffect;
};

datablock AudioProfile(MissileFireSound)
{
   filename    = "fx/weapons/missile_fire.WAV";
   description = AudioDefault3d;
   preload = true;
   effect = MissileFireEffect;
};

datablock AudioProfile(MissileProjectileSound)
{
   filename    = "fx/weapons/missile_projectile.wav";
   description = ProjectileLooping3d;
   preload = true;
};

datablock AudioProfile(MissileReloadSound)
{
   filename    = "fx/weapons/weapon.missilereload.wav";
   description = AudioClosest3d;
   preload = true;
};

datablock AudioProfile(MissileLockSound)
{
   filename    = "fx/weapons/missile_launcher_searching.WAV";
   description = AudioClosest3d;
   preload = true;
};

datablock AudioProfile(MissileExplosionSound)
{
   filename    = "fx/explosions/explosion.xpl23.wav";
   description = AudioBIGExplosion3d;
   preload = true;
   effect = MissileExplosionEffect;
};

datablock AudioProfile(MissileDryFireSound)
{
   filename    = "fx/weapons/missile_launcher_dryfire.wav";
   description = AudioClose3d;
   preload = true;
   effect = MissileDryFireEffect;
};


//----------------------------------------------------------------------------
// Splash Debris
//----------------------------------------------------------------------------
datablock ParticleData( MDebrisSmokeParticle )
{
   dragCoeffiecient     = 1.0;
   gravityCoefficient   = 0.10;
   inheritedVelFactor   = 0.1;

   lifetimeMS           = 1000;  
   lifetimeVarianceMS   = 100;

   textureName          = "particleTest";

//   useInvAlpha =     true;

   spinRandomMin = -60.0;
   spinRandomMax = 60.0;

   colors[0]     = "0.7 0.8 1.0 1.0";
   colors[1]     = "0.7 0.8 1.0 0.5";
   colors[2]     = "0.7 0.8 1.0 0.0";
   sizes[0]      = 0.0;
   sizes[1]      = 0.8;
   sizes[2]      = 0.8;
   times[0]      = 0.0;
   times[1]      = 0.5;
   times[2]      = 1.0;
};

datablock ParticleEmitterData( MDebrisSmokeEmitter )
{
   ejectionPeriodMS = 10;
   periodVarianceMS = 1;

   ejectionVelocity = 1.0;  // A little oomph at the back end
   velocityVariance = 0.2;

   thetaMin         = 0.0;
   thetaMax         = 40.0;

   particles = "MDebrisSmokeParticle";
};


datablock DebrisData( MissileSplashDebris )
{
   emitters[0] = MDebrisSmokeEmitter;

   explodeOnMaxBounce = true;

   elasticity = 0.4;
   friction = 0.2;

   lifetime = 0.3;
   lifetimeVariance = 0.1;

   numBounces = 1;
};             


//----------------------------------------------------------------------------
// Missile smoke spike (for debris)
//----------------------------------------------------------------------------
datablock ParticleData( MissileSmokeSpike )
{
   dragCoeffiecient     = 1.0;
   gravityCoefficient   = 0.0;
   inheritedVelFactor   = 0.2;

   lifetimeMS           = 1000;  
   lifetimeVarianceMS   = 100;

   textureName          = "particleTest";

   useInvAlpha =     true;

   spinRandomMin = -60.0;
   spinRandomMax = 60.0;

   colors[0]     = "0.6 0.6 0.6 1.0";
   colors[1]     = "0.4 0.4 0.4 0.5";
   colors[2]     = "0.4 0.4 0.4 0.0";
   sizes[0]      = 0.0;
   sizes[1]      = 1.0;
   sizes[2]      = 0.5;
   times[0]      = 0.0;
   times[1]      = 0.5;
   times[2]      = 1.0;
};

datablock ParticleEmitterData( MissileSmokeSpikeEmitter )
{
   ejectionPeriodMS = 7;
   periodVarianceMS = 1;

   ejectionVelocity = 1.0;  // A little oomph at the back end
   velocityVariance = 0.2;

   thetaMin         = 0.0;
   thetaMax         = 40.0;

   particles = "MissileSmokeSpike";
};


//----------------------------------------------------------------------------
// Explosion smoke particles
//----------------------------------------------------------------------------

datablock ParticleData(MissileExplosionSmoke)
{
   dragCoeffiecient     = 0.3;
   gravityCoefficient   = -0.2;
   inheritedVelFactor   = 0.025;

   lifetimeMS           = 1250;
   lifetimeVarianceMS   = 0;

   textureName          = "particleTest";

   useInvAlpha =  true;
   spinRandomMin = -100.0;
   spinRandomMax =  100.0;

   textureName = "special/Smoke/bigSmoke";

   colors[0]     = "1.0 0.7 0.0 1.0";
   colors[1]     = "0.4 0.4 0.4 0.5";
   colors[2]     = "0.4 0.4 0.4 0.0";
   sizes[0]      = 1.0;
   sizes[1]      = 3.0;
   sizes[2]      = 1.0;
   times[0]      = 0.0;
   times[1]      = 0.5;
   times[2]      = 1.0;

};

datablock ParticleEmitterData(MissileExplosionSmokeEMitter)
{
   ejectionOffset = 0.0;
   ejectionPeriodMS = 5;
   periodVarianceMS = 0;

   ejectionVelocity = 3.25;
   velocityVariance = 0.25;

   thetaMin         = 0.0;
   thetaMax         = 180.0;

   lifetimeMS       = 250;

   particles = "MissileExplosionSmoke";
};



datablock DebrisData( MissileSpikeDebris )
{
   emitters[0] = MissileSmokeSpikeEmitter;
   explodeOnMaxBounce = true;
   elasticity = 0.4;
   friction = 0.2;
   lifetime = 0.3;
   lifetimeVariance = 0.02;
};             


//---------------------------------------------------------------------------
// Explosions
//---------------------------------------------------------------------------
datablock ExplosionData(MissileExplosion)
{
   explosionShape = "effect_plasma_explosion.dts";
   playSpeed = 1.5;
   soundProfile   = MissileExplosionSound;
   faceViewer = true;

   sizes[0] = "0.5 0.5 0.5";
   sizes[1] = "0.5 0.5 0.5";
   sizes[2] = "0.5 0.5 0.5";

   emitter[0] = MissileExplosionSmokeEmitter;

   debris = MissileSpikeDebris;
   debrisThetaMin = 10;
   debrisThetaMax = 170;
   debrisNum = 8;
   debrisNumVariance = 6;
   debrisVelocity = 15.0;
   debrisVelocityVariance = 2.0;

   shakeCamera = true;
   camShakeFreq = "6.0 7.0 7.0";
   camShakeAmp = "70.0 70.0 70.0";
   camShakeDuration = 1.0;
   camShakeRadius = 7.0;
};



datablock ExplosionData(MissileSplashExplosion)
{
   explosionShape = "disc_explosion.dts";

   faceViewer           = true;
   explosionScale = "1.0 1.0 1.0";

   debris = MissileSplashDebris;
   debrisThetaMin = 10;
   debrisThetaMax = 80;
   debrisNum = 10;
   debrisVelocity = 10.0;
   debrisVelocityVariance = 4.0;

   sizes[0] = "0.35 0.35 0.35";
   sizes[1] = "0.15 0.15 0.15";
   sizes[2] = "0.15 0.15 0.15";
   sizes[3] = "0.15 0.15 0.15";

   times[0] = 0.0;
   times[1] = 0.333;
   times[2] = 0.666;
   times[3] = 1.0;

};


//--------------------------------------------------------------------------
// Splash
//--------------------------------------------------------------------------
datablock ParticleData(MissileMist)
{
   dragCoefficient      = 2.0;
   gravityCoefficient   = -0.05;
   inheritedVelFactor   = 0.0;
   constantAcceleration = 0.0;
   lifetimeMS           = 400;
   lifetimeVarianceMS   = 100;
   useInvAlpha          = false;
   spinRandomMin        = -90.0;
   spinRandomMax        = 500.0;
   textureName          = "particleTest";
   colors[0]     = "0.7 0.8 1.0 1.0";
   colors[1]     = "0.7 0.8 1.0 0.5";
   colors[2]     = "0.7 0.8 1.0 0.0";
   sizes[0]      = 0.5;
   sizes[1]      = 0.5;
   sizes[2]      = 0.8;
   times[0]      = 0.0;
   times[1]      = 0.5;
   times[2]      = 1.0;
};

datablock ParticleEmitterData(MissileMistEmitter)
{
   ejectionPeriodMS = 5;
   periodVarianceMS = 0;
   ejectionVelocity = 6.0;
   velocityVariance = 4.0;
   ejectionOffset   = 0.0;
   thetaMin         = 85;
   thetaMax         = 85;
   phiReferenceVel  = 0;
   phiVariance      = 360;
   overrideAdvances = false;
   lifetimeMS       = 250;
   particles = "MissileMist";
};



datablock ParticleData( MissileSplashParticle )
{
   dragCoefficient      = 1;
   gravityCoefficient   = 0.2;
   inheritedVelFactor   = 0.2;
   constantAcceleration = -0.0;
   lifetimeMS           = 600;
   lifetimeVarianceMS   = 0;
   textureName          = "special/droplet";
   colors[0]     = "0.7 0.8 1.0 1.0";
   colors[1]     = "0.7 0.8 1.0 0.5";
   colors[2]     = "0.7 0.8 1.0 0.0";
   sizes[0]      = 0.5;
   sizes[1]      = 0.5;
   sizes[2]      = 0.5;
   times[0]      = 0.0;
   times[1]      = 0.5;
   times[2]      = 1.0;
};

datablock ParticleEmitterData( MissileSplashEmitter )
{
   ejectionPeriodMS = 1;
   periodVarianceMS = 0;
   ejectionVelocity = 6;
   velocityVariance = 3.0;
   ejectionOffset   = 0.0;
   thetaMin         = 60;
   thetaMax         = 80;
   phiReferenceVel  = 0;
   phiVariance      = 360;
   overrideAdvances = false;
   orientParticles  = true;
   lifetimeMS       = 100;
   particles = "MissileSplashParticle";
};


datablock SplashData(MissileSplash)
{
   numSegments = 15;
   ejectionFreq = 0.0001;
   ejectionAngle = 45;
   ringLifetime = 0.5;
   lifetimeMS = 400;
   velocity = 5.0;
   startRadius = 0.0;
   acceleration = -3.0;
   texWrap = 5.0;

   explosion = MissileSplashExplosion;

   texture = "special/water2";

   emitter[0] = MissileSplashEmitter;
   emitter[1] = MissileMistEmitter;

   colors[0] = "0.7 0.8 1.0 0.0";
   colors[1] = "0.7 0.8 1.0 1.0";
   colors[2] = "0.7 0.8 1.0 0.0";
   colors[3] = "0.7 0.8 1.0 0.0";
   times[0] = 0.0;
   times[1] = 0.4;
   times[2] = 0.8;
   times[3] = 1.0;
};

//--------------------------------------------------------------------------
// Particle effects
//--------------------------------------
datablock ParticleData(MissileSmokeParticle)
{
   dragCoeffiecient     = 0.0;
   gravityCoefficient   = -0.02;
   inheritedVelFactor   = 0.1;

   lifetimeMS           = 1200;
   lifetimeVarianceMS   = 100;

   textureName          = "particleTest";

   useInvAlpha = true;
   spinRandomMin = -90.0;
   spinRandomMax = 90.0;

   colors[0]     = "1.0 0.75 0.0 0.0";
   colors[1]     = "0.5 0.5 0.5 1.0";
   colors[2]     = "0.3 0.3 0.3 0.0";
   sizes[0]      = 1;
   sizes[1]      = 2;
   sizes[2]      = 3;
   times[0]      = 0.0;
   times[1]      = 0.1;
   times[2]      = 1.0;

};

datablock ParticleEmitterData(MissileSmokeEmitter)
{
   ejectionPeriodMS = 10;
   periodVarianceMS = 0;

   ejectionVelocity = 1.5;
   velocityVariance = 0.3;

   thetaMin         = 0.0;
   thetaMax         = 50.0;  

   particles = "MissileSmokeParticle";
};


datablock ParticleData(MissileFireParticle)
{
   dragCoeffiecient     = 0.0;
   gravityCoefficient   = 0.0;
   inheritedVelFactor   = 1.0;

   lifetimeMS           = 300;
   lifetimeVarianceMS   = 000;

   textureName          = "particleTest";

   spinRandomMin = -135;
   spinRandomMax =  135;

   colors[0]     = "1.0 0.75 0.2 1.0";
   colors[1]     = "1.0 0.5 0.0 1.0";
   colors[2]     = "1.0 0.40 0.0 0.0";
   sizes[0]      = 0;
   sizes[1]      = 1;
   sizes[2]      = 1.5;
   times[0]      = 0.0;
   times[1]      = 0.3;
   times[2]      = 1.0;
};

datablock ParticleEmitterData(MissileFireEmitter)
{
   ejectionPeriodMS = 15;
   periodVarianceMS = 0;

   ejectionVelocity = 15.0;
   velocityVariance = 0.0;

   thetaMin         = 0.0;
   thetaMax         = 0.0;  

   particles = "MissileFireParticle";
};



datablock ParticleData(MissilePuffParticle)
{
   dragCoeffiecient     = 0.0;
   gravityCoefficient   = 0.0;
   inheritedVelFactor   = 0.0;

   lifetimeMS           = 500;
   lifetimeVarianceMS   = 300;

   textureName          = "particleTest";

   spinRandomMin = -135;
   spinRandomMax =  135;

   colors[0]     = "1.0 1.0 1.0 0.5";
   colors[1]     = "0.7 0.7 0.7 0.0";
   sizes[0]      = 0.25;
   sizes[1]      = 1.0;
   times[0]      = 0.0;
   times[1]      = 1.0;
};

datablock ParticleEmitterData(MissilePuffEmitter)
{
   ejectionPeriodMS = 50;
   periodVarianceMS = 3;

   ejectionVelocity = 0.5;
   velocityVariance = 0.0;

   thetaMin         = 0.0;
   thetaMax         = 90.0;

   particles = "MissilePuffParticle";
};


datablock ParticleData(MissileLauncherExhaustParticle)
{
   dragCoeffiecient     = 0.0;
   gravityCoefficient   = 0.01;
   inheritedVelFactor   = 1.0;

   lifetimeMS           = 500;
   lifetimeVarianceMS   = 300;

   textureName          = "particleTest";

   useInvAlpha = true;
   spinRandomMin = -135;
   spinRandomMax =  135;

   colors[0]     = "1.0 1.0 1.0 0.5";
   colors[1]     = "0.7 0.7 0.7 0.0";
   sizes[0]      = 0.25;
   sizes[1]      = 1.0;
   times[0]      = 0.0;
   times[1]      = 1.0;
};

datablock ParticleEmitterData(MissileLauncherExhaustEmitter)
{
   ejectionPeriodMS = 15;
   periodVarianceMS = 0;

   ejectionVelocity = 3.0;
   velocityVariance = 0.0;

   thetaMin         = 0.0;
   thetaMax         = 20.0;

   particles = "MissileLauncherExhaustParticle";
};

//--------------------------------------------------------------------------
// Debris
//--------------------------------------
datablock DebrisData( FlechetteDebris )
{
   shapeName = "weapon_missile_fleschette.dts";

   lifetime = 5.0;

   minSpinSpeed = -320.0;
   maxSpinSpeed = 320.0;

   elasticity = 0.2;
   friction = 0.3;

   numBounces = 3;

   gravModifier = 0.40;

   staticOnMaxBounce = true;
};             

//--------------------------------------------------------------------------
// Projectile
//--------------------------------------
datablock SeekerProjectileData(ShoulderMissile)
{
   casingShapeName     = "weapon_missile_casement.dts";
   projectileShapeName = "weapon_missile_projectile.dts";
   hasDamageRadius     = true;
   indirectDamage      = 0.8;
   damageRadius        = 8.0;
   radiusDamageType    = $DamageType::Missile;
   kickBackStrength    = 2000;

   explosion           = "MissileExplosion";
   splash              = MissileSplash;
   velInheritFactor    = 1.0;    // to compensate for slow starting velocity, this value
                                 // is cranked up to full so the missile doesn't start
                                 // out behind the player when the player is moving
                                 // very quickly - bramage

   baseEmitter         = MissileSmokeEmitter;
   delayEmitter        = MissileFireEmitter;
   puffEmitter         = MissilePuffEmitter;
   bubbleEmitter       = GrenadeBubbleEmitter;
   bubbleEmitTime      = 1.0;

   exhaustEmitter      = MissileLauncherExhaustEmitter;
   exhaustTimeMs       = 300;
   exhaustNodeName     = "muzzlePoint1";

   lifetimeMS          = 6000;
   muzzleVelocity      = 10.0;
   maxVelocity         = 80.0;
   turningSpeed        = 110.0;
   acceleration        = 200.0;

   proximityRadius     = 3;

   terrainAvoidanceSpeed         = 180;
   terrainScanAhead              = 25;
   terrainHeightFail             = 12;
   terrainAvoidanceRadius        = 100;  
   
   flareDistance = 200;
   flareAngle    = 30;

   sound = MissileProjectileSound;

   hasLight    = true;
   lightRadius = 5.0;
   lightColor  = "0.2 0.05 0";

   useFlechette = true;
   flechetteDelayMs = 550;
   casingDeb = FlechetteDebris;

   explodeOnWaterImpact = false;
};



//--------------------------------------------------------------------------
// Ammo
//--------------------------------------

datablock ItemData(MissileLauncherAmmo)
{
   className = Ammo;
   catagory = "Ammo";
   shapeFile = "ammo_missile.dts";
   mass = 1;
   elasticity = 0.2;
   friction = 0.6;
   pickupRadius = 2;
	pickUpName = "some missiles";

   computeCRC = true;

};

//--------------------------------------------------------------------------
// Weapon
//--------------------------------------
datablock ItemData(MissileLauncher)
{
   className = Weapon;
   catagory = "Spawn Items";
   shapeFile = "weapon_missile.dts";
   image = MissileLauncherImage;
   mass = 1;
   elasticity = 0.2;
   friction = 0.6;
   pickupRadius = 2;
	pickUpName = "a missile launcher";

   computeCRC = true;
   emap = true;
};

datablock ShapeBaseImageData(MissileLauncherImage)
{
   className = WeaponImage;
   shapeFile = "weapon_missile.dts";
   item = MissileLauncher;
   ammo = MissileLauncherAmmo;
   offset = "0 0 0";
   armThread = lookms;
   emap = true;

   projectile = ShoulderMissile;
   projectileType = SeekerProjectile;

   isSeeker     = true;
   seekRadius   = 400;
   maxSeekAngle = 8;
   seekTime     = 0.5;
   minSeekHeat  = 0.7;  // the heat that must be present on a target to lock it.

   // only target objects outside this range
   minTargetingDistance             = 40;
   
   stateName[0]                     = "Activate";
   stateTransitionOnTimeout[0]      = "ActivateReady";
   stateTimeoutValue[0]             = 0.5;
   stateSequence[0]                 = "Activate";
   stateSound[0]                    = MissileSwitchSound;

   stateName[1]                     = "ActivateReady";
   stateTransitionOnLoaded[1]       = "Ready";
   stateTransitionOnNoAmmo[1]       = "NoAmmo";

   stateName[2]                     = "Ready";
   stateTransitionOnNoAmmo[2]       = "NoAmmo";
   stateTransitionOnTriggerDown[2]  = "CheckWet";

   stateName[3]                     = "Fire";
   stateTransitionOnTimeout[3]      = "Reload";
   stateTimeoutValue[3]             = 0.4;
   stateFire[3]                     = true;
   stateRecoil[3]                   = LightRecoil;
   stateAllowImageChange[3]         = false;
   stateSequence[3]                 = "Fire";
   stateScript[3]                   = "onFire";
   stateSound[3]                    = MissileFireSound;

   stateName[4]                     = "Reload";
   stateTransitionOnNoAmmo[4]       = "NoAmmo";
   stateTransitionOnTimeout[4]      = "Ready";
   stateTimeoutValue[4]             = 2.5;
   stateAllowImageChange[4]         = false;
   stateSequence[4]                 = "Reload";
   stateSound[4]                    = MissileReloadSound;

   stateName[5]                     = "NoAmmo";
   stateTransitionOnAmmo[5]         = "Reload";
   stateSequence[5]                 = "NoAmmo";
   stateTransitionOnTriggerDown[5]  = "DryFire";

   stateName[6]                     = "DryFire";
   stateSound[6]                    = MissileDryFireSound;
   stateTimeoutValue[6]             = 1.0;
   stateTransitionOnTimeout[6]      = "ActivateReady";
   
   stateName[7]                     = "CheckTarget";
   stateTransitionOnNoTarget[7]     = "DryFire";
   stateTransitionOnTarget[7]       = "Fire";
   
   stateName[8]                     = "CheckWet";
   stateTransitionOnWet[8]          = "WetFire";
   stateTransitionOnNotWet[8]       = "CheckTarget";
   
   stateName[9]                     = "WetFire";
   stateTransitionOnNoAmmo[9]       = "NoAmmo";
   stateTransitionOnTimeout[9]      = "Reload";
   stateSound[9]                    = MissileFireSound;
   stateRecoil[3]                   = LightRecoil;
   stateTimeoutValue[9]             = 0.4;
   stateSequence[3]                 = "Fire";
   stateScript[9]                   = "onWetFire";
   stateAllowImageChange[9]         = false;
};
