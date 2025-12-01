datablock ParticleData(apBubbleStreamParticle) {
   dragCoefficient = "0.5";
   windCoefficient = "0";
   gravityCoefficient = "0";
   inheritedVelFactor = "0";
   constantAcceleration = "0";
   lifetimeMS = "500";
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
   textureName          = "special/bubbles";
   colors[0]     = "0.7 0.8 1.0 0.8";
   colors[1]     = "0.7 0.8 1.0 0.4";
   colors[2]     = "0.7 0.8 1.0 0.0";
   sizes[0]      = 0.4;
   sizes[1]      = 0.7;
   sizes[2]      = 0.7;
   times[0]      = 0.0;
   times[1]      = 0.5;
   times[2]      = 1.0;
};

datablock ParticleEmitterData(apBubbleStreamEmitter) {
   ejectionPeriodMS = "2";
   periodVarianceMS = "0";
   ejectionVelocity = "150";
   velocityVariance = "50";
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
   particles = "apBubbleStreamParticle";
   lifetimeMS = "0";
   lifetimeVarianceMS = "0";
   useEmitterSizes = "0";
   useEmitterColors = "0";
   blendStyle = "NORMAL";
   sortParticles = "0";
   reverseOrder = "0";
   alignParticles = "0";
   alignDirection = "0 1 0";
   highResOnly = "1";
   renderReflection = "1";
   glow = "0";
   EnableCollison = "0";
   Dampening = "0.8";
   elasticity = "0.3";
   KillColTime = "1000";
   killedByCollision = "0";
   ColDetectDistAdj = "1";
};

datablock ParticleData(SXFlowParticle) {
   dragCoefficient = "0.5";
   windCoefficient = "0";
   gravityCoefficient = "0";
   inheritedVelFactor = "0";
   constantAcceleration = "0";
   lifetimeMS = "600";
   lifetimeVarianceMS = "100";
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
   colors[0] = "0.204724 0.204724 0.204724 0.01";
   colors[1] = "0.291339 0.291339 0.291339 0.01";
   colors[2] = "0.259843 0.259843 0.259843 0.1";
   colors[3] = "0.0787402 0.0787402 0.0787402 0.015748";
   sizes[0] = "40";
   sizes[1] = "40";
   sizes[2] = "40";
   sizes[3] = "40";
   times[0] = "0";
   times[1] = "0.05";
   times[2] = "0.65";
   times[3] = "1";
};

datablock ParticleEmitterData(SXFlowEmitter) {
   ejectionPeriodMS = "15";
   periodVarianceMS = "0";
   ejectionVelocity = "200";
   velocityVariance = "50";
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
   particles = "SXFlowParticle";
   lifetimeMS = "0";
   lifetimeVarianceMS = "0";
   useEmitterSizes = "0";
   useEmitterColors = "0";
   blendStyle = "NORMAL";
   sortParticles = "0";
   reverseOrder = "0";
   alignParticles = "0";
   alignDirection = "0 1 0";
   highResOnly = "1";
   renderReflection = "1";
   glow = "0";
   EnableCollison = "0";
   Dampening = "0.8";
   elasticity = "0.3";
   KillColTime = "1000";
   killedByCollision = "0";
   ColDetectDistAdj = "1";
};

datablock ForceFieldBareData(SXAllFastField)
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
datablock TriggerData(wpDeathTrigger){
   tickPeriodMS =  512;
};
function wpDeathTrigger::onEnterTrigger(%data, %trigger, %player){
   
}
function wpDeathTrigger::onleaveTrigger(%data, %trigger, %player){
   
}
function wpDeathTrigger::onTickTrigger(%data, %trig){
   %center = %trig.getWorldBoxCenter();
 InitContainerRadiusSearch(%center,  100,  $TypeMasks::PlayerObjectType);
   while ((%player = containerSearchNext()) != 0){
      if(isObject(%player) && %player.getState() !$= "Dead"){
         %radius = vectorDist(getWords(%center,0,1) SPC 0,getWords(%player.getPosition(),0,1) SPC 0);
         if(%radius > 40 && %radius < 95){
            if(!%player.lastWpTime || (getSimTime() - %player.lastWpTime) > 6000){// if they stay out for 10 secs reset
               %player.wpWarn = 0;  
               %player.wpTime = 0;
               %player.wpDmgTime  =0;
            }
            if(%player.wpTime > 8000 && !%player.wpWarn){
               messageClient(%player.client, 'MsgLeaveMissionArea', '\c1Staying in the vortex will cause damage.~wfx/misc/warning_beep.wav');
               %player.wpWarn = 1;         
            }
            %player.wpTime += %data.tickPeriodMS;
            if(%player.wpTime > 12000){
               %player.wpDmgTime += %data.tickPeriodMS;
               if(%player.wpDmgTime > 1000){
                  %player.setdamageflash(0.3);
                  %player.damage(0, %player.getPosition(), 0.04, $DamageType::Suicide);
               }
            }
            %player.lastWpTime = getSimTime();
         }
      }
   }
}
function SXAllFastField::onAdd(%data, %obj){
   parent::onAdd(%data,%obj);
   if(%obj.pz.getClassName() $= "PhysicalZone"){
		%obj.pz.delete(); 
   }
}