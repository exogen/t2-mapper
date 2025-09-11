//--------------------------------------
// TR2Grenade launcher
//--------------------------------------

//--------------------------------------------------------------------------
// Force-Feedback Effects
//--------------------------------------
datablock EffectProfile(TR2GrenadeSwitchEffect)
{
   effectname = "weapons/generic_switch";
   minDistance = 2.5;
   maxDistance = 2.5;
};

datablock EffectProfile(TR2GrenadeFireEffect)
{
   effectname = "weapons/grenadelauncher_fire";
   minDistance = 2.5;
   maxDistance = 2.5;
};

datablock EffectProfile(TR2GrenadeDryFireEffect)
{
   effectname = "weapons/grenadelauncher_dryfire";
   minDistance = 2.5;
   maxDistance = 2.5;
};

datablock EffectProfile(TR2GrenadeReloadEffect)
{
   effectname = "weapons/generic_switch";
   minDistance = 2.5;
   maxDistance = 2.5;
};

datablock EffectProfile(TR2GrenadeExplosionEffect)
{
   effectname = "explosions/grenade_explode";
   minDistance = 10;
   maxDistance = 35;
};

//--------------------------------------------------------------------------
// Sounds
//--------------------------------------
datablock AudioProfile(TR2GrenadeSwitchSound)
{
   filename    = "fx/weapons/generic_switch.wav";
   description = AudioClosest3d;
   preload = true;
   effect = TR2GrenadeSwitchEffect;
};

datablock AudioProfile(TR2GrenadeFireSound)
{
   filename    = "fx/weapons/grenadelauncher_fire.wav";
   description = AudioDefault3d;
   preload = true;
   effect = TR2GrenadeFireEffect;
};

datablock AudioProfile(TR2GrenadeProjectileSound)
{
   filename    = "fx/weapons/grenadelauncher_projectile.wav";
   description = ProjectileLooping3d;
   preload = true;
};

datablock AudioProfile(TR2GrenadeReloadSound)
{
   filename    = "fx/weapons/generic_switch.wav";
   description = AudioClosest3d;
   preload = true;
   effect = TR2GrenadeReloadEffect;
};

datablock AudioProfile(TR2GrenadeExplosionSound)
{
   filename    = "fx/weapons/grenade_explode.wav";
   description = AudioExplosion3d;
   preload = true;
   effect = TR2GrenadeExplosionEffect;
};

datablock AudioProfile(UnderwaterTR2GrenadeExplosionSound)
{
   filename    = "fx/weapons/grenade_explode_UW.wav";
   description = AudioExplosion3d;
   preload = true;
   effect = TR2GrenadeExplosionEffect;
};

datablock AudioProfile(TR2GrenadeDryFireSound)
{
   filename    = "fx/weapons/grenadelauncher_dryfire.wav";
   description = AudioClose3d;
   preload = true;
   effect = TR2GrenadeDryFireEffect;
};

//----------------------------------------------------------------------------
// Underwater fx
//----------------------------------------------------------------------------
datablock ParticleData(TR2GrenadeExplosionBubbleParticle)
{
   dragCoefficient      = 0.0;
   gravityCoefficient   = -0.25;
   inheritedVelFactor   = 0.0;
   constantAcceleration = 0.0;
   lifetimeMS           = 1500;
   lifetimeVarianceMS   = 600;
   useInvAlpha          = false;
   textureName          = "special/bubbles";

   spinRandomMin        = -100.0;
   spinRandomMax        =  100.0;

   colors[0]     = "0.7 0.8 1.0 0.0";
   colors[1]     = "0.7 0.8 1.0 0.4";
   colors[2]     = "0.7 0.8 1.0 0.0";
   sizes[0]      = 1.0;
   sizes[1]      = 1.0;
   sizes[2]      = 1.0;
   times[0]      = 0.0;
   times[1]      = 0.5;
   times[2]      = 1.0;
};
datablock ParticleEmitterData(TR2GrenadeExplosionBubbleEmitter)
{
   ejectionPeriodMS = 5;
   periodVarianceMS = 0;
   ejectionVelocity = 1.0;
   ejectionOffset   = 3.0;
   velocityVariance = 0.5;
   thetaMin         = 0;
   thetaMax         = 80;
   phiReferenceVel  = 0;
   phiVariance      = 360;
   overrideAdvances = false;
   particles = "TR2GrenadeExplosionBubbleParticle";
};

datablock ParticleData(UnderwaterTR2GrenadeDust)
{
   dragCoefficient      = 1.0;
   gravityCoefficient   = -0.01;
   inheritedVelFactor   = 0.0;
   constantAcceleration = -1.1;
   lifetimeMS           = 1000;
   lifetimeVarianceMS   = 100;
   useInvAlpha          = false;
   spinRandomMin        = -90.0;
   spinRandomMax        = 500.0;
   textureName          = "particleTest";
   colors[0]     = "0.6 0.6 1.0 0.5";
   colors[1]     = "0.6 0.6 1.0 0.5";
   colors[2]     = "0.6 0.6 1.0 0.0";
   sizes[0]      = 3.0;
   sizes[1]      = 3.0;
   sizes[2]      = 3.0;
   times[0]      = 0.0;
   times[1]      = 0.7;
   times[2]      = 1.0;
};

datablock ParticleEmitterData(UnderwaterTR2GrenadeDustEmitter)
{
   ejectionPeriodMS = 15;
   periodVarianceMS = 0;
   ejectionVelocity = 15.0;
   velocityVariance = 0.0;
   ejectionOffset   = 0.0;
   thetaMin         = 70;
   thetaMax         = 70;
   phiReferenceVel  = 0;
   phiVariance      = 360;
   overrideAdvances = false;
   lifetimeMS       = 250;
   particles = "UnderwaterTR2GrenadeDust";
};


datablock ParticleData(UnderwaterTR2GrenadeExplosionSmoke)
{
   dragCoeffiecient     = 0.4;
   gravityCoefficient   = -0.25;   // rises slowly
   inheritedVelFactor   = 0.025;
   constantAcceleration = -1.1;

   lifetimeMS           = 1250;
   lifetimeVarianceMS   = 0;

   textureName          = "particleTest";

   useInvAlpha =  false;
   spinRandomMin = -200.0;
   spinRandomMax =  200.0;

   textureName = "special/Smoke/smoke_001";

   colors[0]     = "0.1 0.1 1.0 1.0";
   colors[1]     = "0.4 0.4 1.0 1.0";
   colors[2]     = "0.4 0.4 1.0 0.0";
   sizes[0]      = 2.0;
   sizes[1]      = 6.0;
   sizes[2]      = 2.0;
   times[0]      = 0.0;
   times[1]      = 0.5;
   times[2]      = 1.0;

};

datablock ParticleEmitterData(UnderwaterTR2GExplosionSmokeEmitter)
{
   ejectionPeriodMS = 15;
   periodVarianceMS = 0;

   ejectionVelocity = 6.25;
   velocityVariance = 0.25;

   thetaMin         = 0.0;
   thetaMax         = 90.0;

   lifetimeMS       = 250;

   particles = "UnderwaterTR2GrenadeExplosionSmoke";
};



datablock ParticleData(UnderwaterTR2GrenadeSparks)
{
   dragCoefficient      = 1;
   gravityCoefficient   = 0.0;
   inheritedVelFactor   = 0.2;
   constantAcceleration = 0.0;
   lifetimeMS           = 500;
   lifetimeVarianceMS   = 350;
   textureName          = "special/underwaterSpark";
   colors[0]     = "0.6 0.6 1.0 1.0";
   colors[1]     = "0.6 0.6 1.0 1.0";
   colors[2]     = "0.6 0.6 1.0 0.0";
   sizes[0]      = 0.5;
   sizes[1]      = 0.5;
   sizes[2]      = 0.75;
   times[0]      = 0.0;
   times[1]      = 0.5;
   times[2]      = 1.0;

};

datablock ParticleEmitterData(UnderwaterTR2GrenadeSparksEmitter)
{
   ejectionPeriodMS = 2;
   periodVarianceMS = 0;
   ejectionVelocity = 12;
   velocityVariance = 6.75;
   ejectionOffset   = 0.0;
   thetaMin         = 0;
   thetaMax         = 60;
   phiReferenceVel  = 0;
   phiVariance      = 360;
   overrideAdvances = false;
   orientParticles  = true;
   lifetimeMS       = 100;
   particles = "UnderwaterTR2GrenadeSparks";
};

datablock ExplosionData(UnderwaterTR2GrenadeExplosion)
{
   soundProfile   = UnderwaterTR2GrenadeExplosionSound;

   faceViewer           = true;
   explosionScale = "0.8 0.8 0.8";

   emitter[0] = UnderwaterTR2GrenadeDustEmitter;
   emitter[1] = UnderwaterTR2GExplosionSmokeEmitter;
   emitter[2] = UnderwaterTR2GrenadeSparksEmitter;
   emitter[3] = TR2GrenadeExplosionBubbleEmitter;
   
   shakeCamera = true;
   camShakeFreq = "10.0 6.0 9.0";
   camShakeAmp = "20.0 20.0 20.0";
   camShakeDuration = 0.5;
   camShakeRadius = 20.0;
};


//----------------------------------------------------------------------------
// Bubbles
//----------------------------------------------------------------------------
datablock ParticleData(TR2GrenadeBubbleParticle)
{
   dragCoefficient      = 0.0;
   gravityCoefficient   = -0.25;
   inheritedVelFactor   = 0.0;
   constantAcceleration = 0.0;
   lifetimeMS           = 1500;
   lifetimeVarianceMS   = 600;
   useInvAlpha          = false;
   textureName          = "special/bubbles";

   spinRandomMin        = -100.0;
   spinRandomMax        =  100.0;

   colors[0]     = "0.7 0.8 1.0 0.4";
   colors[1]     = "0.7 0.8 1.0 0.4";
   colors[2]     = "0.7 0.8 1.0 0.0";
   sizes[0]      = 0.5;
   sizes[1]      = 0.5;
   sizes[2]      = 0.5;
   times[0]      = 0.0;
   times[1]      = 0.5;
   times[2]      = 1.0;
};

datablock ParticleEmitterData(TR2GrenadeBubbleEmitter)
{
   ejectionPeriodMS = 5;
   periodVarianceMS = 0;
   ejectionVelocity = 1.0;
   ejectionOffset   = 0.1;
   velocityVariance = 0.5;
   thetaMin         = 0;
   thetaMax         = 80;
   phiReferenceVel  = 0;
   phiVariance      = 360;
   overrideAdvances = false;
   particles = "TR2GrenadeBubbleParticle";
};

//----------------------------------------------------------------------------
// Debris
//----------------------------------------------------------------------------

datablock ParticleData( TR2GDebrisSmokeParticle )
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

   colors[0]     = "0.4 0.4 0.4 1.0";
   colors[1]     = "0.3 0.3 0.3 0.5";
   colors[2]     = "0.0 0.0 0.0 0.0";
   sizes[0]      = 0.0;
   sizes[1]      = 1.0;
   sizes[2]      = 1.0;
   times[0]      = 0.0;
   times[1]      = 0.5;
   times[2]      = 1.0;
};

datablock ParticleEmitterData( TR2GDebrisSmokeEmitter )
{
   ejectionPeriodMS = 7;
   periodVarianceMS = 1;

   ejectionVelocity = 1.0;  // A little oomph at the back end
   velocityVariance = 0.2;

   thetaMin         = 0.0;
   thetaMax         = 40.0;

   particles = "TR2GDebrisSmokeParticle";
};


datablock DebrisData( TR2GrenadeDebris )
{
   emitters[0] = TR2GDebrisSmokeEmitter;

   explodeOnMaxBounce = true;

   elasticity = 0.4;
   friction = 0.2;

   lifetime = 0.3;
   lifetimeVariance = 0.02;

   numBounces = 1;
};             

//--------------------------------------------------------------------------
// Splash
//--------------------------------------------------------------------------

datablock ParticleData( TR2GrenadeSplashParticle )
{
   dragCoefficient      = 1;
   gravityCoefficient   = 0.0;
   inheritedVelFactor   = 0.2;
   constantAcceleration = -1.4;
   lifetimeMS           = 300;
   lifetimeVarianceMS   = 0;
   textureName          = "special/droplet";
   colors[0]     = "0.7 0.8 1.0 1.0";
   colors[1]     = "0.7 0.8 1.0 0.5";
   colors[2]     = "0.7 0.8 1.0 0.0";
   sizes[0]      = 0.05;
   sizes[1]      = 0.2;
   sizes[2]      = 0.2;
   times[0]      = 0.0;
   times[1]      = 0.5;
   times[2]      = 1.0;
};

datablock ParticleEmitterData( TR2GrenadeSplashEmitter )
{
   ejectionPeriodMS = 4;
   periodVarianceMS = 0;
   ejectionVelocity = 4;
   velocityVariance = 1.0;
   ejectionOffset   = 0.0;
   thetaMin         = 0;
   thetaMax         = 50;
   phiReferenceVel  = 0;
   phiVariance      = 360;
   overrideAdvances = false;
   orientParticles  = true;
   lifetimeMS       = 100;
   particles = "BlasterSplashParticle";
};


datablock SplashData(TR2GrenadeSplash)
{
   numSegments = 15;
   ejectionFreq = 15;
   ejectionAngle = 40;
   ringLifetime = 0.35;
   lifetimeMS = 300;
   velocity = 3.0;
   startRadius = 0.0;
   acceleration = -3.0;
   texWrap = 5.0;

   texture = "special/water2";

   emitter[0] = BlasterSplashEmitter;

   colors[0] = "0.7 0.8 1.0 1.0";
   colors[1] = "0.7 0.8 1.0 1.0";
   colors[2] = "0.7 0.8 1.0 1.0";
   colors[3] = "0.7 0.8 1.0 1.0";
   times[0] = 0.0;
   times[1] = 0.4;
   times[2] = 0.8;
   times[3] = 1.0;
};

//--------------------------------------------------------------------------
// Particle effects
//--------------------------------------
datablock ParticleData(TR2GrenadeSmokeParticle)
{
   dragCoeffiecient     = 0.0;
   gravityCoefficient   = -0.2;   // rises slowly
   inheritedVelFactor   = 0.00;

   lifetimeMS           = 700;  // lasts 2 second
   lifetimeVarianceMS   = 150;   // ...more or less

   textureName          = "particleTest";

   useInvAlpha = true;
   spinRandomMin = -30.0;
   spinRandomMax = 30.0;

   // TR2:  white
   colors[0]     = "1.0 1.0 1.0 1.0";
   colors[1]     = "0.95 0.95 0.95 1.0";
   colors[2]     = "0.9 0.9 0.9 0.0";

   sizes[0]      = 0.7;//0.25;
   sizes[1]      = 2.4;//1.0;
   sizes[2]      = 7.0;//3.0;

   times[0]      = 0.0;
   times[1]      = 0.2;
   times[2]      = 1.0;
};

datablock ParticleEmitterData(TR2GrenadeSmokeEmitter)
{
   ejectionPeriodMS = 15;
   periodVarianceMS = 5;

   ejectionVelocity = 1.25;
   velocityVariance = 0.50;

   thetaMin         = 0.0;
   thetaMax         = 90.0;  

   particles = "TR2GrenadeSmokeParticle";
};


datablock ParticleData(TR2GrenadeDust)
{
   dragCoefficient      = 1.0;
   gravityCoefficient   = -0.01;
   inheritedVelFactor   = 0.0;
   constantAcceleration = 0.0;
   lifetimeMS           = 1000;
   lifetimeVarianceMS   = 100;
   useInvAlpha          = true;
   spinRandomMin        = -90.0;
   spinRandomMax        = 500.0;
   textureName          = "particleTest";
   colors[0]     = "0.3 0.3 0.3 0.5";
   colors[1]     = "0.3 0.3 0.3 0.5";
   colors[2]     = "0.3 0.3 0.3 0.0";
   sizes[0]      = 7.0;//3.2;
   sizes[1]      = 10.0;//4.6;
   sizes[2]      = 11.0;//5.0;
   times[0]      = 0.0;
   times[1]      = 0.7;
   times[2]      = 1.0;
};

datablock ParticleEmitterData(TR2GrenadeDustEmitter)
{
   ejectionPeriodMS = 5;
   periodVarianceMS = 0;
   ejectionVelocity = 15.0;
   velocityVariance = 0.0;
   ejectionOffset   = 0.0;
   thetaMin         = 85;
   thetaMax         = 85;
   phiReferenceVel  = 0;
   phiVariance      = 360;
   overrideAdvances = false;
   lifetimeMS       = 250;
   particles = "TR2GrenadeDust";
};


datablock ParticleData(TR2GrenadeExplosionSmoke)
{
   dragCoeffiecient     = 0.4;
   gravityCoefficient   = -0.5;   // rises slowly
   inheritedVelFactor   = 0.025;

   lifetimeMS           = 1250;
   lifetimeVarianceMS   = 0;

   textureName          = "particleTest";

   useInvAlpha =  true;
   spinRandomMin = -200.0;
   spinRandomMax =  200.0;

   textureName = "special/Smoke/smoke_001";

   // TR2:  Red/orange
   colors[0]     = "0.9 0.7 0.7 1.0";
   colors[1]     = "0.8 0.4 0.2 1.0";
   colors[2]     = "0.6 0.2 0.1 0.0";
   sizes[0]      = 6.0;//2.0;
   sizes[1]      = 18.0;//6.0;
   sizes[2]      = 6.0;//2.0;
   times[0]      = 0.0;
   times[1]      = 0.5;
   times[2]      = 1.0;
};

datablock ParticleEmitterData(TR2GExplosionSmokeEmitter)
{
   ejectionPeriodMS = 5;
   periodVarianceMS = 0;

   ejectionVelocity = 6.25;
   velocityVariance = 0.25;

   thetaMin         = 0.0;
   thetaMax         = 90.0;

   lifetimeMS       = 250;

   particles = "TR2GrenadeExplosionSmoke";
};



datablock ParticleData(TR2GrenadeSparks)
{
   dragCoefficient      = 1;
   gravityCoefficient   = 0.0;
   inheritedVelFactor   = 0.2;
   constantAcceleration = 0.0;
   lifetimeMS           = 500;
   lifetimeVarianceMS   = 350;
   textureName          = "special/bigspark";
   colors[0]     = "0.56 0.36 0.26 1.0";
   colors[1]     = "0.56 0.36 0.26 1.0";
   colors[2]     = "1.0 0.36 0.26 0.0";
   sizes[0]      = 9.0;//0.5;
   sizes[1]      = 9.0;//0.5;
   sizes[2]      = 12.0;//0.75;
   times[0]      = 0.0;
   times[1]      = 0.5;
   times[2]      = 1.0;

};

datablock ParticleEmitterData(TR2GrenadeSparksEmitter)
{
   ejectionPeriodMS = 2;
   periodVarianceMS = 0;
   ejectionVelocity = 12;
   velocityVariance = 6.75;
   ejectionOffset   = 0.0;
   thetaMin         = 0;
   thetaMax         = 60;
   phiReferenceVel  = 0;
   phiVariance      = 360;
   overrideAdvances = false;
   orientParticles  = true;
   lifetimeMS       = 100;
   particles = "TR2GrenadeSparks";
};




//----------------------------------------------------
//  Explosion
//----------------------------------------------------
datablock ExplosionData(TR2GrenadeExplosion)
{
   soundProfile   = TR2GrenadeExplosionSound;

   faceViewer           = true;
   explosionScale = "3.0 3.0 3.0";//"0.8 0.8 0.8";

   debris = TR2GrenadeDebris;
   debrisThetaMin = 10;
   debrisThetaMax = 50;
   debrisNum = 8;
   debrisVelocity = 52.0;//26.0;
   debrisVelocityVariance = 14.0;//7.0;

   emitter[0] = TR2GrenadeDustEmitter;
   emitter[1] = TR2GExplosionSmokeEmitter;
   emitter[2] = TR2GrenadeSparksEmitter;

   shakeCamera = true;
   camShakeFreq = "10.0 6.0 9.0";
   camShakeAmp = "20.0 20.0 20.0";
   camShakeDuration = 0.5;
   camShakeRadius = 20.0;
};

//--------------------------------------------------------------------------
// Projectile
//--------------------------------------
datablock GrenadeProjectileData(BasicTR2Grenade)
{
   projectileShapeName = "grenade_projectile.dts";
   emitterDelay        = -1;
   directDamage        = 0.0;
   hasDamageRadius     = true;
   indirectDamage      = 0.40;
   damageRadius        = 27;//20.0;
   radiusDamageType    = $DamageType::Grenade;
   kickBackStrength    = 7200;//1500;
   bubbleEmitTime      = 1.0;

   sound               = TR2GrenadeProjectileSound;
   explosion           = "TR2GrenadeExplosion";
   underwaterExplosion = "UnderwaterTR2GrenadeExplosion";
   velInheritFactor    = 0.62;//0.7;//0.5;
   splash              = TR2GrenadeSplash;

   baseEmitter         = TR2GrenadeSmokeEmitter;
   bubbleEmitter       = TR2GrenadeBubbleEmitter;

   grenadeElasticity = 0.15;//0.25;//0.35;
   grenadeFriction   = 0.09;//0.2;//0.2;
   armingDelayMS     = 1000;
   muzzleVelocity    = 165;//78;//47.00;
   drag = 0.09;//0.15;//0.1;
   gravityMod = 2.75;
};


//--------------------------------------------------------------------------
// Ammo
//--------------------------------------

datablock ItemData(TR2GrenadeLauncherAmmo)
{
   className = Ammo;
   catagory = "Ammo";
   shapeFile = "ammo_grenade.dts";
   mass = 1;
   elasticity = 0.2;
   friction = 0.6;
   pickupRadius = 2;
	pickUpName = "some grenade launcher ammo";

   computeCRC = false;
   emap = true;
};

//--------------------------------------------------------------------------
// Weapon
//--------------------------------------
datablock ItemData(TR2GrenadeLauncher)
{
   className = Weapon;
   catagory = "Spawn Items";
   shapeFile = "TR2weapon_grenade_launcher.dts";
   image = TR2GrenadeLauncherImage;
   mass = 1;
   elasticity = 0.2;
   friction = 0.6;
   pickupRadius = 2;
	pickUpName = "a grenade launcher";

   computeCRC = true;

};

datablock ShapeBaseImageData(TR2GrenadeLauncherImage)
{
   className = WeaponImage;
   shapeFile = "TR2weapon_grenade_launcher.dts";
   item = TR2GrenadeLauncher;
   ammo = TR2GrenadeLauncherAmmo;
   offset = "0 0 0";
   emap = true;

   projectile = BasicTR2Grenade;
   projectileType = GrenadeProjectile;

   stateName[0] = "Activate";
   stateTransitionOnTimeout[0] = "ActivateReady";
   stateTimeoutValue[0] = 0.5;
   stateSequence[0] = "Activate";
   stateSound[0] = TR2GrenadeSwitchSound;

   stateName[1] = "ActivateReady";
   stateTransitionOnLoaded[1] = "Ready";
   stateTransitionOnNoAmmo[1] = "NoAmmo";

   stateName[2] = "Ready";
   stateTransitionOnNoAmmo[2] = "NoAmmo";
   stateTransitionOnTriggerDown[2] = "Fire";

   stateName[3] = "Fire";
   stateTransitionOnTimeout[3] = "Reload";
   stateTimeoutValue[3] = 0.4;
   stateFire[3] = true;
   stateRecoil[3] = LightRecoil;
   stateAllowImageChange[3] = false;
   stateSequence[3] = "Fire";
   stateScript[3] = "onFire";
   stateSound[3] = TR2GrenadeFireSound;

   stateName[4] = "Reload";
   stateTransitionOnNoAmmo[4] = "NoAmmo";
   stateTransitionOnTimeout[4] = "Ready";
   stateTimeoutValue[4] = 0.5;
   stateAllowImageChange[4] = false;
   stateSequence[4] = "Reload";
   stateSound[4] = TR2GrenadeReloadSound;

   stateName[5] = "NoAmmo";
   stateTransitionOnAmmo[5] = "Reload";
   stateSequence[5] = "NoAmmo";
   stateTransitionOnTriggerDown[5] = "DryFire";

   stateName[6]       = "DryFire";
   stateSound[6]      = TR2GrenadeDryFireSound;
   stateTimeoutValue[6]        = 1.5;
   stateTransitionOnTimeout[6] = "NoAmmo";
};
