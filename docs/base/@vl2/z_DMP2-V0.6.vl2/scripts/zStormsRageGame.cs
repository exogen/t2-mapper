datablock ParticleData(LightningSparks){
   dragCoefficient = 0;
   gravityCoefficient = 6.0;
   inheritedVelFactor = 0.0;
   constantAcceleration = 1.0;
   lifetimeMS = 11900;
   lifetimeVarianceMS = 0;
   textureName = "special/spark00";
   sizes[0] = 2.2;
   sizes[1] = 2.4;
   sizes[2] = 2.1;
   times[0] = 0.0;
   times[1] = 0.2;
   times[2] = 1.0;
};

datablock ParticleEmitterData(LightningSparksEmitter){
   ejectionPeriodMS = 2;
   periodVarianceMS = 0;
   ejectionVelocity = 30;
   velocityVariance = 14.0;
   ejectionOffset = 0.0;
   thetaMin = 0;
   thetaMax = 25;
   phiReferenceVel = 0;
   phiVariance = 360;
   overrideAdvances = false;
   orientParticles = true;
   lifetimeMS = 0;
   particles = "LightningSparks";
};

function SceneObject::getTopBox(%obj)
{
    %top = getWord(%obj.getWorldBox(),5);
   return getWords(%obj.getWorldBoxCenter(),0,1) SPC %top;
}
   
$zapTimeSec = 20 * 60;
$zapFloodAmount = 20;  
$tickCountZap = 0; 

function stormragesim(){
   if(($MatchStarted + $missionRunning) == 2 && isObject(floodblock) && ($HostGamePlayerCount - $HostGameBotCount > 0) && !$testcheats){
		if($tickCountZap > (60 * 5)){
			%amount = $zapFloodAmount / $zapTimeSec;
			if(floodblock.he  < $zapFloodAmount){
				floodblock.he += %amount;
				floodblock.setTransform(vectorAdd(floodblock.getPosition(), "0 0" SPC %amount) SPC "0 0 1 0");
			}
		}
		if(!isObject(Precipitation) || Precipitation.maxNumDrops < 2000){
		   if(($tickCountZap % 60 == 0)){
			 addRain($tickCountZap * 2);
		   }
		  if(isObject(Precipitation)){
			 %level = Precipitation.maxNumDrops / 2000;
			 if(%level < 1 && ($tickCountZap % 60 == 0)){
				rainAudio(%level);
			 }
		  }
	   }
	   if(getRandom(1,5) == 1){
		  %obj = zapTowers.getObject(getRandom(0,zapTowers.getCount()-1));
		  zapTarget(%obj,1);
	   }
      if($tickCountZap == (60 * 10)){
         addRainMist(); 
      }
	   if($tickCountZap == (60 * 12)){
		  setupTR(32,32,6,70,15,2,4,90,60000*2); 
	   }
		for(%i = 0; %i < ClientGroup.getCount(); %i++){
			%client = ClientGroup.getObject(%i);
			%player = %client.player;
			if(isObject(%player)){
				 %pos = %player.getPosition();
				 %x = getWord(%pos,0);
				 %y = getWord(%pos,1);
				 %z = getWord(%pos,2);
				if(%x > 280  || %x < -280 || %y > 900  || %y < -900 || %z > 350){
					if(%player.zapSafe){
						messageClient(%player.client, 'safeArea', '\c1You are leaving the safe area.~wfx/misc/warning_beep.wav'); 
						%player.zapSafe = 0;
					}
					if(isObject(%player) && !%player.zapSafe){
                  if(%player.getState() !$= "Dead"){
                     if(getRandom(1,20) == 1 || (%x > 300  || %x < -300 || %y > 1033  || %y < -1033 || %z > 400)){
						      zapTarget(%player,50);       
                     }
                  }
					}
				}
				else{
					if(!%player.zapSafe){  
						messageClient(%player.client, 'safeArea', '\c1You are back in the safe area.');
						%player.zapSafe = 1; 
					}
				}
			}
		}
		$tickCountZap++;  
	}
	
	if(isObject(StormGameStartObj)){
		$zapSimEvent = schedule(1000, 0, "stormragesim");
	}
}
function zapTarget(%obj,%area){
   if(isObject(%obj)){
      %zap = new Lightning(){
         position = %obj.getWorldBoxCenter();
         rotation = "1 0 0 0";
         scale = "1 1 1000";
         dataBlock = "DefaultStorm";
         lockCount = "0";
         homingCount = "0";
         strikesPerMinute = "60";
         strikeWidth = "2.5";
         chanceToHitTarget = "1";
         strikeRadius = %area;
         boltStartRadius = "70"; //altitude the lightning starts from
         color = "1.000000 1.000000 1.000000 1.000000";
		   fadeColor = "0.300000 0.300000 1.000000 1.000000";
         useFog = "1";
         shouldCloak = 0;
      };
      MissionCleanup.add(%zap);
      %zap.schedule(1500,"delete");
      if(%area <= 1){
         schedule(1000, 0, "metalStrike", %obj);
      }
   }
}

function metalStrike(%obj){
   %part = new ParticleEmissionDummy() {
      position = %obj.getTopBox();
      rotation = "1 0 0 0";
      scale = "1 1 1";
      dataBlock = "defaultEmissionDummy";
      lockCount = "0";
      homingCount = "0";
      emitter = "LightningSparksEmitter";
      velocity = "1";
   };
   MissionCleanup.add(%part);
   %part.schedule(256,"delete");
   %part.setScopeAlways();   
}
   
datablock PrecipitationData(NoSoundRain)
{
   type = 0;
   soundProfile = "";
   materialList = "raindrops.dml";
   sizeX = 0.2;
   sizeY = 0.45;

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

function addRainMist(){
 	%p = new ParticleEmissionDummy() {
		position = "907.142 480.635 179.495";
		rotation = "0 1 0 93.3921";
		scale = "1 1 1";
		dataBlock = "defaultEmissionDummy";
		lockCount = "0";
		homingCount = "0";
		emitter = "RainMistEmitter";
		velocity = "1";
	};
	MissionCleanup.add(%p);
   %p.setScopeAlways();
	%p = new ParticleEmissionDummy() {
		position = "907.142 -480.635 179.495";
		rotation = "0 1 0 90";
		scale = "1 1 1";
		dataBlock = "defaultEmissionDummy";
		lockCount = "0";
		homingCount = "0";
		emitter = "RainMistEmitter";
		velocity = "1";
	};
	MissionCleanup.add(%p);
   %p.setScopeAlways();
	%p = new ParticleEmissionDummy() {
		position = "907.142 0 179.495";
		rotation = "0 1 0 90";
		scale = "1 1 1";
		dataBlock = "defaultEmissionDummy";
		lockCount = "0";
		homingCount = "0";
		emitter = "RainMistEmitter";
		velocity = "1";
	};  
   MissionCleanup.add(%p);
   %p.setScopeAlways();
   
   	%p = new ParticleEmissionDummy() {
		position = "95.1043 -715.229 240.617";
		rotation = "-1 0 0 86.5166";
		scale = "1 1 1";
		dataBlock = "defaultEmissionDummy";
		lockCount = "0";
		homingCount = "0";
		emitter = "RainMistEmitter2";
		velocity = "1";
	};
	MissionCleanup.add(%p);
	%p = new ParticleEmissionDummy() {
		position = "-68.3997 -705.366 252.879";
		rotation = "-1 0 0 86.5166";
		scale = "1 1 1";
		dataBlock = "defaultEmissionDummy";
		lockCount = "0";
		homingCount = "0";
		emitter = "RainMistEmitter2";
		velocity = "1";
	};
	MissionCleanup.add(%p);
	%p = new ParticleEmissionDummy() {
		position = "91.5941 693.886 243.099";
		rotation = "-1 0 0 86.5166";
		scale = "1 1 1";
		dataBlock = "defaultEmissionDummy";
		lockCount = "0";
		homingCount = "0";
		emitter = "RainMistEmitter2";
		velocity = "1";
	};
	MissionCleanup.add(%p);
	%p = new ParticleEmissionDummy() {
		position = "-67.9235 705.543 236.374";
		rotation = "-1 0 0 86.5166";
		scale = "1 1 1";
		dataBlock = "defaultEmissionDummy";
		lockCount = "0";
		homingCount = "0";
		emitter = "RainMistEmitter2";
		velocity = "1";
	};
	MissionCleanup.add(%p);
}

function addRain(%amount){
   if(isObject(Precipitation)){
      Precipitation.delete();
   }
   new Precipitation(Precipitation) {
		position = "0 0 0";
		rotation = "1 0 0 0"; 
		scale = "1 1 1";
		dataBlock = "NoSoundRain";
		lockCount = "1";
		homingCount = "12";
		percentage = "1";
		color1 = "0.600000 0.600000 0.600000 1.000000";
		color2 = "-1.000000 0.000000 0.000000 1.000000";
		color3 = "-1.000000 0.000000 0.000000 1.000000";
		offsetSpeed = "0.9";
		minVelocity = "4";
		maxVelocity = "5";
		maxNumDrops = %amount;
		maxRadius = "90";
	};
	MissionCleanup.add(Precipitation);
}
function rainAudio(%level){
   if(isObject(rainSFX)){
       rainSFX.delete();  
   }	
   new AudioEmitter(rainSFX) {
      position = "0 0 600";
      rotation = "1 0 0 0";
      scale = "1 1 1";
      fileName = "fx/environment/rain_light_1.wav";
      useProfileDescription = "0";
      outsideAmbient = "1";
      volume = %level;
      isLooping = "1";
      is3D = "0";
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
   MissionCleanup.add(rainSFX);
}


datablock ParticleData(RainMistParticle2) {
   dragCoefficient = "0";
   windCoefficient = "2";
   gravityCoefficient = "0";
   inheritedVelFactor = "0";
   constantAcceleration = "0";
   lifetimeMS = "1000";
   lifetimeVarianceMS = "200";
   spinSpeed = "1";
   spinRandomMin = "-50";
   spinRandomMax = "50";
   useInvAlpha = "0";
   textureName = "rainmist";
   colors[0] = "0.204724 0.204724 0.204724 0.0";
   colors[1] = "0.291339 0.291339 0.291339 0.02";
   colors[2] = "0.259843 0.259843 0.259843 0.4";
   colors[3] = "0.0787402 0.0787402 0.0787402 0.4";
   sizes[0] = "30";
   sizes[1] = "30";
   sizes[2] = "30";
   sizes[3] = "30";
   times[0] = "0.1";
   times[1] = "0.4";
   times[2] = "0.9";
   times[3] = "1";
};

datablock ParticleEmitterData(RainMistEmitter2) {
   ejectionPeriodMS = "4";
   periodVarianceMS = "0";
   ejectionVelocity = "00";
   velocityVariance = "0";
   ejectionOffset = "40";
   ejectionOffsetVariance = "0";
   thetaMin = "90";
   thetaMax = "90";
   phiReferenceVel = "0";
   phiVariance = "180";
   softnessDistance = "1";
   ambientFactor = "0";
   overrideAdvance = "1";
   orientParticles = "0";
   orientOnVelocity = "1";
   particles = "RainMistParticle2";
   lifetimeMS = "0";
   lifetimeVarianceMS = "0";
   reverseOrder = "0";
   alignParticles = "0";
   alignDirection = "0 1 0";
   highResOnly = "1";
};


datablock ParticleData(RainMistParticle) {
   dragCoefficient = "0";
   windCoefficient = "0.05";
   gravityCoefficient = "0";
   inheritedVelFactor = "0";
   constantAcceleration = "0";
   lifetimeMS = "9000";
   lifetimeVarianceMS = "200";
   spinSpeed = "1";
   spinRandomMin = "-50";
   spinRandomMax = "50";
   useInvAlpha = "0";
   textureName = "rainmist";
   colors[0] = "0.204724 0.204724 0.204724 0.0";
   colors[1] = "0.291339 0.291339 0.291339 0.25";
   colors[2] = "0.259843 0.259843 0.259843 0.25";
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

datablock ParticleEmitterData(RainMistEmitter) {
   ejectionPeriodMS = "12";
   periodVarianceMS = "0";
   ejectionVelocity = "140";
   velocityVariance = "50";
   ejectionOffset = "100";
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
   particles = "RainMistParticle";
   lifetimeMS = "0";
   lifetimeVarianceMS = "0";
   reverseOrder = "0";
   alignParticles = "0";
   alignDirection = "0 1 0";
   highResOnly = "1";
};




datablock ParticleData(vvParticle) {
   dragCoefficient = "0.25";
   windCoefficient = "0";
   gravityCoefficient = "0";
   inheritedVelFactor = "0";
   constantAcceleration = "0";
   lifetimeMS = "1200";
   lifetimeVarianceMS = "200";
   spinSpeed = "1";
   spinRandomMin = "-50";
   spinRandomMax = "50";
   useInvAlpha = "1";
   textureName = "rainmist";
   colors[0] = "0.504724 0.504724 0.504724 0.15";
   colors[1] = "0.591339 0.591339 0.591339 0.15";
   colors[2] = "0.559843 0.559843 0.559843 0.15";
   colors[3] = "0.0787402 0.0787402 0.0787402 0.015748";
   sizes[0] = "100";
   sizes[1] = "100";
   sizes[2] = "100";
   sizes[3] = "100";
   times[0] = "0";
   times[1] = "0.05";
   times[2] = "0.65";
   times[3] = "1";
};

datablock ParticleEmitterData(vvEmitter) {
   ejectionPeriodMS = "30";
   periodVarianceMS = "0";
   ejectionVelocity = "200";
   velocityVariance = "50";
   ejectionOffset = "0";
   ejectionOffsetVariance = "0";
   thetaMin = "0";
   thetaMax = "5";
   phiReferenceVel = "0";
   phiVariance = "360";
   overrideAdvance = "1";
   orientParticles = "0";
   orientOnVelocity = "1";
   particles = "vvParticle";
   lifetimeMS = "0";
   lifetimeVarianceMS = "0"; 
   
};

function vortexTR(){
   %pos = "0 0 390";
   InitContainerRadiusSearch(%pos,  400,  $TypeMasks::PlayerObjectType);
  // error(vortexTR);
   while ((%targetObject = containerSearchNext()) != 0){
      %tgtPos = %targetObject.getWorldBoxCenter();
      %xyDist = vectorDist(getWords(%pos,0,1) SPC 0,getWords(%tgtPos,0,1) SPC 0);
      %vec = VectorNormalize(VectorSub(%pos, %tgtPos));
      if((%targetObject.getType() & $TypeMasks::PlayerObjectType) && !%targetObject.isMounted() && %xyDist < 200){
         %ray = ContainerRayCast(%tgtPos, %pos, $TypeMasks::StaticTSObjectType | $TypeMasks::StaticShapeObjectType | $TypeMasks::InteriorObjectType | $TypeMasks::TerrainObjectType, 0);  
         if(!%ray){
            if(%targetObject.lastSimTR && (getSimTime() - %targetObject.lastSimTR) > 8000){
               %targetObject.whcount = 0;
            }
            if(%targetObject.whcount++ > 100){
                  if(!isEventPending(%targetObject.vt)){
                     %targetObject.vt = schedule(8000, 0, "vortexThrow", %targetObject);
                  }
               continue;
            }
            %targetObject.lastSimTR = getSimTime();
           //error(%targetObject.whcount);
            %prec = 15;
            %tvec = vectorNormalize(%targetObject.getVelocity());
            %speed = VectorLen(%targetObject.getVelocity());
            %speed  =  (%speed < 100) ? (%speed + 5) : %speed * 0.99;
            %targetDir = vectorScale (%vec,%prec);
            %projDir =  vectorScale(%tvec ,100-%prec);
            %vecAdd = vectorNormalize(vectorAdd(%targetDir,%projDir));
            %targetObject.setVelocity(vectorScale(%vecAdd,%speed));
         }
      }  
   }
   if(isObject(TR))
      schedule(128, 0, "vortexTR");
}


function vortexThrow(%obj){
   %obj.whcount = 0;
}

function pointToVector(%vec){
   %x = getWord(%vec, 0);
   %y = getWord(%vec, 1);
   %z = getWord(%vec, 2);
   %rotAngleX = mASin(%z);
   %rotAngleZ = mATan( %x, %y );
   %matrix = MatrixCreateFromEuler("0 0" SPC %rotAngleZ * -1);
   %matrix2 = MatrixCreateFromEuler(%rotAngleX+ mDegToRad(90) SPC "0 0");
   %finalMat = MatrixMultiply(%matrix, %matrix2);
   return getWords(%finalMat, 3, 6);
}
function vectorPerp(%vec) { // Find a perpendicular vector
   %x = getWord(%vec, 1) * -1;
   %y = getWord(%vec, 2) * -1;
   %z = getWord(%vec, 0); // Fixed the perpendicular calculation
   return %x SPC %y SPC %z;
}

function tubeVec(%radius, %segments, %pos1, %pos2, %i) {
   %qxyz = vectorSub(%pos2, %pos1); // Main vector
   %uxyz = vectorPerp(%qxyz); // Get a perpendicular vector
   %vxyz = vectorCross(%qxyz, %uxyz); // Cross product for the second perpendicular vector

   %uxyz = vectorNormalize(%uxyz);
   %vxyz = vectorNormalize(%vxyz);

   // Angle for current segment
   %theta = 2 * 3.1415926 * %i / %segments;

   // Calculate circle point offset
   %x = %radius * (mCos(%theta) * getWord(%uxyz, 0) + mSin(%theta) * getWord(%vxyz, 0));
   %y = %radius * (mCos(%theta) * getWord(%uxyz, 1) + mSin(%theta) * getWord(%vxyz, 1));
   %z = %radius * (mCos(%theta) * getWord(%uxyz, 2) + mSin(%theta) * getWord(%vxyz, 2));

   // Offset the position to form the tube
   return (getWord(%pos2, 0) + %x) SPC (getWord(%pos2, 1) + %y) SPC (getWord(%pos2, 2) + %z);
}

//setupTR(32,32,6,60,15,2,4,80);  //setupTR(32,32,6,70,15,2,4,90,60000*5); 
function setupTR(%radius,%radius2,%layer,%layerSpace,%cf,%ad,%rx,%zoff,%delTime){
   if(isObject(TR))
      TR.delete();
   new simGroup(TR);
   MissionCleanup.add(TR);
   
   new AudioEmitter(trSFX) {
      position = "0 0 150";
      rotation = "1 0 0 0";
      scale = "1 1 1";
      fileName = "fx/environment/howlingwind3.wav";
      useProfileDescription = "0";
      outsideAmbient = "1";
      volume = 1;
      isLooping = "1";
      is3D = "1";
      minDistance = "200";
      maxDistance = "400";
      coneInsideAngle = "360";
      coneOutsideAngle = "360";
      coneOutsideVolume = "1";
      coneVector = "0 0 1";
      loopCount = "-1";
      minLoopGap = "0";
      maxLoopGap = "0";
      type = "EffectAudioType";
   };
   TR.add(trSFX);
   new AudioEmitter(trSFX2) {
      position = "0 0 250";
      rotation = "1 0 0 0";
      scale = "1 1 1";
      fileName = "fx/environment/howlingwind3.wav";
      useProfileDescription = "0";
      outsideAmbient = "1";
      volume = 1;
      isLooping = "1";
      is3D = "1";
      minDistance = "200";
      maxDistance = "400";
      coneInsideAngle = "360";
      coneOutsideAngle = "360";
      coneOutsideVolume = "1";
      coneVector = "0 0 1";
      loopCount = "-1";
      minLoopGap = "0";
      maxLoopGap = "0";
      type = "EffectAudioType";
   };
   TR.add(trSFX2);
   
   %count = 12;
   %ogPos = "0 0 80";
   for(%x = 0; %x < %layer; %x++){
      for(%i = 0; %i < %count + (%x * %ad); %i++){
         %pos = tubeVec(%radius+ (%x *%cf), %count + (%x * %ad), vectorAdd(%ogPos ,"0 0" SPC %x*%layerSpace),vectorAdd(vectorAdd(%ogPos,"0 0 5"),"0 0" SPC %x*%layerSpace), %i);
         %pos2 = tubeVec(%radius2 + (%x *%cf), %count + (%x * %ad), vectorAdd(vectorAdd(%ogPos,"0 0" SPC %zoff),"0 0" SPC %x*%layerSpace), vectorAdd(vectorAdd(%ogPos,"0 0" SPC %zoff+5),"0 0" SPC %x*%layerSpace), (%i+%rx) % (%count + (%x * %ad)));
         %rot = pointToVector(vectorNormalize(vectorSub(%pos,%pos2)));   
         %simObj =  new ParticleEmissionDummy() {
            position = %pos;
            rotation = getWords(%rot,0,2) SPC mRadToDeg(getWord(%rot,3));
            scale = "1 1 1";
            dataBlock = "defaultEmissionDummy";
            lockCount = "0";
            homingCount = "0";
            emitter = "vvEmitter";
            velocity = "1";
         };
         TR.add(%simObj);
      }
   }
   vortexTR();
   weatherEvents.sch[13] = TR.schedule(%delTime, "delete");
}


if(!isEventPending($zapSimEvent)){
	floodblock.he = 0;
	floodblock.simSec = 0;
	$zapSimEvent = schedule(10000, 0, "stormragesim");// allow time in case we open the editor 
}
datablock StaticShapeData(StormGameStart){
   catagory = "misc";
   shapeFile = "flag.dts";
};
function StormGameStart::onAdd(%this, %obj){  
   Parent::onAdd(%this, %obj);
   if(!isEventPending($zapSimEvent)){
      floodblock.he = 0;
      floodblock.simSec = 0;
      $zapSimEvent = schedule(10000, 0, "stormragesim");// allow time in case we open the editor 
   }
}

function StormGameStart::onRemove(%this, %Obj){
   Parent::onRemove();
   cancel($zapSimEvent);// end the sim 
}