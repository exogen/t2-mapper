//Version 1.0

$DamageType::Dark  = 201;
$DamageTypeText[$DamageType::Dark]  = 'Dark';
$Anomaly::darkWeaponBonus = 200;//bonus points too the team that fires the dark weapon 
$Anomaly::dkwUnlockTimeMin = 30;// how long untill the dark weapon is unlocked
$Anomaly::editMode = 0;// stops the main loop form starting to the map can be safely edited

if($Anomaly::editMode){ 
   autoExec("scripts/zAnomalyGame.cs",0,0);
}

$DeathMessageSelfKill[$DamageType::Dark, 0] = '\c0%1 kills %2self with a dark weapon.';
$DeathMessageSelfKill[$DamageType::Dark, 1] = '\c0%1 kills %2self with a dark weapon.';
$DeathMessageSelfKill[$DamageType::Dark, 2] = '\c0%1 kills %2self with a dark weapon.';
$DeathMessageSelfKill[$DamageType::Dark, 3] = '\c0%1 kills %2self with a dark weapon.';
$DeathMessageSelfKill[$DamageType::Dark, 4] = '\c0%1 kills %2self with a dark weapon.';

$DeathMessageTeamKill[$DamageType::Dark, 0] = '\c0%4 kill TEAMMATE %1 with a dark weapon.';

$DeathMessage[$DamageType::Dark, 0] = '\c0%4 kills %1 with dark weapon';
$DeathMessage[$DamageType::Dark, 1] = '\c0%4 kills %1 with dark weapon';
$DeathMessage[$DamageType::Dark, 2] = '\c0%4 kills %1 with dark weapon';
$DeathMessage[$DamageType::Dark, 3] = '\c0%4 kills %1 with dark weapon';
$DeathMessage[$DamageType::Dark, 4] = '\c0%4 kills %1 with dark weapon';

function SimObject::setPosition(%obj, %pos){
     %obj.setTransform(%pos SPC getWords(%obj.getTransform(), 3, 6));
}

function darkWpnDmg(){
   // // note damage scale for armor is handeld in radius Explosion is why its 1
   LightPlayerDamageProfile.damageScale[$DamageType::Dark] = 1;
   MediumPlayerDamageProfile.damageScale[$DamageType::Dark] = 1;
   HeavyPlayerDamageProfile.damageScale[$DamageType::Dark] = 1;
   
   ShrikeDamageProfile.damageScale[$DamageType::Dark] = 1.25;
   ShrikeDamageProfile.shieldDamageScale[$DamageType::Dark] = 1.5;
   BomberDamageProfile.damageScale[$DamageType::Dark] = 1;
   BomberDamageProfile.shieldDamageScale[$DamageType::Dark] = 1;
   HavocDamageProfile.damageScale[$DamageType::Dark] = 1;
   HavocDamageProfile.shieldDamageScale[$DamageType::Dark] = 1;
   WildcatDamageProfile.damageScale[$DamageType::Dark] = 1.25;
   WildcatDamageProfile.shieldDamageScale[$DamageType::Dark] = 2.5;
   TankDamageProfile.damageScale[$DamageType::Dark] = 1;
   TankDamageProfile.shieldDamageScale[$DamageType::Dark] = 0.8;
   MPBDamageProfile.damageScale[$DamageType::Dark] = 1;
   MPBDamageProfile.shieldDamageScale[$DamageType::Dark] = 0.8;
   TurretDamageProfile.damageScale[$DamageType::Dark] = 1.1;
   TurretDamageProfile.shieldDamageScale[$DamageType::Dark] = 1;
   StaticShapeDamageProfile.damageScale[$DamageType::Dark] = 1.15;
   StaticShapeDamageProfile.shieldDamageScale[$DamageType::Dark] = 1;
////////////////////////////////////////////////////////////////////////////////      
}darkWpnDmg();
datablock ParticleData(RedChargedParticle){
   windCoefficient      = 0.0;
   dragCoefficient      = 0.0;
   gravityCoefficient   = 0.0;
   inheritedVelFactor   = 0.0;
   constantAcceleration = 0.0;
   lifetimeMS           = 10000;
   lifetimeVarianceMS   = 000;
   useInvAlpha          = false;
   spinRandomMin        = -90.0;
   spinRandomMax        = 50.0;
   textureName          = "Special/crescent4";
   colors[0]     = "1.0 0.0 0.0 0.0";  // 0 0.3 0.9 1.0
   colors[1]     = "1.0 0.0 0.0 1.0";  // 0.0 0.3 0.9 0.2
   colors[2]     = "0.0 0.0 0.0 0.0";  // 0 0.3 0.9 0.0
   sizes[0]      = 30.0;
   sizes[1]      = 30.0;
   sizes[2]      = 30.0;
   times[0]      = 0.0;
   times[1]      = 0.2;
   times[2]      = 1.0;
};

datablock ParticleEmitterData(RedChargedEmitter){
   ejectionPeriodMS = 15;
   periodVarianceMS = 0;
   ejectionVelocity = 1.01;
   velocityVariance = 0.0;
   ejectionOffset   = 25.0;
   thetaMin         = 0;
   thetaMax         = 180;
   phiReferenceVel  = 0;
   phiVariance      = 360;
   overrideAdvances = false;
   orientParticles  = true;
   lifetimeMS       = 1;
   particles = "RedChargedParticle";
};

datablock ParticleData(BlueChargedParticle){
   windCoefficient      = 0.0;
   dragCoefficient      = 0.0;
   gravityCoefficient   = 0.0;
   inheritedVelFactor   = 0.0;
   constantAcceleration = 0.0;
   lifetimeMS           = 10000;
   lifetimeVarianceMS   = 000;
   useInvAlpha          = false;
   spinRandomMin        = -90.0;
   spinRandomMax        = 50.0;
   textureName          = "Special/crescent4";
   colors[0]     = "0.0 0.0 1.0 0.0";  // 0 0.3 0.9 1.0
   colors[1]     = "0.0 0.0 1.0 1.0";  // 0.0 0.3 0.9 0.2
   colors[2]     = "0.0 0.0 0.0 0.0";  // 0 0.3 0.9 0.0
   sizes[0]      = 30.0;
   sizes[1]      = 30.0;
   sizes[2]      = 30.0;
   times[0]      = 0.0;
   times[1]      = 0.2;
   times[2]      = 1.0;
};

datablock ParticleEmitterData(BlueChargedEmitter){
   ejectionPeriodMS = 15;
   periodVarianceMS = 0;
   ejectionVelocity = 1.01;
   velocityVariance = 0.0;
   ejectionOffset   = 25.0;
   thetaMin         = 0;
   thetaMax         = 180;
   phiReferenceVel  = 0;
   phiVariance      = 360;
   overrideAdvances = false;
   orientParticles  = true;
   lifetimeMS       = 1;
   particles = "BlueChargedParticle";
};

datablock ParticleData(DarkParticle){
   windCoefficient      = 0.0;
   dragCoefficient      = 0.0;
   gravityCoefficient   = 0.0;
   inheritedVelFactor   = 0.0;
   constantAcceleration = -3;
   lifetimeMS           = 5000;
   lifetimeVarianceMS   = 000;
   useInvAlpha          = true;
   spinRandomMin        = -90.0;
   spinRandomMax        = 50.0;
   textureName          = "particleTest";
   colors[0]     = "0.0 0.0 0.0 0.0";  // 0 0.3 0.9 1.0
   colors[1]     = "0.0 0.0 0.0 1.0";  // 0.0 0.3 0.9 0.2
   colors[2]     = "0.0 0.0 0.0 0.0";  // 0 0.3 0.9 0.0
   sizes[0]      = 10.0;
   sizes[1]      = 10.0;
   sizes[2]      = 4.0;
   times[0]      = 0.0;
   times[1]      = 0.2;
   times[2]      = 1.0;
};

datablock ParticleEmitterData(DarkEmitter){
   ejectionPeriodMS = 6;
   periodVarianceMS = 0;
   ejectionVelocity = 1.01;
   velocityVariance = 0.0;
   ejectionOffset   = 25.0;
   thetaMin         = 0;
   thetaMax         = 180;
   phiReferenceVel  = 0;
   phiVariance      = 360;
   overrideAdvances = false;
   orientParticles  = true;
   lifetimeMS       = 1;
   particles = "DarkParticle";
};



datablock AudioProfile(LightningZapSound){
   filename = "fx/misc/lightning_impact.wav";
   description = AudioExplosion3d;
};

datablock LightningData(zapStorm){
   directDamageType = $DamageType::Lightning;
   directDamage = 1;
   
   strikeTextures[0]  = "special/skyLightning";

   strikeSound = LightningZapSound;
};

datablock ParticleData(SphereMistPart){
   textureName = "particleTest";
   dragCoefficient = "2";
   gravityCoefficient = 0.0;
   inheritedVelFactor = "0";
   windCoefficient = "0";
   constantAcceleration = -30;
   lifetimeMS = "2500";
   lifetimeVarianceMS = "0";
   spinRandomMin = "-200";
   spinRandomMax = "200";
   useInvAlpha = "0";
   
   colors[0] = "0.204724 0.204724 0.204724 0.199213";
   colors[1] = "0.291339 0.291339 0.291339 0.199213";
   colors[2] = "0.259843 0.259843 0.259843 0.188976";
   colors[3] = "0.0787402 0.0787402 0.0787402 0.015748";
      
   sizes[0] = "50";
   sizes[1] = "50";
   sizes[2] = "50";
   sizes[3] = "50";
   
   times[0] = "0.1";
   times[1] = "0.8";
   times[2] = "0.9";
   times[3] = "1";
   
   spinSpeed = "1";
};

datablock ParticleEmitterData(SphereMistEmitter){
   ejectionPeriodMS = "5";
   periodVarianceMS = "0";
   ejectionVelocity = "10";
   velocityVariance = "0";
   ejectionOffset = "400";
   thetaMin = "0";
   thetaMax = "180";
   phiReferenceVel = 0;
   phiVariance = 360;
   orientParticles = "0";
   orientOnVelocity = true;
   particles = "SphereMistPart";
   lifetimeMS = "0";
   blendStyle = "NORMAL";
   alignDirection = "0 1 0";
   
};

datablock LinearFlareProjectileData(BlueSpawnProj){
   projectileShapeName = "plasmabolt.dts";
   scale               = "2.3 2.3 2.3";
   faceViewer          = true;
   directDamage        = 0.0;
   hasDamageRadius     = false;
   indirectDamage      = 0;
   damageRadius        = 0;
   kickBackStrength    = 300.0;
   directDamageType    = $DamageType::Explosion;
   radiusDamageType    = $DamageType::Explosion;
   Impulse = true;
   explosion           = "MissileExplosion";
   //splash              = PlasmaSplash;

   dryVelocity       = 0.1;
   wetVelocity       = -1;
   velInheritFactor  = 0.3;
   fizzleTimeMS      = 0;
   lifetimeMS        = 16320;
   explodeOnDeath    = true;
   reflectOnWaterImpactAngle = 0.0;
   explodeOnWaterImpact      = true;
   deflectionOnWaterImpact   = 0.0;
   fizzleUnderwaterMS        = -1;

   //activateDelayMS = 100;
   activateDelayMS = -1;

   size[0]           = 30.2;
   size[1]           = 30.5;
   size[2]           = 50.1;


   numFlares         = 150;
   flareColor        = "0 0.3 1";
   flareModTexture   = "flaremod";
   flareBaseTexture  = "flarebase";

   hasLight    = true;
   lightRadius = 3.0;
   lightColor  = "0 0.3 1";
   ignoreExEffects = 1;
};

datablock LinearFlareProjectileData(RedSpawnProj){
   projectileShapeName = "plasmabolt.dts";
   scale               = "2.3 2.3 2.3";
   faceViewer          = true;
   directDamage        = 0.0;
   hasDamageRadius     = false;
   indirectDamage      = 0;
   damageRadius        = 0;
   kickBackStrength    = 300.0;
   directDamageType    = $DamageType::Explosion;
   radiusDamageType    = $DamageType::Explosion;
   Impulse = true;
   explosion           = "MissileExplosion";
   //splash              = PlasmaSplash;

   dryVelocity       = 0.1;
   wetVelocity       = -1;
   velInheritFactor  = 0.3;
   fizzleTimeMS      = 0;
   lifetimeMS        = 16320;
   explodeOnDeath    = true;
   reflectOnWaterImpactAngle = 0.0;
   explodeOnWaterImpact      = true;
   deflectionOnWaterImpact   = 0.0;
   fizzleUnderwaterMS        = -1;

   //activateDelayMS = 100;
   activateDelayMS = -1;

   size[0]           = 30.2;
   size[1]           = 30.5;
   size[2]           = 50.1;


   numFlares         = 150;
   flareColor        = "1 0.3 0";
   flareModTexture   = "flaremod";
   flareBaseTexture  = "flarebase";

   hasLight    = true;
   lightRadius = 3.0;
   lightColor  = "1 0.3 0";
   ignoreExEffects = 1;
};

datablock StaticShapeData(AGameStart){
   catagory = "misc";
   shapeFile = "flag.dts";
};
function AGameStart::onAdd(%this, %obj){  
   Parent::onAdd(%this, %obj);
   if(!isObject(StartScriptObj)){
      %obj.setName("StartScriptObj");
   }
   if(!Game.aStart && !$Anomaly::editMode){
       aGameLoop();
      Game.aStart = 0;
   }
}
function aGameEffects(%pos, %exitPos){
   %exitPos = 1024*5 SPC 1024*5 SPC 450;
   if(!isObject(aEffect)){
      new SimGroup(aEffect);
      MissionCleanup.add(aEffect);
      aEffect.red = new LinearFlareProjectile() {
         dataBlock        =  RedSpawnProj;
         initialDirection = "0 0 1";
         initialPosition  = %pos;
         sourceObject     = -1;
         sourceSlot       = 0;
         vehicleObject    = 0;
      };
      aEffect.add(aEffect.red);

      aEffect.blue = new LinearFlareProjectile() {
         dataBlock        = BlueSpawnProj;
         initialDirection = "0 0 1";
         initialPosition  = %exitPos;
         sourceObject     = -1;
         sourceSlot       = 0;
         vehicleObject    = 0;
      };
      aEffect.add(aEffect.blue);

      %a = new ParticleEmissionDummy() {
         position = %pos;
         rotation = "1 0 0 0";
         scale = "1 1 1";
         dataBlock = "defaultEmissionDummy";
         lockCount = "0";
         homingCount = "0";
         emitter =  "SphereMistEmitter";
         velocity = "1";
      };
      aEffect.add(%a);  

      %a = new ParticleEmissionDummy() {
         position = %pos;
         rotation = "1 0 0 0";
         scale = "1 1 1";
         dataBlock = "defaultEmissionDummy";
         lockCount = "0";
         homingCount = "0";
         emitter =  "RedChargedEmitter";
         velocity = "1";
      };
      aEffect.add(%a); 

      %a = new ParticleEmissionDummy() {
         position = %pos;
         rotation = "1 0 0 0";
         scale = "1 1 1";
         dataBlock = "defaultEmissionDummy";
         lockCount = "0";
         homingCount = "0";
         emitter = "DarkEmitter";
         velocity = "1";
      }; 
      aEffect.add(%a);


      %a = new ParticleEmissionDummy() {
         position = %exitPos;
         rotation = "1 0 0 0";
         scale = "1 1 1";
         dataBlock = "defaultEmissionDummy";
         lockCount = "0";
         homingCount = "0";
         emitter =  "BlueChargedEmitter";
         velocity = "1";
      };
      aEffect.add(%a); 

      %a = new ParticleEmissionDummy() {
         position = %exitPos;
         rotation = "1 0 0 0";
         scale = "1 1 1";
         dataBlock = "defaultEmissionDummy";
         lockCount = "0";
         homingCount = "0";
         emitter = "DarkEmitter";
         velocity = "1";
      }; 
      aEffect.add(%a);

      %a  = new Lightning(Lightning){
         position = vectorAdd(%pos,"0 0 -110");
         rotation = "1 0 0 0";
         scale = "1 1 220";
         dataBlock = "zapStorm";
         lockCount = "0"; 
         homingCount = "0";
         strikesPerMinute = "12"; 
         strikeWidth = "2.5";
         chanceToHitTarget = "1";
         strikeRadius = "1";
         boltStartRadius = "1"; //altitude the lightning starts from
         color =   "1 0 0 1";
         fadeColor = "0.9 0.3 0 1";
      };
      aEffect.add(%a);
   }
   else{
      if(!isObject(aEffect.red)){
         aEffect.red = new LinearFlareProjectile() {
            dataBlock        =  RedSpawnProj;
            initialDirection = "0 0 1";
            initialPosition  = %pos;
            sourceObject     = -1;
            sourceSlot       = 0;
            vehicleObject    = 0;
         };
         aEffect.add(aEffect.red);
      }
      if(!isObject(aEffect.blue)){
         aEffect.blue = new LinearFlareProjectile() {
            dataBlock        = BlueSpawnProj;
            initialDirection = "0 0 1";
            initialPosition  = %exitPos;
            sourceObject     = -1;
            sourceSlot       = 0;
            vehicleObject    = 0;
         };
         aEffect.add(aEffect.blue); 
      }
   }
}
function aGameLoop(){
   if(($MatchStarted + $missionRunning) == 2 && ($HostGamePlayerCount - $HostGameBotCount > 0)){
      Game.loopTime += 128;
      if(Game.loopTime > (60000 * $Anomaly::dkwUnlockTimeMin)){
         Game.unlockDarkWep = 1;
      }
      if(getRandom(1,150) == 1){
         randomSteamBlast();
      }
      if(cbase.team && cbase.isPowered()){ 
         replaceTrees();
         %pos = "-4.41736 -3.32352 432.785";
         %exitPos = 1024*5 SPC 1024*5 SPC 250;
         aGameEffects(%pos, %exitPos);
         InitContainerRadiusSearch(%pos,  200,  $TypeMasks::PlayerObjectType | $TypeMasks::VehicleObjectType | $TypeMasks::ProjectileObjectType | $TypeMasks::ItemObjectType);
         while ((%targetObject = containerSearchNext()) != 0){
            %tgtPos = %targetObject.getWorldBoxCenter();
            %dist = vectorDist(%pos,%tgtPos); 
            %zDist = getWord(%pos,2) - getWord(%tgtPos,2);
            %vec = VectorNormalize(VectorSub(%pos, %tgtPos));
            if((%targetObject.getType() & $TypeMasks::ProjectileObjectType)){
               if(%targetObject.getDatablock().getname() !$= "RedSpawnProj" && %targetObject.getDatablock().getname() !$= "BlueSpawnProj"){
                  if(%targetObject.getClassName() $= "LinearFlareProjectile" ||  %targetObject.getClassName() $= "LinearProjectile" ||  %targetObject.getClassName() $= "TracerProjectile" || %targetObject.getClassName() $= "GrenadeProjectile"){
                     %dis =  vectorDist(%targetObject.initialPosition,%targetObject.getPosition());
                     //error(getSimTime() - %targetObject.lifeTimeMS); 
                     if(%targetObject.lifeTimeMS && (getSimTime() - %targetObject.lifeTimeMS) > 60000){
                        continue;
                     }
                     if(%dis > 0.1 && %dist > 50){
                        %prec = 10;
                        %targetDir = vectorScale (%vec,%prec);
                        %projDir =  vectorScale(%targetObject.initialDirection,100-%prec);
                        %vecAdd = vectorNormalize(vectorAdd(%targetDir,%projDir));
                        %p = new (%targetObject.getClassName())() {
                           dataBlock        = %targetObject.getDatablock().getName();
                           initialDirection = %vecAdd;
                           initialPosition  = %targetObject.getPosition();
                           sourceObject     = -1;// needs to be -1 other wise rendering issues happen as it references source objects muzzle point
                           sourceSlot       = 0;
                           vehicleObject    = 0;
                           sobj = (!%targetObject.sourceObject) ? -1 : %targetObject.sourceObject;
                           lifeTimeMS =  (!%targetObject.lifeTimeMS) ? getSimTime() : %targetObject.lifeTimeMS;
                        };
                        MissionCleanup.add(%p);
                        %targetObject.delete();
                     }
                     else{
                        %p = new (%targetObject.getClassName())() {
                           dataBlock        = %targetObject.getDatablock().getName();
                           initialDirection = %targetObject.initialDirection;
                           initialPosition  = vectorAdd(%exitPos,"0 0 198");
                           sourceObject     = -1;
                           sourceSlot       = 0;
                           vehicleObject    = 0;
                           sobj = (!%targetObject.sourceObject) ? -1 : %targetObject.sourceObject;
                        };
                        MissionCleanup.add(%p);
                        %targetObject.delete();
                     }
                  }
               }
            }
            else if((%targetObject.getType() & $TypeMasks::VehicleObjectType)){
               if(%targetObject.getClassName() $= "WheeledVehicle"){
                  if(%dist < 60 && isEventPending(%targetObject.sch)){
                     cancel(%targetObject.sch);
                     %targetObject.delete(); 
                  }
                  else{
                     %impulseVec = VectorScale(%vec, 2000);
                     %targetObject.applyImpulse(vectorAdd(%targetObject.getPosition(),"0 0 0.01"), %impulseVec);
                  }
               }
               else{
                  %ray = ContainerRayCast(%pos, %tgtPos, $TypeMasks::StaticTSObjectType | $TypeMasks::StaticShapeObjectType | $TypeMasks::InteriorObjectType | $TypeMasks::TerrainObjectType, 0);
                  if(!%ray){
                     %impulseVec = VectorScale(%vec, 2000);
                     if(%dist < 60){
                        %targetObject.getDatablock().damageObject(%targetObject, 0, "0 0 0", 5, $DamageType::Impact); 
                     }
                     else{
                        %targetObject.applyImpulse(%targetObject.getPosition(), %impulseVec);
                     }
                  }
               }
            }    
            else if((%targetObject.getType() & $TypeMasks::PlayerObjectType) && !%targetObject.isMounted()){
               //error(%zDist);
               %isSafe =  %targetObject.lastBoostTime && ((getSimTime() - %targetObject.lastBoostTime) < 10000);
               if(!%isSafe){
                  if(%targetObject.holdingFlag){
                     Game.dropFlag(%targetObject); 
                  }
                  if(%dist < 40){
                     %targetObject.setPosition(vectorAdd(%exitPos,"0 0 198")); 
                     %targetObject.setVelocity(vectorScale(%targetObject.getVelocity(),0.5));  
                  }
                  else{
                     %timeDif = getSimTime() - %targetObject.lastPullTime;
                     if(!%targetObject.lastPullTime || %timeDif > 3000){
                        %targetObject.whcount = 0; 
                        %targetObject.precAdd = 0;  
                     }
                     %targetObject.lastPullTime = getSimTime();   
                     %targetObject.whcount++;
                     if(%targetObject.whcount > 100){
                        %targetObject.precAdd += 0.05;   
                     }
                     //error(%targetObject.whcount SPC %targetObject.precAdd);
                     %prec = 10 + %targetObject.precAdd;
                     %tvec = vectorNormalize(%targetObject.getVelocity());
                     %speed = VectorLen(%targetObject.getVelocity());
                     %speed  =  (%speed < 100) ? (%speed + 5) : %speed * 0.99;
                     //error(%speed);
                     %targetDir = vectorScale (%vec,%prec);
                     %projDir =  vectorScale(%tvec ,100-%prec);
                     %vecAdd = vectorNormalize(vectorAdd(%targetDir,%projDir));
                     %targetObject.setVelocity(vectorScale(%vecAdd,%speed));
                     //%targetObject.applyImpulse(%tgtPos,  VectorScale(%vec, 60));
                  }
               }
            } 
            else if((%targetObject.getType() & $TypeMasks::ItemObjectType) && !%targetObject.static){
               %ray = ContainerRayCast(%pos, %tgtPos, $TypeMasks::StaticTSObjectType | $TypeMasks::StaticShapeObjectType | $TypeMasks::InteriorObjectType | $TypeMasks::TerrainObjectType, 0);
               if(!%ray){
                  if(%dist < 50 && %targetObject.getDatablock().getName() !$= "Flag"){
                     %targetObject.setPosition(vectorAdd(%exitPos,"0 0 198"));  
                  }
                  else if(%targetObject.getDatablock().getName() !$= "Flag"){
                     %prec = 10;
                     %tvec = vectorNormalize(%targetObject.getVelocity());
                     %speed = VectorLen(%targetObject.getVelocity());
                     %speed  =  (%speed < 100) ? (%speed + 10) : 100;
                     //error(%speed);
                     %targetDir = vectorScale (%vec,%prec);
                     %projDir =  vectorScale(%tvec ,100-%prec);
                     %vecAdd = vectorNormalize(vectorAdd(%targetDir,%projDir));
                     %targetObject.setVelocity(vectorScale(%vecAdd,%speed));
                     //%targetObject.applyImpulse(%tgtPos,  VectorScale(%vec, 60));
                  }
               }
            }
            else if((%targetObject.getType() & $TypeMasks::VehicleObjectType)){
               if(%targetObject.getClassName() $= "WheeledVehicle"){
                  if(%dist < 60 && isEventPending(%targetObject.sch)){
                     cancel(%targetObject.sch);
                     %targetObject.delete(); 
                  }
                  else{
                     %impulseVec = VectorScale(%vec, 2000);
                     %targetObject.applyImpulse(vectorAdd(%targetObject.getPosition(),"0 0 0.01"), %impulseVec);
                  }
               }
            }
         }
      }
      else if(isObject(aEffect)){
         aEffect.delete();
      }
   }

   if(isObject(StartScriptObj)){
      schedule(128, 0, "aGameLoop");
   }
}

function steamKick(%pos,%time){
   %uppos = vectorAdd(%pos, getRandom(-100,100) SPC getRandom(-100,100) SPC 150);
   steamkick2(%pos,%time,%uppos);
}

function steamkick2(%pos,%time,%uppos){
   InitContainerRadiusSearch(%pos,  50, $TypeMasks::PlayerObjectType | $TypeMasks::VehicleObjectType); 
   while ((%targetObject = containerSearchNext()) != 0){
      if((%targetObject.getType() & $TypeMasks::PlayerObjectType)){
         %force = 1800;
         %tgtPos = %targetObject.getWorldBoxCenter();
         %rot = getWords(MatrixMultiply("0 0 0 0 0 1" SPC mDegToRad(getRandom(1,360)), "0 0 0 0 1 0" SPC mDegToRad(getRandom(1,45))),3,6);
         %vec = VectorNormalize(VectorSub(%uppos, %pos));
         //error(%uppos SPC %vec);
         %impulseVec = VectorScale(%vec, %force);
         %targetObject.applyImpulse(%tgtPos, %impulseVec);
      }
      else if((%targetObject.getType() &$TypeMasks::VehicleObjectType) && %targetObject.getDataBlock().getName() $= "tree19"){
         %targetObject.applyImpulse(%targetObject.getPosition(),"5000 0 1900");
      }
    } 
    if(%time > 0){
       %time -= 64;
      schedule(64,0,"steamKick2",%pos,%time,%uppos);
    }  
   
}
datablock ParticleData(SteamStackParticle) {
   dragCoefficient = "0.5";
   windCoefficient = "0";
   gravityCoefficient = "10";
   inheritedVelFactor = "0";
   constantAcceleration = "0";
   lifetimeMS = "5000";
   lifetimeVarianceMS = "200";
   spinSpeed = "1";
   spinRandomMin = "-50";
   spinRandomMax = "50";
   useInvAlpha = "0";
   animateTexture = "0";
   framesPerSec = "1";
   textureCoords[0] = "0 0";
   textureCoords[1] = "0 1";
   textureCoords[2] = "1 1";
   textureCoords[3] = "1 0";
   animTexTiling = "0 0";
   textureName = "particleTest";
   colors[0] = "0.204724 0.204724 0.204724 0.99213";
   colors[1] = "0.291339 0.291339 0.291339 0.1";
   colors[2] = "0.259843 0.259843 0.259843 0.1";
   colors[3] = "0.0787402 0.0787402 0.0787402 0.015748";
   sizes[0] = "50";
   sizes[1] = "50";
   sizes[2] = "50";
   sizes[3] = "50";
   times[0] = "0";
   times[1] = "0.05";
   times[2] = "0.65";
   times[3] = "1";
};

datablock ParticleEmitterData(SteamStackEmitter) {
   ejectionPeriodMS = "10";
   periodVarianceMS = "0";
   ejectionVelocity = "500";
   velocityVariance = "100";
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
   particles = "SteamStackParticle";
   lifetimeMS = "0";
   lifetimeVarianceMS = "0";  

};

function randomSteamBlast(){
   %time = getRandom(3000, 8000);
   if(getRandom(1,2)  == 1) %team = isObject(Team1SFX) ? 2 : 1;
   else %team = isObject(Team2SFX) ? 1 : 2;
   
   if(%team == 1 && !isObject(Team1SFX)){
      if(isObject(TreeB) && getRandom(1,2) == 1){//lols
       %pos = TreeB.position;
       %rot = TreeB.rotation;
       TreeB.delete();
       	%veh = new WheeledVehicle() {
            position = %pos;
            rotation = %rot;
            scale = "1 1 1";
            dataBlock = "tree19";
            lockCount = "0";
            homingCount = "0";
            disableMove = "0";

            Target = "126";
            mountable = "1";
            respawn = "0";
            selfPower = "1";
            lastDamagedBy = "0";
         };
         MissionCleanup.add(%veh);
         %veh.schedule(5000,"delete");
      }
      steamKick("-287.25 -10.7926 197.165",%time);
      camShake("-287.25 -10.7926 197.165");  
      %sfx = new AudioEmitter(Team1SFX) {
         position = "-287.25 -10.7926 197.165";
         rotation = "1 0 0 0";
         scale = "1 1 1";
         fileName = "fx/vehicles/htransport_boost.wav";
         useProfileDescription = "0";
         outsideAmbient = "1";
         volume = "1";
         isLooping = "1";
         is3D = "1";
         minDistance = "100";
         maxDistance = "1024";
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
      MissionCleanup.add(%sfx);
      %sfx.schedule(%time,"delete");
   	%part = new ParticleEmissionDummy() {
         position = "-325.361 10.2393 194.433";
         rotation = "0 -1 0 13";
         scale = "1 1 1";
         dataBlock = "defaultEmissionDummy";
         lockCount = "0";
         homingCount = "0";
         emitter = "SteamStackEmitter";
         velocity = "1";
      };
      %part.schedule(%time, "delete"); 
      MissionCleanup.add(%part);
      %part = new ParticleEmissionDummy() {
         position = "-325.361 -20.5607 194.433";
         rotation = "0 -1 0 13";
         scale = "1 1 1";
         dataBlock = "defaultEmissionDummy";
         lockCount = "0";
         homingCount = "0";
         emitter = "SteamStackEmitter";
         velocity = "1";
      };
      %part.schedule(%time, "delete"); 
      MissionCleanup.add(%part);
      %part = new ParticleEmissionDummy() {
         position = "-264.561 23.6393 182.433";
         rotation = "0 1 0 17.7618";
         scale = "1 1 1";
         dataBlock = "defaultEmissionDummy";
         lockCount = "0";
         homingCount = "0";
         emitter = "SteamStackEmitter";
         velocity = "1";
      };
      %part.schedule(%time, "delete"); 
      MissionCleanup.add(%part);
      %part = new ParticleEmissionDummy() {
         position = "-267.161 -30.9607 194.433";
         rotation = "0 1 0 9.99997";
         scale = "1 1 1";
         dataBlock = "defaultEmissionDummy";
         lockCount = "0";
         homingCount = "0";
         emitter = "SteamStackEmitter";
         velocity = "1";
      };   
      %part.schedule(%time, "delete"); 
      MissionCleanup.add(%part);
   }
   else if(%team == 2 && !isObject(Team2SFX)){
      if(isObject(TreeA) && getRandom(1,2) == 1){//lols
       %pos = TreeA.position;
       %rot = TreeA.rotation;
       TreeA.delete();
       	%veh = new WheeledVehicle() {
            position = %pos;
            rotation = %rot;
            scale = "1 1 1";
            dataBlock = "tree19";
            lockCount = "0";
            homingCount = "0";
            disableMove = "0";

            Target = "126";
            mountable = "1";
            respawn = "0";
            selfPower = "1";
            lastDamagedBy = "0";
         };
         MissionCleanup.add(%veh);
         %veh.schedule(5000,"delete");
      }

      steamKick("286.981 -1.84569 200",%time);
      camShake("286.981 -1.84569 200");  
      %rot[0] = "0.062007 -0.825201 0.561425 15.2465";
      %rot[1] = "-0.11061 -0.0026778 0.99386 194.328";
      %rot[2] = "-0.0999666 -0.0720035 0.992382 126.016";
      %rot[3] = "-0.115559 0.0308397 0.992822 226.772";
      %rot[4] = "-0.0770999 -0.210176 0.974619 58.7289";
      %rotation = %rot[getRandom(0,4)];
      %sfx = new AudioEmitter(Team2SFX) {
         position = "286.981 -1.84569 200"; 
         rotation = "1 0 0 0";
         scale = "1 1 1";
         fileName = "fx/vehicles/htransport_boost.wav";
         useProfileDescription = "0";
         outsideAmbient = "1";
         volume = "1";
         isLooping = "1";
         is3D = "1";
         minDistance = "100";
         maxDistance = "1024";
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
      MissionCleanup.add(%sfx);
      %sfx.schedule(%time,"delete");
      %part = new ParticleEmissionDummy() {
         position = "317.569 12.6078 187.632";
         rotation = %rotation;
         scale = "1 1 1";
         dataBlock = "defaultEmissionDummy";
         lockCount = "0";
         homingCount = "0";
         emitter = "SteamStackEmitter";
         velocity = "1";
      };
      %part.schedule(%time, "delete"); 
      MissionCleanup.add(%part);
      %part = new ParticleEmissionDummy() {
         position = "312.319 -22.988 188.805";
         rotation = %rotation;
         scale = "1 1 1";
         dataBlock = "defaultEmissionDummy";
         lockCount = "0";
         homingCount = "0";
         emitter = "SteamStackEmitter";
         velocity = "1";
      };
      %part.schedule(%time, "delete"); 
      MissionCleanup.add(%part);
      %part = new ParticleEmissionDummy() {
         position = "255.718 -21.3017 201.462";
         rotation = %rotation;
         scale = "1 1 1";
         dataBlock = "defaultEmissionDummy";
         lockCount = "0";
         homingCount = "0";
         emitter = "SteamStackEmitter";
         velocity = "1";
      };
      %part.schedule(%time, "delete"); 
      MissionCleanup.add(%part);
      %part = new ParticleEmissionDummy() {
         position = "264.561 25.2672 199.485";
         rotation = %rotation;
         scale = "1 1 1";
         dataBlock = "defaultEmissionDummy";
         lockCount = "0";
         homingCount = "0";
         emitter = "SteamStackEmitter";
         velocity = "1";
      };
      %part.schedule(%time, "delete"); 
      MissionCleanup.add(%part);
      %part = new ParticleEmissionDummy() {
         position = "277.355 -4.42543 196.623";
         rotation = %rotation;
         scale = "1 1 1";
         dataBlock = "defaultEmissionDummy";
         lockCount = "0";
         homingCount = "0";
         emitter = "SteamStackEmitter";
         velocity = "1";
      };
      %part.schedule(%time, "delete"); 
      MissionCleanup.add(%part);
   }
}
datablock ExplosionData(camShake1){
   lifeTimeMS = 10000;
   offset = 0;
   
   shakeCamera = true;
   camShakeFreq = "10.0 6.0 9.0";
   camShakeAmp = "20.0 20.0 20.0";
   camShakeDuration = 2;
   camShakeRadius = 200.0;
};

datablock LinearFlareProjectileData(CamProj){
   projectileShapeName = "plasmabolt.dts";
   scale               = "0.01 0.01 0.01";
   faceViewer          = true;
   directDamage        = 0.0;
   hasDamageRadius     = false;
   indirectDamage      = 0;
   damageRadius        = 0;
   kickBackStrength    = 0.0;
   directDamageType    = $DamageType::Explosion;
   radiusDamageType    = $DamageType::Explosion;
   Impulse = true;
   explosion           = "camShake1";

   dryVelocity       = 0.1;
   wetVelocity       = -1;
   velInheritFactor  = 0.3;
   fizzleTimeMS      = 0;
   lifetimeMS        = 128;
   explodeOnDeath    = true;
   reflectOnWaterImpactAngle = 0.0;
   explodeOnWaterImpact      = true;
   deflectionOnWaterImpact   = 0.0;
   fizzleUnderwaterMS        = -1;

   activateDelayMS = -1;

   size[0]           = 0.01;
   size[1]           = 0.01;
   size[2]           = 0.01;


   numFlares         = 3;
   flareColor        = "0 1 0";
   flareModTexture   = "flaremod";
   flareBaseTexture  = "flarebase";

   hasLight    = false;
   lightRadius = 3.0;
   lightColor  = "0 1 0";
};

function camShake(%pos){
   %p = new LinearFlareProjectile() {
      dataBlock        = CamProj;
      initialDirection = "0 0 -1";
      initialPosition  = %pos;
      sourceObject     = -1; 
      sourceSlot       = 0;
      vehicleObject    = 0;
   };  
   MissionCleanup.add(%p);  
}

function replaceTrees(){
   if(!Game.rmvTrees){
      if(isObject(RandomOrganics)){
         RandomOrganics.delete();
      }
      for(%i = 0 ; %i < rmvTrees.getCount(); %i++){
         %tree = rmvTrees.getObject(%i);
         schedule(getRandom(1000,15000),0,"treeVeh",%tree); 
      }
      Game.rmvTrees = 1;
   }
}

function  treeVeh(%tree){
      %pos = %tree.position;
      %rot = %tree.rotation;
      %treeDB = %tree.DB;
      %tree.delete();
      %veh = new WheeledVehicle() {
         position = %pos;
         rotation = %rot;
         scale = "1 1 1";
         dataBlock = %treeDB;
         lockCount = "0";
         homingCount = "0";
         disableMove = "0";

         Target = "126";
         mountable = "1";
         respawn = "0";
         selfPower = "1";
         lastDamagedBy = "0";
      };
      MissionCleanup.add(%veh);
      %veh.sch = %veh.schedule(8000,"delete");  
   
}


datablock WheeledVehicleData(tree16) : ShrikeDamageProfile{
   mountable = 0;
   spawnOffset = "0 0 1.0";
   renderWhenDestroyed = false;

   catagory = "MISC";
   shapeFile = "borg16.dts";
   multipassenger = false;
   computeCRC = false;

   isShielded = false;
   explosion = BlasterExplosion;
   explosionDamage = 0.5;
   explosionRadius = 5.0;
   drag = 1.0;
   maxDamage = 1;
   destroyedLevel = 1.1;
   
   mass = 150;
   bodyFriction = 0.8;
   bodyRestitution = 0.5;
   minRollSpeed = 3;
   gyroForce = 400;
   gyroDamping = 0.3;
   stabilizerForce = 10;
   minDrag = 10;

   
   

   softSplashSoundVelocity = 10.0;
   mediumSplashSoundVelocity = 15.0;
   hardSplashSoundVelocity = 20.0;
   exitSplashSoundVelocity = 10.0;


   softImpactSpeed = 114;       
   hardImpactSpeed = 220;    

   softImpactSound = SoftImpactSound;
   hardImpactSound = HardImpactSound;

   exitingWater      = VehicleExitWaterMediumSound;
   impactWaterEasy   = VehicleImpactWaterSoftSound;
   impactWaterMedium = VehicleImpactWaterMediumSound;
   impactWaterHard   = VehicleImpactWaterMediumSound;
   waterWakeSound    = VehicleWakeMediumSplashSound;
   targetNameTag = 'Physics';
   targetTypeTag = 'Object';
   sensorData = VehiclePulseSensor;
   sensorRadius = VehiclePulseSensor.detectRadius;

   minImpactSpeed = 10;     
   speedDamageScale = 0.006;

   damageScale[$DamageType::Water] = 0;
};

datablock WheeledVehicleData(tree17) : ShrikeDamageProfile{
   mountable = 0;
   spawnOffset = "0 0 1.0";
   renderWhenDestroyed = false;

   catagory = "MISC";
   shapeFile = "borg17.dts";
   multipassenger = false;
   computeCRC = false;

   isShielded = false;
   explosion = BlasterExplosion;
   explosionDamage = 0.5;
   explosionRadius = 5.0;
   drag = 1.0;
   maxDamage = 1;
   destroyedLevel = 1.1;
   
   mass = 150;
   bodyFriction = 0.8;
   bodyRestitution = 0.5;
   minRollSpeed = 3;
   gyroForce = 400;
   gyroDamping = 0.3;
   stabilizerForce = 10;
   minDrag = 10;

   softSplashSoundVelocity = 10.0;
   mediumSplashSoundVelocity = 15.0;
   hardSplashSoundVelocity = 20.0;
   exitSplashSoundVelocity = 10.0;

   softImpactSpeed = 114;       
   hardImpactSpeed = 220;    

   softImpactSound = SoftImpactSound;
   hardImpactSound = HardImpactSound;

   exitingWater      = VehicleExitWaterMediumSound;
   impactWaterEasy   = VehicleImpactWaterSoftSound;
   impactWaterMedium = VehicleImpactWaterMediumSound;
   impactWaterHard   = VehicleImpactWaterMediumSound;
   waterWakeSound    = VehicleWakeMediumSplashSound;
   targetNameTag = 'Physics';
   targetTypeTag = 'Object';
   sensorData = VehiclePulseSensor;
   sensorRadius = VehiclePulseSensor.detectRadius;

   minImpactSpeed = 10;     
   speedDamageScale = 0.006;

   damageScale[$DamageType::Water] = 0;
};

datablock WheeledVehicleData(tree18) : ShrikeDamageProfile{
   mountable = 0;
   spawnOffset = "0 0 1.0";
   renderWhenDestroyed = false;

   catagory = "MISC";
   shapeFile = "borg18.dts";
   multipassenger = false;
   computeCRC = false;

   isShielded = false;
   explosion = BlasterExplosion;
   explosionDamage = 0.5;
   explosionRadius = 5.0;
   drag = 1.0;
   maxDamage = 1;
   destroyedLevel = 1.1;
   
   mass = 150;
   bodyFriction = 0.8;
   bodyRestitution = 0.5;
   minRollSpeed = 3;
   gyroForce = 400;
   gyroDamping = 0.3;
   stabilizerForce = 10;
   minDrag = 10;

   
   

   softSplashSoundVelocity = 10.0;
   mediumSplashSoundVelocity = 15.0;
   hardSplashSoundVelocity = 20.0;
   exitSplashSoundVelocity = 10.0;


   softImpactSpeed = 114;       
   hardImpactSpeed = 220;    

   softImpactSound = SoftImpactSound;
   hardImpactSound = HardImpactSound;

   exitingWater      = VehicleExitWaterMediumSound;
   impactWaterEasy   = VehicleImpactWaterSoftSound;
   impactWaterMedium = VehicleImpactWaterMediumSound;
   impactWaterHard   = VehicleImpactWaterMediumSound;
   waterWakeSound    = VehicleWakeMediumSplashSound;
   targetNameTag = 'Physics';
   targetTypeTag = 'Object';
   sensorData = VehiclePulseSensor;
   sensorRadius = VehiclePulseSensor.detectRadius;

   minImpactSpeed = 10;     
   speedDamageScale = 0.006;

   damageScale[$DamageType::Water] = 0;
};

datablock WheeledVehicleData(tree19) : ShrikeDamageProfile{
   mountable = 0;
   spawnOffset = "0 0 1.0";
   renderWhenDestroyed = false;

   catagory = "MISC";
   shapeFile = "borg19.dts";
   multipassenger = false;
   computeCRC = false;

   isShielded = false;
   explosion = BlasterExplosion;
   explosionDamage = 0.5;
   explosionRadius = 5.0;
   drag = 1.0;
   maxDamage = 1;
   destroyedLevel = 1.1;
   
   mass = 150;
   bodyFriction = 0.8;
   bodyRestitution = 0.5;
   minRollSpeed = 3;
   gyroForce = 400;
   gyroDamping = 0.3;
   stabilizerForce = 10;
   minDrag = 10;

   
   

   softSplashSoundVelocity = 10.0;
   mediumSplashSoundVelocity = 15.0;
   hardSplashSoundVelocity = 20.0;
   exitSplashSoundVelocity = 10.0;


   softImpactSpeed = 114;       
   hardImpactSpeed = 220;    

   softImpactSound = SoftImpactSound;
   hardImpactSound = HardImpactSound;

   exitingWater      = VehicleExitWaterMediumSound;
   impactWaterEasy   = VehicleImpactWaterSoftSound;
   impactWaterMedium = VehicleImpactWaterMediumSound;
   impactWaterHard   = VehicleImpactWaterMediumSound;
   waterWakeSound    = VehicleWakeMediumSplashSound;
   targetNameTag = 'Physics';
   targetTypeTag = 'Object';
   sensorData = VehiclePulseSensor;
   sensorRadius = VehiclePulseSensor.detectRadius;

   minImpactSpeed = 10;     
   speedDamageScale = 0.006;

   damageScale[$DamageType::Water] = 0;
};

datablock TriggerData(anomalyTrig){
   tickPeriodMS =  32;
};

function SimObject::getUpVector(%obj){
   %rot = getWords(%obj.getTransform(), 3, 6);  
   %tmat = VectorOrthoBasis(%rot);
   return getWords(%tMat, 6, 8);
}

function anomalyTrig::onEnterTrigger(%data, %trigger, %player){
   %mode = %trigger.mode;
   if(isObject(PZones)){
      PZones.delete();
   }
   switch(%mode){
      case 1:
         if(%trigger.ispowered()){
            %player.setPosition(%trigger.getWorldBoxCenter());
            %vel = VectorScale(VectorNormalize(%trigger.getForwardVector()), 90);   
            %player.setVelocity(%vel);
            if(getSimTime() - %player.boostTrigTime > 2000){
               serverPlay3D(forceTrig, %trigger.getTransform());
               %player.client.play2D(aboostSound);
            }
            %player.boostTrigTime = getSimTime();
         }
         else{
            if(getSimTime() - %player.boostTrigMsgTime > 5000){
               messageClient(%player.client, 'MsgClient', '\c0Cannon is not powered.~wfx/powered/station_denied.wav');
            }
            %player.boostTrigMsgTime = getSimTime();
         }
         %player.lastBoostTime = getSimTime();
      case 2:
         if(%trigger.ispowered()){
            %trigPos = %trigger.getWorldBoxCenter();
            %player.setPosition(%trigPos);
            %vel = VectorScale(VectorNormalize(%trigger.getForwardVector()), 160);   
            %player.setVelocity(%vel);
            serverPlay3D(ACannonExpSound, %trigger.getTransform());
            cannonEffect(%trigger);
         }
         else{
            messageClient(%player.client, 'MsgClient', '\c0Cannon is not powered.~wfx/powered/station_denied.wav');
         }
         %player.lastBoostTime = getSimTime();
      case 3:
         if(Game.unlockDarkWep){
            %player.setInventory(DarkWeaponX, 1, true);
            %player.setInventory(DarkAmmo, 1, true);
            %player.use(DarkWeaponX);
         }
         else{
            %minLeft = $Anomaly::dkwUnlockTimeMin - mCeil((Game.loopTime / 1000) / 60);
            %pos = 1024*5 SPC 1024*5 SPC 250;
            %plrPos = %player.getPosition();
            %p = new SniperProjectile() {
               dataBlock        =  MOACShot;
               initialDirection = vectorNormalize(vectorSub(%plrPos, %pos));
               initialPosition  = %pos;
               sourceObject     = -1;
               damageFactor     = 2;
               sourceSlot       = "";
               sObj = %obj;
            };
            %p.setEnergyPercentage(1);
            MissionCleanup.add(%p);
            messageClient(%player.client, 'MsgClient', '\c0The dark weapon unlocks in %1 minutes.~wfx/powered/station_denied.wav', %minLeft);
         }
      default:
         return;
   }
}
function cannonEffect(%trigger){
       %p = new LinearFlareProjectile() {
         dataBlock        = ACannonEffect;
         initialDirection = vectorScale(%trigger.getForwardVector(),-1);
         initialPosition  = vectorAdd(%trigger.getWorldBoxCenter(),vectorScale(%trigger.getForwardVector(),8));
         sourceObject     = -1;
         sourceSlot       = 0;
         vehicleObject    = 0;
      };
      MissionCleanup.add(%p);  
}
function testBeam(){
      %pos = 1024*5 SPC 1024*5 SPC 450;
      %plrPos =  1024*5 SPC 1024*5 SPC -200;
      %p = new SniperProjectile() {
         dataBlock        =  MOACShot;
         initialDirection = "0 0 -1";
         initialPosition  = %pos;
         sourceObject     = -1;
         damageFactor     = 2;
         sourceSlot       = "";
         sObj = %obj;
      };
      %p.setEnergyPercentage(1);
      MissionCleanup.add(%p);
}

datablock ExplosionData(moacBeamExplosion)
{
   explosionShape = "effect_plasma_explosion.dts";
   soundProfile   = ShapeExplosionSound;
   faceViewer = true;

   //emitter[0] = Weapon10ExplosionEmitter;
   //emitter[1] = Weapon10RifleEmitter;
   colors[0] = "0.0 0.0 1.0 0.0";
   colors[1] = "0.0 0.0 1.0 1.0";
   times[0] = 0.0;
   times[1] = 1;
   sizes[0] = "10.0 10.0 10.0";
   sizes[1] = "1.0 1.0 1.0";

};

datablock SniperProjectileData(MOACShot){

   directDamage        = 30;
   hasDamageRadius     = true;
   indirectDamage      = 50;
   damageRadius        = 30.0;
   velInheritFactor    = 1.0;
   //sound 			   = Weapon10ProjectileSound;
   explosion           = "moacBeamExplosion";
   splash              = PlasmaSplash;
   directDamageType    = $DamageType::outOfBounds;

   maxRifleRange       = 1000;
   rifleHeadMultiplier = 3.3;   //may be added later
   beamColor           = "0 0 1";
   fadeTime            = 0.8;

   startBeamWidth		  = 18.2;
   endBeamWidth 	     = 18.2;
   pulseBeamWidth 	  = 18.5;
   beamFlareAngle 	  = 3.0;
   minFlareSize        = 0.0;
   maxFlareSize        = 400.0;
   pulseSpeed          = 6.0;
   pulseLength         = 0.050;

   lightRadius         = 5.0;
   lightColor          = "0 0.0 1";

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

function anomalyTrig::onTickTrigger(%this, %triggerId){
 // anti spam
}
function anomalyTrig::onleaveTrigger(%data, %trigger, %player){

}

datablock ParticleData(ACannonSmokeParticle){
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

datablock ParticleEmitterData(ACannonSmokeEmitter){
   ejectionPeriodMS = 5;
   periodVarianceMS = 1;

   ejectionVelocity = 14.25;
   velocityVariance = 0.50;

   thetaMin         = 0.0;
   thetaMax         = 90.0;
   lifetimeMS       = 1000;
   particles = "ACannonSmokeParticle";
};

datablock ParticleData(ACannonExplosionSmoke){
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

datablock ParticleEmitterData(AHeavyExplosionSmokeEmitter){
   ejectionPeriodMS = 2;
   periodVarianceMS = 0;
   ejectionVelocity = 520.25;
   velocityVariance = 0.25;
   thetaMin         = 0.0;
   thetaMax         = 35.0;
   lifetimeMS       = 200;

   particles = "ACannonExplosionSmoke";
};

datablock ShockwaveData(ACannonShockwave){
   width = 30;
   numSegments = 32;
   numVertSegments = 7;
   velocity = 200;
   acceleration = 50.0;
   lifetimeMS = 600;
   height = 0.5;
   verticalCurve = 0.375;

   mapToTerrain = false;
   renderBottom = true;
   orientToNormal = true;

   texture[0] = "special/shockwave4";
   texture[1] = "special/gradient";
   texWrap = 3.0;

   times[0] = 1.0;
   times[1] = 0.5;
   times[2] = 1.0;

   colors[0] = "0.5 0.5 0.0 1.0";
   colors[1] = "0.7 0.5 0.0 1.0";
   colors[2] = "0.9 0.3 0.0 1.0";
}; 

datablock AudioProfile(aboostSound){
   filename    = "fx/Bonuses/upward_straipass2_elevator.wav";
   description = AudioExplosion3d;
   preload = true;
};
datablock AudioDescription(AudioBIGXAExplosion3d){
   volume   = 1.0;
   isLooping= false;

   is3D     = true;
   minDistance= 50.0;
   MaxDistance= 440.0;
   type     = $EffectAudioType;
   environmentLevel = 1.0;
};
datablock AudioProfile(ACannonExpSound){
   filename    = "fx/powered/turret_mortar_explode.wav";
   description = "AudioBIGXAExplosion3d";
   preload = true;
};
datablock ExplosionData(ACannonExplosion){
   explosionShape = "effect_plasma_explosion.dts";
   faceViewer           = true;

   delayMS = 200;

   offset = 0.0;

   playSpeed = 1.5;

   sizes[0] = "6.0 6.0 6.0";
   sizes[1] = "6.0 6.0 6.0";
   times[0] = 0.0;
   times[1] = 1.0;

   shockwave      = ACannonShockwave;
   emitter[0] = ACannonSmokeEmitter;
   emitter[1] = AHeavyExplosionSmokeEmitter;
  //emitter[2] = HeavyCrescentEmitter;

   shakeCamera = true;
   camShakeFreq = "10.0 6.0 9.0";
   camShakeAmp = "20.0 20.0 20.0";
   camShakeDuration = 1;
   camShakeRadius = 150.0;
};

datablock LinearFlareProjectileData(ACannonEffect){
   projectileShapeName = "plasmabolt.dts";
   scale               = "0.1 0.1 0.1";
   faceViewer          = true;
   directDamage        = 0.0;
   hasDamageRadius     = false;
   indirectDamage      = 0.0;
   damageRadius        = 0.0;
   kickBackStrength    = 0.0;
   radiusDamageType    = $DamageType::Plasma;

   explosion           = "ACannonExplosion";

   dryVelocity       = 1; 
   wetVelocity       = 1;
   velInheritFactor  = 0.3;
   fizzleTimeMS      = 0;
   lifetimeMS        = 128;
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

datablock ForceFieldBareData(APlrCannonBlocker)
{
   fadeMS           = 1000;
   baseTranslucency = 0.01;
   powerOffTranslucency = 0.0;
   teamPermiable    = true;
   otherPermiable   = false;
   color            = "0.28 0.89 0.31";
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




datablock AudioProfile(TeleporterAStart){
   filename    = "fx/misc/nexus_cap.wav";
   description = AudioDefault3d;
   preload = true;
};


datablock StaticShapeData(TeleporterA){
   catagory = "Teleporters";
   shapefile = "station_teleport.dts";
   mass = 10;
   elasticity = 0.2;
   friction = 0.6;
   pickupRadius = 2;
   targetNameTag = '';
   targetTypeTag = 'Teleporter';
//----------------------------------
   maxDamage = 1.00;
   destroyedLevel = 1.00;
   disabledLevel = 0.70;
   explosion      = ShapeExplosion;
   expDmgRadius = 8.0;
   expDamage = 0.4;
   expImpulse = 1500.0;
   // don't allow this object to be damaged in non-team-based
   // mission types (DM, Rabbit, Bounty, Hunters)
   noIndividualDamage = true;

   dynamicType = $TypeMasks::StationObjectType;
   isShielded = true;
   energyPerDamagePoint = 75;
   maxEnergy = 50;
   rechargeRate = 0.35;
   doesRepair = true;
   humSound = StationInventoryHumSound;

   cmdCategory = "Support";
   cmdIcon = CMDStationIcon;
   cmdMiniIconName = "commander/MiniIcons/com_inventory_grey";

   debrisShapeName = "debris_generic.dts";
   debris = StationDebris;
};

//datablock Staticshapedata(teledestroyed) : teleporter
//{
   //shapefile = "station_teleport.dts";
//};

$playerreject = 6;
function TeleporterA::onDestroyed(%data, %obj, %prevState){
   //set the animations
   %obj.playThread(1, "transition");
   %obj.setThreadDir(1, true);
   %obj.setDamageState(Destroyed);
   //%obj.setDatablock(teledestroyed);
   %obj.getDataBlock().onLosePowerDisabled(%obj);
}
function TeleporterA::damageObject(%data, %targetObject, %sourceObject, %position, %amount, %damageType){
   if( %targetObject.invincible)
		return; 
   parent::damageObject(%data, %targetObject, %sourceObject, %position, %amount, %damageType);
}
//---this is where I create the triggers and put them right over the nexus base's
function TeleporterA::onEnabled(%data, %obj, %prevState){ 
   %level = %obj.getdamagelevel();
  %obj.setdamagelevel(%level);
   if(%obj.ispowered())
   {
      %obj.playthread(1, "transition");
      %obj.setThreadDir(1, false);
      %obj.playThread(0, "ambient");
      %obj.setThreadDir(0, true);
   }
   else
   {
      %obj.playThread(0, "transition");
      %obj.setThreadDir(0, false);
   }
  Parent::onEnabled(%data, %obj, %prevState);
}

function TeleporterA::gainPower(%data, %obj){
   //%obj.setDatablock(teleporter);
   Parent::gainPower(%data, %obj);
   %obj.playthread(1, "transition");
   %obj.setThreadDir(1, false);
   %obj.playThread(0, "ambient");
   %obj.setThreadDir(0, true);
}

function TeleporterA::losePower(%data, %obj){
   %obj.playThread(0, "transition");
   %obj.setThreadDir(0, false);
   Parent::losePower(%data, %obj);
}

function TeleporterA::onAdd(%this, %tp){
   Parent::onAdd(%this, %tp);
   if(!isObject(tpSimSet)){
      new simSet(tpSimSet);
      MissionCleanup.add(tpSimSet);
   }
   tpSimSet.add(%tp);
   
   %trigger = new Trigger()
   {
      dataBlock = NewTeleportATrigger;
      polyhedron = "-0.75 0.75 0.1 1.5 0.0 0.0 0.0 -1.5 0.0 0.0 0.0 2.3";
   };
   
   MissionCleanup.add(%trigger);
   if(%tp.noflag $= "")
      %tp.noflag = "0";
   if(%tp.oneway $= "")
      %tp.oneway = "0";
   if(%tp.linkID $= "")
      %tp.linkID = "0";
   if(%tp.linkTo $= "")
      %tp.linkTo = "0";
   if(%tp.invincible $= ""){
      %tp.invincible = 1;
   }
   if(%tp.teamOnly $= ""){
      %tp.teamOnly = 1;
   }

   %trigger.setTransform(%tp.getTransform());
   
   %trigger.sourcebase = %tp;
   %tp.trigger = %trigger;

 //--------------do we need power?-----------------------
   %tp.playThread(1, "ambient");
   %tp.playThread(0, "transition");
   %tp.playThread(0, "ambient");

   %pos = %trigger.position;

}


datablock TriggerData(NewTeleportATrigger){
   tickPeriodMS =  256;
};


function NewTeleportATrigger::onEnterTrigger(%data, %trigger, %player)
{
   %colObj = %player;
   %client = %player.client;

   if(%player.transported $= "1")  // if this player was just transported
   {
      %player.transported = "0";
      %colObj.setMoveState(false);
      %trigger.player = %player;
      return; // then get out or it will never stop
   }

//--------------do we have power?-----------------------
   if(%trigger.sourcebase.ispowered() == 0){
      messageClient(%player.client, 'MsgClient', '\c0Teleporter is not powered.~wfx/powered/station_denied.wav');
      return;
   }

//----------------------disabled?-----------------------
   if(%trigger.sourcebase.isDisabled()){
      messageClient(%colObj.client, 'msgStationDisabled', '\c2Teleporter is disabled.~wfx/powered/station_denied.wav');
      return;
   }

//--------------are we on the right team?-----------------------
   if(%player.team != %trigger.sourcebase.team && %trigger.sourcebase.teamOnly){
      messageClient(%player.client, 'MsgClient', '\c0Wrong team.~wfx/powered/station_denied.wav');
      return;
   }

   //------------are we teleporting?-----------------------
   if(isObject(%trigger.player)){
      messageClient(%player.client, 'MsgClient', '\c0Teleporter in use.~wfx/powered/station_denied.wav');
      return;
   }
   //-------------is this a oneway teleporter?------------------------
   if(%trigger.sourcebase.oneway == "1"){
      messageClient(%player.client, 'MsgLeaveMissionArea', '\c1This teleporter is oneway only.~wfx/powered/station_denied.wav');
      return;
   }

   //-------------are we teleporting with flag?----------------------------------------
   %flag = %player.holdingflag;
   if(%player.holdingFlag > 0){
      if(%trigger.sourcebase.noflag $= "1"){
         if(%flag.team == 1)
            %otherTeam = 2;
         else
            %otherTeam = 1;

         //game.flagReset(%player.holdingflag);
         Game.dropFlag(%player); 
         messageClient(%player.client, 'MsgClient', '\c0Cant teleport with flag');
         //messageTeam(%flag.team, 'MsgCTFFlagReturned', '\c2Your flag was returned.~wfx/misc/flag_return.wav', 0, 0, %flag.team);
         //messageTeam(0, 'MsgCTFFlagReturned', '\c2The %2 flag was returned to base.~wfx/misc/flag_return.wav', 0, $teamName[%flag.team], %flag.team);
      }
   }
   %destList = getDestTeleA(%trigger.sourcebase,%player.client);
   
   if(%destList != -1){
      %vc = 0;
      for(%x = 0; %x < getFieldCount(%destList); %x++){
         %targetObj = getField(%destList,%x);
         // make sure its not in use  and its not destroyed  and it has power 
         if(!isObject(%targetObj.trigger.player) && %targetObj.isEnabled() && %targetObj.isPowered())
            %validTarget[%vc++] = %targetObj;
         else
            %inValidTarget[%ivc++] = %targetObj;
         
      }
      if(!%vc){
         if(isObject(%inValidTarget[1].trigger.player))
            messageClient(%player.client, 'MsgClient', '\c0Destination teleporter in use.~wfx/powered/station_denied.wav');
         else if(!%inValidTarget[1].isEnabled())
            messageClient(%player.client, 'MsgClient', '\c0Destination teleporter is destroyed.~wfx/powered/station_denied.wav');
         else if(!%inValidTarget[1].isPowered())
            messageClient(%player.client, 'MsgClient', '\c0Destination teleporter lost power.~wfx/powered/station_denied.wav');
         else
            messageClient(%player.client, 'MsgClient', '\c0Destination teleporter in use, destroyed, or loss power.~wfx/powered/station_denied.wav');
      }
      else{
         %dest = %validTarget[getRandom(1,%vc)];
         serverPlay3D(TeleporterAStart, %trigger.getTransform());
         messageClient(%player.client, 'MsgClient', '~wfx/misc/nexus_cap.wav');  
         %player.transported = 1;
         %teleDest =  vectorAdd(%dest.getPosition(),"0 0 0.5");
         teleporteffect(vectorAdd(%trigger.sourcebase.getPosition(),"0 0 0.5"));
         teleporteffect(%teleDest);
         %player.setmovestate(true);
         %player.setTransform(vectorAdd(%trigger.sourcebase.getPosition(),"0 0 0.5") SPC getWords(%player.getTransform(),3,6));
         %player.startfade(500,0,true);
         %player.schedule(500, "settransform", %teleDest SPC getWords(%player.getTransform(),3,6));
         %player.schedule(500, "startfade", 500, 0, false);
         %player.schedule(500, "setmovestate", false);
      }
   }
   else
      messageClient(%player.client, 'MsgLeaveMissionArea', '\c1This teleporter has no destination.~wfx/misc/warning_beep.wav');   
}
function getDestTeleA(%obj,%client){
   %idCount = getFieldCount(%obj.linkTo);
   if(!%idCount || %obj.team != %client.team)
      return -1;
   %count = 0;
   for(%i = 0; %i < tpSimSet.getCount(); %i++){
      %dest = tpSimSet.getObject(%i);
      if(%dest.team == %client.team && %dest != %obj){
         for(%a = 0; %a <  getFieldCount(%dest.linkTo); %a++){
            %destID = getField(%dest.linkTo,%a);
            if(%obj.linkID == %destID){// see if it links back to us
               if(%count++ == 1)
                  %teleList = %dest;
               else
                  %teleList = %teleList TAB %dest;
            }
         }
      }
   }
   if(%count > 0){
      return %teleList;
   }
   return -1;
}

function NewTeleportATrigger::onleaveTrigger(%data, %trigger, %player){
   if(%player == %trigger.player){
      %trigger.player = 0;  
   }
   if(!%player.transported){
      %player.tpWarn  = 0;
      %player.tpTime = 0;
      %player.tpDmgTime = 0;
   }
}

function NewTeleportATrigger::onTickTrigger(%data, %trig){
   %player = %trig.player; 
   if(isObject(%player)){
     if(%player.getState() $= "Dead"){
        %player.blowUp();
        %trig.player = 0;
     }
     else{
         if(%player.tpTime > 3000 && !%player.tpWarn){
            messageClient(%player.client, 'MsgLeaveMissionArea', '\c1Move off the teleporter or take damage.~wfx/misc/warning_beep.wav');
            %player.tpWarn = 1;         
         }
         %player.tpTime += %data.tickPeriodMS;
         if(%player.tpTime > 3000){
            %player.tpDmgTime += %data.tickPeriodMS;
            if(%player.tpDmgTime > 1000){
               %player.setdamageflash(0.3);
               %player.damage(0, %player.getPosition(), 0.04, $DamageType::Explosion);
            }
         }
     }
   }
   else
      %trig.player = 0;
}

function teleporteffect(%position){   
   %effect1 = new ParticleEmissionDummy(){
      position = %position;
      rotation = "1 0 0 0";
      scale = "1 1 1";
      dataBlock = "doubleTimeEmissionDummy";
      emitter = "AABulletExplosionEmitter2";
      velocity = "1";
   };

   %effect2 = new ParticleEmissionDummy(){
      position = getWord(%position,0) SPC getWord(%position,1) SPC getWord(%position,2) + 0.5;
      rotation = "1 0 0 0";
      scale = "1 1 1";
      dataBlock = "doubleTimeEmissionDummy";
      emitter = "AABulletExplosionEmitter2";
      velocity = "1";
   };

   %effect3 = new ParticleEmissionDummy(){
      position = getWord(%position,0) SPC getWord(%position,1) SPC getWord(%position,2) + 1;
      rotation = "1 0 0 0";
      scale = "1 1 1";
      dataBlock = "doubleTimeEmissionDummy";
      emitter = "AABulletExplosionEmitter2";
      velocity = "1";
   };

   %effect4 = new ParticleEmissionDummy(){
      position = getWord(%position,0) SPC getWord(%position,1) SPC getWord(%position,2) + 1.5;
      rotation = "1 0 0 0";
      scale = "1 1 1";
      dataBlock = "doubleTimeEmissionDummy";
      emitter = "AABulletExplosionEmitter2";
      velocity = "1";
   };
   MissionCleanup.add(%effect1);
   MissionCleanup.add(%effect2);
   MissionCleanup.add(%effect3);
   MissionCleanup.add(%effect4);
   %effect1.schedule(2000, "delete");
   %effect2.schedule(2000, "delete");
   %effect3.schedule(2000, "delete");
   %effect4.schedule(2000, "delete");
}

function SimObject::getUpVector(%obj){
   %rot = getWords(%obj.getTransform(), 3, 6);  
   %tmat = VectorOrthoBasis(%rot);
   return getWords(%tMat, 6, 8);
}




















function giveBigWep(){
   %player = LocalClientConnection.player; 
   %player.setInventory("ThetaStrike", 1, true);
   %player.setInventory("DarkWeaponX", 1, true);
   %player.setInventory("StarNova", 1, true);
   %player.setInventory("ZapNukeGun", 1, true);
   %player.setInventory("DarkAmmo", 15, true);
}

datablock ItemData(DarkAmmo){
   className = Ammo;
   catagory = "Ammo";
   shapeFile = "ammo_disc.dts";
   mass = 1;
   elasticity = 0.2;
   friction = 0.6;
   pickupRadius = 2;
	pickUpName = "a dark weapon ammo";
};

datablock ItemData(MagCan){
   className = Weapon;
   catagory = "Spawn Items";
   shapeFile = "weapon_grenade_launcher.dts";
   image = MagCanImage;
   mass = 1;
   elasticity = 0.2;
   friction = 0.6;
   pickupRadius = 2;
	pickUpName = "a dark weapon";
   computeCRC = false;
   wepName = "Dark Magnetar";
   description = "A powerful weapon that creates a powerful force to pull targets towards the point of impact";
};

function MagCan::onCollision(%data,%obj,%col){
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
      %col.setInventory(MagCan, 1, true);
      %col.setInventory(DarkAmmo, 2, true);
      %col.use(MagCan);
   }
}

datablock ParticleData(MagCanExplosionParticle) {
   dragCoefficient = "0";
   windCoefficient = "0";
   gravityCoefficient = "0";
   inheritedVelFactor = "0";
   constantAcceleration = "0";
   lifetimeMS = "3000";
   lifetimeVarianceMS = "0";
   spinSpeed = "1";
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
   textureName = "special/BlueImpact";
   colors[0] = "0.19 0 1 1";
   colors[1] = "0.19 0 1 1";
   colors[2] = "0.19 0 1 1";
   colors[3] = "0.0 0 1 1";
   sizes[0] = "1";
   sizes[1] = "2";
   sizes[2] = "5";
   sizes[3] = "6";
   times[0] = "0";
   times[1] = "0.1875";
   times[2] = "0.554167";
   times[3] = "1";
};

datablock ParticleEmitterData(MagCanExplosionEmitter) {
   ejectionPeriodMS = "60";
   periodVarianceMS = "0";
   ejectionVelocity = "0";
   velocityVariance = "0";
   ejectionOffset = "2";
   ejectionOffsetVariance = "0";
   thetaMin = "0";
   thetaMax = "0";
   phiReferenceVel = "0";
   phiVariance = "0";
   softnessDistance = "0.0001";
   ambientFactor = "0";
   overrideAdvance = "0";
   orientParticles = "0";
   orientOnVelocity = "1";
   particles = "MagCanExplosionParticle";
   lifetimeMS = "1";
   lifetimeVarianceMS = "0";
   
   alignParticles = "0";
   alignDirection = "0 1 0";
   highResOnly = "1";
   
   Dampening = "0.8";
   elasticity = "0.3";
   
};

datablock ParticleData(MagCanShockwaveParticle) {
   dragCoefficient = "0";
   windCoefficient = "0";
   gravityCoefficient = "0";
   inheritedVelFactor = "0";
   constantAcceleration = "0";
   lifetimeMS = "500";
   lifetimeVarianceMS = "100";
   spinSpeed = "1";
   spinRandomMin = "-1000";
   spinRandomMax = "1000";
   useInvAlpha = "0";
   animateTexture = "0";
   framesPerSec = "1";
   textureCoords[0] = "0 0";
   textureCoords[1] = "0 1";
   textureCoords[2] = "1 1";
   textureCoords[3] = "1 0";
   animTexTiling = "0 0";
   textureName = "special/shockLightning02";
   colors[0] = "0.19 0 1 1";
   colors[1] = "0.19 0 1 1";
   colors[2] = "0 0 1 1";
   colors[3] = "0 0 1 1";
   sizes[0] = "0.494415";
   sizes[1] = "0.796557";
   sizes[2] = "0.997986";
   sizes[3] = "1";
   times[0] = "0";
   times[1] = "0.0431373";
   times[2] = "1";
   times[3] = "1";
};

datablock ParticleEmitterData(MagCanShockwaveEmitter) {
   ejectionPeriodMS = "1";
   periodVarianceMS = "0";
   ejectionVelocity = "4.167";
   velocityVariance = "0";
   ejectionOffset = "2.708";
   ejectionOffsetVariance = "0";
   thetaMin = "0";
   thetaMax = "86.25";
   phiReferenceVel = "0";
   phiVariance = "360";
   softnessDistance = "0.0001";
   ambientFactor = "0";
   overrideAdvance = "0";
   orientParticles = "0";
   orientOnVelocity = "1";
   particles = "MagCanShockwaveParticle";
   lifetimeMS = "0";
   lifetimeVarianceMS = "0";
   
   
   blendStyle = "ADDITIVE";
   sortParticles = "1";
   reverseOrder = "0";
   alignParticles = "0";
   alignDirection = "0 1 0";
   highResOnly = "1";
   
   
   
   Dampening = "0.8";
   elasticity = "0.3";
   
   
   
};

datablock ParticleData(MagCanSmokeParticle) {
   dragCoefficient = "2";
   gravityCoefficient = 0.0;
   inheritedVelFactor = "0";
   windCoefficient = "0";
   constantAcceleration = -30;
   lifetimeMS = "650";
   lifetimeVarianceMS = "0";
   spinRandomMin = "-200";
   spinRandomMax = "200";
   useInvAlpha = "0";
   
   colors[0] = "0.204724 0.204724 0.204724 0";
   colors[1] = "0.291339 0.291339 0.291339 0.199213";
   colors[2] = "0.259843 0.259843 0.259843 0.188976";
   colors[3] = "0.0787402 0.0787402 0.0787402 0.015748";
      
   sizes[0] = "10";
   sizes[1] = "10";
   sizes[2] = "10";
   sizes[3] = "10";
   
   times[0] = "0.1";
   times[1] = "0.8";
   times[2] = "0.9";
   times[3] = "1";
   
   spinSpeed = "1";
   textureName = "particleTest";


};

datablock ParticleEmitterData(MagCanSmokeEmitter) {
   ejectionPeriodMS = "5";
   periodVarianceMS = "0";
   ejectionVelocity = "10";
   velocityVariance = "0";
   ejectionOffset = "30";
   thetaMin = "0";
   thetaMax = "180";
   phiReferenceVel = 0;
   phiVariance = 360;
   orientParticles = "0";
   orientOnVelocity = true;
   lifetimeMS = "2040";
   blendStyle = "NORMAL";
   alignDirection = "0 1 0";
      
   particles = "MagCanSmokeParticle";

};

datablock ExplosionData(MagCanExplosion)
{
   explosionShape = "disc_explosion.dts";
   soundProfile   = PlasmaBarrelExpSound;
   faceViewer           = true;

   playSpeed = 1;

   emitter[0] = MagCanExplosionEmitter;
   emitter[1] = MagCanShockwaveEmitter;
   emitter[2] = MagCanSmokeEmitter;
      
   sizes[0] = "1.0 1.0 1.0";
   sizes[1] = "1.0 1.0 1.0";
   times[0] = 0.0;
   times[1] = 1.0;
   shakeCamera = true;
   camShakeFreq = "8.0 9.0 7.0";
   camShakeAmp = "100.0 100.0 100.0";
   camShakeDuration = 1.3;
   camShakeRadius = 25.0;
};

datablock LinearFlareProjectileData(MagCanShot){
   faceViewer          = true;
   directDamage        = 0.0;
   hasDamageRadius     = true;
   indirectDamage      = 0.2;
   damageRadius        = 8.5;
   kickBackStrength    = 0.0;
   radiusDamageType    = $DamageType::Disc;

   explosion           = "MagCanExplosion";
   splash              = PlasmaSplash;

   dryVelocity       = 95.0;
   wetVelocity       = -1;
   velInheritFactor  = 0.8;
   fizzleTimeMS      = 1500;
   lifetimeMS        = 3000;
   explodeOnDeath    = false;
   reflectOnWaterImpactAngle = 0.0;
   explodeOnWaterImpact      = true;
   deflectionOnWaterImpact   = 0.0;
   fizzleUnderwaterMS        = -1;

   activateDelayMS = -1;

   size[0]           = 0.6;
   size[1]           = 0.5;
   size[2]           = 0.4;


   numFlares         = 80;
   flareColor        = "0.2 0.0 1";
   flareModTexture   = "flaremod";
   flareBaseTexture  = "flarebase";
   sound        = ChaingunProjectile;
   
   hasLight    = true;
   lightRadius = 8.0;
   lightColor  = "0.2 0.0 1";
};

datablock ShapeBaseImageData(MagCanImage){
   className = WeaponImage;
   shapeFile = "weapon_grenade_launcher.dts";
   item = MagCan;
   ammo = DarkAmmo;
   offset = "0 0 0";
   emap = true;
   
   projectile = MagCanShot;
   projectileType = LinearFlareProjectile;

   stateName[0] = "Activate";
   stateTransitionOnTimeout[0] = "ActivateReady";
   stateTimeoutValue[0] = 0.5;
   stateSequence[0] = "Activate";
   stateSound[0] = GrenadeSwitchSound;

   stateName[1] = "ActivateReady";
   stateTransitionOnLoaded[1] = "Ready";
   stateTransitionOnNoAmmo[1] = "NoAmmo";

   stateName[2] = "Ready";
   stateTransitionOnNoAmmo[2] = "NoAmmo";
   stateTransitionOnTriggerDown[2] = "Fire";

   stateName[3] = "Fire";
   stateTransitionOnTimeout[3] = "Reload";
   stateTimeoutValue[3] = 1;
   stateFire[3] = true;
   stateRecoil[3] = LightRecoil;
   stateAllowImageChange[3] = false;
   stateSequence[3] = "Fire";
   stateScript[3] = "onFire";
   stateSound[3] = MBLFireSound;

   stateName[4] = "Reload";
   stateTransitionOnNoAmmo[4] = "NoAmmo";
   stateTransitionOnTimeout[4] = "Ready";
   stateTimeoutValue[4] = 0.5;
   stateAllowImageChange[4] = false;
   //stateSequence[4] = "Reload";
   stateSound[4] = GrenadeReloadSound;

   stateName[5] = "NoAmmo";
   stateTransitionOnAmmo[5] = "Reload";
   stateSequence[5] = "NoAmmo";
   stateTransitionOnTriggerDown[5] = "DryFire";

   stateName[6]       = "DryFire";
   stateSound[6]      = GrenadeDryFireSound;
   stateTimeoutValue[6]        = 1.5;
   stateTransitionOnTimeout[6] = "NoAmmo";
};

datablock ShapeBaseImageData(MagCanImage2){
   offset = "0 0.4 0.12";
   rotation = "0 1 0 -180";
   shapeFile = "weapon_targeting.dts";

};

datablock ShapeBaseImageData(MagCanImage3){
   offset = "0 0.4 0.15";
   rotation = "0 1 0 0";
   shapeFile = "weapon_targeting.dts";
};

function MagCanImage::onMount(%this,%obj,%slot){
   Parent::onMount(%this, %obj, %slot);
   commandToClient( %obj.client, 'BottomPrint', %this.item.wepNameID SPC %this.item.wepName NL %this.item.description, 4, 3);
   %obj.mountImage(MagCanImage2, 4);
   %obj.mountImage(MagCanImage3, 5);
   %obj.client.setWeaponsHudActive("Blaster");
}

function MagCanImage::onUnmount(%this,%obj,%slot){
   Parent::onUnmount(%this, %obj, %slot);
   %obj.unmountImage(4);
   %obj.unmountImage(5);
   %obj.client.setWeaponsHudActive("Blaster", 1);
}

function MagCanShot::onExplode(%data, %proj, %pos, %mod){
   emMag(%pos, 2000);
}

function emMag(%pos,%time){
  %force = 800;
   InitContainerRadiusSearch(%pos,  30, $TypeMasks::PlayerObjectType); 
   while ((%targetObject = containerSearchNext()) != 0){
      %tgtPos = %targetObject.getWorldBoxCenter();
      %vec = VectorNormalize(VectorSub(%pos, %tgtPos));
      %impulseVec = VectorScale(%vec, %force);
      %targetObject.applyImpulse(%pos, %impulseVec);
    } 
    if(%time > 0){
       %time -= 100;
      schedule(128,0,"emMag",%pos,%time);
    }
}



///////////////////////////////////////////////////////////////////////////////////////////////////////////
/////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////

datablock ItemData(DarkWeaponX){
   className = Weapon;
   catagory = "Spawn Items";
   shapeFile = "weapon_grenade_launcher.dts";
   image = DarkWeaponXImage;
   mass = 1;
   elasticity = 0.2;
   friction = 0.6;
   pickupRadius = 2;
	pickUpName = "a dark weapon";

   isEX = true; 
	
	wepClass = "EX";
   wepNameID = "????";
   wepName = "Dark Weapon";
   light = 0;
   medium = 0;
   heavy = 0;
   description = "A weapon of ultimate destruction, the consequences of its deployment are unknown and potentially catastrophic";
};

datablock AudioProfile(DarkWeaponXSwitchSound){
   filename    = "fx/vehicles/bomber_bomb_dryfire.wav";
   description = AudioClosest3d;
   preload = true;
};

datablock ParticleData( DarkWeaponXCrescentParticle ){
   dragCoefficient      = 2;
   gravityCoefficient   = 0.0;
   inheritedVelFactor   = 0.2;
   constantAcceleration = -0.0;
   lifetimeMS           = 1000;
   lifetimeVarianceMS   = 000;
   textureName          = "special/crescent3";
   colors[0]     = "0.9 0.4 0.0 1.0";
   colors[1]     = "0.9 0.4 0.0 1.0";
   colors[2]     = "0.9 0.4 0.0 0.0";
   sizes[0]      = 0.5;
   sizes[1]      = 1.0;
   sizes[2]      = 1.6;
   times[0]      = 0.0;
   times[1]      = 0.5;
   times[2]      = 1.0;
};

datablock ParticleEmitterData( DarkWeaponXCrescentEmitter ){
   ejectionPeriodMS = 15;
   periodVarianceMS = 0;
   ejectionVelocity = 60;
   velocityVariance = 5.0;
   ejectionOffset   = 0.0;
   thetaMin         = 0;
   thetaMax         = 80;
   phiReferenceVel  = 0;
   phiVariance      = 360;
   overrideAdvances = false;
   orientParticles  = true;
   lifetimeMS       = 200;
   particles = "DarkWeaponXCrescentParticle";
};

datablock ParticleData(DXParticle){
   dragCoefficient      = 0.0;
   gravityCoefficient   = 0.0;
   inheritedVelFactor   = 0.0;
   constantAcceleration = -3.5;
   lifetimeMS           = 6000;
   lifetimeVarianceMS   = 500;
   useInvAlpha          =  0;
   textureName          = "special/bigSpark";
   colors[0]     = 2/255 SPC 68/255 SPC 252/255  SPC 1;
   colors[1]     = 2/255 SPC 68/255 SPC 252/255  SPC 1;
   sizes[0]      = 0.5;
   sizes[1]      = 9;
};

datablock ParticleEmitterData(DarkXEmitter){
   ejectionPeriodMS = 1;
   periodVarianceMS = 0;
   ejectionVelocity = 10;
   velocityVariance = 1.0;
   ejectionOffset   = 0.0;
   thetaMin         = 0;
   thetaMax         = 90;
   lifetimeMS       = 9000;
   phiReferenceVel  = 0;
   phiVariance      = 360;
   orientParticles  = true;
   overrideAdvances = false;
   particles = "DXParticle";
};

datablock ParticleData(DX2Particle){
   dragCoefficient      = 0.0;
   gravityCoefficient   = 0.0;
   inheritedVelFactor   = 0.0;
   constantAcceleration = -3.5;
   lifetimeMS           = 6000;
   lifetimeVarianceMS   = 500;
   useInvAlpha          =  0;
   textureName          = "special/bigSpark";
   colors[0]     = 249/255 SPC 147/255 SPC 0  SPC 1;
   colors[1]     = 249/255 SPC 147/255 SPC 0  SPC 1;
   sizes[0]      = 0.5;
   sizes[1]      = 9;
};

datablock ParticleEmitterData(DarkX2Emitter){
   ejectionPeriodMS = 1;
   periodVarianceMS = 0;
   ejectionVelocity = 10;
   velocityVariance = 1.0;
   ejectionOffset   = 0.0;
   thetaMin         = 0;
   thetaMax         = 90;
   lifetimeMS       = 9000;
   phiReferenceVel  = 0;
   phiVariance      = 360;
   orientParticles  = true;
   overrideAdvances = false;
   particles = "DX2Particle";
};

datablock ParticleData(BlastExplosionParticleS) {
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
   textureName = "particleTest";
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

datablock ParticleEmitterData(BlastExplosionEmitterS) {
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
   particles = "BlastExplosionParticleS";
   lifetimeMS = "150";
   lifetimeVarianceMS = "0";  
};

datablock ExplosionData(DarkWeaponXSubExplosion){
   explosionShape = "effect_plasma_explosion.dts";
   soundProfile   = BombExplosionSound;
   faceViewer           = true;
   particleEmitter = DarkX2Emitter;
   particleDensity = 5000;
   particleRadius = 50;
   faceViewer = true;
   offset = 0.0;
   playSpeed = 1.0;
   //explosionScale = "10.8 10.8 10.8";

   sizes[0] = "52.0 52.0 52.0";
   sizes[1] = "2.0 2.0 2.0";
   times[0] = 0.0;
   times[1] = 1.0;
   shakeCamera = true;
   camShakeFreq = "10.0 6.0 9.0";
   camShakeAmp = "20.0 20.0 20.0";
   camShakeDuration = 0.5;
   camShakeRadius = 20.0;
};

datablock ExplosionData(DarkWeaponXExplosion){
   explosionShape = "effect_plasma_explosion.dts";
   soundProfile   = BombExplosionSound;
   faceViewer           = true;
   subExplosion[0] = DarkWeaponXSubExplosion;

   particleEmitter = DarkXEmitter;
   particleDensity = 10000;
   particleRadius = 100;
   faceViewer = true;
   offset = 0.0;
   playSpeed = 2.0;
   
   emitter[0]  = BlastExplosionEmitterS;
   emitter[1]  = BlastExplosionEmitterS;
   emitter[2]  = BlastExplosionEmitterS;
   emitter[3]  = BlastExplosionEmitterS;
   
   sizes[0] = "52.0 52.0 52.0";
   sizes[1] = "2.0 2.0 2.0";
   times[0] = 0.0;
   times[1] = 1.0;
   shakeCamera = true;
   camShakeFreq = "10.0 6.0 9.0";
   camShakeAmp = "20.0 20.0 20.0";
   camShakeDuration = 2;
   camShakeRadius = 600.0;
};

datablock LinearFlareProjectileData(DCShot){
   projectileShapeName = "plasmabolt.dts";
   scale               = "4.3 4.3 4.3";
   faceViewer          = true;
   directDamage        = 0.0;
   hasDamageRadius     = true;
   indirectDamage      = 0.25;
   damageRadius        = 15.9;
   kickBackStrength    = 3000.0;
   radiusDamageType    = $DamageType::Dark;
   Impulse = true;
   explosion           = "DarkWeaponXExplosion";
   underwaterExplosion = "UnderwaterMortarExplosion";
   splash              = PlasmaSplash;

   dryVelocity       = 1;
   wetVelocity       = 1;
   velInheritFactor  = 0.3;
   fizzleTimeMS      = 0;
   lifetimeMS        = 1000;
   explodeOnDeath    = true;
   reflectOnWaterImpactAngle = 0.0;
   explodeOnWaterImpact      = false;
   deflectionOnWaterImpact   = 0.0;
   fizzleUnderwaterMS        = -1;

   //activateDelayMS = 100;
   activateDelayMS = -1;


   size[0]           = 0.2;
   size[1]           = 0.5;
   size[2]           = 50.1;


   numFlares         = 150;
   flareColor        = "1 0 1";
   flareModTexture   = "flaremod";
   flareBaseTexture  = "flarebase";

   hasLight    = true;
   lightRadius = 3.0;
   lightColor  = "0 0.3 1";
   ignoreExEffects = 1;
};

datablock ShapeBaseImageData(DarkWeaponXImage){
   className = WeaponImage;
   shapeFile = "weapon_grenade_launcher.dts";
   item = DarkWeaponX;
   ammo = DarkAmmo;
   offset = "0 0 0";
   
   projectile = DCShot;
   projectileType = LinearFlareProjectile;

   stateName[0] = "Activate";
   stateTransitionOnTimeout[0] = "ActivateReady";
   stateTimeoutValue[0] = 0.5;
   stateSequence[0] = "Activate";
   stateSound[0] = BomberBombDryFireSound;

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
   //stateSequence[3] = "Fire";
   stateEmitterTime[3] = 0.2;
   stateSound[3] = BomberBombReloadSound;

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

datablock ShapeBaseImageData(DarkWeaponX3Image){
   offset = "-0.005 0.95 0.13";
   rotation = "0 1 0 180";
   shapeFile = "pack_upgrade_energy.dts";
    emap = true;
};

datablock ShapeBaseImageData(DarkWeaponX4Image){
   offset = "-0.005 1.05 0.13";
   rotation = "0 1 0 180";
   shapeFile = "pack_upgrade_energy.dts";
};

datablock ShapeBaseImageData(DarkWeaponX2Image){
   offset = "-0.005 1.15 0.13";
   rotation = "0 1 0 180";
   shapeFile = "pack_upgrade_energy.dts";
    emap = true;
};

datablock ShapeBaseImageData(DarkWeaponX5Image){
   offset = "-0.005 1.25 0.13";
   rotation = "0 1 0 180";
   shapeFile = "pack_upgrade_energy.dts";
};

function DarkWeaponXImage::onMount(%this,%obj,%slot){
   Parent::onMount(%this, %obj, %slot);
   %obj.mountImage(DarkWeaponX2Image, 4);
   %obj.mountImage(DarkWeaponX3Image, 5);
   %obj.mountImage(DarkWeaponX4Image, 6);
   %obj.mountImage(DarkWeaponX5Image, 7);
   commandToClient( %obj.client, 'BottomPrint', "The Dark Weapon", 2, 3);
   %obj.client.setWeaponsHudActive("Blaster");
}

function DarkWeaponXImage::onUnmount(%this,%obj,%slot){
   Parent::onUnmount(%this, %obj, %slot);
   %obj.unmountImage(4);
   %obj.unmountImage(5);
   %obj.unmountImage(6);
   %obj.unmountImage(7);
   %obj.client.setWeaponsHudActive("Blaster", 1);
}


function DarkWeaponXImage::onFire(%data, %obj, %slot){
   if(!isObject($darkWeaponClient)){
      StartScriptObj.delete();
      aEffect.delete();
      messageAll('MsgClient', "\c2WARNING - The World Ender Has Been Fired!~wfx/misc/red_alert.wav");
      CancelCountdown();
      CancelEndCountdown();
      cancel(Game.timeCheck);
      cbase.team = 0;
      %obj.decInventory(%data.ammo, 1);
      %p = new (%data.projectileType)() {
         dataBlock        = %data.projectile;
         initialDirection = "0 0 -1";
         initialPosition  = "-4.41736 -3.32352 350";
         sourceObject     = %obj;
         sourceSlot       = %slot;
      };
      MissionCleanup.add(%p);
      for(%i = 0; %i < ClientGroup.getCount(); %i++){
         %tobj = ClientGroup.getObject(%i).getControlObject();
         %tobj.schedule(10,"setWhiteout", 0.8); 
      }
      %obj.schedule(1500,"setPosition", "-4.41736 -3.32352 350"); 
      schedule(1500, 0, "endStart"); 
      $darkWeaponClient = %obj.client;
      $darkWeaponTeam = %obj.client.team;
      %obj.theEnd = 1;
   }
}

datablock EnergyProjectileData(DKEnergyBolt){
   emitterDelay        = -1;
   // z0dd - ZOD, 5/07/04. Less damage shotgun blaster is gameplay changes in affect
   directDamage        = 0.0;
   hasDamageRadius     = true;
   indirectDamage      = 2;
   damageRadius        = 10;
   kickBackStrength    = 8000.0;
   radiusDamageType    = $DamageType::Dark;
   // z0dd - ZOD, 5/07/04. Shotgun blaster no sound when gameplay changes in affect
   sound = HAPCFlyerThrustSound;
   velInheritFactor    = 0.5;

   explosion           = "SatchelMainExplosion";
   underwaterExplosion = "UnderwaterSatchelMainExplosion";
   splash              = BlasterSplash;


   grenadeElasticity = 0.998;
   grenadeFriction   = 0.0;
   armingDelayMS     = 12000;

   muzzleVelocity    = 90.0;

   drag = 0.05;

   gravityMod        = 1.0;

   dryVelocity       = 200.0;
   wetVelocity       = 150.0;

   reflectOnWaterImpactAngle = 0.0;
   explodeOnWaterImpact      = false;
   deflectionOnWaterImpact   = 0.0;
   fizzleUnderwaterMS        = 3000;

   hasLight    = true;
   lightRadius = 15.0;
   lightColor  = "1 0.3 0";

   scale = "0.25 20.0 1.0";
   crossViewAng = 0.99;
   crossSize = 0.55;

   lifetimeMS     = 30000;
   blurLifetime   = 1;
   blurWidth      = 0.25;
   blurColor = "1 0.5 0.0 1.0";

   texture[0] = "special/blasterBolt";
   texture[1] = "special/blasterBoltCross";
   ignoreExEffects = 1;
};

function DCShot::onExplode(%data, %proj, %pos, %mod){
   %obj =  %proj.sourceObject;
   %count = 256;
   for(%i = 0; %i < %count; %i++){
      %cycPos = tube(15, %count, %pos, vectorAdd(%pos,"0 0 1"), %i);//getRandom(0,15)
      %vec = vectorNormalize(vectorSub(%cycPos, %pos));
      %p = new EnergyProjectile(){
         dataBlock = DKEnergyBolt;
         initialDirection = %vec;
         initialPosition  = %pos;
         sourceObject = %obj;
         sourceSlot = 0;
      };
      MissionCleanup.add(%p);
   } 
   parent::onExplode(%data, %proj, %pos, %mod);
}

////////////////////////////////////////////////////////////////////////////////

datablock ShockwaveData( ENukeShockwave){
   width = 30;
   numSegments = 32;
   numVertSegments = 7;
   velocity = 100;
   acceleration = 1000.0;
   lifetimeMS = 2000;
   height = 800;
   verticalCurve = 0.375;

   mapToTerrain = true;
   renderBottom = true;
   orientToNormal = false;

   texture[0] = "special/shockwave4";
   texture[1] = "special/gradient";
   texWrap = 6.0;

   times[0] = 0.0;
   times[1] = 0.5;
   times[2] = 1.0;

   colors[0] = "0.8 0.8 1.0 1.00";
   colors[1] = "0.8 0.5 1.0 0.20";
   colors[2] = "0.2 0.8 1.0 0.0";
};

datablock ExplosionData(ENukeExplosion){
   explosionShape = "effect_plasma_explosion.dts";
   faceViewer           = true;

   delayMS = 200;

   offset = 5.0;

   playSpeed = 1.5;

   sizes[0] = "6.0 6.0 6.0";
   sizes[1] = "6.0 6.0 6.0";
   times[0] = 0.0;
   times[1] = 1.0;

   shockwave      = ENukeShockwave;

   shakeCamera = true;
   camShakeFreq = "10.0 6.0 9.0";
   camShakeAmp = "20.0 20.0 20.0";
   camShakeDuration = 1;
   camShakeRadius = 150.0;
};

datablock LinearFlareProjectileData(EnukeProj){
   projectileShapeName = "plasmabolt.dts";
   scale               = "1 1 1";
   faceViewer          = true;
   directDamage        = 0;
   hasDamageRadius     = true;
   indirectDamage      = 1;
   damageRadius        = 7.7;
   kickBackStrength    = 0;
   radiusDamageType    = $DamageType::Dark;

   explosion = ENukeExplosion;
   splash              = PlasmaSplash;

   dryVelocity       = 0.1;
   wetVelocity       = -1;
   velInheritFactor  = 0.3;
   fizzleTimeMS      = 0;
   lifetimeMS        = 256;
   explodeOnDeath    = true;
   reflectOnWaterImpactAngle = 0;
   explodeOnWaterImpact      = true;
   deflectionOnWaterImpact   = 0;
   fizzleUnderwaterMS        = -1;

   //activateDelayMS = 100;
   activateDelayMS = -1;

   size[0]           = 0.9;
   size[1]           = 1;
   size[2]           = 0.8;


   numFlares         = 80;
   flareColor        = "0 1 0";
   flareModTexture   = "flaremod";
   flareBaseTexture  = "flarebase";

   hasLight    = true;
   lightRadius = 5;
   lightColor  = "0 1 0";
};

datablock ParticleData(ECG){
    dragCoefficient = 1.0;
    gravityCoefficient = 0;
    windCoefficient = 0;
    inheritedVelFactor = 0;
    constantAcceleration = 0;
    lifetimeMS = 12000;
    lifetimeVarianceMS = 1000;
    useInvAlpha = 0;
    spinRandomMin = -90;
    spinRandomMax = 500;
    textureName = "special/lightning2frame2";
    times[0] = 0;
    times[1] = 0.5;
    times[2] = 1;
    colors[0] = "0.0 0.3 1.0 1.0";
    colors[1] = "0.0 0.3 1.0 1.0";
    colors[2] = "0.0 0.3 1.0 1.0";
    sizes[0] = 30;
    sizes[1] = 30;
    sizes[2] = 30;
};

datablock ParticleEmitterData(ECGEmitter){
   ejectionPeriodMS = 1;
    periodVarianceMS = 0;
    ejectionVelocity = 350;
    velocityVariance = 0;
    ejectionOffset =   0;
    thetaMin = 90;
    thetaMax = 91;
    phiReferenceVel = 0;
    phiVariance = 360;
    overrideAdvances = 0;
    lifeTimeMS = 30000;
    orientParticles= 1;
    orientOnVelocity = 0;

   particles = "ECG";
};

datablock ParticleData(IonRing){
   dragCoefficient      = 1;
   gravityCoefficient   = 0.0;
   inheritedVelFactor   = 0.0;
   constantAcceleration = 0.0;
   lifetimeMS           = 15000;
   lifetimeVarianceMS   = 350;
   textureName          = "special/bigspark";
   colors[0]     = "0.9 0.3 0.0 1.0";
   colors[1]     = "0.9 0.3 0.0 1.0";
   colors[2]     = "0.9 0.3 0.0 1.0";
   sizes[0]      = 5.0;
   sizes[1]      = 5.0;
   sizes[2]      = 5.0;
   times[0]      = 0.0;
   times[1]      = 0.5;
   times[2]      = 1.0;

};

datablock ParticleEmitterData(IonRingEmitter){
   ejectionPeriodMS = 1;
   periodVarianceMS = 0;
   ejectionVelocity = 50;
   velocityVariance = 0;
   ejectionOffset   = 0.0;
   thetaMin         = 60;
   thetaMax         = 60;
   phiReferenceVel  = 0;
   phiVariance      = 360;
   overrideAdvances = false;
   orientParticles  = true;
   lifetimeMS       = 15000;
   particles = "IonRing";
};

datablock ExplosionData(ECGExplosion){
   explosionShape = "effect_plasma_explosion.dts";
   soundProfile   = BombExplosionSound;

   faceViewer           = true;
   explosionScale = "10.8 10.8 10.8";

   emitter[0] = ECGEmitter;
   emitter[1] = IonRingEmitter;

   shakeCamera = true;
   camShakeFreq = "10.0 6.0 9.0";
   camShakeAmp = "20.0 20.0 20.0";
   camShakeDuration = 0.5;
   camShakeRadius = 20.0;
};

datablock LinearFlareProjectileData(ECGFlashBolt){
   //projectileShapeName = "disc_explosion.dts";
   scale               = "1.0 1.0 1.0";
   faceViewer          = true;
   directDamage        = 0.0;
   hasDamageRadius     = true;
   indirectDamage      = 1.0;
   damageRadius        = 7.7;
   kickBackStrength    = 0.0;
   radiusDamageType    = $DamageType::Dark;

   explosion           = "ECGExplosion";
   splash              = PlasmaSplash;

   dryVelocity       = 0.1;
   wetVelocity       = -1;
   velInheritFactor  = 0.3;
   fizzleTimeMS      = 0000;
   lifetimeMS        = 1000;
   explodeOnDeath    = true;
   reflectOnWaterImpactAngle = 0.0;
   explodeOnWaterImpact      = true;
   deflectionOnWaterImpact   = 0.0;
   fizzleUnderwaterMS        = -1;

   //activateDelayMS = 100;
   activateDelayMS = -1;

   size[0]           = 0.9;
   size[1]           = 1.0;
   size[2]           = 0.8;


   numFlares         = 80;
   flareColor        = "0.0 1.0 0.0";
   flareModTexture   = "flaremod";
   flareBaseTexture  = "flarebase";

   hasLight    = true;
   lightRadius = 5.0;
   lightColor  = "0 1.0 0";
};


function pointToPosx(%posOne, %posTwo){
   %vec = VectorSub(%posTwo, %posOne);
   // pull the values out of the vector
   
   %x = getWord(%vec, 0);
   %y = getWord(%vec, 1);
   %z = getWord(%vec, 2);
 
   //this finds the distance from origin to our point
  // %xylen =  vectorDist(getWords(%posOne,0,1) SPC 0, getWords(%posTwo,0,1) SPC 0);
   %len = vectorLen(%vec);
   
   //---------X-----------------
   //given the rise and length of our vector this will give us the angle in radians
   %rotAngleX = mATan( %z, %len );
   
   //---------Z-----------------
   //get the angle for the z axis
   %rotAngleZ = mATan( %x, %y );
 
   //create 2 matrices, one for the z rotation, the other for the x rotation
   %matrix = MatrixCreateFromEuler("0 0" SPC %rotAngleZ * -1);
   %matrix2 = MatrixCreateFromEuler(%rotAngleX SPC "0 0");
 
   //now multiply them together so we end up with the rotation we want
   %finalMat = MatrixMultiply(%matrix, %matrix2);
 
   //we're done, send the proper numbers back
   return getWords(%finalMat, 3, 6);
}


function newboom(){
   
   %part = new ParticleEmissionDummy() {
      position =  "100 4096 102";
      rotation = "1 0 0 0";
      scale = "1 1 1";
      dataBlock = tripTimeEmissionDummy;
      emitter = "BlastExplosionEmitterS";
      velocity = "1";
   };  
   MissionCleanup.add(%part);
   %part.schedule(10000, "delete");
   %part.setScopeAlways();
   %part = new ParticleEmissionDummy() {
      position = "100 4096 102";
      rotation = "1 0 0 0";
      scale = "1 1 1";
      dataBlock = defaultEmissionDummy;
      emitter = "BlastShockwaveEmitter";
      velocity = "1";
   }; 
   MissionCleanup.add(%part);
   %part.schedule(10000, "delete");
   %part.setScopeAlways();
       %p = new LinearFlareProjectile() {
         dataBlock        = explTwo;
         initialDirection ="0 0 -1";
         initialPosition  = "100 4096 102";
         sourceObject     = -1;
         sourceSlot       = 0;
         vehicleObject    = 0;
      };  
      MissionCleanup.add(%p);
   %p.setScopeAlways();
   %p = new LinearFlareProjectile() {
         dataBlock        = explOne;
         initialDirection ="0 0 -1";
         initialPosition  = "100 4096 102";
         sourceObject     = -1; 
         sourceSlot       = 0;
         vehicleObject    = 0;
      };  
   MissionCleanup.add(%p);
   %p.setScopeAlways();
   for(%i = 0; %i < 128; %i++){
      %x = (getRandom() - 0.5) * 2 * 3.1415926 * 0.15;
      %y = (getRandom() - 0.5) * 2 * 3.1415926 * 0.15;
      %z = (getRandom() - 0.5) * 2 * 3.1415926 * 0.15;
      %mat = MatrixCreateFromEuler(%x SPC %y SPC %z);
      %vector = MatrixMulVector(%mat,  "0 0 1");
      %p = new GrenadeProjectile() {
            dataBlock        = blastExplosionProj;
            initialDirection = %vector;
            initialPosition  = "100 4096 102";//vectorAdd(%position,"0 0 100");
            sourceObject     = -1; 
            sourceSlot       = 0;
            vehicleObject    = 0;
         };
      MissionCleanup.add(%p);
      //%p.setScopeAlways();
   }  
}

function aGameOver(){
    $TeamScore[$darkWeaponTeam] += $Anomaly::darkWeaponBonus;
   messageAll('MsgTeamScoreIs', "", $darkWeaponTeam, $TeamScore[$darkWeaponTeam]);
   messageAll('message', '\c2%1 used the Dark Weapon to end game, %3 Bonus points for team %2.~wfx/misc/MA3.wav', $darkWeaponClient.name, $darkWeaponTeam, $Anomaly::darkWeaponBonus);
   
   Game.gameOver();
   cycleMissions();
   $darkWeaponClient = 0;
   $darkWeaponTeam = 0; 
}
 


function randomBoom(%position){
   %p = new LinearFlareProjectile() {
         dataBlock        = explOne;
         initialDirection = "0 0 1";
         initialPosition  = %position;
         sourceObject     = -1; 
         sourceSlot       = 0;
         vehicleObject    = 0;
      };  
   MissionCleanup.add(%p);
   schedule(500,0,"delayEXBoom",%position);
   schedule(500,0,"partEXboom",%position,%vec);
}

function delayEXBoom(%position){
    %p = new LinearFlareProjectile() {
         dataBlock        = explTwo;
         initialDirection = "0 0 1";
         initialPosition  = %position;
         sourceObject     = -1;
         sourceSlot       = 0;
         vehicleObject    = 0;
      };  
}
function partEXboom(%position,%vec){
   %part = new ParticleEmissionDummy() {
      position =  %position;
      rotation = "1 0 0 0";
      scale = "1 1 1";
      dataBlock = tripTimeEmissionDummy;
      emitter = "BlastExplosionEmitterS";
      velocity = "1";
   };  
   MissionCleanup.add(%part);
   %part.schedule(10000, "delete");
   %part = new ParticleEmissionDummy() {
      position = %position;
      rotation = "1 0 0 0";
      scale = "1 1 1";
      dataBlock = defaultEmissionDummy;
      emitter = "BlastShockwaveEmitter";
      velocity = "1";
   }; 
   MissionCleanup.add(%part);
   %part.schedule(10000, "delete");
}

function testCubeStack(%pos){
      for(%i = 0; %i < 6; %i++){
      %p = new LinearFlareProjectile() {
         dataBlock        = CubeProj;
         initialDirection = "0 0 1";
         initialPosition  =  vectorAdd(%pos,"0 0" SPC %i * 100);
         sourceObject     = -1;
         sourceSlot       = 0;
         vehicleObject    = 0;
      };
      MissionCleanup.add(%p); 
   }   
}

function testStack(%pos){
   for(%i = 0; %i < 10; %i++){
      %p = new LinearFlareProjectile() {
         dataBlock        = ECGFlashBolt;
         initialDirection = "0 0 1";
         initialPosition  =  vectorAdd(%pos,"0 0" SPC %i * 40);
         sourceObject     = -1;
         sourceSlot       = 0;
         vehicleObject    = 0;
      };
      MissionCleanup.add(%p); 
   }   
}

function testWave(%pos){
   for(%i = 0; %i < 10; %i++){
      %p = new LinearFlareProjectile() {
         dataBlock        = EnukeProj;
         initialDirection = "0 0 1";
         initialPosition  =  %pos;
         sourceObject     = -1;
         sourceSlot       = 0;
         vehicleObject    = 0;
      };
      MissionCleanup.add(%p); 
   }
   for(%i = 0; %i < ClientGroup.getCount(); %i++){
      %cobj = ClientGroup.getObject(%i).getControlObject();
      %cobj.schedule(256,"setWhiteout", 0.8); 
   }   
   %time = 500;
   schedule(32+%time, 0, "ServerPlay2D", FusionExpSound);
   //schedule(64+%time, 0, "ServerPlay2D", FusionExpSound);
   schedule(224+%time, 0, "ServerPlay2D", FusionExpSound);
   //schedule(364+%time, 0, "ServerPlay2D", FusionExpSound);
}

function endStart(){
   %fireball = new FireballAtmosphere()
   {
      position = "0 0 250";
      rotation = "1 0 0 0"; 
      scale = "1 1 1";
      dataBlock = "fireball";
      lockCount = "1";
      homingCount = "1";
      dropRadius = 100;
      dropsPerMinute = 480;
      minDropAngle = "0";
      maxDropAngle = "50";
      startVelocity = "300";
      dropHeight = "2000";
      dropDir = "0.212 0.212 -0.953998";
   };
   MissionCleanup.add(%fireball);
   %pos = "4.41736 -3.32352 350";
   
   %lig = new Lightning() {
		position = %pos;
		rotation = "1 0 0 0";
		scale =  "2 2 800";
		dataBlock = "DefaultStorm";
		strikesPerMinute = 240;
		strikeWidth = "4";
		chanceToHitTarget = "0";
		strikeRadius = "1";
		boltStartRadius = "800";
		color = "1.0 1.0 1.0 1.0";
		fadeColor = "0.3 0.3 1.0 1.0";
		useFog = "1";
	};
	MissionCleanup.add(%lig);
   %lig.schedule(10000,"delete");
   %fireball.schedule(10000,"delete");
   schedule(1000+10000, 0, "testCubeStack", %pos); 
   schedule(5000+10000, 0, "testStack", %pos);
   schedule(14000+10000, 0, "testWave", %pos);
   schedule(14000+10000, 0, "randomBoom", %pos);
   for(%x = -2; %x < 2; %x++){
      for(%y = -2; %y < 2; %y++){
         schedule(15000+10000, 0, "randomBoom", vectorAdd(%pos, 256 * %x SPC 256 * %y SPC 0)); 
      }
   }
   schedule(16000+10000, 0, "aGameOver");
   schedule(16000+10000, 0, "newboom");
}

datablock ParticleData(CubeExplosionParticle){
   dragCoefficient      = 0.0;
   gravityCoefficient   = 0.0;
   inheritedVelFactor   = 0.0;
   constantAcceleration = -3.5;
   lifetimeMS           = 6000;
   lifetimeVarianceMS   = 500;
   useInvAlpha          =  0;
   textureName          = "special/bluespark";
   colors[0]     = "0.0 1.0 1.0 1.0";
   colors[1]     = "1.0 0.5 0.0 1.0";
   sizes[0]      = 0.5;
   sizes[1]      = 9;
};

datablock ParticleEmitterData(CubeExplosionEmitter){
   ejectionPeriodMS = 1;
   periodVarianceMS = 0;
   ejectionVelocity = 10;
   velocityVariance = 1.0;
   ejectionOffset   = 0.0;
   thetaMin         = 0;
   thetaMax         = 90;
   lifetimeMS       = 9000;
   phiReferenceVel  = 0;
   phiVariance      = 360;
   orientParticles  = true;
   overrideAdvances = false;
   particles = "CubeExplosionParticle";
};

datablock ExplosionData(CubeExplosion){
   explosionShape = "effect_plasma_explosion.dts";
  // soundProfile   = EnukeExpSound;
   particleEmitter = CubeExplosionEmitter;
   particleDensity = 6250;
   particleRadius = 100;
   faceViewer = true;
   
   colors[0] = "0.0 0.0 1.0 0.0";
   colors[1] = "0.0 0.0 1.0 1.0";
   times[0] = 0.0;
   times[1] = 0.4;
   sizes[0] = "1.0 1.0 1.0";
   sizes[1] = "1.0 1.0 1.0";
};

datablock LinearFlareProjectileData(CubeProj){
   projectileShapeName = "plasmabolt.dts";
   scale               = "1 1 1";
   faceViewer          = true;
   directDamage        = 0.30;
   hasDamageRadius     = false;
   indirectDamage      = 0;
   damageRadius        = 0;
   kickBackStrength    = 300.0;
   directDamageType    = $DamageType::Explosion;
   radiusDamageType    = $DamageType::Explosion;
   Impulse = true;
   explosion           = "CubeExplosion";

   dryVelocity       = 0.1;
   wetVelocity       = -1;
   velInheritFactor  = 0.3;
   fizzleTimeMS      = 0;
   lifetimeMS        = 128;
   explodeOnDeath    = true;
   reflectOnWaterImpactAngle = 0.0;
   explodeOnWaterImpact      = true;
   deflectionOnWaterImpact   = 0.0;
   fizzleUnderwaterMS        = -1;

   activateDelayMS = -1;

   size[0]           = 0.2;
   size[1]           = 0.5;
   size[2]           = 0.1;


   numFlares         = 10;
   flareColor        = "0 1 0";
   flareModTexture   = "flaremod";
   flareBaseTexture  = "flarebase";

   hasLight    = true;
   lightRadius = 3.0;
   lightColor  = "0 1 0";
};

datablock ParticleEmissionDummyData(tripTimeEmissionDummy){
   timeMultiple = 10.0;
};

datablock ParticleData(BlastShockwaveParticle) {
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
   textureName = "particleTest";
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

datablock ParticleEmitterData(BlastShockwaveEmitter) {
   ejectionPeriodMS = "1";
   periodVarianceMS = "0";
   ejectionVelocity = "600";
   velocityVariance = "0";
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
   particles = "BlastShockwaveParticle";
   lifetimeMS = "2000";
   lifetimeVarianceMS = "0";
   
   
};


datablock ExplosionData(BlastSmokeStack){
   lifeTimeMS = 15000;
   offset = 0;
   shakeCamera = true;
   camShakeFreq = "8.0 8.0 8.0";
   camShakeAmp = "5.0 5.0 5.0";
   camShakeDuration = 5;
   camShakeRadius = 2500.0;
   
};

datablock LinearFlareProjectileData(explTwo){
   //projectileShapeName = "disc_explosion.dts";
   scale               = "1.0 1.0 1.0";
   faceViewer          = true;
   directDamage        = 0.0;
   hasDamageRadius     = true;
   indirectDamage      = 1.0;
   damageRadius        = 7.7;
   kickBackStrength    = 0.0;
   radiusDamageType    = $DamageType::Explosion;

   explosion           = "BlastSmokeStack";

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

datablock ParticleData(BlastExplosionParticle) {
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
   textureName = "particleTest";
   colors[0] = "0.992 0.996 0.996 1";
   colors[1] = "0.992 0.992 0.996 1";
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

datablock ParticleEmitterData(BlastExplosionEmitter) {
   ejectionPeriodMS = "1";
   periodVarianceMS = "0";
   ejectionVelocity = "655.35";
   velocityVariance = "0";
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
   particles = "BlastExplosionParticle";
   lifetimeMS = "1000";
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

datablock ParticleData(BlastRingParticle) {
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
   textureName = "particleTest";
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

datablock ParticleEmitterData(BlastRingEmitter) {
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
   particles = "BlastRingParticle";
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

datablock ParticleData(BlastExplosionParticle2) {
   dragCoefficient = "1.2";
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
   animTexName = "particleTest";
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
   times[2] = "0.6875";
   times[3] = "1";
};

datablock ParticleEmitterData(BlastExplosionEmitter2) {
   ejectionPeriodMS = "1";
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
   particles = "BlastExplosionParticle2";
   lifetimeMS = "1000";
   lifetimeVarianceMS = "0";
   
};

datablock ParticleData(BlastFireParticle) {
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
   textureName = "particleTest";
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

datablock ParticleEmitterData(BlastFireEmitter) {
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
   particles = "BlastFireParticle";
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

datablock ParticleData(BlastFireParticle2) {
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
   textureName = "particleTest";
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

datablock ParticleEmitterData(BlastFireEmitter2) {
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
   particles = "BlastFireParticle2";
   lifetimeMS = "0";
   lifetimeVarianceMS = "0";  
};

datablock GrenadeProjectileData(blastExplosionProj)
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

   baseEmitter         = BlastFireEmitter2;
   delayEmitter        = BlastFireEmitter;
   emitterDelay = 32;
   bubbleEmitter       = MortarBubbleEmitter;

   grenadeElasticity = 0.30; 
   grenadeFriction   = 0.2;
   armingDelayMS     = 250;
   muzzleVelocity    = 200.00;
   gravityMod        = 3.9; 
};

datablock ExplosionData(BlastExplosion)
{
   
   emitter[0] = BlastExplosionEmitter;
   emitter[1] = BlastExplosionEmitter2;
   emitter[2] = BlastRingEmitter;
   
   lifeTimeMS = 6000;
   
   shakeCamera = true;
   camShakeFreq = "8.0 8.0 8.0";
   camShakeAmp = "1.0 1.0 1.0";
   camShakeDuration = 5;
   camShakeRadius = 2500.0;
   
   //debris = blastCannonDebris;
   //debrisThetaMin = 20;
   //debrisThetaMax = 90;
   //debrisNum = 150;
   //debrisNumVariance = "3";
   //debrisVelocity = "155";
   //debrisVelocityVariance = "55";

};

datablock LinearFlareProjectileData(explOne){
   scale               = "1.0 1.0 1.0";
   faceViewer          = true;
   directDamage        = 0.0;
   hasDamageRadius     = true;
   indirectDamage      = 1.0;
   damageRadius        = 7.7;
   kickBackStrength    = 0.0;
   radiusDamageType    = $DamageType::Explosion;

   explosion           = "BlastExplosion";

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

function bigEBoom(%position){
   %p = new LinearFlareProjectile() {
         dataBlock        = CubeProj;
         initialDirection = "0 0 -1";
         initialPosition  = %position;
         sourceObject     = -1; 
         sourceSlot       = 0;
         vehicleObject    = 0;
      };  
   MissionCleanup.add(%p);
}

function bigBoom(%position, %sb, %vec){
   %p = new LinearFlareProjectile() {
         dataBlock        = explOne;
         initialDirection = VectorScale(%vec, -1);
         initialPosition  = VectorAdd(%position, VectorScale(%vec, 5));
         sourceObject     = -1; 
         sourceSlot       = 0;
         vehicleObject    = 0;
      };  
   MissionCleanup.add(%p);
   %p.setScopeAlways();
   schedule(500,0,"delayBoom",%position);
   schedule(500,0,"partboom",%position,%vec);
   for(%i = 0; %i < ClientGroup.getCount(); %i++){
      %cobj = ClientGroup.getObject(%i).getControlObject();
      %cobj.schedule(100,"setWhiteout",1); 
      %player =  ClientGroup.getObject(%i).player;
      if(isObject(%player)){
         %playerPos =  %player.getWorldBoxCenter();
         %ray = ContainerRayCast(%position, %playerPos, $TypeMasks::InteriorObjectType | $TypeMasks::TerrainObjectType, 0);
         if(!%ray){
            //%player.scriptKill($DamageType::OutOfBounds);
            %data = %player.getDatablock();
            %data.damageObject(%player, %sb, %playerPos, 20, $DamageType::Dark, "0 0 1", %sb.client);
         }
      }
   }
}

function delayBoom(%position){
    %p = new LinearFlareProjectile() {
         dataBlock        = explTwo;
         initialDirection = "0 0 -1";
         initialPosition  = %position;
         sourceObject     = -1;
         sourceSlot       = 0;
         vehicleObject    = 0;
      };  
      %p.setScopeAlways();
}

function partboom(%position,%vec){
   for(%i = 0; %i < 150; %i++){
      %x = (getRandom() - 0.5) * 2 * 3.1415926 * 0.15;
      %y = (getRandom() - 0.5) * 2 * 3.1415926 * 0.15;
      %z = (getRandom() - 0.5) * 2 * 3.1415926 * 0.15;
      %mat = MatrixCreateFromEuler(%x SPC %y SPC %z);
      %vector = MatrixMulVector(%mat,  %vec);
      %p = new GrenadeProjectile() {
            dataBlock        = blastExplosionProj;
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
      dataBlock = tripTimeEmissionDummy;
      emitter = "BlastExplosionEmitterS";
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
      emitter = "BlastShockwaveEmitter";
      velocity = "1";
   }; 
   MissionCleanup.add(%part);
   %part.setScopeAlways();
   %part.schedule(10000, "delete");
}